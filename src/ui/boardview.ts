// Live board diagram: a flat drawing of the Builder One whose pins light up with
// their state (HIGH, LOW, PWM, input readings, tones, servo signals) and say what
// is wired to them. The drawing is built once per circuit and recoloured live.
import type { Board } from '../sim/board';
import { PWM_PINS } from '../sim/board';
import type { Wire } from '../sim/circuit';
import { PARTS, type Part } from '../sim/parts';

const name = (p: number) => (p >= 14 ? `A${p - 14}` : `${p}`);
/** The extra job some pins do: serial, interrupts, SPI and I2C. */
const ALT: Record<number, string> = { 0: 'RX', 1: 'TX', 2: 'INT0', 3: 'INT1', 10: 'SS', 11: 'MOSI', 12: 'MISO', 13: 'SCK', 18: 'SDA', 19: 'SCL' };
const ALT_INFO: Record<string, string> = {
  RX: 'serial receive (busy while Serial is on)', TX: 'serial transmit (busy while Serial is on)', INT0: 'can trigger an interrupt', INT1: 'can trigger an interrupt',
  SS: 'SPI select', MOSI: 'SPI data out', MISO: 'SPI data in', SCK: 'SPI clock', SDA: 'I2C data', SCL: 'I2C clock',
};
const SPARK_W = 240, SPARK_H = 26, WINDOW_MS = 5000;

// where each socket sits in the drawing (viewBox 640 × 290)
const TOP_Y = 66, BOTTOM_Y = 228;
const DIGITAL = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const digitalX = (i: number) => 128 + i * 34 + (i >= 6 ? 14 : 0);
// label and the board socket each power pin stands for
const POWER: [string, string][] = [['3V3', '3V3'], ['5V', '5V'], ['GND', 'GND2'], ['GND', 'GND3'], ['VIN', '']];
const powerX = (i: number) => 150 + i * 30;
// analog pins sit between the digital pins above, so their tags interleave instead of colliding
const analogX = (i: number) => digitalX(i + 7) - 17;

export interface PinUse { label: string; part: Part; key: string }

/** Who uses each board pin, from the parts' solved pin assignments. */
export function pinUsers(parts: Part[]): Map<number, PinUse[]> {
  const out = new Map<number, PinUse[]>();
  for (const p of parts) {
    for (const [key, pin] of Object.entries(p.pins)) {
      if (pin == null) continue;
      const t = PARTS[p.type].terminals(p).find(x => x.key === key);
      const short = PARTS[p.type].name.replace(/\s*\(.*\)/, '').replace(/ (Sensor|Module|Display|Switch)$/, '');
      // with several pins, the pin's own name matters most: "Robot IN4", "Line Left eye"
      const label = Object.keys(p.pins).length > 1 && t ? `${short.split(' ')[0]} ${t.label.replace(/\s*\(.*\)/, '')}` : short;
      out.set(pin, [...(out.get(pin) ?? []), { label, part: p, key }]);
    }
  }
  return out;
}

export type PinLook = { cls: string; value: string; detail: string };

/** How a pin looks right now: a CSS class for its colour, a short value and a sentence for the tooltip. */
export function pinLook(board: Board, pin: number, running: boolean): PinLook {
  const p = board.pins[pin];
  if (!running) return { cls: 'idle', value: '', detail: 'Press Run to see it live' };
  if (board.activeTone(pin) != null) return { cls: 'tone', value: `${Math.round(board.activeTone(pin)!)} Hz`, detail: `Playing a ${Math.round(board.activeTone(pin)!)} Hz tone` };
  const servo = board.servoAngles.get(pin);
  if (servo != null && [...board.servoPins.values()].includes(pin)) return { cls: 'servo', value: `${Math.round(servo)}°`, detail: `Servo signal: ${Math.round(servo)}°` };
  if (p.mode === 'OUTPUT') {
    if (p.pwm != null && p.pwm > 0 && p.pwm < 255) {
      const pct = Math.round((p.pwm / 255) * 100);
      return { cls: 'pwm', value: `${pct}%`, detail: `OUTPUT, PWM ${p.pwm} of 255 (${pct}% on)` };
    }
    return board.level(pin) > 0.5 ? { cls: 'high', value: 'HIGH', detail: 'OUTPUT, HIGH (5 V)' } : { cls: 'low', value: 'LOW', detail: 'OUTPUT, LOW (0 V)' };
  }
  if (pin >= 14) {
    const a = board.peekAnalog(pin);
    if (a != null) return { cls: 'analog', value: `${Math.round(a * 1023)}`, detail: `Analog input reading about ${Math.round(a * 1023)} of 1023` };
  }
  const d = board.peekDigital(pin);
  const mode = p.mode === 'INPUT_PULLUP' ? 'INPUT_PULLUP' : 'INPUT';
  if (d == null) return { cls: 'float', value: '?', detail: `${mode}, floating: nothing holds it HIGH or LOW` };
  return d ? { cls: 'in-high', value: 'HIGH', detail: `${mode}, reads HIGH` } : { cls: 'in-low', value: 'LOW', detail: `${mode}, reads LOW` };
}

