// Simulated Builder One board: pin states, time, serial port, tones and servos.
// Implements the Host interface the interpreter calls into.
import { RuntimeError, type Host, type LcdState } from '../interp/interpreter';

export const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);
export const PIN_NAMES = [...Array(14).keys()].map(String).concat(['A0', 'A1', 'A2', 'A3', 'A4', 'A5']);
export const pinName = (p: number) => PIN_NAMES[p] ?? String(p);

export type PinMode = 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP';
const MODES: PinMode[] = ['INPUT', 'OUTPUT', 'INPUT_PULLUP'];

export interface PinState {
  mode: PinMode;
  value: number; // last digitalWrite (0/1)
  pwm: number | null; // last analogWrite (0-255) on a PWM pin
}

/** Hooks a placed part can implement to talk to the board. */
export interface PinListener {
  readDigital?(pin: number, board: Board): number | undefined;
  readAnalog?(pin: number, board: Board): number | undefined;
  onWrite?(pin: number, value: number, board: Board): void;
  pulse?(pin: number, level: number, board: Board): number | undefined;
  dht?(pin: number, board: Board): { t: number; h: number } | undefined;
  keypad?(rowPins: number[], colPins: number[]): [number, number] | undefined;
}

export interface Transition { t: number; v: number }

export class Board implements Host {
  time = 0;
  target = 0;
  pins: PinState[] = [];
  listeners: PinListener[] = [];
  serialStarted = false;
  serialOut = '';
  serialIn: number[] = [];
  tones = new Map<number, { freq: number; until: number | null }>();
  servoPins = new Map<number, number>(); // servo id -> pin
  servoAngles = new Map<number, number>(); // pin -> commanded angle
  lcds = new Map<number, LcdState>(); // I2C address -> display contents
  neopixels = new Map<number, { pixels: number[]; brightness: number }>(); // data pin -> last show()
  oleds = new Map<number, Uint8Array>(); // I2C address -> last display() frame
  steppers = new Map<string, { steps: number; perRev: number }>(); // sorted coil pins -> position

  // history used by lesson goals
  transitions = new Map<number, Transition[]>();
  pwmSeen = new Map<number, Set<number>>();
  toneFreqs = new Set<number>();
  servoSeen = new Set<number>();

  onSerial: (text: string) => void = () => {};
  peeking = false;
  interruptPins = new Map<number, number>(); // pin -> mode (CHANGE 1, FALLING 2, RISING 3, LOW 0)
  private lastLevels = new Map<number, number>();
  onHint: (text: string) => void = () => {};
  private hinted = new Set<string>();

  constructor() { this.reset(); }

  reset() {
    this.time = 0;
    this.target = 0;
    this.pins = Array.from({ length: 20 }, () => ({ mode: 'INPUT' as PinMode, value: 0, pwm: null }));
    this.serialStarted = false;
    this.serialOut = '';
    this.serialIn = [];
    this.tones.clear();
    this.servoPins.clear();
    this.servoAngles.clear();
    this.lcds.clear();
    this.interruptPins?.clear();
    this.lastLevels?.clear();
    this.neopixels.clear();
    this.oleds?.clear();
    this.steppers?.clear();
    this.transitions.clear();
    this.pwmSeen.clear();
    this.toneFreqs.clear();
    this.servoSeen.clear();
    this.hinted.clear();
  }

  hint(key: string, text: string) {
    if (this.peeking || this.hinted.has(key)) return;
    this.hinted.add(key);
    this.onHint(text);
  }

  private checkPin(pin: number, line: number, fn: string): number {
    if (typeof pin !== 'number' || !Number.isInteger(pin) || pin < 0 || pin > 19) {
      throw new RuntimeError(`${fn}(): ${pin} is not a valid pin. The Builder One has pins 0–13 and A0–A5.`, line);
    }
    if ((pin === 0 || pin === 1) && this.serialStarted) {
      this.hint('serialpins', 'Pins 0 and 1 are used by the Serial port. Avoid them when you use Serial.');
    }
    return pin;
  }

  /** How strongly a pin drives an output, 0..1 (PWM-aware). */
  level(pin: number | null | undefined): number {
    if (pin == null) return 0;
    const p = this.pins[pin];
    if (!p) return 0;
    if (this.activeTone(pin) != null) return 0.5;
    if (p.mode === 'OUTPUT') return p.pwm != null ? p.pwm / 255 : p.value;
    // writing HIGH to an INPUT pin only turns on the weak pull-up: a dim glow
    return p.value || p.mode === 'INPUT_PULLUP' ? 0.06 : 0;
  }

  private record(pin: number, v: number) {
    let list = this.transitions.get(pin);
    if (!list) this.transitions.set(pin, (list = []));
    const last = list[list.length - 1];
    if (last && last.v === v) return;
    list.push({ t: this.time, v });
    if (list.length > 200) list.shift();
  }

  // ---------- Host ----------
  now() { return this.time; }
  advance(ms: number) { this.time += ms; }
  shouldYield() { return this.time >= this.target; }

