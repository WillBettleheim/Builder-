import './style.css';
import { CompileError } from './interp/lexer';
import { parse } from './interp/parser';
import { Interpreter, RuntimeError } from './interp/interpreter';
import { PWM_PINS, pinName } from './sim/board';
import { PALETTE, PARTS, newPart, type Part } from './sim/parts';
import { World, partThumbnail, wireColor } from './scene/world';
import { WIRE_COLORS, autoWires, endpoint, endpointLabel, nearestGround, type Wire } from './sim/circuit';
import { CodeEditor } from './ui/editor';
import { runTour } from './ui/tour';
import { Plotter } from './ui/plotter';
import { Timeline, type Track } from './ui/timeline';
import { buildSheetHtml } from './ui/buildsheet';
import { QUIZZES, answerOrder } from './quizzes';
import { BADGES } from './badges';
import { LESSONS, type GoalCtx, type Lesson, type PartSpec } from './lessons';

// ---------- persistence ----------
interface SavedPart { id: string; type: string; x: number; z: number; rot: number; pins: Record<string, number | null>; props: Record<string, any>; locked?: boolean }
interface SavedScene { code: string; parts: SavedPart[]; wires?: Wire[] }
interface Project { id: string; name: string; updated: number; scene: SavedScene }
interface Saved {
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
}
const KEY = 'builder-v1';
const OLD_KEY = 'arduino-lab-v1'; // name before the app became Builder
function load(): Saved {
  const empty: Saved = { mode: 'lessons', lessonId: LESSONS[0].id, goals: {}, lessons: {}, sandbox: null, projects: [], projectId: '', muted: false, theme: 'auto', toured: false, quality: 'auto', badges: {}, quiz: {}, stats: { wires: 0 } };
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}
const saved = load();
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    snapshotScene();
    recordHistory();
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage full or blocked */ }
  }, 300);
}

// ---------- elements ----------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $('stage');
const guideEl = $('guide');
const inspectorEl = $('inspector');
const trayEl = $('tray');
const serialOut = $('serial-out');
const errorEl = $('error');
const runBtn = $<HTMLButtonElement>('run');
const stopBtn = $<HTMLButtonElement>('stop');
const pauseBtn = $<HTMLButtonElement>('pause');
const speedSel = $<HTMLSelectElement>('speed');
const clockEl = $('clock');
const statusEl = $('status');

const world = new World(stage);
const editor = new CodeEditor($('editor'));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let mode: 'lessons' | 'sandbox' = saved.mode;
let lesson: Lesson = LESSONS.find(l => l.id === saved.lessonId) ?? LESSONS[0];

// ---------- toasts ----------
function toast(html: string, kind: 'info' | 'hint' | 'good' | 'error' = 'info', ms = 7000, action?: { label: string; fn: () => void }) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<div>${html}</div>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.remove(); };
    t.appendChild(b);
  }
  const x = document.createElement('button');
  x.className = 'x';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  x.onclick = () => t.remove();
  t.appendChild(x);
  $('toasts').appendChild(t);
  if (ms) setTimeout(() => t.classList.add('out'), ms);
  if (ms) setTimeout(() => t.remove(), ms + 400);
  const all = $('toasts').children;
  if (all.length > 4) all[0].remove();
}

// ---------- scene (de)serialization ----------
function serializeParts(): SavedPart[] {
  return world.parts.map(p => ({ id: p.id, type: p.type, x: p.x, z: p.z, rot: p.rot, pins: { ...p.pins }, props: { ...p.props }, locked: p.locked }));
}

/**
 * Put parts (and their wires) on the desk. Scenes without saved wires — lesson
 * setups and saves from before wiring existed — get wires generated from their pins.
 */
function loadParts(parts: (SavedPart | PartSpec)[], wires?: Wire[], idPrefix?: string) {
  world.clear();
  parts.forEach((s, i) => {
    if (!PARTS[s.type]) return;
    world.addPart(newPart(s.type, { ...s, id: (s as SavedPart).id ?? (idPrefix ? `${idPrefix}-${i}` : undefined), locked: s.type === 'uno' || (s as SavedPart).locked }));
  });
  lastWireCount = (wires ?? []).length;
  world.setWires(wires ?? world.parts.flatMap((p, i) => {
    const spec = parts[i] as PartSpec;
    // some lessons leave power and ground for the learner to wire
    return autoWires(world.parts, p).filter(w => !spec?.noPower || PARTS[p.type].terminals(p).some(t => t.kind === 'signal' && w.b === endpoint(p.id, t.key)));
  }));
}

// Which scene is currently in the world: 'sandbox', a lesson id, or null before boot.
let loadedKey: string | null = null;

function snapshotScene() {
  if (!loadedKey) return;
  const scene: SavedScene = { code: editor.value, parts: serializeParts(), wires: world.wires.map(w => ({ ...w })) };
  if (loadedKey === 'sandbox') {
    if (scene.parts.length - 1 >= 6) award('inventor');
    const p = activeProject();
    if (JSON.stringify(p.scene) !== JSON.stringify(scene)) p.updated = Date.now();
    p.scene = scene;
  }
  else saved.lessons[loadedKey] = scene;
}

/** Navigate to another lesson, keeping the current one's edits. */
function goLesson(l: Lesson) {
  snapshotScene();
  openLesson(l);
}

const DEFAULT_SANDBOX: SavedScene = {
  code: `// Sandbox: build anything!
// Add parts from the tray below, click them to wire them up.

void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`,
  parts: [
    { id: 'uno', type: 'uno', x: 0, z: 0, rot: 0, pins: {}, props: {}, locked: true },
    { id: 'sb-led', type: 'led', x: 11, z: -2, rot: 0, pins: { pin: 13 }, props: { color: 'red' } },
  ],
};

// ---------- undo / redo (parts and wires only; code has its own undo) ----------
const undoStack: string[] = [];
let undoAt = -1;
let restoring = false;

/** The circuit without live sensor values, so turning a knob isn't an undo step. */
function circuitKey(): string {
  const parts = world.parts.map(p => {
    const props: Record<string, any> = {};
    for (const pd of PARTS[p.type].props ?? []) if (pd.type === 'select') props[pd.key] = p.props[pd.key];
    return { id: p.id, type: p.type, x: p.x, z: p.z, rot: p.rot, props, locked: p.locked };
  });
  return JSON.stringify({ parts, wires: world.wires.map(({ id, a, b, color }) => ({ id, a, b, color })) });
}

function resetHistory() {
  undoStack.length = 0;
  undoStack.push(circuitKey());
  undoAt = 0;
  updateUndoButtons();
}

function recordHistory() {
  if (restoring || undoAt < 0) return;
  const key = circuitKey();
  if (key === undoStack[undoAt]) return;
  undoStack.splice(undoAt + 1);
  undoStack.push(key);
  if (undoStack.length > 80) undoStack.shift();
  undoAt = undoStack.length - 1;
  updateUndoButtons();
}

function restoreHistory(dir: -1 | 1) {
  // capture an edit made in the last few hundred ms before stepping back
  recordHistory();
  const to = undoAt + dir;
  if (to < 0 || to >= undoStack.length) return;
  undoAt = to;
  const snap = JSON.parse(undoStack[to]);
  const live = new Map(world.parts.map(p => [p.id, p.props]));
  const sel = world.selected?.id;
  restoring = true;
  loadParts(snap.parts.map((p: SavedPart) => ({ ...p, pins: {}, props: { ...live.get(p.id), ...p.props } })), snap.wires);
  world.select(world.parts.find(p => p.id === sel) ?? null);
  restoring = false;
  updateUndoButtons();
  save();
}