export interface BoardViewEvents {
  /** a pin was clicked: here's the part wired to it */
  onPick?(part: Part): void;
  /** the pointer moved onto a pin (or off, with null) */
  onHover?(part: Part | null): void;
}

export class BoardView {
  private key = '';
  private users = new Map<number, PinUse[]>();
  private lastCls = new Map<number, string>();
  /** recent levels (0–1) for pins whose history isn't in the board's transition log */
  private history = new Map<number, { t: number; v: number }[]>();
  private activityKey = '';

  /** activity: a box to fill with a live graph for every pin in use (the big view) */
  constructor(private el: HTMLElement, events: BoardViewEvents = {}, private summary?: HTMLElement, private activity?: HTMLElement) {
    const userAt = (e: Event) => {
      const g = (e.target as Element).closest?.('[data-pin]') as SVGGElement | null;
      return g ? this.users.get(Number(g.dataset.pin))?.[0]?.part ?? null : null;
    };
    el.addEventListener('click', e => { const p = userAt(e); if (p) events.onPick?.(p); });
    el.addEventListener('pointerover', e => events.onHover?.(userAt(e)));
    el.addEventListener('pointerleave', () => events.onHover?.(null));
  }

  /** Rebuild the drawing when the wiring changes, then recolour every pin. */
  update(parts: Part[], wires: Wire[], board: Board, running: boolean, selected: Part | null = null) {
    const users = (this.users = pinUsers(parts));
    const key = JSON.stringify([...users].map(([pin, u]) => [pin, u.map(x => x.label)]));
    if (key !== this.key) {
      this.key = key;
      this.el.innerHTML = this.draw();
    }
    let inUse = 0, active = 0;
    for (const g of this.el.querySelectorAll<SVGGElement>('[data-pin]')) {
      const pin = Number(g.dataset.pin);
      const used = users.has(pin) || board.pins[pin].mode === 'OUTPUT';
      const look = used ? this.look(pin, users, board, running) : { cls: 'unused', value: '', detail: 'Not used' };
      const picked = !!selected && !!users.get(pin)?.some(u => u.part === selected);
      // a short flash whenever the pin changes state
      const before = this.lastCls.get(pin);
      this.lastCls.set(pin, look.cls);
      if (running && before && before !== look.cls && used) {
        g.classList.remove('flash');
        void g.getBoundingClientRect();
        g.classList.add('flash');
      }
      // the ring takes the colour of the wire plugged in here, to match the desk
      const ring = g.querySelector<SVGCircleElement>('.bv-wire');
      const ep = `${parts.find(p => p.type === 'uno')?.id}:${pin}`;
      const wire = wires.find(w => w.a === ep || w.b === ep);
      const stroke = wire?.color ?? '';
      if (ring && ring.style.stroke !== stroke) ring.style.stroke = stroke;
      const cls = `bv-pin ${look.cls}${used ? ' used' : ''}${users.has(pin) ? ' linked' : ''}${picked ? ' picked' : ''}`;
      if (used) inUse++;
      if (look.cls === 'high' || look.cls === 'pwm' || look.cls === 'tone') active++;
      const flashing = g.classList.contains('flash') ? ' flash' : '';
      if (g.getAttribute('class') !== cls + flashing) g.setAttribute('class', cls + flashing);
      const val = g.querySelector('.bv-val');
      const names = users.get(pin)?.map(u => u.label).join(', ') ?? (pin === 13 && used ? 'built-in LED' : '');
      // keep the live value whole; shorten the part name to make room
      const room = 16 - (look.value ? look.value.length + 3 : 0);
      const nm = names.length > room ? `${names.slice(0, Math.max(1, room - 1))}…` : names;
      const text = look.value && nm ? `${nm} · ${look.value}` : nm || look.value;
      if (val && val.textContent !== text) val.textContent = text;
      const title = g.querySelector('title');
      const alt = ALT[pin] ? ` · also ${ALT[pin]}, ${ALT_INFO[ALT[pin]]}` : '';
      const tip = `Pin ${name(pin)}${PWM_PINS.has(pin) ? ' (~ PWM)' : ''}: ${look.detail}${names ? `. Wired to ${names}` : ''}${alt}`;
      if (title && title.textContent !== tip) title.textContent = tip;
      // PWM shows as brightness
      const dot = g.querySelector<SVGCircleElement>('.bv-dot');
      const pwm = board.pins[pin].pwm;
      const op = look.cls === 'pwm' && pwm != null ? String(0.35 + 0.65 * (pwm / 255)) : '';
      if (dot && dot.style.opacity !== op) dot.style.opacity = op;
    }
    // power sockets show how many wires leave them
    const uno = parts.find(p => p.type === 'uno');
    for (const g of this.el.querySelectorAll<SVGGElement>('[data-socket]')) {
      const ep = `${uno?.id}:${g.dataset.socket}`;
      const n = wires.filter(w => w.a === ep || w.b === ep).length;
      g.classList.toggle('wired', n > 0);
      const t = g.querySelector('.bv-count');
      if (t) { const text = n ? `×${n}` : ''; if (t.textContent !== text) t.textContent = text; }
      const title = g.querySelector('title');
      const tip = n ? `${g.dataset.label}: ${n} wire${n === 1 ? '' : 's'} connected` : `${g.dataset.label}: nothing connected`;
      if (title && title.textContent !== tip) title.textContent = tip;
    }
    if (this.summary) {
      const text = `${inUse} of 20 pins in use${running ? ` · ${active} active` : ''}`;
      if (this.summary.textContent !== text) this.summary.textContent = text;
    }
    if (this.activity) this.updateActivity(users, board, running);
  }

