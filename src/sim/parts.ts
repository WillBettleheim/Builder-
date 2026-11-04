// Every placeable part: its 3D model (built from primitives, 1 unit = 1 cm),
// its wiring terminals, and how it behaves on the simulated board.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Board, PinListener } from './board';

// 'pass' terminals just join wires together (breadboard holes)
export type TerminalKind = 'signal' | '5V' | 'GND' | 'pass';

export interface Terminal {
  key: string;
  label: string;
  kind: TerminalKind;
  analog?: boolean; // must go to A0–A5
  pwm?: boolean; // works best on a ~ pin
  pos: [number, number, number]; // local position of the wire end
  rail?: '5V' | 'GND'; // suggested wire color for breadboard power rails
}

export interface PropDef {
  key: string;
  label: string;
  type: 'select' | 'range';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface Part {
  id: string;
  type: string;
  pins: Record<string, number | null>;
  props: Record<string, any>;
  x: number;
  z: number;
  rot: number; // quarter turns
  locked?: boolean;
  group?: THREE.Group;
  state: Record<string, any>;
}

export interface UpdateCtx {
  running: boolean;
  dt: number;
  /** dt scaled by the simulation speed (0 while paused), for things that move in step with the sketch */
  simDt: number;
  obstacles: THREE.Object3D[];
  audio: AudioOut;
  parts: Part[];
}

export interface PartDef {
  type: string;
  name: string;
  blurb: string;
  terminals(part: Part): Terminal[];
  props?: PropDef[];
  defaults?: Record<string, any>;
  /** prop changed by dragging the part's knob/handle */
  knob?: { key: string; min: number; max: number; perPixel: number };
  build(part: Part): THREE.Group;
  update?(part: Part, board: Board, ctx: UpdateCtx): void;
  listener?(part: Part): PinListener;
  obstacle?: boolean;
  noPins?: boolean;
  /** clicking the knob (without dragging) presses a built-in switch */
  clickPress?: boolean;
  /** groups of terminal keys connected inside the part (breadboard strips) */
  nets?(part: Part): string[][];
  /** short live status line for the inspector */
  readout?(part: Part): string;
  /** a platform other parts can be mounted on (they ride along when it moves): local area and height */
  deck?: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
  /** lies flat on the desk, so other parts may sit on top of it (a track mat, a target pad) */
  flat?: boolean;
  /** a robot base: how fast its left and right wheels turn right now, in cm/s (the world moves it) */
  drive?(part: Part, board: Board): { left: number; right: number; track: number };
}

// ---------- shared materials & helpers ----------
const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

const M = {
  black: mat('#25262b'),
  dark: mat('#3a3c44'),
  metal: mat('#c9ccd2', { metalness: 0.7, roughness: 0.3 }),
  gold: mat('#d4a94a', { metalness: 0.6, roughness: 0.35 }),
  white: mat('#f4f1ea'),
  blue: mat('#2f5fa8'),
  servoBlue: mat('#2a5bd7'),
  leg: mat('#b8bcc4', { metalness: 0.8, roughness: 0.3 }),
};

function box(w: number, h: number, d: number, m: THREE.Material, r = 0.05): THREE.Mesh {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

let holeTexture: THREE.Texture | null = null;
function breadboardTexture(): THREE.Texture {
  if (holeTexture) return holeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f7f4ee';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#9a958c';
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(12 + x * 32, 12 + y * 32, 8, 8);
  holeTexture = new THREE.CanvasTexture(c);
  holeTexture.wrapS = holeTexture.wrapT = THREE.RepeatWrapping;
  holeTexture.colorSpace = THREE.SRGBColorSpace;
  holeTexture.anisotropy = 4;
  return holeTexture;
}

/** A small white breadboard the part sits on. Top surface is at y = 0.5. */
function breadboard(w: number, d: number): THREE.Mesh {
  const tex = breadboardTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(w / 0.5, d / 0.5);
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const side = mat('#ece7dc', { roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), [side, side, top, side, side, side]);
  mesh.position.y = 0.25;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

let glowTex: THREE.Texture | null = null;
function glowSprite(color: string, size = 2.4): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(size);
  return s;
}

function textTexture(lines: { text: string; x: number; y: number; size: number; color?: string; align?: CanvasTextAlign; weight?: string }[], w: number, h: number, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (const l of lines) {
    g.fillStyle = l.color ?? '#ffffff';
    g.font = `${l.weight ?? '600'} ${l.size}px "IBM Plex Mono", monospace`;
    g.textAlign = l.align ?? 'center';
    g.textBaseline = 'middle';
    g.fillText(l.text, l.x, l.y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Text label that always faces the camera. */
export function labelSprite(text: string, scale = 1): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.scale.set(2.6 * scale, 0.975 * scale, 1);
  s.userData.setText = (t: string) => {
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(38,36,33,0.88)';
    g.beginPath();
    g.roundRect(8, 14, 240, 68, 18);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '600 40px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(t, 128, 49);
    tex.needsUpdate = true;
  };
  s.userData.setText(text);
  return s;
}

const LED_COLORS: Record<string, string> = { red: '#ff3b30', yellow: '#ffc107', green: '#34c759', blue: '#2f7bff', white: '#f5f5f5' };

function makeLed(color: string, diffuse = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color, roughness: diffuse ? 0.6 : 0.15, transmission: 0, transparent: true, opacity: 0.92, emissive: new THREE.Color(color), emissiveIntensity: 0,
  });
  g.add(at(cyl(0.05, 0.05, 0.9, M.leg, 8), -0.12, 0.45, 0));
  g.add(at(cyl(0.05, 0.05, 0.8, M.leg, 8), 0.12, 0.4, 0));
  g.add(at(cyl(0.3, 0.3, 0.08, bodyMat), 0, 0.9, 0));
  g.add(at(cyl(0.26, 0.26, 0.4, bodyMat), 0, 1.12, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
  dome.position.y = 1.32;
  dome.castShadow = true;
  g.add(dome);
  const glow = glowSprite(color);
  glow.position.y = 1.2;
  g.add(glow);
  return { group: g, bodyMat, glow };
}

function setLed(led: { bodyMat: THREE.MeshPhysicalMaterial; glow: THREE.Sprite }, level: number, color?: THREE.Color) {
  if (color) {
    led.bodyMat.emissive.copy(color);
    (led.glow.material as THREE.SpriteMaterial).color.copy(color);
  }
  led.bodyMat.emissiveIntensity = level * 6; // bright enough to pass the bloom threshold
  (led.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, level * 1.1);
}

function resistor(): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.11, 0.11, 0.55, mat('#e6cfa1'), 12);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const [x, c] of [[-0.15, '#8b4513'], [-0.05, '#111'], [0.05, '#a52a2a'], [0.17, '#d4a94a']] as const) {
    const band = cyl(0.115, 0.115, 0.04, mat(c), 12);
    band.rotation.z = Math.PI / 2;
    band.position.x = x;
    g.add(band);
  }
  const lead = cyl(0.025, 0.025, 1.1, M.leg, 6);
  lead.rotation.z = Math.PI / 2;
  g.add(lead);
  return g;
}

// Front-edge terminal row helper: evenly spaced along x at the front of a base.
const row = (n: number, i: number, spacing = 0.45) => (i - (n - 1) / 2) * spacing;

// ---------- audio for buzzers ----------
export class AudioOut {
  private ctx: AudioContext | null = null;
  private voices = new Map<string, { osc: OscillatorNode; gain: GainNode }>();
  muted = false;

  unlock() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  set(id: string, freq: number | null) {
    if (!this.ctx) return;
    let v = this.voices.get(id);
    if (freq == null || this.muted) {
      if (v) v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      return;
    }
    if (!v) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(this.ctx.destination);
      osc.start();
      v = { osc, gain };
      this.voices.set(id, v);
    }
    v.osc.frequency.setTargetAtTime(Math.max(20, Math.min(12000, freq)), this.ctx.currentTime, 0.003);
    v.gain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.01);
  }

  /** A short mechanical click, e.g. a relay switching. */
  click() {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * 0.025);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = 0.35;
    src.buffer = buf;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  silenceAll() {
    for (const id of this.voices.keys()) this.set(id, null);
  }

  /** Interface sounds, synthesized so there are no files to load. Phones also get a buzz. */
  sfx(kind: Sfx) {
    const buzz = HAPTICS[kind];
    if (buzz && !this.muted) navigator.vibrate?.(buzz);
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.22;
    out.connect(ctx.destination);
    // a short pitched blip with a fast attack and exponential decay
    const blip = (freq: number, at: number, len: number, type: OscillatorType = 'sine', vol = 1, slideTo?: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + at + len);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      osc.connect(g).connect(out);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.02);
    };
    switch (kind) {
      case 'place': blip(180, 0, 0.09, 'triangle', 0.9, 90); this.click(); break;
      case 'snap': blip(1400, 0, 0.04, 'square', 0.25); blip(2100, 0.035, 0.05, 'sine', 0.5); break;
      case 'unsnap': blip(900, 0, 0.06, 'triangle', 0.5, 400); break;
      case 'press': blip(2400, 0, 0.025, 'square', 0.18); break;
      case 'probe': blip(1760, 0, 0.05, 'sine', 0.5); break;
      case 'beep': blip(2093, 0, 0.18, 'sine', 0.55); break;
      case 'goal': blip(784, 0, 0.12, 'triangle', 0.7); blip(1175, 0.09, 0.2, 'triangle', 0.7); break;
      case 'complete': [523, 659, 784, 1047].forEach((f, i) => blip(f, i * 0.09, i === 3 ? 0.45 : 0.14, 'triangle', 0.75)); break;
      case 'badge': blip(1319, 0, 0.1, 'sine', 0.6); blip(1760, 0.07, 0.1, 'sine', 0.6); blip(2637, 0.14, 0.3, 'sine', 0.5); break;
      case 'error': blip(220, 0, 0.16, 'sawtooth', 0.35); blip(165, 0.12, 0.22, 'sawtooth', 0.35); break;
      case 'zap': blip(3000, 0, 0.25, 'sawtooth', 0.4, 60); this.click(); break;
    }
  }
}

export type Sfx = 'place' | 'snap' | 'unsnap' | 'press' | 'probe' | 'beep' | 'goal' | 'complete' | 'badge' | 'error' | 'zap';
const HAPTICS: Partial<Record<Sfx, number | number[]>> = { place: 12, snap: 8, press: 6, goal: [15, 40, 25], complete: [20, 50, 20, 50, 60], error: [40, 30, 40], zap: 80 };

// ---------- the board ----------
export const UNO_TOP = 0.46;
const HEADER_H = 0.85;
export const digitalPinX = (pin: number) => 3.05 - pin * 0.254 - (pin >= 8 ? 0.15 : 0);
export const analogPinX = (i: number) => 1.75 + i * 0.254;
const powerPinX = (i: number) => -0.35 + i * 0.254;
const DIGITAL_Z = -2.35;
const POWER_Z = 2.35;

/** Local position of the top of a header socket on the board. */
export function unoPinPos(pin: number | '5V' | 'GND', near?: THREE.Vector3): THREE.Vector3 {
  const y = UNO_TOP + HEADER_H;
  if (pin === '5V') return new THREE.Vector3(powerPinX(3), y, POWER_Z);
  if (pin === 'GND') {
    const options = [new THREE.Vector3(digitalPinX(13) - 0.254, y, DIGITAL_Z), new THREE.Vector3(powerPinX(5), y, POWER_Z)];
    if (!near) return options[0];
    return options.reduce((a, b) => (a.distanceToSquared(near) < b.distanceToSquared(near) ? a : b));
  }
  if (pin >= 14) return new THREE.Vector3(analogPinX(pin - 14), y, POWER_Z);
  return new THREE.Vector3(digitalPinX(pin), y, DIGITAL_Z);
}

export interface BoardTerminal {
  key: string;
  label: string;
  kind: 'pin' | '5V' | 'GND';
  pin?: number;
  pos: THREE.Vector3; // local, top of the header socket
}

/** Every socket on the board a wire can plug into. Keys are pin numbers ("0"–"19") or power names. */
export const BOARD_TERMINALS: BoardTerminal[] = (() => {
  const y = UNO_TOP + HEADER_H;
  const out: BoardTerminal[] = [];
  for (let p = 0; p < 14; p++) out.push({ key: String(p), label: `Pin ${p}${[3, 5, 6, 9, 10, 11].includes(p) ? ' ~' : ''}`, kind: 'pin', pin: p, pos: new THREE.Vector3(digitalPinX(p), y, DIGITAL_Z) });
  for (let i = 0; i < 6; i++) out.push({ key: String(14 + i), label: `A${i}`, kind: 'pin', pin: 14 + i, pos: new THREE.Vector3(analogPinX(i), y, POWER_Z) });
  out.push({ key: 'GND', label: 'GND', kind: 'GND', pos: new THREE.Vector3(digitalPinX(13) - 0.254, y, DIGITAL_Z) });
  out.push({ key: '3V3', label: '3.3V', kind: '5V', pos: new THREE.Vector3(powerPinX(2), y, POWER_Z) });
  out.push({ key: '5V', label: '5V', kind: '5V', pos: new THREE.Vector3(powerPinX(3), y, POWER_Z) });
  out.push({ key: 'GND2', label: 'GND', kind: 'GND', pos: new THREE.Vector3(powerPinX(4), y, POWER_Z) });
  out.push({ key: 'GND3', label: 'GND', kind: 'GND', pos: new THREE.Vector3(powerPinX(5), y, POWER_Z) });
  return out;
})();

function unoSilkscreen(): THREE.CanvasTexture {
  const W = 1372, H = 1068; // 200 px per cm
  const px = (x: number) => (x + 3.43) * 200;
  const pz = (z: number) => (z + 2.67) * 200;
  const lines: Parameters<typeof textTexture>[0] = [];
  for (let p = 0; p <= 13; p++) {
    lines.push({ text: (p === 3 || p === 5 || p === 6 || p >= 9 && p <= 11 ? '~' : '') + p, x: px(digitalPinX(p)), y: pz(DIGITAL_Z) + 62, size: 26 });
  }
  lines.push({ text: 'GND', x: px(digitalPinX(13) - 0.254), y: pz(DIGITAL_Z) + 62, size: 18 });
  lines.push({ text: 'DIGITAL (PWM ~)', x: px(1.4), y: pz(DIGITAL_Z) + 112, size: 28 });
  for (let i = 0; i < 6; i++) lines.push({ text: 'A' + i, x: px(analogPinX(i)), y: pz(POWER_Z) - 62, size: 24 });
  lines.push({ text: 'ANALOG IN', x: px(2.38), y: pz(POWER_Z) - 112, size: 28 });
  ['IOREF', 'RST', '3V3', '5V', 'GND', 'GND', 'VIN'].forEach((t, i) => lines.push({ text: t, x: px(powerPinX(i)), y: pz(POWER_Z) - 62, size: 17 }));
  lines.push({ text: 'POWER', x: px(0.41), y: pz(POWER_Z) - 112, size: 28 });
  lines.push({ text: 'BUILDER', x: px(0.1), y: pz(-0.55), size: 96, weight: '800' });
  lines.push({ text: 'ONE', x: px(1.6), y: pz(0.25), size: 64, weight: '700' });
  lines.push({ text: 'L', x: px(-0.66), y: pz(-1.62), size: 30 });
  lines.push({ text: 'ON', x: px(2.95), y: pz(-0.6), size: 26 });
  const t = textTexture(lines, W, H, '#0e5d59');
  return t;
}

const uno: PartDef = {
  type: 'uno',
  name: 'Builder One',
  blurb: 'The microcontroller board that runs your code. Pins 0–13 are digital, A0–A5 read analog voltages.',
  noPins: true,
  terminals: () => [],
  build() {
    const g = new THREE.Group();
    const pcbTop = new THREE.MeshStandardMaterial({ map: unoSilkscreen(), roughness: 0.6 });
    const pcbSide = mat('#0a4643');
    const shape = new THREE.Shape();
    shape.moveTo(-3.43, -2.67);
    shape.lineTo(3.1, -2.67);
    shape.lineTo(3.43, -2.3);
    shape.lineTo(3.43, 2.67);
    shape.lineTo(-3.43, 2.67);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, UNO_TOP, 0);
    // map top-face UVs to the board rectangle
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 3.43) / 6.86, 1 - (pos.getZ(i) + 2.67) / 5.34);
    const pcb = new THREE.Mesh(geo, [pcbTop, pcbSide]);
    pcb.castShadow = pcb.receiveShadow = true;
    g.add(pcb);
    // standoffs
    for (const [x, z] of [[-2.9, -2.2], [2.9, -2.0], [-2.9, 2.2], [2.9, 2.2]]) g.add(at(cyl(0.18, 0.18, 0.3, M.dark, 12), x, 0.15, z));
    // headers
    const headerMat = mat('#1b1c20');
    const holeMat = mat('#050506');
    const addHeader = (x0: number, x1: number, z: number) => {
      const len = x1 - x0 + 0.254;
      g.add(at(box(len, HEADER_H, 0.26, headerMat, 0.02), (x0 + x1) / 2, UNO_TOP + HEADER_H / 2, z));
      for (let x = x0; x <= x1 + 0.01; x += 0.254) g.add(at(box(0.1, 0.02, 0.1, holeMat, 0), x, UNO_TOP + HEADER_H + 0.005, z));
    };
    addHeader(digitalPinX(7), digitalPinX(0), DIGITAL_Z);
    addHeader(digitalPinX(13) - 0.254 * 3, digitalPinX(8), DIGITAL_Z);
    addHeader(powerPinX(0) - 0.254, powerPinX(6), POWER_Z);
    addHeader(analogPinX(0), analogPinX(5), POWER_Z);
    // USB-B and power jack
    g.add(at(box(1.6, 1.1, 1.2, M.metal, 0.05), -3.0, UNO_TOP + 0.55, -1.2));
    g.add(at(box(1.4, 1.1, 0.9, M.black, 0.08), -3.0, UNO_TOP + 0.55, 1.75));
    // ATmega328P chip with legs
    g.add(at(box(3.6, 0.35, 0.75, mat('#202125', { roughness: 0.4 }), 0.03), 1.15, UNO_TOP + 0.4, 1.1));
    for (let i = 0; i < 14; i++) {
      for (const s of [-1, 1]) g.add(at(box(0.08, 0.2, 0.18, M.leg, 0), -0.5 + i * 0.254, UNO_TOP + 0.2, 1.1 + s * 0.45));
    }
    g.add(at(box(3.9, 0.12, 0.95, mat('#2a2b30'), 0.03), 1.15, UNO_TOP + 0.08, 1.1));
    // crystal, caps, reset button
    g.add(at(box(0.7, 0.35, 0.3, M.metal, 0.12), -0.9, UNO_TOP + 0.18, 0.15));
    for (const [x, z] of [[-1.9, 0.9], [-1.4, 0.9]]) {
      g.add(at(cyl(0.3, 0.3, 0.8, mat('#2b2d33'), 16), x, UNO_TOP + 0.4, z));
      g.add(at(cyl(0.29, 0.29, 0.02, M.metal, 16), x, UNO_TOP + 0.81, z));
    }
    g.add(at(box(0.6, 0.25, 0.6, M.metal, 0.04), -2.9, UNO_TOP + 0.13, -2.3));
    g.add(at(cyl(0.18, 0.18, 0.18, mat('#c0392b'), 16), -2.9, UNO_TOP + 0.33, -2.3));
    // built-in "L" LED (pin 13) and power LED
    const lMat = mat('#ffd36b', { emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0 });
    g.add(at(box(0.22, 0.12, 0.14, lMat, 0.02), -0.95, UNO_TOP + 0.06, -1.62));
    const lGlow = glowSprite('#ffb020', 1.6);
    lGlow.position.set(-0.95, UNO_TOP + 0.2, -1.62);
    g.add(lGlow);
    const onMat = mat('#9be59b', { emissive: new THREE.Color('#2ecc40'), emissiveIntensity: 0 });
    g.add(at(box(0.22, 0.12, 0.14, onMat, 0.02), 2.5, UNO_TOP + 0.06, -0.6));
    const onGlow = glowSprite('#2ecc40', 1.2);
    onGlow.position.set(2.5, UNO_TOP + 0.2, -0.6);
    g.add(onGlow);
    g.userData.leds = { lMat, lGlow, onMat, onGlow };
    return g;
  },
  update(part, board, ctx) {
    const { lMat, lGlow, onMat, onGlow } = part.group!.userData.leds;
    const l = ctx.running ? board.level(13) : 0;
    lMat.emissiveIntensity = l * 6;
    lGlow.material.opacity = l;
    onMat.emissiveIntensity = ctx.running ? 1.5 : 0;
    onGlow.material.opacity = ctx.running ? 0.6 : 0;
  },
};

