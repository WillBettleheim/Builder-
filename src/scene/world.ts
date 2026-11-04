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
import { pinLook } from '../ui/boardview';
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
  /** grid size parts snap to while dragging, in cm */
  snap = 0.5;
  /** view options: pin labels over the board, the camera riding with a robot, wires drawn through parts */
  view = { pinLabels: 'used' as 'off' | 'used' | 'all', follow: false, wiresOnTop: false };
  private pinTags = new Map<number, { sprite: THREE.Sprite; line: THREE.Line; draw: (cls: string) => void; cls: string }>();
  private tagsAt = 0;
  /** simulation speed (0 while paused), so robots drive in step with the sketch */
  timeScale = 1;
  private wasRunning = false;
  /** drawing is skipped until this time unless the sketch runs: a still scene costs no GPU at all */
  private renderUntil = 0;
  private shadowDirty = true;
  private frameNo = 0;
  private settleUntil = 0;
  private wireCache = new Map<string, { key: string; obj: THREE.Object3D }>();
  private hitsDirty = true;
  private hitsAt = 0;
  private pendingMove: PointerEvent | null = null;
  /** real frame time while drawing, and the callback when it stays too slow */
  private slowMs = 16;
  private slowAt = 0;
  onSlow: () => void = () => {};
  private grid: THREE.GridHelper | null = null;
  private ghost: THREE.Mesh;

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
  /** a part to outline because the pointer is on one of its pins in the board diagram */
  highlight: Part | null = null;
  private lampLight!: THREE.SpotLight;
  private sun!: THREE.DirectionalLight;
  quality: 'high' | 'balanced' | 'low' = 'high';
  /** coloured light that lit LEDs and lamps spill onto the desk */
  private spill: THREE.PointLight[] = [];
  private glows: THREE.Sprite[] = [];
  private glide: null | { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } = null;
  private drag: null | {
    part: Part; offset: THREE.Vector3; startX: number; startY: number; moved: boolean; mode: DragMode; startVal?: number;
    from: { x: number; z: number; mount?: string; mdx?: number; mdz?: number };
  } = null;
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
    this.renderer.shadowMap.autoUpdate = false; // redone only when something moved: see draw()
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
    this.ao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.4, thickness: 1.5, scale: 1.1, samples: 8 });
    this.ao.blendIntensity = 0.85;
    halfResolution(this.ao); // contact shadows are soft anyway: half the pixels look the same
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
    halfResolution(this.bloom); // a glow is blurry by nature, so half resolution looks the same
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
    for (let i = 0; i < 4; i++) {
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
    // footprint shown under a part while it's dragged: green where it fits, red where it would overlap
    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#2fbf71', transparent: true, opacity: 0.28, depthWrite: false }));
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.visible = false;
    this.ghost.renderOrder = 2;
    this.scene.add(this.ghost);

    this.scene.add(this.wireGroup, this.hitGroup);

    this.tip = document.createElement('div');
    this.tip.className = 'scene-tip';
    this.tip.hidden = true;
    host.appendChild(this.tip);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => this.pointerDown(e));
    // handle at most one move per frame: pointers can fire far faster than the screen updates
    el.addEventListener('pointermove', e => { this.pendingMove = e; });
    el.addEventListener('pointerleave', () => { this.setHover(null); this.hoverPart = null; });
    window.addEventListener('pointerup', e => { this.flushMove(); this.pointerUp(e); this.shadowDirty = true; });
    // anything the person does may change the picture, so wake the renderer up
    for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'click']) window.addEventListener(type, () => this.kick(), { passive: true, capture: true });
    for (const type of ['input', 'change']) window.addEventListener(type, () => { this.kick(); this.shadowDirty = true; }, { passive: true, capture: true });
    document.addEventListener('visibilitychange', () => this.kick());
    el.addEventListener('wheel', e => this.wheel(e), { passive: false });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    ro.observe(this.renderer.domElement);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Trade looks for speed: high has every effect, low suits phones and older laptops. */
  setQuality(q: 'high' | 'balanced' | 'low', maxPixelRatio = 2) {
    this.quality = q;
    const dpr = window.devicePixelRatio;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, maxPixelRatio) : q === 'balanced' ? Math.min(dpr, 1.5) : 1);
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
    this.shadowDirty = true;
    this.kick(1000);
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
    this.kick(1000);
  }

  /** Glide to a standard angle: the friendly 3/4 view, straight down, from the front or from the side. */
  setView(kind: 'angled' | 'top' | 'front' | 'side') {
    const dir = { angled: [0.12, 0.72, 0.68], top: [0, 1, 0.02], front: [0, 0.3, 1], side: [1, 0.3, 0] }[kind];
    this.resetView(true, new THREE.Vector3(...dir));
  }

  /** Point the camera at all parts, from a friendly 3/4 angle (gliding there unless told not to). */
  resetView(animate = true, from = new THREE.Vector3(0.12, 0.72, 0.68)) {
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
    const to = center.clone().add(from.clone().normalize().multiplyScalar(dist));
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.glide = null;
      this.controls.target.copy(center);
      this.camera.position.copy(to);
      this.controls.update();
      this.kick();
      return;
    }
    this.glide = { from: this.camera.position.clone(), to, fromT: this.controls.target.clone(), toT: center, t: 0 };
    this.kick(1200);
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
    this.kick();
  }

  // ---------- parts ----------
  get uno(): Part | undefined { return this.parts.find(p => p.type === 'uno'); }

  addPart(part: Part) {
    this.parts.push(part);
    this.buildPart(part);
    this.syncListeners();
    this.kick(1000);
  }

  removePart(part: Part) {
    for (const p of this.parts) if (p.props.mount === part.id) this.unmount(p); // passengers stay where they are
    if (part.group) this.scene.remove(part.group);
    this.audio.set(part.id, null);
    this.parts = this.parts.filter(p => p !== part);
    this.collectGlows();
    this.wires = this.wires.filter(w => !w.a.startsWith(part.id + ':') && !w.b.startsWith(part.id + ':'));
    if (this.selected === part) this.select(null);
    this.syncListeners();
    this.solveCircuit(false);
    this.shadowDirty = true;
    this.hitsDirty = true;
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
    this.hitsDirty = true;
    this.shadowDirty = true;
    this.kick(1000);
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
    g.userData.foot = localFootprint(g);
    this.placeGroup(part);
    this.scene.add(g);
    this.wiresDirty = true;
    this.hitsDirty = true;
    this.shadowDirty = true;
    this.collectGlows();
    this.kick(1000);
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

  /** Keep drawing for a moment: the picture may be changing. */
  kick(ms = 500) {
    this.renderUntil = Math.max(this.renderUntil, performance.now() + ms);
  }

  private flushMove() {
    const e = this.pendingMove;
    this.pendingMove = null;
    if (e) this.pointerMove(e);
  }

  /** Where a part is right now: its spot on the desk, or where it has driven to while running. */
  poseOf(p: Part): { x: number; z: number; a: number } {
    return p.state.pose ?? { x: p.x, z: p.z, a: (-p.rot * Math.PI) / 2 };
  }

  /** The part this one is mounted on, if any. */
  hostOf(p: Part): Part | undefined {
    const id = p.props.mount;
    return id ? this.parts.find(h => h.id === id && PARTS[h.type].deck) : undefined;
  }

  private placeGroup(part: Part) {
    const host = this.hostOf(part);
    if (host) {
      // ride on the host's deck: the offset is kept in the host's own frame
      const hp = this.poseOf(host);
      const c = Math.cos(hp.a), s = Math.sin(hp.a);
      const dx = part.props.mdx ?? 0, dz = part.props.mdz ?? 0;
      part.x = hp.x + dx * c + dz * s;
      part.z = hp.z - dx * s + dz * c;
      part.group!.position.set(part.x, PARTS[host.type].deck!.y, part.z);
      part.group!.rotation.y = hp.a - (part.rot * Math.PI) / 2;
    } else {
      const p = this.poseOf(part);
      part.group!.position.set(p.x, 0, p.z);
      part.group!.rotation.y = p.a;
    }
    part.group!.updateMatrixWorld(true);
  }

  rotatePart(part: Part) {
    part.rot = (part.rot + 1) % 4;
    this.placeGroup(part);
    this.wiresDirty = true;
    this.hitsDirty = true;
    this.shadowDirty = true;
    this.onChange();
  }

  /** A part's footprint on the desk as an axis-aligned box, at a given spot (default: where it is). */
  rectOf(p: Part, x?: number, z?: number, a?: number): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const f = p.group?.userData.foot ?? { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
    const pose = this.poseOf(p);
    const px = x ?? pose.x, pz = z ?? pose.z, ang = a ?? p.group?.rotation.y ?? pose.a;
    const c = Math.cos(ang), s = Math.sin(ang);
    const xs: number[] = [], zs: number[] = [];
    for (const [lx, lz] of [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]]) {
      xs.push(px + lx * c + lz * s);
      zs.push(pz - lx * s + lz * c);
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }

  /** Would this part, at x/z, overlap anything solid? (Flat parts, its host and its passengers don't count.) */
  blockedAt(part: Part, x: number, z: number, host?: Part, a?: number): boolean {
    const r = this.rectOf(part, x, z, a ?? (host ? undefined : (-part.rot * Math.PI) / 2));
    const m = 0.15; // parts may touch, not overlap
    return this.parts.some(o => {
      if (o === part || o === host || PARTS[o.type].flat || this.hostOf(o)) return false;
      const q = this.rectOf(o);
      return r.minX < q.maxX - m && r.maxX > q.minX + m && r.minZ < q.maxZ - m && r.maxZ > q.minZ + m;
    });
  }

  /** A part with a deck whose deck lies under the point x/z. */
  private deckUnder(part: Part, x: number, z: number): Part | undefined {
    if (PARTS[part.type].deck) return undefined; // no stacking hosts on hosts
    return this.parts.find(h => {
      const d = PARTS[h.type].deck;
      if (!d || h === part) return false;
      const hp = this.poseOf(h), c = Math.cos(hp.a), s = Math.sin(hp.a);
      const ox = x - hp.x, oz = z - hp.z;
      const lx = ox * c - oz * s, lz = ox * s + oz * c; // into the host's frame
      return lx >= d.minX && lx <= d.maxX && lz >= d.minZ && lz <= d.maxZ;
    });
  }

  /** Put every mounted part on its host: needed right after a scene loads, before framing it. */
  settleMounted() {
    for (const p of this.parts) if (p.props.mount && p.group) this.placeGroup(p);
  }

  /** Mount a part on a host at its current spot, snapping the offset to the grid. */
  mount(part: Part, host: Part) {
    const hp = this.poseOf(host), c = Math.cos(hp.a), s = Math.sin(hp.a);
    const ox = part.x - hp.x, oz = part.z - hp.z;
    const g = this.snap || 0.25;
    part.props.mount = host.id;
    part.props.mdx = Math.round((ox * c - oz * s) / g) * g;
    part.props.mdz = Math.round((ox * s + oz * c) / g) * g;
    this.placeGroup(part);
    this.wiresDirty = true;
    this.hitsDirty = true;
  }

  unmount(part: Part) {
    delete part.props.mount;
    delete part.props.mdx;
    delete part.props.mdz;
  }

  private showGrid(at: THREE.Vector3 | null) {
    const step = this.snap || 0.25;
    if (at && !this.grid) {
      this.grid = new THREE.GridHelper(40, Math.round(40 / step), 0x2fbf71, 0x2fbf71);
      const m = this.grid.material as THREE.LineBasicMaterial;
      m.transparent = true;
      m.opacity = 0.16;
      m.depthWrite = false;
      this.scene.add(this.grid);
    }
    if (!this.grid) return;
    this.grid.visible = !!at;
    // keep the lines on the snap grid as it follows the part
    if (at) this.grid.position.set(Math.round(at.x / step) * step, 0.035, Math.round(at.z / step) * step);
  }

  /** Move robot bases by their wheel speeds; a new run starts them from their home spot. */
  private driveRobots(dt: number) {
    if (this.running !== this.wasRunning) {
      this.wasRunning = this.running;
      if (this.running) for (const p of this.parts) if (PARTS[p.type].drive) { delete p.state.pose; p.state.travelled = 0; p.state.bumps = 0; p.state.distL = 0; p.state.distR = 0; }
      this.wiresDirty = true; // robots may have jumped back to their start
      this.hitsDirty = true;
      this.shadowDirty = true;
    }
    for (const p of this.parts) {
      const def = PARTS[p.type];
      if (!def.drive || !p.group) continue;
      const powered = !p.state.missing?.length;
      const sp = this.running && powered ? def.drive(p, this.board) : { left: 0, right: 0, track: 1 };
      p.state.vl = sp.left;
      p.state.vr = sp.right;
      p.state.odoAt = this.board.time; // wheel encoders extrapolate from here as sketch time moves on
      if ((!sp.left && !sp.right) || dt <= 0) continue;
      let pose = { ...this.poseOf(p) };
      const steps = Math.max(1, Math.ceil(dt / 0.02));
      for (let i = 0; i < steps; i++) {
        const h = dt / steps;
        const v = (sp.left + sp.right) / 2;
        const a = pose.a + ((sp.right - sp.left) / sp.track) * h; // faster right wheel turns it left
        const x = THREE.MathUtils.clamp(pose.x - v * Math.sin(a) * h, -DESK, DESK);
        const z = THREE.MathUtils.clamp(pose.z - v * Math.cos(a) * h, -DESK, DESK);
        if (this.blockedAt(p, x, z, undefined, a)) {
          if (!(p.state.bumpUntil > performance.now())) this.audio.click();
          p.state.bumpUntil = performance.now() + 600;
          p.state.bumpAt = this.board.time;
          p.state.bumpFwd = (sp.left + sp.right) / 2 > 0;
          p.state.bumps = (p.state.bumps ?? 0) + 1;
          break;
        }
        pose = { x, z, a };
        p.state.travelled = (p.state.travelled ?? 0) + Math.abs(v) * h;
        p.state.distL = (p.state.distL ?? 0) + Math.abs(sp.left) * h;
        p.state.distR = (p.state.distR ?? 0) + Math.abs(sp.right) * h;
      }
      p.state.pose = pose;
    }
  }

  /** Draw only when the picture can have changed, and redo shadows only when things moved. */
  private draw() {
    const now = performance.now();
    if (this.running !== this.wasDrawnRunning) {
      this.wasDrawnRunning = this.running;
      this.settleUntil = now + 1200; // servos and fans finish gliding after a stop
      this.kick(1200);
    }
    // the camera still easing to a stop counts as a change, but not movement too small to see
    const cam = this.camera.position, tgt = this.controls.target;
    if (cam.distanceToSquared(this.drawnCam) > 1e-4 || tgt.distanceToSquared(this.drawnTarget) > 1e-4) {
      this.drawnCam.copy(cam);
      this.drawnTarget.copy(tgt);
      this.kick(200);
    }
    const live = this.running || now < this.settleUntil;
    if (!live && now > this.renderUntil && !this.drag && !this.wiring) { this.lastDraw = 0; return; }
    this.frameNo++;
    // while a sketch runs, moving parts' shadows can update at a third of the frame rate
    const shadows = this.shadowDirty || (live && this.frameNo % 3 === 0);
    if (shadows) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    this.composer.render();
    this.watchSpeed(now);
  }

  private drawnCam = new THREE.Vector3();
  private drawnTarget = new THREE.Vector3();
  private wasDrawnRunning = false;
  private lastDraw = 0;

  /** If drawing stays slow for a couple of seconds, say so (auto quality then steps down). */
  private watchSpeed(now: number) {
    const gap = this.lastDraw ? now - this.lastDraw : 0;
    this.lastDraw = now;
    if (!gap || gap > 250 || document.hidden) return; // the first frame, or a hidden or throttled page
    this.slowMs += (gap - this.slowMs) * 0.05;
    if (this.slowMs > 30 && now - this.slowAt > 2500) {
      this.slowAt = now;
      this.slowMs = 16;
      this.onSlow();
    }
  }

  /** Keep the camera on a driving robot, without changing the angle. */
  private followRobot() {
    if (!this.view.follow || this.glide) return;
    const robot = this.parts.find(p => PARTS[p.type].drive && p.group);
    if (!robot) return;
    const pose = this.poseOf(robot);
    const delta = new THREE.Vector3(pose.x, 0, pose.z).sub(this.controls.target).setY(0).multiplyScalar(0.12);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  /** Little numbered tags over the board's sockets, coloured like the live board diagram. */
  private updatePinTags() {
    const uno = this.uno;
    const mode = this.view.pinLabels;
    const used = new Set<number>();
    for (const p of this.parts) for (const pin of Object.values(p.pins)) if (pin != null) used.add(pin);
    for (let pin = 0; pin < 20; pin++) if (this.board.pins[pin].mode === 'OUTPUT' && this.running) used.add(pin);
    for (let pin = 0; pin < 20; pin++) {
      const show = !!uno?.group && mode !== 'off' && (mode === 'all' || used.has(pin));
      let tag = this.pinTags.get(pin);
      if (!show) { if (tag) tag.sprite.visible = tag.line.visible = false; continue; }
      if (!tag) { tag = makePinTag(pin); this.pinTags.set(pin, tag); this.scene.add(tag.sprite, tag.line); }
      const term = BOARD_TERMINALS.find(t => t.pin === pin)!;
      // fan out past the board's edge in three staggered rows, so neighbouring sockets' tags don't overlap
      const out = Math.sign(term.pos.z) * (0.75 + (pin % 3) * 0.62);
      const at = uno!.group!.localToWorld(term.pos.clone());
      const tip = uno!.group!.localToWorld(term.pos.clone().add(new THREE.Vector3(0, 0.55 + (pin % 3) * 0.12, out)));
      tag.sprite.position.copy(tip);
      const pos = tag.line.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, at.x, at.y + 0.05, at.z);
      pos.setXYZ(1, tip.x, tip.y - 0.12, tip.z);
      pos.needsUpdate = true;
      tag.sprite.visible = tag.line.visible = true;
      const cls = used.has(pin) ? pinLook(this.board, pin, this.running).cls : 'unused';
      if (cls !== tag.cls) { tag.cls = cls; tag.draw(cls); }
    }
  }

  setWiresOnTop(on: boolean) {
    this.view.wiresOnTop = on;
    this.wiresDirty = true;
  }

  setSnap(step: number) {
    this.snap = step;
    if (this.grid) { this.scene.remove(this.grid); this.grid = null; }
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
    this.hitsDirty = true;
    this.shadowDirty = true;
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
        ir: l.ir && (pin => (on() ? l.ir!(pin) : undefined)),
        btInbox: l.btInbox && (rx => (on() ? l.btInbox!(rx) : undefined)),
        btSend: l.btSend && ((tx, text) => on() && l.btSend!(tx, text)),
        sd: l.sd && ((cs, b) => (on() ? l.sd!(cs, b) : undefined)),
      };
      return [gated];
    });
  }

  select(part: Part | null) {
    this.kick();
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
    this.kick();
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

  /** Redraw only the wires whose ends or look changed; the rest keep their geometry. */
  private rebuildWires() {
    for (const p of this.parts) p.group?.updateMatrixWorld(true);
    const keep = new Set<string>();
    for (const w of this.wires) {
      const a = this.endpointPos(w.a), b = this.endpointPos(w.b);
      if (!a || !b) continue;
      keep.add(w.id);
      const key = [a.x, a.y, a.z, b.x, b.y, b.z].map(n => n.toFixed(3)).join() + w.color + (w === this.selectedWire) + this.view.wiresOnTop;
      const old = this.wireCache.get(w.id);
      if (old?.key === key) continue;
      if (old) this.dropWire(old.obj);
      const jumper = jumperWire(a, b, w.color, w === this.selectedWire);
      jumper.traverse(o => {
        o.userData.wireId = w.id;
        // "wires on top": draw them through the parts, so you can trace every connection
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && this.view.wiresOnTop) { m.depthTest = false; o.renderOrder = 12; }
      });
      this.wireGroup.add(jumper);
      this.wireCache.set(w.id, { key, obj: jumper });
    }
    for (const [id, c] of this.wireCache) if (!keep.has(id)) { this.dropWire(c.obj); this.wireCache.delete(id); }
    plugMat.depthTest = !this.view.wiresOnTop;
    if (!this.running) this.shadowDirty = true;
    this.kick();
  }

  private dropWire(obj: THREE.Object3D) {
    this.wireGroup.remove(obj);
    // plug geometry is shared; only the per-wire tubes and materials are freed
    obj.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== plugGeo) m.geometry.dispose();
      if (m.material && m.material !== plugMat) (m.material as THREE.Material).dispose();
    });
  }

  /** Invisible click targets for every terminal. */
  private rebuildHits() {
    for (const p of this.parts) p.group?.updateMatrixWorld(true);
    this.hitGroup.clear();
    for (const part of this.parts) {
      if (!part.group) continue;
      const terms = part.type === 'uno' ? BOARD_TERMINALS.map(t => ({ key: t.key, small: false })) : PARTS[part.type].terminals(part).map(t => ({ key: t.key, small: t.kind === 'pass' }));
      for (const { key, small } of terms) {
        const ep = endpoint(part.id, key);
        const s = new THREE.Mesh(small ? HOLE_GEO : HIT_GEO, HIT_MAT);
        s.position.copy(this.endpointPos(ep)!);
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
      from: { x: part.x, z: part.z, mount: part.props.mount, mdx: part.props.mdx, mdz: part.props.mdz },
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
      if (d.part.props.mount) this.unmount(d.part); // lifted off its host while dragging
      const g = this.snap || 0.25;
      d.part.x = THREE.MathUtils.clamp(Math.round((gp.x + d.offset.x) / g) * g, -DESK, DESK);
      d.part.z = THREE.MathUtils.clamp(Math.round((gp.z + d.offset.z) / g) * g, -DESK, DESK);
      delete d.part.state.pose; // dragging a robot puts it back on its home spot
      this.placeGroup(d.part);
      this.wiresDirty = true;
      this.renderer.domElement.style.cursor = 'grabbing';
      const host = this.deckUnder(d.part, d.part.x, d.part.z);
      const bad = !host && this.blockedAt(d.part, d.part.x, d.part.z);
      const r = this.rectOf(d.part);
      this.ghost.visible = true;
      this.ghost.scale.set(r.maxX - r.minX, r.maxZ - r.minZ, 1);
      this.ghost.position.set((r.minX + r.maxX) / 2, host ? PARTS[host.type].deck!.y + 0.03 : 0.04, (r.minZ + r.maxZ) / 2);
      (this.ghost.material as THREE.MeshBasicMaterial).color.set(bad ? '#e2533b' : host ? '#2f7bff' : '#2fbf71');
      this.showGrid(d.part.group!.position);
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
    if (d.moved && d.mode === 'move') {
      this.ghost.visible = false;
      this.showGrid(null);
      const host = this.deckUnder(d.part, d.part.x, d.part.z);
      if (host) {
        this.mount(d.part, host);
        this.audio.sfx('snap');
      } else if (this.blockedAt(d.part, d.part.x, d.part.z)) {
        // it would overlap another part: slide back to where it came from
        const f = d.from;
        d.part.x = f.x;
        d.part.z = f.z;
        if (f.mount) Object.assign(d.part.props, { mount: f.mount, mdx: f.mdx, mdz: f.mdz });
        this.placeGroup(d.part);
        this.wiresDirty = true;
        this.hitsDirty = true;
        this.audio.sfx('unsnap');
      } else this.audio.sfx('place');
    }
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
    this.flushMove();
    this.onFrame(dt);
    if (this.wiresDirty) {
      this.wiresDirty = false;
      this.rebuildWires();
      if (this.hoverEp) this.setHover(this.hoverEp);
    }
    // clicking targets only need to catch up once things have stopped moving (or every so often)
    if (this.hitsDirty && !this.drag && performance.now() - this.hitsAt > 200) {
      this.hitsDirty = false;
      this.hitsAt = performance.now();
      this.rebuildHits();
    }
    this.driveRobots(dt * this.timeScale);
    // passengers follow their hosts (a robot driving, or a host being dragged)
    const moved = this.parts.some(p => PARTS[p.type].drive && (p.state.vl || p.state.vr));
    if (moved || this.drag || this.running) {
      for (const p of this.parts) if ((p.props.mount || p.state.pose) && p.group) this.placeGroup(p);
    }
    if (moved || this.drag?.moved) { this.wiresDirty = true; this.hitsDirty = true; }
    if (this.drag?.moved) this.shadowDirty = true; // a driving robot's shadow updates in draw(), at a lower rate
    const obstacles = this.parts.filter(p => PARTS[p.type].obstacle && p.group).map(p => p.group!);
    for (const p of this.parts) {
      const powered = !p.state.missing?.length;
      PARTS[p.type].update?.(p, this.board, { running: this.running && powered, dt, simDt: dt * this.timeScale, obstacles, audio: this.audio, parts: this.parts });
    }
    const sel = this.selected;
    if (sel?.group) {
      const f = sel.group.userData.foot;
      const r = Math.max(f.maxX - f.minX, f.maxZ - f.minZ) * 0.62 + 0.4;
      this.selRing.scale.setScalar(r);
      this.selRing.position.set(sel.x, 0.03, sel.z);
      this.selRing.visible = true;
    } else this.selRing.visible = false;
    for (const k of ['red', 'black'] as const) {
      const at = this.probe.active && this.probe[k] ? this.endpointPos(this.probe[k]!) : null;
      this.probeMarks[k].visible = !!at;
      if (at) this.probeMarks[k].position.copy(at);
    }
    this.followRobot();
    if (performance.now() - this.tagsAt > 120) { this.tagsAt = performance.now(); this.updatePinTags(); }
    if (this.hoverDot.visible) this.hoverDot.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.15);
    this.updateSpill();
    const outlined = [this.selected, this.hoverPart, this.highlight].filter((p): p is Part => !!p?.group).map(p => p.group!);
    this.outline.selectedObjects = [...new Set(outlined)];
    this.outline.enabled = this.quality !== 'low' && outlined.length > 0; // nothing to outline: skip the pass
    if (this.glide) this.kick();
    this.stepGlide(dt);
    this.controls.update();
    this.draw();
  }
}

