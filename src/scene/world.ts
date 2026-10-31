// The 3D desk: renders parts and wires, handles picking, dragging, pressing
// buttons, turning knobs and drawing wires between terminals.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { buildWorkshop, woodTexture } from './workshop';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Board, type PinListener } from '../sim/board';
import { AudioOut, BOARD_TERMINALS, PARTS, type Part } from '../sim/parts';
import { colorFor, endpoint, endpointExists, endpointLabel, newWireId, solve, splitEndpoint, type Issue, type Wire } from '../sim/circuit';

export { wireColor } from '../sim/circuit';
const DESK = 60; // half-size of the desk area in cm

interface Theme { bg: string; desk: string; mat: string; matLine: string; matText: string }
const THEMES: Record<'light' | 'dark', Theme> = {
  light: { bg: '#efe6d6', desk: '#e6dac4', mat: '#2f6b5c', matLine: '220,240,230', matText: '#d7ece4' },
  dark: { bg: '#141518', desk: '#1b1c20', mat: '#1d3a34', matLine: '170,210,195', matText: '#8fb8aa' },
};
// the self-healing cutting mat everything sits on (cm)
const MAT_W = 110, MAT_D = 76, MAT_X = 12, MAT_Z = 2;

type DragMode = 'move' | 'knob' | 'press' | 'stick';

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  board = new Board();
  audio = new AudioOut();
  parts: Part[] = [];
  wires: Wire[] = [];
  issues: Issue[] = [];
  running = false;
  selected: Part | null = null;
  selectedWire: Wire | null = null;
  editable = true; // sandbox: add/remove allowed

  onSelect: () => void = () => {};
  onChange: () => void = () => {};
  onWiresChanged: (newIssues: Issue[]) => void = () => {};
  onFrame: (dt: number) => void = () => {};
  onProbe: () => void = () => {};

  /** Multimeter: while active, clicking terminals places the red, then the black probe. */
  probe = { active: false, red: null as string | null, black: null as string | null };
  private probeMarks: Record<'red' | 'black', THREE.Group> = { red: probeMark('#e0362c'), black: probeMark('#26272b') };

  private wireGroup = new THREE.Group();
  private hitGroup = new THREE.Group();
  private selRing: THREE.Mesh;
  private hoverDot: THREE.Mesh;
  private tempWire: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private ground: THREE.Mesh;
  private groundMat: THREE.MeshStandardMaterial;
  private matMat: THREE.MeshStandardMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private ao: GTAOPass;
  private outline: OutlinePass;
  private hoverPart: Part | null = null;
  private lampLight!: THREE.SpotLight;
  private sun!: THREE.DirectionalLight;
  quality: 'high' | 'balanced' | 'low' = 'high';
  /** coloured light that lit LEDs and lamps spill onto the desk */
  private spill: THREE.PointLight[] = [];
  private glows: THREE.Sprite[] = [];
  private glide: null | { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } = null;
  private drag: null | { part: Part; offset: THREE.Vector3; startX: number; startY: number; moved: boolean; mode: DragMode; startVal?: number } = null;
  private wiring: null | { from: string; startX: number; startY: number; sticky: boolean } = null;
  private clock = new THREE.Clock();
  private emptyDown: { x: number; y: number } | null = null;
  private wiresDirty = true;
  private tip: HTMLDivElement;
  private hoverEp: string | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);

    // soft studio reflections make metal and plastic read much better
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
    // bloom makes lit LEDs, screens and NeoPixels actually glow
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // soft contact shadows where parts meet the mat and each other
    this.ao = new GTAOPass(this.scene, this.camera, 256, 256);
    this.ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 12 });
    this.ao.blendIntensity = 0.85;
    this.composer.addPass(this.ao);
    // a soft glowing edge around the part under the pointer and the selected part
    this.outline = new OutlinePass(new THREE.Vector2(256, 256), this.scene, this.camera);
    this.outline.edgeStrength = 2.6;
    this.outline.edgeGlow = 0.4;
    this.outline.edgeThickness = 1.2;
    this.outline.visibleEdgeColor.set('#35d6cc');
    this.outline.hiddenEdgeColor.set('#0f4a46');
    this.composer.addPass(this.outline);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 2.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 120;
    this.controls.screenSpacePanning = false;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('start', () => { this.glide = null; }); // the user takes over
    this.resetView();

    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#c9b99c', 1.1));
    const sun = (this.sun = new THREE.DirectionalLight('#fff6e8', 2.4));
    sun.position.set(-18, 40, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#cfe3ff', 0.6);
    rim.position.set(30, 20, -30);
    this.scene.add(rim);
    // a fixed pool, so the shader never recompiles as LEDs switch on and off
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 9, 2);
      this.spill.push(l);
      this.scene.add(l);
    }

    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, envMapIntensity: 0.15 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.3;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.matMat = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.25 });
    const mat = new THREE.Mesh(new RoundedBoxGeometry(MAT_W, 0.3, MAT_D, 2, 0.12), this.matMat);
    mat.position.set(MAT_X, -0.15, MAT_Z);
    mat.receiveShadow = true;
    this.scene.add(mat);
    this.lampLight = buildWorkshop(this.scene).lampLight;
    this.setTheme('light');

    this.selRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: '#1f9a96', transparent: true, opacity: 0.9 }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    this.hoverDot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#00b3bb', depthTest: false, transparent: true, opacity: 0.95 }));
    this.hoverDot.renderOrder = 20;
    this.hoverDot.visible = false;
    this.scene.add(this.hoverDot);
    this.scene.add(this.probeMarks.red, this.probeMarks.black);

    this.scene.add(this.wireGroup, this.hitGroup);

    this.tip = document.createElement('div');
    this.tip.className = 'scene-tip';
    this.tip.hidden = true;
    host.appendChild(this.tip);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => this.pointerDown(e));
    el.addEventListener('pointermove', e => this.pointerMove(e));
    el.addEventListener('pointerleave', () => { this.setHover(null); this.hoverPart = null; });
    window.addEventListener('pointerup', e => this.pointerUp(e));
    el.addEventListener('wheel', e => this.wheel(e), { passive: false });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    ro.observe(this.renderer.domElement);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Trade looks for speed: high has every effect, low suits phones and older laptops. */
  setQuality(q: 'high' | 'balanced' | 'low') {
    this.quality = q;
    const dpr = window.devicePixelRatio;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'balanced' ? Math.min(dpr, 1.5) : 1);
    this.ao.enabled = q === 'high';
    this.outline.enabled = q !== 'low';
    this.lampLight.visible = q !== 'low';
    this.bloom.enabled = q !== 'low';
    const size = q === 'high' ? 2048 : q === 'balanced' ? 1024 : 512;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as any; // recreated at the new size on the next render
    }
    for (const l of this.spill) l.visible = q !== 'low';
    this.resize();
  }

  setTheme(name: 'light' | 'dark') {
    const t = THEMES[name];
    this.scene.background = new THREE.Color(t.bg);
    this.scene.fog = new THREE.Fog(t.bg, 110, 200);
    this.groundMat.color.set('#ffffff');
    this.groundMat.map?.dispose();
    this.groundMat.map = woodTexture(name === 'dark');
    this.groundMat.needsUpdate = true;
    this.matMat.map?.dispose();
    this.matMat.map = matTexture(t);
    this.matMat.needsUpdate = true;
  }

  /** Point the camera at all parts, from a friendly 3/4 angle (gliding there unless told not to). */
  resetView(animate = true) {
    const box = new THREE.Box3();
    for (const p of this.parts) if (p.group) box.expandByObject(p.group);
    if (box.isEmpty()) box.set(new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 2, 3));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(11, Math.hypot(size.x, size.z) / 2 + 2);
    const fov = (this.camera.fov * Math.PI) / 180;
    const fit = radius / Math.sin(fov / 2) / Math.min(1, this.camera.aspect * 0.9);
    const dist = THREE.MathUtils.clamp(fit * 0.9, this.controls.minDistance, this.controls.maxDistance);
    center.y = 0;
    const to = center.clone().add(new THREE.Vector3(0.12, 0.72, 0.68).normalize().multiplyScalar(dist));
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.glide = null;
      this.controls.target.copy(center);
      this.camera.position.copy(to);
      this.controls.update();
      return;
    }
    this.glide = { from: this.camera.position.clone(), to, fromT: this.controls.target.clone(), toT: center, t: 0 };
  }

  private stepGlide(dt: number) {
    const g = this.glide;
    if (!g) return;
    g.t = Math.min(1, g.t + dt / 0.9);
    const e = 1 - Math.pow(1 - g.t, 3); // ease out
    this.camera.position.lerpVectors(g.from, g.to, e);
    this.controls.target.lerpVectors(g.fromT, g.toT, e);
    if (g.t >= 1) this.glide = null;
  }

  private leftInset = 0;
  /** Shift the rendered view so the scene centers in the area right of an overlay. */
  setLeftInset(px: number) {
    this.leftInset = px;
    this.resize();
  }

  zoom(factor: number) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(off.setLength(len));
  }

  private resize() {
    // size from the canvas's CSS box (on phones it's shorter than the stage)
    const el = this.renderer.domElement;
    const w = el.clientWidth || this.host.clientWidth, h = el.clientHeight || this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.ao.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    const inset = Math.min(this.leftInset, w * 0.4);
    if (inset > 0) this.camera.setViewOffset(w - inset, h, -inset, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.aspect = (w - inset) / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- parts ----------
  get uno(): Part | undefined { return this.parts.find(p => p.type === 'uno'); }

  addPart(part: Part) {
    this.parts.push(part);
    this.buildPart(part);
    this.syncListeners();
  }

  removePart(part: Part) {
    if (part.group) this.scene.remove(part.group);
    this.audio.set(part.id, null);
    this.parts = this.parts.filter(p => p !== part);
    this.collectGlows();
    this.wires = this.wires.filter(w => !w.a.startsWith(part.id + ':') && !w.b.startsWith(part.id + ':'));
    if (this.selected === part) this.select(null);
    this.syncListeners();
    this.solveCircuit(false);
    this.onChange();
  }

  clear() {
    for (const p of [...this.parts]) {
      if (p.group) this.scene.remove(p.group);
      this.audio.set(p.id, null);
    }
    this.parts = [];
    this.wires = [];
    this.issues = [];
    this.glows = [];
    this.select(null);
    this.syncListeners();
    this.wiresDirty = true;
  }

  /** (Re)create a part's 3D model, e.g. after a prop like color changed. */
  buildPart(part: Part) {
    if (part.group) this.scene.remove(part.group);
    const g = PARTS[part.type].build(part);
    g.userData.partId = part.id;
    g.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'envMapIntensity' in m && m.metalness < 0.5) m.envMapIntensity = 0.6;
    });
    part.group = g;
    this.placeGroup(part);
    this.scene.add(g);
    this.wiresDirty = true;
    this.collectGlows();
  }

  private collectGlows() {
    this.glows = [];
    for (const p of this.parts) {
      p.group?.traverse(o => {
        if (o instanceof THREE.Sprite && (o.material as THREE.SpriteMaterial).blending === THREE.AdditiveBlending) this.glows.push(o);
      });
    }
  }

  /** Point the spill lights at the brightest glowing things. */
  private updateSpill() {
    const lit = this.glows
      .map(s => ({ s, o: (s.material as THREE.SpriteMaterial).opacity }))
      .filter(x => x.o > 0.08 && x.s.visible)
      .sort((a, b) => b.o - a.o);
    const pos = new THREE.Vector3();
    this.spill.forEach((l, i) => {
      const x = lit[i];
      if (!x) { l.intensity = 0; return; }
      x.s.getWorldPosition(pos);
      l.position.copy(pos);
      l.color.copy((x.s.material as THREE.SpriteMaterial).color);
      // bigger glows (lamps) throw more light than a single LED
      l.intensity = x.o * 6 * Math.max(1, x.s.scale.x / 2.4) ** 2;
      l.distance = 6 + x.s.scale.x * 2.5;
    });
  }

  private placeGroup(part: Part) {
    part.group!.position.set(part.x, 0, part.z);
    part.group!.rotation.y = (-part.rot * Math.PI) / 2;
    part.group!.updateMatrixWorld(true);
  }

  rotatePart(part: Part) {
    part.rot = (part.rot + 1) % 4;
    this.placeGroup(part);
    this.wiresDirty = true;
    this.onChange();
  }

  /** Footprint radius of a part on the desk, in cm. */
  private footprint(p: Part): number {
    if (!p.group) return 2;
    const size = new THREE.Box3().setFromObject(p.group).getSize(new THREE.Vector3());
    return Math.hypot(size.x, size.z) / 2;
  }

  /** Move a just-added part to the nearest open spot beside the board. */
  placeFree(part: Part) {
    const r = this.footprint(part);
    const others = this.parts.filter(p => p !== part).map(p => ({ x: p.x, z: p.z, r: this.footprint(p) }));
    const fits = (x: number, z: number) => others.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.8);
    // scan outward from just right of the board, nearest spots first
    const spots: { x: number; z: number; d: number }[] = [];
    for (let x = 4; x <= 40; x += 1) for (let z = -18; z <= 18; z += 1) spots.push({ x, z, d: Math.hypot(x - 8, z * 1.3) });
    spots.sort((p, q) => p.d - q.d);
    const spot = spots.find(s => fits(s.x, s.z)) ?? { x: 12, z: 20 };
    part.x = spot.x;
    part.z = spot.z;
    this.placeGroup(part);
    this.wiresDirty = true;
  }

  /** Board listeners; a part missing power or ground behaves as if it isn't there. */
  syncListeners() {
    this.board.listeners = this.parts.flatMap(p => {
      const l = PARTS[p.type].listener?.(p);
      if (!l) return [];
      const on = () => !p.state.missing?.length;
      const gated: PinListener = {
        readDigital: l.readDigital && ((pin, b) => (on() ? l.readDigital!(pin, b) : undefined)),
        readAnalog: l.readAnalog && ((pin, b) => (on() ? l.readAnalog!(pin, b) : undefined)),
        onWrite: l.onWrite && ((pin, v, b) => { if (on()) l.onWrite!(pin, v, b); }),
        pulse: l.pulse && ((pin, lv, b) => (on() ? l.pulse!(pin, lv, b) : undefined)),
        dht: l.dht && ((pin, b) => (on() ? l.dht!(pin, b) : undefined)),
        keypad: l.keypad && ((r, c) => (on() ? l.keypad!(r, c) : undefined)),
      };
      return [gated];
    });
  }

  select(part: Part | null) {
    this.selected = part;
    this.selectedWire = null;
    this.onSelect();
  }

  selectWire(w: Wire | null) {
    this.selectedWire = w;
    this.selected = null;
    this.wiresDirty = true;
    this.onSelect();
  }

  // ---------- wires ----------
  setWires(wires: Wire[]) {
    this.wires = wires;
    this.solveCircuit(false);
  }

  addWire(a: string, b: string, color?: string): Wire | null {
    if (a === b) return null;
    if (this.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
    const wire: Wire = { id: newWireId(), a, b, color: color ?? colorFor(this.parts, a, b) };
    this.wires.push(wire);
    this.solveCircuit(true);
    return wire;
  }

  removeWire(w: Wire) {
    this.audio.sfx('unsnap');
    this.wires = this.wires.filter(x => x !== w);
    if (this.selectedWire === w) this.selectWire(null);
    this.solveCircuit(true);
  }

  /** Drop wires whose terminals vanished (e.g. a button's wiring mode changed). */
  pruneWires() {
    this.wires = this.wires.filter(w => endpointExists(this.parts, w.a) && endpointExists(this.parts, w.b));
    this.solveCircuit(false);
  }

  /** Re-derive pin assignments; report issues that weren't there before. */
  solveCircuit(notify: boolean) {
    const before = new Set(this.issues.map(i => i.key));
    this.issues = solve(this.parts, this.wires);
    this.wiresDirty = true;
    if (notify) this.onWiresChanged(this.issues.filter(i => !before.has(i.key)));
    this.onChange();
  }

  endpointPos(ep: string): THREE.Vector3 | null {
    const [pid, key] = splitEndpoint(ep);
    const part = this.parts.find(p => p.id === pid);
    if (!part?.group) return null;
    if (part.type === 'uno') {
      const t = BOARD_TERMINALS.find(x => x.key === key);
      return t ? t.pos.clone().applyMatrix4(part.group.matrixWorld) : null;
    }
    const t = PARTS[part.type].terminals(part).find(x => x.key === key);
    return t ? new THREE.Vector3(...t.pos).applyMatrix4(part.group.matrixWorld) : null;
  }

  private rebuildWires() {
    for (const g of [this.wireGroup, this.hitGroup]) {
      for (const c of [...g.children]) {
        g.remove(c);
        // plug geometry is shared; only the per-wire tubes and materials are freed
        c.traverse(o => {
          const m = o as THREE.Mesh;
          if (m.geometry && m.geometry !== plugGeo) m.geometry.dispose();
          if (m.material && m.material !== plugMat && g === this.wireGroup) (m.material as THREE.Material).dispose();
        });
      }
    }
    for (const p of this.parts) p.group?.updateMatrixWorld(true);
    for (const w of this.wires) {
      const a = this.endpointPos(w.a), b = this.endpointPos(w.b);
      if (!a || !b) continue;
      const jumper = jumperWire(a, b, w.color, w === this.selectedWire);
      jumper.traverse(o => { o.userData.wireId = w.id; });
      this.wireGroup.add(jumper);
    }
    // invisible hit targets for every terminal
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitGeo = new THREE.SphereGeometry(0.26, 8, 6);
    const holeGeo = new THREE.SphereGeometry(0.17, 6, 4); // breadboard holes are packed tight
    for (const part of this.parts) {
      if (!part.group) continue;
      const terms = part.type === 'uno' ? BOARD_TERMINALS.map(t => ({ key: t.key, small: false })) : PARTS[part.type].terminals(part).map(t => ({ key: t.key, small: t.kind === 'pass' }));
      for (const { key, small } of terms) {
        const ep = endpoint(part.id, key);
        const pos = this.endpointPos(ep)!;
        const s = new THREE.Mesh(small ? holeGeo : hitGeo, hitMat);
        s.position.copy(pos);
        s.userData.ep = ep;
        this.hitGroup.add(s);
      }
    }
  }

  // ---------- picking ----------
  private ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pickTerminal(e: { clientX: number; clientY: number }): string | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.hitGroup.children, false);
    if (hits.length) return hits[0].object.userData.ep;
    // a breadboard is mostly holes: don't snap to them, so its body can still be dragged
    const body = this.pick(e);
    if (body?.part.type === 'breadboard') return null;
    // forgiving: snap to the closest terminal within a few pixels on screen
    const r = this.renderer.domElement.getBoundingClientRect();
    let best: string | null = null;
    let bestD = 14;
    for (const s of this.hitGroup.children) {
      const p = s.position.clone().project(this.camera);
      const x = ((p.x + 1) / 2) * r.width + r.left, y = ((1 - p.y) / 2) * r.height + r.top;
      const d = Math.hypot(x - e.clientX, y - e.clientY);
      if (d < bestD) { bestD = d; best = s.userData.ep; }
    }
    return best;
  }

  private pickWire(e: { clientX: number; clientY: number }): Wire | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const hit = this.raycaster.intersectObjects(this.wireGroup.children, true)[0];
    return hit ? this.wires.find(w => w.id === hit.object.userData.wireId) ?? null : null;
  }

  private pick(e: { clientX: number; clientY: number }): { part: Part; action?: string; keyIndex?: number } | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const groups = this.parts.map(p => p.group!).filter(Boolean);
    const hit = this.raycaster.intersectObjects(groups, true).find(h => h.object.visible && !(h.object instanceof THREE.Sprite));
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    let action: string | undefined;
    let keyIndex: number | undefined;
    while (o && o.userData.partId === undefined) {
      action ??= o.userData.action;
      keyIndex ??= o.userData.keyIndex;
      o = o.parent;
    }
    const part = o ? this.parts.find(p => p.id === o!.userData.partId) : undefined;
    return part ? { part, action, keyIndex } : null;
  }

  private groundPoint(e: { clientX: number; clientY: number }, y = 0): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  private setHover(ep: string | null, e?: { clientX: number; clientY: number }) {
    this.hoverEp = ep;
    if (!ep) {
      this.hoverDot.visible = false;
      this.tip.hidden = true;
      return;
    }
    this.hoverDot.position.copy(this.endpointPos(ep)!);
    this.hoverDot.visible = true;
    this.tip.hidden = false;
    const connected = this.wires.filter(w => w.a === ep || w.b === ep).length;
    this.tip.innerHTML = `${endpointLabel(this.parts, ep)}${connected ? ` <span>· ${connected} wire${connected > 1 ? 's' : ''}</span>` : ''}`;
    if (e) {
      const r = this.host.getBoundingClientRect();
      this.tip.style.left = `${e.clientX - r.left + 14}px`;
      this.tip.style.top = `${e.clientY - r.top + 14}px`;
    }
  }

  get isWiring() { return !!this.wiring; }

  setProbeMode(on: boolean) {
    this.probe = { active: on, red: null, black: null };
    if (on) this.cancelWiring();
    this.onProbe();
  }

  cancelWiring() {
    this.wiring = null;
    this.clearTempWire();
    this.controls.enabled = true;
  }

  private clearTempWire() {
    if (this.tempWire) {
      this.scene.remove(this.tempWire);
      this.tempWire.geometry.dispose();
      this.tempWire = null;
    }
  }

  private updateTempWire(e: PointerEvent) {
    if (!this.wiring) return;
    const from = this.endpointPos(this.wiring.from);
    if (!from) return;
    const target = this.hoverEp && this.hoverEp !== this.wiring.from ? this.endpointPos(this.hoverEp) : this.groundPoint(e, from.y);
    if (!target) return;
    this.clearTempWire();
    this.tempWire = wireMesh(from, target, '#00a3ab', false, 0.7);
    this.scene.add(this.tempWire);
  }

  // ---------- pointer handling ----------
  private pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    this.audio.unlock();
    const ep = this.pickTerminal(e);

    if (this.probe.active && ep) {
      const pr = this.probe;
      if (!pr.red || pr.black) { pr.red = ep; pr.black = null; } else pr.black = ep;
      this.audio.sfx('probe');
      this.onProbe();
      return;
    }
    if (this.wiring?.sticky) {
      // second click of click-click wiring
      if (ep && ep !== this.wiring.from && this.addWire(this.wiring.from, ep)) this.audio.sfx('snap');
      this.cancelWiring();
      return;
    }
    if (ep) {
      this.wiring = { from: ep, startX: e.clientX, startY: e.clientY, sticky: false };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }

    const hit = this.pick(e);
    if (!hit) {
      const wire = this.pickWire(e);
      if (wire) { this.selectWire(wire); return; }
      this.emptyDown = { x: e.clientX, y: e.clientY };
      return;
    }
    const { part, action } = hit;
    const def = PARTS[part.type];
    let mode: DragMode = 'move';
    if (action === 'press') mode = 'press';
    else if (action === 'knob' && def.knob) mode = 'knob';
    else if (action === 'stick') mode = 'stick';
    const gp = this.groundPoint(e) ?? new THREE.Vector3();
    this.drag = {
      part, mode, moved: false, startX: e.clientX, startY: e.clientY,
      offset: new THREE.Vector3(part.x - gp.x, 0, part.z - gp.z),
      startVal: def.knob ? part.props[def.knob.key] : undefined,
    };
    if (mode === 'press' || mode === 'stick') {
      // a joystick click (without dragging) presses its built-in button
      part.state.pressed = true;
      part.state.key = hit.keyIndex ?? null; // which key, on a keypad
      this.audio.sfx('press');
      this.onChange();
    }
    this.controls.enabled = false;
    this.renderer.domElement.setPointerCapture(e.pointerId);
  }

  private pointerMove(e: PointerEvent) {
    const d = this.drag;
    if (this.wiring) {
      const ep = this.pickTerminal(e);
      this.setHover(ep, e);
      this.updateTempWire(e);
      this.renderer.domElement.style.cursor = 'crosshair';
      return;
    }
    if (!d) {
      const ep = this.pickTerminal(e);
      this.setHover(ep, e);
      if (ep) { this.renderer.domElement.style.cursor = 'crosshair'; return; }
      const hit = this.pick(e);
      this.hoverPart = hit?.part ?? null;
      const wire = !hit && this.pickWire(e);
      this.renderer.domElement.style.cursor = wire ? 'pointer' : !hit ? '' : hit.action === 'press' ? 'pointer' : hit.action === 'knob' ? 'ns-resize' : hit.action === 'stick' ? 'move' : 'grab';
      return;
    }
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.mode === 'knob') {
      const k = PARTS[d.part.type].knob!;
      const v = THREE.MathUtils.clamp(d.startVal! + (d.startY - e.clientY) * k.perPixel, k.min, k.max);
      d.part.props[k.key] = Math.round(v);
      this.onChange();
    } else if (d.mode === 'stick') {
      // joystick: screen drag maps to x/y in -1..1
      d.part.state.pressed = false;
      d.part.state.sx = THREE.MathUtils.clamp((e.clientX - d.startX) / 60, -1, 1);
      d.part.state.sy = THREE.MathUtils.clamp((d.startY - e.clientY) / 60, -1, 1);
    } else if (d.mode === 'move') {
      const gp = this.groundPoint(e);
      if (!gp) return;
      d.part.x = THREE.MathUtils.clamp(Math.round((gp.x + d.offset.x) * 4) / 4, -DESK, DESK);
      d.part.z = THREE.MathUtils.clamp(Math.round((gp.z + d.offset.z) * 4) / 4, -DESK, DESK);
      this.placeGroup(d.part);
      this.wiresDirty = true;
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  }

  private pointerUp(e: PointerEvent) {
    if (this.wiring && !this.wiring.sticky) {
      const moved = Math.hypot(e.clientX - this.wiring.startX, e.clientY - this.wiring.startY) > 6;
      const ep = this.pickTerminal(e);
      if (!moved) {
        // a plain click: keep drawing until the next click
        this.wiring.sticky = true;
        this.updateTempWire(e);
        return;
      }
      if (ep && ep !== this.wiring.from && this.addWire(this.wiring.from, ep)) this.audio.sfx('snap');
      this.cancelWiring();
      return;
    }
    const empty = this.emptyDown;
    this.emptyDown = null;
    if (empty && Math.hypot(e.clientX - empty.x, e.clientY - empty.y) < 4) this.select(null);
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.controls.enabled = true;
    if (d.mode === 'press') { d.part.state.pressed = false; d.part.state.key = null; }
    if (d.mode === 'knob' && !d.moved && PARTS[d.part.type].clickPress) {
      // a click without dragging pushes the knob's built-in switch
      const p = d.part;
      p.state.pressed = true;
      setTimeout(() => { p.state.pressed = false; }, 220);
    }
    if (d.mode === 'stick') { d.part.state.sx = 0; d.part.state.sy = 0; d.part.state.pressed = false; }
    if (d.moved && d.mode === 'move') this.audio.sfx('place');
    if (!d.moved || d.mode !== 'move') this.select(d.part);
    if (d.moved || d.mode === 'press') this.onChange();
  }

  private wheel(e: WheelEvent) {
    const hit = this.pick(e);
    const k = hit && PARTS[hit.part.type].knob;
    if (!hit || !k || hit.action !== 'knob') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hit.part.props[k.key] = Math.round(THREE.MathUtils.clamp(hit.part.props[k.key] - Math.sign(e.deltaY) * (k.max - k.min) / 40, k.min, k.max));
    this.onChange();
  }

  // ---------- frame loop ----------
  private frame() {
    const dt = Math.min(0.25, this.clock.getDelta()); // keep sim time real even when frames drop
    this.onFrame(dt);
    if (this.wiresDirty) {
      this.wiresDirty = false;
      this.rebuildWires();
      if (this.hoverEp) this.setHover(this.hoverEp);
    }
    const obstacles = this.parts.filter(p => PARTS[p.type].obstacle && p.group).map(p => p.group!);
    for (const p of this.parts) {
      const powered = !p.state.missing?.length;
      PARTS[p.type].update?.(p, this.board, { running: this.running && powered, dt, obstacles, audio: this.audio, parts: this.parts });
    }
    const sel = this.selected;
    if (sel?.group) {
      const box = new THREE.Box3().setFromObject(sel.group);
      const size = box.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.z) * 0.62 + 0.4;
      this.selRing.scale.setScalar(r);
      this.selRing.position.set(sel.x, 0.03, sel.z);
      this.selRing.visible = true;
    } else this.selRing.visible = false;
    for (const k of ['red', 'black'] as const) {
      const at = this.probe.active && this.probe[k] ? this.endpointPos(this.probe[k]!) : null;
      this.probeMarks[k].visible = !!at;
      if (at) this.probeMarks[k].position.copy(at);
    }
    if (this.hoverDot.visible) this.hoverDot.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.15);
    this.updateSpill();
    const outlined = [this.selected, this.hoverPart].filter((p): p is Part => !!p?.group).map(p => p.group!);
    this.outline.selectedObjects = [...new Set(outlined)];
    this.stepGlide(dt);
    this.controls.update();
    this.composer.render();
  }
}