  pinMode(pin: number, mode: number, line: number) {
    this.checkPin(pin, line, 'pinMode');
    const m = MODES[mode];
    if (!m) throw new RuntimeError('pinMode() mode must be INPUT, OUTPUT or INPUT_PULLUP', line);
    this.pins[pin].mode = m;
    if (m === 'INPUT_PULLUP') this.pins[pin].value = 1;
  }

  digitalWrite(pin: number, value: number, line: number) {
    this.checkPin(pin, line, 'digitalWrite');
    const p = this.pins[pin];
    p.value = value;
    p.pwm = null;
    if (p.mode !== 'OUTPUT') {
      this.hint(`mode${pin}`, `Pin ${pinName(pin)} is written to, but pinMode(${pinName(pin)}, OUTPUT) was never called, so it only glows faintly. Add it to setup().`);
    }
    this.record(pin, value && p.mode === 'OUTPUT' ? 1 : 0);
    for (const l of this.listeners) l.onWrite?.(pin, value, this);
  }

  /** Digital level of a pin without side effects; null when an input floats. */
  peekDigital(pin: number): number | null {
    const p = this.pins[pin];
    if (!p) return null;
    if (p.mode === 'OUTPUT') return p.value;
    this.peeking = true;
    try {
      for (const l of this.listeners) {
        const v = l.readDigital?.(pin, this);
        if (v !== undefined) return v;
      }
    } finally {
      this.peeking = false;
    }
    return p.mode === 'INPUT_PULLUP' ? 1 : null;
  }

  /** Analog level 0..1 of an analog pin, without noise; null when nothing drives it. */
  peekAnalog(pin: number): number | null {
    this.peeking = true;
    try {
      for (const l of this.listeners) {
        const v = l.readAnalog?.(pin, this);
        if (v !== undefined) return Math.max(0, Math.min(1, v / 1023));
      }
    } finally {
      this.peeking = false;
    }
    return null;
  }

  oledShow(addr: number, pixels: Uint8Array) { this.oleds.set(addr, pixels); }

  stepperMove(pins: number[], _perRev: number, delta: number) {
    const key = [...pins].sort((a, b) => a - b).join(',');
    const cur = this.steppers.get(key) ?? { steps: 0, perRev: _perRev };
    this.steppers.set(key, { steps: cur.steps + delta, perRev: _perRev });
  }

  keypadKey(rowPins: number[], colPins: number[]): [number, number] | null {
    for (const l of this.listeners) {
      const hit = l.keypad?.(rowPins, colPins);
      if (hit) return hit;
    }
    return null;
  }

  glyph(ch: string): Uint8Array | null { return glyph(ch); }

  dhtRead(pin: number): { t: number; h: number } | null {
    for (const l of this.listeners) {
      const r = l.dht?.(pin, this);
      if (r) return r;
    }
    return null;
  }

  attachInterrupt(pin: number, mode: number) {
    this.interruptPins.set(pin, mode);
    this.lastLevels.set(pin, this.peekDigital(pin) ?? 0);
  }

  detachInterrupt(pin: number) { this.interruptPins.delete(pin); }

  /** Pins whose watched edge happened since the last poll. */
  pollInterrupts(): number[] {
    const fired: number[] = [];
    for (const [pin, mode] of this.interruptPins) {
      const v = this.peekDigital(pin) ?? this.lastLevels.get(pin) ?? 0;
      const was = this.lastLevels.get(pin) ?? v;
      this.lastLevels.set(pin, v);
      const rising = !was && v, falling = was && !v;
      if ((mode === 1 && (rising || falling)) || (mode === 3 && rising) || (mode === 2 && falling) || (mode === 0 && !v)) fired.push(pin);
    }
    return fired;
  }

  digitalRead(pin: number, line: number): number {
    this.checkPin(pin, line, 'digitalRead');
    const p = this.pins[pin];
    if (p.mode === 'OUTPUT') return p.value;
    for (const l of this.listeners) {
      const v = l.readDigital?.(pin, this);
      if (v !== undefined) return v;
    }
    if (p.mode === 'INPUT_PULLUP') return 1;
    // a disconnected input "floats" and reads random noise
    return Math.random() < 0.5 ? 0 : 1;
  }

  analogWrite(pin: number, value: number, line: number) {
    this.checkPin(pin, line, 'analogWrite');
    const v = Math.max(0, Math.min(255, Math.round(value)));
    if (value > 255 || value < 0) this.hint(`range${pin}`, `analogWrite() takes values 0–255; ${value} was clamped. Use map() to convert ranges.`);
    const p = this.pins[pin];
    if (p.mode !== 'OUTPUT') p.mode = 'OUTPUT'; // analogWrite sets the pin to output, like the real core
    if (!PWM_PINS.has(pin)) {
      this.hint(`pwm${pin}`, `Pin ${pinName(pin)} can't fade — only pins marked ~ (3, 5, 6, 9, 10, 11) support analogWrite(). Values below 128 turn it fully off, higher fully on.`);
      p.pwm = null;
      p.value = v >= 128 ? 1 : 0;
    } else {
      p.pwm = v;
      p.value = v > 0 ? 1 : 0;
      let seen = this.pwmSeen.get(pin);
      if (!seen) this.pwmSeen.set(pin, (seen = new Set()));
      seen.add(v);
    }
    this.record(pin, p.value);
  }

