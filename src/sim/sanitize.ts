// Everything that arrives from outside the running app (a shared link, an imported
// file, an old save in localStorage) passes through here before it touches the scene,
// so a crafted project can't smuggle HTML, huge data or nonsense values in.
import { PARTS } from './parts';
import { escapeHtml } from '../ui/html';
import { SD_MAX_BYTES, SD_MAX_FILES } from '../interp/interpreter';

export { escapeHtml };

/** A plain CSS hex colour like #f80 or #3b82c4. */
export const isHexColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c);

/** Part ids and endpoint keys: letters, digits, dashes and underscores. */
export const isSafeId = (s: unknown): s is string => typeof s === 'string' && /^[\w-]{1,64}$/.test(s);

const finite = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Limits for an SD card's files: enough for any lesson, too small to fill storage. */
const SD_NAME = /^[\w. -]{1,32}$/;

export function cleanFiles(files: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!files || typeof files !== 'object') return out;
  let total = 0;
  for (const [name, body] of Object.entries(files)) {
    if (Object.keys(out).length >= SD_MAX_FILES) break;
    if (!SD_NAME.test(name) || typeof body !== 'string') continue;
    const text = body.slice(0, SD_MAX_BYTES - total);
    out[name] = text;
    total += text.length;
  }
  return out;
}

/** A part's props with every value checked against what that part accepts. */
export function cleanProps(type: string, props: unknown): Record<string, any> {
  const def = PARTS[type];
  const src: Record<string, unknown> = props && typeof props === 'object' ? (props as Record<string, unknown>) : {};
  const out: Record<string, any> = {};
  for (const pd of def?.props ?? []) {
    const v = src[pd.key];
    if (pd.type === 'select') {
      if (pd.options!.some(o => o.value === v)) out[pd.key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[pd.key] = clamp(v, pd.min ?? -1e6, pd.max ?? 1e6);
    }
  }
  // the few props parts keep for themselves
  if (type === 'encoder' && typeof src.turns === 'number') out.turns = clamp(Math.round(finite(src.turns)), -1e6, 1e6);
  if (type === 'sdcard' && src.files) out.files = cleanFiles(src.files);
  if (isSafeId(src.mount)) {
    out.mount = src.mount;
    out.mdx = clamp(finite(src.mdx), -60, 60);
    out.mdz = clamp(finite(src.mdz), -60, 60);
  }
  return out;
}

/** Pin numbers on the board run 0–19 (A0–A5 are 14–19). */
export function cleanPins(pins: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!pins || typeof pins !== 'object') return out;
  for (const [k, v] of Object.entries(pins)) {
    if (!isSafeId(k)) continue;
    out[k] = typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 19 ? v : null;
  }
  return out;
}

export const MAX_PARTS = 200;
export const MAX_WIRES = 600;
export const MAX_CODE = 100_000;
const DESK = 400; // cm from the centre, far beyond any real build

export interface CleanPart { id: string; type: string; x: number; z: number; rot: number; pins: Record<string, number | null>; props: Record<string, any>; locked?: boolean }

/** Known parts only, with sane numbers, at most MAX_PARTS of them, ids unique. */
export function cleanPartList(list: unknown): CleanPart[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: CleanPart[] = [];
  for (const p of list) {
    if (out.length >= MAX_PARTS) break;
    if (!p || typeof p !== 'object' || typeof p.type !== 'string' || !Object.hasOwn(PARTS, p.type)) continue;
    let id = isSafeId(p.id) ? p.id : `${p.type}-${out.length}`;
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    out.push({
      id, type: p.type,
      x: clamp(finite(p.x), -DESK, DESK), z: clamp(finite(p.z), -DESK, DESK), rot: finite(p.rot) & 3,
      pins: cleanPins(p.pins), props: cleanProps(p.type, p.props),
      ...(p.locked === true ? { locked: true } : {}),
    });
  }
  return out;
}

const ENDPOINT = /^[\w-]{1,64}:[\w-]{1,32}$/;

export interface CleanWire { id: string; a: string; b: string; color: string }

/** Wires whose ends look like part:terminal, with a real colour. */
export function cleanWireList(w: unknown, newId: () => string): CleanWire[] | undefined {
  if (!Array.isArray(w)) return undefined;
  return w
    .filter((x: any) => x && typeof x.a === 'string' && typeof x.b === 'string' && ENDPOINT.test(x.a) && ENDPOINT.test(x.b))
    .slice(0, MAX_WIRES)
    .map((x: any) => ({ id: isSafeId(x.id) ? x.id : newId(), a: x.a, b: x.b, color: isHexColor(x.color) ? x.color : '#3b82c4' }));
}

export const cleanCode = (c: unknown): string => (typeof c === 'string' ? c.slice(0, MAX_CODE) : '');
