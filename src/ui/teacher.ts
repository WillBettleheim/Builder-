// Teacher mode without a server: a class is just a code inside an invite link.
// Students send their progress back as a report link, and the teacher pastes
// those links into a dashboard that lives entirely in their own browser.
import { pack, unpack } from './codec';
import { escapeHtml } from './html';

export interface ClassInfo { code: string; name: string; teacher: string }
export interface Report {
  v: 1;
  c: string; // class code
  n: string; // student name
  t: number; // when the report was made
  done: string[]; // finished lesson ids
  part: Record<string, number>; // lesson id -> goals reached, for lessons started but not finished
  badges: number;
  quiz: number; // quiz questions right first try
}
export interface TeacherStore { classes: (ClassInfo & { created: number })[]; reports: Record<string, Record<string, Report>> }
export interface LessonRef { id: string; title: string; level: string; goals: number }

const KEY = 'builder-teacher-v1';
const esc = escapeHtml;

/** Object keys that would reach the prototype instead of making a normal entry. */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const str = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const count = (v: unknown) => Math.max(0, Math.min(1e6, Math.floor(Number(v) || 0)));

/** A report with every field forced to the right type and size, or null. */
export function cleanReport(d: any): Report | null {
  if (d?.v !== 1 || typeof d.c !== 'string' || typeof d.n !== 'string' || !Array.isArray(d.done)) return null;
  const n = str(d.n, 60);
  if (!n.trim() || BAD_KEYS.has(n.trim().toLowerCase())) return null;
  const part: Record<string, number> = {};
  if (d.part && typeof d.part === 'object') {
    for (const [k, v] of Object.entries(d.part).slice(0, 500)) if (typeof v === 'number' && !BAD_KEYS.has(k)) part[k.slice(0, 64)] = count(v);
  }
  return {
    v: 1, c: str(d.c, 12), n, t: Math.max(0, Number(d.t) || 0),
    done: d.done.filter((x: unknown) => typeof x === 'string').slice(0, 500).map((x: string) => x.slice(0, 64)), part,
    badges: count(d.badges), quiz: count(d.quiz),
  };
}

export function loadTeacher(): TeacherStore {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!s || !Array.isArray(s.classes)) return store;
    // re-check what comes back: other pages on the same site share this storage
    for (const c of s.classes) {
      if (!c || typeof c.code !== 'string' || !/^[A-Z0-9]{1,12}$/.test(c.code)) continue;
      store.classes.push({ code: c.code, name: str(c.name, 60), teacher: str(c.teacher, 60), created: Number(c.created) || 0 });
      const byStudent: Record<string, Report> = {};
      for (const [k, r] of Object.entries(s.reports?.[c.code] ?? {})) {
        const ok = cleanReport(r);
        if (ok && !BAD_KEYS.has(k)) byStudent[k] = ok;
      }
      store.reports[c.code] = byStudent;
    }
  } catch { /* fall through to a fresh store */ }
  return { classes: [], reports: {} };
}

export function saveTeacher(store: TeacherStore) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full or blocked */ }
}

/** A short class code that's easy to read aloud: no 0/O or 1/I. */
export function newClassCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => A[b % A.length]).join('');
}

const base = () => `${location.origin}${location.pathname}`;
export const inviteLink = async (c: ClassInfo) => `${base()}#class=${await pack({ c: c.code, n: c.name, t: c.teacher })}`;
export const reportLink = async (r: Report) => `${base()}#report=${await pack(r)}`;

export async function readInvite(token: string): Promise<ClassInfo | null> {
  try {
    const d = await unpack(token);
    if (typeof d?.c !== 'string' || !/^[A-Z0-9]{1,12}$/.test(d.c) || typeof d.n !== 'string') return null;
    return { code: d.c, name: String(d.n).slice(0, 60), teacher: String(d.t ?? '').slice(0, 60) };
  } catch {
    return null;
  }
}

export async function readReport(token: string): Promise<Report | null> {
  try {
    return cleanReport(await unpack(token));
  } catch {
    return null;
  }
}