  analogRead(pin: number, line: number): number {
    if (pin >= 0 && pin <= 5) pin += 14; // analogRead(0) means A0
    this.checkPin(pin, line, 'analogRead');
    if (pin < 14) throw new RuntimeError(`analogRead() only works on A0–A5, not pin ${pin}`, line);
    for (const l of this.listeners) {
      const v = l.readAnalog?.(pin, this);
      if (v !== undefined) return Math.max(0, Math.min(1023, Math.round(v + (Math.random() - 0.5) * 2)));
    }
    // floating analog inputs drift around
    return Math.floor(300 + Math.random() * 200);
  }

  tone(pin: number, freq: number, durationMs: number | null) {
    this.checkPin(pin, 0, 'tone');
    this.tones.set(pin, { freq, until: durationMs != null ? this.time + durationMs : null });
    this.toneFreqs.add(Math.round(freq));
    this.record(pin, 1);
  }

  noTone(pin: number) {
    this.tones.delete(pin);
    this.record(pin, 0);
  }

  activeTone(pin: number | null | undefined): number | null {
    if (pin == null) return null;
    const t = this.tones.get(pin);
    if (!t) return null;
    // The sketch can run ahead of the clock (a delay() jumps time forward), so judge
    // a timed tone against the moment being shown, not where the code has got to.
    if (t.until != null && this.shownTime > t.until) return null;
    return t.freq;
  }

  /** The simulated moment the screen is currently showing. */
  get shownTime() { return Math.min(this.time, this.target); }

  pulseIn(pin: number, level: number, timeoutUs: number): number {
    this.checkPin(pin, 0, 'pulseIn');
    for (const l of this.listeners) {
      const us = l.pulse?.(pin, level, this);
      if (us !== undefined && us <= timeoutUs) {
        this.advance(us / 1000 + 0.2);
        return us;
      }
    }
    this.advance(timeoutUs / 1000);
    return 0;
  }

  serialBegin() { this.serialStarted = true; }

  serialWrite(text: string) {
    if (!this.serialStarted) {
      this.hint('serial', 'Nothing appears in the Serial Monitor until you call Serial.begin(9600) in setup().');
      return;
    }
    this.serialOut += text;
    if (this.serialOut.length > 40000) this.serialOut = this.serialOut.slice(-30000);
    this.onSerial(text);
  }

  serialAvailable() { return this.serialIn.length; }
  serialRead() { return this.serialIn.length ? this.serialIn.shift()! : -1; }

  servoAttach(id: number, pin: number, line: number) {
    this.checkPin(pin, line, 'attach');
    this.servoPins.set(id, pin);
    if (!this.servoAngles.has(pin)) this.servoAngles.set(pin, 90);
  }

  servoWrite(id: number, angle: number) {
    const pin = this.servoPins.get(id);
    if (pin == null) {
      this.hint('servoattach', 'Call myServo.attach(pin) in setup() before myServo.write().');
      return;
    }
    this.servoAngles.set(pin, angle);
    this.servoSeen.add(Math.round(angle));
  }

  servoDetach(id: number) {
    const pin = this.servoPins.get(id);
    if (pin != null) this.servoAngles.delete(pin);
    this.servoPins.delete(id);
  }

  lcdUpdate(lcd: LcdState) {
    this.lcds.set(lcd.addr, { ...lcd, lines: [...lcd.lines] });
  }

  neoShow(pin: number, pixels: number[], brightness: number) {
    this.neopixels.set(pin, { pixels, brightness });
  }
}

// ---------- tiny pixel font for the OLED, rasterised once per character ----------
const glyphCache = new Map<string, Uint8Array | null>();

function glyph(ch: string): Uint8Array | null {
  if (glyphCache.has(ch)) return glyphCache.get(ch)!;
  let out: Uint8Array | null = null;
  if (typeof document !== 'undefined') {
    // draw big, then sample down to a 5×7 cell inside a 6×8 box
    const S = 8;
    const c = document.createElement('canvas');
    c.width = 6 * S;
    c.height = 8 * S;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.font = `600 ${7.6 * S}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textBaseline = 'alphabetic';
    g.fillText(ch, 0.1 * S, 6.9 * S);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    out = new Uint8Array(48);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 5; x++) {
      let sum = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) sum += data[((y * S + sy) * c.width + x * S + sx) * 4];
      out[y * 6 + x] = sum / (S * S) > 70 ? 1 : 0;
    }
  }
  glyphCache.set(ch, out);
  return out;
}