function updateUndoButtons() {
  $<HTMLButtonElement>('undo').disabled = undoAt <= 0;
  $<HTMLButtonElement>('redo').disabled = undoAt >= undoStack.length - 1;
}
$('undo').onclick = () => restoreHistory(-1);
$('redo').onclick = () => restoreHistory(1);

// ---------- simulation ----------
let gen: Generator<void, void, void> | null = null;
let interp: Interpreter | null = null;
let running = false;
let paused = false;
let goalMem: Record<string, any>[] = [];
const sentText: string[] = [];

let hadError = false;
function showError(err: CompileError | RuntimeError, kind: string) {
  hadError = true;
  errorEl.hidden = false;
  errorEl.innerHTML = `<b>${kind} error on line ${err.line}</b><span>${esc(err.message)}</span>`;
  editor.showError(err.line);
}

function clearError() {
  errorEl.hidden = true;
  editor.clearError();
}

function run() {
  stop(true);
  clearError();
  world.audio.unlock();
  let prog;
  try {
    prog = parse(editor.value);
  } catch (e) {
    if (e instanceof CompileError) {
      showError(e, 'Compile');
      setStatus('error', 'Compile error');
      return;
    }
    throw e;
  }
  world.board.reset();
  serialOut.textContent = '';
  sentText.length = 0;
  interp = new Interpreter(prog, world.board);
  gen = interp.run();
  running = true;
  world.running = true;
  goalMem = currentGoals().map(() => ({}));
  award('first-run');
  if (hadError) award('fixed');
  hadError = false;
  runBtn.querySelector('span')!.textContent = 'Restart';
  stopBtn.disabled = false;
  pauseBtn.disabled = false;
  setPaused(false);
  plotter.clear();
  timeline.clear();
  setStatus('running', 'Running');
}

function stop(silent = false) {
  if (!running) return;
  running = false;
  world.running = false;
  gen = null;
  editor.setRunLine(null);
  world.audio.silenceAll();
  runBtn.querySelector('span')!.textContent = 'Run';
  stopBtn.disabled = true;
  pauseBtn.disabled = true;
  setPaused(false);
  if (!silent) setStatus('stopped', 'Stopped');
}

function setStatus(kind: 'running' | 'stopped' | 'error', text: string) {
  statusEl.className = `status ${kind}`;
  statusEl.querySelector('span')!.textContent = text;
}

world.board.onHint = text => toast(esc(text), 'hint', 10000);
world.board.onSerial = text => { serialDirty = true; plotter.push(text); };
let serialDirty = false;

world.onFrame = dt => {
  if (running && gen && interp) {
    const b = world.board;
    const speed = parseFloat(speedSel.value);
    b.target = Math.min(b.target, b.time) + dt * 1000 * speed;
    interp.resetBudget();
    if (paused) b.target = b.time; // frozen in time until resumed
    try {
      if (!paused && b.time < b.target) gen.next();
    } catch (e) {
      if (e instanceof RuntimeError) {
        showError(e, 'Runtime');
        stop(true);
        setStatus('error', 'Crashed');
      } else {
        console.error(e);
        stop();
      }
    }
    clockEl.textContent = `${(b.time / 1000).toFixed(2)} s`;
    if (running) editor.setRunLine(interp.currentLine || null);
    checkGoals();
  }
  plotter.draw();
  if (plotter.visible && plotter.hasData && running) award('plotter');
  if (running && !paused) timeline.record(world.board, pinTracks());
  timeline.draw(world.board);
  if (serialDirty) {
    serialDirty = false;
    const nearBottom = serialOut.scrollHeight - serialOut.scrollTop - serialOut.clientHeight < 40;
    serialOut.textContent = world.board.serialOut.slice(-12000);
    if (nearBottom) serialOut.scrollTop = serialOut.scrollHeight;
  }
};

// ---------- goals ----------
function currentGoals() { return mode === 'lessons' ? lesson.goals : []; }

function checkGoals() {
  if (mode !== 'lessons') return;
  const done = (saved.goals[lesson.id] ??= lesson.goals.map(() => false));
  const ctx: GoalCtx = {
    board: world.board,
    parts: world.parts,
    part: t => world.parts.find(p => p.type === t),
    serial: world.board.serialOut,
    sent: sentText,
    now: performance.now(),
    wires: world.wires,
  };
  lesson.goals.forEach((g, i) => {
    let ok = false;
    try { ok = g.check(ctx, goalMem[i] ?? (goalMem[i] = {})); } catch { ok = false; }
    if (ok && !done[i]) {
      done[i] = true;
      const li = guideEl.querySelector(`[data-goal="${i}"]`);
      li?.classList.add('done', 'pop');
      const bar = guideEl.querySelector<HTMLElement>('.g-progress i');
      if (bar) bar.style.width = `${(done.filter(Boolean).length / lesson.goals.length) * 100}%`;
      const wasComplete = done.every(Boolean);
      save();
      renderProgress();
      renderTray();
      if (wasComplete) {
        checkLessonBadges();
        const idx = LESSONS.indexOf(lesson);
        const next = LESSONS[idx + 1];
        toast(`<b>Lesson complete!</b> ${esc(lesson.title)}`, 'good', 9000, next ? { label: `Next: ${next.title} →`, fn: () => goLesson(next) } : undefined);
      } else toast(`<b>Goal reached</b> ${esc(g.text)}`, 'good', 4000);
    }
  });
}

function lessonComplete(l: Lesson) { const g = saved.goals[l.id]; return !!g && g.length === l.goals.length && g.every(Boolean); }

function renderProgress() {
  const n = LESSONS.filter(lessonComplete).length;
  $('progress-text').textContent = `${n}/${LESSONS.length}`;
  $('progress-bar').style.width = `${(n / LESSONS.length) * 100}%`;
}

// ---------- guide card ----------
function updateInset() {
  const wide = window.innerWidth > 1000 && !guideEl.classList.contains('collapsed');
  world.setLeftInset(wide ? guideEl.getBoundingClientRect().right - stage.getBoundingClientRect().left : 0);
}
window.addEventListener('resize', updateInset);

