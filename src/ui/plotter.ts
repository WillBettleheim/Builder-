// Serial Plotter: graphs numbers printed one line at a time, like the board IDE's.

const COLORS = ['#1f9a96', '#e2533b', '#3b82c4', '#e9a23b', '#8e5bd0', '#3fae5a'];
const MAX_POINTS = 400;

export class Plotter {
  private series = new Map<string, number[]>();
  private partial = '';
  private dirty = false;
  visible = false;
  get hasData() { return this.series.size > 0; }

  constructor(private canvas: HTMLCanvasElement, private empty: HTMLElement) {}

  clear() {
    this.series.clear();
    this.partial = '';
    this.dirty = true;
  }

  /** Redraw on the next frame (e.g. after the tab becomes visible). */
  refresh() { this.dirty = true; }

  /** Feed raw serial text; complete lines become data points. */
  push(text: string) {
    const lines = (this.partial + text).split('\n');
    this.partial = lines.pop() ?? '';
    for (const line of lines) this.addLine(line);
  }

  private addLine(line: string) {
    const parts = line.trim().split(/[\s,;\t]+/).filter(Boolean);
    let i = 0;
    for (const p of parts) {
      // "label:value" names a series; bare numbers are numbered by position
      const m = p.match(/^([A-Za-z_][\w]*)[:=](-?\d+(?:\.\d+)?)$/);
      const n = m ? parseFloat(m[2]) : /^-?\d+(\.\d+)?$/.test(p) ? parseFloat(p) : NaN;
      if (Number.isNaN(n)) continue;
      const name = m ? m[1] : `value ${++i}`;
      let s = this.series.get(name);
      if (!s) {
        if (this.series.size >= COLORS.length) continue;
        this.series.set(name, (s = []));
      }
      s.push(n);
      if (s.length > MAX_POINTS) s.shift();
      this.dirty = true;
    }
  }

  draw() {
    if (!this.visible || !this.dirty) return;
    this.dirty = false;
    const c = this.canvas;
    const dpr = Math.min(devicePixelRatio, 2);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(c);
    const ink = styles.getPropertyValue('--ink-3').trim() || '#888';
    const line = styles.getPropertyValue('--line').trim() || '#ddd';
    g.clearRect(0, 0, W, H);
    this.empty.hidden = this.series.size > 0;
    if (!this.series.size) return;

    let lo = Infinity, hi = -Infinity;
    for (const s of this.series.values()) for (const v of s) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.1;
    lo -= pad; hi += pad;
    const L = 46, R = 10, T = 26, B = 12;
    const x = (i: number) => L + (i / (MAX_POINTS - 1)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

    // grid + axis labels
    g.font = '11px "IBM Plex Mono", monospace';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4;
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke();
      g.fillStyle = ink;
      g.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1), L - 6, y(v));
    }

    // series, newest on the right
    let li = 0, lx = L;
    for (const [name, s] of this.series) {
      const color = COLORS[li++ % COLORS.length];
      const off = MAX_POINTS - s.length;
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.beginPath();
      s.forEach((v, i) => (i ? g.lineTo(x(i + off), y(v)) : g.moveTo(x(i + off), y(v))));
      g.stroke();
      // legend
      g.fillStyle = color;
      g.fillRect(lx, 8, 10, 10);
      g.fillStyle = ink;
      g.textAlign = 'left';
      const label = `${name} ${s[s.length - 1]}`;
      g.fillText(label, lx + 14, 13);
      lx += g.measureText(label).width + 30;
    }
  }
}