/** Make a post-processing pass work at half the composer's resolution. */
function halfResolution(pass: { setSize(w: number, h: number): void }) {
  const setSize = pass.setSize.bind(pass);
  pass.setSize = (w, h) => setSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
}

/** The part's footprint in its own frame, from its solid meshes (glows and labels don't count). */
function localFootprint(g: THREE.Group): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const box = new THREE.Box3();
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  g.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const mat = mesh.material as THREE.Material;
    if (mat.transparent && (mat as THREE.MeshBasicMaterial).opacity === 0) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)));
  });
  if (box.isEmpty()) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
}

// shared by every click target, so scenes with packed breadboards stay cheap
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HIT_GEO = new THREE.SphereGeometry(0.26, 8, 6);
const HOLE_GEO = new THREE.SphereGeometry(0.17, 6, 4);

const TAG_COLORS: Record<string, string> = {
  high: '#ff4d3d', low: '#3a3f47', pwm: '#ff9f1c', 'in-high': '#3b82f6', 'in-low': '#1f3f73', analog: '#16a79a',
  float: '#6b7280', servo: '#8b6cf0', tone: '#8b6cf0', idle: '#4b5563', unused: '#2b2f36',
};

/** A numbered tag (and a thin leader line down to its socket) for one board pin. */
function makePinTag(pin: number) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 56;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 15;
  sprite.scale.set(0.62, 0.36, 1);
  const label = pin >= 14 ? `A${pin - 14}` : String(pin);
  const draw = (cls: string) => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = TAG_COLORS[cls] ?? '#2b2f36';
    g.strokeStyle = cls === 'unused' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)';
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(4, 4, c.width - 8, c.height - 8, 20);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '700 30px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, c.width / 2, c.height / 2 + 1);
    tex.needsUpdate = true;
  };
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthTest: false }));
  line.renderOrder = 14;
  return { sprite, line, draw, cls: '' };
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