// ---------- parts ----------
const led: PartDef = {
  type: 'led',
  name: 'LED',
  blurb: 'Light-emitting diode with a 220Ω resistor. HIGH turns it on; analogWrite() on a ~ pin sets brightness.',
  defaults: { color: 'red' },
  props: [{ key: 'color', label: 'Color', type: 'select', options: Object.keys(LED_COLORS).map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) })) }],
  terminals: () => [
    { key: 'pin', label: 'Signal', kind: 'signal', pwm: true, pos: [-0.5, 0.5, -0.55] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [0.5, 0.5, -0.55] },
  ],
  build(part) {
    const g = new THREE.Group();
    g.add(breadboard(1.8, 1.6));
    const l = makeLed(LED_COLORS[part.props.color] ?? LED_COLORS.red);
    l.group.position.set(0, 0.5, 0.15);
    g.add(l.group);
    g.add(at(resistor(), -0.25, 0.62, -0.4));
    g.userData.led = l;
    return g;
  },
  update(part, board, ctx) {
    const level = ctx.running ? board.level(part.pins.pin) : 0;
    part.state.level = level;
    setLed(part.group!.userData.led, level);
  },
};

const rgbLed: PartDef = {
  type: 'rgb',
  name: 'RGB LED',
  blurb: 'Three LEDs (red, green, blue) in one. Mix colors with analogWrite() on three ~ pins.',
  terminals: () => [
    { key: 'r', label: 'Red', kind: 'signal', pwm: true, pos: [row(4, 0), 0.5, -0.6] },
    { key: 'g', label: 'Green', kind: 'signal', pwm: true, pos: [row(4, 1), 0.5, -0.6] },
    { key: 'b', label: 'Blue', kind: 'signal', pwm: true, pos: [row(4, 2), 0.5, -0.6] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 3), 0.5, -0.6] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.0, 1.6));
    const l = makeLed('#f2f2f2', true);
    l.group.position.set(0, 0.5, 0.2);
    l.group.scale.setScalar(1.2);
    g.add(l.group);
    g.userData.led = l;
    return g;
  },
  update(part, board, ctx) {
    const r = ctx.running ? board.level(part.pins.r) : 0;
    const gr = ctx.running ? board.level(part.pins.g) : 0;
    const b = ctx.running ? board.level(part.pins.b) : 0;
    const max = Math.max(r, gr, b);
    part.state.rgb = [r, gr, b];
    const color = max > 0 ? new THREE.Color(r / max, gr / max, b / max) : new THREE.Color(1, 1, 1);
    setLed(part.group!.userData.led, max, color);
  },
};

const button: PartDef = {
  type: 'button',
  name: 'Push Button',
  blurb: 'Press and hold it in the scene. "Pull-down" wiring reads HIGH when pressed; "to GND" wiring needs INPUT_PULLUP and reads LOW when pressed.',
  defaults: { wiring: 'pulldown', color: '#e74c3c' },
  props: [
    { key: 'wiring', label: 'Wiring', type: 'select', options: [
      { value: 'pulldown', label: '5V + pull-down resistor (pressed = HIGH)' },
      { value: 'pullup', label: 'To GND (use INPUT_PULLUP, pressed = LOW)' },
    ] },
    { key: 'color', label: 'Cap', type: 'select', options: [
      { value: '#e74c3c', label: 'Red' }, { value: '#3b82c4', label: 'Blue' }, { value: '#f1c40f', label: 'Yellow' }, { value: '#2ecc71', label: 'Green' }, { value: '#222', label: 'Black' },
    ] },
  ],
  terminals: part => [
    { key: 'pin', label: 'Signal', kind: 'signal', pos: [-0.5, 0.5, -0.75] },
    part.props.wiring === 'pullup'
      ? { key: 'gnd', label: 'GND', kind: 'GND', pos: [0.5, 0.5, -0.75] }
      : { key: 'vcc', label: '5V', kind: '5V', pos: [0.5, 0.5, -0.75] },
  ],
  build(part) {
    const g = new THREE.Group();
    g.add(breadboard(1.9, 1.9));
    g.add(at(box(1.2, 0.45, 1.2, M.black, 0.06), 0, 0.72, 0.1));
    for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.6], [0.5, 0.6]]) g.add(at(cyl(0.1, 0.1, 0.06, M.metal, 12), x, 0.96, z));
    const cap = cyl(0.36, 0.38, 0.35, mat(part.props.color ?? '#e74c3c'), 28);
    cap.position.set(0, 1.12, 0.1);
    cap.userData.action = 'press';
    g.add(cap);
    if (part.props.wiring !== 'pullup') g.add(at(resistor(), 0.1, 0.62, -0.62));
    g.userData.cap = cap;
    return g;
  },
  update(part) {
    part.group!.userData.cap.position.y = part.state.pressed ? 1.0 : 1.12;
  },
  listener(part) {
    return {
      readDigital(pin, board) {
        if (pin !== part.pins.pin) return undefined;
        if (part.props.wiring === 'pullup') {
          if (part.state.pressed) return 0;
          if (board.pins[pin].mode !== 'INPUT_PULLUP') {
            board.hint('pullup', 'This button is wired to GND, so use pinMode(pin, INPUT_PULLUP). Without the pull-up the input floats and reads random values.');
          }
          return undefined;
        }
        return part.state.pressed ? 1 : 0;
      },
    };
  },
};

function knobPart(type: string, name: string, blurb: string, key: string, def: number, min: number, max: number, unit: string, analogFn: (v: number) => number, buildBody: (g: THREE.Group, part: Part) => void, updateBody?: (part: Part) => void): PartDef {
  return {
    type,
    name,
    blurb,
    defaults: { [key]: def },
    props: [{ key, label: name === 'Potentiometer' ? 'Knob position' : name === 'Light Sensor' ? 'Light level' : 'Temperature', type: 'range', min, max, step: 1, unit }],
    knob: { key, min, max, perPixel: (max - min) / 200 },
    terminals: () => [
      { key: 'vcc', label: '5V', kind: '5V', pos: [row(3, 0), 0.5, -0.75] },
      { key: 'sig', label: 'Signal', kind: 'signal', analog: true, pos: [row(3, 1), 0.5, -0.75] },
      { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 2), 0.5, -0.75] },
    ],
    build(part) {
      const g = new THREE.Group();
      g.add(breadboard(1.9, 1.9));
      buildBody(g, part);
      return g;
    },
    update: updateBody ? part => updateBody(part) : undefined,
    listener(part) {
      return {
        readAnalog(pin) {
          if (pin !== part.pins.sig) return undefined;
          return analogFn(part.props[key]);
        },
      };
    },
  };
}

const pot = knobPart(
  'pot', 'Potentiometer', 'A knob that outputs 0–1023 on analogRead(). Drag the knob up/down in the scene.',
  'value', 512, 0, 1023, '', v => v,
  g => {
    g.add(at(box(1.2, 0.5, 1.2, mat('#2f6fb6'), 0.06), 0, 0.75, 0.1));
    g.add(at(cyl(0.22, 0.22, 0.25, M.metal, 16), 0, 1.1, 0.1));
    const knob = new THREE.Group();
    knob.position.set(0, 1.2, 0.1);
    const k = cyl(0.42, 0.45, 0.45, mat('#2b2c31'), 20);
    k.position.y = 0.22;
    k.userData.action = 'knob';
    knob.add(k);
    const mark = box(0.08, 0.04, 0.34, mat('#ffffff'), 0);
    mark.position.set(0, 0.46, -0.2);
    mark.userData.action = 'knob';
    knob.add(mark);
    g.add(knob);
    g.userData.knob = knob;
  },
  part => { part.group!.userData.knob.rotation.y = -((part.props.value / 1023) * 270 - 135) * (Math.PI / 180); },
);

const ldr = knobPart(
  'ldr', 'Light Sensor', 'Photoresistor in a voltage divider: brighter light gives a higher analogRead() value. Drag it up/down to change the light.',
  'light', 70, 0, 100, '%', v => 15 + v * 9.5,
  g => {
    g.add(at(cyl(0.05, 0.05, 0.6, M.leg, 6), -0.15, 0.8, 0.1));
    g.add(at(cyl(0.05, 0.05, 0.6, M.leg, 6), 0.15, 0.8, 0.1));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f0d9a8';
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#c0392b';
    x.lineWidth = 8;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      x.moveTo(22, 20 + i * 17);
      x.lineTo(106, 20 + i * 17);
    }
    x.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#fff2c0'), emissiveIntensity: 0 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.15, 28), [mat('#d9c08a'), faceMat, mat('#d9c08a')]);
    disc.position.set(0, 1.15, 0.1);
    disc.castShadow = true;
    disc.userData.action = 'knob';
    g.add(disc);
    g.add(at(resistor(), 0.1, 0.62, -0.62));
    const sun = glowSprite('#ffe9a0', 3.2);
    sun.position.set(0, 1.4, 0.1);
    g.add(sun);
    g.userData.face = faceMat;
    g.userData.sun = sun;
  },
  part => {
    const v = part.props.light / 100;
    part.group!.userData.face.emissiveIntensity = v * 0.6;
    part.group!.userData.sun.material.opacity = v * 0.7;
  },
);

const tmp36 = knobPart(
  'temp', 'Temperature Sensor', 'TMP36: outputs 0.5 V at 0 °C plus 10 mV per °C. Drag it up/down to change the temperature.',
  'temp', 22, -40, 125, '°C', t => ((0.5 + t / 100) / 5) * 1023,
  g => {
    for (const x of [-0.18, 0, 0.18]) g.add(at(cyl(0.04, 0.04, 0.7, M.leg, 6), x, 0.85, 0.1));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.75, 24, 1, false, -Math.PI / 2, Math.PI), M.black);
    body.position.set(0, 1.45, 0.05);
    body.castShadow = true;
    body.userData.action = 'knob';
    g.add(body);
    const face = at(box(0.8, 0.75, 0.02, M.dark, 0), 0, 1.45, 0.05);
    face.userData.action = 'knob';
    g.add(face);
  },
);

const buzzer: PartDef = {
  type: 'buzzer',
  name: 'Piezo Buzzer',
  blurb: 'Makes sound with tone(pin, frequency). noTone(pin) stops it.',
  terminals: () => [
    { key: 'pin', label: 'Signal', kind: 'signal', pos: [-0.5, 0.5, -0.75] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [0.5, 0.5, -0.75] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(1.9, 1.9));
    const body = new THREE.Group();
    body.position.set(0, 0.5, 0.1);
    body.add(at(cyl(0.75, 0.75, 0.75, M.black, 32), 0, 0.38, 0));
    body.add(at(cyl(0.12, 0.12, 0.02, mat('#000'), 16), 0, 0.76, 0));
    body.add(at(cyl(0.5, 0.5, 0.02, mat('#33343a'), 32), 0, 0.755, 0));
    g.add(body);
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: '#f39c34', transparent: true, opacity: 0 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(0, 1.35, 0.1);
      g.add(r);
      rings.push(r);
    }
    g.userData.body = body;
    g.userData.rings = rings;
    return g;
  },
  update(part, board, ctx) {
    const freq = ctx.running ? board.activeTone(part.pins.pin) : null;
    // a plain digitalWrite(HIGH) on a passive buzzer just clicks; treat it as silent
    part.state.freq = freq;
    ctx.audio.set(part.id, freq);
    const { body, rings } = part.group!.userData;
    part.state.phase = (part.state.phase ?? 0) + ctx.dt * (freq ? 1.2 : 0);
    body.position.x = freq ? Math.sin(performance.now() * 0.08) * 0.02 : 0;
    rings.forEach((r: THREE.Mesh, i: number) => {
      const t = (part.state.phase + i / 3) % 1;
      r.scale.setScalar(0.6 + t * 1.6);
      (r.material as THREE.MeshBasicMaterial).opacity = freq ? (1 - t) * 0.8 : 0;
    });
  },
};

const ultrasonic: PartDef = {
  type: 'ultrasonic',
  name: 'Ultrasonic Sensor',
  blurb: 'HC-SR04: pulse TRIG for 10µs, then pulseIn(ECHO, HIGH) returns the echo time. cm = duration / 58. Faces the direction its "eyes" point.',
  defaults: { distance: 200 },
  props: [{ key: 'distance', label: 'Distance when nothing is in front', type: 'range', min: 2, max: 400, step: 1, unit: 'cm' }],
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(4, 0, 0.5), 0.5, -0.5] },
    { key: 'trig', label: 'TRIG', kind: 'signal', pos: [row(4, 1, 0.5), 0.5, -0.5] },
    { key: 'echo', label: 'ECHO', kind: 'signal', pos: [row(4, 2, 0.5), 0.5, -0.5] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 3, 0.5), 0.5, -0.5] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(4.8, 1.6));
    g.add(at(box(4.5, 2.0, 0.16, mat('#2d5eaa'), 0.04), 0, 1.6, 0.1));
    for (const x of [-1.25, 1.25]) {
      const can = cyl(0.8, 0.8, 1.2, M.metal, 32);
      can.rotation.x = Math.PI / 2;
      can.position.set(x, 1.6, 0.75);
      g.add(can);
      const mesh = cyl(0.68, 0.68, 0.02, mat('#2a2b2f', { roughness: 0.95 }), 32);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, 1.6, 1.36);
      g.add(mesh);
    }
    g.add(at(box(0.55, 0.3, 0.2, M.metal, 0.08), 0, 2.3, 0.25));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.04, 0.04, 0.55, M.leg, 6), row(4, i, 0.5), 0.75, 0.1));
    const beamMat = new THREE.MeshBasicMaterial({ color: '#25b4b0', transparent: true, opacity: 0, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), beamMat);
    g.add(beam);
    const label = labelSprite('— cm', 0.9);
    label.visible = false;
    g.add(label);
    g.userData.beam = beam;
    g.userData.label = label;
    return g;
  },
  update(part, _board, ctx) {
    const g = part.group!;
    // raycast from the transducers along the sensor's facing direction
    const origin = new THREE.Vector3(0, 1.6, 1.4).applyMatrix4(g.matrixWorld);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(g.matrixWorld);
    const ray = new THREE.Raycaster(origin, dir, 0, 400);
    const hits = ray.intersectObjects(ctx.obstacles.filter(o => o !== g), true);
    const hit = hits[0];
    const dist = hit ? Math.max(2, hit.distance) : part.props.distance;
    part.state.distance = dist;
    const { beam, label } = g.userData;
    const show = ctx.running && performance.now() - (part.state.lastPing ?? -1e9) < 400;
    const len = Math.min(dist, 60);
    beam.scale.set(2.2, 1, len);
    beam.position.set(0, 1.6, 1.4 + len / 2);
    beam.material.opacity = show ? 0.18 : 0;
    label.visible = show;
    if (show) {
      label.position.set(0, 3.2, 1.4 + Math.min(len, 12) / 2);
      const text = hit ? `${dist.toFixed(1)} cm` : `${Math.round(dist)} cm`;
      if (label.userData.text !== text) { label.userData.setText(text); label.userData.text = text; }
    }
  },
  listener(part) {
    return {
      onWrite(pin, value) {
        if (pin !== part.pins.trig) return;
        if (value) part.state.trigHigh = true;
        else if (part.state.trigHigh) { part.state.trigHigh = false; part.state.armed = true; }
      },
      pulse(pin, level, board) {
        if (pin !== part.pins.echo || !level) return undefined;
        if (!part.state.armed) {
          board.hint('trig', 'The sensor only answers after a trigger pulse: digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW); then pulseIn(ECHO, HIGH).');
          return undefined;
        }
        if (board.pins[pin].mode === 'OUTPUT') board.hint('echomode', 'The ECHO pin should be an INPUT: pinMode(ECHO, INPUT).');
        part.state.armed = false;
        part.state.lastPing = performance.now();
        const d = part.state.distance ?? part.props.distance;
        if (d > 400) return undefined; // out of range: no echo
        return d * 58.3 + (Math.random() - 0.5) * 20;
      },
    };
  },
};

const servo: PartDef = {
  type: 'servo',
  name: 'Servo Motor',
  blurb: 'Turns to an angle from 0° to 180°. Use #include <Servo.h>, myServo.attach(pin) and myServo.write(angle).',
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-0.35, 0.35, -1.0] },
    { key: 'vcc', label: '5V', kind: '5V', pos: [0, 0.35, -1.0] },
    { key: 'sig', label: 'Signal', kind: 'signal', pos: [0.35, 0.35, -1.0] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(2.3, 2.0, 1.25, M.servoBlue, 0.08), 0, 1.0, 0));
    g.add(at(box(3.3, 0.2, 1.25, M.servoBlue, 0.04), 0, 1.5, 0));
    for (const x of [-1.4, 1.4]) g.add(at(cyl(0.12, 0.12, 0.22, mat('#11141b'), 12), x, 1.5, 0));
    g.add(at(cyl(0.6, 0.6, 0.25, M.servoBlue, 24), -0.5, 2.1, 0));
    g.add(at(cyl(0.18, 0.18, 0.25, M.white, 16), -0.5, 2.3, 0));
    g.add(at(box(0.8, 0.3, 0.25, mat('#333'), 0.04), 0, 0.35, -0.7));
    const horn = new THREE.Group();
    horn.position.set(-0.5, 2.45, 0);
    const arm = new THREE.Shape();
    arm.moveTo(-0.25, 0);
    arm.absarc(0, 0, 0.32, Math.PI, 0, false);
    arm.lineTo(0.14, 1.6);
    arm.absarc(0, 1.6, 0.14, 0, Math.PI, false);
    arm.closePath();
    const armGeo = new THREE.ExtrudeGeometry(arm, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    armGeo.rotateX(-Math.PI / 2);
    armGeo.rotateY(Math.PI);
    const armMesh = new THREE.Mesh(armGeo, M.white);
    armMesh.castShadow = true;
    horn.add(armMesh);
    g.add(horn);
    g.userData.horn = horn;
    return g;
  },
  update(part, board, ctx) {
    const target = ctx.running ? board.servoAngles.get(part.pins.sig ?? -1) : undefined;
    const cur = part.state.angle ?? 90;
    let next = cur;
    if (target !== undefined) {
      const maxStep = 600 * ctx.simDt; // ~0.1 s per 60°
      next = cur + Math.max(-maxStep, Math.min(maxStep, target - cur));
    }
    part.state.angle = next;
    part.group!.userData.horn.rotation.y = ((next - 90) * Math.PI) / 180;
  },
};

const motor: PartDef = {
  type: 'motor',
  name: 'DC Motor',
  blurb: 'Spins a fan. Wired through a transistor driver, so digitalWrite() turns it on and analogWrite() on a ~ pin sets the speed.',
  terminals: () => [
    { key: 'pin', label: 'Signal', kind: 'signal', pwm: true, pos: [-0.4, 0.5, -1.0] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [0.4, 0.5, -1.0] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.6, 2.2));
    g.add(at(box(0.6, 0.35, 0.3, M.black, 0.04), -0.7, 0.68, -0.55)); // transistor
    const can = cyl(0.8, 0.8, 2.0, M.metal, 28);
    can.rotation.z = Math.PI / 2;
    can.position.set(-0.1, 1.35, 0.25);
    g.add(can);
    const cap = cyl(0.65, 0.65, 0.2, mat('#2b2c31'), 28);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(-1.15, 1.35, 0.25);
    g.add(cap);
    const shaft = cyl(0.07, 0.07, 0.5, M.metal, 8);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(1.15, 1.35, 0.25);
    g.add(shaft);
    const fan = new THREE.Group();
    fan.position.set(1.4, 1.35, 0.25);
    const bladeMat = mat('#f39c34');
    for (let i = 0; i < 3; i++) {
      const blade = box(0.08, 1.4, 0.45, bladeMat, 0.04);
      blade.position.y = 0.75;
      const holder = new THREE.Group();
      holder.rotation.x = (i * Math.PI * 2) / 3;
      blade.rotation.y = 0.35;
      holder.add(blade);
      fan.add(holder);
    }
    const hub = cyl(0.2, 0.2, 0.3, mat('#d35400'), 16);
    hub.rotation.z = Math.PI / 2;
    fan.add(hub);
    g.add(fan);
    g.userData.fan = fan;
    return g;
  },
  update(part, board, ctx) {
    const level = ctx.running ? board.level(part.pins.pin) : 0;
    part.state.speed = level;
    const cur = part.state.rpm ?? 0;
    const target = level * 18;
    part.state.rpm = cur + (target - cur) * Math.min(1, ctx.dt * 3); // spin-up inertia
    part.group!.userData.fan.rotation.x += part.state.rpm * ctx.dt;
  },
};