  /** pinLook, except that only a switch can leave a pin truly floating: other parts talk over it through their library. */
  private look(pin: number, users: Map<number, PinUse[]>, board: Board, running: boolean): PinLook {
    const look = pinLook(board, pin, running);
    if (look.cls === 'float' && users.get(pin)?.every(u => u.part.type !== 'button' && u.part.type !== 'bumper')) {
      return { cls: 'data', value: '', detail: 'Carries data between the board and the part' };
    }
    return look;
  }

  /** One row per pin in use: its name and a scrolling graph of the last five seconds. */
  private updateActivity(users: Map<number, PinUse[]>, board: Board, running: boolean) {
    const pins = [...users.keys()].sort((a, b) => a - b);
    const key = pins.join();
    if (key !== this.activityKey) {
      this.activityKey = key;
      this.activity!.innerHTML = pins.length
        ? `<h3>Last 5 seconds</h3>${pins.map(p => `<div class="bv-act" data-act-pin="${p}"><b>${name(p)}</b><span>${users.get(p)!.map(u => u.label).join(', ')}</span><svg viewBox="0 0 ${SPARK_W} ${SPARK_H}" preserveAspectRatio="none"><polyline points=""/></svg><em></em></div>`).join('')}`
        : '<p class="muted">Wire something to a pin to see its activity here.</p>';
    }
    const now = board.time;
    for (const row of this.activity!.querySelectorAll<HTMLElement>('[data-act-pin]')) {
      const pin = Number(row.dataset.actPin);
      const p = board.pins[pin];
      // plain digital outputs have an exact log of every switch; everything else is sampled
      const logged = running && p.mode === 'OUTPUT' && p.pwm == null && board.activeTone(pin) == null && (board.transitions.get(pin)?.length ?? 0) > 0;
      let pts: { t: number; v: number }[];
      if (logged) {
        const tr = board.transitions.get(pin)!;
        const start = now - WINDOW_MS;
        let v = 0;
        pts = [];
        for (const x of tr) { if (x.t <= start) v = x.v; }
        pts.push({ t: start, v });
        for (const x of tr) if (x.t > start) { pts.push({ t: x.t, v }); v = x.v; pts.push({ t: x.t, v }); }
        pts.push({ t: now, v });
      } else {
        const h = this.history.get(pin) ?? [];
        if (h.length && h[h.length - 1].t > now) h.length = 0; // a new run started
        if (running) {
          const look = this.look(pin, users, board, true);
          const v = look.cls === 'analog' ? (board.peekAnalog(pin) ?? 0) : look.cls === 'tone' ? 0.5 : p.mode === 'OUTPUT' ? board.level(pin) : (board.peekDigital(pin) ?? 0.5);
          h.push({ t: now, v });
        }
        while (h.length && h[0].t < now - WINDOW_MS) h.shift();
        this.history.set(pin, h);
        pts = h;
      }
      const line = row.querySelector('polyline')!;
      const d = pts.map(q => `${(((q.t - (now - WINDOW_MS)) / WINDOW_MS) * SPARK_W).toFixed(1)},${(SPARK_H - 3 - q.v * (SPARK_H - 6)).toFixed(1)}`).join(' ');
      if (line.getAttribute('points') !== d) line.setAttribute('points', d);
      const em = row.querySelector('em')!;
      const val = running ? this.look(pin, users, board, true).value : '';
      if (em.textContent !== val) em.textContent = val;
    }
  }

