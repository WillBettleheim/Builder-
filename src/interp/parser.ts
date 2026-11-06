// Recursive-descent parser producing a loose AST for the board C++ subset.
import { CompileError, lex, type Token } from './lexer';

// Every AST node has a kind and source line; the rest is kind-specific.
export interface Node {
  k: string;
  line: number;
  [key: string]: any;
}

export interface FuncDef {
  name: string;
  ret: string;
  params: { type: string; name: string; isArray: boolean; isRef: boolean }[];
  body: Node;
  line: number;
}

export interface Program {
  globals: Node[];
  funcs: Map<string, FuncDef>;
}

const QUALIFIERS = new Set(['const', 'static', 'volatile', 'unsigned', 'signed', 'long', 'short']);
const TYPE_WORDS = new Set([
  'void', 'int', 'long', 'short', 'unsigned', 'signed', 'float', 'double', 'bool', 'boolean', 'byte', 'char',
  'word', 'String', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'uint64_t',
  'int64_t', 'Servo', 'LiquidCrystal_I2C', 'LiquidCrystal', 'Adafruit_NeoPixel', 'DHT', 'Adafruit_SSD1306', 'Stepper', 'Keypad', 'LedControl', 'SoftwareSerial', 'File', 'TM1637Display', 'QMC5883LCompass', 'const', 'static', 'volatile',
]);

/** Collapse C type spellings to the handful of storage types the interpreter models. */
function normalizeType(words: string[], line: number): string {
  const w = words.filter(x => !['const', 'static', 'volatile', 'signed'].includes(x));
  const unsigned = w.includes('unsigned');
  const rest = w.filter(x => x !== 'unsigned');
  const has = (x: string) => rest.includes(x);
  if (has('float') || has('double')) return 'float';
  if (has('bool') || has('boolean')) return 'bool';
  if (has('void')) return 'void';
  if (has('String')) return 'String';
  if (has('Servo')) return 'Servo';
  if (has('LiquidCrystal_I2C')) return 'LCD';
  if (has('Adafruit_NeoPixel')) return 'NeoPixel';
  if (has('DHT')) return 'DHT';
  if (has('Adafruit_SSD1306')) return 'OLED';
  if (has('Stepper')) return 'Stepper';
  if (has('Keypad')) return 'Keypad';
  if (has('LedControl')) return 'Matrix';
  if (has('SoftwareSerial')) return 'SoftSerial';
  if (has('File')) return 'File';
  if (has('TM1637Display')) return 'Digits';
  if (has('QMC5883LCompass')) return 'Compass';
  if (has('LiquidCrystal')) throw new CompileError('This simulator has the I2C LCD: use #include <LiquidCrystal_I2C.h> and LiquidCrystal_I2C lcd(0x27, 16, 2);', line);
  if (has('byte') || has('uint8_t') || (unsigned && has('char'))) return 'byte';
  if (has('char') || has('int8_t')) return 'char';
  if (has('long') || has('int32_t') || has('int64_t')) return unsigned ? 'ulong' : 'long';
  if (has('uint32_t') || has('size_t') || has('uint64_t')) return 'ulong';
  if (has('word') || has('uint16_t')) return 'uint';
  if (has('int') || has('short') || has('int16_t') || rest.length === 0) return unsigned ? 'uint' : 'int';
  throw new CompileError(`Unknown type "${words.join(' ')}"`, line);
}

const BINARY_PREC: Record<string, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
const OBJECT_TYPES = new Set(['Servo', 'LCD', 'NeoPixel', 'DHT', 'OLED', 'Stepper', 'Keypad', 'Matrix', 'SoftSerial', 'Digits', 'Compass']);
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