/** Every report link pasted into a box (any amount of other text around them). */
export async function importReports(store: TeacherStore, text: string): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const m of text.matchAll(/report=([\w-]+)/g)) {
    const r = await readReport(m[1]);
    if (!r || !store.classes.some(c => c.code === r.c)) { skipped++; continue; }
    const byStudent = (store.reports[r.c] ??= {});
    const key = r.n.trim().toLowerCase();
    // keep the newest report from each student
    if (!byStudent[key] || byStudent[key].t <= r.t) { byStudent[key] = r; added++; } else skipped++;
  }
  saveTeacher(store);
  return { added, skipped };
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export function dashboardHtml(store: TeacherStore, code: string | null, lessons: LessonRef[], invite: string): string {
  const cls = store.classes.find(c => c.code === code) ?? store.classes[0];
  const head = `<div class="bs-head"><div><div class="eyebrow">TEACHER MODE</div><h2>Class dashboard</h2></div><button class="mini ghost icon" data-tm="close" aria-label="Close">×</button></div>`;
  const create = `
    <form class="tm-create" data-tm-form="create">
      <h3>${store.classes.length ? 'Add another class' : 'Create your first class'}</h3>
      <div class="tm-fields">
        <label class="field"><span>Class name</span><input name="name" required maxlength="60" placeholder="e.g. Year 8 Robotics"></label>
        <label class="field"><span>Your name (students see it)</span><input name="teacher" maxlength="60" placeholder="e.g. Ms Patel"></label>
      </div>
      <button class="mini primary">Create class</button>
    </form>`;
  const privacy = `<p class="muted tm-note">🔒 Builder has no server. Students send you their progress as a link, and everything stays in this browser. Nothing is uploaded.</p>`;
  if (!cls) return `${head}<div class="bs-body">${privacy}${create}</div>`;

  const reports = Object.values(store.reports[cls.code] ?? {}).sort((a, b) => a.n.localeCompare(b.n));
  const n = reports.length;
  const avg = n ? reports.reduce((s, r) => s + r.done.length, 0) / n : 0;
  // the lesson the most students have started but not finished
  const stuck = lessons
    .map(l => ({ l, count: reports.filter(r => !r.done.includes(l.id) && (r.part[l.id] ?? 0) > 0).length }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const cell = (r: Report, l: LessonRef) => {
    const done = r.done.includes(l.id), got = r.part[l.id] ?? 0;
    const cls2 = done ? 'done' : got ? 'part' : '';
    const tip = `${r.n} · ${l.title}: ${done ? 'finished' : got ? `${got}/${l.goals} goals` : 'not started'}`;
    return `<i class="${cls2}" title="${esc(tip)}"></i>`;
  };
  const levels = [...new Set(lessons.map(l => l.level))];

  return `${head}<div class="bs-body">
    <div class="tm-bar">
      <label class="field"><span>Class</span><select data-tm="pick">${store.classes.map(c => `<option value="${esc(c.code)}" ${c.code === cls.code ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <div class="tm-code"><span>Class code</span><b>${esc(cls.code)}</b></div>
    </div>
    <div class="tm-invite">
      <label class="field"><span>1 · Share this invite link with your students</span><input readonly value="${esc(invite)}" data-tm="invite-url"></label>
      <button class="mini primary" data-tm="copy-invite">Copy invite link</button>
    </div>
    <form class="tm-import" data-tm-form="import">
      <label class="field"><span>2 · Paste the progress links students send you (as many as you like)</span><textarea name="links" rows="3" placeholder="https://…#report=…"></textarea></label>
      <button class="mini">Add reports</button>
    </form>
    <div class="tm-stats">
      <div><b>${n}</b><span>student${n === 1 ? '' : 's'}</span></div>
      <div><b>${avg.toFixed(1)}</b><span>lessons finished on average (of ${lessons.length})</span></div>
      <div><b>${stuck ? esc(stuck.l.title) : '—'}</b><span>${stuck ? `${stuck.count} student${stuck.count === 1 ? ' is' : 's are'} partway through` : 'no one stuck yet'}</span></div>
    </div>
    ${n ? `
    <table class="tm-table">
      <thead><tr><th>Student</th><th>Lessons</th><th>Badges</th><th>Quiz ✓</th><th>Last report</th><th></th></tr></thead>
      <tbody>${reports.map(r => `<tr>
        <td><b>${esc(r.n)}</b></td>
        <td><div class="tm-meter"><i style="width:${(r.done.length / lessons.length) * 100}%"></i></div><small>${r.done.length}/${lessons.length}</small></td>
        <td>${r.badges}</td><td>${r.quiz}</td><td>${ago(r.t)}</td>
        <td><button class="mini ghost icon" data-tm="remove" data-student="${esc(r.n.trim().toLowerCase())}" aria-label="Remove ${esc(r.n)}">🗑</button></td>
      </tr>`).join('')}</tbody>
    </table>
    <h3>Lesson by lesson</h3>
    <div class="tm-heat-wrap"><table class="tm-heat">
      <thead><tr><th></th>${levels.map(lv => `<th colspan="${lessons.filter(l => l.level === lv).length}">${esc(lv)}</th>`).join('')}</tr></thead>
      <tbody>${reports.map(r => `<tr><th>${esc(r.n)}</th>${lessons.map(l => `<td>${cell(r, l)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <p class="tm-legend"><i class="done"></i> finished <i class="part"></i> started <i></i> not started</p>` : `<p class="muted">No reports yet. When a student taps <b>Send progress to teacher</b>, they get a link to send you. Paste it above.</p>`}
    <div class="row tm-foot">
      <button class="mini" data-tm="csv" ${n ? '' : 'disabled'}>Download CSV</button>
      <button class="mini danger" data-tm="delete-class">Delete this class</button>
    </div>
    ${privacy}${create}</div>`;
}

/** A spreadsheet of the class: one row per student, one column per lesson. */
export function classCsv(store: TeacherStore, code: string, lessons: LessonRef[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['Student', 'Lessons finished', 'Badges', 'Quiz first try', 'Last report', ...lessons.map(l => l.title)].map(q).join(',')];
  for (const r of Object.values(store.reports[code] ?? {})) {
    rows.push([q(r.n), r.done.length, r.badges, r.quiz, q(new Date(r.t).toISOString()), ...lessons.map(l => (r.done.includes(l.id) ? 'done' : r.part[l.id] ? `${r.part[l.id]}/${l.goals}` : ''))].join(','));
  }
  return rows.join('\n');
}
