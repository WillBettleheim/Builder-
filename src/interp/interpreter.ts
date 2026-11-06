// Tree-walking interpreter. Every evaluation step is a generator so the program
// can pause (for delay(), or to hand control back to the browser each frame)
// without blocking the UI.
import type { FuncDef, Node, Program } from './parser';

export class RuntimeError extends Error {
  constructor(message: string, public line: number) {
    super(message);
  }
}

/** The simulated hardware the sketch talks to. Time is in milliseconds. */
export interface Host {
  now(): number;
  advance(ms: number): void;
  shouldYield(): boolean;
  pinMode(pin: number, mode: number, line: number): void;
  digitalWrite(pin: number, value: number, line: number): void;
  digitalRead(pin: number, line: number): number;
  analogWrite(pin: number, value: number, line: number): void;
  analogRead(pin: number, line: number): number;
  tone(pin: number, freq: number, durationMs: number | null): void;
  noTone(pin: number): void;
  pulseIn(pin: number, level: number, timeoutUs: number): number;
  serialBegin(baud: number): void;
  serialWrite(text: string): void;
  serialAvailable(): number;
  serialRead(): number;
  servoAttach(id: number, pin: number, line: number): void;
  servoWrite(id: number, angle: number): void;
  servoDetach(id: number): void;
  lcdUpdate(lcd: LcdState): void;
  neoShow(pin: number, pixels: number[], brightness: number): void;
  hint(key: string, text: string): void;
  attachInterrupt(pin: number, mode: number): void;
  detachInterrupt(pin: number): void;
  pollInterrupts(): number[];
  dhtRead(pin: number): { t: number; h: number } | null;
  oledShow(addr: number, pixels: Uint8Array): void;
  glyph(ch: string): Uint8Array | null; // 6×8 bitmap for OLED text
  stepperMove(pins: number[], stepsPerRev: number, delta: number): void;
  keypadKey(rowPins: number[], colPins: number[]): [number, number] | null;
  matrixUpdate(key: string, state: { rows: number[]; intensity: number; shutdown: boolean }): void;
  /** the next button code an IR receiver on this pin picked up, if any */
  irDecode(pin: number): { command: number; address: number } | null;
  /** a SoftwareSerial port talking to a Bluetooth module */
  btAvailable(rx: number): number;
  btRead(rx: number): number;
  btWrite(tx: number, text: string): void;
  /** the files on an SD card whose CS pin is this one, or null when no card answers */
  sdCard(cs: number): Record<string, string> | null;
  digitsUpdate(key: string, state: { segs: number[]; brightness: number; on: boolean }): void;
  /** heading from a compass module, in degrees clockwise from north, or null when none answers */
  compassAzimuth(): number | null;
}

export interface LcdState { addr: number; cols: number; rows: number; lines: string[]; cx: number; cy: number; backlight: boolean; begun: boolean; display: boolean }

type Value = any;
interface Var { type: string; value: Value; isArray?: boolean; isConst?: boolean }
interface Scope { vars: Map<string, Var>; parent: Scope | null }
type Signal = { s: 'break' } | { s: 'continue' } | { s: 'return'; v: Value } | undefined;
type Gen<T> = Generator<void, T, void>;

export const CONSTANTS: Record<string, number> = {
  HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, LED_BUILTIN: 13,
  true: 1, false: 0, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19,
  PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI,
  DEC: 10, HEX: 16, OCT: 8, BIN: 2, NULL: 0,
  CHANGE: 1, FALLING: 2, RISING: 3, DHT11: 11, DHT22: 22,
  SSD1306_WHITE: 1, SSD1306_BLACK: 0, SSD1306_INVERSE: 2, WHITE: 1, BLACK: 0, INVERSE: 2, SSD1306_SWITCHCAPVCC: 2, NO_KEY: 0,
  NEO_GRB: 82, NEO_RGB: 6, NEO_GRBW: 210, NEO_KHZ800: 0, NEO_KHZ400: 256,
  FILE_READ: 0, FILE_WRITE: 1, ENABLE_LED_FEEDBACK: 1, DISABLE_LED_FEEDBACK: 0,
  SEG_A: 1, SEG_B: 2, SEG_C: 4, SEG_D: 8, SEG_E: 16, SEG_F: 32, SEG_G: 64, SEG_DP: 128,
};

/** 7-segment patterns for 0–9 and A–F, bit 0 = segment a … bit 6 = segment g. */
export const SEG_DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
const SEG_MINUS = 0x40;

/** Where text goes and comes from for print()/read(): the Serial Monitor, a Bluetooth link or a file. */
interface Stream { name: string; write(text: string): void; available(): number; read(): number }
const FLOAT_CONSTANTS = new Set(['PI', 'HALF_PI', 'TWO_PI', 'DEG_TO_RAD', 'RAD_TO_DEG']);
const FLOAT_FUNCS = new Set(['sqrt', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'exp', 'log', 'log10', 'floor', 'ceil', 'fabs', 'radians', 'degrees', 'sq']);
const SIZES: Record<string, number> = { int: 2, uint: 2, long: 4, ulong: 4, float: 4, bool: 1, byte: 1, char: 1, String: 6, Servo: 3, LCD: 4, NeoPixel: 20, DHT: 4, OLED: 8, Stepper: 12, Keypad: 16, Matrix: 12, SoftSerial: 8, File: 16, Digits: 8, Compass: 8 };

const STATEMENT_COST_MS = 0.004; // ~4µs per statement, roughly a 16 MHz AVR
const STEP_BUDGET = 40000; // max statements per animation frame

/** Function-style casts like float(x) and the type each one produces. */
const CAST_TYPES: Record<string, string> = { float: 'float', int: 'int', long: 'long', byte: 'byte', char: 'char', word: 'uint' };

function wrap(v: number, bits: number, signed: boolean): number {
  const mod = 2 ** bits;
  let r = ((Math.trunc(v) % mod) + mod) % mod;
  if (signed && r >= mod / 2) r -= mod;
  return r;
}

export function coerce(type: string, v: Value): Value {
  if (type === 'File') return v && typeof v === 'object' ? v : 0; // an open file, or 0 when SD.open() failed
  if (type === 'String') return typeof v === 'string' ? v : String(v);
  if (typeof v === 'string') {
    if (type === 'char' && v.length === 1) return v.charCodeAt(0);
    return v; // let the caller report misuse
  }
  if (typeof v !== 'number' || Number.isNaN(v)) return type === 'float' ? NaN : 0;
  switch (type) {
    case 'float': return v;
    case 'bool': return v ? 1 : 0;
    case 'int': return wrap(v, 16, true);
    case 'uint': return wrap(v, 16, false);
    case 'long': return wrap(v, 32, true);
    case 'ulong': return wrap(v, 32, false);
    case 'byte': return wrap(v, 8, false);
    case 'char': return wrap(v, 8, true);
    default: return v;
  }
}

function formatFloat(v: number, digits = 2): string {
  if (Number.isNaN(v)) return 'nan';
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
  return v.toFixed(Math.max(0, Math.min(20, Math.trunc(Number(digits)) || 0)));
}

/** print(x, base) and String(x, base): BIN, OCT, DEC and HEX, or any base 2–36. */
const inBase = (v: number, base: number) => (v >>> 0).toString(Math.max(2, Math.min(36, Math.trunc(Number(base)) || 10))).toUpperCase();

/** The Uno has 2 KB of RAM; a little headroom, but never enough to freeze the tab. */
export const MAX_ARRAY_ITEMS = 10_000;
export const MAX_STRING = 8_000;
/** The simulated SD card: same limits the loader applies to saved cards. */
export const SD_MAX_FILES = 16;
export const SD_MAX_BYTES = 64 * 1024;
const SD_NAME = /^[\w. -]{1,32}$/;

export class Interpreter {
  private global: Scope = { vars: new Map(), parent: null };
  private scope: Scope = this.global;
  private steps = 0;
  private servoCount = 0;
  private ir: { pin: number | null; data: { command: number; address: number } | null } = { pin: null, data: null };
  private sd: Record<string, string> | null = null;
  private depth = 0;
  currentLine = 0;
  /** when set, pause before every statement (for the Step button) */
  stepMode = false;
  private isrs = new Map<number, FuncDef>(); // pin -> interrupt handler
  private inIsr = false;
  private pollCount = 0;

  constructor(private prog: Program, private host: Host) {}

  resetBudget() { this.steps = 0; }

