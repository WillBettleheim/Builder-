// Schematic view: the current circuit redrawn as a classic circuit diagram.
// The board sits on the left with the pins in use; every part is a block with a
// proper symbol, signal lines run to their pins, and power and ground use the
// standard local symbols instead of long rails.
import type { Board } from '../sim/board';
import { buildNets, endpoint, type Wire } from '../sim/circuit';
import { PARTS, type Part } from '../sim/parts';

interface Palette { ink: string; ink2: string; muted: string; paper: string; card: string; wire: string; red: string; accent: string }
const SCREEN: Palette = { ink: 'var(--ink)', ink2: 'var(--ink-2)', muted: 'var(--ink-3)', paper: 'var(--paper)', card: 'var(--card)', wire: 'var(--ink-2)', red: '#e2533b', accent: 'var(--accent)' };
const PRINT: Palette = { ink: '#16181d', ink2: '#3a3f47', muted: '#7a808a', paper: '#ffffff', card: '#f6f7f9', wire: '#3a3f47', red: '#d0342c', accent: '#14857f' };

const pinName = (p: number) => (p >= 14 ? `A${p - 14}` : `D${p}`);
const PWM = new Set([3, 5, 6, 9, 10, 11]);
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// parts that are only wiring or scenery have no place in a schematic
const SKIP = new Set(['uno', 'breadboard', 'car', 'magnet']);

const ROW = 28;
const BOARD_X = 30, BOARD_W = 150, TOP = 30;