export function parse(src: string): Program {
  const toks = lex(src);
  let p = 0;
  const peek = (o = 0): Token => toks[Math.min(p + o, toks.length - 1)];
  const next = (): Token => toks[p++];
  const is = (v: string, o = 0) => { const t = peek(o); return (t.type === 'op' || t.type === 'id') && t.value === v; };
  const accept = (v: string) => { if (is(v)) { p++; return true; } return false; };
  const expect = (v: string, what?: string): Token => {
    if (!is(v)) {
      const t = peek();
      // A missing semicolon is reported on the line it belongs to, like the real compiler.
      const line = v === ';' && p > 0 ? toks[p - 1].line : t.line;
      throw new CompileError(`Expected "${v}"${what ? ` ${what}` : ''} but found "${t.value}"`, line);
    }
    return next();
  };
  const ident = (what: string): Token => {
    const t = peek();
    if (t.type !== 'id') throw new CompileError(`Expected ${what} but found "${t.value}"`, t.line);
    return next();
  };
  const isTypeStart = () => peek().type === 'id' && TYPE_WORDS.has(peek().value);

  function parseType(): string {
    const line = peek().line;
    const words: string[] = [];
    while (peek().type === 'id' && TYPE_WORDS.has(peek().value)) {
      const w = peek().value;
      // stop after a base type unless what follows is a qualifier-ish word (e.g. "long int")
      if (words.length && !QUALIFIERS.has(words[words.length - 1]) && !QUALIFIERS.has(w) && w !== 'int') break;
      words.push(next().value);
    }
    return normalizeType(words, line);
  }

  // ---------- expressions ----------
  function parseExpr(): Node {
    let e = parseAssign();
    while (is(',')) {
      const line = next().line;
      e = { k: 'Comma', line, left: e, right: parseAssign() };
    }
    return e;
  }

  function parseAssign(): Node {
    const left = parseTernary();
    const t = peek();
    if (t.type === 'op' && ASSIGN_OPS.has(t.value)) {
      next();
      if (!['Ident', 'Index'].includes(left.k)) throw new CompileError('Left side of an assignment must be a variable', t.line);
      return { k: 'Assign', line: t.line, op: t.value, target: left, value: parseAssign() };
    }
    return left;
  }

  function parseTernary(): Node {
    const cond = parseBinary(1);
    if (is('?')) {
      const line = next().line;
      const a = parseAssign();
      expect(':', 'in ?: expression');
      const b = parseAssign();
      return { k: 'Cond', line, cond, a, b };
    }
    return cond;
  }

  function parseBinary(minPrec: number): Node {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      const prec = t.type === 'op' ? BINARY_PREC[t.value] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      next();
      const right = parseBinary(prec + 1);
      left = { k: t.value === '&&' || t.value === '||' ? 'Logical' : 'Binary', line: t.line, op: t.value, left, right };
    }
  }

  function parseUnary(): Node {
    const t = peek();
    if (t.type === 'op' && ['!', '-', '+', '~'].includes(t.value)) {
      next();
      return { k: 'Unary', line: t.line, op: t.value, arg: parseUnary() };
    }
    if (t.type === 'op' && (t.value === '++' || t.value === '--')) {
      next();
      const arg = parseUnary();
      return { k: 'Update', line: t.line, op: t.value, prefix: true, arg };
    }
    if (t.type === 'op' && t.value === '&' && peek(1).type === 'id' && peek(1).value === 'Wire') {
      // &Wire just names the I2C bus; there is only one
      next(); next();
      return { k: 'Num', line: t.line, value: 0, isFloat: false };
    }
    if (t.type === 'op' && t.value === '&') {
      throw new CompileError('Pointers and the & address operator are not supported in this simulator', t.line);
    }
    // cast: (type) expr
    if (is('(') && peek(1).type === 'id' && TYPE_WORDS.has(peek(1).value) && peek(1).value !== 'String') {
      const save = p;
      next();
      const type = parseType();
      if (accept(')')) return { k: 'Cast', line: t.line, type, arg: parseUnary() };
      p = save;
    }
    if (t.type === 'id' && t.value === 'sizeof') {
      next();
      expect('(', 'after sizeof');
      let node: Node;
      if (isTypeStart()) node = { k: 'SizeofType', line: t.line, type: parseType() };
      else node = { k: 'Sizeof', line: t.line, arg: parseExpr() };
      expect(')', 'to close sizeof');
      return node;
    }
    return parsePostfix();
  }

  function parseArgs(): Node[] {
    const args: Node[] = [];
    if (!is(')')) {
      do args.push(parseAssign()); while (accept(','));
    }
    expect(')', 'to close the function call');
    return args;
  }

  function parsePostfix(): Node {
    let e = parsePrimary();
    for (;;) {
      const t = peek();
      if (is('(')) {
        next();
        if (e.k !== 'Ident' && e.k !== 'Member') throw new CompileError('Only named functions can be called', t.line);
        e = { k: 'Call', line: t.line, callee: e, args: parseArgs() };
      } else if (is('[')) {
        next();
        const idx = parseExpr();
        expect(']', 'to close the array index');
        e = { k: 'Index', line: t.line, obj: e, idx };
      } else if (is('.') || is('->')) {
        next();
        e = { k: 'Member', line: t.line, obj: e, prop: ident('a member name').value };
      } else if (is('++') || is('--')) {
        next();
        e = { k: 'Update', line: t.line, op: t.value, prefix: false, arg: e };
      } else return e;
    }
  }

  function parsePrimary(): Node {
    const t = next();
    if (t.type === 'num') return { k: 'Num', line: t.line, value: t.num, isFloat: !!t.isFloat };
    if (t.type === 'str') {
      let s = t.value;
      while (peek().type === 'str') s += next().value; // "a" "b" concatenation
      return { k: 'Str', line: t.line, value: s };
    }
    if (t.type === 'id') {
      if (t.value === 'String' && is('(')) return { k: 'Ident', line: t.line, name: 'String' };
      return { k: 'Ident', line: t.line, name: t.value };
    }
    if (t.value === '(') {
      const e = parseExpr();
      expect(')', 'to close the parenthesis');
      return e;
    }
    throw new CompileError(`Unexpected "${t.value}"`, t.line);
  }

  // ---------- statements ----------
  function parseArrayInit(): Node {
    const line = expect('{').line;
    const items: Node[] = [];
    if (!is('}')) {
      do {
        if (is('}')) break;
        items.push(is('{') ? parseArrayInit() : parseAssign());
      } while (accept(','));
    }
    expect('}', 'to close the list of values');
    return { k: 'ArrayInit', line, items };
  }

  function parseVarDecl(type: string, firstName?: Token): Node {
    const line = peek().line;
    const decls: Node[] = [];
    let nameTok = firstName;
    for (;;) {
      const name = nameTok ?? ident('a variable name');
      nameTok = undefined;
      const d: Node = { k: 'Declarator', line: name.line, name: name.value, isArray: false, dims: [] };
      while (accept('[')) {
        d.isArray = true;
        if (d.dims.length && is(']')) throw new CompileError('Only the first array size may be left out', name.line);
        d.dims.push(is(']') ? null : parseExpr());
        expect(']', 'to close the array size');
      }
      if (d.dims.length > 3) throw new CompileError('Arrays can have at most 3 dimensions here', name.line);
      d.size = d.dims[0] ?? null;
      if (OBJECT_TYPES.has(type) && is('(')) {
        next();
        d.ctorArgs = parseArgs();
      }
      if (accept('=')) {
        if (is('{')) {
          d.init = parseArrayInit();
        } else if (d.isArray && peek().type === 'str') {
          const s = next().value;
          d.init = { k: 'ArrayInit', line: name.line, items: [...s, '\0'].map(ch => ({ k: 'Num', line: name.line, value: ch.charCodeAt(0) })) };
        } else {
          d.init = parseAssign();
        }
      }
      if (d.isArray && d.size == null && !d.init) throw new CompileError(`Array "${d.name}" needs a size or a list of values`, name.line);
      decls.push(d);
      if (!accept(',')) break;
    }
    expect(';', 'after the variable declaration');
    return { k: 'VarDecl', line, type, decls };
  }

  function parseBlock(): Node {
    const line = expect('{').line;
    const body: Node[] = [];
    while (!is('}')) {
      if (peek().type === 'eof') throw new CompileError('Missing "}" — a { was never closed', line);
      body.push(parseStatement());
    }
    next();
    return { k: 'Block', line, body };
  }

  function parseStatement(): Node {
    const t = peek();
    if (is('{')) return parseBlock();
    if (is(';')) { next(); return { k: 'Empty', line: t.line }; }
    if (t.type === 'id') {
      switch (t.value) {
        case 'if': {
          next(); expect('(', 'after if');
          const cond = parseExpr(); expect(')', 'to close the if condition');
          const then = parseStatement();
          const otherwise = accept('else') ? parseStatement() : null;
          return { k: 'If', line: t.line, cond, then, otherwise };
        }
        case 'while': {
          next(); expect('(', 'after while');
          const cond = parseExpr(); expect(')', 'to close the while condition');
          return { k: 'While', line: t.line, cond, body: parseStatement() };
        }
        case 'do': {
          next();
          const body = parseStatement();
          expect('while', 'after the do { } block');
          expect('('); const cond = parseExpr(); expect(')'); expect(';');
          return { k: 'DoWhile', line: t.line, cond, body };
        }
        case 'for': {
          next(); expect('(', 'after for');
          let init: Node | null = null;
          if (isTypeStart()) init = parseVarDecl(parseType());
          else { if (!is(';')) init = { k: 'ExprStmt', line: t.line, expr: parseExpr() }; expect(';', 'in the for loop'); }
          const cond = is(';') ? null : parseExpr();
          expect(';', 'in the for loop');
          const update = is(')') ? null : parseExpr();
          expect(')', 'to close the for loop header');
          return { k: 'For', line: t.line, init, cond, update, body: parseStatement() };
        }
        case 'switch': {
          next(); expect('(');
          const disc = parseExpr(); expect(')'); expect('{');
          const cases: { test: Node | null; body: Node[] }[] = [];
          while (!is('}')) {
            if (accept('case')) {
              const test = parseTernary(); expect(':', 'after case value');
              cases.push({ test, body: [] });
            } else if (accept('default')) {
              expect(':'); cases.push({ test: null, body: [] });
            } else {
              if (!cases.length) throw new CompileError('Expected "case" inside switch', peek().line);
              cases[cases.length - 1].body.push(parseStatement());
            }
          }
          next();
          return { k: 'Switch', line: t.line, disc, cases };
        }
        case 'return': {
          next();
          const value = is(';') ? null : parseExpr();
          expect(';', 'after return');
          return { k: 'Return', line: t.line, value };
        }
        case 'break': next(); expect(';', 'after break'); return { k: 'Break', line: t.line };
        case 'continue': next(); expect(';', 'after continue'); return { k: 'Continue', line: t.line };
      }
      if (isTypeStart()) return parseVarDecl(parseType());
    }
    const expr = parseExpr();
    expect(';', 'at the end of the statement');
    return { k: 'ExprStmt', line: t.line, expr };
  }

  // ---------- top level ----------
  const program: Program = { globals: [], funcs: new Map() };
  while (peek().type !== 'eof') {
    const t = peek();
    if (is(';')) { next(); continue; }
    if (!isTypeStart()) {
      throw new CompileError(`Expected a variable or function declaration but found "${t.value}". Code must be inside a function like setup() or loop().`, t.line);
    }
    const type = parseType();
    const name = ident('a name');
    if (is('(') && !OBJECT_TYPES.has(type)) {
      next();
      const params: FuncDef['params'] = [];
      if (!is(')')) {
        if (is('void') && peek(1).value === ')') next();
        else do {
          const pt = parseType();
          if (is('*')) throw new CompileError('Pointer parameters are not supported. Use a reference (int &x) or an array (int arr[]).', peek().line);
          const isRef = accept('&');
          const pn = ident('a parameter name');
          let isArray = false;
          while (accept('[')) {
            if (!is(']')) parseExpr();
            expect(']');
            isArray = true;
          }
          params.push({ type: pt, name: pn.value, isArray, isRef });
        } while (accept(','));
      }
      expect(')', 'to close the parameter list');
      if (accept(';')) continue; // prototype
      if (program.funcs.has(name.value)) throw new CompileError(`Function "${name.value}" is defined twice`, name.line);
      program.funcs.set(name.value, { name: name.value, ret: type, params, body: parseBlock(), line: name.line });
    } else {
      program.globals.push(parseVarDecl(type, name));
    }
  }
  if (!program.funcs.has('setup')) throw new CompileError('Your sketch needs a "void setup()" function', 1);
  if (!program.funcs.has('loop')) throw new CompileError('Your sketch needs a "void loop()" function', 1);
  return program;
}