  /** Variables visible right now: locals of the running function first, then globals. */
  variables(): { name: string; type: string; value: string; local: boolean }[] {
    const out: { name: string; type: string; value: string; local: boolean }[] = [];
    const seen = new Set<string>();
    for (let s: Scope | null = this.scope; s; s = s.parent) {
      for (const [name, v] of s.vars) {
        if (seen.has(name)) continue;
        seen.add(name);
        out.push({ name, type: TYPE_NAMES[v.type] ?? v.type, value: describe(v), local: s !== this.global });
      }
    }
    return out;
  }

  *run(): Gen<void> {
    for (const d of this.prog.globals) yield* this.execStmt(d);
    yield* this.callUser(this.prog.funcs.get('setup')!, [], 0);
    for (;;) {
      yield* this.callUser(this.prog.funcs.get('loop')!, [], 0);
      // even an empty loop() takes a little time
      this.host.advance(0.01);
      if (this.host.shouldYield() || this.steps > STEP_BUDGET) yield;
    }
  }

  // ---------- scopes ----------
  private lookup(name: string, line: number): Var {
    for (let s: Scope | null = this.scope; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    throw new RuntimeError(`"${name}" was not declared. Check the spelling or declare it first (e.g. int ${name} = 0;)`, line);
  }
  private findVar(name: string): Var | undefined {
    for (let s: Scope | null = this.scope; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    return undefined;
  }
  private declare(name: string, v: Var, line: number) {
    if (this.scope.vars.has(name)) throw new RuntimeError(`"${name}" is already declared in this scope`, line);
    this.scope.vars.set(name, v);
  }
  private push() { this.scope = { vars: new Map(), parent: this.scope }; }
  private pop() { this.scope = this.scope.parent!; }

  // ---------- statements ----------
  /** Run handlers for any interrupt edges that happened. */
  private *serviceInterrupts(): Gen<void> {
    if (this.inIsr || !this.isrs.size) return;
    for (const pin of this.host.pollInterrupts()) {
      const f = this.isrs.get(pin);
      if (!f) continue;
      this.inIsr = true;
      const line = this.currentLine;
      try { yield* this.callUser(f, [], f.line); } finally { this.inIsr = false; this.currentLine = line; }
    }
  }

  private *tick(line: number): Gen<void> {
    if (this.isrs.size && (++this.pollCount & 31) === 0) yield* this.serviceInterrupts();
    this.currentLine = line;
    this.steps++;
    this.host.advance(STATEMENT_COST_MS);
    if (this.stepMode || this.steps > STEP_BUDGET || this.host.shouldYield()) yield;
  }

  private *execStmt(n: Node): Gen<Signal> {
    switch (n.k) {
      case 'Empty': return;
      case 'ExprStmt':
        yield* this.tick(n.line);
        yield* this.eval(n.expr);
        return;
      case 'VarDecl':
        yield* this.tick(n.line);
        for (const d of n.decls) yield* this.declareVar(n.type, d);
        return;
      case 'Block': {
        this.push();
        try {
          for (const s of n.body) {
            const sig = yield* this.execStmt(s);
            if (sig) return sig;
          }
        } finally { this.pop(); }
        return;
      }
      case 'If': {
        yield* this.tick(n.line);
        if (truthy(yield* this.eval(n.cond))) return yield* this.execStmt(n.then);
        if (n.otherwise) return yield* this.execStmt(n.otherwise);
        return;
      }
      case 'While':
        for (;;) {
          yield* this.tick(n.line);
          if (!truthy(yield* this.eval(n.cond))) return;
          const sig = yield* this.execStmt(n.body);
          if (sig?.s === 'break') return;
          if (sig?.s === 'return') return sig;
        }
      case 'DoWhile':
        for (;;) {
          const sig = yield* this.execStmt(n.body);
          if (sig?.s === 'break') return;
          if (sig?.s === 'return') return sig;
          yield* this.tick(n.line);
          if (!truthy(yield* this.eval(n.cond))) return;
        }
      case 'For': {
        this.push();
        try {
          if (n.init) yield* this.execStmt(n.init);
          for (;;) {
            yield* this.tick(n.line);
            if (n.cond && !truthy(yield* this.eval(n.cond))) return;
            const sig = yield* this.execStmt(n.body);
            if (sig?.s === 'break') return;
            if (sig?.s === 'return') return sig;
            if (n.update) yield* this.eval(n.update);
          }
        } finally { this.pop(); }
      }
      case 'Switch': {
        yield* this.tick(n.line);
        const v = yield* this.eval(n.disc);
        let matched = -1;
        for (let i = 0; i < n.cases.length && matched < 0; i++) {
          const c = n.cases[i];
          if (c.test && (yield* this.eval(c.test)) === v) matched = i;
        }
        if (matched < 0) matched = n.cases.findIndex((c: any) => !c.test);
        if (matched < 0) return;
        this.push();
        try {
          for (let i = matched; i < n.cases.length; i++) {
            for (const s of n.cases[i].body) {
              const sig = yield* this.execStmt(s);
              if (sig?.s === 'break') return;
              if (sig) return sig;
            }
          }
        } finally { this.pop(); }
        return;
      }
      case 'Return':
        yield* this.tick(n.line);
        return { s: 'return', v: n.value ? yield* this.eval(n.value) : undefined };
      case 'Break': return { s: 'break' };
      case 'Continue': return { s: 'continue' };
    }
    throw new RuntimeError(`Unsupported statement ${n.k}`, n.line);
  }

  private *declareVar(type: string, d: Node): Gen<void> {
    if (type === 'void') throw new RuntimeError('Variables cannot have type void', d.line);
    if (['Servo', 'LCD', 'NeoPixel', 'DHT', 'OLED', 'Stepper', 'Keypad', 'Matrix', 'SoftSerial', 'Digits', 'Compass'].includes(type)) {
      if (d.isArray) throw new RuntimeError(`Arrays of ${type} objects are not supported`, d.line);
      // "Keypad k = Keypad(...)" is the same as "Keypad k(...)"
      let ctor: Node[] = d.ctorArgs ?? [];
      if (d.init?.k === 'Call' && d.init.callee.k === 'Ident') ctor = d.init.args;
      const args: Value[] = [];
      for (const a of ctor) args.push(yield* this.eval(a));
      this.declare(d.name, { type, value: this.makeObject(type, args, d) }, d.line);
      return;
    }
    if (d.isArray) {
      const sizes: (number | null)[] = [];
      for (const dim of d.dims) {
        if (!dim) { sizes.push(null); continue; }
        const n = yield* this.eval(dim);
        if (!Number.isInteger(n) || n <= 0) throw new RuntimeError('Array size must be a positive whole number', d.line);
        sizes.push(n);
      }
      if (d.init && d.init.k !== 'ArrayInit') throw new RuntimeError('Initialize arrays with a list like {1, 2, 3}', d.line);
      const fill = type === 'String' ? '' : 0;
      const self = this;
      function* build(level: number, init: Node | undefined): Gen<Value[]> {
        const items = init?.items ?? [];
        const size = sizes[level] ?? items.length;
        if (items.length > size) throw new RuntimeError(`Too many values for array "${d.name}" (room for ${size})`, d.line);
        const out: Value[] = [];
        for (let i = 0; i < size; i++) {
          const it: Node | undefined = items[i];
          if (level < sizes.length - 1) {
            if (it && it.k !== 'ArrayInit') throw new RuntimeError(`"${d.name}" has ${sizes.length} dimensions: use nested lists like {{1, 2}, {3, 4}}`, d.line);
            out.push(yield* build(level + 1, it));
          } else {
            if (it?.k === 'ArrayInit') throw new RuntimeError(`Too many { } levels for array "${d.name}"`, d.line);
            out.push(it ? coerce(type, yield* self.eval(it)) : fill);
          }
        }
        return out;
      }
      this.declare(d.name, { type, value: yield* build(0, d.init), isArray: true }, d.line);
      return;
    }
    if (d.init?.k === 'ArrayInit') throw new RuntimeError(`"${d.name}" is not an array — add [] after the name`, d.line);
    let value: Value = type === 'String' ? '' : 0;
    if (d.init) {
      value = yield* this.eval(d.init);
      if (typeof value === 'string' && type !== 'String' && !(type === 'char' && value.length === 1)) {
        throw new RuntimeError(`Cannot store text in a ${type} variable. Use String ${d.name} = ...`, d.line);
      }
      value = coerce(type, value);
    }
    this.declare(d.name, { type, value }, d.line);
  }

  private makeObject(type: string, args: Value[], d: Node): any {
    if (type === 'Servo') return { servo: this.servoCount++ };
    if (type === 'OLED') {
      const [w = 128, h = 64] = args;
      if (w !== 128 || (h !== 64 && h !== 32)) throw new RuntimeError('This OLED is 128×64: Adafruit_SSD1306 display(128, 64, &Wire, -1);', d.line);
      return { w, h, buf: new Uint8Array(w * h), cx: 0, cy: 0, size: 1, color: 1, addr: 0x3c, begun: false };
    }
    if (type === 'Stepper') {
      if (args.length !== 5) throw new RuntimeError('Create it with steps per turn and 4 pins: Stepper motor(2048, 8, 10, 9, 11);', d.line);
      return { perRev: args[0], pins: args.slice(1), rpm: 0, pos: 0 };
    }
    if (type === 'Matrix') {
      if (args.length < 3) throw new RuntimeError('Create it with its pins: LedControl lc = LedControl(DIN, CLK, CS, 1);', d.line);
      // the MAX7219 starts asleep, just like the real chip
      return { key: `${args[0]},${args[1]},${args[2]}`, rows: Array(8).fill(0), intensity: 8, shutdown: true };
    }
    if (type === 'SoftSerial') {
      if (args.length !== 2) throw new RuntimeError('Create it with its two pins: SoftwareSerial bt(10, 11); // RX, TX', d.line);
      return { rx: args[0], tx: args[1], begun: false };
    }
    if (type === 'Compass') return { begun: false, az: 0 };
    if (type === 'Digits') {
      if (args.length !== 2) throw new RuntimeError('Create it with its two pins: TM1637Display display(CLK, DIO);', d.line);
      return { key: `${args[0]},${args[1]}`, segs: [0, 0, 0, 0], brightness: 7, on: true };
    }
    if (type === 'Keypad') {
      if (args.length !== 5) throw new RuntimeError('Create it like: Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);', d.line);
      const [keys, rowPins, colPins, rows, cols] = args;
      if (!Array.isArray(keys) || !Array.isArray(rowPins) || !Array.isArray(colPins)) throw new RuntimeError('Keypad needs the key map and the row and column pin arrays', d.line);
      return { keys, rowPins: rowPins.slice(0, rows), colPins: colPins.slice(0, cols), held: null as string | null };
    }
    if (type === 'DHT') {
      if (args.length < 2) throw new RuntimeError('Create the sensor with its pin and model: DHT dht(2, DHT11);', d.line);
      return { pin: args[0], model: args[1], begun: false };
    }
    if (type === 'LCD') {
      if (args.length !== 3) throw new RuntimeError('Create the LCD with its address and size: LiquidCrystal_I2C lcd(0x27, 16, 2);', d.line);
      const [addr, cols, rows] = args;
      if (cols < 1 || cols > 40 || rows < 1 || rows > 4) throw new RuntimeError('LCD size should be like 16, 2 (columns, rows)', d.line);
      const st: LcdState = { addr, cols, rows, lines: Array(rows).fill(' '.repeat(cols)), cx: 0, cy: 0, backlight: false, begun: false, display: true };
      return st;
    }
    if (args.length < 2) throw new RuntimeError('Create the strip with its LED count and pin: Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);', d.line);
    const [count, pin] = args;
    if (!Number.isInteger(count) || count < 1 || count > 300) throw new RuntimeError('NeoPixel count should be between 1 and 300', d.line);
    return { count, pin, pixels: Array(count).fill(0), brightness: 255, begun: false };
  }

  // ---------- static-ish typing (needed for integer division and printing floats) ----------
  typeOf(n: Node): string {
    switch (n.k) {
      case 'Num': return n.isFloat ? 'float' : 'long';
      case 'Str': return 'String';
      case 'Ident': {
        if (n.name in CONSTANTS) return FLOAT_CONSTANTS.has(n.name) ? 'float' : 'int';
        return this.findVar(n.name)?.type ?? 'long';
      }
      case 'Index': {
        let base = n;
        while (base.k === 'Index') base = base.obj;
        return base.k === 'Ident' ? (this.findVar(base.name)?.type ?? 'long') : 'long';
      }
      case 'Binary': {
        if (['==', '!=', '<', '>', '<=', '>='].includes(n.op)) return 'bool';
        const a = this.typeOf(n.left), b = this.typeOf(n.right);
        if (n.op === '+' && (a === 'String' || b === 'String')) return 'String';
        if (a === 'float' || b === 'float') return 'float';
        return a === 'ulong' || b === 'ulong' ? 'ulong' : 'long';
      }
      case 'Logical': return 'bool';
      case 'Unary': return n.op === '!' ? 'bool' : this.typeOf(n.arg);
      case 'Update': return this.typeOf(n.arg);
      case 'Assign': return this.typeOf(n.target);
      case 'Cond': {
        const a = this.typeOf(n.a), b = this.typeOf(n.b);
        return a === 'float' || b === 'float' ? 'float' : a === 'String' || b === 'String' ? 'String' : a;
      }
      case 'Cast': return n.type;
      case 'Comma': return this.typeOf(n.right);
      case 'Call': {
        if (n.callee.k === 'Ident') {
          const name = n.callee.name;
          if (FLOAT_FUNCS.has(name)) return 'float';
          if (name === 'String') return 'String';
          if (name in CAST_TYPES) return CAST_TYPES[name];
          if (name === 'millis' || name === 'micros' || name === 'pulseIn') return 'ulong';
          if (['abs', 'min', 'max', 'constrain'].includes(name)) {
            return n.args.some((a: Node) => this.typeOf(a) === 'float') ? 'float' : 'long';
          }
          const f = this.prog.funcs.get(name);
          if (f) return f.ret;
        } else if (n.callee.k === 'Member') {
          const prop = n.callee.prop;
          if (prop === 'toFloat' || prop === 'parseFloat' || prop === 'readTemperature' || prop === 'readHumidity') return 'float';
          if (['substring', 'readString', 'readStringUntil', 'toUpperCase', 'toLowerCase', 'trim'].includes(prop)) return 'String';
        }
        return 'long';
      }
    }
    return 'long';
  }

  // ---------- expressions ----------
  private *eval(n: Node): Gen<Value> {
    switch (n.k) {
      case 'Num': return n.value;
      case 'Str': return n.value;
      case 'Ident': {
        if (n.name in CONSTANTS && !this.findVar(n.name)) return CONSTANTS[n.name];
        const v = this.lookup(n.name, n.line);
        if (v.isArray) return v.value;
        return v.value;
      }
      case 'Index': {
        const { arr, i } = yield* this.indexRef(n);
        if (typeof arr === 'string') return arr.charCodeAt(i);
        return arr[i];
      }
      case 'Binary': return yield* this.binary(n);
      case 'Logical': {
        const a = truthy(yield* this.eval(n.left));
        if (n.op === '&&') return a ? (truthy(yield* this.eval(n.right)) ? 1 : 0) : 0;
        return a ? 1 : (truthy(yield* this.eval(n.right)) ? 1 : 0);
      }
      case 'Unary': {
        const v = yield* this.eval(n.arg);
        if (typeof v === 'string') throw new RuntimeError(`Cannot use "${n.op}" on text`, n.line);
        switch (n.op) {
          case '!': return v ? 0 : 1;
          case '-': return -v;
          case '+': return +v;
          case '~': return ~v;
        }
        break;
      }
      case 'Update': {
        const old = yield* this.eval(n.arg);
        const nv = n.op === '++' ? old + 1 : old - 1;
        const stored = yield* this.store(n.arg, nv);
        return n.prefix ? stored : old;
      }
      case 'Assign': {
        let v = yield* this.eval(n.value);
        if (n.op !== '=') {
          const cur = yield* this.eval(n.target);
          v = this.applyOp(n.op.slice(0, -1), cur, v, this.typeOf(n.target), this.typeOf(n.value), n.line);
        }
        return yield* this.store(n.target, v);
      }
      case 'Cond': return truthy(yield* this.eval(n.cond)) ? yield* this.eval(n.a) : yield* this.eval(n.b);
      case 'Comma': yield* this.eval(n.left); return yield* this.eval(n.right);
      case 'Cast': return coerce(n.type, yield* this.eval(n.arg));
      case 'SizeofType': return SIZES[n.type] ?? 2;
      case 'Sizeof': {
        const val = yield* this.eval(n.arg);
        const size = SIZES[this.typeOf(n.arg)] ?? 2;
        return Array.isArray(val) ? countLeaves(val) * size : size;
      }
      case 'Call': return yield* this.call(n);
      case 'Member': {
        // the one plain field chain the libraries need: IrReceiver.decodedIRData.command
        const o = n.obj;
        if (o.k === 'Member' && o.prop === 'decodedIRData' && o.obj.k === 'Ident' && o.obj.name === 'IrReceiver') {
          const data = this.ir.data ?? { command: 0, address: 0 };
          if (n.prop === 'command') return data.command;
          if (n.prop === 'address') return data.address;
          if (n.prop === 'protocol') return 8; // NEC
          if (n.prop === 'flags') return 0;
          throw new RuntimeError(`decodedIRData has command, address, protocol and flags, not "${n.prop}"`, n.line);
        }
        throw new RuntimeError(`"${n.prop}" must be called like ${n.prop}()`, n.line);
      }
    }
    throw new RuntimeError(`Unsupported expression ${n.k}`, n.line);
  }

  /** Resolve a[i][j]... to the containing array and final index. */
  private *indexRef(n: Node): Gen<{ arr: any; i: number; v: Var }> {
    const idx: Node[] = [];
    let base = n;
    while (base.k === 'Index') { idx.unshift(base.idx); base = base.obj; }
    if (base.k !== 'Ident') throw new RuntimeError('Only named arrays can be indexed', n.line);
    const v = this.lookup(base.name, n.line);
    if (!v.isArray && v.type !== 'String') throw new RuntimeError(`"${base.name}" is not an array`, n.line);
    let arr = v.value;
    for (let k = 0; k < idx.length; k++) {
      const i = yield* this.eval(idx[k]);
      if (typeof arr === 'string' && k > 0) throw new RuntimeError(`Too many [ ] for "${base.name}"`, n.line);
      const len = arr.length;
      if (!Number.isInteger(i) || i < 0 || i >= len) {
        throw new RuntimeError(`Index ${i} is outside array "${base.name}" (valid: 0 to ${len - 1}). On a real board this would silently corrupt memory!`, n.line);
      }
      if (k === idx.length - 1) return { arr, i, v };
      arr = arr[i];
      if (!Array.isArray(arr)) throw new RuntimeError(`Too many [ ] for "${base.name}"`, n.line);
    }
    throw new RuntimeError('Bad array index', n.line);
  }

  /** A variable (or array element) a reference parameter can alias. */
  private *refVar(n: Node, fname: string): Gen<Var> {
    if (n.k === 'Ident') {
      const v = this.lookup(n.name, n.line);
      if (v.isArray) throw new RuntimeError(`Pass the array itself to an array parameter, not a reference`, n.line);
      return v;
    }
    if (n.k === 'Index') {
      const { arr, i, v } = yield* this.indexRef(n);
      if (typeof arr === 'string' || Array.isArray(arr[i])) throw new RuntimeError(`Can only pass a single element by reference`, n.line);
      return { type: v.type, get value() { return arr[i]; }, set value(x) { arr[i] = x; } };
    }
    throw new RuntimeError(`${fname}() changes this argument, so it must be a variable, not a value`, n.line);
  }

  private *store(target: Node, value: Value): Gen<Value> {
    if (target.k === 'Ident') {
      if (target.name in CONSTANTS && !this.findVar(target.name)) throw new RuntimeError(`"${target.name}" is a built-in constant and cannot be changed`, target.line);
      const v = this.lookup(target.name, target.line);
      if (v.isArray) throw new RuntimeError(`Cannot assign to the whole array "${target.name}" — assign one element like ${target.name}[0] = ...`, target.line);
      if (v.type === 'Servo' || v.type === 'LCD' || v.type === 'NeoPixel') throw new RuntimeError(`Cannot assign to a ${v.type} object`, target.line);
      if (typeof value === 'string' && v.type !== 'String') throw new RuntimeError(`Cannot store text in ${v.type} variable "${target.name}"`, target.line);
      v.value = coerce(v.type, value);
      return v.value;
    }
    if (target.k === 'Index') {
      const { arr, i, v } = yield* this.indexRef(target);
      if (typeof arr === 'string') throw new RuntimeError('Changing single characters of a String is not supported', target.line);
      if (Array.isArray(arr[i])) throw new RuntimeError('Assign to a single element, e.g. grid[1][2] = 5', target.line);
      arr[i] = coerce(v.type, value);
      return arr[i];
    }
    throw new RuntimeError('Cannot assign to this expression', target.line);
  }

  private *binary(n: Node): Gen<Value> {
    const a = yield* this.eval(n.left);
    const b = yield* this.eval(n.right);
    return this.applyOp(n.op, a, b, this.typeOf(n.left), this.typeOf(n.right), n.line);
  }

  private applyOp(op: string, a: Value, b: Value, ta: string, tb: string, line: number): Value {
    if (typeof a === 'string' || typeof b === 'string') {
      if (op === '+') return this.toText(a, ta) + this.toText(b, tb);
      if (op === '==') return a === b ? 1 : 0;
      if (op === '!=') return a !== b ? 1 : 0;
      throw new RuntimeError(`Cannot use "${op}" with text`, line);
    }
    if (Array.isArray(a) || Array.isArray(b)) throw new RuntimeError('Cannot do math on a whole array — use an element like arr[0]', line);
    const isFloat = ta === 'float' || tb === 'float';
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (!isFloat) {
          if (b === 0) throw new RuntimeError('Division by zero', line);
          return Math.trunc(a / b);
        }
        return a / b;
      case '%':
        if (isFloat) throw new RuntimeError('% only works with whole numbers (use fmod for decimals)', line);
        if (b === 0) throw new RuntimeError('Division by zero (in %)', line);
        return a % b;
      case '<': return a < b ? 1 : 0;
      case '>': return a > b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      case '==': return a === b ? 1 : 0;
      case '!=': return a !== b ? 1 : 0;
      case '&': return a & b;
      case '|': return a | b;
      case '^': return a ^ b;
      case '<<': return a << b;
      case '>>': return a >> b;
    }
    throw new RuntimeError(`Unknown operator ${op}`, line);
  }

  private toText(v: Value, type: string, digits?: number): string {
    if (typeof v === 'string') return v;
    if (type === 'float') return formatFloat(v, digits ?? 2);
    if (type === 'char') return String.fromCharCode(v & 0xff);
    return String(v);
  }

  /** print(), read() and friends, shared by Serial, SoftwareSerial and SD files. */
  private streamCall(io: Stream, prop: string, args: Value[], n: Node): Value {
    switch (prop) {
      case 'print':
      case 'println': {
        let text = '';
        if (args.length) {
          const t = this.typeOf(n.args[0]);
          if (args.length > 1 && typeof args[0] === 'number') {
            text = t === 'float' ? formatFloat(args[0], args[1]) : inBase(args[0], args[1]);
          } else text = this.toText(args[0], t);
        }
        io.write(prop === 'println' ? text + '\n' : text);
        return text.length;
      }
      case 'write': io.write(typeof args[0] === 'string' ? args[0] : String.fromCharCode(args[0])); return 1;
      case 'available': return io.available();
      case 'read': return io.available() ? io.read() : -1;
      case 'peek': return io.available() ? io.read() : -1;
      case 'parseInt':
      case 'parseFloat':
      case 'readString':
      case 'readStringUntil': {
        let s = '';
        while (io.available()) {
          const c = String.fromCharCode(io.read());
          if (prop === 'readStringUntil' && c === String.fromCharCode(args[0])) break;
          s += c;
        }
        if (prop === 'parseInt') return parseInt(s, 10) || 0;
        if (prop === 'parseFloat') return parseFloat(s) || 0;
        return s;
      }
    }
    throw new RuntimeError(`${io.name}.${prop}() is not supported`, n.line);
  }

  private sdCall(prop: string, args: Value[], n: Node): Value {
    if (prop === 'begin') {
      this.sd = this.host.sdCard(args[0] ?? 10);
      if (!this.sd) this.host.hint('sdnone', `No SD card answered on CS pin ${args[0] ?? 10}. Wire the module’s CS to that pin, MOSI to 11, MISO to 12 and SCK to 13.`);
      return this.sd ? 1 : 0;
    }
    const files = this.sd;
    if (!files) {
      this.host.hint('sdbegin', 'Call SD.begin(csPin) in setup() and check that it returns true before using the card.');
      return 0;
    }
    const name = String(args[0] ?? '');
    switch (prop) {
      case 'exists': return name in files ? 1 : 0;
      case 'remove': { const had = name in files; delete files[name]; return had ? 1 : 0; }
      case 'mkdir': case 'rmdir': return 1;
      case 'open': {
        const write = args[1] === 1;
        if (!write && !(name in files)) return 0; // reading a file that isn't there fails, like the real library
        if (write) files[name] ??= '';
        return { name, write, pos: 0, open: true, files };
      }
    }
    throw new RuntimeError(`SD.${prop}() is not supported. Use begin(), open(), exists() and remove()`, n.line);
  }

  private digitsCall(d: { key: string; segs: number[]; brightness: number; on: boolean }, prop: string, args: Value[], n: Node): Value {
    const push = () => this.host.digitsUpdate(d.key, { segs: [...d.segs], brightness: d.brightness, on: d.on });
    // write right-aligned digits into [pos, pos + length), like the TM1637Display library
    const show = (num: number, dots: number, leadingZero: boolean, length = 4, pos = 0, base = 10) => {
      if (!Number.isInteger(length) || length < 1 || pos < 0 || pos + length > 4) throw new RuntimeError('The display has 4 digits: length and position must fit inside 0–3', n.line);
      const neg = base === 10 && num < 0;
      let v = Math.abs(Math.trunc(num));
      const out: number[] = [];
      for (let i = length - 1; i >= 0; i--) {
        const blank = v === 0 && i < length - 1 && !leadingZero;
        out[i] = blank ? 0 : SEG_DIGITS[v % base];
        v = Math.floor(v / base);
      }
      if (neg) { const first = out.findIndex(x => x !== 0); out[Math.max(0, first - 1)] = SEG_MINUS; }
      for (let i = 0; i < length; i++) d.segs[pos + i] = out[i] | ((dots >> (7 - i)) & 1 ? 0x80 : 0);
      push();
    };
    switch (prop) {
      case 'setBrightness': d.brightness = Math.max(0, Math.min(7, args[0] & 7)); d.on = args.length > 1 ? !!args[1] : true; push(); return;
      case 'clear': d.segs.fill(0); push(); return;
      case 'showNumberDec': return show(args[0], 0, !!args[1], args[2] ?? 4, args[3] ?? 0);
      case 'showNumberDecEx': return show(args[0], args[1] ?? 0, !!args[2], args[3] ?? 4, args[4] ?? 0);
      case 'showNumberHexEx': return show(args[0], args[1] ?? 0, !!args[2], args[3] ?? 4, args[4] ?? 0, 16);
      case 'encodeDigit': return SEG_DIGITS[args[0] & 15];
      case 'setSegments': {
        const data = args[0];
        if (!Array.isArray(data)) throw new RuntimeError('setSegments() takes an array of segment patterns, e.g. setSegments(data)', n.line);
        const length = args[1] ?? Math.min(4, data.length), pos = args[2] ?? 0;
        for (let i = 0; i < length && pos + i < 4; i++) d.segs[pos + i] = (data[i] ?? 0) & 0xff;
        push();
        return;
      }
    }
    throw new RuntimeError(`The 4-digit display has no method "${prop}()"`, n.line);
  }

  // ---------- calls ----------
  private *callUser(f: FuncDef, args: Value[], line: number): Gen<Value> {
    if (args.length !== f.params.length) {
      throw new RuntimeError(`${f.name}() expects ${f.params.length} argument(s) but got ${args.length}`, line);
    }
    if (++this.depth > 200) throw new RuntimeError(`Too much recursion in ${f.name}() — the board would run out of memory`, line);
    const saved = this.scope;
    this.scope = { vars: new Map(), parent: this.global };
    try {
      f.params.forEach((p, i) => {
        if (p.isRef) {
          this.scope.vars.set(p.name, args[i].__ref);
        } else if (p.isArray) {
          if (!Array.isArray(args[i])) throw new RuntimeError(`Argument "${p.name}" of ${f.name}() must be an array`, line);
          this.scope.vars.set(p.name, { type: p.type, value: args[i], isArray: true });
        } else {
          this.scope.vars.set(p.name, { type: p.type, value: coerce(p.type, args[i]) });
        }
      });
      const sig = yield* this.execStmt(f.body);
      if (sig?.s === 'return') return f.ret === 'void' ? undefined : coerce(f.ret, sig.v);
      if (sig?.s === 'break' || sig?.s === 'continue') throw new RuntimeError(`"${sig.s}" used outside of a loop`, f.line);
      return f.ret === 'void' ? undefined : 0;
    } finally {
      this.scope = saved;
      this.depth--;
    }
  }

  private *evalArgs(n: Node): Gen<Value[]> {
    const out: Value[] = [];
    for (const a of n.args) out.push(yield* this.eval(a));
    return out;
  }

  private *call(n: Node): Gen<Value> {
    if (n.callee.k === 'Member') return yield* this.callMember(n);
    const name: string = n.callee.name;
    const user = this.prog.funcs.get(name);
    if (user) {
      const args: Value[] = [];
      for (let i = 0; i < n.args.length; i++) {
        args.push(user.params[i]?.isRef ? { __ref: yield* this.refVar(n.args[i], name) } : yield* this.eval(n.args[i]));
      }
      return yield* this.callUser(user, args, n.line);
    }
    if (name === 'attachInterrupt') {
      if (n.args.length !== 3) throw new RuntimeError('Use attachInterrupt(digitalPinToInterrupt(pin), handler, RISING / FALLING / CHANGE)', n.line);
      const num = yield* this.eval(n.args[0]);
      const fnNode = n.args[1];
      const f = fnNode.k === 'Ident' ? this.prog.funcs.get(fnNode.name) : undefined;
      if (!f) throw new RuntimeError('The second argument of attachInterrupt() must be the name of one of your functions (no parentheses)', n.line);
      if (f.params.length) throw new RuntimeError(`Interrupt handler ${f.name}() can't take parameters`, n.line);
      const mode = yield* this.eval(n.args[2]);
      const pin = num === 0 ? 2 : num === 1 ? 3 : -1;
      if (pin < 0) throw new RuntimeError('Only pins 2 and 3 can trigger interrupts on the Builder One. Use digitalPinToInterrupt(2) or digitalPinToInterrupt(3).', n.line);
      this.isrs.set(pin, f);
      this.host.attachInterrupt(pin, mode);
      return;
    }
    const args = yield* this.evalArgs(n);
    const need = (count: number, max = count) => {
      if (args.length < count || args.length > max) {
        const range = count === max ? `${count}` : `${count} to ${max}`;
        throw new RuntimeError(`${name}() takes ${range} argument(s) but got ${args.length}`, n.line);
      }
      for (const a of args) {
        if (typeof a !== 'number' && name !== 'String') throw new RuntimeError(`${name}() expects numbers, not text`, n.line);
      }
    };
    const h = this.host;
    switch (name) {
      case 'pinMode': need(2); h.pinMode(args[0], args[1], n.line); return;
      case 'digitalWrite': need(2); h.digitalWrite(args[0], args[1] ? 1 : 0, n.line); return;
      case 'digitalRead': need(1); return h.digitalRead(args[0], n.line);
      case 'analogWrite': need(2); h.analogWrite(args[0], args[1], n.line); return;
      case 'analogRead': need(1); return h.analogRead(args[0], n.line);
      case 'delay': {
        need(1);
        if (args[0] < 0) throw new RuntimeError('delay() needs a positive number', n.line);
        if (!this.isrs.size) {
          h.advance(args[0]);
          if (h.shouldYield()) yield;
          return;
        }
        // with interrupts attached, wait in small slices so handlers run during the delay
        const end = h.now() + args[0];
        while (h.now() < end) {
          h.advance(Math.min(2, end - h.now()));
          yield* this.serviceInterrupts();
          if (h.shouldYield()) yield;
        }
        return;
      }
      case 'digitalPinToInterrupt': need(1); return args[0] === 2 ? 0 : args[0] === 3 ? 1 : -1;
      case 'interrupts': case 'noInterrupts': return;
      case 'detachInterrupt': need(1); h.detachInterrupt(args[0] === 0 ? 2 : 3); this.isrs.delete(args[0] === 0 ? 2 : 3); return;
      case 'delayMicroseconds': need(1); h.advance(Math.max(0, args[0]) / 1000); if (h.shouldYield()) yield; return;
      case 'millis': need(0); return coerce('ulong', Math.floor(h.now()));
      case 'micros': need(0); return coerce('ulong', Math.floor(h.now() * 1000));
      case 'tone': need(2, 3); h.tone(args[0], args[1], args.length > 2 ? args[2] : null); return;
      case 'noTone': need(1); h.noTone(args[0]); return;
      case 'pulseIn': {
        need(2, 3);
        const us = h.pulseIn(args[0], args[1], args.length > 2 ? args[2] : 1_000_000);
        if (h.shouldYield()) yield;
        return Math.round(us);
      }
      case 'map': {
        need(5);
        const [x, inMin, inMax, outMin, outMax] = args;
        if (inMax === inMin) throw new RuntimeError('map() input range cannot be zero (fromLow == fromHigh)', n.line);
        return Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin);
      }
      case 'constrain': need(3); return Math.min(Math.max(args[0], args[1]), args[2]);
      case 'min': need(2); return Math.min(args[0], args[1]);
      case 'max': need(2); return Math.max(args[0], args[1]);
      case 'abs': case 'fabs': need(1); return Math.abs(args[0]);
      case 'sq': need(1); return args[0] * args[0];
      case 'sqrt': need(1); return Math.sqrt(args[0]);
      case 'pow': need(2); return Math.pow(args[0], args[1]);
      case 'sin': need(1); return Math.sin(args[0]);
      case 'cos': need(1); return Math.cos(args[0]);
      case 'tan': need(1); return Math.tan(args[0]);
      case 'asin': need(1); return Math.asin(args[0]);
      case 'acos': need(1); return Math.acos(args[0]);
      case 'atan': need(1); return Math.atan(args[0]);
      case 'atan2': need(2); return Math.atan2(args[0], args[1]);
      case 'exp': need(1); return Math.exp(args[0]);
      case 'log': need(1); return Math.log(args[0]);
      case 'log10': need(1); return Math.log10(args[0]);
      case 'floor': need(1); return Math.floor(args[0]);
      case 'ceil': need(1); return Math.ceil(args[0]);
      case 'round': need(1); return Math.round(args[0]);
      case 'radians': need(1); return (args[0] * Math.PI) / 180;
      case 'degrees': need(1); return (args[0] * 180) / Math.PI;
      case 'random': {
        need(1, 2);
        const [lo, hi] = args.length === 1 ? [0, args[0]] : args;
        if (hi <= lo) return lo;
        return Math.floor(lo + Math.random() * (hi - lo));
      }
      case 'randomSeed': need(1); return;
      case 'makeKeymap': return args[0];
      case 'bitRead': need(2); return (args[0] >> args[1]) & 1;
      case 'bitSet': throw new RuntimeError('bitSet() is not supported — use x |= (1 << n)', n.line);
      case 'float': case 'int': case 'long': case 'byte': case 'char': case 'word':
        need(1); return coerce(CAST_TYPES[name], args[0]);
      case 'String': {
        if (args.length === 0) return '';
        if (args.length === 2 && typeof args[0] === 'number') {
          const base = args[1];
          if (this.typeOf(n.args[0]) === 'float') return formatFloat(args[0], base);
          return inBase(args[0], base);
        }
        return this.toText(args[0], this.typeOf(n.args[0]));
      }
    }
    throw new RuntimeError(`Unknown function "${name}()". Check the spelling (code is case-sensitive).`, n.line);
  }

