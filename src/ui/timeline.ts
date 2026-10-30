// Logic analyzer: a scrolling timeline of every pin the circuit uses.
import type { Board } from '../sim/board';
import { PWM_PINS, pinName } from '../sim/board';

export interface Track { pin: number; label: string }

interface Sample { t: number; v: (number | null)[] } // value per pin, 0..1, null = floating

const WINDOW_MS = 4000;
const MAX_SAMPLES = 900;
const ROW_H = 30;
const LEFT = 118;

export class Timeline {
  private samples: Sample[] = [];
  private tracks: Track[] = [];
  visible = false;

  constructor(private canvas: HTMLCanvasElement, private empty: HTMLElement) {}

  clear() { this.samples = []; }

  /** Record what every tracked pin is doing at the board's current time. */
  record(board: Board, tracks: Track[]) {
    this.tracks = tracks;
    const v: (number | null)[] = [];
    for (const { pin } of tracks) {
      const p = board.pins[pin];
      if (p.mode === 'OUTPUT' || board.tones.has(pin)) v[pin] = board.level(pin);
      else if (pin >= 14) v[pin] = board.peekAnalog(pin) ?? board.peekDigital(pin);
      else v[pin] = board.peekDigital(pin);
    }
    const last = this.samples[this.samples.length - 1];
    if (last && board.time - last.t < 1) { last.v = v; return; }
    this.samples.push({ t: board.time, v });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  draw(board: Board) {
    if (!this.visible) return;
    const c = this.canvas;
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(devicePixelRatio, 2);
    if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    this.empty.hidden = this.tracks.length > 0 && this.samples.length > 1;
    if (this.empty.hidden === false) return;

    const css = getComputedStyle(c);
    const ink = css.getPropertyValue('--ink-2').trim();
    const faint = css.getPropertyValue('--line').trim();
    const accent = css.getPropertyValue('--accent').trim();
    const warm = '#e9a23b';
    const now = board.time;
    const x = (t: number) => LEFT + ((t - (now - WINDOW_MS)) / WINDOW_MS) * (W - LEFT - 8);

    // time grid: one line per second
    g.font = '10px "IBM Plex Mono", monospace';
    g.fillStyle = css.getPropertyValue('--ink-3').trim();
    g.textAlign = 'center';
    for (let s = Math.ceil((now - WINDOW_MS) / 1000) * 1000; s <= now; s += 1000) {
      g.strokeStyle = faint;
      g.beginPath(); g.moveTo(x(s), 14); g.lineTo(x(s), H); g.stroke();
      g.fillText(`${(s / 1000).toFixed(0)}s`, x(s), 9);
    }

    this.tracks.forEach((tr, row) => {
      const top = 18 + row * ROW_H;
      if (top + ROW_H > H + 6) return;
      const base = top + ROW_H - 8, hi = top + 6;
      const p = board.pins[tr.pin];
      const analogIn = tr.pin >= 14 && p.mode !== 'OUTPUT';
      g.textAlign = 'left';
      g.fillStyle = ink;
      g.font = '600 11px "IBM Plex Mono", monospace';
      g.fillText(`${tr.pin < 14 ? 'D' : ''}${pinName(tr.pin)}${PWM_PINS.has(tr.pin) ? '~' : ''}`, 8, top + 13);
      g.font = '10px "IBM Plex Sans", sans-serif';
      g.fillStyle = css.getPropertyValue('--ink-3').trim();
      g.fillText(tr.label.slice(0, 16), 8, top + 25);

      g.strokeStyle = faint;
      g.beginPath(); g.moveTo(LEFT, base); g.lineTo(W - 8, base); g.stroke();

      const color = analogIn ? warm : accent;
      g.strokeStyle = color;
      g.fillStyle = color + '2a';
      g.lineWidth = 1.8;
      g.beginPath();
      let started = false, prevY = base;
      let floating = false;
      for (const s of this.samples) {
        if (s.t < now - WINDOW_MS - 50) continue;
        const v = s.v[tr.pin];
        if (v == null) { floating = true; continue; }
        const y = base - v * (base - hi);
        const sx = x(s.t);
        if (!started) { g.moveTo(sx, y); started = true; }
        else if (analogIn) g.lineTo(sx, y);
        else { g.lineTo(sx, prevY); g.lineTo(sx, y); } // square edges for digital signals
        prevY = y;
      }
      if (started) {
        g.lineTo(x(now), prevY);
        g.stroke();
        if (!analogIn) {
          g.lineTo(x(now), base);
          g.lineTo(LEFT, base);
          g.closePath();
          g.fill();
        }
      }
      // current value at the right edge
      const cur = this.samples[this.samples.length - 1]?.v[tr.pin];
      g.textAlign = 'right';
      g.font = '600 10px "IBM Plex Mono", monospace';
      g.fillStyle = color;
      const pwm = p.mode === 'OUTPUT' && p.pwm != null;
      const text = cur == null ? (floating ? 'floating' : '') : analogIn ? String(Math.round(cur * 1023)) : pwm ? `PWM ${Math.round(cur * 100)}%` : cur > 0.5 ? 'HIGH' : 'LOW';
      g.fillText(text, W - 10, top + 11);
    });
  }
}