function renderGuide() {
  queueMicrotask(updateInset);
  if (mode === 'sandbox') {
    const cur = activeProject();
    const others = [...saved.projects].sort((x, y) => y.updated - x.updated);
    guideEl.innerHTML = `
      <div class="g-head">
        <div style="flex:1;min-width:0"><div class="eyebrow">SANDBOX PROJECT</div>
          <input class="proj-name" data-act="rename" value="${esc(cur.name)}" aria-label="Project name" maxlength="60" spellcheck="false"></div>
        <button class="mini ghost" data-act="collapse" title="Collapse">–</button>
      </div>
      <div class="g-body">
        <p class="muted">Add parts from the tray, wire them up, write code and press <b>Run</b>. Everything saves automatically.</p>
        <div class="row">
          <button class="mini primary" data-act="share" title="Copy a link anyone can open">Share link</button>
          <button class="mini" data-act="new">New project</button>
          <button class="mini" data-act="export" title="Download as a file">Export</button>
          <button class="mini" data-act="import" title="Open a project file">Import</button>
          <button class="mini" data-act="build-real" title="Parts list, wiring steps and code for real hardware">Build it for real</button>
        </div>
        <h3>Your projects</h3>
        <ul class="projects">
          ${others.map(p => `<li class="${p.id === cur.id ? 'on' : ''}">
            <button class="proj-open" data-act="open" data-id="${p.id}"><b>${esc(p.name)}</b><small>${p.scene.parts.length - 1} part${p.scene.parts.length === 2 ? '' : 's'} · ${timeAgo(p.updated)}</small></button>
            <button class="mini ghost icon" data-act="dup" data-id="${p.id}" title="Duplicate" aria-label="Duplicate ${esc(p.name)}">⧉</button>
            <button class="mini ghost icon" data-act="del" data-id="${p.id}" title="Delete" aria-label="Delete ${esc(p.name)}">🗑</button>
          </li>`).join('')}
        </ul>
        <label class="field"><span>Start a new project from a lesson</span>
          <select data-act="example">
            <option value="">Choose a lesson…</option>
            ${LESSONS.map(l => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}
          </select>
        </label>
      </div>`;
    return;
  }
  const done = saved.goals[lesson.id] ?? [];
  const idx = LESSONS.indexOf(lesson);
  guideEl.innerHTML = `
    <div class="g-head">
      <div><div class="eyebrow">LESSON ${idx + 1} OF ${LESSONS.length} · ${lesson.level.toUpperCase()}</div><h2>${esc(lesson.title)}</h2></div>
      <button class="mini ghost" data-act="collapse" title="Collapse">–</button>
    </div>
    <div class="g-progress" title="Goals done"><i style="width:${(done.filter(Boolean).length / lesson.goals.length) * 100}%"></i></div>
    <div class="g-body">
      <div class="lesson-text">${lesson.intro}</div>
      <h3>Goals</h3>
      <ol class="goals">
        ${lesson.goals.map((g, i) => `<li data-goal="${i}" class="${done[i] ? 'done' : ''}"><i></i><span>${esc(g.text)}</span></li>`).join('')}
      </ol>
      ${quizHtml()}
      <div class="row">
        ${idx > 0 ? `<button class="mini" data-act="prev">← Back</button>` : ''}
        <button class="mini" data-act="reset-lesson" title="Restore the original parts and code">Reset lesson</button>
        <button class="mini" data-act="to-sandbox" title="Copy this circuit and code to the sandbox">Open in sandbox</button>
        <button class="mini" data-act="build-real" title="Parts list, wiring steps and code for real hardware">Build it for real</button>
        ${idx < LESSONS.length - 1 ? `<button class="mini primary" data-act="next">Next →</button>` : ''}
      </div>
    </div>`;
}

guideEl.addEventListener('click', e => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  const idx = LESSONS.indexOf(lesson);
  switch (act) {
    case 'collapse': guideEl.classList.toggle('collapsed'); updateInset(); break;
    case 'prev': goLesson(LESSONS[idx - 1]); break;
    case 'next': goLesson(LESSONS[idx + 1]); break;
    case 'reset-lesson':
      if (confirm('Reset this lesson’s parts and code to the original?')) {
        delete saved.lessons[lesson.id];
        openLesson(lesson, true);
      }
      break;
    case 'to-sandbox': {
      stop();
      snapshotScene();
      // fresh ids so sandbox and lesson copies never collide; wires follow the rename
      const rename = (id: string) => (world.uno?.id === id ? id : `${id}-sb`);
      const reEp = (ep: string) => { const i = ep.lastIndexOf(':'); return rename(ep.slice(0, i)) + ep.slice(i); };
      createProject(lesson.title, {
        code: editor.value,
        parts: serializeParts().map(p => ({ ...p, id: rename(p.id) })),
        wires: world.wires.map(w => ({ ...w, a: reEp(w.a), b: reEp(w.b) })),
      });
      toast('Copied the lesson circuit and code into a new sandbox project.', 'info', 4000);
      break;
    }
    case 'new': createProject(nextName(), { code: DEFAULT_SANDBOX.code, parts: [DEFAULT_SANDBOX.parts[0]] }); break;
    case 'export': exportProject(); break;
    case 'import': importProject(); break;
    case 'share': shareProject(); break;
    case 'quiz': answerQuiz(e.target as HTMLElement); break;
    case 'build-real': openBuildSheet(); break;
    case 'open': {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')!.dataset.id!;
      if (id !== saved.projectId) { stop(); snapshotScene(); saved.projectId = id; openSandbox(); }
      break;
    }
    case 'dup': {
      const src = saved.projects.find(p => p.id === (e.target as HTMLElement).closest<HTMLElement>('[data-id]')!.dataset.id)!;
      snapshotScene();
      createProject(`${src.name} copy`, JSON.parse(JSON.stringify(src.scene)));
      break;
    }
    case 'del': {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')!.dataset.id!;
      const victim = saved.projects.find(p => p.id === id)!;
      if (!confirm(`Delete “${victim.name}”? This can’t be undone.`)) break;
      saved.projects = saved.projects.filter(p => p !== victim);
      if (!saved.projects.length) saved.projects.push(newProjectEntry('My project', { code: DEFAULT_SANDBOX.code, parts: [DEFAULT_SANDBOX.parts[0]] }));
      if (saved.projectId === id) {
        stop();
        loadedKey = null; // don't save the deleted project's scene anywhere
        saved.projectId = [...saved.projects].sort((x, y) => y.updated - x.updated)[0].id;
        openSandbox();
      } else renderGuide();
      save();
      break;
    }
  }
});

guideEl.addEventListener('change', e => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.act !== 'rename') return;
  activeProject().name = input.value.trim() || 'Untitled project';
  input.value = activeProject().name;
  renderGuide();
  save();
});

// ---------- quizzes ----------
function quizHtml(): string {
  const qs = QUIZZES[lesson.id];
  if (!qs) return '';
  const state = saved.quiz[lesson.id] ?? {};
  return `<h3>Check your understanding</h3><div class="quiz">${qs.map((q, qi) => {
    const st = state[qi];
    return `<div class="qz ${st?.ok ? 'ok' : ''}" data-qi="${qi}">
      <p>${esc(q.q)}</p>
      <div class="qz-opts">${answerOrder(lesson.id, qi, q.a.length).map(ai => `<button class="qz-opt ${st?.ok && ai === q.correct ? 'right' : ''}" data-act="quiz" data-qi="${qi}" data-ai="${ai}" ${st?.ok ? 'disabled' : ''}>${esc(q.a[ai])}</button>`).join('')}</div>
      <p class="qz-why" ${st?.ok ? '' : 'hidden'}>${st?.ok ? (st.tries === 1 ? '✓ Right first time! ' : '✓ ') : ''}${esc(q.why)}</p>
    </div>`;
  }).join('')}</div>`;
}

function answerQuiz(btn: HTMLElement) {
  const qi = Number(btn.dataset.qi), ai = Number(btn.dataset.ai);
  const q = QUIZZES[lesson.id][qi];
  const state = (saved.quiz[lesson.id] ??= {});
  const st = (state[qi] ??= { tries: 0, ok: false });
  if (st.ok) return;
  st.tries++;
  const box = btn.closest('.qz')!;
  if (ai === q.correct) {
    st.ok = true;
    box.classList.add('ok');
    btn.classList.add('right');
    box.querySelectorAll<HTMLButtonElement>('.qz-opt').forEach(b => { b.disabled = true; });
    const why = box.querySelector<HTMLElement>('.qz-why')!;
    why.textContent = `${st.tries === 1 ? '✓ Right first time! ' : '✓ '}${q.why}`;
    why.hidden = false;
    const firstTry = Object.values(saved.quiz).flatMap(x => Object.values(x)).filter(x => x.ok && x.tries === 1).length;
    if (firstTry >= 10) award('quiz-10');
  } else {
    btn.classList.remove('wrong');
    void btn.offsetWidth; // restart the shake animation
    btn.classList.add('wrong');
    btn.setAttribute('disabled', '');
  }
  save();
}