const trafficLight: PartDef = {
  type: 'traffic',
  name: 'Traffic Light',
  blurb: 'Red, yellow and green LEDs in one module, each on its own pin.',
  terminals: () => [
    { key: 'r', label: 'Red', kind: 'signal', pos: [row(4, 0), 0.5, -0.6] },
    { key: 'y', label: 'Yellow', kind: 'signal', pos: [row(4, 1), 0.5, -0.6] },
    { key: 'g', label: 'Green', kind: 'signal', pos: [row(4, 2), 0.5, -0.6] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 3), 0.5, -0.6] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.0, 1.6));
    g.add(at(box(1.1, 3.0, 0.45, M.black, 0.12), 0, 2.0, 0.2));
    const lamps: any[] = [];
    ['#ff3b30', '#ffc107', '#34c759'].forEach((c, i) => {
      const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.2, emissive: new THREE.Color(c), emissiveIntensity: 0 });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), m);
      s.scale.z = 0.6;
      s.position.set(0, 3.0 - i * 0.95, 0.45);
      g.add(s);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24, 1, true, -Math.PI / 2, Math.PI), M.black);
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, 3.0 - i * 0.95, 0.55);
      g.add(visor);
      const glow = glowSprite(c, 2.2);
      glow.position.set(0, 3.0 - i * 0.95, 0.65);
      g.add(glow);
      lamps.push({ bodyMat: m, glow });
    });
    g.userData.lamps = lamps;
    return g;
  },
  update(part, board, ctx) {
    const keys = ['r', 'y', 'g'];
    part.state.levels = keys.map(k => (ctx.running ? board.level(part.pins[k]) : 0));
    part.group!.userData.lamps.forEach((l: any, i: number) => setLed(l, part.state.levels[i]));
  },
};

const car: PartDef = {
  type: 'car',
  name: 'Toy Car',
  blurb: 'An obstacle. Drag it in front of the ultrasonic sensor to change the measured distance.',
  noPins: true,
  obstacle: true,
  defaults: { color: '#e8553d' },
  props: [{ key: 'color', label: 'Color', type: 'select', options: [
    { value: '#e8553d', label: 'Red' }, { value: '#3b82c4', label: 'Blue' }, { value: '#f1c40f', label: 'Yellow' }, { value: '#27ae60', label: 'Green' },
  ] }],
  terminals: () => [],
  build(part) {
    const g = new THREE.Group();
    const paint = mat(part.props.color ?? '#e8553d', { roughness: 0.4 });
    g.add(at(box(2.4, 1.0, 4.6, paint, 0.35), 0, 1.0, 0));
    g.add(at(box(2.1, 0.9, 2.3, paint, 0.35), 0, 1.8, -0.3));
    const glass = mat('#2c3e50', { roughness: 0.2 });
    g.add(at(box(2.15, 0.55, 2.0, glass, 0.2), 0, 1.85, -0.3));
    const wheelMat = mat('#2b2b2b');
    for (const x of [-1.2, 1.2]) for (const z of [-1.5, 1.5]) {
      const w = cyl(0.55, 0.55, 0.4, wheelMat, 20);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.55, z);
      g.add(w);
      const hub = cyl(0.25, 0.25, 0.42, M.metal, 12);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, 0.55, z);
      g.add(hub);
    }
    for (const x of [-0.75, 0.75]) g.add(at(box(0.45, 0.25, 0.1, mat('#fff7d6', { emissive: new THREE.Color('#fff2b0'), emissiveIntensity: 0.4 }), 0.05), x, 1.1, 2.3));
    return g;
  },
};

// ---------- more parts ----------
const LCD_W = 512, LCD_H = 128;