  private draw(): string {
    const pinG = (pin: number, x: number, y: number, top: boolean) => {
      // tags run away from the board edge: down from the top header, up from the bottom one
      const tagY = top ? y + 18 : y - 18;
      return `<g data-pin="${pin}" class="bv-pin unused" transform="translate(${x} ${y})"><title></title>
        <circle class="bv-halo" r="12"/><circle class="bv-wire" r="10.5"/><circle class="bv-dot" r="7.5"/>
        <text class="bv-num" y="${top ? -17 : 27}" text-anchor="middle">${name(pin)}${PWM_PINS.has(pin) ? '~' : ''}</text>
        ${ALT[pin] ? `<text class="bv-alt" y="${top ? -29 : 39}" text-anchor="middle">${ALT[pin]}</text>` : ''}
        <text class="bv-val" transform="translate(0 ${tagY - y}) rotate(${top ? 90 : -90})" text-anchor="start" dy="3"></text></g>`;
    };
    const fixed = (label: string, socket: string, x: number, y: number, cls: string) =>
      `<g class="bv-fixed ${cls}" ${socket ? `data-socket="${socket}" data-label="${label}"` : ''} transform="translate(${x} ${y})"><title>${label}</title><circle class="bv-ring" r="11"/><circle r="7.5"/><text y="27" text-anchor="middle">${label}</text><text class="bv-count" y="-17" text-anchor="middle"></text></g>`;
    return `<svg viewBox="0 0 640 290" class="bv" role="img" aria-label="Live diagram of the board's pins">
      <rect x="40" y="38" width="586" height="214" rx="14" class="bv-board"/>
      <rect x="18" y="70" width="40" height="48" rx="5" class="bv-usb"/><rect x="24" y="190" width="30" height="36" rx="4" class="bv-jack"/>
      <rect x="250" y="128" width="200" height="34" rx="4" class="bv-chip"/><text x="350" y="150" text-anchor="middle" class="bv-brand">BUILDER ONE</text>
      <rect x="80" y="${TOP_Y - 11}" width="${digitalX(13) - 80 + 20}" height="22" rx="5" class="bv-header"/>
      <rect x="${powerX(0) - 16}" y="${BOTTOM_Y - 11}" width="${powerX(4) - powerX(0) + 32}" height="22" rx="5" class="bv-header"/>
      <rect x="${analogX(0) - 16}" y="${BOTTOM_Y - 11}" width="${analogX(5) - analogX(0) + 32}" height="22" rx="5" class="bv-header"/>
      ${fixed('GND', 'GND', 96, TOP_Y, 'gnd')}
      ${DIGITAL.map((p, i) => pinG(p, digitalX(i), TOP_Y, true)).join('')}
      ${POWER.map(([l, sock], i) => fixed(l, sock, powerX(i), BOTTOM_Y, l === 'GND' ? 'gnd' : 'pwr')).join('')}
      ${[0, 1, 2, 3, 4, 5].map(i => pinG(14 + i, analogX(i), BOTTOM_Y, false)).join('')}
      <text x="128" y="26" class="bv-cap">DIGITAL (~ = PWM)</text><text x="${analogX(0) - 10}" y="284" class="bv-cap">ANALOG IN</text><text x="${powerX(0) - 10}" y="284" class="bv-cap">POWER</text>
    </svg>`;
  }
}