  private oledCall(o: any, prop: string, args: Value[], n: Node): Value {
    const { w, h, buf } = o;
    const plot = (x: number, y: number, c: number) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      buf[y * w + x] = c === 2 ? buf[y * w + x] ^ 1 : c ? 1 : 0;
    };
    const line = (x0: number, y0: number, x1: number, y1: number, c: number) => {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) plot(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
    };
    const text = (s: string) => {
      for (const ch of s) {
        if (ch === '\n') { o.cx = 0; o.cy += 8 * o.size; continue; }
        if (o.cx + 6 * o.size > w) { o.cx = 0; o.cy += 8 * o.size; }
        const g = this.host.glyph(ch);
        if (g) {
          for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 6; gx++) {
            if (!g[gy * 6 + gx]) continue;
            for (let sy = 0; sy < o.size; sy++) for (let sx = 0; sx < o.size; sx++) plot(o.cx + gx * o.size + sx, o.cy + gy * o.size + sy, o.color);
          }
        }
        o.cx += 6 * o.size;
      }
    };
    const c = (i: number) => (args.length > i ? args[i] : 1);
    switch (prop) {
      case 'begin': o.begun = true; if (args[1]) o.addr = args[1]; return 1;
      case 'clearDisplay': buf.fill(0); return;
      case 'display':
        if (!o.begun) this.host.hint('oledbegin', 'Call display.begin(SSD1306_SWITCHCAPVCC, 0x3C) in setup() first.');
        this.host.oledShow(o.addr, buf.slice());
        return;
      case 'setTextSize': o.size = Math.max(1, Math.min(8, Math.round(args[0]))); return;
      case 'setTextColor': o.color = args[0]; return;
      case 'setCursor': o.cx = args[0]; o.cy = args[1]; return;
      case 'print': case 'println': {
        let s = '';
        if (args.length) {
          const t = this.typeOf(n.args[0]);
          s = args.length > 1 && typeof args[0] === 'number' ? (t === 'float' ? formatFloat(args[0], args[1]) : inBase(args[0], args[1])) : this.toText(args[0], t);
        }
        text(prop === 'println' ? s + '\n' : s);
        return;
      }
      case 'write': text(typeof args[0] === 'string' ? args[0] : String.fromCharCode(args[0])); return;
      case 'drawPixel': plot(args[0], args[1], c(2)); return;
      case 'drawLine': line(args[0], args[1], args[2], args[3], c(4)); return;
      case 'drawFastHLine': line(args[0], args[1], args[0] + args[2] - 1, args[1], c(3)); return;
      case 'drawFastVLine': line(args[0], args[1], args[0], args[1] + args[2] - 1, c(3)); return;
      case 'drawRect': {
        const [x, y, rw, rh] = args;
        line(x, y, x + rw - 1, y, c(4)); line(x, y + rh - 1, x + rw - 1, y + rh - 1, c(4));
        line(x, y, x, y + rh - 1, c(4)); line(x + rw - 1, y, x + rw - 1, y + rh - 1, c(4));
        return;
      }
      case 'fillRect': for (let y = args[1]; y < args[1] + args[3]; y++) line(args[0], y, args[0] + args[2] - 1, y, c(4)); return;
      case 'drawCircle': case 'fillCircle': {
        const [cx, cy, r] = args;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (prop === 'fillCircle' ? d <= r + 0.3 : Math.abs(d - r) < 0.55) plot(cx + x, cy + y, c(3));
        }
        return;
      }
      case 'invertDisplay': o.inverted = !!args[0]; this.host.oledShow(o.addr, o.inverted ? buf.map((p: number) => p ^ 1) : buf.slice()); return;
      case 'width': return w;
      case 'height': return h;
      case 'setTextWrap': case 'cp437': case 'dim': return;
    }
    throw new RuntimeError(`The OLED display has no method "${prop}()"`, n.line);
  }

  private lcdCall(lcd: LcdState, prop: string, args: Value[], n: Node): Value {
    const h = this.host;
    const write = (text: string) => {
      if (!lcd.begun) h.hint('lcdinit', 'Call lcd.init() (or lcd.begin()) and lcd.backlight() in setup() before printing.');
      const row = lcd.lines[lcd.cy];
      // text past the last column is lost, like on the real display
      const before = row.slice(0, lcd.cx);
      const after = row.slice(lcd.cx + text.length);
      lcd.lines[lcd.cy] = (before + text + after).slice(0, lcd.cols).padEnd(lcd.cols);
      lcd.cx = Math.min(lcd.cols, lcd.cx + text.length);
    };
    switch (prop) {
      case 'init': case 'begin': lcd.begun = true; break;
      case 'backlight': lcd.backlight = true; break;
      case 'noBacklight': lcd.backlight = false; break;
      case 'display': lcd.display = true; break;
      case 'noDisplay': lcd.display = false; break;
      case 'clear': lcd.lines = lcd.lines.map(() => ' '.repeat(lcd.cols)); lcd.cx = lcd.cy = 0; break;
      case 'home': lcd.cx = lcd.cy = 0; break;
      case 'setCursor': {
        if (args.length !== 2) throw new RuntimeError('setCursor(column, row) takes 2 numbers', n.line);
        lcd.cx = Math.max(0, Math.min(lcd.cols - 1, args[0]));
        lcd.cy = Math.max(0, Math.min(lcd.rows - 1, args[1]));
        if (args[1] >= lcd.rows) h.hint('lcdrow', `This LCD only has rows 0 to ${lcd.rows - 1}. Rows count from 0!`);
        break;
      }
      case 'print': {
        let text = '';
        if (args.length) {
          const t = this.typeOf(n.args[0]);
          if (args.length > 1 && typeof args[0] === 'number') text = t === 'float' ? formatFloat(args[0], args[1]) : inBase(args[0], args[1]);
          else text = this.toText(args[0], t);
        }
        write(text);
        break;
      }
      case 'write': write(typeof args[0] === 'string' ? args[0] : String.fromCharCode(args[0])); break;
      case 'println': h.hint('lcdprintln', 'LCDs don’t understand new lines. Use lcd.setCursor(0, 1) to move to the second row.'); write(args.length ? this.toText(args[0], this.typeOf(n.args[0])) : ''); break;
      case 'scrollDisplayLeft': lcd.lines = lcd.lines.map(l => l.slice(1) + ' '); break;
      case 'scrollDisplayRight': lcd.lines = lcd.lines.map(l => ' ' + l.slice(0, -1)); break;
      case 'cursor': case 'noCursor': case 'blink': case 'noBlink': break;
      default: throw new RuntimeError(`The LCD has no method "${prop}()"`, n.line);
    }
    h.lcdUpdate(lcd);
    return undefined;
  }

  private neoCall(strip: any, prop: string, args: Value[], n: Node): Value {
    const pack = (r: number, g: number, b: number) => ((clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)) >>> 0;
    switch (prop) {
      case 'begin': strip.begun = true; return;
      case 'show':
        if (!strip.begun) this.host.hint('neobegin', 'Call strip.begin() in setup() before strip.show().');
        this.host.neoShow(strip.pin, strip.pixels.slice(), strip.brightness);
        return;
      case 'Color': return pack(args[0], args[1], args[2]);
      case 'ColorHSV': {
        const h = ((args[0] ?? 0) % 65536) / 65536, sat = (args[1] ?? 255) / 255, val = (args[2] ?? 255) / 255;
        const f = (k: number) => { const x = (k + h * 6) % 6; return val - val * sat * Math.max(0, Math.min(x, 4 - x, 1)); };
        return pack(f(5) * 255, f(3) * 255, f(1) * 255);
      }
      case 'gamma32': return args[0];
      case 'setPixelColor': {
        const i = args[0];
        const c = args.length >= 4 ? pack(args[1], args[2], args[3]) : args[1] >>> 0;
        if (Number.isInteger(i) && i >= 0 && i < strip.count) strip.pixels[i] = c;
        else this.host.hint('neorange', `setPixelColor(${i}, ...) is outside the strip (0 to ${strip.count - 1}), so it was ignored.`);
        return;
      }
      case 'getPixelColor': return strip.pixels[args[0]] ?? 0;
      case 'fill': {
        const c = (args[0] ?? 0) >>> 0, first = args[1] ?? 0, count = args[2] ?? strip.count - first;
        for (let i = first; i < Math.min(strip.count, first + count); i++) strip.pixels[i] = c;
        return;
      }
      case 'clear': strip.pixels.fill(0); return;
      case 'setBrightness': strip.brightness = clamp8(args[0]); return;
      case 'getBrightness': return strip.brightness;
      case 'numPixels': return strip.count;
      case 'setPin': strip.pin = args[0]; return;
    }
    throw new RuntimeError(`The NeoPixel strip has no method "${prop}()"`, n.line);
  }

  private *callMember(n: Node): Gen<Value> {
    const obj = n.callee.obj;
    const prop: string = n.callee.prop;
    const args = yield* this.evalArgs(n);
    const global = (name: string) => obj.k === 'Ident' && obj.name === name && !this.findVar(name);
    if (global('Serial')) {
      const h = this.host;
      if (prop === 'begin') { h.serialBegin(args[0] ?? 9600); return; }
      if (prop === 'flush' || prop === 'end') return;
      return this.streamCall({ name: 'Serial', write: t => h.serialWrite(t), available: () => h.serialAvailable(), read: () => h.serialRead() }, prop, args, n);
    }
    if (global('SD')) return this.sdCall(prop, args, n);
    if (global('IrReceiver')) {
      const ir = this.ir;
      switch (prop) {
        case 'begin': ir.pin = args[0]; return;
        case 'decode': {
          if (ir.pin == null) { this.host.hint('irbegin', 'Call IrReceiver.begin(pin) in setup() first, with the pin the receiver’s signal leg is wired to.'); return 0; }
          const got = this.host.irDecode(ir.pin);
          if (!got) return 0;
          ir.data = got;
          return 1;
        }
        case 'resume': return;
        case 'stop': case 'start': return;
      }
      throw new RuntimeError(`IrReceiver.${prop}() is not supported. Use begin(), decode(), resume() and IrReceiver.decodedIRData.command`, n.line);
    }
    if (obj.k !== 'Ident') throw new RuntimeError('Methods can only be called on named variables', n.line);
    const v = this.lookup(obj.name, n.line);
    if (v.type === 'Servo') {
      const id = v.value.servo;
      switch (prop) {
        case 'attach': v.value.attached = true; this.host.servoAttach(id, args[0], n.line); return 1;
        case 'write': {
          const angle = Math.min(180, Math.max(0, args[0]));
          v.value.angle = angle;
          this.host.servoWrite(id, angle);
          return;
        }
        case 'writeMicroseconds': {
          const angle = Math.min(180, Math.max(0, ((args[0] - 544) / (2400 - 544)) * 180));
          v.value.angle = angle;
          this.host.servoWrite(id, angle);
          return;
        }
        case 'read': return Math.round(v.value.angle ?? 90);
        case 'attached': return v.value.attached ? 1 : 0;
        case 'detach': v.value.attached = false; this.host.servoDetach(id); return;
      }
      throw new RuntimeError(`Servo has no method "${prop}()"`, n.line);
    }
    if (v.type === 'LCD') return this.lcdCall(v.value as LcdState, prop, args, n);
    if (v.type === 'NeoPixel') return this.neoCall(v.value, prop, args, n);
    if (v.type === 'OLED') return this.oledCall(v.value, prop, args, n);
    if (v.type === 'Matrix') {
      const mx = v.value;
      const push = () => this.host.matrixUpdate(mx.key, { rows: [...mx.rows], intensity: mx.intensity, shutdown: mx.shutdown });
      const drawing = () => { if (mx.shutdown) this.host.hint('lcwake', 'The LED matrix starts asleep: call lc.shutdown(0, false) in setup() to wake it.'); };
      const inRange = (x: number) => Number.isInteger(x) && x >= 0 && x < 8;
      switch (prop) {
        case 'shutdown': mx.shutdown = !!args[1]; push(); return;
        case 'setIntensity': mx.intensity = Math.max(0, Math.min(15, args[1])); push(); return;
        case 'clearDisplay': mx.rows.fill(0); push(); return;
        case 'setLed':
          drawing();
          if (!inRange(args[1]) || !inRange(args[2])) throw new RuntimeError(`setLed(addr, row, col, state): row and column go from 0 to 7, not ${args[1]}, ${args[2]}`, n.line);
          if (args[3]) mx.rows[args[1]] |= 0x80 >> args[2]; else mx.rows[args[1]] &= ~(0x80 >> args[2]);
          push();
          return;
        case 'setRow':
          drawing();
          if (!inRange(args[1])) throw new RuntimeError(`setRow(addr, row, value): row goes from 0 to 7, not ${args[1]}`, n.line);
          mx.rows[args[1]] = args[2] & 0xff;
          push();
          return;
        case 'setColumn':
          drawing();
          if (!inRange(args[1])) throw new RuntimeError(`setColumn(addr, col, value): column goes from 0 to 7, not ${args[1]}`, n.line);
          for (let r = 0; r < 8; r++) {
            if ((args[2] >> (7 - r)) & 1) mx.rows[r] |= 0x80 >> args[1]; else mx.rows[r] &= ~(0x80 >> args[1]);
          }
          push();
          return;
        case 'getDeviceCount': return 1;
      }
      throw new RuntimeError(`The LED matrix has no method "${prop}()"`, n.line);
    }
    if (v.type === 'SoftSerial') {
      const bt = v.value;
      if (prop === 'begin') { bt.begun = true; return; }
      if (prop === 'listen' || prop === 'end') return;
      if (prop === 'isListening') return 1;
      if (!bt.begun) this.host.hint('btbegin', `Call ${obj.name}.begin(9600) in setup() before using the Bluetooth link.`);
      const h = this.host;
      return this.streamCall({ name: obj.name, write: t => h.btWrite(bt.tx, t), available: () => h.btAvailable(bt.rx), read: () => h.btRead(bt.rx) }, prop, args, n);
    }
    if (v.type === 'File') {
      const f = v.value;
      if (!f) throw new RuntimeError(`"${obj.name}" isn’t an open file. SD.open() failed: check SD.begin() worked and the file name is right`, n.line);
      switch (prop) {
        case 'close': f.open = false; return;
        case 'size': return (f.files[f.name] ?? '').length;
        case 'name': return f.name;
        case 'position': return f.pos;
        case 'seek': f.pos = Math.max(0, args[0] ?? 0); return 1;
        case 'flush': return;
      }
      if (!f.open) throw new RuntimeError(`"${obj.name}" was already closed. Open it again with SD.open()`, n.line);
      return this.streamCall({
        name: obj.name,
        write: t => {
          if (!f.write) throw new RuntimeError(`"${obj.name}" was opened for reading. Use SD.open(name, FILE_WRITE) to write to it`, n.line);
          f.files[f.name] = (f.files[f.name] ?? '') + t;
        },
        available: () => Math.max(0, (f.files[f.name] ?? '').length - f.pos),
        read: () => { const c = (f.files[f.name] ?? '').charCodeAt(f.pos); if (Number.isNaN(c)) return -1; f.pos++; return c; },
      }, prop, args, n);
    }
    if (v.type === 'Digits') return this.digitsCall(v.value, prop, args, n);
    if (v.type === 'Compass') {
      const c = v.value;
      switch (prop) {
        case 'init': c.begun = true; return;
        case 'read': {
          if (!c.begun) this.host.hint('compassinit', `Call ${obj.name}.init() in setup() before reading the compass.`);
          const h = this.host.compassAzimuth();
          if (h == null) this.host.hint('compassnone', 'No compass answered. Wire its SDA to A4, SCL to A5, and VCC and GND.');
          else c.az = h;
          return;
        }
        case 'getAzimuth': return Math.round(c.az) % 360;
        // the field it measured, as if the Earth's pull were 1000 units strong
        case 'getX': return Math.round(Math.cos((c.az * Math.PI) / 180) * 1000);
        case 'getY': return Math.round(-Math.sin((c.az * Math.PI) / 180) * 1000);
        case 'getZ': return -400;
        case 'getBearing': return Math.round((((args[0] ?? c.az) % 360) + 360) % 360 / 22.5) % 16;
        case 'setCalibration': case 'setCalibrationOffsets': case 'setCalibrationScales': case 'setSmoothing': case 'setADDR': case 'setMode': case 'setReset': return;
      }
      throw new RuntimeError(`The compass has no method "${prop}()". Use init(), read() and getAzimuth()`, n.line);
    }
    if (v.type === 'Keypad') {
      const k = v.value;
      if (prop !== 'getKey') throw new RuntimeError(`The keypad has no method "${prop}()". Use keypad.getKey()`, n.line);
      const hit = this.host.keypadKey(k.rowPins, k.colPins);
      const id = hit ? `${hit[0]},${hit[1]}` : null;
      // like the real library: report each press once, not on every loop
      if (id === k.held) return 0;
      k.held = id;
      if (!hit) return 0;
      const key = k.keys[hit[0]]?.[hit[1]];
      return typeof key === 'number' ? key : 0;
    }
    if (v.type === 'Stepper') {
      const st = v.value;
      if (prop === 'setSpeed') { st.rpm = args[0]; return; }
      if (prop !== 'step') throw new RuntimeError(`The stepper has no method "${prop}()"`, n.line);
      if (!st.rpm || st.rpm <= 0) {
        this.host.hint('steprpm', 'Call motor.setSpeed(rpm) in setup() first. Without a speed the motor never moves (on real hardware the sketch freezes).');
        return;
      }
      const msPerStep = 60000 / (st.perRev * st.rpm);
      const dir = Math.sign(args[0]);
      for (let i = 0; i < Math.abs(args[0]); i++) {
        this.host.advance(msPerStep);
        st.pos += dir;
        this.host.stepperMove(st.pins, st.perRev, dir);
        if (this.host.shouldYield()) yield;
      }
      return;
    }
    if (v.type === 'DHT') {
      const s = v.value;
      if (prop === 'begin') { s.begun = true; return; }
      if (prop === 'readTemperature' || prop === 'readHumidity') {
        if (!s.begun) this.host.hint('dhtbegin', 'Call dht.begin() in setup() before reading the sensor.');
        // a real DHT read takes about a quarter of a second
        this.host.advance(250);
        if (this.host.shouldYield()) yield;
        const r = this.host.dhtRead(s.pin);
        if (!r) {
          this.host.hint('dhtnone', `No DHT sensor answered on pin ${s.pin}, so the reading is nan. Check the DATA wire, VCC and GND.`);
          return NaN;
        }
        const round = (x: number) => (s.model === 22 ? Math.round(x * 10) / 10 : Math.round(x));
        if (prop === 'readHumidity') return round(r.h);
        return args[0] ? round(r.t * 1.8 + 32) : round(r.t);
      }
      throw new RuntimeError(`The DHT sensor has no method "${prop}()"`, n.line);
    }
    if (v.type === 'String' && !v.isArray) {
      const s: string = v.value;
      switch (prop) {
        case 'length': return s.length;
        case 'toInt': return parseInt(s, 10) || 0;
        case 'toFloat': return parseFloat(s) || 0;
        case 'charAt': return s.charCodeAt(args[0]) || 0;
        case 'indexOf': return s.indexOf(typeof args[0] === 'number' ? String.fromCharCode(args[0]) : args[0]);
        case 'substring': return s.substring(args[0], args[1]);
        case 'equals': return s === args[0] ? 1 : 0;
        case 'startsWith': return s.startsWith(args[0]) ? 1 : 0;
        case 'endsWith': return s.endsWith(args[0]) ? 1 : 0;
        // In the sketch library these modify the string in place
        case 'trim': v.value = s.trim(); return;
        case 'toUpperCase': v.value = s.toUpperCase(); return;
        case 'toLowerCase': v.value = s.toLowerCase(); return;
      }
      throw new RuntimeError(`String has no method "${prop}()"`, n.line);
    }
    throw new RuntimeError(`"${obj.name}" (${v.type}) has no method "${prop}()"`, n.line);
  }
}