function drawLcd(canvas: HTMLCanvasElement, lines: string[] | null, cols: number, rows: number, backlight: boolean, uninit: boolean) {
  const g = canvas.getContext('2d')!;
  g.fillStyle = backlight ? '#9fd13f' : '#4e6420';
  g.fillRect(0, 0, LCD_W, LCD_H);
  const cw = (LCD_W - 24) / cols, ch = (LCD_H - 20) / rows;
  g.font = `600 ${Math.floor(ch * 0.78)}px "IBM Plex Mono", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 12 + c * cw, y = 10 + r * ch;
      // faint pixel cells, or solid blocks on the top row before init (just like a real HD44780)
      g.fillStyle = uninit && r === 0 ? 'rgba(20,35,8,0.75)' : backlight ? 'rgba(40,70,10,0.10)' : 'rgba(0,0,0,0.12)';
      g.fillRect(x + 2, y + 3, cw - 4, ch - 6);
      const chr = lines?.[r]?.[c];
      if (chr && chr !== ' ') {
        g.fillStyle = backlight ? '#1b2a0a' : '#121a06';
        g.fillText(chr, x + cw / 2, y + ch / 2 + 1);
      }
    }
  }
}

const lcd: PartDef = {
  type: 'lcd',
  name: 'LCD 16×2 (I2C)',
  blurb: 'Shows two rows of 16 characters. Wire SDA to A4 and SCL to A5, then use the LiquidCrystal_I2C library: lcd.init(), lcd.backlight(), lcd.setCursor(col, row), lcd.print().',
  defaults: { addr: '39' },
  props: [{ key: 'addr', label: 'I2C address', type: 'select', options: [{ value: '39', label: '0x27 (most common)' }, { value: '63', label: '0x3F' }] }],
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-4.35, 0.9, -0.38] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-4.35, 0.9, -0.13] },
    { key: 'sda', label: 'SDA', kind: 'signal', analog: true, pos: [-4.35, 0.9, 0.12] },
    { key: 'scl', label: 'SCL', kind: 'signal', analog: true, pos: [-4.35, 0.9, 0.37] },
  ],
  build() {
    const g = new THREE.Group();
    for (const [x, z] of [[-3.6, -1.6], [3.6, -1.6], [-3.6, 1.6], [3.6, 1.6]]) g.add(at(cyl(0.15, 0.15, 0.6, M.metal, 10), x, 0.3, z));
    g.add(at(box(8.0, 0.16, 3.6, mat('#1e7a3a'), 0.05), 0, 0.68, 0));
    g.add(at(box(7.1, 0.35, 2.5, M.black, 0.08), 0.1, 0.93, 0));
    const canvas = document.createElement('canvas');
    canvas.width = LCD_W;
    canvas.height = LCD_H;
    drawLcd(canvas, null, 16, 2, false, false);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const screenMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.3 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.7), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(0.1, 1.115, 0);
    g.add(screen);
    // I2C backpack header
    g.add(at(box(0.3, 0.5, 1.2, M.black, 0.03), -4.25, 0.6, 0));
    for (const z of [-0.38, -0.13, 0.12, 0.37]) g.add(at(cyl(0.04, 0.04, 0.5, M.gold, 6), -4.35, 0.8, z));
    g.userData.lcd = { canvas, tex, screenMat, key: '' };
    return g;
  },
  update(part, board, ctx) {
    const u = part.group!.userData.lcd;
    const wired = part.pins.sda === 18 && part.pins.scl === 19;
    const addr = Number(part.props.addr);
    const st = ctx.running && wired ? board.lcds.get(addr) : undefined;
    part.state.problem = !ctx.running ? '' : !wired ? 'Wire SDA to A4 and SCL to A5 — those are the board’s I2C pins.' : !st ? `No sketch is talking to address 0x${addr.toString(16).toUpperCase()} yet.` : '';
    const on = ctx.running; // powered and sketch running
    const backlight = !!st?.backlight;
    const uninit = on && !st?.begun;
    const lines = st?.display ? st.lines : null;
    const key = `${on}|${backlight}|${uninit}|${lines?.join('\n')}`;
    if (key !== u.key) {
      u.key = key;
      drawLcd(u.canvas, lines, st?.cols ?? 16, st?.rows ?? 2, backlight, uninit);
      u.tex.needsUpdate = true;
      u.screenMat.emissiveIntensity = backlight ? 0.55 : 0;
    }
  },
  readout: part => (part.state.problem ? `<span class="warn-inline">${part.state.problem}</span>` : ''),
};

// segment layout on the display face (x, z, horizontal?)
const SEGMENTS: Record<string, [number, number, boolean]> = {
  a: [0, -0.75, true], b: [0.38, -0.38, false], c: [0.38, 0.38, false], d: [0, 0.75, true],
  e: [-0.38, 0.38, false], f: [-0.38, -0.38, false], g: [0, 0, true],
};
const SEG_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

const sevenSeg: PartDef = {
  type: 'seg7',
  name: '7-Segment Display',
  blurb: 'Shows a digit using 7 LED bars named a–g (plus a dot, dp). Common cathode: HIGH lights a segment.',
  defaults: { color: '#ff3b30' },
  props: [{ key: 'color', label: 'Color', type: 'select', options: [{ value: '#ff3b30', label: 'Red' }, { value: '#34c759', label: 'Green' }, { value: '#2f7bff', label: 'Blue' }, { value: '#ffc107', label: 'Amber' }] }],
  terminals: () => [
    ...SEG_KEYS.map((k, i) => ({ key: k, label: k === 'dp' ? 'DP (dot)' : `Segment ${k}`, kind: 'signal' as const, pos: [row(9, i, 0.36), 0.5, -1.05] as [number, number, number] })),
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(9, 8, 0.36), 0.5, -1.05] },
  ],
  build(part) {
    const g = new THREE.Group();
    g.add(breadboard(3.6, 2.6));
    g.add(at(box(1.7, 0.5, 2.1, mat('#1d1e22'), 0.06), 0, 0.75, 0.2));
    const segs: Record<string, THREE.MeshStandardMaterial> = {};
    const color = new THREE.Color(part.props.color ?? '#ff3b30');
    for (const k of SEG_KEYS) {
      const m = new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.25), emissive: color, emissiveIntensity: 0, roughness: 0.5 });
      let mesh: THREE.Mesh;
      if (k === 'dp') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), m);
        mesh.position.set(0.62, 1.01, 0.95);
      } else {
        const [x, z, horiz] = SEGMENTS[k];
        mesh = new THREE.Mesh(new RoundedBoxGeometry(horiz ? 0.6 : 0.14, 0.04, horiz ? 0.14 : 0.62, 1, 0.05), m);
        // slight italic slant like real displays
        mesh.position.set(x - z * 0.12, 1.01, z + 0.2);
        if (!horiz) mesh.rotation.y = 0.12;
      }
      g.add(mesh);
      segs[k] = m;
    }
    g.userData.segs = segs;
    return g;
  },
  update(part, board, ctx) {
    const segs = part.group!.userData.segs;
    let lit = '';
    for (const k of SEG_KEYS) {
      const l = ctx.running ? board.level(part.pins[k]) : 0;
      segs[k].emissiveIntensity = l * 6;
      if (l > 0.5) lit += k;
    }
    part.state.lit = lit;
  },
  readout: part => `Lit segments: <b>${part.state.lit || 'none'}</b>`,
};

const pir: PartDef = {
  type: 'pir',
  name: 'Motion Sensor (PIR)',
  blurb: 'Senses movement of warm bodies. OUT goes HIGH for a few seconds after motion. Click the dome, or drag the car past it, to make motion.',
  defaults: { hold: 3 },
  props: [{ key: 'hold', label: 'Stays HIGH for', type: 'range', min: 1, max: 10, step: 1, unit: ' s' }],
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(3, 0, 0.5), 0.5, -1.0] },
    { key: 'out', label: 'OUT', kind: 'signal', pos: [row(3, 1, 0.5), 0.5, -1.0] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 2, 0.5), 0.5, -1.0] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.8, 2.6));
    g.add(at(box(2.4, 0.14, 2.4, mat('#1e7a3a'), 0.04), 0, 1.0, 0.1));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.04, 0.04, 0.5, M.gold, 6), row(3, i, 0.5), 0.75, -0.9));
    const domeMat = new THREE.MeshPhysicalMaterial({ color: '#f6f4ee', roughness: 0.55, transmission: 0.1, emissive: new THREE.Color('#ff6a4d'), emissiveIntensity: 0, flatShading: true });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(0, 1.07, 0.1);
    dome.castShadow = true;
    dome.userData.action = 'press';
    g.add(dome);
    const ledMat = mat('#ff5040', { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0 });
    g.add(at(box(0.18, 0.1, 0.12, ledMat, 0.02), 0.95, 1.12, 1.05));
    g.userData.pir = { domeMat, ledMat };
    return g;
  },
  update(part, _board, ctx) {
    const now = performance.now();
    if (part.state.pressed) part.state.motionUntil = now + part.props.hold * 1000;
    // moving obstacles nearby count as motion
    const here = new THREE.Vector3(part.x, 0, part.z);
    const last: Record<string, string> = (part.state.seen ??= {});
    for (const o of ctx.obstacles) {
      const key = `${o.position.x.toFixed(1)},${o.position.z.toFixed(1)}`;
      if (last[o.uuid] && last[o.uuid] !== key && o.position.distanceTo(here) < 25) part.state.motionUntil = now + part.props.hold * 1000;
      last[o.uuid] = key;
    }
    const active = ctx.running && now < (part.state.motionUntil ?? 0);
    part.state.motion = active;
    const { domeMat, ledMat } = part.group!.userData.pir;
    domeMat.emissiveIntensity = active ? 0.25 : 0;
    ledMat.emissiveIntensity = active ? 2 : 0;
  },
  listener(part) {
    return { readDigital: pin => (pin === part.pins.out ? (part.state.motion ? 1 : 0) : undefined) };
  },
  readout: part => (part.state.motion ? '<b>Motion detected</b> (OUT is HIGH)' : 'No motion. Click the dome to wave at it.'),
};

const joystick: PartDef = {
  type: 'joystick',
  name: 'Joystick',
  blurb: 'Two knobs in one: VRx and VRy give 0–1023 on analogRead() (512 in the middle). Drag the stick to move it; click it to press SW (use INPUT_PULLUP; pressed reads LOW).',
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(5, 0, 0.4), 0.5, -1.3] },
    { key: 'vcc', label: '+5V', kind: '5V', pos: [row(5, 1, 0.4), 0.5, -1.3] },
    { key: 'vrx', label: 'VRx', kind: 'signal', analog: true, pos: [row(5, 2, 0.4), 0.5, -1.3] },
    { key: 'vry', label: 'VRy', kind: 'signal', analog: true, pos: [row(5, 3, 0.4), 0.5, -1.3] },
    { key: 'sw', label: 'SW', kind: 'signal', pos: [row(5, 4, 0.4), 0.5, -1.3] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(3.0, 3.2));
    g.add(at(box(2.6, 0.14, 2.6, mat('#1f1f24'), 0.04), 0, 0.85, 0.2));
    for (let i = 0; i < 5; i++) g.add(at(cyl(0.035, 0.035, 0.4, M.gold, 6), row(5, i, 0.4), 0.68, -1.2));
    g.add(at(box(1.7, 0.7, 1.7, mat('#2a2b30'), 0.1), 0, 1.27, 0.2));
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.65, 0.2);
    pivot.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3a3b42')), 0, 0, 0));
    const shaft = cyl(0.16, 0.16, 1.0, mat('#3a3b42'), 12);
    shaft.position.y = 0.5;
    pivot.add(shaft);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.45, 1.2, 3, 0.2), mat('#2b2c31', { roughness: 0.8 }));
    cap.position.y = 1.1;
    cap.castShadow = true;
    cap.userData.action = 'stick';
    pivot.add(cap);
    g.add(pivot);
    g.userData.pivot = pivot;
    g.userData.cap = cap;
    return g;
  },
  update(part) {
    const { pivot, cap } = part.group!.userData;
    const sx = part.state.sx ?? 0, sy = part.state.sy ?? 0;
    pivot.rotation.z = -sx * 0.45;
    pivot.rotation.x = -sy * 0.45;
    cap.position.y = part.state.pressed ? 0.98 : 1.1;
  },
  listener(part) {
    return {
      readAnalog(pin) {
        if (pin === part.pins.vrx) return 512 + (part.state.sx ?? 0) * 511;
        if (pin === part.pins.vry) return 512 + (part.state.sy ?? 0) * 511;
        return undefined;
      },
      readDigital(pin, board) {
        if (pin !== part.pins.sw) return undefined;
        if (part.state.pressed) return 0;
        if (board.pins[pin].mode !== 'INPUT_PULLUP') board.hint('joysw', 'The joystick button (SW) connects to GND when pressed: use pinMode(pin, INPUT_PULLUP). Pressed reads LOW.');
        return undefined;
      },
    };
  },
  readout: part => `X ≈ <b>${Math.round(512 + (part.state.sx ?? 0) * 511)}</b> · Y ≈ <b>${Math.round(512 + (part.state.sy ?? 0) * 511)}</b> · SW <b>${part.state.pressed ? 'pressed' : 'up'}</b>`,
};

const neopixel: PartDef = {
  type: 'neopixel',
  name: 'NeoPixel Strip',
  blurb: 'Addressable RGB LEDs: one data wire controls every pixel. Use the Adafruit_NeoPixel library: strip.setPixelColor(i, strip.Color(r, g, b)) then strip.show().',
  defaults: { count: '8' },
  props: [{ key: 'count', label: 'LEDs', type: 'select', options: ['4', '8', '12', '16'].map(v => ({ value: v, label: `${v} pixels` })) }],
  terminals: part => {
    const n = Number(part.props.count ?? 8);
    const x0 = -(n * 1.0) / 2 - 0.4;
    return [
      { key: 'vcc', label: '5V', kind: '5V', pos: [x0, 0.3, -0.35] },
      { key: 'din', label: 'DIN', kind: 'signal', pos: [x0, 0.3, 0] },
      { key: 'gnd', label: 'GND', kind: 'GND', pos: [x0, 0.3, 0.35] },
    ];
  },
  build(part) {
    const n = Number(part.props.count ?? 8);
    const g = new THREE.Group();
    const len = n * 1.0 + 0.6;
    g.add(at(box(len, 0.12, 1.2, mat('#141518'), 0.04), 0, 0.12, 0));
    g.add(at(box(len, 0.06, 1.3, new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.1 }), 0.03), 0, 0.5, 0));
    const pixels: { m: THREE.MeshStandardMaterial; glow: THREE.Sprite }[] = [];
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.8 + i * 1.0;
      g.add(at(box(0.55, 0.18, 0.55, mat('#f2f0ea'), 0.04), x, 0.27, 0));
      const m = new THREE.MeshStandardMaterial({ color: '#d8d8d8', emissive: new THREE.Color(0), emissiveIntensity: 5, roughness: 0.4 });
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), m);
      lens.position.set(x, 0.38, 0);
      g.add(lens);
      const glow = glowSprite('#ffffff', 1.8);
      glow.position.set(x, 0.6, 0);
      g.add(glow);
      pixels.push({ m, glow });
    }
    g.userData.pixels = pixels;
    return g;
  },
  update(part, board, ctx) {
    const data = ctx.running && part.pins.din != null ? board.neopixels.get(part.pins.din) : undefined;
    const px: { m: THREE.MeshStandardMaterial; glow: THREE.Sprite }[] = part.group!.userData.pixels;
    let lit = 0;
    px.forEach((p, i) => {
      const c = data?.pixels[i] ?? 0;
      const k = (data?.brightness ?? 255) / 255;
      const col = new THREE.Color(((c >> 16) & 255) / 255 * k, ((c >> 8) & 255) / 255 * k, (c & 255) / 255 * k);
      p.m.emissive.copy(col);
      const max = Math.max(col.r, col.g, col.b);
      if (max > 0.02) lit++;
      const sm = p.glow.material as THREE.SpriteMaterial;
      sm.color.copy(max > 0 ? col.clone().multiplyScalar(1 / max) : col);
      sm.opacity = Math.min(1, max * 1.2);
    });
    part.state.lit = lit;
    part.state.colors = data?.pixels ?? [];
  },
  readout: part => `<b>${part.state.lit ?? 0}</b> of ${part.props.count} pixels lit`,
};

// ---------- breadboard ----------
const BB_COLS = 20;
const BB_PITCH = 0.6;
const BB_W = BB_COLS * BB_PITCH + 1.4;
const BB_D = 10.2;
const BB_TOP = 0.7;
const BB_ROWS = 'abcdefghij';
const bbX = (col: number) => (col - (BB_COLS - 1) / 2) * BB_PITCH;
// rows a–e above the centre trench, f–j below; power rails along both long edges
const bbRowZ = (r: number) => (r < 5 ? -2.85 + r * BB_PITCH : 0.45 + (r - 5) * BB_PITCH);
const BB_RAILS: { key: string; label: string; z: number; rail: '5V' | 'GND' }[] = [
  { key: 'tp', label: 'top + rail', z: -4.35, rail: '5V' },
  { key: 'tn', label: 'top − rail', z: -3.75, rail: 'GND' },
  { key: 'bn', label: 'bottom − rail', z: 3.75, rail: 'GND' },
  { key: 'bp', label: 'bottom + rail', z: 4.35, rail: '5V' },
];

function breadboardTop(): THREE.CanvasTexture {
  const PX = 64;
  const c = document.createElement('canvas');
  c.width = Math.round(BB_W * PX);
  c.height = Math.round(BB_D * PX);
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + BB_W / 2) * PX, Z = (z: number) => (z + BB_D / 2) * PX;
  g.fillStyle = '#ebe7de';
  g.fillRect(0, 0, c.width, c.height);
  // centre trench
  g.fillStyle = '#e2ddd2';
  g.fillRect(0, Z(-0.22), c.width, 0.44 * PX);
  const hole = (x: number, z: number) => {
    g.fillStyle = '#c9c3b6';
    g.fillRect(X(x) - 9, Z(z) - 9, 18, 18);
    g.fillStyle = '#3b3833';
    g.fillRect(X(x) - 6, Z(z) - 6, 12, 12);
  };
  for (let col = 0; col < BB_COLS; col++) {
    for (let r = 0; r < 10; r++) hole(bbX(col), bbRowZ(r));
    for (const rl of BB_RAILS) hole(bbX(col), rl.z);
  }
  for (const rl of BB_RAILS) {
    const edge = rl.key === 'tp' || rl.key === 'bp' ? (rl.key === 'tp' ? rl.z - 0.38 : rl.z + 0.38) : rl.key === 'tn' ? rl.z + 0.38 : rl.z - 0.38;
    g.strokeStyle = rl.rail === '5V' ? '#d7263d' : '#2f6fd6';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(X(bbX(0) - 0.3), Z(edge)); g.lineTo(X(bbX(BB_COLS - 1) + 0.3), Z(edge)); g.stroke();
    g.fillStyle = g.strokeStyle;
    g.font = '700 30px "IBM Plex Sans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(rl.rail === '5V' ? '+' : '−', X(-BB_W / 2 + 0.35), Z(rl.z));
  }
  g.fillStyle = '#8a8476';
  g.font = '600 20px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let col = 0; col < BB_COLS; col += 5) {
    g.fillText(String(col + 1), X(bbX(col)), Z(bbRowZ(0) - 0.42));
    g.fillText(String(col + 1), X(bbX(col)), Z(bbRowZ(9) + 0.42));
  }
  for (let r = 0; r < 10; r++) g.fillText(BB_ROWS[r], X(-BB_W / 2 + 0.35), Z(bbRowZ(r)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const bigBreadboard: PartDef = {
  type: 'breadboard',
  name: 'Breadboard',
  blurb: 'Connects things without soldering. The 5 holes in each column (a–e, or f–j) are joined inside, and each long + / − rail runs the whole length. Wire the board’s 5V and GND to the rails once, then plug many parts into them.',
  noPins: true,
  terminals: () => {
    const out: Terminal[] = [];
    for (let col = 0; col < BB_COLS; col++) {
      for (let r = 0; r < 10; r++) out.push({ key: `${col + 1}${BB_ROWS[r]}`, label: `hole ${col + 1}${BB_ROWS[r]} (joined with ${col + 1}${r < 5 ? 'a–e' : 'f–j'})`, kind: 'pass', pos: [bbX(col), BB_TOP, bbRowZ(r)] });
      for (const rl of BB_RAILS) out.push({ key: `${rl.key}${col + 1}`, label: `${rl.label} (whole row joined)`, kind: 'pass', rail: rl.rail, pos: [bbX(col), BB_TOP, rl.z] });
    }
    return out;
  },
  nets: () => {
    const nets: string[][] = [];
    for (let col = 1; col <= BB_COLS; col++) {
      nets.push([...'abcde'].map(r => `${col}${r}`));
      nets.push([...'fghij'].map(r => `${col}${r}`));
    }
    for (const rl of BB_RAILS) nets.push(Array.from({ length: BB_COLS }, (_, i) => `${rl.key}${i + 1}`));
    return nets;
  },
  build() {
    const g = new THREE.Group();
    const side = mat('#ece7dc', { roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ map: breadboardTop(), roughness: 0.75 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(BB_W, BB_TOP, BB_D), [side, side, top, side, side, side]);
    body.position.y = BB_TOP / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    return g;
  },
  readout: () => 'Tip: zoom in, then drag from a hole to a pin or a part’s leg. Hover a hole to see what it’s joined to.',
};

// ---------- relay & lamp ----------
const relay: PartDef = {
  type: 'relay',
  name: 'Relay + Lamp',
  blurb: 'A relay is a switch your board flips with a magnet. A weak pin (IN) safely switches a big separate circuit, here a mains lamp. HIGH on IN turns the lamp on, and you’ll hear the click.',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-0.45, 0.5, -1.25] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [0, 0.5, -1.25] },
    { key: 'in', label: 'IN', kind: 'signal', pos: [0.45, 0.5, -1.25] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(2.6, 0.14, 3.0, mat('#1f4f9a'), 0.04), 0, 0.36, 0));
    for (const [x, z] of [[-1.1, -1.3], [1.1, -1.3], [-1.1, 1.3], [1.1, 1.3]]) g.add(at(cyl(0.12, 0.12, 0.3, M.dark, 8), x, 0.15, z));
    g.add(at(box(1.9, 1.5, 1.6, mat('#2b63c9', { roughness: 0.35 }), 0.06), 0, 1.2, 0.2));
    g.add(at(box(1.5, 0.02, 1.0, mat('#e8eef9'), 0), 0, 1.96, 0.2)); // printed label
    g.add(at(box(1.9, 0.8, 0.5, mat('#1aa067'), 0.04), 0, 0.83, 1.15)); // screw terminal
    for (const x of [-0.55, 0, 0.55]) g.add(at(cyl(0.16, 0.16, 0.06, M.metal, 12), x, 1.26, 1.15));
    for (const x of [-0.45, 0, 0.45]) g.add(at(cyl(0.04, 0.04, 0.4, M.gold, 6), x, 0.6, -1.2));
    const ledMat = mat('#ff5040', { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0 });
    g.add(at(box(0.18, 0.1, 0.12, ledMat, 0.02), -0.95, 0.48, -0.85));
    // the lamp on its own little stand, cabled to the relay's screw terminal
    const lamp = new THREE.Group();
    lamp.position.set(4.2, 0, 1.0);
    lamp.add(at(cyl(1.1, 1.3, 0.4, mat('#3a3b42'), 28), 0, 0.2, 0));
    lamp.add(at(cyl(0.12, 0.12, 2.2, M.metal, 10), 0, 1.5, 0));
    lamp.add(at(cyl(0.45, 0.4, 0.6, M.metal, 20), 0, 2.85, 0));
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#fff7e0', roughness: 0.1, transmission: 0.3, transparent: true, opacity: 0.85, emissive: new THREE.Color('#ffcf73'), emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.85, 28, 18), glassMat);
    bulb.position.y = 3.85;
    bulb.castShadow = true;
    lamp.add(bulb);
    const glow = glowSprite('#ffc861', 7);
    glow.position.y = 3.85;
    lamp.add(glow);
    g.add(lamp);
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.0, 1.4), new THREE.Vector3(1.5, 0.2, 2.6), new THREE.Vector3(3.2, 0.15, 1.8), new THREE.Vector3(4.2, 0.3, 1.0)]);
    const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 30, 0.1, 8, false), mat('#f2efe8'));
    cableMesh.castShadow = true;
    g.add(cableMesh);
    g.userData.relay = { ledMat, glassMat, glow };
    return g;
  },
  update(part, board, ctx) {
    const on = ctx.running && board.level(part.pins.in) > 0.5;
    if (on !== !!part.state.on) {
      part.state.on = on;
      if (ctx.running) ctx.audio.click();
    }
    const { ledMat, glassMat, glow } = part.group!.userData.relay;
    ledMat.emissiveIntensity = on ? 5 : 0;
    // warm up / cool down like a filament
    const cur = part.state.glow ?? 0;
    part.state.glow = cur + ((on ? 1 : 0) - cur) * Math.min(1, ctx.dt * 12);
    glassMat.emissiveIntensity = part.state.glow * 4;
    (glow.material as THREE.SpriteMaterial).opacity = part.state.glow * 0.9;
  },
  readout: part => `Relay is <b>${part.state.on ? 'ON (closed)' : 'OFF (open)'}</b>: the lamp is ${part.state.on ? 'lit' : 'dark'}`,
};

// ---------- DHT11 temperature & humidity ----------
function grilleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3d7fd1';
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#163f73';
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) g.fillRect(14 + x * 21 + (y % 2) * 6, 12 + y * 20, 12, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const dht11: PartDef = {
  type: 'dht',
  name: 'DHT11 Temp & Humidity',
  blurb: 'Measures temperature (°C) and humidity (%) and sends them as digital data on one pin. Use #include <DHT.h>, DHT dht(pin, DHT11); then dht.readTemperature() and dht.readHumidity(). Drag it up/down to change the temperature.',
  defaults: { temp: 24, hum: 45 },
  props: [
    { key: 'temp', label: 'Temperature', type: 'range', min: 0, max: 50, step: 1, unit: '°C' },
    { key: 'hum', label: 'Humidity', type: 'range', min: 20, max: 90, step: 1, unit: '%' },
  ],
  knob: { key: 'temp', min: 0, max: 50, perPixel: 0.25 },
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(3, 0, 0.45), 0.5, -1.05] },
    { key: 'data', label: 'DATA', kind: 'signal', pos: [row(3, 1, 0.45), 0.5, -1.05] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 2, 0.45), 0.5, -1.05] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.2, 2.4));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.035, 0.035, 0.5, M.leg, 6), row(3, i, 0.45), 0.75, -0.75));
    const tex = grilleTexture();
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    const side = mat('#3d7fd1', { roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.7), [side, side, side, side, face, side]);
    body.position.set(0, 1.55, 0.1);
    body.castShadow = true;
    body.userData.action = 'knob';
    g.add(body);
    return g;
  },
  listener(part) {
    return { dht: pin => (pin === part.pins.data ? { t: part.props.temp, h: part.props.hum } : undefined) };
  },
  readout: part => `Reads <b>${part.props.temp} °C</b> and <b>${part.props.hum}%</b> humidity`,
};

// ---------- OLED 128×64 ----------
const oled: PartDef = {
  type: 'oled',
  name: 'OLED Screen 128×64',
  blurb: 'A tiny, crisp screen you can draw on pixel by pixel. I2C, so wire SDA to A4 and SCL to A5. Use the Adafruit_SSD1306 library: draw, then call display.display() to show it.',
  defaults: { addr: '60' },
  props: [{ key: 'addr', label: 'I2C address', type: 'select', options: [{ value: '60', label: '0x3C (most common)' }, { value: '61', label: '0x3D' }] }],
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-0.39, 1.05, -1.25] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-0.13, 1.05, -1.25] },
    { key: 'scl', label: 'SCL', kind: 'signal', analog: true, pos: [0.13, 1.05, -1.25] },
    { key: 'sda', label: 'SDA', kind: 'signal', analog: true, pos: [0.39, 1.05, -1.25] },
  ],
  build() {
    const g = new THREE.Group();
    for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) g.add(at(cyl(0.1, 0.1, 0.8, M.dark, 8), x, 0.4, z));
    g.add(at(box(2.8, 0.12, 2.8, mat('#1d3f8a'), 0.05), 0, 0.86, 0));
    for (const x of [-0.39, -0.13, 0.13, 0.39]) g.add(at(cyl(0.04, 0.04, 0.3, M.gold, 6), x, 0.98, -1.25));
    g.add(at(box(2.7, 0.06, 1.75, mat('#08090b', { roughness: 0.15 }), 0.02), 0, 0.95, 0.2));
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const screenMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 2.2, roughness: 0.2 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(0, 0.985, 0.2);
    g.add(screen);
    g.userData.oled = { canvas, tex, frame: null as Uint8Array | null };
    return g;
  },
  update(part, board, ctx) {
    const u = part.group!.userData.oled;
    const wired = part.pins.sda === 18 && part.pins.scl === 19;
    const frame = ctx.running && wired ? board.oleds.get(Number(part.props.addr)) ?? null : null;
    part.state.problem = !ctx.running ? '' : !wired ? 'Wire SDA to A4 and SCL to A5, the board’s I2C pins.' : !frame ? 'Waiting for display.display()…' : '';
    if (frame === u.frame) return;
    u.frame = frame;
    const g = u.canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 256);
    let lit = 0;
    if (frame) {
      g.fillStyle = '#bfefff';
      const h = frame.length / 128;
      const ph = 256 / h;
      for (let y = 0; y < h; y++) for (let x = 0; x < 128; x++) {
        if (frame[y * 128 + x]) { lit++; g.fillRect(x * 4, y * ph, 3.4, ph - 0.6); }
      }
    }
    part.state.lit = lit;
    // a cheap fingerprint so lessons can tell when the picture changes
    let sig = 0;
    if (frame) for (let i = 0; i < frame.length; i++) if (frame[i]) sig = (sig * 31 + i) >>> 0;
    part.state.sig = sig;
    u.tex.needsUpdate = true;
  },
  readout: part => (part.state.problem ? `<span class="warn-inline">${part.state.problem}</span>` : `<b>${part.state.lit ?? 0}</b> pixels lit`),
};

// ---------- stepper motor + ULN2003 driver ----------
const stepper: PartDef = {
  type: 'stepper',
  name: 'Stepper Motor',
  blurb: 'Moves in exact steps (2048 per turn for this 28BYJ-48), so it can point precisely and count turns. Its ULN2003 driver needs 4 pins. Use the Stepper library: Stepper motor(2048, IN1, IN3, IN2, IN4); motor.setSpeed(10); motor.step(512);',
  terminals: () => [
    { key: 'in1', label: 'IN1', kind: 'signal', pos: [row(6, 0, 0.36), 0.62, -1.55] },
    { key: 'in2', label: 'IN2', kind: 'signal', pos: [row(6, 1, 0.36), 0.62, -1.55] },
    { key: 'in3', label: 'IN3', kind: 'signal', pos: [row(6, 2, 0.36), 0.62, -1.55] },
    { key: 'in4', label: 'IN4', kind: 'signal', pos: [row(6, 3, 0.36), 0.62, -1.55] },
    { key: 'vcc', label: '5V', kind: '5V', pos: [row(6, 4, 0.36), 0.62, -1.55] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(6, 5, 0.36), 0.62, -1.55] },
  ],
  build() {
    const g = new THREE.Group();
    // driver board
    g.add(at(box(3.2, 0.12, 3.4, mat('#1d6b3a'), 0.05), 0, 0.42, 0));
    for (const [x, z] of [[-1.4, -1.5], [1.4, -1.5], [-1.4, 1.5], [1.4, 1.5]]) g.add(at(cyl(0.1, 0.1, 0.4, M.dark, 8), x, 0.2, z));
    g.add(at(box(1.0, 0.25, 1.9, M.black, 0.03), -0.6, 0.6, 0.2));
    for (let i = 0; i < 6; i++) g.add(at(cyl(0.035, 0.035, 0.35, M.gold, 6), row(6, i, 0.36), 0.62, -1.55));
    const leds: THREE.MeshStandardMaterial[] = [];
    for (let i = 0; i < 4; i++) {
      const m = mat('#ff6a55', { emissive: new THREE.Color('#ff2a10'), emissiveIntensity: 0 });
      g.add(at(box(0.2, 0.12, 0.14, m, 0.02), 0.85, 0.54, -0.6 + i * 0.4));
      leds.push(m);
    }
    g.add(at(box(0.9, 0.5, 0.45, mat('#f2f2ee'), 0.04), 0.7, 0.72, 1.4)); // motor connector
    // the motor beside it
    const motor = new THREE.Group();
    motor.position.set(3.6, 0, 0.2);
    motor.add(at(cyl(1.4, 1.4, 1.9, M.metal, 36), 0, 0.95, 0));
    motor.add(at(cyl(1.43, 1.43, 0.12, mat('#2b5fc9'), 36), 0, 1.92, 0));
    motor.add(at(box(3.6, 0.08, 0.7, M.metal, 0.03), 0, 1.9, 0)); // mounting ears
    motor.add(at(cyl(0.45, 0.45, 0.3, M.metal, 20), 0.55, 2.1, 0));
    const shaft = new THREE.Group();
    shaft.position.set(0.55, 2.25, 0);
    shaft.add(at(cyl(0.12, 0.12, 0.6, mat('#e8c35a', { metalness: 0.6 }), 10), 0, 0.3, 0));
    const pointer = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.28, 2.0, 3), mat('#e2533b'));
    pointer.rotation.z = Math.PI / 2;
    pointer.position.set(0.9, 0.62, 0);
    pointer.castShadow = true;
    shaft.add(pointer);
    shaft.add(at(cyl(0.35, 0.35, 0.18, mat('#e2533b'), 20), 0, 0.62, 0));
    motor.add(shaft);
    g.add(motor);
    // degree ring printed around the shaft
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.38, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(4.15, 2.0, 0.2);
    g.add(ring);
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(1.0, 0.75, 1.5), new THREE.Vector3(2.0, 0.4, 2.2), new THREE.Vector3(3.0, 0.6, 1.6)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 16, 0.12, 6, false), mat('#d9d9d4')));
    g.userData.stepper = { leds, shaft };
    return g;
  },
  update(part, board, ctx) {
    const pins = ['in1', 'in2', 'in3', 'in4'].map(k => part.pins[k]);
    const key = pins.every(p => p != null) ? [...(pins as number[])].sort((a, b) => a - b).join(',') : '';
    const st = ctx.running ? board.steppers.get(key) : undefined;
    const steps = st?.steps ?? part.state.steps ?? 0;
    part.state.steps = steps;
    const perRev = st?.perRev ?? 2048;
    part.state.angle = ((steps / perRev) * 360) % 360;
    const { leds, shaft } = part.group!.userData.stepper;
    shaft.rotation.y = (-steps / perRev) * Math.PI * 2;
    const moving = st && st.steps !== part.state.lastSteps;
    part.state.lastSteps = st?.steps;
    leds.forEach((m: THREE.MeshStandardMaterial, i: number) => { m.emissiveIntensity = ctx.running && ((steps % 4) + 4) % 4 === i ? (moving ? 5 : 2) : 0; });
  },
  readout: part => `Position: <b>${part.state.steps ?? 0} steps</b> (${Math.round(((part.state.angle ?? 0) + 360) % 360)}°)`,
};

// ---------- 4×4 membrane keypad ----------
const KEY_LABELS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'];

const keypad: PartDef = {
  type: 'keypad',
  name: 'Keypad 4×4',
  blurb: '16 buttons arranged in a grid of 4 rows and 4 columns. Pressing a key connects one row wire to one column wire, so 8 pins read 16 keys. Click the keys! Use the Keypad library and keypad.getKey().',
  terminals: () => [
    ...[1, 2, 3, 4].map((r, i) => ({ key: `r${r}`, label: `Row ${r}`, kind: 'signal' as const, pos: [row(8, i, 0.3), 0.3, -3.55] as [number, number, number] })),
    ...[1, 2, 3, 4].map((c, i) => ({ key: `c${c}`, label: `Column ${c}`, kind: 'signal' as const, pos: [row(8, i + 4, 0.3), 0.3, -3.55] as [number, number, number] })),
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(4.6, 0.12, 6.0, mat('#1b1c20'), 0.15), 0, 0.06, 0));
    g.add(at(box(2.6, 0.06, 1.2, mat('#2a2b30'), 0.02), 0, 0.1, -3.0)); // ribbon tail
    g.add(at(box(2.7, 0.3, 0.3, M.black, 0.03), 0, 0.18, -3.55));
    for (let i = 0; i < 8; i++) g.add(at(cyl(0.03, 0.03, 0.25, M.gold, 6), row(8, i, 0.3), 0.3, -3.55));
    const keys: THREE.Mesh[] = [];
    KEY_LABELS.forEach((label, i) => {
      const r = Math.floor(i / 4), c = i % 4;
      const letter = c === 3;
      const tex = textTexture([{ text: label, x: 64, y: 66, size: 70, color: letter ? '#fff' : '#26272b', weight: '700' }], 128, 128, letter ? '#d6463a' : r === 3 ? '#3b82c4' : '#f2f0ea');
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
      const side = mat(letter ? '#b33a30' : r === 3 ? '#2f6aa8' : '#d8d5cc');
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), [side, side, top, side, side, side]);
      key.position.set((c - 1.5) * 1.08, 0.21, (r - 1.5) * 1.08 + 0.55);
      key.castShadow = true;
      key.userData.action = 'press';
      key.userData.keyIndex = i;
      g.add(key);
      keys.push(key);
    });
    g.userData.keys = keys;
    return g;
  },
  update(part) {
    part.group!.userData.keys.forEach((k: THREE.Mesh, i: number) => { k.position.y = part.state.key === i ? 0.13 : 0.21; });
  },
  listener(part) {
    return {
      keypad(rowPins, colPins) {
        const k = part.state.key;
        if (k == null) return undefined;
        const r = rowPins.indexOf(part.pins[`r${Math.floor(k / 4) + 1}`] ?? -1);
        const c = colPins.indexOf(part.pins[`c${(k % 4) + 1}`] ?? -1);
        return r >= 0 && c >= 0 ? [r, c] : undefined;
      },
    };
  },
  readout: part => (part.state.key != null ? `Pressing <b>${KEY_LABELS[part.state.key]}</b>` : 'Click a key to press it'),
};

// ---------- soil moisture sensor in a plant pot ----------
const soil: PartDef = {
  type: 'soil',
  name: 'Soil Moisture Sensor',
  blurb: 'Two metal prongs measure how well the soil conducts. Wet soil conducts better, so analogRead() gives LOW numbers for wet soil and HIGH numbers when it’s dry. Drag the pot up/down to water it.',
  defaults: { moisture: 60 },
  props: [{ key: 'moisture', label: 'Soil moisture', type: 'range', min: 0, max: 100, step: 1, unit: '%' }],
  knob: { key: 'moisture', min: 0, max: 100, perPixel: 0.5 },
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-2.85, 0.75, -0.5] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-2.85, 0.75, -0.2] },
    { key: 'ao', label: 'AO', kind: 'signal', analog: true, pos: [-2.85, 0.75, 0.1] },
  ],
  build() {
    const g = new THREE.Group();
    // sensor module board
    g.add(at(box(1.4, 0.1, 1.6, mat('#1f4f9a'), 0.04), -2.4, 0.5, -0.2));
    for (const [x, z] of [[-2.9, -0.8], [-1.9, -0.8], [-2.9, 0.4], [-1.9, 0.4]]) g.add(at(cyl(0.07, 0.07, 0.5, M.dark, 6), x, 0.25, z));
    g.add(at(box(0.5, 0.2, 0.5, mat('#2a64d0'), 0.03), -2.2, 0.62, -0.1));
    for (const z of [-0.5, -0.2, 0.1]) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), -2.85, 0.65, z));
    // pot, soil and plant
    const pot = new THREE.Group();
    pot.position.set(1, 0, 0);
    const potMat = mat('#c9693f', { roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.5, 3.0, 36, 1, true), potMat);
    body.position.y = 1.5;
    body.castShadow = true;
    body.userData.action = 'knob';
    pot.add(body);
    pot.add(at(cyl(1.5, 1.5, 0.1, potMat, 36), 0, 0.05, 0));
    const rim = at(new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.16, 10, 40), potMat), 0, 3.0, 0);
    rim.rotation.x = Math.PI / 2;
    pot.add(rim);
    const soilMat = mat('#6b4a2f', { roughness: 1 });
    const dirt = cyl(1.9, 1.9, 0.12, soilMat, 36);
    dirt.position.y = 2.7;
    dirt.userData.action = 'knob';
    pot.add(dirt);
    const leafMat = mat('#3f9a4a', { roughness: 0.6 });
    const plant = new THREE.Group();
    plant.position.y = 2.75;
    plant.add(at(cyl(0.08, 0.1, 2.4, mat('#4e8a3a'), 8), 0, 1.2, 0));
    const leaves: THREE.Object3D[] = [];
    for (let i = 0; i < 6; i++) {
      const pivot = new THREE.Group();
      pivot.position.y = 0.7 + i * 0.32;
      pivot.rotation.y = i * 2.4;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), leafMat);
      leaf.scale.set(1.3, 0.12, 0.55);
      leaf.position.x = 0.6;
      leaf.castShadow = true;
      pivot.add(leaf);
      plant.add(pivot);
      leaves.push(pivot);
    }
    pot.add(plant);
    // probe pushed into the soil
    for (const z of [-0.25, 0.25]) pot.add(at(box(0.12, 1.6, 0.18, M.metal, 0.02), -0.9, 2.5, z));
    pot.add(at(box(0.3, 0.5, 0.9, mat('#1f4f9a'), 0.04), -0.9, 3.45, 0));
    g.add(pot);
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.75, 0.6, -0.2), new THREE.Vector3(-1.2, 2.2, 0), new THREE.Vector3(0.1, 3.6, 0)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 16, 0.08, 6, false), mat('#d9d9d4')));
    g.userData.soil = { soilMat, leaves, leafMat };
    return g;
  },
  update(part) {
    const m = part.props.moisture / 100;
    const { soilMat, leaves, leafMat } = part.group!.userData.soil;
    soilMat.color.set('#a07a52').lerp(new THREE.Color('#3a2716'), m);
    leafMat.color.set('#9a9a3a').lerp(new THREE.Color('#3f9a4a'), Math.min(1, m * 2));
    // leaves droop when the plant is thirsty
    leaves.forEach((l: THREE.Object3D) => { l.rotation.z = -0.9 * Math.max(0, 0.35 - m) / 0.35 + 0.15; });
  },
  listener(part) {
    return { readAnalog: pin => (pin === part.pins.ao ? 1023 - part.props.moisture * 7 : undefined) };
  },
  readout: part => `Moisture ${part.props.moisture}% → analogRead() ≈ <b>${Math.round(1023 - part.props.moisture * 7)}</b>`,
};

// ---------- rotary encoder (KY-040) ----------
// Quadrature: CLK and DT step through a Gray code; each click is two quarter-steps (one CLK change).
const GRAY = [[0, 0], [0, 1], [1, 1], [1, 0]];

const encoder: PartDef = {
  type: 'encoder',
  name: 'Rotary Encoder',
  blurb: 'A knob that clicks round forever. It doesn’t give an angle; instead CLK and DT pulse in a pattern that tells you which way it turned. Drag it up/down to turn it, and click it to press its switch (SW, LOW when pressed).',
  defaults: { turns: 0 },
  knob: { key: 'turns', min: -9999, max: 9999, perPixel: 0.08 },
  clickPress: true,
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(5, 0, 0.36), 0.5, -1.05] },
    { key: 'vcc', label: '+', kind: '5V', pos: [row(5, 1, 0.36), 0.5, -1.05] },
    { key: 'sw', label: 'SW', kind: 'signal', pos: [row(5, 2, 0.36), 0.5, -1.05] },
    { key: 'dt', label: 'DT', kind: 'signal', pos: [row(5, 3, 0.36), 0.5, -1.05] },
    { key: 'clk', label: 'CLK', kind: 'signal', pos: [row(5, 4, 0.36), 0.5, -1.05] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.4, 2.6));
    g.add(at(box(2.0, 0.12, 2.0, mat('#1f4f9a'), 0.04), 0, 0.82, 0.2));
    for (let i = 0; i < 5; i++) g.add(at(cyl(0.035, 0.035, 0.4, M.gold, 6), row(5, i, 0.36), 0.66, -0.9));
    g.add(at(box(1.3, 0.6, 1.3, M.metal, 0.06), 0, 1.18, 0.2));
    g.add(at(cyl(0.28, 0.28, 0.4, M.metal, 16), 0, 1.6, 0.2));
    const knob = new THREE.Group();
    knob.position.set(0, 1.8, 0.2);
    const cap = cyl(0.62, 0.66, 0.75, mat('#24262b', { roughness: 0.5 }), 24);
    cap.position.y = 0.37;
    cap.userData.action = 'knob';
    knob.add(cap);
    for (let i = 0; i < 18; i++) {
      const ridge = box(0.06, 0.6, 0.08, mat('#3a3d44'), 0);
      const a = (i / 18) * Math.PI * 2;
      ridge.position.set(Math.cos(a) * 0.64, 0.38, Math.sin(a) * 0.64);
      ridge.rotation.y = -a;
      ridge.userData.action = 'knob';
      knob.add(ridge);
    }
    const mark = box(0.08, 0.04, 0.4, mat('#ffffff'), 0);
    mark.position.set(0, 0.76, -0.3);
    mark.userData.action = 'knob';
    knob.add(mark);
    g.add(knob);
    g.userData.knob = knob;
    return g;
  },
  update(part, board, ctx) {
    // while stopped, turning just moves the knob: no phantom pulses at the next run
    if (!ctx.running) part.state.q = -part.props.turns * 2;
    const k = part.group!.userData.knob;
    k.rotation.y = -(part.props.turns * Math.PI * 2) / 20; // 20 clicks per turn
    k.position.y = part.state.pressed ? 1.7 : 1.8;
    void board;
  },
  listener(part) {
    return {
      readDigital(pin, board) {
        if (pin === part.pins.sw) return part.state.pressed ? 0 : 1;
        if (pin !== part.pins.clk && pin !== part.pins.dt) return undefined;
        const target = -part.props.turns * 2; // clockwise runs the Gray code backwards
        part.state.q ??= target; // first read: start from where the knob is
        const q = part.state.q;
        // play queued quarter-steps out at most one per millisecond, so polling code sees every edge
        if (q !== target && Math.abs(board.time - (part.state.lastStep ?? -99)) >= 1) {
          part.state.q = q + Math.sign(target - q);
          part.state.lastStep = board.time;
        }
        const [clk, dt] = GRAY[(((part.state.q ?? target) % 4) + 4) % 4];
        return pin === part.pins.clk ? clk : dt;
      },
    };
  },
  readout: part => `Turned <b>${part.props.turns}</b> clicks${part.state.pressed ? ' · <b>pressed</b>' : ''}`,
};

// ---------- 8×8 LED matrix (MAX7219) ----------
const matrix: PartDef = {
  type: 'matrix',
  name: 'LED Matrix 8×8',
  blurb: '64 red LEDs in a grid, driven by a MAX7219 chip so 3 data pins control them all. Use the LedControl library: lc.shutdown(0, false) to wake it, then lc.setLed(0, row, col, true) or lc.setRow(0, row, B01100110).',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-2.3, 0.62, row(5, 0, 0.36)] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-2.3, 0.62, row(5, 1, 0.36)] },
    { key: 'din', label: 'DIN', kind: 'signal', pos: [-2.3, 0.62, row(5, 2, 0.36)] },
    { key: 'cs', label: 'CS', kind: 'signal', pos: [-2.3, 0.62, row(5, 3, 0.36)] },
    { key: 'clk', label: 'CLK', kind: 'signal', pos: [-2.3, 0.62, row(5, 4, 0.36)] },
  ],
  build() {
    const g = new THREE.Group();
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) g.add(at(cyl(0.1, 0.1, 0.4, M.dark, 8), x, 0.2, z));
    g.add(at(box(4.6, 0.12, 4.2, mat('#1c4fa0'), 0.05), 0, 0.46, 0));
    for (let i = 0; i < 5; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), -2.3, 0.6, row(5, i, 0.36)));
    g.add(at(box(3.4, 0.7, 3.4, mat('#141417', { roughness: 0.4 }), 0.04), 0.3, 0.87, 0));
    const dots: THREE.MeshStandardMaterial[] = [];
    const glows: THREE.Sprite[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const m = new THREE.MeshStandardMaterial({ color: '#3a1412', emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0, roughness: 0.3 });
      const x = 0.3 - 1.4 + c * 0.4, z = -1.4 + r * 0.4;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 14), m);
      d.position.set(x, 1.23, z);
      g.add(d);
      dots.push(m);
      const s = glowSprite('#ff3322', 0.9);
      s.position.set(x, 1.32, z);
      g.add(s);
      glows.push(s);
    }
    g.userData.matrix = { dots, glows };
    return g;
  },
  update(part, board, ctx) {
    const key = [part.pins.din, part.pins.clk, part.pins.cs].join(',');
    const data = ctx.running ? board.matrices.get(key) : undefined;
    const { dots, glows } = part.group!.userData.matrix;
    const level = data && !data.shutdown ? 0.35 + (data.intensity / 15) * 0.65 : 0;
    let lit = 0, sig = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const on = !!data && ((data.rows[r] >> (7 - c)) & 1) === 1;
      const v = on ? level : 0;
      if (v) { lit++; sig = (sig * 31 + r * 8 + c) >>> 0; }
      dots[r * 8 + c].emissiveIntensity = v * 6;
      (glows[r * 8 + c].material as THREE.SpriteMaterial).opacity = v * 0.7;
    }
    part.state.lit = lit;
    part.state.sig = sig;
  },
  readout: part => `<b>${part.state.lit ?? 0}</b> of 64 LEDs lit`,
};

// ---------- Hall effect sensor and a magnet to find ----------
const hall: PartDef = {
  type: 'hall',
  name: 'Hall Sensor',
  blurb: 'Senses magnets. OUT reads LOW when a magnet is close (within about 5 cm) and HIGH otherwise. Drag the magnet near it! Used in bike speedometers, door alarms and laptop lids.',
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 0, 0.45), 0.5, -0.95] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(3, 1, 0.45), 0.5, -0.95] },
    { key: 'out', label: 'OUT', kind: 'signal', pos: [row(3, 2, 0.45), 0.5, -0.95] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.0, 2.2));
    g.add(at(box(1.6, 0.12, 1.5, mat('#1f4f9a'), 0.04), 0, 0.82, 0.1));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.035, 0.035, 0.4, M.gold, 6), row(3, i, 0.45), 0.66, -0.8));
    g.add(at(box(0.5, 0.2, 0.36, mat('#18191d'), 0.03), 0, 0.98, 0.55));
    for (const x of [-0.12, 0, 0.12]) g.add(at(cyl(0.025, 0.025, 0.3, M.leg, 6), x, 0.98, 0.3));
    const ledMat = mat('#ff5040', { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0 });
    g.add(at(box(0.2, 0.1, 0.14, ledMat, 0.02), -0.5, 0.94, -0.25));
    g.userData.led = ledMat;
    return g;
  },
  update(part, _board, ctx) {
    const here = part.group!.position;
    const near = ctx.parts.some(p => p.type === 'magnet' && p.group && p.group.position.distanceTo(here) < 5);
    part.state.near = near;
    part.group!.userData.led.emissiveIntensity = ctx.running && near ? 5 : 0;
  },
  listener(part) {
    return { readDigital: pin => (pin === part.pins.out ? (part.state.near ? 0 : 1) : undefined) };
  },
  readout: part => (part.state.near ? '<b>Magnet detected</b> (OUT is LOW)' : 'No magnet nearby. Drag the magnet closer.'),
};

const magnet: PartDef = {
  type: 'magnet',
  name: 'Magnet',
  blurb: 'A bar magnet. Drag it near the Hall sensor to trigger it.',
  noPins: true,
  terminals: () => [],
  build() {
    const g = new THREE.Group();
    const n = at(box(1.6, 0.9, 1.1, mat('#d6403a', { roughness: 0.35 }), 0.12), -0.8, 0.45, 0);
    const sPole = at(box(1.6, 0.9, 1.1, mat('#2f6fd0', { roughness: 0.35 }), 0.12), 0.8, 0.45, 0);
    g.add(n, sPole);
    const label = (text: string, x: number) => {
      const t = textTexture([{ text, x: 64, y: 64, size: 88, weight: '800' }], 128, 128, 'rgba(0,0,0,0)');
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.91, 0);
      g.add(p);
    };
    label('N', -0.8);
    label('S', 0.8);
    return g;
  },
};

// ---------- sound sensor (KY-037) ----------
const sound: PartDef = {
  type: 'sound',
  name: 'Sound Sensor',
  blurb: 'A microphone that measures loudness. AO gives a level on analogRead(); DO goes HIGH when it’s louder than the threshold. Click the microphone to clap!',
  defaults: { noise: 15, threshold: 600 },
  props: [
    { key: 'noise', label: 'Background noise', type: 'range', min: 0, max: 100, step: 1, unit: '%' },
    { key: 'threshold', label: 'DO threshold (the blue screw)', type: 'range', min: 100, max: 1000, step: 10 },
  ],
  terminals: () => [
    { key: 'ao', label: 'AO', kind: 'signal', analog: true, pos: [row(4, 0, 0.4), 0.5, -1.05] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 1, 0.4), 0.5, -1.05] },
    { key: 'vcc', label: '+', kind: '5V', pos: [row(4, 2, 0.4), 0.5, -1.05] },
    { key: 'do', label: 'DO', kind: 'signal', pos: [row(4, 3, 0.4), 0.5, -1.05] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.6, 2.6));
    g.add(at(box(2.2, 0.12, 2.0, mat('#1f4f9a'), 0.04), 0, 0.82, 0.15));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.035, 0.035, 0.4, M.gold, 6), row(4, i, 0.4), 0.66, -0.9));
    const mic = cyl(0.5, 0.5, 0.5, M.metal, 28);
    mic.position.set(0.3, 1.13, 0.55);
    mic.userData.action = 'press';
    g.add(mic);
    const grille = cyl(0.42, 0.42, 0.02, mat('#2b2c31', { roughness: 0.9 }), 28);
    grille.position.set(0.3, 1.39, 0.55);
    grille.userData.action = 'press';
    g.add(grille);
    g.add(at(box(0.45, 0.4, 0.45, mat('#2f6fd0'), 0.04), -0.6, 1.08, 0.3));
    g.add(at(cyl(0.12, 0.12, 0.06, M.metal, 12), -0.6, 1.3, 0.3));
    const ledMat = mat('#ff5040', { emissive: new THREE.Color('#ff2010'), emissiveIntensity: 0 });
    g.add(at(box(0.18, 0.1, 0.12, ledMat, 0.02), -0.8, 0.94, -0.3));
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: '#7fe6dd', transparent: true, opacity: 0 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(0.3, 1.5, 0.55);
      g.add(r);
      rings.push(r);
    }
    g.userData.sound = { ledMat, rings };
    return g;
  },
  update(part, _board, ctx) {
    const now = performance.now();
    if (part.state.pressed && !part.state.wasPressed) part.state.clapAt = now;
    part.state.wasPressed = part.state.pressed;
    const t = (now - (part.state.clapAt ?? -1e9)) / 1000;
    part.state.clap = t < 0.3;
    part.state.level = Math.round(70 + part.props.noise * 3 + (part.state.clap ? 850 * (1 - t / 0.3) : 0));
    const { ledMat, rings } = part.group!.userData.sound;
    ledMat.emissiveIntensity = ctx.running && part.state.level > part.props.threshold ? 5 : 0;
    rings.forEach((r: THREE.Mesh, i: number) => {
      const p = Math.min(1, t * 1.8 + i * 0.12);
      r.scale.setScalar(0.6 + p * 2.2);
      (r.material as THREE.MeshBasicMaterial).opacity = t < 0.6 ? (1 - p) * 0.8 : 0;
    });
  },
  listener(part) {
    const level = () => (part.state.level ?? 70) + (Math.random() - 0.5) * (6 + part.props.noise * 0.8);
    return {
      readAnalog: pin => (pin === part.pins.ao ? level() : undefined),
      readDigital: pin => (pin === part.pins.do ? (level() > part.props.threshold ? 1 : 0) : undefined),
    };
  },
  readout: part => `Loudness ≈ <b>${part.state.level ?? 70}</b>${part.state.clap ? ' 👏' : ''}. Click the mic to clap`,
};

// ---------- gas / smoke sensor (MQ-2) ----------
const gas: PartDef = {
  type: 'gas',
  name: 'Gas Sensor (MQ-2)',
  blurb: 'Detects smoke and flammable gas. AO rises with the gas level; DO goes LOW when it passes the threshold. Drag it up/down to change the amount of smoke around it.',
  defaults: { gas: 5 },
  props: [{ key: 'gas', label: 'Smoke / gas level', type: 'range', min: 0, max: 100, step: 1, unit: '%' }],
  knob: { key: 'gas', min: 0, max: 100, perPixel: 0.5 },
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(4, 0, 0.4), 0.5, -1.15] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 1, 0.4), 0.5, -1.15] },
    { key: 'do', label: 'DO', kind: 'signal', pos: [row(4, 2, 0.4), 0.5, -1.15] },
    { key: 'ao', label: 'AO', kind: 'signal', analog: true, pos: [row(4, 3, 0.4), 0.5, -1.15] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(breadboard(2.6, 2.8));
    g.add(at(box(2.2, 0.12, 2.2, mat('#1f4f9a'), 0.04), 0, 0.82, 0.1));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.035, 0.035, 0.4, M.gold, 6), row(4, i, 0.4), 0.66, -1.0));
    const body = cyl(0.85, 0.85, 0.9, mat('#c9ccd2', { metalness: 0.6, roughness: 0.4 }), 32);
    body.position.set(0, 1.33, 0.25);
    body.userData.action = 'knob';
    g.add(body);
    const meshMat = new THREE.MeshStandardMaterial({ color: '#8c8f96', roughness: 0.9, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.3, 32), meshMat);
    cap.position.set(0, 1.93, 0.25);
    cap.userData.action = 'knob';
    g.add(cap);
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshStandardMaterial({ color: '#b9bcc2', transparent: true, opacity: 0, roughness: 1, depthWrite: false }));
      g.add(p);
      puffs.push(p);
    }
    g.userData.gas = { meshMat, puffs };
    return g;
  },
  update(part, _board, ctx) {
    const v = part.props.gas / 100;
    const { meshMat, puffs } = part.group!.userData.gas;
    meshMat.emissiveIntensity = ctx.running ? 0.35 : 0; // the heater glows while powered
    const t = performance.now() / 1000;
    puffs.forEach((p: THREE.Mesh, i: number) => {
      const phase = (t * 0.25 + i / puffs.length) % 1;
      p.position.set(Math.sin(i * 2.1 + t * 0.6) * (0.4 + phase), 1.2 + phase * 4, 0.25 + Math.cos(i * 1.7) * 0.6 * phase);
      p.scale.setScalar(0.6 + phase * 1.8);
      (p.material as THREE.MeshStandardMaterial).opacity = Math.max(0, v - 0.15) * (1 - phase) * 0.55;
    });
  },
  listener(part) {
    const ao = () => 90 + part.props.gas * 8.5 + (Math.random() - 0.5) * 8;
    return {
      readAnalog: pin => (pin === part.pins.ao ? ao() : undefined),
      readDigital: pin => (pin === part.pins.do ? (ao() > 400 ? 0 : 1) : undefined),
    };
  },
  readout: part => `Gas ${part.props.gas}% → analogRead() ≈ <b>${Math.round(90 + part.props.gas * 8.5)}</b>`,
};

// ---------- IR receiver with its remote control ----------
/** The common 21-button NEC remote: label and the command byte it sends. */
export const IR_KEYS: [string, number][] = [
  ['CH−', 0x45], ['CH', 0x46], ['CH+', 0x47], ['⏮', 0x44], ['⏭', 0x40], ['⏯', 0x43], ['−', 0x07], ['+', 0x15], ['EQ', 0x09],
  ['0', 0x16], ['100+', 0x19], ['200+', 0x0d], ['1', 0x0c], ['2', 0x18], ['3', 0x5e], ['4', 0x08], ['5', 0x1c], ['6', 0x5a], ['7', 0x42], ['8', 0x52], ['9', 0x4a],
];
const hex2 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

const irRemote: PartDef = {
  type: 'ir',
  name: 'IR Receiver + Remote',
  blurb: 'An infrared receiver and a TV-style remote. Click a remote button: the receiver picks up its code. Use the IRremote library: IrReceiver.begin(pin), IrReceiver.decode(), IrReceiver.decodedIRData.command, IrReceiver.resume().',
  terminals: () => [
    { key: 'sig', label: 'Signal (OUT)', kind: 'signal', pos: [row(3, 0), 0.62, -0.75] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 1), 0.62, -0.75] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(3, 2), 0.62, -0.75] },
  ],
  build() {
    const g = new THREE.Group();
    // receiver module
    g.add(at(box(1.7, 0.12, 1.5, mat('#1d4fa0'), 0.04), 0, 0.5, -0.1));
    for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.5], [0.7, 0.5]]) g.add(at(cyl(0.06, 0.06, 0.5, M.dark, 6), x, 0.25, z));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(3, i), 0.66, -0.75));
    const domeMat = new THREE.MeshPhysicalMaterial({ color: '#141418', roughness: 0.25, clearcoat: 0.8 });
    g.add(at(box(0.62, 0.7, 0.5, domeMat, 0.06), 0, 0.92, 0.2));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.rotation.x = Math.PI / 2;
    dome.position.set(0, 0.98, 0.46);
    g.add(dome);
    const recvLed = makeLed('#ff3b30');
    recvLed.group.scale.setScalar(0.45);
    recvLed.group.position.set(0.55, 0.56, 0.35);
    g.add(recvLed.group);
    // the remote, lying in front of the receiver
    const remote = new THREE.Group();
    remote.position.set(0, 0, 4.4);
    remote.rotation.y = 0.08;
    remote.add(at(box(2.3, 0.4, 5.6, mat('#1b1c20', { roughness: 0.6 }), 0.18), 0, 0.2, 0));
    const c = document.createElement('canvas');
    c.width = 230;
    c.height = 560;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1b1c20';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3a1418';
    ctx.fillRect(85, 16, 60, 14);
    const keyXY = (i: number) => [-0.62 + (i % 3) * 0.62, -2.0 + Math.floor(i / 3) * 0.62 + 0.35] as const;
    IR_KEYS.forEach(([label], i) => {
      const [x, z] = keyXY(i);
      const px = (x + 1.15) * 100, pz = (z + 2.8) * 100;
      ctx.fillStyle = i < 3 ? '#b8322c' : i < 9 ? '#2f5fa8' : '#3a3c44';
      ctx.beginPath();
      ctx.arc(px, pz, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${label.length > 2 ? 15 : 20}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px, pz + 1);
    });
    const faceTex = new THREE.CanvasTexture(c);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 5.6), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 }));
    face.rotation.x = -Math.PI / 2;
    face.position.y = 0.41;
    remote.add(face);
    const keys: THREE.Mesh[] = [];
    IR_KEYS.forEach((_, i) => {
      const [x, z] = keyXY(i);
      // a see-through cap over each printed button: it catches the click and lights when pressed
      const key = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      key.position.set(x, 0.46, z);
      key.userData.action = 'press';
      key.userData.keyIndex = i;
      remote.add(key);
      keys.push(key);
    });
    const tip = makeLed('#ff3b30');
    tip.group.scale.setScalar(0.4);
    tip.group.rotation.x = -Math.PI / 2;
    tip.group.position.set(0, 0.25, -2.85);
    remote.add(tip.group);
    g.add(remote);
    g.userData.ir = { keys, tip, recvLed };
    return g;
  },
  update(part, _board, ctx) {
    const u = part.group!.userData.ir;
    const st = part.state;
    const k: number | null = st.key ?? null;
    u.keys.forEach((m: THREE.Mesh, i: number) => { (m.material as THREE.MeshBasicMaterial).opacity = k === i ? 0.35 : 0; });
    if (!ctx.running) st.queue = [];
    if (k != null && k !== st.lastKey) {
      st.last = k;
      st.flashUntil = performance.now() + 160;
      if (ctx.running) (st.queue ??= []).push({ command: IR_KEYS[k][1], address: 0 });
      if (st.queue?.length > 8) st.queue.shift();
    }
    st.lastKey = k;
    const flash = performance.now() < (st.flashUntil ?? 0);
    setLed(u.tip, flash ? 1 : 0);
    setLed(u.recvLed, flash && ctx.running ? 0.8 : 0); // the module's own LED flickers as data arrives
  },
  listener(part) {
    return {
      ir(pin) {
        if (pin !== part.pins.sig) return undefined;
        return part.state.queue?.shift();
      },
    };
  },
  readout: part => (part.state.last != null
    ? `Last button <b>${IR_KEYS[part.state.last][0]}</b> sends <b>${hex2(IR_KEYS[part.state.last][1])}</b> (${IR_KEYS[part.state.last][1]})`
    : 'Click a button on the remote to send its code'),
};

// ---------- HC-05 Bluetooth module ----------
const bluetooth: PartDef = {
  type: 'bluetooth',
  name: 'Bluetooth Module (HC-05)',
  blurb: 'Talks to a phone wirelessly. Wire its TXD to the board’s RX pin and RXD to TX, then use SoftwareSerial bt(RX, TX). Open the phone app from this panel to send and receive messages.',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(6, 1), 0.62, -1.55] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(6, 2), 0.62, -1.55] },
    { key: 'txd', label: 'TXD (to board RX)', kind: 'signal', pos: [row(6, 3), 0.62, -1.55] },
    { key: 'rxd', label: 'RXD (from board TX)', kind: 'signal', pos: [row(6, 4), 0.62, -1.55] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(1.6, 0.12, 3.4, mat('#1f5fbf'), 0.04), 0, 0.5, -0.05));
    for (const [x, z] of [[-0.65, -1.5], [0.65, -1.5], [-0.65, 1.4], [0.65, 1.4]]) g.add(at(cyl(0.06, 0.06, 0.5, M.dark, 6), x, 0.25, z));
    for (let i = 0; i < 6; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(6, i), 0.66, -1.55));
    // the radio board on top, with its zig-zag antenna
    g.add(at(box(1.3, 0.1, 2.5, mat('#1a7a4a'), 0.03), 0, 0.61, 0.25));
    g.add(at(box(0.7, 0.12, 0.7, M.black, 0.03), 0, 0.71, 0.5));
    const ant = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshStandardMaterial({ map: textTexture([{ text: '⌇⌇⌇⌇⌇⌇', x: 128, y: 32, size: 54, color: '#d4a94a' }], 256, 64, '#1a7a4a'), roughness: 0.5 }));
    ant.rotation.x = -Math.PI / 2;
    ant.position.set(0, 0.665, 1.25);
    g.add(ant);
    const led = makeLed('#ff3b30');
    led.group.scale.setScalar(0.45);
    led.group.position.set(0.55, 0.56, -1.0);
    g.add(led.group);
    g.userData.bt = { led };
    return g;
  },
  update(part, _board, ctx) {
    const st = part.state;
    if (!ctx.running) { st.inbox = []; st.fromBoard = ''; } // a new run starts a fresh conversation
    // fast blinking while waiting for a phone, a slow double blink once paired
    const t = performance.now();
    const on = !ctx.running && !st.missing?.length ? false : st.paired ? (t % 2000 < 120 || (t % 2000 > 260 && t % 2000 < 380)) : t % 250 < 125;
    setLed(part.group!.userData.bt.led, on && !st.missing?.length ? 1 : 0);
  },
  listener(part) {
    return {
      btInbox(rx) { return rx === part.pins.txd ? (part.state.inbox ??= []) : undefined; },
      btSend(tx, text) {
        if (tx !== part.pins.rxd) return false;
        part.state.fromBoard = ((part.state.fromBoard ?? '') + text).slice(-4000);
        part.state.rev = (part.state.rev ?? 0) + 1;
        return true;
      },
    };
  },
  readout: part => (part.state.paired ? 'Paired with the phone app' : 'Not paired: open the phone app to connect'),
};

// ---------- TM1637 4-digit display ----------
const DIGIT_W = 100, DIGIT_H = 150;
function drawDigits(canvas: HTMLCanvasElement, segs: number[] | null, brightness: number) {
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#121214';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const lit = segs ? `rgba(255, 52, 40, ${0.45 + (brightness / 7) * 0.55})` : '';
  const seg = (on: boolean, x: number, y: number, w: number, h: number) => {
    g.fillStyle = on ? lit : '#2a1214';
    g.beginPath();
    g.roundRect(x, y, w, h, Math.min(w, h) / 2);
    g.fill();
  };
  for (let d = 0; d < 4; d++) {
    const v = segs?.[d] ?? 0;
    const ox = 22 + d * DIGIT_W + (d >= 2 ? 26 : 0), oy = 20;
    const W = 56, T = 11, H = 52;
    seg(!!(v & 1), ox + 6, oy, W, T); // a
    seg(!!(v & 2), ox + W + 4, oy + 6, T, H); // b
    seg(!!(v & 4), ox + W + 4, oy + H + 14, T, H); // c
    seg(!!(v & 8), ox + 6, oy + 2 * H + 16, W, T); // d
    seg(!!(v & 16), ox - 4, oy + H + 14, T, H); // e
    seg(!!(v & 32), ox - 4, oy + 6, T, H); // f
    seg(!!(v & 64), ox + 6, oy + H + 6, W, T); // g
  }
  // the colon sits between digits 2 and 3 and is driven by digit 2's dot bit
  const colon = !!((segs?.[1] ?? 0) & 0x80);
  for (const cy of [62, 108]) {
    g.fillStyle = colon ? lit : '#2a1214';
    g.beginPath();
    g.arc(2 * DIGIT_W + 22 + 4, cy, 7, 0, Math.PI * 2);
    g.fill();
  }
}

const digits: PartDef = {
  type: 'digits',
  name: '4-Digit Display (TM1637)',
  blurb: 'Four big 7-segment digits with a colon, driven by just two wires. Use the TM1637Display library: TM1637Display display(CLK, DIO); display.setBrightness(7); display.showNumberDec(1234);',
  terminals: () => [
    { key: 'clk', label: 'CLK', kind: 'signal', pos: [-2.55, 0.62, -0.45] },
    { key: 'dio', label: 'DIO', kind: 'signal', pos: [-2.55, 0.62, -0.15] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [-2.55, 0.62, 0.15] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [-2.55, 0.62, 0.45] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(5.4, 0.12, 2.0, mat('#1d4fa0'), 0.05), 0, 0.5, 0));
    for (const [x, z] of [[-2.4, -0.8], [2.4, -0.8], [-2.4, 0.8], [2.4, 0.8]]) g.add(at(cyl(0.06, 0.06, 0.5, M.dark, 6), x, 0.25, z));
    for (const z of [-0.45, -0.15, 0.15, 0.45]) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), -2.55, 0.66, z));
    g.add(at(box(4.4, 0.45, 1.7, mat('#18181b'), 0.04), 0.25, 0.78, 0));
    const canvas = document.createElement('canvas');
    canvas.width = 4 * DIGIT_W + 70;
    canvas.height = DIGIT_H + 20;
    drawDigits(canvas, null, 7);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const screenMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.35 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2 * (canvas.height / canvas.width)), screenMat);
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(0.25, 1.012, 0);
    g.add(screen);
    g.userData.digits = { canvas, tex, screenMat, key: '' };
    return g;
  },
  update(part, board, ctx) {
    const u = part.group!.userData.digits;
    const st = ctx.running ? board.digits.get(`${part.pins.clk},${part.pins.dio}`) : undefined;
    const segs = st?.on ? st.segs : null;
    part.state.segs = segs;
    const key = `${segs?.join(',')}|${st?.brightness}`;
    if (key === u.key) return;
    u.key = key;
    drawDigits(u.canvas, segs, st?.brightness ?? 7);
    u.tex.needsUpdate = true;
    u.screenMat.emissiveIntensity = segs ? 0.9 : 0;
  },
  readout: part => {
    const text = digitsText(part.state.segs);
    return text.trim() ? `Showing <b style="font-family:var(--mono)">${text.replace(/ /g, '&nbsp;')}</b>` : 'Blank: nothing sent to it yet';
  },
};

/** What a 4-digit display reads as text: digits, '-', ':' for the colon and spaces. */
export function digitsText(segs: number[] | null | undefined): string {
  if (!segs) return '    ';
  const ch = (v: number) => {
    const i = SEG_PATTERNS.indexOf(v & 0x7f);
    return v & 0x7f ? (i >= 0 ? '0123456789ABCDEF'[i] : (v & 0x7f) === 0x40 ? '-' : '?') : ' ';
  };
  return `${ch(segs[0])}${ch(segs[1])}${segs[1] & 0x80 ? ':' : ''}${ch(segs[2])}${ch(segs[3])}`;
}
const SEG_PATTERNS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

// ---------- SD card module ----------
const sdcard: PartDef = {
  type: 'sdcard',
  name: 'SD Card Module',
  blurb: 'Saves text files to a memory card, perfect for data loggers. Wire CS to any pin plus MOSI to 11, MISO to 12 and SCK to 13, then use the SD library: SD.begin(CS), SD.open("log.txt", FILE_WRITE), file.println(), file.close().',
  terminals: () => [
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(6, 0, 0.36), 0.62, -1.55] },
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(6, 1, 0.36), 0.62, -1.55] },
    { key: 'miso', label: 'MISO (to 12)', kind: 'signal', pos: [row(6, 2, 0.36), 0.62, -1.55] },
    { key: 'mosi', label: 'MOSI (to 11)', kind: 'signal', pos: [row(6, 3, 0.36), 0.62, -1.55] },
    { key: 'sck', label: 'SCK (to 13)', kind: 'signal', pos: [row(6, 4, 0.36), 0.62, -1.55] },
    { key: 'cs', label: 'CS', kind: 'signal', pos: [row(6, 5, 0.36), 0.62, -1.55] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(2.5, 0.12, 3.6, mat('#1d4fa0'), 0.05), 0, 0.5, 0.1));
    for (const [x, z] of [[-1.05, -1.4], [1.05, -1.4], [-1.05, 1.6], [1.05, 1.6]]) g.add(at(cyl(0.06, 0.06, 0.5, M.dark, 6), x, 0.25, z));
    for (let i = 0; i < 6; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(6, i, 0.36), 0.66, -1.55));
    g.add(at(box(0.6, 0.18, 0.5, M.black, 0.03), -0.6, 0.65, -0.7)); // level shifter chip
    // card slot and the card sticking out of it
    g.add(at(box(2.0, 0.25, 2.1, M.metal, 0.03), 0, 0.69, 0.75));
    g.add(at(box(1.7, 0.08, 0.9, mat('#2b5fd9'), 0.04), 0, 0.68, 2.05));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), new THREE.MeshStandardMaterial({ map: textTexture([{ text: 'SD', x: 128, y: 48, size: 60, weight: '700' }, { text: '8 GB', x: 128, y: 104, size: 30 }], 256, 128, '#2b5fd9') }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.725, 2.1);
    g.add(label);
    const led = makeLed('#ff3b30');
    led.group.scale.setScalar(0.4);
    led.group.position.set(0.9, 0.56, -0.7);
    g.add(led.group);
    g.userData.sd = { led };
    return g;
  },
  update(part, _board, ctx) {
    // the activity light flickers whenever the files change
    const files: Record<string, string> = part.props.files ?? {};
    const size = Object.values(files).reduce((n, f) => n + f.length, 0);
    if (size !== part.state.size) { part.state.size = size; part.state.busyUntil = performance.now() + 120; }
    setLed(part.group!.userData.sd.led, ctx.running && performance.now() < (part.state.busyUntil ?? 0) ? 1 : 0);
  },
  listener(part) {
    return {
      sd(cs, board) {
        if (cs !== part.pins.cs) return undefined;
        if (part.pins.mosi !== 11 || part.pins.miso !== 12 || part.pins.sck !== 13) {
          board.hint('sdspi', 'The SD module talks over SPI, which uses fixed pins: MOSI to 11, MISO to 12 and SCK to 13.');
          return undefined;
        }
        return (part.props.files ??= {});
      },
    };
  },
  readout: part => {
    const files: Record<string, string> = part.props.files ?? {};
    const names = Object.keys(files);
    if (!names.length) return 'The card is empty';
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return names.map(n => {
      const lines = files[n].split('\n');
      const tail = lines.slice(-6).join('\n');
      return `<div class="sd-file"><b>${esc(n)}</b> <small>${files[n].length} bytes</small><pre>${lines.length > 6 ? '…\n' : ''}${esc(tail)}</pre></div>`;
    }).join('');
  },
};

// ---------- robotics: a 2-wheel robot car, line tracks, walls and a robot arm ----------
const ROBOT = { track: 13.6, wheelR: 3.2, vmax: 22, deckY: 3.6 };

/** Wheel speeds from an L298N motor driver's pins. */
function l298n(part: Part, board: Board, vmax: number, track: number) {
  const lvl = (k: string) => (part.pins[k] == null ? 0 : board.level(part.pins[k]));
  // an unwired ENA/ENB has its jumper cap on: full speed
  const en = (k: string) => (part.pins[k] == null ? 1 : lvl(k));
  const dir = (a: string, b: string) => Number(lvl(a) > 0.5) - Number(lvl(b) > 0.5);
  return { left: dir('in1', 'in2') * en('ena') * vmax, right: dir('in3', 'in4') * en('enb') * vmax, track };
}

const robotCar: PartDef = {
  type: 'robot',
  name: 'Robot Car',
  blurb: 'A 2-wheel robot with an L298N motor driver. IN1/IN2 set the left wheel’s direction and IN3/IN4 the right’s (HIGH + LOW = forward). ENA/ENB take analogWrite() for speed; leave them unwired for full speed. Drop the board and sensors onto its deck: they ride along.',
  terminals: () => ['ena', 'in1', 'in2', 'in3', 'in4', 'enb'].map((k, i) => ({
    key: k, label: k.toUpperCase() + (k === 'ena' ? ' (left speed)' : k === 'enb' ? ' (right speed)' : ''), kind: 'signal' as const, pwm: k.startsWith('en'),
    pos: [row(8, i, 0.5), ROBOT.deckY + 0.55, 7.2] as [number, number, number],
  })).concat([
    { key: 'vcc', label: 'VCC', kind: '5V' as any, pwm: false, pos: [row(8, 6, 0.5), ROBOT.deckY + 0.55, 7.2] },
    { key: 'gnd', label: 'GND', kind: 'GND' as any, pwm: false, pos: [row(8, 7, 0.5), ROBOT.deckY + 0.55, 7.2] },
  ]),
  deck: { minX: -5.6, maxX: 5.6, minZ: -8.6, maxZ: 4.6, y: ROBOT.deckY },
  build() {
    const g = new THREE.Group();
    const acrylic = new THREE.MeshPhysicalMaterial({ color: '#f2b705', roughness: 0.35, transmission: 0.15, thickness: 0.3, clearcoat: 0.6 });
    g.add(at(box(12, 0.3, 18.5, acrylic, 0.6), 0, ROBOT.deckY - 0.15, 0));
    // gear motors and wheels on each side
    const wheels: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      g.add(at(box(2.2, 1.9, 6.4, mat('#f0c419'), 0.2), side * 4.6, ROBOT.wheelR, 0));
      const w = new THREE.Group();
      w.position.set(side * (ROBOT.track / 2), ROBOT.wheelR, 0);
      const tire = cyl(ROBOT.wheelR, ROBOT.wheelR, 1.3, mat('#1b1c1f', { roughness: 0.9 }), 32);
      tire.rotation.z = Math.PI / 2;
      const hub = cyl(1.4, 1.4, 1.36, mat('#f0c419'), 24);
      hub.rotation.z = Math.PI / 2;
      w.add(tire, hub);
      // spokes, so you can see the wheel turn
      for (let i = 0; i < 3; i++) { const sp = at(box(1.38, 0.35, 2.6, mat('#d9a90f'), 0.05), 0, 0, 0); sp.rotation.x = (i * Math.PI) / 3; w.add(sp); }
      g.add(w);
      wheels.push(w);
    }
    // caster ball at the front
    g.add(at(cyl(0.8, 0.6, 2.4, M.metal, 16), 0, 2.1, -7.4));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 12), M.metal), 0, 0.9, -7.4));
    // battery pack and the motor driver at the back
    g.add(at(box(7.4, 1.6, 2.2, mat('#1d1e22'), 0.12), 0, ROBOT.deckY + 0.8, 5.6));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.5, 0.5, 1.7, mat('#c9693f'), 16), -2.6 + i * 1.75, ROBOT.deckY + 1.75, 5.6).rotateZ(Math.PI / 2));
    g.add(at(box(4.6, 0.12, 2.0, mat('#c4262d'), 0.04), 0, ROBOT.deckY + 0.35, 7.6));
    g.add(at(box(1.4, 0.9, 1.0, M.black, 0.05), -1.0, ROBOT.deckY + 0.85, 7.9)); // heatsink
    for (let i = 0; i < 8; i++) g.add(at(cyl(0.04, 0.04, 0.35, M.gold, 6), row(8, i, 0.5), ROBOT.deckY + 0.55, 7.2));
    g.userData.robot = { wheels };
    return g;
  },
  drive: (part, board) => l298n(part, board, ROBOT.vmax, ROBOT.track),
  update(part, _board, ctx) {
    const st = part.state;
    const [l, r] = part.group!.userData.robot.wheels;
    l.rotation.x -= ((st.vl ?? 0) / ROBOT.wheelR) * ctx.simDt;
    r.rotation.x -= ((st.vr ?? 0) / ROBOT.wheelR) * ctx.simDt;
    const speed = Math.abs(st.vl ?? 0) + Math.abs(st.vr ?? 0);
    ctx.audio.set(part.id, ctx.running && speed > 0.5 ? 70 + speed * 2.2 : null); // gear-motor whine
  },
  readout: part => {
    const st = part.state;
    if (st.bumpUntil > performance.now()) return '<span class="warn-inline">Bump! The robot hit something</span>';
    const v = ((st.vl ?? 0) + (st.vr ?? 0)) / 2;
    return Math.abs(st.vl ?? 0) + Math.abs(st.vr ?? 0) < 0.5 ? 'Stopped' : `Speed <b>${v.toFixed(0)} cm/s</b> · left wheel ${(st.vl ?? 0).toFixed(0)}, right ${(st.vr ?? 0).toFixed(0)}`;
  },
};

/** The black line on the track mat: a stadium (two straights joined by half circles). */
export const TRACK = { straight: 28, radius: 11, line: 2.2, w: 62, d: 42 };
export function onTrackLine(lx: number, lz: number): boolean {
  const dx = Math.max(Math.abs(lx) - TRACK.straight / 2, 0);
  return Math.abs(Math.hypot(dx, lz) - TRACK.radius) < TRACK.line / 2;
}

const trackMat: PartDef = {
  type: 'track',
  name: 'Line Track',
  blurb: 'A printed mat with a black loop for line-following robots. Parts can sit on top of it.',
  noPins: true,
  flat: true,
  terminals: () => [],
  build() {
    const g = new THREE.Group();
    const PX = 12;
    const c = document.createElement('canvas');
    c.width = TRACK.w * PX;
    c.height = TRACK.d * PX;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#d9d5ca';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.strokeStyle = '#141416';
    ctx.lineWidth = TRACK.line * PX;
    ctx.beginPath();
    const cx = c.width / 2, cz = c.height / 2, hs = (TRACK.straight / 2) * PX, rr = TRACK.radius * PX;
    ctx.moveTo(cx - hs, cz - rr);
    ctx.lineTo(cx + hs, cz - rr);
    ctx.arc(cx + hs, cz, rr, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(cx - hs, cz + rr);
    ctx.arc(cx - hs, cz, rr, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();
    ctx.fillStyle = '#e2533b';
    ctx.fillRect(cx - 2, cz + rr - TRACK.line * PX, 4, TRACK.line * PX * 2); // start line
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TRACK.w, TRACK.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.04;
    m.receiveShadow = true;
    g.add(m);
    return g;
  },
};

const lineSensor: PartDef = {
  type: 'linesensor',
  name: 'Line Sensor (2 eyes)',
  blurb: 'Two infrared eyes that look down. Each output reads HIGH over a black line and LOW over the white mat. Mount it at the front of a robot car.',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(4, 0, 0.42), 0.62, 0.65] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 1, 0.42), 0.62, 0.65] },
    { key: 'l', label: 'Left eye', kind: 'signal', pos: [row(4, 2, 0.42), 0.62, 0.65] },
    { key: 'r', label: 'Right eye', kind: 'signal', pos: [row(4, 3, 0.42), 0.62, 0.65] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(3.4, 0.12, 2.0, mat('#1b1c20'), 0.04), 0, 0.5, 0));
    for (const x of [-1.2, 1.2]) for (const z of [-0.75, 0.75]) g.add(at(cyl(0.06, 0.06, 0.5, M.dark, 6), x, 0.25, z));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(4, i, 0.42), 0.66, 0.65));
    const eyes: ReturnType<typeof makeLed>[] = [];
    for (const x of [-0.7, 0.7]) {
      g.add(at(box(0.6, 0.35, 0.5, mat('#2a2c33'), 0.04), x, 0.35, -0.6));
      g.add(at(cyl(0.16, 0.16, 0.3, mat('#5aa7ff', { roughness: 0.2 }), 12), x - 0.13, 0.22, -0.6));
      g.add(at(cyl(0.16, 0.16, 0.3, M.black, 12), x + 0.13, 0.22, -0.6));
      const led = makeLed('#ff3b30');
      led.group.scale.setScalar(0.35);
      led.group.position.set(x, 0.56, -0.05);
      g.add(led.group);
      eyes.push(led);
    }
    g.userData.eyes = eyes;
    return g;
  },
  update(part, _board, ctx) {
    // look straight down from each eye and ask any track mat underneath whether that spot is black
    const g = part.group!;
    const tracks = ctx.parts.filter(p => p.type === 'track' && p.group);
    const seen = [-0.7, 0.7].map(x => {
      const w = g.localToWorld(new THREE.Vector3(x, 0, -0.6));
      return tracks.some(t => { const l = t.group!.worldToLocal(w.clone()); return onTrackLine(l.x, l.z); });
    });
    part.state.eyes = seen;
    g.userData.eyes.forEach((led: any, i: number) => setLed(led, ctx.running && seen[i] ? 0.9 : 0));
  },
  listener(part) {
    return {
      readDigital(pin) {
        if (pin === part.pins.l) return part.state.eyes?.[0] ? 1 : 0;
        if (pin === part.pins.r) return part.state.eyes?.[1] ? 1 : 0;
        return undefined;
      },
    };
  },
  readout: part => `Left eye: <b>${part.state.eyes?.[0] ? 'line' : 'white'}</b> · Right eye: <b>${part.state.eyes?.[1] ? 'line' : 'white'}</b>`,
};

const wall: PartDef = {
  type: 'wall',
  name: 'Wall Block',
  blurb: 'A building block for mazes and obstacle courses. Snaps to the grid; robots bump into it and distance sensors see it.',
  noPins: true,
  obstacle: true,
  defaults: { len: '10', color: '#8e9aaf' },
  props: [
    { key: 'len', label: 'Length', type: 'select', options: [{ value: '5', label: '5 cm' }, { value: '10', label: '10 cm' }, { value: '20', label: '20 cm' }] },
    { key: 'color', label: 'Color', type: 'select', options: [{ value: '#8e9aaf', label: 'Grey' }, { value: '#e2533b', label: 'Red' }, { value: '#3b82c4', label: 'Blue' }, { value: '#f2b705', label: 'Yellow' }, { value: '#3fae5a', label: 'Green' }] },
  ],
  terminals: () => [],
  build(part) {
    const g = new THREE.Group();
    const len = Number(part.props.len) || 10;
    const m = mat(part.props.color ?? '#8e9aaf', { roughness: 0.6 });
    // tall enough that a sensor riding on a robot's deck still sees it
    g.add(at(box(len, 8, 1.6, m, 0.25), 0, 4, 0));
    // studs on top, like a building brick
    for (let x = -len / 2 + 1.25; x < len / 2; x += 2.5) g.add(at(cyl(0.45, 0.45, 0.3, m, 16), x, 8.15, 0));
    return g;
  },
};

// ---------- robot arm ----------
export const ARM = { base: 4, upper: 8, fore: 8.5 };
/** Where the arm's claw tip is, in the arm's own frame, for servo angles in degrees. */
export function armTip(baseDeg: number, shoulderDeg: number, elbowDeg: number): { x: number; y: number; z: number } {
  const t1 = ((90 - shoulderDeg) * Math.PI) / 180, t2 = ((90 - elbowDeg) * Math.PI) / 180;
  const reach = ARM.upper * Math.sin(t1) + ARM.fore * Math.sin(t1 + t2);
  const y = ARM.base + ARM.upper * Math.cos(t1) + ARM.fore * Math.cos(t1 + t2);
  const yaw = ((baseDeg - 90) * Math.PI) / 180;
  return { x: reach * Math.sin(yaw), y, z: reach * Math.cos(yaw) };
}

const robotArm: PartDef = {
  type: 'arm',
  name: 'Robot Arm (4 servos)',
  blurb: 'A desktop arm with four servos: base (turn), shoulder, elbow and claw. Drive each with the Servo library. Claw below 40° grips, above 70° opens. Pick up cubes and place them on the pad.',
  terminals: () => [
    ...['base', 'shoulder', 'elbow', 'claw'].map((k, i) => ({ key: k, label: `${k[0].toUpperCase()}${k.slice(1)} servo`, kind: 'signal' as const, pwm: true, pos: [row(6, i, 0.45), 0.62, -2.9] as [number, number, number] })),
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(6, 4, 0.45), 0.62, -2.9] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(6, 5, 0.45), 0.62, -2.9] },
  ],
  build() {
    const g = new THREE.Group();
    const blue = mat('#2a5bd7', { roughness: 0.45 });
    const white = mat('#eef0f3', { roughness: 0.4 });
    g.add(at(box(6.4, 0.12, 6.4, mat('#1d4fa0'), 0.05), 0, 0.5, -0.2));
    for (let i = 0; i < 6; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(6, i, 0.45), 0.66, -2.9));
    g.add(at(cyl(2.6, 2.9, 1.4, white, 40), 0, 1.25, 0.3));
    const yaw = new THREE.Group();
    yaw.position.set(0, 1.95, 0.3);
    yaw.add(at(cyl(2.2, 2.2, 0.5, blue, 40), 0, 0.25, 0));
    for (const x of [-1.1, 1.1]) yaw.add(at(box(0.4, 2.6, 1.6, white, 0.08), x, 1.5, 0));
    const shoulder = new THREE.Group();
    shoulder.position.set(0, ARM.base - 1.95, 0);
    shoulder.add(at(box(1.6, ARM.upper, 1.0, blue, 0.2), 0, ARM.upper / 2, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, ARM.upper, 0);
    elbow.add(at(cyl(0.8, 0.8, 1.9, white, 20).rotateZ(Math.PI / 2), 0, 0, 0));
    elbow.add(at(box(1.3, ARM.fore - 1.6, 0.9, blue, 0.2), 0, (ARM.fore - 1.6) / 2, 0));
    const claw = new THREE.Group();
    claw.position.set(0, ARM.fore - 1.6, 0);
    claw.add(at(box(2.2, 0.5, 1.0, white, 0.08), 0, 0.2, 0));
    const fingers: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const f = at(box(0.35, 1.5, 0.8, mat('#2f3238'), 0.06), side * 0.8, 1.15, 0);
      claw.add(f);
      fingers.push(f);
    }
    const tip = new THREE.Object3D();
    tip.position.set(0, 1.6, 0);
    claw.add(tip);
    elbow.add(claw);
    shoulder.add(elbow);
    yaw.add(shoulder);
    g.add(yaw);
    g.userData.arm = { yaw, shoulder, elbow, fingers, tip };
    return g;
  },
  update(part, board, ctx) {
    const u = part.group!.userData.arm;
    const st = part.state;
    // servos glide towards their commanded angles at about 300°/s, like real SG90s
    const want = (k: string) => (ctx.running && part.pins[k] != null ? board.servoAngles.get(part.pins[k]!) ?? 90 : st[k] ?? 90);
    for (const k of ['base', 'shoulder', 'elbow', 'claw']) {
      const cur = st[k] ?? 90, target = want(k);
      st[k] = cur + Math.max(-300 * ctx.simDt, Math.min(300 * ctx.simDt, target - cur));
    }
    u.yaw.rotation.y = ((st.base - 90) * Math.PI) / 180;
    u.shoulder.rotation.x = ((90 - st.shoulder) * Math.PI) / 180;
    u.elbow.rotation.x = ((90 - st.elbow) * Math.PI) / 180;
    const open = Math.max(0, Math.min(1, (st.claw - 30) / 60));
    u.fingers.forEach((f: THREE.Mesh, i: number) => { f.position.x = (i ? 1 : -1) * (0.3 + open * 0.75); });
    // grab a cube when the claw closes around it; let go when it opens
    const closed = st.claw < 40;
    const tip: THREE.Vector3 = u.tip.getWorldPosition(new THREE.Vector3());
    if (closed && !st.wasClosed && !st.holding) {
      const cube = ctx.parts.find(p => p.type === 'cube' && !p.state.heldBy && p.group && tip.distanceTo(p.group.position.clone().setY(p.group.position.y + 1)) < 1.8);
      if (cube) { cube.state.heldBy = part.id; st.holding = cube.id; ctx.audio.click(); }
    }
    if (!closed && st.holding) {
      const cube = ctx.parts.find(p => p.id === st.holding);
      if (cube) delete cube.state.heldBy;
      st.holding = null;
    }
    st.wasClosed = closed;
    const held = st.holding && ctx.parts.find(p => p.id === st.holding);
    if (held?.group) {
      held.x = tip.x;
      held.z = tip.z;
      held.group.position.set(tip.x, Math.max(0, tip.y - 1), tip.z);
      held.group.updateMatrixWorld(true);
    }
  },
  readout: part => {
    const st = part.state, f = (k: string) => Math.round(st[k] ?? 90);
    return `Base <b>${f('base')}°</b> · Shoulder <b>${f('shoulder')}°</b> · Elbow <b>${f('elbow')}°</b> · Claw <b>${f('claw')}°</b>${st.holding ? ' · <b>holding a cube</b>' : ''}`;
  },
};

const cube: PartDef = {
  type: 'cube',
  name: 'Cube',
  blurb: 'A small block for the robot arm to pick up and move.',
  noPins: true,
  defaults: { color: '#e2533b' },
  props: [{ key: 'color', label: 'Color', type: 'select', options: [{ value: '#e2533b', label: 'Red' }, { value: '#3b82c4', label: 'Blue' }, { value: '#3fae5a', label: 'Green' }, { value: '#f2b705', label: 'Yellow' }] }],
  terminals: () => [],
  build(part) {
    const g = new THREE.Group();
    g.add(at(box(2, 2, 2, mat(part.props.color ?? '#e2533b', { roughness: 0.5 }), 0.2), 0, 1, 0));
    return g;
  },
  update(part, _board, ctx) {
    // a dropped cube falls back to the desk
    const g = part.group!;
    if (!part.state.heldBy && g.position.y > 0) g.position.y = Math.max(0, g.position.y - 40 * ctx.dt);
  },
};

const pad: PartDef = {
  type: 'pad',
  name: 'Target Pad',
  blurb: 'A marked square to drop cubes on.',
  noPins: true,
  flat: true,
  terminals: () => [],
  build() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: textTexture([{ text: 'DROP', x: 128, y: 112, size: 46, color: '#1f9e95', weight: '700' }, { text: 'HERE', x: 128, y: 160, size: 46, color: '#1f9e95', weight: '700' }], 256, 256, '#dff3f1'), roughness: 0.8 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    g.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.0, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: '#1f9e95' }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(1.41);
    g.add(ring);
    return g;
  },
};

// ---------- more robot sensors: bumper, IR obstacle, wheel encoders, light eyes and a beacon ----------
/** Distance to the nearest obstacle straight ahead of a point on a part (local frame), or Infinity. */
function lookAhead(g: THREE.Object3D, ctx: UpdateCtx, from: [number, number, number], dirZ: number, far: number): number {
  const origin = new THREE.Vector3(...from).applyMatrix4(g.matrixWorld);
  const dir = new THREE.Vector3(0, 0, dirZ).transformDirection(g.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(ctx.obstacles.filter(o => o !== g), true)[0];
  return hit ? hit.distance : Infinity;
}
/** The robot (or other host) a part is mounted on. */
const hostPart = (part: Part, ctx: UpdateCtx) => (part.props.mount ? ctx.parts.find(p => p.id === part.props.mount) : undefined);

const bumper: PartDef = {
  type: 'bumper',
  name: 'Bumper Switch',
  blurb: 'A micro switch with a long lever. Mount it at the front of a robot: the lever clicks when the robot touches a wall. Wire it to GND and use INPUT_PULLUP: it reads LOW when pressed. You can also click the lever.',
  terminals: () => [
    { key: 'sig', label: 'Signal (NO)', kind: 'signal', pos: [-0.35, 0.62, 0.7] },
    { key: 'gnd', label: 'GND (COM)', kind: 'GND', pos: [0.35, 0.62, 0.7] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(2.0, 0.12, 1.8, mat('#1b1c20'), 0.04), 0, 0.5, 0.2));
    for (const x of [-0.35, 0.35]) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), x, 0.66, 0.7));
    g.add(at(box(1.4, 0.65, 0.7, mat('#26272c'), 0.06), 0, 0.88, -0.2));
    g.add(at(box(0.25, 0.18, 0.25, mat('#e2533b'), 0.03), 0.3, 1.25, -0.2)); // the plunger
    const lever = new THREE.Group();
    lever.position.set(-0.55, 1.05, -0.45);
    const arm = at(box(0.12, 0.05, 2.0, M.metal, 0.01), 0.55, 0, -0.9);
    arm.userData.action = 'press';
    lever.add(arm);
    const roller = cyl(0.22, 0.22, 0.25, mat('#30323a'), 14);
    roller.rotation.z = Math.PI / 2;
    roller.position.set(0.55, -0.05, -1.9);
    roller.userData.action = 'press';
    lever.add(roller);
    g.add(lever);
    g.userData.lever = lever;
    return g;
  },
  update(part, board, ctx) {
    // the lever reaches 2 cm out front: anything closer presses it
    // and a robot carrying it that runs into anything while driving forward squashes it too
    const host = hostPart(part, ctx);
    const crashed = !!host && host.state.bumpFwd && board.time - (host.state.bumpAt ?? -1e9) < 120;
    part.state.touching = crashed || lookAhead(part.group!, ctx, [0, 1.05, -0.4], -1, 2.6) < 2.1;
    const pressed = part.state.touching || part.state.pressed;
    if (pressed && !part.state.wasDown) ctx.audio.click();
    part.state.wasDown = pressed;
    part.group!.userData.lever.rotation.y = pressed ? 0.12 : 0;
  },
  listener(part) {
    return {
      readDigital(pin, board) {
        if (pin !== part.pins.sig) return undefined;
        if (part.state.touching || part.state.pressed) return 0;
        if (board.pins[pin].mode !== 'INPUT_PULLUP') board.hint('bumperpull', 'The bumper switch connects the pin to GND, so use pinMode(pin, INPUT_PULLUP). Without the pull-up the pin floats.');
        return undefined;
      },
    };
  },
  readout: part => `Lever: <b>${part.state.touching || part.state.pressed ? 'pressed' : 'free'}</b>`,
};

const irProx: PartDef = {
  type: 'irprox',
  name: 'IR Obstacle Sensor',
  blurb: 'An infrared LED and receiver that notice anything close in front (adjust the range with its knob). OUT reads LOW when something is there, and its green light comes on. Faces the way its LEDs point.',
  defaults: { range: '10' },
  props: [{ key: 'range', label: 'Range (trimmer)', type: 'select', options: [{ value: '5', label: '5 cm' }, { value: '10', label: '10 cm' }, { value: '20', label: '20 cm' }] }],
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(3, 0, 0.42), 0.62, 0.95] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(3, 1, 0.42), 0.62, 0.95] },
    { key: 'out', label: 'OUT', kind: 'signal', pos: [row(3, 2, 0.42), 0.62, 0.95] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(1.5, 0.12, 3.0, mat('#1d4fa0'), 0.04), 0, 0.5, 0));
    for (let i = 0; i < 3; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(3, i, 0.42), 0.66, 0.95));
    g.add(at(box(0.6, 0.35, 0.6, mat('#2f62c9'), 0.04), 0.2, 0.72, 0.2)); // range trimmer
    g.add(at(cyl(0.12, 0.12, 0.1, mat('#e9e6df'), 10), 0.2, 0.92, 0.2));
    for (const [x, c] of [[-0.35, '#dfe7ef'], [0.35, '#141418']] as const) {
      const e = cyl(0.2, 0.2, 0.8, mat(c, { roughness: 0.2 }), 14);
      e.rotation.x = Math.PI / 2;
      e.position.set(x, 0.75, -1.4);
      g.add(e);
    }
    const led = makeLed('#34c759');
    led.group.scale.setScalar(0.35);
    led.group.position.set(-0.45, 0.56, 0.3);
    g.add(led.group);
    g.userData.led = led;
    return g;
  },
  update(part, _board, ctx) {
    part.state.near = lookAhead(part.group!, ctx, [0, 0.75, -1.8], -1, 40) < (Number(part.props.range) || 10);
    setLed(part.group!.userData.led, ctx.running && part.state.near ? 0.9 : 0);
  },
  listener(part) {
    return { readDigital(pin) { return pin === part.pins.out ? (part.state.near ? 0 : 1) : undefined; } };
  },
  readout: part => `Something in front: <b>${part.state.near ? 'yes (OUT = LOW)' : 'no (OUT = HIGH)'}</b>`,
};

export const CM_PER_TICK = (2 * Math.PI * 3.2) / 20; // 20-slot encoder discs on 3.2 cm wheels
const encoders: PartDef = {
  type: 'encoders',
  name: 'Wheel Encoders (pair)',
  blurb: 'Slotted discs on both wheels with light gates. Each output gives one pulse for every 1/20 of a wheel turn (about 1 cm). Mount it on a robot and count pulses with attachInterrupt() on pins 2 and 3.',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(4, 0, 0.42), 0.62, 0.55] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 1, 0.42), 0.62, 0.55] },
    { key: 'l', label: 'Left pulses', kind: 'signal', pos: [row(4, 2, 0.42), 0.62, 0.55] },
    { key: 'r', label: 'Right pulses', kind: 'signal', pos: [row(4, 3, 0.42), 0.62, 0.55] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(2.4, 0.12, 1.6, mat('#1b1c20'), 0.04), 0, 0.5, 0));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(4, i, 0.42), 0.66, 0.55));
    const leds: ReturnType<typeof makeLed>[] = [];
    for (const x of [-0.75, 0.75]) {
      // a U-shaped light gate
      for (const dz of [-0.35, 0.05]) g.add(at(box(0.45, 0.6, 0.18, M.black, 0.03), x, 0.86, dz - 0.15));
      const led = makeLed('#ff3b30');
      led.group.scale.setScalar(0.3);
      led.group.position.set(x, 0.56, 0.35);
      g.add(led.group);
      leds.push(led);
    }
    g.userData.leds = leds;
    return g;
  },
  update(part, _board, ctx) {
    const host = hostPart(part, ctx);
    part.state.host = host?.state.distL != null ? host : null;
    const [l, r] = part.group!.userData.leds;
    setLed(l, ctx.running && part.state.levL ? 0.8 : 0);
    setLed(r, ctx.running && part.state.levR ? 0.8 : 0);
  },
  listener(part) {
    /** Half-pulses so far on one wheel (slot, gap, slot…), at this exact moment of sketch time. */
    const halves = (side: 'L' | 'R', board: Board) => {
      const h = part.state.host;
      if (!h) return 0;
      const v = Math.abs(side === 'L' ? h.state.vl ?? 0 : h.state.vr ?? 0);
      const dist = (h.state[`dist${side}`] ?? 0) + (v * Math.max(0, board.time - (h.state.odoAt ?? board.time))) / 1000;
      let n = Math.floor(dist / (CM_PER_TICK / 2));
      const k = `half${side}`;
      if (n < (part.state[k] ?? 0) - 4) part.state[k] = n; // a new run started from zero
      n = Math.max(n, part.state[k] ?? 0); // never count backwards
      part.state[k] = n;
      part.state[`ticks${side}`] = Math.floor(n / 2);
      return n;
    };
    return {
      readDigital(pin, board) {
        // each slot gives one whole pulse: HIGH across the slot, LOW across the bar
        if (pin === part.pins.l) { const lv = halves('L', board) % 2; part.state.levL = lv; return lv; }
        if (pin === part.pins.r) { const lv = halves('R', board) % 2; part.state.levR = lv; return lv; }
        return undefined;
      },
    };
  },
  readout: part => (part.state.host ? `Pulses: left <b>${part.state.ticksL ?? 0}</b>, right <b>${part.state.ticksR ?? 0}</b>` : 'Mount it on a robot to measure its wheels'),
};

const EYE_ANGLE = 0.55; // each eye looks about 30° out to its side
const lightEyes: PartDef = {
  type: 'lighteyes',
  name: 'Light Seeker Eyes',
  blurb: 'Two light sensors on a bracket, angled left and right. analogRead() is higher on the side that faces a light, so a robot can steer toward a beacon.',
  terminals: () => [
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(4, 0, 0.42), 0.62, 0.75] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(4, 1, 0.42), 0.62, 0.75] },
    { key: 'l', label: 'Left eye', kind: 'signal', analog: true, pos: [row(4, 2, 0.42), 0.62, 0.75] },
    { key: 'r', label: 'Right eye', kind: 'signal', analog: true, pos: [row(4, 3, 0.42), 0.62, 0.75] },
  ],
  build() {
    const g = new THREE.Group();
    g.add(at(box(4.0, 0.12, 1.8, mat('#1b1c20'), 0.04), 0, 0.5, 0));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(4, i, 0.42), 0.66, 0.75));
    for (const side of [-1, 1]) {
      const head = new THREE.Group();
      head.position.set(side * 1.4, 0.95, -0.4);
      head.rotation.y = -side * EYE_ANGLE; // left eye turns left, right eye turns right
      head.add(at(box(0.9, 0.7, 0.4, mat('#2a2c33'), 0.06), 0, 0, 0));
      const cell = cyl(0.3, 0.3, 0.12, mat('#d9a441', { roughness: 0.3 }), 18);
      cell.rotation.x = Math.PI / 2;
      cell.position.z = -0.22;
      head.add(cell);
      g.add(head);
    }
    return g;
  },
  update(part, _board, ctx) {
    const g = part.group!;
    const beacons = ctx.parts.filter(p => p.type === 'beacon' && p.group);
    part.state.levels = [-1, 1].map(side => {
      const pos = g.localToWorld(new THREE.Vector3(side * 1.4, 0.95, -0.6));
      const look = new THREE.Vector3(side * Math.sin(EYE_ANGLE), 0, -Math.cos(EYE_ANGLE)).transformDirection(g.matrixWorld);
      let v = 40; // a dim room
      for (const b of beacons) {
        const to = b.group!.position.clone().setY(pos.y).sub(pos);
        const d = to.length();
        const facing = Math.max(0, look.dot(to.normalize()));
        v += 1350 * Math.exp(-d / 60) * facing * facing;
      }
      return Math.min(1023, Math.round(v));
    });
  },
  listener(part) {
    return {
      readAnalog(pin) {
        if (pin === part.pins.l) return part.state.levels?.[0];
        if (pin === part.pins.r) return part.state.levels?.[1];
        return undefined;
      },
    };
  },
  readout: part => `Left eye ≈ <b>${part.state.levels?.[0] ?? 0}</b> · Right eye ≈ <b>${part.state.levels?.[1] ?? 0}</b>`,
};

const beacon: PartDef = {
  type: 'beacon',
  name: 'Light Beacon',
  blurb: 'A bright lamp on a stand for light-seeking robots. Drag it around the desk.',
  noPins: true,
  defaults: { color: '#ffd34d' },
  props: [{ key: 'color', label: 'Light', type: 'select', options: [{ value: '#ffd34d', label: 'Warm' }, { value: '#7fd3ff', label: 'Cool' }, { value: '#ff6b6b', label: 'Red' }] }],
  terminals: () => [],
  build(part) {
    const g = new THREE.Group();
    const c = part.props.color ?? '#ffd34d';
    g.add(at(cyl(2.0, 2.3, 0.6, mat('#2a2c33'), 32), 0, 0.3, 0));
    g.add(at(cyl(0.25, 0.25, 6, M.metal, 12), 0, 3.3, 0));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 3 }));
    bulb.position.y = 6.9;
    g.add(bulb);
    const glow = glowSprite(c, 9);
    (glow.material as THREE.SpriteMaterial).opacity = 0.75;
    glow.position.y = 6.9;
    g.add(glow);
    return g;
  },
};

// ---------- Bolt: a complete little robot with a face, a turning head and a voice ----------
const BOLT = { wheelR: 2, track: 10.2, vmax: 16, deckY: 3.6, eyeY: 2.45, eyeZ: -2.3 };
const BOLT_TERMS: [string, string][] = [
  ['ena', 'ENA (left speed)'], ['in1', 'IN1'], ['in2', 'IN2'], ['in3', 'IN3'], ['in4', 'IN4'], ['enb', 'ENB (right speed)'],
  ['head', 'Head'], ['trig', 'TRIG'], ['echo', 'ECHO'], ['din', 'DIN'], ['clk', 'CLK'], ['cs', 'CS'], ['buzz', 'Voice'],
];

/** Draw the LED face: lit dots on a dark panel. */
function drawBoltFace(c: HTMLCanvasElement, rows: number[] | null, level: number) {
  const g = c.getContext('2d')!;
  const cell = c.width / 8;
  g.fillStyle = '#0c0d10';
  g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
    const on = !!rows && ((rows[r] >> (7 - col)) & 1) === 1;
    g.fillStyle = on ? `rgba(70, 225, 255, ${0.45 + level * 0.55})` : '#1a2026';
    g.beginPath();
    g.arc((col + 0.5) * cell, (r + 0.5) * cell, cell * 0.38, 0, Math.PI * 2);
    g.fill();
  }
}

const bolt: PartDef = {
  type: 'bolt',
  name: 'Bolt (mini robot)',
  blurb: 'A complete little robot. Two wheels (L298N: IN1–IN4, ENA, ENB), a head on a servo with ultrasonic eyes that turn with it, an 8×8 LED face (LedControl) and a buzzer voice. Head 90° looks ahead, 180° left, 0° right. The board rides on its back.',
  terminals: () => [
    ...BOLT_TERMS.map(([key, label], i) => ({ key, label, kind: 'signal' as const, pos: [row(15, i, 0.58), BOLT.deckY - 0.25, 6.15] as [number, number, number] })),
    { key: 'vcc', label: 'VCC', kind: '5V', pos: [row(15, 13, 0.58), BOLT.deckY - 0.25, 6.15] },
    { key: 'gnd', label: 'GND', kind: 'GND', pos: [row(15, 14, 0.58), BOLT.deckY - 0.25, 6.15] },
  ],
  deck: { minX: -4.5, maxX: 4.5, minZ: -0.5, maxZ: 5.8, y: BOLT.deckY },
  build() {
    const g = new THREE.Group();
    const shell = new THREE.MeshPhysicalMaterial({ color: '#f3f5f7', roughness: 0.35, clearcoat: 0.7 });
    const accent = mat('#14b8c4', { roughness: 0.4 });
    const dark = mat('#23252b', { roughness: 0.6 });
    // body
    g.add(at(box(9, 2.8, 12, shell, 0.9), 0, BOLT.deckY - 1.4, 0));
    g.add(at(box(9.1, 0.35, 12.1, accent, 0.15), 0, 1.5, 0));
    // the connector strip across its back
    g.add(at(box(8.9, 0.14, 0.7, mat('#1d4fa0'), 0.03), 0, BOLT.deckY - 0.5, 6.15));
    for (let i = 0; i < 15; i++) g.add(at(cyl(0.035, 0.035, 0.3, M.gold, 6), row(15, i, 0.58), BOLT.deckY - 0.4, 6.15));
    // wheels
    const wheels: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(side * (BOLT.track / 2), BOLT.wheelR, 0.5);
      const tire = cyl(BOLT.wheelR, BOLT.wheelR, 1, mat('#1b1c1f', { roughness: 0.9 }), 28);
      tire.rotation.z = Math.PI / 2;
      const hub = cyl(0.9, 0.9, 1.05, accent, 18);
      hub.rotation.z = Math.PI / 2;
      w.add(tire, hub);
      for (let i = 0; i < 2; i++) { const sp = box(1.07, 0.25, 1.7, mat('#e9edf1'), 0.03); sp.rotation.x = (i * Math.PI) / 2; w.add(sp); }
      g.add(w);
      wheels.push(w);
    }
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), M.metal), 0, 0.75, -4.6)); // front caster
    // neck and head, which turn together on the servo
    g.add(at(cyl(1.1, 1.3, 0.5, dark, 24), 0, BOLT.deckY + 0.2, -3));
    const head = new THREE.Group();
    head.position.set(0, BOLT.deckY + 0.45, -3);
    head.add(at(box(6.2, 3.8, 4, shell, 0.85), 0, 1.9, 0));
    // face panel
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    drawBoltFace(c, null, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0, roughness: 0.3 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), faceMat);
    face.rotation.y = Math.PI;
    face.position.set(0, 1.5, -2.08); // just in front of the dark panel behind it
    head.add(at(box(2.9, 2.9, 0.12, dark, 0.05), 0, 1.5, -2.0));
    head.add(face);
    // ultrasonic eyes on its brow
    for (const x of [-1.35, 1.35]) {
      const eye = cyl(0.55, 0.55, 0.45, M.metal, 22);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(x, 3.25, -2.1);
      head.add(eye);
      const mesh = cyl(0.42, 0.42, 0.47, dark, 22);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, 3.25, -2.11);
      head.add(mesh);
    }
    // antenna with a light that blinks when it speaks
    head.add(at(cyl(0.07, 0.07, 1.4, M.metal, 8), 0, 4.4, 0));
    const tip = makeLed('#ff5040');
    tip.group.scale.setScalar(0.5);
    tip.group.position.set(0, 4.95, 0);
    head.add(tip.group);
    g.add(head);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshBasicMaterial({ color: '#14b8c4', transparent: true, opacity: 0, depthWrite: false }));
    head.add(beam);
    g.userData.bolt = { head, wheels, canvas: c, tex, faceMat, tip, beam, key: '' };
    return g;
  },
  drive: (part, board) => l298n(part, board, BOLT.vmax, BOLT.track),
  update(part, board, ctx) {
    const u = part.group!.userData.bolt;
    const st = part.state;
    // wheels
    u.wheels[0].rotation.x -= ((st.vl ?? 0) / BOLT.wheelR) * ctx.simDt;
    u.wheels[1].rotation.x -= ((st.vr ?? 0) / BOLT.wheelR) * ctx.simDt;
    // the head glides towards the servo's commanded angle
    const want = ctx.running && part.pins.head != null ? board.servoAngles.get(part.pins.head) ?? 90 : st.headAngle ?? 90;
    const cur = st.headAngle ?? 90;
    st.headAngle = cur + Math.max(-300 * ctx.simDt, Math.min(300 * ctx.simDt, want - cur));
    u.head.rotation.y = ((st.headAngle - 90) * Math.PI) / 180;
    u.head.updateMatrixWorld(true);
    // eyes: measure straight out of the head
    const hit = lookAhead(u.head, ctx, [0, BOLT.eyeY + 0.8, BOLT.eyeZ], -1, 400);
    st.distance = Math.max(2, hit);
    const show = ctx.running && performance.now() - (st.lastPing ?? -1e9) < 300;
    const len = Math.min(st.distance, 60);
    u.beam.scale.set(1.8, 1, len);
    u.beam.position.set(0, BOLT.eyeY + 0.8, BOLT.eyeZ - len / 2);
    (u.beam.material as THREE.MeshBasicMaterial).opacity = show ? 0.16 : 0;
    // face
    const data = ctx.running ? board.matrices.get([part.pins.din, part.pins.clk, part.pins.cs].join(',')) : undefined;
    const rows = data && !data.shutdown ? data.rows : null;
    const level = data ? data.intensity / 15 : 0;
    st.faceRows = rows;
    const key = `${rows?.join(',')}|${level}`;
    if (key !== u.key) {
      u.key = key;
      drawBoltFace(u.canvas, rows, level);
      u.tex.needsUpdate = true;
      u.faceMat.emissiveIntensity = rows ? 1 : 0;
    }
    // voice and motors share one sound channel: a beep wins over the whine
    const freq = ctx.running ? board.activeTone(part.pins.buzz) : null;
    st.freq = freq;
    setLed(u.tip, freq ? 1 : 0);
    const speed = Math.abs(st.vl ?? 0) + Math.abs(st.vr ?? 0);
    ctx.audio.set(part.id, freq ?? (ctx.running && speed > 0.5 ? 90 + speed * 3 : null));
  },
  listener(part) {
    return {
      onWrite(pin, value) {
        if (pin !== part.pins.trig) return;
        if (value) part.state.trigHigh = true;
        else if (part.state.trigHigh) { part.state.trigHigh = false; part.state.armed = true; }
      },
      pulse(pin, level, board) {
        if (pin !== part.pins.echo || !level) return undefined;
        if (!part.state.armed) {
          board.hint('trig', 'Bolt’s eyes only answer after a trigger pulse: digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW); then pulseIn(ECHO, HIGH).');
          return undefined;
        }
        part.state.armed = false;
        part.state.lastPing = performance.now();
        const d = part.state.distance ?? Infinity;
        return d > 400 ? undefined : d * 58.3 + (Math.random() - 0.5) * 20;
      },
    };
  },
  readout: part => {
    const st = part.state, d = st.distance;
    const lit = (st.faceRows ?? []).reduce((n: number, r: number) => { let v = r, k = n; while (v) { k += v & 1; v >>= 1; } return k; }, 0);
    return `Head <b>${Math.round(st.headAngle ?? 90)}°</b> · sees <b>${d != null && d <= 400 ? `${d.toFixed(0)} cm` : 'nothing'}</b> · face <b>${lit}</b> LEDs${st.freq ? ` · saying <b>${Math.round(st.freq)} Hz</b>` : ''}`;
  },
};

export const PARTS: Record<string, PartDef> = Object.fromEntries(
  [uno, led, rgbLed, button, pot, ldr, tmp36, buzzer, ultrasonic, servo, motor, trafficLight, car, lcd, sevenSeg, pir, joystick, neopixel, bigBreadboard, relay, dht11, oled, stepper, keypad, soil, encoder, matrix, hall, magnet, sound, gas, irRemote, bluetooth, digits, sdcard, robotCar, trackMat, lineSensor, wall, robotArm, cube, pad, bumper, irProx, encoders, lightEyes, beacon, bolt].map(d => [d.type, d]),
);

/** Parts shown in the sandbox palette, in order. */
export const PALETTE = ['breadboard', 'led', 'rgb', 'button', 'keypad', 'pot', 'encoder', 'joystick', 'ldr', 'temp', 'dht', 'soil', 'gas', 'sound', 'hall', 'pir', 'buzzer', 'ultrasonic', 'servo', 'stepper', 'motor', 'relay', 'traffic', 'seg7', 'digits', 'lcd', 'oled', 'matrix', 'neopixel', 'ir', 'bluetooth', 'sdcard', 'bolt', 'robot', 'linesensor', 'irprox', 'bumper', 'encoders', 'lighteyes', 'beacon', 'arm', 'cube', 'track', 'pad', 'wall', 'magnet', 'car'];

let idCounter = 0;
export function newPart(type: string, init: Partial<Part> = {}): Part {
  const def = PARTS[type];
  const pins: Record<string, number | null> = {};
  for (const t of def.terminals({ props: { ...def.defaults } } as Part)) if (t.kind === 'signal') pins[t.key] = null;
  return {
    id: init.id ?? `${type}-${Date.now().toString(36)}-${idCounter++}`,
    type,
    pins: { ...pins, ...init.pins },
    props: { ...def.defaults, ...init.props },
    x: init.x ?? 0,
    z: init.z ?? 0,
    rot: init.rot ?? 0,
    locked: init.locked,
    state: {},
  };
}
