import type { Engine } from '@/engine/Engine';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { Voice, VoiceHandle } from '@/audio/Voice';

export interface NarrationCardOptions {
  title: string;
  subtitle?: string;
  threat?: number;
  lines: string[];
  /** Voice line ids parallel to `lines` (pre-rendered clips); missing entries show text only. */
  voiceIds?: string[];
  /** Called when the card is dismissed (all lines shown, or skipped). */
  onDone(): void;
}

const TYPE_CPS_DEFAULT = 42;

/**
 * Dramatic narration: a dark card with the asura's name, a threat rating and the lines revealed one by
 * one with a typewriter effect, spoken by the narrator (pre-rendered neural voice) over a low drone.
 * The typewriter paces itself to each clip so the text lands with the voice. Any key / click advances;
 * the card ends on its own after the last line.
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
  private typeCps = TYPE_CPS_DEFAULT;
  private lineTimer = 0;
  private lineDuration = 0;
  private clip: VoiceHandle | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.code === 'F1' || e.code === 'F3' || e.code === 'Backquote' || e.code === 'Escape') return;
    if (e.code === 'Backspace') {
      this.skipAll(true);
      return;
    }
    this.advance(true);
  };
  private readonly onPointer = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('.narration-skip')) return;
    this.advance(true);
  };
  /** Called after a card is dismissed by a user gesture (so the mouse can be captured for play). */
  onGestureDismiss: (() => void) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly audio: AudioSystem,
    private readonly voice: Voice,
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
        <div class="narration-hint">press any key to continue · Backspace skips the introduction</div>
      </div>
      <button class="narration-skip" type="button">Skip introduction ▸</button>`;
    engine.uiRoot.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string): T => this.root.querySelector(s) as T;
    this.titleEl = q('.narration-title');
    this.subEl = q('.narration-sub');
    this.threatEl = q('.narration-threat');
    this.textEl = q('.narration-text');
    this.hintEl = q('.narration-hint');
    q<HTMLButtonElement>('.narration-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipAll(true);
    });
  }

  /** Skip the whole card (Backspace or the Skip button). */
  skipAll(gesture: boolean): void {
    if (!this.active) return;
    this.finish(gesture);
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
    this.audio.setChantDuck(true);
    if (opts.voiceIds) this.voice.preload(opts.voiceIds);
    this.startLine();
  }

  private startLine(): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line === undefined) {
      this.finish(false);
      return;
    }
    this.typing = 0;
    this.typeCps = TYPE_CPS_DEFAULT;
    this.lineTimer = 0;
    // Reading time; replaced by the clip length once the voice line is loaded.
    this.lineDuration = Math.max(2.8, line.split(' ').length / 2.6 + 1.2);
    this.textEl.textContent = '';
    this.textEl.classList.toggle('big', this.lineIndex === 0);
    this.hintEl.hidden = true;
    this.clip?.stop();
    this.clip = null;
    const id = this.active.voiceIds?.[this.lineIndex];
    if (id) {
      const index = this.lineIndex;
      const handle = this.voice.speak(id);
      this.clip = handle;
      void handle.loaded.then((seconds) => {
        if (this.clip !== handle || this.lineIndex !== index || seconds === null) return;
        // Land the last character just before the voice finishes.
        this.typeCps = Math.min(90, Math.max(24, line.length / Math.max(1, seconds * 0.9)));
        this.lineDuration = Math.max(this.lineDuration, seconds + 0.5);
      });
    }
    this.audio.play('rumble', { volume: 0.35, rate: 0.6 });
  }

  /** Advance: finish typing the current line first, then move on. `gesture` marks a key/click. */
  advance(gesture = false): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line !== undefined && this.typing < line.length) {
      this.typing = line.length;
      this.textEl.textContent = line;
      this.lineTimer = Math.max(this.lineTimer, this.lineDuration - 0.8);
      return;
    }
    this.lineIndex++;
    if (this.lineIndex >= this.active.lines.length) this.finish(gesture);
    else this.startLine();
  }

  private finish(gesture: boolean): void {
    const done = this.active?.onDone;
    this.active = null;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.root.removeEventListener('pointerdown', this.onPointer);
    this.clip?.stop();
    this.clip = null;
    this.audio.stop('drone-loop');
    this.audio.setChantDuck(false);
    this.engine.input.gameplayBlocked = this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
    if (gesture) this.onGestureDismiss?.();
    done?.();
  }

  update(dt: number): void {
    if (!this.active) return;
    const line = this.active.lines[this.lineIndex];
    if (line === undefined) return;
    if (this.typing < line.length) {
      this.typing = Math.min(line.length, this.typing + dt * this.typeCps);
      this.textEl.textContent = line.slice(0, Math.floor(this.typing));
    } else {
      this.hintEl.hidden = false;
      this.lineTimer += dt;
      const speaking = this.clip !== null && !this.clip.ended;
      // A clip that never reports its end (stalled download) must not hold the card hostage.
      if (this.lineTimer >= this.lineDuration && (!speaking || this.lineTimer >= this.lineDuration + 15)) this.advance(false);
    }
  }

  /** Test hook: the current line's voice clip state. */
  debugVoice(): Record<string, unknown> {
    return { line: this.lineIndex, hasClip: this.clip !== null, ended: this.clip?.ended ?? null, typeCps: this.typeCps, lineDuration: this.lineDuration };
  }

  dispose(): void {
    this.finish(false);
    this.root.remove();
  }
}
