// Nova on screen: the character, her speech-bubble pop-ups and the "Ask Nova" panel.
import { instructorSvg, type Mood } from './instructor-art';

export interface InstructorAction { label: string; run: () => void; primary?: boolean }
export interface InstructorReply { html: string; mood?: Mood; actions?: InstructorAction[]; chips?: string[] }
interface SayOptions { mood?: Mood; actions?: InstructorAction[]; duration?: number }

const SUGGESTIONS = ['What do I do next?', 'Why isn’t it working?', 'Explain this lesson', 'What is PWM?', 'How do I wire things?'];

export class Instructor {
  enabled = true;
  onAsk: (q: string) => InstructorReply = () => ({ html: '' });
  onOpen: () => void = () => {};
  lastSpoke = 0;

  private root: HTMLElement;
  private svg: SVGSVGElement;
  private bubble: HTMLElement;
  private panel: HTMLElement;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private hideTimer = 0;
  private photos: Partial<Record<Mood, string>> = {};
  private photo: HTMLImageElement | null = null;
  private talkTimer = 0;

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ins';
    this.root.innerHTML = `
      <div class="ins-bubble" role="status" aria-live="polite" hidden>
        <button class="ab-x" aria-label="Dismiss">×</button>
        <div class="ab-name">Nova</div>
        <div class="ab-text"></div>
        <div class="ab-actions"></div>
      </div>
      <section class="ins-panel" aria-label="Ask Nova" hidden>
        <header>
          <div><b>Ask Nova</b><small>Field engineer · mission control</small></div>
          <button class="ap-x mini ghost" aria-label="Close">×</button>
        </header>
        <div class="ins-log" aria-live="polite"></div>
        <div class="ins-chips"></div>
        <form class="ins-form">
          <input placeholder="Ask about code, parts or this lesson…" aria-label="Your question" autocomplete="off" maxlength="200">
          <button class="mini primary" type="submit">Ask</button>
        </form>
      </section>
      <button class="ins-figure" title="Ask Nova" aria-label="Ask Nova, your instructor">${instructorSvg()}</button>`;
    host.appendChild(this.root);
    this.svg = this.root.querySelector('svg')!;
    this.bubble = this.root.querySelector('.ins-bubble')!;
    this.panel = this.root.querySelector('.ins-panel')!;
    this.log = this.root.querySelector('.ins-log')!;
    this.input = this.root.querySelector('.ins-form input')!;