// ---------- badges ----------
let lastWireCount = 0;

function award(id: string) {
  if (saved.badges[id]) return;
  const b = BADGES.find(x => x.id === id);
  if (!b) return;
  saved.badges[id] = Date.now();
  toast(`<span class="badge-toast">${b.icon}</span> <b>Badge earned: ${esc(b.name)}</b><br><small>${esc(b.how)}</small>`, 'good', 6000);
  renderBadges();
  save();
}

function checkLessonBadges() {
  const done = LESSONS.filter(lessonComplete);
  if (done.length >= 1) award('first-lesson');
  if (done.length >= 5) award('five-lessons');
  if (LESSONS.filter(l => l.level === 'Basics').every(lessonComplete)) award('basics');
  if (done.filter(l => l.level === 'Projects').length >= 3) award('projects');
  if (done.length === LESSONS.length) award('all-lessons');
}

function renderBadges() {
  const earned = BADGES.filter(b => saved.badges[b.id]).length;
  $('badge-count').textContent = `🏅 ${earned}`;
  $('badges-pop').innerHTML = `
    <h4>Badges · ${earned} of ${BADGES.length}</h4>
    <div class="badge-grid">${BADGES.map(b => `<div class="badge ${saved.badges[b.id] ? 'on' : ''}" title="${esc(b.how)}">
      <span class="b-icon">${saved.badges[b.id] ? b.icon : '🔒'}</span><b>${esc(b.name)}</b><small>${esc(b.how)}</small></div>`).join('')}</div>`;
}

$('progress-card').addEventListener('click', e => {
  e.stopPropagation();
  const pop = $('badges-pop');
  pop.hidden = !pop.hidden;
  $('progress-card').setAttribute('aria-expanded', String(!pop.hidden));
});
document.addEventListener('click', e => {
  if (!(e.target as HTMLElement).closest('.progress-wrap')) $('badges-pop').hidden = true;
});

// ---------- build it for real ----------
const modal = $('modal');
function openBuildSheet() {
  award('maker');
  const title = mode === 'lessons' ? lesson.title : activeProject().name;
  $('modal-card').innerHTML = buildSheetHtml(title, world.parts, world.wires, editor.value);
  modal.hidden = false;
  $('modal-card').querySelector<HTMLButtonElement>('[data-bs="print"]')?.focus();
}
function closeModal() { modal.hidden = true; }
modal.addEventListener('click', e => {
  if (e.target === modal) return closeModal();
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-bs]')?.dataset.bs;
  if (act === 'close') closeModal();
  if (act === 'print') window.print();
  if (act === 'copy') {
    navigator.clipboard?.writeText(editor.value).then(() => toast('Code copied.', 'good', 2500), () => toast('Couldn’t reach the clipboard; select the code and copy it instead.', 'hint'));
  }
  if (act === 'download') {
    const name = (mode === 'lessons' ? lesson.title : activeProject().name).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '_') || 'sketch';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain' }));
    a.download = `${name}.cpp`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
});
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

// ---------- projects ----------
function newProjectEntry(name: string, scene: SavedScene): Project {
  return { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name, updated: Date.now(), scene };
}

function activeProject(): Project {
  let p = saved.projects.find(x => x.id === saved.projectId);
  if (!p) {
    p = saved.projects[0] ?? newProjectEntry('My first project', saved.sandbox ?? DEFAULT_SANDBOX);
    if (!saved.projects.includes(p)) saved.projects.push(p);
    saved.projectId = p.id;
  }
  return p;
}

/** Add a project, make it current and show it in the sandbox. */
function createProject(name: string, scene: SavedScene) {
  stop();
  snapshotScene();
  const p = newProjectEntry(name, scene);
  saved.projects.push(p);
  saved.projectId = p.id;
  if (mode !== 'sandbox') setMode('sandbox');
  else openSandbox();
  save();
}

function nextName(): string {
  for (let i = saved.projects.length + 1; ; i++) {
    const n = `Project ${i}`;
    if (!saved.projects.some(p => p.name === n)) return n;
  }
}