/** A multimeter probe resting on a terminal: a coloured handle and a steel tip. */
function probeMark(color: string): THREE.Group {
  const g = new THREE.Group();
  const handleMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 12), new THREE.MeshStandardMaterial({ color: '#d5d8dc', metalness: 0.9, roughness: 0.25 }));
  tip.rotation.x = Math.PI; // point down
  tip.position.y = 0.45;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 2.2, 16), handleMat);
  handle.position.y = 2.0;
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16), handleMat);
  guard.position.y = 0.95;
  g.add(tip, handle, guard);
  g.rotation.z = 0.35; // leaning, like a hand-held probe
  g.visible = false;
  g.traverse(o => { o.castShadow = true; });
  return g;
}

function matTexture(t: Theme): THREE.Texture {
  const PX = 20; // pixels per cm
  const W = MAT_W * PX, H = MAT_D * PX;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = t.mat;
  g.fillRect(0, 0, W, H);
  // subtle speckle so it doesn't look like flat plastic
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const margin = 2 * PX;
  const line = (x0: number, y0: number, x1: number, y1: number, a: number, w: number) => {
    g.strokeStyle = `rgba(${t.matLine},${a})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  for (let cm = 0; cm * PX <= W - 2 * margin; cm++) {
    const x = margin + cm * PX;
    line(x, margin, x, H - margin, cm % 10 === 0 ? 0.32 : cm % 5 === 0 ? 0.2 : 0.08, cm % 10 === 0 ? 2 : 1);
    if (cm % 5 === 0) line(x, margin - 10, x, margin, 0.6, 1.5);
  }
  for (let cm = 0; cm * PX <= H - 2 * margin; cm++) {
    const y = margin + cm * PX;
    line(margin, y, W - margin, y, cm % 10 === 0 ? 0.32 : cm % 5 === 0 ? 0.2 : 0.08, cm % 10 === 0 ? 2 : 1);
  }
  // 45° guide lines from one corner, like real cutting mats
  for (let k = 0; k < 3; k++) line(margin + k * 20 * PX, H - margin, margin + k * 20 * PX + (H - 2 * margin), margin, 0.12, 1.5);
  g.fillStyle = t.matText;
  g.font = '600 22px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  for (let cm = 0; cm * PX <= W - 2 * margin; cm += 10) g.fillText(String(cm), margin + cm * PX, margin - 14);
  g.textAlign = 'right';
  g.font = '700 30px "IBM Plex Sans", sans-serif';
  g.fillText('BUILDER · SELF-HEALING MAT', W - margin, H - margin / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const PLUG_H = 0.75;
const plugGeo = new RoundedBoxGeometry(0.3, PLUG_H, 0.3, 1, 0.05);
const plugMat = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.6 });

function wireMesh(a: THREE.Vector3, b: THREE.Vector3, color: string, selected: boolean, opacity = 1): THREE.Mesh {
  const dist = a.distanceTo(b);
  const lift = 1.2 + dist * 0.22;
  const curve = new THREE.CubicBezierCurve3(
    a,
    a.clone().add(new THREE.Vector3(0, lift, 0)),
    b.clone().add(new THREE.Vector3(0, lift, 0)),
    b,
  );
  const geo = new THREE.TubeGeometry(curve, Math.max(24, Math.round(dist * 2)), selected ? 0.13 : 0.1, 10, false);
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.35, transparent: opacity < 1, opacity,
    emissive: selected ? new THREE.Color('#00b3bb') : new THREE.Color(0), emissiveIntensity: selected ? 0.6 : 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opacity === 1;
  return mesh;
}

/** A jumper wire: a cable between two black Dupont plug housings. */
function jumperWire(a: THREE.Vector3, b: THREE.Vector3, color: string, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  const up = new THREE.Vector3(0, PLUG_H, 0);
  g.add(wireMesh(a.clone().add(up), b.clone().add(up), color, selected));
  for (const p of [a, b]) {
    const plug = new THREE.Mesh(plugGeo, plugMat);
    plug.position.copy(p).add(new THREE.Vector3(0, PLUG_H / 2, 0));
    plug.castShadow = true;
    g.add(plug);
  }
  return g;
}

// ---------- thumbnails for the palette and lesson cards ----------
let thumbRenderer: THREE.WebGLRenderer | null = null;
const thumbCache = new Map<string, string>();

export function partThumbnail(type: string, props: Record<string, any> = {}): string {
  const key = type + JSON.stringify(props);
  const cached = thumbCache.get(key);
  if (cached) return cached;
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(160, 120);
    thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b8a98c', 2.0));
  const dl = new THREE.DirectionalLight('#ffffff', 2);
  dl.position.set(-3, 8, 6);
  scene.add(dl);
  const def = PARTS[type];
  const g = def.build({ id: 't', type, pins: {}, props: { ...def.defaults, ...props }, x: 0, z: 0, rot: 0, state: {} });
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 200);
  cam.position.copy(center).add(new THREE.Vector3(0.55, 0.75, 1).normalize().multiplyScalar(size * 1.75));
  cam.lookAt(center);
  thumbRenderer.render(scene, cam);
  const url = thumbRenderer.domElement.toDataURL();
  thumbCache.set(key, url);
  return url;
}