function truthy(v: Value): boolean {
  if (typeof v === 'string') return v.length > 0;
  return !!v;
}

function countLeaves(a: any[]): number {
  return a.reduce((n, x) => n + (Array.isArray(x) ? countLeaves(x) : 1), 0);
}

const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const TYPE_NAMES: Record<string, string> = { uint: 'unsigned int', ulong: 'unsigned long', LCD: 'LiquidCrystal_I2C', NeoPixel: 'Adafruit_NeoPixel' };

function describeValue(type: string, v: any): string {
  if (Array.isArray(v)) {
    const items = v.slice(0, 8).map(x => describeValue(type, x));
    return `{${items.join(', ')}${v.length > 8 ? ', …' : ''}}`;
  }
  if (type === 'String') return JSON.stringify(v);
  if (type === 'float') return formatFloat(v, 2);
  if (type === 'bool') return v ? 'true' : 'false';
  if (type === 'char') return v >= 32 && v < 127 ? `'${String.fromCharCode(v)}' (${v})` : String(v);
  return String(v);
}

function describe(v: Var): string {
  const o = v.value;
  if (v.type === 'Servo') return o.attached ? `angle ${Math.round(o.angle ?? 90)}°` : 'not attached';
  if (v.type === 'LCD') return o.lines.map((l: string) => `"${l.trimEnd()}"`).join(' / ');
  if (v.type === 'NeoPixel') return `${o.count} pixels on pin ${o.pin}`;
  if (v.type === 'DHT') return `DHT${o.model} on pin ${o.pin}`;
  return describeValue(v.type, o);
}