function timeAgo(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

// ---------- share by link ----------
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function pack(data: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function unpack(s: string): Promise<any> {
  const stream = new Blob([unb64url(s)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

async function shareProject() {
  snapshotScene();
  const p = activeProject();
  const data = { v: 1, name: p.name, code: p.scene.code, parts: p.scene.parts.map(({ locked: _l, ...rest }) => rest), wires: p.scene.wires };
  const url = `${location.origin}${location.pathname}#p=${await pack(data)}`;
  award('sharer');
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch { /* clipboard blocked */ }
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  toast(
    `${copied ? '<b>Link copied!</b> ' : ''}Anyone who opens it gets their own copy of “${esc(p.name)}”.` +
      `${local ? '<br><small>This link points at your own computer, so it only works for others once Builder is online.</small>' : ''}` +
      `<input class="share-url" readonly value="${esc(url)}" aria-label="Share link">`,
    'good', 12000,
  );
  document.querySelector<HTMLInputElement>('.share-url')?.select();
}

/** Open a project someone shared (the #p= part of the URL) as a new project. */
async function openSharedFromUrl(): Promise<boolean> {
  const m = location.hash.match(/^#p=([\w-]+)$/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const d = await unpack(m[1]);
    if (typeof d.code !== 'string' || !Array.isArray(d.parts)) throw new Error('bad link');
    const parts = d.parts.filter((p: any) => p && typeof p.type === 'string' && PARTS[p.type]);
    if (!parts.some((p: any) => p.type === 'uno')) parts.unshift(DEFAULT_SANDBOX.parts[0]);
    createProject(`${String(d.name ?? 'Shared project').slice(0, 50)} (shared)`, { code: d.code, parts, wires: Array.isArray(d.wires) ? d.wires : undefined });
    toast('Opened a shared project. It’s your own copy, so change anything you like.', 'good', 6000);
    return true;
  } catch {
    toast('That share link is broken or incomplete.', 'error');
    return false;
  }
}

guideEl.addEventListener('change', e => {
  const sel = e.target as HTMLSelectElement;
  if (sel.dataset.act !== 'example' || !sel.value) return;
  const l = LESSONS.find(x => x.id === sel.value)!;
  createProject(l.title, { code: l.solution || l.code, parts: l.parts.map((p, i) => ({ id: `${l.id}-sb-${i}`, rot: 0, pins: {}, props: {}, ...p })) as SavedPart[] });
});

function exportProject() {
  snapshotScene();
  const p = activeProject();
  const blob = new Blob([JSON.stringify({ app: 'builder', version: 1, name: p.name, ...p.scene }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\w -]+/g, '').trim() || 'builder-project'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data.code !== 'string' || !Array.isArray(data.parts)) throw new Error('bad file');
      const parts = data.parts.filter((p: any) => p && typeof p.type === 'string' && PARTS[p.type]);
      if (!parts.some((p: any) => p.type === 'uno')) parts.unshift(DEFAULT_SANDBOX.parts[0]);
      createProject(typeof data.name === 'string' ? data.name : file.name.replace(/\.json$/i, ''), { code: data.code, parts, wires: Array.isArray(data.wires) ? data.wires : undefined });
      toast(`Imported <b>${esc(file.name)}</b>`, 'good', 3000);
    } catch {
      toast('That file isn’t a Builder project.', 'error');
    }
  };
  input.click();
}

// ---------- inspector ----------
function pinUsers(pin: number, except?: { part: Part; key: string }): string[] {
  const out: string[] = [];
  for (const p of world.parts) {
    for (const [k, v] of Object.entries(p.pins)) {
      if (v === pin && !(except && except.part === p && except.key === k)) out.push(PARTS[p.type].name);
    }
  }
  return out;
}

const wiresAt = (ep: string) => world.wires.filter(w => w.a === ep || w.b === ep);

function renderInspector() {
  const wire = world.selectedWire;
  if (wire) { renderWireInspector(wire); return; }
  const part = world.selected;
  if (!part) { inspectorEl.hidden = true; return; }
  inspectorEl.hidden = false;
  const def = PARTS[part.type];
  const canDelete = mode === 'sandbox' && !part.locked;
  let html = `
    <div class="i-head">
      <img src="${partThumbnail(part.type, part.type === 'car' || part.type === 'led' || part.type === 'button' ? part.props : {})}" alt="">
      <div><h3>${esc(def.name)}</h3><p>${esc(def.blurb)}</p></div>
      <button class="mini ghost" data-act="close" aria-label="Close">×</button>
    </div>`;

  if (part.type === 'uno') {
    const used: string[] = [];
    for (let pin = 0; pin < 20; pin++) {
      const users = pinUsers(pin);
      if (users.length) used.push(`<li><span class="pin-chip" style="--c:${wireColor(pin)}">${pinName(pin)}${PWM_PINS.has(pin) ? '~' : ''}</span>${esc(users.join(', '))}</li>`);
    }
    html += `<h4>Pins in use</h4>${used.length ? `<ul class="pin-list">${used.join('')}</ul>` : '<p class="muted">Nothing connected yet.</p>'}`;
    if (world.issues.length) html += `<h4>Wiring problems</h4>${world.issues.map(i => `<div class="issue">${esc(i.text)}</div>`).join('')}`;
  }

  const missing: string[] = part.state.missing ?? [];
  if (missing.length) {
    html += `<div class="issue">Won't work yet: <b>${esc(missing.join(' and '))}</b> ${missing.length > 1 ? 'aren’t' : 'isn’t'} connected. Every part needs power to complete the circuit.</div>`;
  }

  const terms = def.terminals(part).filter(t => t.kind !== 'pass');
  if (terms.length) {
    html += `<h4>Wiring <span class="h-note">drag from a leg to a pin, or pick here</span></h4><div class="wiring">`;
    for (const t of terms) {
      const ep = endpoint(part.id, t.key);
      if (t.kind === 'pass') continue;
      if (t.kind !== 'signal') {
        const ok = !missing.includes(t.label);
        html += `<div class="wire-row"><span><i class="dot ${ok ? '' : 'off'}" style="${ok ? `background:${t.kind === '5V' ? '#d7263d' : '#2a2a2e'}` : ''}"></i>${esc(t.label)}</span>
          ${ok ? `<span class="fixed ${t.kind === '5V' ? 'v5' : 'gnd'}">${t.kind === '5V' ? '5V' : 'GND'} ✓</span>` : `<button class="mini" data-act="connect" data-key="${t.key}">Connect to ${t.kind === '5V' ? '5V' : 'GND'}</button>`}</div>`;
        continue;
      }
      const cur = part.pins[t.key];
      const opts = [`<option value="">— not connected —</option>`];
      for (let pin = 0; pin < 20; pin++) {
        if (t.analog && pin < 14) continue;
        const others = pinUsers(pin, { part, key: t.key });
        const label = `${pin < 14 ? 'Pin ' : ''}${pinName(pin)}${PWM_PINS.has(pin) ? ' ~' : ''}${others.length ? ` (used by ${others.join(', ')})` : ''}`;
        opts.push(`<option value="${pin}" ${cur === pin ? 'selected' : ''}>${esc(label)}</option>`);
      }
      const dangling = cur == null && wiresAt(ep).length > 0;
      const warn = cur != null && pinUsers(cur, { part, key: t.key }).length
        ? `<div class="warn">Pin ${pinName(cur)} is shared with ${esc(pinUsers(cur, { part, key: t.key }).join(', '))}</div>`
        : t.pwm && cur != null && !PWM_PINS.has(cur) ? `<div class="note">Tip: use a ~ pin to control brightness/speed with analogWrite()</div>`
        : t.analog && cur != null && cur < 14 ? `<div class="warn">This is an analog signal: wire it to A0–A5 to use analogRead()</div>`
        : dangling ? `<div class="note">Wired, but not to a board pin</div>`
        : cur == null ? `<div class="note">Not connected</div>` : '';
      html += `<div class="wire-row"><span>${cur != null ? `<i class="dot" style="background:${wireColor(cur)}"></i>` : '<i class="dot off"></i>'}${esc(t.label)}</span>
        <select data-pin="${t.key}">${opts.join('')}</select></div>${warn}`;
    }
    html += `</div>`;
  }

  if (def.props?.length) {
    html += `<h4>Settings</h4>`;
    for (const pd of def.props) {
      const v = part.props[pd.key];
      if (pd.type === 'select') {
        html += `<label class="field"><span>${esc(pd.label)}</span><select data-prop="${pd.key}">${pd.options!.map(o => `<option value="${esc(o.value)}" ${o.value === v ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      } else {
        html += `<label class="field"><span>${esc(pd.label)} <b data-val="${pd.key}">${v}${pd.unit ?? ''}</b></span><input type="range" data-prop="${pd.key}" min="${pd.min}" max="${pd.max}" step="${pd.step ?? 1}" value="${v}"></label>`;
      }
    }
  }
  const live = liveReadout(part);
  if (live) html += `<div class="live" data-live>${live}</div>`;
  html += `<div class="row">
    <button class="mini" data-act="rotate">Rotate <kbd>R</kbd></button>
    ${canDelete ? `<button class="mini danger" data-act="delete">Remove</button>` : ''}
  </div>`;
  inspectorEl.innerHTML = html;
}

function renderWireInspector(w: Wire) {
  inspectorEl.hidden = false;
  const colors = [...WIRE_COLORS, '#d7263d', '#2a2a2e', '#f4f1ea'];
  inspectorEl.innerHTML = `
    <div class="i-head wire-head">
      <span class="wire-swatch" style="background:${w.color}"></span>
      <div><h3>Wire</h3><p>${esc(endpointLabel(world.parts, w.a))}<br>→ ${esc(endpointLabel(world.parts, w.b))}</p></div>
      <button class="mini ghost" data-act="close" aria-label="Close">×</button>
    </div>
    <h4>Color</h4>
    <div class="swatches">${colors.map(c => `<button class="sw ${c === w.color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Wire color ${c}"></button>`).join('')}</div>
    <p class="muted">Tip: red for 5V and black for GND, like real builders do, makes circuits easy to check.</p>
    <div class="row"><button class="mini danger" data-act="delete-wire">Remove wire <kbd>Del</kbd></button></div>`;
}

function liveReadout(part: Part): string {
  const s = part.state;
  switch (part.type) {
    case 'ultrasonic': return s.distance != null ? `Sees an object at <b>${s.distance.toFixed(1)} cm</b>` : '';
    case 'servo': return `Angle: <b>${Math.round(s.angle ?? 90)}°</b>`;
    case 'pot': return `analogRead() ≈ <b>${part.props.value}</b>`;
    case 'ldr': return `analogRead() ≈ <b>${Math.round(15 + part.props.light * 9.5)}</b>`;
    case 'temp': return `analogRead() ≈ <b>${Math.round(((0.5 + part.props.temp / 100) / 5) * 1023)}</b>`;
    case 'button': return `State: <b>${s.pressed ? 'pressed' : 'released'}</b>`;
  }
  return PARTS[part.type].readout?.(part) ?? '';
}

// refresh live readouts without rebuilding the inspector (keeps focus on controls)
setInterval(() => {
  const p = world.selected;
  const el = inspectorEl.querySelector('[data-live]');
  if (p && el) el.innerHTML = liveReadout(p);
}, 150);

/** Replace whatever a part terminal is wired to with a single wire to a board socket. */
function quickConnect(part: Part, key: string, boardKey: string | null) {
  const uno = world.uno;
  const ep = endpoint(part.id, key);
  for (const w of wiresAt(ep)) world.wires = world.wires.filter(x => x !== w);
  if (boardKey == null || !uno) world.solveCircuit(true);
  else world.addWire(endpoint(uno.id, boardKey), ep);
}

inspectorEl.addEventListener('change', e => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const part = world.selected;
  if (!part) return;
  if (t.dataset.pin) {
    quickConnect(part, t.dataset.pin, t.value === '' ? null : t.value);
    renderInspector();
  } else if (t.dataset.prop && t.tagName === 'SELECT') {
    const before = new Set(PARTS[part.type].terminals(part).map(x => x.key));
    part.props[t.dataset.prop] = t.value;
    world.buildPart(part);
    world.syncListeners();
    world.pruneWires();
    // terminals that just appeared (e.g. button wiring mode) get wired to power for you
    const uno = world.uno;
    for (const term of PARTS[part.type].terminals(part)) {
      if (before.has(term.key) || term.kind === 'signal' || term.kind === 'pass' || !uno) continue;
      world.addWire(endpoint(uno.id, term.kind === '5V' ? '5V' : nearestGround(part, uno)), endpoint(part.id, term.key));
    }
    renderInspector();
  }
});

inspectorEl.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  const part = world.selected;
  if (!part || !t.dataset.prop || t.type !== 'range') return;
  part.props[t.dataset.prop] = Number(t.value);
  const pd = PARTS[part.type].props!.find(p => p.key === t.dataset.prop)!;
  const label = inspectorEl.querySelector(`[data-val="${t.dataset.prop}"]`);
  if (label) label.textContent = `${t.value}${pd.unit ?? ''}`;
  save();
});

inspectorEl.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-color]');
  if (!el) return;
  const wire = world.selectedWire;
  if (wire) {
    if (el.dataset.color) {
      wire.color = el.dataset.color;
      world.solveCircuit(false);
      renderInspector();
    }
    if (el.dataset.act === 'delete-wire') world.removeWire(wire);
    if (el.dataset.act === 'close') world.selectWire(null);
    return;
  }
  const part = world.selected;
  if (!part) return;
  const act = el.dataset.act;
  if (act === 'close') world.select(null);
  if (act === 'rotate') world.rotatePart(part);
  if (act === 'delete') world.removePart(part);
  if (act === 'connect' && world.uno) {
    const term = PARTS[part.type].terminals(part).find(t => t.key === el.dataset.key)!;
    world.addWire(endpoint(world.uno.id, term.kind === '5V' ? '5V' : nearestGround(part, world.uno)), endpoint(part.id, term.key));
    renderInspector();
  }
});

