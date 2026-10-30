// A short first-visit tour: a spotlight on one part of the UI at a time.

export interface TourStep { target: () => HTMLElement | null; title: string; text: string }

export function runTour(steps: TourStep[], onDone: () => void) {
  const shade = document.createElement('div');
  shade.className = 'tour-spot';
  const card = document.createElement('div');
  card.className = 'tour-card card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-live', 'polite');
  document.body.append(shade, card);
  let i = 0;

  const finish = () => {
    shade.remove();
    card.remove();
    window.removeEventListener('resize', place);
    window.removeEventListener('keydown', key);
    onDone();
  };

  function place() {
    const step = steps[i];
    const el = step.target();
    const r = el?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0);
    const pad = 6;
    Object.assign(shade.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // put the card beside the target, wherever there's room
    const cw = Math.min(320, innerWidth - 24);
    card.style.width = `${cw}px`;
    const ch = card.offsetHeight;
    let left = r.right + 16, top = r.top;
    if (left + cw > innerWidth - 12) left = r.left - cw - 16;
    if (left < 12) { left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)); top = r.bottom + 16; }
    if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    if (top < 12) top = 12;
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  }

  function show() {
    const step = steps[i];
    card.innerHTML = `
      <div class="eyebrow">STEP ${i + 1} OF ${steps.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="row">
        <button class="mini ghost-text" data-t="skip">Skip tour</button>
        <span style="flex:1"></span>
        ${i > 0 ? '<button class="mini" data-t="back">Back</button>' : ''}
        <button class="mini primary" data-t="next">${i === steps.length - 1 ? 'Start building' : 'Next'}</button>
      </div>`;
    place();
    card.querySelector<HTMLButtonElement>('[data-t="next"]')!.focus();
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  }

  function go(d: number) {
    i += d;
    if (i >= steps.length) return finish();
    i = Math.max(0, i);
    show();
  }

  card.addEventListener('click', e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t;
    if (t === 'skip') finish();
    if (t === 'next') go(1);
    if (t === 'back') go(-1);
  });
  window.addEventListener('resize', place);
  window.addEventListener('keydown', key);
  show();
}