/** Build the schematic as an SVG string. `print` uses fixed colours so the file stands alone. */
export function renderSchematic(parts: Part[], wires: Wire[], print = false): string {
  const c = print ? PRINT : SCREEN;
  const { infoOf } = buildNets(parts, wires);
  const shown = parts.filter(p => !SKIP.has(p.type) && PARTS[p.type].terminals(p).some(t => t.kind !== 'pass'));
  if (!shown.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120" class="schematic"><text x="210" y="64" text-anchor="middle" style="fill:${c.muted};font:14px sans-serif">Add a part and wire it up to see its schematic.</text></svg>`;
  }

  // which board pin (if any) each terminal reaches
  type Term = { key: string; label: string; kind: string; pin: number | null; power: boolean; ground: boolean; wired: boolean };
  const blocks = shown.map(p => {
    const terms: Term[] = PARTS[p.type].terminals(p).filter(t => t.kind !== 'pass').map(t => {
      const info = infoOf(endpoint(p.id, t.key));
      return { key: t.key, label: t.label, kind: t.kind, pin: info?.pins[0] ?? null, power: !!info?.power, ground: !!info?.ground, wired: !!info };
    });
    return { part: p, terms };
  });
  const pins = [...new Set(blocks.flatMap(b => b.terms.map(t => t.pin)).filter((x): x is number => x != null))].sort((a, b) => a - b);
  const lane = new Map(pins.map((p, i) => [p, i]));

  const boardH = Math.max(150, 60 + pins.length * ROW);
  const pinY = (p: number) => TOP + 50 + lane.get(p)! * ROW;
  const laneX = (p: number) => BOARD_X + BOARD_W + 34 + lane.get(p)! * 16;
  const partX = BOARD_X + BOARD_W + 34 + pins.length * 16 + 70;
  const PART_W = 200;

  const out: string[] = [];
  const line = (d: string, extra = '', cls = 'sch-wire') => out.push(`<path class="${cls}" ${extra} d="${d}" style="fill:none;stroke:${c.wire};stroke-width:1.6;stroke-linejoin:round"/>`);
  const text = (x: number, y: number, s: string, size = 11, fill = c.ink2, anchor = 'start', weight = 500) =>
    out.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" style="fill:${fill};font:${weight} ${size}px ui-monospace,SFMono-Regular,Menlo,monospace">${esc(s)}</text>`);

  // the board
  out.push(`<rect x="${BOARD_X}" y="${TOP}" width="${BOARD_W}" height="${boardH}" rx="8" style="fill:${c.card};stroke:${c.ink};stroke-width:1.8"/>`);
  text(BOARD_X + 14, TOP + 24, 'BUILDER ONE', 12, c.ink, 'start', 700);
  if (!pins.length) text(BOARD_X + 14, TOP + 50, 'no pins wired', 11, c.muted);
  for (const p of pins) {
    const y = pinY(p);
    text(BOARD_X + BOARD_W - 10, y + 4, `${pinName(p)}${PWM.has(p) ? ' ~' : ''}`, 11, c.ink2, 'end', 600);
    out.push(`<circle cx="${BOARD_X + BOARD_W}" cy="${y}" r="2.6" style="fill:${c.ink}"/>`);
  }

  // parts, stacked in a column
  let y = TOP;
  const laneUse = new Map<number, number[]>(); // pin -> terminal ys, for junction dots
  for (const b of blocks) {
    const h = Math.max(78, 42 + b.terms.length * ROW);
    out.push(`<rect x="${partX}" y="${y}" width="${PART_W}" height="${h}" rx="8" style="fill:${c.card};stroke:${c.ink};stroke-width:1.5"/>`);
    text(partX + PART_W - 12, y + 20, PARTS[b.part.type].name, 11.5, c.ink, 'end', 700);
    out.push(symbol(b.part.type, partX + PART_W - 74, y + h / 2 + 8, c));
    b.terms.forEach((t, i) => {
      const ty = y + 38 + i * ROW;
      text(partX + 10, ty + 4, t.label, 10.5, c.ink2);
      out.push(`<circle cx="${partX}" cy="${ty}" r="2.6" style="fill:${c.ink}"/>`);
      const stubX = partX - 26;
      if (t.pin != null) {
        const lx = laneX(t.pin);
        line(`M${BOARD_X + BOARD_W} ${pinY(t.pin)} H${lx} V${ty} H${partX}`, `data-pin="${t.pin}"`);
        (laneUse.get(t.pin) ?? laneUse.set(t.pin, []).get(t.pin)!).push(ty);
      } else if (t.power) {
        line(`M${partX} ${ty} H${stubX}`);
        out.push(powerSymbol(stubX, ty, c));
      } else if (t.ground) {
        line(`M${partX} ${ty} H${stubX}`);
        out.push(groundSymbol(stubX, ty, c));
      } else {
        out.push(`<path d="M${partX} ${ty} H${stubX + 8}" style="stroke:${c.red};stroke-width:1.6;stroke-dasharray:3 3"/>`);
        text(stubX + 4, ty - 6, t.wired ? 'goes nowhere' : 'not connected', 9.5, c.red, 'end', 600);
      }
    });
    y += h + 26;
  }
  // a dot wherever one pin feeds several terminals
  for (const [p, ys] of laneUse) if (ys.length > 1) for (const ty of ys) out.push(`<circle cx="${laneX(p)}" cy="${ty}" r="3" style="fill:${c.wire}"/>`);

  const W = partX + PART_W + 20, H = Math.max(TOP + boardH, y - 26) + 30;
  const bg = print ? `<rect width="100%" height="100%" style="fill:${c.paper}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="schematic">${bg}${out.join('')}</svg>`;
}

/** Colour signal lines by the live state of their pins: red while HIGH, dashed for PWM or a tone. */
export function liveSchematic(root: Element, board: Board, running: boolean) {
  for (const el of root.querySelectorAll<SVGPathElement>('[data-pin]')) {
    const pin = Number(el.dataset.pin);
    const lvl = running ? board.level(pin) : 0;
    // PWM and tone() both switch a pin very fast: show them as dashed and active
    const pwm = running && ((board.pins[pin]?.pwm != null && lvl > 0 && lvl < 1) || board.activeTone(pin) != null);
    el.classList.toggle('hi', lvl > 0.5 || pwm);
    el.classList.toggle('pwm', pwm);
  }
}