world.onSelect = () => renderInspector();
world.onWiresChanged = issues => {
  const added = world.wires.length - lastWireCount;
  lastWireCount = world.wires.length;
  if (added > 0 && !restoring) {
    saved.stats.wires += added;
    award('first-wire');
    if (saved.stats.wires >= 25) award('wire-25');
  }
  if (issues.some(i => i.key.startsWith('short'))) award('short');
  for (const i of issues) toast(esc(i.text), 'error', 9000);
  renderInspector();
};
world.onChange = () => {
  // knob drags and button presses change props; keep sliders in sync
  const p = world.selected;
  if (p) {
    for (const input of inspectorEl.querySelectorAll<HTMLInputElement>('input[type=range][data-prop]')) {
      const v = p.props[input.dataset.prop!];
      if (Number(input.value) !== v) {
        input.value = String(v);
        const pd = PARTS[p.type].props!.find(x => x.key === input.dataset.prop)!;
        const label = inspectorEl.querySelector(`[data-val="${input.dataset.prop}"]`);
        if (label) label.textContent = `${v}${pd.unit ?? ''}`;
      }
    }
  }
  save();
};

// ---------- tray ----------
function renderTray() {
  $('tray-label').textContent = mode === 'lessons' ? 'LESSONS' : 'PARTS';
  if (mode === 'lessons') {
    // lessons grouped by level, each card showing how many goals are done
    trayEl.innerHTML = LESSONS.map((l, i) => {
      const done = (saved.goals[l.id] ?? []).filter(Boolean).length;
      const sep = i === 0 || LESSONS[i - 1].level !== l.level ? `<div class="tray-sep"><span>${l.level}</span></div>` : '';
      return `${sep}
      <button class="tray-card ${l === lesson ? 'active' : ''} ${lessonComplete(l) ? 'complete' : ''}" data-lesson="${l.id}" title="${esc(l.title)}">
        <img src="${partThumbnail(l.icon, l.iconProps)}" alt="">
        <span class="tc-text"><small>${String(i + 1).padStart(2, '0')}</small>${esc(l.title.replace('Project: ', ''))}
          <em class="tc-goals">${done}/${l.goals.length} goals</em></span>
        ${lessonComplete(l) ? '<i class="check" aria-label="completed"></i>' : ''}
      </button>`;
    }).join('');
    // scroll only the tray (scrollIntoView would also scroll the page on phones)
    const active = trayEl.querySelector<HTMLElement>('.active');
    if (active) trayEl.scrollLeft = active.offsetLeft - trayEl.clientWidth / 2 + active.offsetWidth / 2;
  } else {
    trayEl.innerHTML = `
      <div class="tray-tools">
        <input class="tray-search" type="search" placeholder="Search parts…" aria-label="Search parts" value="${esc(partFilter.text)}">
        <div class="chips" role="group" aria-label="Part categories">
          ${['All', ...Object.keys(PART_CATEGORIES)].map(c => `<button class="chip" data-cat="${c}" aria-pressed="${partFilter.cat === c}">${c}</button>`).join('')}
        </div>
      </div>
      ${PALETTE.map(t => `
      <button class="tray-card part" data-add="${t}" data-name="${esc(`${PARTS[t].name} ${PARTS[t].blurb}`.toLowerCase())}" title="${esc(PARTS[t].blurb)}">
        <img src="${partThumbnail(t)}" alt="">
        <span>${esc(PARTS[t].name)}</span>
        <b class="plus">+</b>
      </button>`).join('')}
      <p class="tray-none" hidden>No parts match.</p>`;
    filterParts();
  }
}

