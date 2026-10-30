// Wires and the circuit solver. Wires join "endpoints" (partId:terminalKey).
// Solving groups endpoints into nets, then works out which board pin each
// part terminal reaches and whether each part has its power and ground.
import { BOARD_TERMINALS, PARTS, type Part } from './parts';

export interface Wire {
  id: string;
  a: string; // endpoint "partId:key"
  b: string;
  color: string;
}

export const WIRE_COLORS = ['#e2533b', '#f39c34', '#e9c43b', '#3fae5a', '#3b82c4', '#8e5bd0', '#e86fa6', '#3bb7b0', '#a0703c', '#6c7a89'];
export const POWER_COLOR = '#d7263d';
export const GND_COLOR = '#2a2a2e';
export const wireColor = (pin: number) => WIRE_COLORS[pin % WIRE_COLORS.length];

export const endpoint = (partId: string, key: string) => `${partId}:${key}`;
export function splitEndpoint(ep: string): [string, string] {
  const i = ep.lastIndexOf(':');
  return [ep.slice(0, i), ep.slice(i + 1)];
}

let wireCounter = 0;
export const newWireId = () => `w${Date.now().toString(36)}${wireCounter++}`;

export interface Issue { key: string; text: string }

/** Does this endpoint name a terminal that currently exists? */
export function endpointExists(parts: Part[], ep: string): boolean {
  const [pid, key] = splitEndpoint(ep);
  const part = parts.find(p => p.id === pid);
  if (!part) return false;
  if (part.type === 'uno') return BOARD_TERMINALS.some(t => t.key === key);
  return PARTS[part.type].terminals(part).some(t => t.key === key);
}

export function endpointLabel(parts: Part[], ep: string): string {
  const [pid, key] = splitEndpoint(ep);
  const part = parts.find(p => p.id === pid);
  if (!part) return '?';
  if (part.type === 'uno') return `Board ${BOARD_TERMINALS.find(t => t.key === key)?.label ?? key}`;
  const t = PARTS[part.type].terminals(part).find(x => x.key === key);
  return `${PARTS[part.type].name} · ${t?.label ?? key}`;
}

/**
 * Recompute part.pins and part.state.missing from the wires.
 * Returns problems worth telling the user about (shorts, pins tied to power...).
 */
export function solve(parts: Part[], wires: Wire[]): Issue[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const w of wires) {
    if (!endpointExists(parts, w.a) || !endpointExists(parts, w.b)) continue;
    union(w.a, w.b);
  }
  // connections inside parts, like a breadboard's strips and rails
  for (const p of parts) {
    for (const group of PARTS[p.type].nets?.(p) ?? []) {
      const eps = group.map(k => endpoint(p.id, k)).filter(ep => parent.has(ep));
      for (let i = 1; i < eps.length; i++) union(eps[0], eps[i]);
    }
  }

  const uno = parts.find(p => p.type === 'uno');
  // what each net touches on the board
  const nets = new Map<string, { pins: number[]; power: boolean; ground: boolean }>();
  const net = (root: string) => {
    let n = nets.get(root);
    if (!n) nets.set(root, (n = { pins: [], power: false, ground: false }));
    return n;
  };
  if (uno) {
    for (const t of BOARD_TERMINALS) {
      const ep = endpoint(uno.id, t.key);
      if (!parent.has(ep)) continue;
      const n = net(find(ep));
      if (t.kind === 'pin') n.pins.push(t.pin!);
      else if (t.kind === '5V') n.power = true;
      else n.ground = true;
    }
  }

  const issues: Issue[] = [];
  for (const [root, n] of nets) {
    if (n.power && n.ground) issues.push({ key: `short:${root}`, text: 'Short circuit! 5V is wired straight to GND. On a real board this can overheat and reset the board.' });
    const uniq = [...new Set(n.pins)];
    if (uniq.length > 1) issues.push({ key: `pins:${uniq.join(',')}`, text: `Pins ${uniq.map(pinLabel).join(' and ')} are wired together, so they fight each other when one is HIGH and the other LOW.` });
    if (uniq.length && n.ground) issues.push({ key: `pg:${uniq[0]}`, text: `Pin ${pinLabel(uniq[0])} is wired directly to GND. Setting it HIGH would short it out.` });
    if (uniq.length && n.power) issues.push({ key: `pp:${uniq[0]}`, text: `Pin ${pinLabel(uniq[0])} is wired directly to 5V. Setting it LOW would short it out.` });
  }

  for (const part of parts) {
    if (part.type === 'uno') continue;
    const missing: string[] = [];
    for (const t of PARTS[part.type].terminals(part)) {
      const ep = endpoint(part.id, t.key);
      const n = parent.has(ep) ? nets.get(find(ep)) : undefined;
      if (t.kind === 'pass') continue;
      if (t.kind === 'signal') {
        part.pins[t.key] = n?.pins[0] ?? null;
      } else if (t.kind === '5V' ? !n?.power : !n?.ground) {
        missing.push(t.label);
      }
    }
    // drop stale keys (e.g. after a button's wiring mode changed)
    for (const k of Object.keys(part.pins)) {
      if (!PARTS[part.type].terminals(part).some(t => t.key === k && t.kind === 'signal')) delete part.pins[k];
    }
    part.state.missing = missing;
  }
  return issues;
}

const pinLabel = (p: number) => (p >= 14 ? `A${p - 14}` : String(p));

/** Best default color for a new wire between two endpoints. */
export function colorFor(parts: Part[], a: string, b: string): string {
  for (const ep of [a, b]) {
    const [pid, key] = splitEndpoint(ep);
    const part = parts.find(p => p.id === pid);
    if (!part) continue;
    if (part.type === 'uno') {
      const t = BOARD_TERMINALS.find(x => x.key === key);
      if (t?.kind === 'GND') return GND_COLOR;
      if (t?.kind === '5V') return POWER_COLOR;
      if (t?.kind === 'pin') return wireColor(t.pin!);
    } else {
      const t = PARTS[part.type].terminals(part).find(x => x.key === key);
      if (t?.kind === 'GND' || t?.rail === 'GND') return GND_COLOR;
      if (t?.kind === '5V' || t?.rail === '5V') return POWER_COLOR;
    }
  }
  return WIRE_COLORS[wireCounter % WIRE_COLORS.length];
}

/**
 * Wires that reproduce a part's pin assignments plus its power and ground —
 * used for lesson setups and for scenes saved before wiring existed.
 */
export function autoWires(parts: Part[], part: Part, pins: Record<string, number | null> = part.pins): Wire[] {
  const uno = parts.find(p => p.type === 'uno');
  if (!uno || part.type === 'uno') return [];
  const out: Wire[] = [];
  for (const t of PARTS[part.type].terminals(part)) {
    let boardKey: string | null = null;
    if (t.kind === 'pass') continue;
    if (t.kind === 'signal') {
      const pin = pins[t.key];
      if (pin == null) continue;
      boardKey = String(pin);
    } else if (t.kind === '5V') boardKey = '5V';
    else boardKey = nearestGround(part, uno);
    const a = endpoint(uno.id, boardKey);
    const b = endpoint(part.id, t.key);
    out.push({ id: newWireId(), a, b, color: colorFor(parts, a, b) });
  }
  return out;
}

/** Pick the GND socket on the side of the board facing the part. */
export function nearestGround(part: Part, uno: Part): string {
  const dz = part.z - uno.z;
  return dz > 0 ? 'GND2' : 'GND';
}
