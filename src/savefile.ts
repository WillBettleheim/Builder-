// The shape of Builder's save in localStorage, and the check every save passes on load.
import { newWireId, type Wire } from './sim/circuit';
import { cleanCode, cleanPartList, cleanWireList, isSafeId } from './sim/sanitize';

export interface SavedPart { id: string; type: string; x: number; z: number; rot: number; pins: Record<string, number | null>; props: Record<string, any>; locked?: boolean }
export interface SavedScene { code: string; parts: SavedPart[]; wires?: Wire[] }
export interface Project { id: string; name: string; updated: number; scene: SavedScene }
export interface Saved {
  mode: 'lessons' | 'sandbox';
  lessonId: string;
  goals: Record<string, boolean[]>;
  lessons: Record<string, SavedScene>;
  sandbox: SavedScene | null; // pre-projects save; migrated into projects
  projects: Project[];
  projectId: string;
  muted: boolean;
  theme: 'auto' | 'light' | 'dark';
  toured: boolean;
  quality: 'auto' | 'high' | 'balanced' | 'low';
  badges: Record<string, number>;
  quiz: Record<string, Record<number, { tries: number; ok: boolean }>>;
  stats: { wires: number };
  instructor: boolean;
  /** camera and overlay options from the View menu */
  view?: { pinLabels: 'off' | 'used' | 'all'; follow: boolean; wiresOnTop: boolean; arrows?: boolean; trail?: boolean };
  /** robot dashboard folded away */
  dashHidden?: boolean;
  /** best lap times on line tracks, per lesson or project, in ms */
  bestLaps?: Record<string, number>;
  /** width of the side panel in pixels, after the person dragged it */
  sideW?: number;
  /** the live board panel is folded away */
  boardHidden?: boolean;
  /** grid size parts snap to, in cm (0 = fine 0.25 cm steps) */
  snap?: number;
  /** the class this learner joined from a teacher's invite link */
  classroom?: { code: string; name: string; teacher: string; student: string } | null;
}

/**
 * Check every field of a save before using it. Other pages on the same site (on
 * GitHub Pages, every repo of the same account) share this storage, so a bad value
 * must fall back to a default instead of crashing Builder on every visit.
 */
export function cleanSaved(d: any, empty: Saved, lessonIds: string[]): Saved {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return empty;
  const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : null);
  const str = (v: unknown, n = 200) => (typeof v === 'string' ? v.slice(0, n) : null);
  const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt);
  const pick = <T extends string>(v: unknown, ok: readonly T[], dflt: T): T => (ok.includes(v as T) ? (v as T) : dflt);
  const entries = (v: unknown) => Object.entries(obj(v) ?? {}).filter(([k]) => k !== '__proto__');
  const scene = (v: any): SavedScene | null => (obj(v) && Array.isArray(v.parts) ? { code: cleanCode(v.code), parts: cleanPartList(v.parts), wires: cleanWireList(v.wires, newWireId) } : null);
  const out: Saved = { ...empty };
  out.mode = pick(d.mode, ['lessons', 'sandbox'] as const, 'lessons');
  out.lessonId = lessonIds.includes(d.lessonId) ? d.lessonId : empty.lessonId;
  out.goals = Object.fromEntries(entries(d.goals).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).map(x => x === true)]));
  out.lessons = Object.fromEntries(entries(d.lessons).map(([k, v]) => [k, scene(v)]).filter(([, v]) => v));
  out.sandbox = scene(d.sandbox);
  out.projects = (Array.isArray(d.projects) ? d.projects : []).flatMap((p: any): Project[] => {
    const sc = obj(p) && scene(p.scene);
    return sc && isSafeId(p.id) ? [{ id: p.id, name: str(p.name, 60) || 'Project', updated: Number(p.updated) || 0, scene: sc }] : [];
  });
  out.projectId = str(d.projectId, 64) ?? '';
  out.muted = bool(d.muted, false);
  out.theme = pick(d.theme, ['auto', 'light', 'dark'] as const, 'auto');
  out.toured = bool(d.toured, false);
  out.quality = pick(d.quality, ['auto', 'high', 'balanced', 'low'] as const, 'auto');
  out.badges = Object.fromEntries(entries(d.badges).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)));
  out.quiz = Object.fromEntries(entries(d.quiz).filter(([, v]) => obj(v)).map(([k, v]) => [k, Object.fromEntries(entries(v).filter(([, a]) => obj(a)).map(([i, a]) => [i, { tries: Number(a.tries) || 0, ok: a.ok === true }]))]));
  out.stats = { wires: Number(obj(d.stats)?.wires) || 0 };
  out.instructor = bool(d.instructor, true);
  const view = obj(d.view);
  if (view) out.view = { pinLabels: pick(view.pinLabels, ['off', 'used', 'all'] as const, 'used'), follow: view.follow === true, wiresOnTop: view.wiresOnTop === true, arrows: view.arrows !== false, trail: view.trail !== false };
  out.dashHidden = d.dashHidden === true;
  out.bestLaps = Object.fromEntries(entries(d.bestLaps).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0));
  if (typeof d.sideW === 'number' && Number.isFinite(d.sideW)) out.sideW = Math.min(2000, Math.max(200, d.sideW));
  out.boardHidden = d.boardHidden === true;
  if (typeof d.snap === 'number' && [0, 0.5, 1, 2, 2.5, 5].includes(d.snap)) out.snap = d.snap;
  const c = obj(d.classroom);
  out.classroom = c && typeof c.code === 'string' && /^[A-Z0-9]{1,12}$/.test(c.code)
    ? { code: c.code, name: str(c.name, 60) ?? '', teacher: str(c.teacher, 60) ?? '', student: str(c.student, 60) ?? '' }
    : null;
  return out;
}