// ---------- parts tray filtering ----------
const PART_CATEGORIES: Record<string, string[]> = {
  Lights: ['led', 'rgb', 'traffic', 'neopixel'],
  Inputs: ['button', 'keypad', 'pot', 'joystick'],
  Sensors: ['ldr', 'temp', 'dht', 'soil', 'pir', 'ultrasonic'],
  Displays: ['seg7', 'lcd', 'oled'],
  Motion: ['servo', 'stepper', 'motor', 'relay', 'buzzer'],
  Other: ['breadboard', 'car'],
};
const partFilter = { text: '', cat: 'All' };

function filterParts() {
  const words = partFilter.text.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  trayEl.querySelectorAll<HTMLElement>('.tray-card.part').forEach(card => {
    const inCat = partFilter.cat === 'All' || PART_CATEGORIES[partFilter.cat]?.includes(card.dataset.add!);
    const ok = inCat && words.every(w => card.dataset.name!.includes(w));
    card.hidden = !ok;
    if (ok) shown++;
  });
  const none = trayEl.querySelector<HTMLElement>('.tray-none');
  if (none) none.hidden = shown > 0;
  trayEl.querySelectorAll<HTMLElement>('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cat === partFilter.cat)));
}

trayEl.addEventListener('input', e => {
  const input = e.target as HTMLInputElement;
  if (!input.classList.contains('tray-search')) return;
  partFilter.text = input.value;
  filterParts();
});

trayEl.addEventListener('click', e => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.chip');
  if (chip) { partFilter.cat = chip.dataset.cat!; filterParts(); return; }
  const card = (e.target as HTMLElement).closest<HTMLElement>('.tray-card');
  if (!card) return;
  if (card.dataset.lesson) goLesson(LESSONS.find(l => l.id === card.dataset.lesson)!);
  if (card.dataset.add) {
    const part = newPart(card.dataset.add);
    world.addPart(part);
    world.placeFree(part);
    world.solveCircuit(false);
    world.select(part);
    save();
  }
});

// ---------- modes ----------
function openLesson(l: Lesson, fresh = false) {
  stop();
  lesson = l;
  saved.lessonId = l.id;
  const scene = fresh ? null : saved.lessons[l.id];
  loadParts(scene?.parts ?? l.parts, scene?.wires, l.id);
  editor.value = scene?.code ?? l.code;
  loadedKey = l.id;
  resetHistory();
  clearError();
  serialOut.textContent = '';
  world.editable = false;
  world.select(null);
  setTimeout(() => world.resetView()); // after the guide card sets the view inset
  setStatus('stopped', 'Stopped');
  clockEl.textContent = '0.00 s';
  renderGuide();
  renderTray();
  guideEl.querySelector('.g-body')?.scrollTo(0, 0);
  save();
}

function openSandbox() {
  stop();
  const scene = activeProject().scene;
  loadParts(scene.parts, scene.wires);
  editor.value = scene.code;
  loadedKey = 'sandbox';
  resetHistory();
  clearError();
  serialOut.textContent = '';
  world.editable = true;
  world.select(null);
  setTimeout(() => world.resetView()); // after the guide card sets the view inset
  setStatus('stopped', 'Stopped');
  clockEl.textContent = '0.00 s';
  renderGuide();
  renderTray();
  save();
}

