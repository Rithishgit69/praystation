import type { Engine } from '@/engine/Engine';
import type { AudioSystem } from '@/audio/AudioSystem';

export interface NarrationCardOptions {
  title: string;
  subtitle?: string;
  threat?: number;
  lines: string[];
  /** Called when the card is dismissed (all lines shown, or skipped). */
  onDone(): void;
}

/**
 * Dramatic narration: a dark card with the asura's name, a threat rating and the lines revealed one by
 * one with a typewriter effect, spoken by a deep synthesized voice (Web Speech API) over a low drone.
 * Any key / tap advances; the card ends on its own after the last line.
 */
export class Narration {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly threatEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private active: NarrationCardOptions | null = null;
  private lineIndex = 0;
  private typing = 0;
  private lineTimer = 0;
  private lineDuration = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'F1' || e.code === 'F3' || e.code === 'Backquote') return;
    this.advance();
  };
  private readonly onPointer = (): void => this.advance();

  constructor(
    private readonly engine: Engine,
    private readonly audio: AudioSystem,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'narration';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="narration-inner">
        <div class="narration-title"></div>
        <div class="narration-sub"></div>
        <div class="narration-threat"></div>
        <div class="narration-text"></div>
        <div class="narration-hint">press any key to continue</div>
      </div>`;
    engine.uiRoot.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T;
    this.titleEl = q('.narration-title');
    this.subEl = q('.narration-sub');
    this.threatEl = q('.narration-threat');
    this.textEl = q('.narration-text');
    this.hintEl = q('.narration-hint');
    this.pickVoice();
    if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
  }

  private pickVoice(): void {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    const prefer = ['Daniel', 'Google UK English Male', 'Microsoft David', 'Alex', 'Fred', 'Rishi', 'Aaron'];
    for (const name of prefer) {
      const v = voices.find((x) => x.name.includes(name));
      if (v) {
        this.voice = v;
        return;
      }
    }
    this.voice = voices.find((v) => v.lang.startsWith('en') && /male/i.test(v.name)) ?? voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null;
  }

  get isActive(): boolean {
    return this.active !== null;
  }

  show(opts: NarrationCardOptions): void {
    this.active = opts;
    this.lineIndex = 0;
    this.titleEl.textContent = opts.title;
    this.subEl.textContent = opts.subtitle ?? '';
    this.threatEl.innerHTML = opts.threat ? `Threat ${'★'.repeat(opts.threat)}${'☆'.repeat(5 - opts.threat)}` : '';
    this.root.hidden = false;
    this.engine.input.gameplayBlocked = true;
    this.engine.input.mouse.lockOnClick = false;
    this.engine.input.mouse.unlock();
    window.addEventListener('keydown', this.onKey);
    this.root.addEventListener('pointerdown', this.onPointer);
    this.audio.play('drone-loop', { volume: 0.35 });
    this.startLine();
  }

  private speak(text: string): void {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.82;
      u.pitch = 0.45;
      u.volume = 1;
      if (this.voice) u.voice = this.voice;
      speechSynthesis.speak(u);
    } catch {
      /* speech unavailable */
    }
  }

  private startLine(): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line === undefined) {
      this.finish();
      return;
    }
    this.typing = 0;
    this.lineTimer = 0;
    // Deep voice speaks at ~2.2 words/s; the card waits for the slower of speech and reading time.
    this.lineDuration = Math.max(2.8, line.split(' ').length / 2.0 + 1.2);
    this.textEl.textContent = '';
    this.textEl.classList.toggle('big', this.lineIndex === 0);
    this.hintEl.hidden = true;
    this.speak(line);
    this.audio.play('rumble', { volume: 0.35, rate: 0.6 });
  }

  advance(): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line !== undefined && this.typing < line.length) {
      // First press: finish typing the line.
      this.typing = line.length;
      this.textEl.textContent = line;
      this.lineTimer = Math.max(this.lineTimer, this.lineDuration - 0.8);
      return;
    }
    this.lineIndex++;
    this.startLine();
  }

  private finish(): void {
    const done = this.active?.onDone;
    this.active = null;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('pointerdown', this.onPointer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.audio.stop('drone-loop');
    this.engine.input.gameplayBlocked = this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
    done?.();
  }

  update(dt: number): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line === undefined) return;
    if (this.typing < line.length) {
      this.typing = Math.min(line.length, this.typing + dt * 42);
      this.textEl.textContent = line.slice(0, Math.floor(this.typing));
    } else {
      this.hintEl.hidden = false;
      this.lineTimer += dt;
      const speaking = 'speechSynthesis' in window && speechSynthesis.speaking;
      if (this.lineTimer >= this.lineDuration && !speaking) {
        this.lineIndex++;
        this.startLine();
      }
    }
  }

  dispose(): void {
    this.finish();
    this.root.remove();
  }
}
