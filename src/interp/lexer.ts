// Tokenizer for the board (C++ subset) language, with a tiny preprocessor
// that handles #include (ignored) and object-like #define macros.

export type TokType = 'num' | 'str' | 'id' | 'op' | 'eof';

export interface Token {
  type: TokType;
  value: string;
  line: number;
  num?: number;
  isFloat?: boolean;
}

export class CompileError extends Error {
  constructor(message: string, public line: number) {
    super(message);
  }
}

const OPS3 = ['<<=', '>>='];
const OPS2 = ['++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '::', '->'];
const OPS1 = '+-*/%=<>!&|^~?:;,.(){}[]';

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"' };

export function lex(src: string): Token[] {
  const defines = new Map<string, Token[]>();
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let atLineStart = true;

  const push = (t: Token) => {
    if (t.type === 'id' && defines.has(t.value)) {
      for (const d of defines.get(t.value)!) out.push({ ...d, line: t.line });
    } else {
      out.push(t);
    }
  };

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; atLineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    if (c === '#' && atLineStart) {
      let end = src.indexOf('\n', i);
      if (end < 0) end = src.length;
      const directive = src.slice(i + 1, end).replace(/\/\/.*$/, '').trim();
      const m = directive.match(/^define\s+([A-Za-z_]\w*)\s*(.*)$/);
      if (m) {
        if (m[2].startsWith('(')) throw new CompileError('Function-style #define macros are not supported', line);
        const body = lex(m[2]).filter(t => t.type !== 'eof');
        defines.set(m[1], body);
      } else if (!/^(include|ifndef|ifdef|endif|pragma|undef|if|else)\b/.test(directive)) {
        throw new CompileError(`Unknown preprocessor directive: #${directive.split(/\s/)[0]}`, line);
      }
      i = end;
      continue;
    }
    atLineStart = false;

    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }

    // numbers
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const start = i;
      let value: number;
      let isFloat = false;
      if (c === '0' && /[xX]/.test(src[i + 1] ?? '')) {
        i += 2;
        while (/[0-9a-fA-F]/.test(src[i] ?? '')) i++;
        value = parseInt(src.slice(start + 2, i), 16);
      } else if (c === '0' && /[bB]/.test(src[i + 1] ?? '')) {
        i += 2;
        while (/[01]/.test(src[i] ?? '')) i++;
        value = parseInt(src.slice(start + 2, i), 2);
      } else {
        while (/[0-9]/.test(src[i] ?? '')) i++;
        if (src[i] === '.') { isFloat = true; i++; while (/[0-9]/.test(src[i] ?? '')) i++; }
        if (/[eE]/.test(src[i] ?? '') && /[-+0-9]/.test(src[i + 1] ?? '')) {
          isFloat = true; i += 2;
          while (/[0-9]/.test(src[i] ?? '')) i++;
        }
        value = parseFloat(src.slice(start, i));
      }
      let suffix = '';
      while (/[uUlLfF]/.test(src[i] ?? '')) suffix += src[i++];
      if (/[fF]/.test(suffix)) isFloat = true;
      if (/[A-Za-z_]/.test(src[i] ?? '')) throw new CompileError(`Invalid number "${src.slice(start, i + 1)}"`, line);
      push({ type: 'num', value: src.slice(start, i), num: value, isFloat, line });
      continue;
    }

    // identifiers (binary constants like B1010 become numbers)
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (/[A-Za-z0-9_]/.test(src[i] ?? '')) i++;
      const word = src.slice(start, i);
      if (/^B[01]{1,8}$/.test(word)) push({ type: 'num', value: word, num: parseInt(word.slice(1), 2), line });
      else push({ type: 'id', value: word, line });
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      let s = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\n') throw new CompileError('Missing closing quote', line);
        if (src[i] === '\\') { s += ESCAPES[src[i + 1]] ?? src[i + 1]; i += 2; }
        else s += src[i++];
      }
      if (i >= src.length) throw new CompileError('Missing closing quote', line);
      i++;
      if (quote === '"') push({ type: 'str', value: s, line });
      else {
        if (s.length !== 1) throw new CompileError(`A char literal holds exactly one character: '${s}'`, line);
        push({ type: 'num', value: `'${s}'`, num: s.charCodeAt(0), line });
      }
      continue;
    }

    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (OPS3.includes(three)) { push({ type: 'op', value: three, line }); i += 3; continue; }
    if (OPS2.includes(two)) { push({ type: 'op', value: two, line }); i += 2; continue; }
    if (OPS1.includes(c)) { push({ type: 'op', value: c, line }); i++; continue; }

    throw new CompileError(`Unexpected character "${c}"`, line);
  }
  out.push({ type: 'eof', value: '<end of file>', line });
  return out;
}