function setMode(m: 'lessons' | 'sandbox') {
  if (m !== mode) {
    stop();
    snapshotScene();
  }
  mode = m;
  saved.mode = m;
  document.body.dataset.mode = m;
  document.querySelectorAll<HTMLButtonElement>('.modes button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  $('code-solution').hidden = m === 'sandbox';
  $('code-reset').hidden = m === 'sandbox';
  if (m === 'lessons') openLesson(lesson, false);
  else openSandbox();
}

document.querySelectorAll<HTMLButtonElement>('.modes button').forEach(b => {
  b.onclick = () => { if (b.dataset.mode !== mode) setMode(b.dataset.mode as any); };
});

// ---------- controls ----------
runBtn.onclick = () => run();
stopBtn.onclick = () => { stop(); world.board.reset(); };
editor.onInput = () => { clearError(); save(); };

$('code-reset').onclick = () => {
  if (editor.value !== lesson.code && !confirm('Replace your code with the starter code?')) return;
  editor.value = lesson.code;
  save();
};
$('code-solution').onclick = () => {
  if (!confirm('Show a working solution? This replaces your current code.')) return;
  editor.value = lesson.solution || lesson.code;
  save();
};
$('serial-clear').onclick = () => { world.board.serialOut = ''; serialOut.textContent = ''; plotter.clear(); };

// ---------- monitor / plotter / variables tabs ----------
const plotter = new Plotter($<HTMLCanvasElement>('plot'), $('plot-empty'));
const timeline = new Timeline($<HTMLCanvasElement>('timeline'), $('timeline-empty'));

/** Pins worth showing in the timeline: everything wired to a part, plus the built-in LED. */
function pinTracks(): Track[] {
  const byPin = new Map<number, string[]>();
  for (const p of world.parts) {
    for (const [key, pin] of Object.entries(p.pins)) {
      if (pin == null) continue;
      const t = PARTS[p.type].terminals(p).find(x => x.key === key);
      const name = `${PARTS[p.type].name}${t && Object.keys(p.pins).length > 1 ? ` ${t.label}` : ''}`;
      byPin.set(pin, [...(byPin.get(pin) ?? []), name]);
    }
  }
  if (world.board.pins[13].mode === 'OUTPUT' && !byPin.has(13)) byPin.set(13, ['built-in LED']);
  return [...byPin].sort((a, b) => a[0] - b[0]).map(([pin, names]) => ({ pin, label: names.join(', ') }));
}
let activeTab = 'monitor';
document.querySelectorAll<HTMLButtonElement>('.serial .tabs button').forEach(b => {
  b.onclick = () => {
    activeTab = b.dataset.tab!;
    document.querySelectorAll<HTMLButtonElement>('.serial .tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll<HTMLElement>('.serial .tab-body').forEach(el => { el.hidden = el.dataset.body !== activeTab; });
    plotter.visible = activeTab === 'plotter';
    timeline.visible = activeTab === 'pins';
    plotter.refresh();
    renderVars();
  };
});

function renderVars() {
  if (activeTab !== 'vars') return;
  const body = $('vars');
  const vars = interp?.variables() ?? [];
  if (!running || !vars.length) {
    body.innerHTML = `<tr><td class="muted" colspan="3">${running ? 'No variables yet.' : 'Run your sketch to watch its variables change. Pause to look closely.'}</td></tr>`;
    return;
  }
  body.innerHTML = vars.map(v => `<tr class="${v.local ? 'local' : ''}"><td><b>${esc(v.name)}</b><small>${esc(v.type)}${v.local ? ' · local' : ''}</small></td><td>${esc(v.value)}</td></tr>`).join('');
}
setInterval(renderVars, 200);

function setPaused(p: boolean) {
  paused = p;
  if (interp) interp.stepMode = false;
  $('step').hidden = !p;
  pauseBtn.querySelector('span')!.textContent = p ? 'Resume' : 'Pause';
  world.audio.muted = p || saved.muted;
  if (p) world.audio.silenceAll();
  if (running) setStatus(p ? 'stopped' : 'running', p ? 'Paused' : 'Running');
}
pauseBtn.onclick = () => { if (running) setPaused(!paused); };

/** Run exactly one statement, then stay paused. */
function stepOnce() {
  if (running && paused) award('debugger');
  if (!running || !paused || !gen || !interp) return;
  const b = world.board;
  interp.stepMode = true;
  interp.resetBudget();
  b.target = Infinity;
  try {
    gen.next();
  } catch (e) {
    if (e instanceof RuntimeError) {
      showError(e, 'Runtime');
      stop(true);
      setStatus('error', 'Crashed');
      return;
    }
    throw e;
  } finally {
    b.target = b.time;
    if (interp) interp.stepMode = false;
  }
  editor.setRunLine(interp.currentLine || null);
  if (interp.currentLine) editor.revealLine(interp.currentLine);
  clockEl.textContent = `${(b.time / 1000).toFixed(3)} s`;
  renderVars();
  checkGoals();
}
$('step').onclick = stepOnce;
$('serial-form').addEventListener('submit', e => {
  e.preventDefault();
  const input = $<HTMLInputElement>('serial-in');
  const text = input.value;
  if (!text) return;
  if (!running) { toast('Run the sketch first, then send text to it.', 'hint', 4000); return; }
  sentText.push(text);
  for (const ch of text + '\n') world.board.serialIn.push(ch.charCodeAt(0));
  input.value = '';
});
$('view-reset').onclick = () => world.resetView();
$('zoom-in').onclick = () => world.zoom(0.8);
$('zoom-out').onclick = () => world.zoom(1.25);
$('help').onclick = () => { $('help-pop').hidden = !$('help-pop').hidden; };

const muteBtn = $('mute');
function renderMute() {
  world.audio.muted = saved.muted;
  if (saved.muted) world.audio.silenceAll();
  muteBtn.innerHTML = saved.muted
    ? `<svg viewBox="0 0 20 20"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/><path d="M13.5 8l4 4M17.5 8l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 20 20"><path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  muteBtn.title = saved.muted ? 'Unmute sound' : 'Mute sound';
}
muteBtn.onclick = () => { saved.muted = !saved.muted; renderMute(); save(); };

window.addEventListener('keydown', e => {
  const inField = (e.target as HTMLElement).closest('input, textarea, select');
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
    return;
  }
  if (e.key === 'F10') { e.preventDefault(); if (running && !paused) setPaused(true); else stepOnce(); return; }
  if (inField) return;
  if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    e.preventDefault();
    restoreHistory(e.shiftKey || e.key.toLowerCase() === 'y' ? 1 : -1);
    return;
  }
  if (e.key === 'Escape') {
    if (world.isWiring) world.cancelWiring();
    else world.select(null);
    $('help-pop').hidden = true;
  }
  const wire = world.selectedWire;
  if (wire && (e.key === 'Delete' || e.key === 'Backspace')) { world.removeWire(wire); return; }
  const sel = world.selected;
  if (!sel) return;
  if (e.key === 'r' || e.key === 'R') world.rotatePart(sel);
  if ((e.key === 'Delete' || e.key === 'Backspace') && mode === 'sandbox' && !sel.locked) world.removePart(sel);
});

window.addEventListener('beforeunload', () => {
  snapshotScene();
  try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* ignore */ }
});

// ---------- theme ----------
const themeBtn = $('theme');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = saved.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  world.setTheme((t === 'auto' ? darkQuery.matches : t === 'dark') ? 'dark' : 'light');
  const icons = {
    auto: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.5" fill="currentColor"/><path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M4.3 15.7l1.6-1.6M14.1 5.9l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 20 20"><path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="currentColor"/></svg>',
  };
  themeBtn.innerHTML = icons[t];
  themeBtn.title = `Theme: ${t === 'auto' ? 'match system' : t} (click to change)`;
}
themeBtn.onclick = () => {
  saved.theme = saved.theme === 'auto' ? 'light' : saved.theme === 'light' ? 'dark' : 'auto';
  applyTheme();
  save();
};
darkQuery.addEventListener('change', () => { if (saved.theme === 'auto') applyTheme(); });

// ---------- graphics quality ----------
/** A sensible default for this device: phones and small-memory machines get the lighter modes. */
function autoQuality(): 'high' | 'balanced' | 'low' {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (coarse || innerWidth < 700) return 'low';
  if ((mem && mem <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4) return 'balanced';
  return 'high';
}
const QUALITY_NOTES = {
  high: 'Every effect: soft contact shadows, glow and coloured light from LEDs.',
  balanced: 'Glow and light spill, without contact shadows. Smoother on most laptops.',
  low: 'Simplest look, for phones and older computers.',
};
function applyQuality() {
  const q = saved.quality === 'auto' ? autoQuality() : saved.quality;
  world.setQuality(q);
  document.querySelectorAll<HTMLButtonElement>('#quality button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.q === saved.quality)));
  $('quality-note').textContent = (saved.quality === 'auto' ? `Auto picked ${q} for this device. ` : '') + QUALITY_NOTES[q];
}
$('quality').addEventListener('click', e => {
  const q = (e.target as HTMLElement).closest<HTMLElement>('[data-q]')?.dataset.q as Saved['quality'] | undefined;
  if (!q) return;
  saved.quality = q;
  applyQuality();
  save();
});
$('settings').onclick = e => {
  e.stopPropagation();
  const pop = $('settings-pop');
  pop.hidden = !pop.hidden;
  $('settings').setAttribute('aria-expanded', String(!pop.hidden));
};
document.addEventListener('click', e => {
  if (!(e.target as HTMLElement).closest('.settings-wrap')) $('settings-pop').hidden = true;
});

// ---------- tour ----------
function startTour() {
  $('help-pop').hidden = true;
  const q = (sel: string) => () => document.querySelector<HTMLElement>(sel);
  runTour([
    { target: q('#stage'), title: 'Your workbench', text: 'This is a 3D desk with a Builder One microcontroller board. <b>Drag</b> parts to move them, <b>drag empty space</b> to look around and <b>scroll</b> to zoom.' },
    { target: q('#stage'), title: 'Wire it up', text: 'Hover over a part’s leg until it glows, then <b>drag a wire</b> to a socket on the board. Every part needs power (5V) and ground (GND), just like the real thing. Click a wire to recolour or remove it.' },
    { target: q('#editor'), title: 'Write real code', text: 'This is real C++, the same kind you’d upload to a microcontroller. Start typing for <b>suggestions</b>, and hover any function to see what it does.' },
    { target: q('.run'), title: 'Run it', text: 'Press <b>Run</b> (or Ctrl/⌘ + Enter). The highlighted line shows what the board is doing right now. Mistakes get friendly explanations.' },
    { target: q('.tray'), title: 'Lessons and Sandbox', text: 'Work through the lessons and tick off each goal, or switch to <b>Sandbox</b> to build anything you like from the parts tray.' },
  ], () => { saved.toured = true; save(); });
}
$('tour-again').onclick = () => startTour();

// ---------- boot ----------
applyTheme();
applyQuality();
renderBadges();
renderMute();
renderProgress();
document.fonts?.ready.then(() => { if (mode === 'lessons') renderTray(); });
setMode(mode);
void openSharedFromUrl();
window.addEventListener('hashchange', () => void openSharedFromUrl());

if (import.meta.env.DEV) Object.assign(window, { world, editor });

if (!saved.toured) setTimeout(startTour, 600);

// works offline and can be installed as an app once it's been opened online
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      // files loaded before the worker took over (scripts, styles, fonts) go in the cache now,
      // so even the very first visit works offline next time
      const urls = performance.getEntriesByType('resource').map(e => e.name)
        .filter(u => u.startsWith(location.origin) || /fonts\.(googleapis|gstatic)\.com/.test(u));
      const cache = await caches.open('builder-v1');
      await Promise.all(urls.map(u => cache.add(u).catch(() => {})));
    } catch {
      // offline mode just isn't available here
    }
  });
}