    this.root.querySelector('.ins-figure')!.addEventListener('click', () => this.togglePanel());
    this.root.querySelector('.ab-x')!.addEventListener('click', () => this.hideBubble());
    this.root.querySelector('.ap-x')!.addEventListener('click', () => this.togglePanel(false));
    this.root.querySelector('.ins-form')!.addEventListener('submit', e => {
      e.preventDefault();
      const q = this.input.value.trim();
      if (!q) return;
      this.input.value = '';
      this.ask(q);
    });
    this.panel.addEventListener('click', e => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-chip]');
      if (chip) this.ask(chip.dataset.chip!);
    });
    this.renderChips(SUGGESTIONS);
    this.blinkLoop();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.root.hidden = !on;
    if (!on) { this.hideBubble(); this.togglePanel(false); }
  }

  get panelOpen() { return !this.panel.hidden; }

  /** Pop up a speech bubble. Messages with buttons stay until dismissed. */
  say(html: string, opts: SayOptions = {}) {
    if (!this.enabled) return;
    this.lastSpoke = Date.now();
    clearTimeout(this.hideTimer);
    // while the panel is open, everything goes into the conversation instead
    if (this.panelOpen) {
      this.addMessage('nova', html, opts.actions);
      this.speak(opts.mood ?? 'happy');
      return;
    }
    this.bubble.querySelector('.ab-text')!.innerHTML = html;
    this.renderActions(this.bubble.querySelector('.ab-actions')!, opts.actions, () => this.hideBubble());
    this.bubble.hidden = false;
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
    this.speak(opts.mood ?? 'happy');
    const ms = opts.duration ?? (opts.actions?.length ? 22000 : Math.min(14000, 4500 + html.length * 35));
    this.hideTimer = window.setTimeout(() => this.hideBubble(), ms);
  }

  hideBubble() {
    this.bubble.hidden = true;
  }

  togglePanel(open = this.panel.hidden) {
    this.panel.hidden = !open;
    this.root.classList.toggle('open', open);
    if (open) {
      this.hideBubble();
      if (!this.log.children.length) {
        this.addMessage('nova', 'Nova here. Ask me about your code, a part, an error, or your next objective. Or tap one of the questions below.');
      }
      this.onOpen();
      setTimeout(() => this.input.focus(), 50);
    }
  }

  ask(q: string) {
    if (!this.panelOpen) this.togglePanel(true);
    this.addMessage('you', q.replace(/</g, '&lt;'));
    this.speak('think');
    // a short pause feels like she's thinking it over
    setTimeout(() => {
      const r = this.onAsk(q);
      this.addMessage('nova', r.html, r.actions);
      this.speak(r.mood ?? 'happy');
      if (r.chips?.length) this.renderChips(r.chips);
    }, 350);
  }

  /** Animate her mouth for a moment, then settle on a mood. */
  speak(mood: Mood) {
    clearInterval(this.talkTimer);
    let n = 0;
    this.root.classList.add('talking');
    this.talkTimer = window.setInterval(() => {
      this.setMood(n % 2 ? 'talk' : mood === 'talk' ? 'happy' : mood);
      if (++n > 7) {
        clearInterval(this.talkTimer);
        this.setMood(mood === 'talk' ? 'happy' : mood);
        this.root.classList.remove('talking');
      }
    }, 150);
  }

  private setMood(mood: Mood) {
    this.svg.dataset.mood = mood;
    if (this.photo) {
      // photos come in four moods; the others borrow the closest one
      const pick = this.photos[mood] ?? this.photos[mood === 'cheer' || mood === 'wow' ? 'happy' : 'think'] ?? this.photos.happy!;
      if (this.photo.getAttribute('src') !== pick) this.photo.src = pick;
    }
  }

  /**
   * Use realistic renders instead of the drawing when they exist: <base>/happy.png (required),
   * plus optional talk.png, think.png and concern.png. Missing files just keep the drawing.
   */
  usePhotos(base: string) {
    const moods: Mood[] = ['happy', 'talk', 'think', 'concern'];
    for (const m of moods) {
      const url = `${base}/${m}.png`;
      const img = new Image();
      img.onload = () => {
        this.photos[m] = url;
        if (m === 'happy' && !this.photo) {
          this.photo = document.createElement('img');
          this.photo.alt = '';
          this.photo.src = url;
          const fig = this.root.querySelector('.ins-figure')!;
          fig.classList.add('photo-mode');
          fig.appendChild(this.photo);
        }
      };
      img.src = url;
    }
  }

  private addMessage(who: 'nova' | 'you', html: string, actions?: InstructorAction[]) {
    const m = document.createElement('div');
    m.className = `msg ${who}`;
    m.innerHTML = `<div class="msg-text">${html}</div>`;
    if (actions?.length) {
      const row = document.createElement('div');
      row.className = 'ab-actions';
      this.renderActions(row, actions);
      m.appendChild(row);
    }
    this.log.appendChild(m);
    this.log.scrollTop = this.log.scrollHeight;
  }

  private renderActions(el: Element, actions: InstructorAction[] = [], after?: () => void) {
    el.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = `mini${a.primary ? ' primary' : ''}`;
      b.textContent = a.label;
      b.onclick = () => { a.run(); after?.(); };
      el.appendChild(b);
    }
  }

  private renderChips(chips: string[]) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    this.panel.querySelector('.ins-chips')!.innerHTML = chips.map(c => `<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  }

  private blinkLoop() {
    const eyes = this.root.querySelector<SVGGElement>('.ins-eyes')!;
    const blink = () => {
      eyes.classList.add('blink');
      setTimeout(() => eyes.classList.remove('blink'), 140);
      setTimeout(blink, 2500 + Math.random() * 3500);
    };
    setTimeout(blink, 2000);
  }
}