// ---------- symbols (drawn around a centre point) ----------
function powerSymbol(x: number, y: number, c: Palette): string {
  return `<g style="stroke:${c.red};stroke-width:1.8;fill:none"><path d="M${x} ${y} V${y - 14} M${x - 8} ${y - 14} H${x + 8}"/></g>` +
    `<text x="${x}" y="${y - 19}" text-anchor="middle" style="fill:${c.red};font:700 10px ui-monospace,monospace">5V</text>`;
}

function groundSymbol(x: number, y: number, c: Palette): string {
  return `<g style="stroke:${c.ink};stroke-width:1.8;fill:none"><path d="M${x} ${y} V${y + 9} M${x - 9} ${y + 9} H${x + 9} M${x - 6} ${y + 13} H${x + 6} M${x - 3} ${y + 17} H${x + 3}"/></g>`;
}

function symbol(type: string, x: number, y: number, c: Palette): string {
  const s = `style="fill:none;stroke:${c.ink};stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round"`;
  const zig = 'l4 -6 l6 12 l6 -12 l6 12 l6 -12 l4 6'; // a resistor, 32 wide, drawn from wherever the pen is
  const resistor = (x0: number) => `M${x0} ${y} ${zig}`;
  switch (type) {
    case 'led':
    case 'rgb':
    case 'traffic':
      // resistor in series with a diode, plus light arrows
      return `<path ${s} d="${resistor(x - 30)} M${x + 2} ${y} H${x + 10} M${x + 10} ${y - 8} V${y + 8} L${x + 24} ${y} Z M${x + 24} ${y - 8} V${y + 8} M${x + 24} ${y} H${x + 34}"/>` +
        `<path style="fill:none;stroke:${c.accent};stroke-width:1.4" d="M${x + 16} ${y - 12} l6 -7 m-4 0 h4 v4 M${x + 22} ${y - 10} l6 -7 m-4 0 h4 v4"/>`;
    case 'button':
    case 'keypad':
      return `<path ${s} d="M${x - 26} ${y} H${x - 8} M${x - 8} ${y} L${x + 12} ${y - 10} M${x + 14} ${y} H${x + 32} M${x + 2} ${y - 16} V${y - 6} M${x - 4} ${y - 16} H${x + 8}"/>` +
        `<circle cx="${x - 8}" cy="${y}" r="2.2" style="fill:${c.ink}"/><circle cx="${x + 14}" cy="${y}" r="2.2" style="fill:${c.ink}"/>`;
    case 'pot':
    case 'encoder':
    case 'joystick':
      return `<path ${s} d="M${x - 30} ${y} H${x - 16} ${zig} H${x + 30} M${x} ${y - 20} V${y - 9} m-4 -1 l4 6 l4 -6"/>`;
    case 'ldr':
    case 'temp':
    case 'soil':
    case 'gas':
      return `<path ${s} d="M${x - 30} ${y} H${x - 16} ${zig} H${x + 30} M${x - 16} ${y + 12} L${x + 16} ${y - 12}"/>`;
    case 'buzzer':
      return `<path ${s} d="M${x - 14} ${y - 8} h8 v16 h-8 z M${x - 6} ${y - 8} l12 -10 v36 l-12 -10 M${x + 12} ${y - 8} q6 8 0 16 M${x + 18} ${y - 13} q10 13 0 26"/>`;
    case 'motor':
    case 'servo':
    case 'stepper':
      return `<circle cx="${x}" cy="${y}" r="15" ${s}/><text x="${x}" y="${y + 5}" text-anchor="middle" style="fill:${c.ink};font:700 14px sans-serif">M</text>`;
    case 'relay':
      return `<path ${s} d="M${x - 30} ${y - 10} h14 v20 h-14 z M${x - 30} ${y} l14 -10 M${x - 4} ${y + 10} H${x + 6} L${x + 26} ${y} M${x + 28} ${y + 10} H${x + 34}"/>`;
    default:
      // anything else: a chip
      return `<rect x="${x - 22}" y="${y - 15}" width="44" height="30" rx="3" ${s}/>` +
        [0, 1, 2].map(i => `<path ${s} d="M${x - 12 + i * 12} ${y - 15} v-6 M${x - 12 + i * 12} ${y + 15} v6"/>`).join('');
  }
}
