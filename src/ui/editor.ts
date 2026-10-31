// Lightweight code editor: a transparent textarea over a syntax-highlighted <pre>,
// with autocomplete, hover help and a marker for the line that's running.
import { DOCS, PLAIN_WORDS, objectKind } from './docs';

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'switch', 'case', 'default', 'const', 'static', 'volatile', 'sizeof']);
const TYPES = new Set(['void', 'int', 'long', 'short', 'unsigned', 'signed', 'float', 'double', 'bool', 'boolean', 'byte', 'char', 'word', 'String', 'Servo', 'DHT', 'LiquidCrystal_I2C', 'Adafruit_NeoPixel', 'Adafruit_SSD1306', 'Stepper', 'Keypad', 'LedControl', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t']);
const CONSTS = new Set(['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'true', 'false', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'PI', 'DEC', 'HEX', 'BIN', 'OCT', 'RISING', 'FALLING', 'CHANGE', 'DHT11', 'DHT22', 'SSD1306_WHITE', 'SSD1306_BLACK', 'SSD1306_SWITCHCAPVCC', 'NO_KEY']);
const BUILTINS = new Set(['pinMode', 'digitalWrite', 'digitalRead', 'analogWrite', 'analogRead', 'delay', 'delayMicroseconds', 'millis', 'micros', 'tone', 'noTone', 'pulseIn', 'map', 'constrain', 'min', 'max', 'abs', 'random', 'Serial', 'setup', 'loop', 'sqrt', 'pow', 'sin', 'cos', 'attachInterrupt', 'digitalPinToInterrupt']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(src: string): string {
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b0x[0-9a-fA-F]+\b|\b\d+\.?\d*(?:[eE][-+]?\d+)?[uUlLfF]*\b)|([A-Za-z_]\w*)/gm;
  let out = '';
  let last = 0;
  for (let m; (m = re.exec(src)); ) {
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = esc(m[0]);
    if (m[1]) out += `<span class="tk-com">${t}</span>`;
    else if (m[2]) out += `<span class="tk-str">${t}</span>`;
    else if (m[3]) out += `<span class="tk-pre">${t}</span>`;
    else if (m[4]) out += `<span class="tk-num">${t}</span>`;
    else if (KEYWORDS.has(m[5])) out += `<span class="tk-kw">${t}</span>`;
    else if (TYPES.has(m[5])) out += `<span class="tk-type">${t}</span>`;
    else if (CONSTS.has(m[5])) out += `<span class="tk-const">${t}</span>`;
    else if (BUILTINS.has(m[5])) out += `<span class="tk-fn">${t}</span>`;
    else out += t;
  }
  return out + esc(src.slice(last)) + '\n';
}

export class CodeEditor {
  private ta: HTMLTextAreaElement;
  private pre: HTMLElement;
  private gutter: HTMLElement;
  private errorLine: number | null = null;
  private root: HTMLElement;
  private scroll: HTMLElement;
  private runMark: HTMLElement;
  private popup: HTMLElement;
  private tip: HTMLElement;
  private items: { label: string; insert: string; detail: string }[] = [];
  private active = 0;
  private prefixStart = -1;
  private tipTimer = 0;
  private charW = 0;
  onInput: (code: string) => void = () => {};

  constructor(root: HTMLElement) {
    root.classList.add('editor');
    root.innerHTML = `<div class="ed-gutter"></div><div class="ed-scroll"><pre class="ed-hl" aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Sketch code"></textarea></div>`;
    this.gutter = root.querySelector('.ed-gutter')!;
    this.pre = root.querySelector('.ed-hl')!;
    this.ta = root.querySelector('textarea')!;
    this.root = root;
    const scroll = (this.scroll = root.querySelector<HTMLElement>('.ed-scroll')!);
    scroll.addEventListener('scroll', () => { this.gutter.scrollTop = scroll.scrollTop; this.closePopup(); });
    this.runMark = document.createElement('div');
    this.runMark.className = 'run-line';
    this.runMark.hidden = true;
    scroll.prepend(this.runMark);
    this.popup = document.createElement('div');
    this.popup.className = 'ac';
    this.popup.hidden = true;
    this.popup.setAttribute('role', 'listbox');
    root.appendChild(this.popup);
    this.tip = document.createElement('div');
    this.tip.className = 'ed-tip';
    this.tip.hidden = true;
    root.appendChild(this.tip);
    this.ta.addEventListener('input', e => {
      this.clearError();
      this.render();
      this.onInput(this.ta.value);
      const it = (e as InputEvent).inputType;
      if (it === 'insertText' || it === 'deleteContentBackward') this.complete(it === 'insertText');
      else this.closePopup();
    });
    this.ta.addEventListener('keydown', e => this.key(e));
    this.ta.addEventListener('blur', () => setTimeout(() => this.closePopup(), 120));
    this.ta.addEventListener('click', () => this.closePopup());
    this.ta.addEventListener('mousemove', e => this.hover(e));
    this.ta.addEventListener('mouseleave', () => { clearTimeout(this.tipTimer); this.tip.hidden = true; });
    this.popup.addEventListener('mousedown', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (!el) return;
      e.preventDefault();
      this.active = Number(el.dataset.i);
      this.accept();
    });
  }

  /** Scroll so a line is comfortably in view. */
  revealLine(line: number) {
    const { lh, pad } = this.metrics();
    const top = pad + (line - 1) * lh;
    const s = this.scroll;
    if (top < s.scrollTop + lh || top > s.scrollTop + s.clientHeight - 2 * lh) s.scrollTop = top - s.clientHeight / 3;
  }

  /** Highlight the line the simulated board is executing (null to hide). */
  setRunLine(line: number | null) {
    if (line == null) { this.runMark.hidden = true; return; }
    this.runMark.hidden = false;
    this.runMark.style.top = `calc(${line - 1} * var(--lh) + var(--pad))`;
  }

  // ---------- geometry ----------
  private metrics() {
    if (!this.charW) {
      const probe = document.createElement('span');
      probe.textContent = 'M'.repeat(20);
      this.pre.appendChild(probe);
      this.charW = probe.getBoundingClientRect().width / 20 || 7.8;
      probe.remove();
    }
    const cs = getComputedStyle(this.root);
    return { cw: this.charW, lh: parseFloat(cs.getPropertyValue('--lh')) || 20, pad: parseFloat(cs.getPropertyValue('--pad')) || 12 };
  }

  /** Pixel position (relative to the editor) just below a character index. */
  private caretXY(index: number) {
    const { cw, lh, pad } = this.metrics();
    const before = this.ta.value.slice(0, index);
    const line = before.split('\n').length - 1;
    const col = index - (before.lastIndexOf('\n') + 1);
    return {
      x: this.gutter.offsetWidth + pad + col * cw - this.scroll.scrollLeft,
      y: pad + (line + 1) * lh - this.scroll.scrollTop,
    };
  }

  // ---------- autocomplete ----------
  private complete(typed: boolean) {
    const v = this.ta.value;
    const caret = this.ta.selectionStart;
    const before = v.slice(0, caret);
    const member = before.match(/([A-Za-z_]\w*)\.(\w*)$/);
    const word = before.match(/[A-Za-z_]\w*$/)?.[0] ?? '';
    let cands: { label: string; insert: string; detail: string }[] = [];
    if (member) {
      const kind = objectKind(v, member[1]);
      if (!kind) return this.closePopup();
      cands = Object.entries(DOCS)
        .filter(([k]) => k.startsWith(kind + '.'))
        .map(([k, d]) => ({ label: k.slice(kind.length + 1), insert: k.slice(kind.length + 1) + '(', detail: d.sig }));
      this.prefixStart = caret - member[2].length;
      cands = cands.filter(c => c.label.toLowerCase().startsWith(member[2].toLowerCase()));
    } else {
      if (word.length < 2) return this.closePopup();
      if (!typed && this.popup.hidden) return; // backspacing only refines an open list
      // don't pop up inside comments or strings
      const lineText = before.slice(before.lastIndexOf('\n') + 1);
      if (/\/\//.test(lineText) || (lineText.split('"').length - 1) % 2 === 1) return this.closePopup();
      this.prefixStart = caret - word.length;
      const seen = new Set<string>();
      const add = (label: string, insert: string, detail: string) => {
        if (seen.has(label) || label === word || !label.toLowerCase().startsWith(word.toLowerCase())) return;
        seen.add(label);
        cands.push({ label, insert, detail });
      };
      for (const [k, d] of Object.entries(DOCS)) if (!k.includes('.')) add(k, d.kind === 'const' || d.kind === 'kw' || d.kind === 'type' || k === 'setup' || k === 'loop' ? k : k + '(', d.sig);
      for (const w of PLAIN_WORDS) add(w, w, w === 'Servo' || w.includes('_') ? 'library type' : 'keyword');
      // names declared in this sketch
      const declared = new Set(v.match(/\b[A-Za-z_]\w*\b/g) ?? []);
      for (const w of declared) if (w.length > 1 && !DOCS[w]) add(w, w, 'in your code');
    }
    if (!cands.length) return this.closePopup();
    this.items = cands.slice(0, 8);
    this.active = 0;
    this.renderPopup();
  }

  private renderPopup() {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.popup.innerHTML = this.items.map((it, i) => `<div class="ac-item ${i === this.active ? 'on' : ''}" data-i="${i}" role="option"><b>${esc(it.label)}</b><span>${esc(it.detail)}</span></div>`).join('');
    const doc = DOCS[this.items[this.active].detail === 'in your code' ? '' : this.items[this.active].label];
    if (doc && doc.doc) this.popup.insertAdjacentHTML('beforeend', `<div class="ac-doc">${esc(doc.doc)}</div>`);
    const { x, y } = this.caretXY(this.prefixStart);
    this.popup.hidden = false;
    const maxX = this.root.clientWidth - this.popup.offsetWidth - 6;
    this.popup.style.left = `${Math.max(4, Math.min(x, maxX))}px`;
    const below = y + 4;
    this.popup.style.top = below + this.popup.offsetHeight > this.root.clientHeight ? `${y - this.metrics().lh - this.popup.offsetHeight - 4}px` : `${below}px`;
  }

  private closePopup() {
    this.popup.hidden = true;
    this.items = [];
  }

  private accept() {
    const it = this.items[this.active];
    if (!it) return;
    const caret = this.ta.selectionStart;
    let insert = it.insert;
    const next = this.ta.value[caret];
    if (insert.endsWith('(') && next === '(') insert = insert.slice(0, -1);
    else if (insert.endsWith('(')) insert += ')';
    this.ta.setRangeText(insert, this.prefixStart, caret, 'end');
    // leave the caret inside the parentheses when the function takes arguments
    if (insert.endsWith('()') && !/\(\)/.test(it.detail)) this.ta.selectionStart = this.ta.selectionEnd = this.ta.selectionEnd - 1;
    this.closePopup();
    this.ta.dispatchEvent(new Event('input'));
  }

  // ---------- hover help ----------
  private hover(e: MouseEvent) {
    clearTimeout(this.tipTimer);
    this.tip.hidden = true;
    const { cw, lh, pad } = this.metrics();
    const line = Math.floor((e.offsetY - pad) / lh);
    const col = Math.floor((e.offsetX - pad) / cw);
    const text = this.ta.value.split('\n')[line];
    if (text == null || col < 0 || col >= text.length) return;
    let a = col, b = col;
    while (a > 0 && /\w/.test(text[a - 1])) a--;
    while (b < text.length && /\w/.test(text[b])) b++;
    const word = text.slice(a, b);
    if (!word) return;
    let key = word;
    const obj = text.slice(0, a).match(/([A-Za-z_]\w*)\.$/);
    if (obj) {
      const kind = objectKind(this.ta.value, obj[1]);
      if (kind) key = `${kind}.${word}`;
    }
    const doc = DOCS[key];
    if (!doc) return;
    const r = this.root.getBoundingClientRect();
    this.tipTimer = window.setTimeout(() => {
      this.tip.innerHTML = `<code>${doc.sig.replace(/</g, '&lt;')}</code><span>${doc.doc}</span>`;
      this.tip.hidden = false;
      this.tip.style.left = `${Math.min(e.clientX - r.left + 8, r.width - this.tip.offsetWidth - 8)}px`;
      this.tip.style.top = `${e.clientY - r.top + 18}px`;
    }, 350);
  }

  get value() { return this.ta.value; }
  set value(v: string) {
    this.ta.value = v;
    this.clearError();
    this.render();
  }

  set readOnly(v: boolean) { this.ta.readOnly = v; }

  showError(line: number) {
    this.errorLine = line;
    this.render();
  }

  clearError() {
    if (this.errorLine == null) return;
    this.errorLine = null;
    this.render();
  }

  private render() {
    const v = this.ta.value;
    this.pre.innerHTML = highlight(v);
    const n = v.split('\n').length;
    let g = '';
    for (let i = 1; i <= n; i++) g += `<div class="${i === this.errorLine ? 'err' : ''}">${i}</div>`;
    this.gutter.innerHTML = g + '<div>&nbsp;</div>';
    this.pre.querySelectorAll('.err-line').forEach(e => e.remove());
    if (this.errorLine) {
      const mark = document.createElement('div');
      mark.className = 'err-line';
      mark.style.top = `calc(${this.errorLine - 1} * var(--lh) + var(--pad))`;
      this.pre.parentElement!.insertBefore(mark, this.pre);
      this.pre.parentElement!.querySelectorAll('.err-line').forEach(e => e !== mark && e.remove());
    } else {
      this.pre.parentElement!.querySelectorAll('.err-line').forEach(e => e.remove());
    }
    // keep the textarea tall enough to scroll with the highlight layer
    const longest = v.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
    this.ta.style.height = `calc(${n + 1} * var(--lh) + 2 * var(--pad))`;
    this.ta.style.width = `max(100%, calc(${longest + 3}ch + 2 * var(--pad)))`;
    this.pre.style.height = this.ta.style.height;
    this.pre.style.width = this.ta.style.width;
  }

  private key(e: KeyboardEvent) {
    if (!this.popup.hidden && this.items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.active = (this.active + (e.key === 'ArrowDown' ? 1 : this.items.length - 1)) % this.items.length;
        this.renderPopup();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.accept(); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closePopup(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); this.complete(true); return; }
    const ta = this.ta;
    const { selectionStart: s, selectionEnd: end, value } = ta;
    if (e.key === 'Tab') {
      e.preventDefault();
      this.insert('  ');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const indent = value.slice(lineStart).match(/^[ \t]*/)![0];
      const before = value.slice(0, s).trimEnd();
      const extra = before.endsWith('{') ? '  ' : '';
      if (extra && value[end] === '}') {
        this.insert('\n' + indent + extra + '\n' + indent);
        ta.selectionStart = ta.selectionEnd = s + 1 + indent.length + extra.length;
      } else this.insert('\n' + indent + extra);
    } else if (e.key === '}' ) {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      if (/^\s+$/.test(value.slice(lineStart, s)) && s - lineStart >= 2) {
        e.preventDefault();
        ta.setRangeText('}', s - 2, s, 'end');
        ta.dispatchEvent(new Event('input'));
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      let le = value.indexOf('\n', end === s ? end : end - 1);
      if (le < 0) le = value.length;
      const lines = value.slice(ls, le).split('\n');
      const allCommented = lines.every(l => /^\s*\/\//.test(l) || !l.trim());
      const next = lines.map(l => (allCommented ? l.replace(/^(\s*)\/\/ ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1// ') : l)).join('\n');
      ta.setRangeText(next, ls, le, 'select');
      ta.dispatchEvent(new Event('input'));
    }
  }

  private insert(text: string) {
    this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, 'end');
    this.ta.dispatchEvent(new Event('input'));
  }
}
