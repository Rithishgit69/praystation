import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import dialogueData from '@data/dialogue/lines.json';

export interface DialogueLine {
  id: string;
  speaker: 'traveller' | 'temple' | 'narration';
  text: string;
  seconds: number;
}

const LINES = dialogueData as DialogueLine[];

/** Sparse subtitle lines (inner voice / inscriptions). Queue-based; never blocks input. */
export class Subtitles implements System {
  readonly name = 'subtitles';
  private readonly root: HTMLDivElement;
  private readonly speakerEl: HTMLSpanElement;
  private readonly textEl: HTMLSpanElement;
  private queue: DialogueLine[] = [];
  private remaining = 0;

  constructor(engine: Engine) {
    this.root = document.createElement('div');
    this.root.className = 'subtitles';
    this.root.hidden = true;
    this.root.innerHTML = '<span class="subtitle-speaker"></span><span class="subtitle-text"></span>';
    this.speakerEl = this.root.querySelector('.subtitle-speaker') as HTMLSpanElement;
    this.textEl = this.root.querySelector('.subtitle-text') as HTMLSpanElement;
    engine.uiRoot.appendChild(this.root);
  }

  /** Enqueue a line by id from data/dialogue/lines.json. */
  say(id: string): void {
    const line = LINES.find((l) => l.id === id);
    if (line) this.queue.push(line);
  }
  sayText(text: string, seconds = 3.5, speaker: DialogueLine['speaker'] = 'narration'): void {
    this.queue.push({ id: `inline:${text}`, speaker, text, seconds });
  }
  clear(): void {
    this.queue = [];
    this.remaining = 0;
    this.root.hidden = true;
  }

  update(dt: number): void {
    if (this.remaining > 0) {
      this.remaining -= dt;
      if (this.remaining <= 0) this.root.hidden = true;
      return;
    }
    const next = this.queue.shift();
    if (!next) return;
    this.speakerEl.textContent = next.speaker === 'traveller' ? '' : next.speaker === 'temple' ? '— ' : '';
    this.speakerEl.hidden = next.speaker !== 'temple';
    this.textEl.textContent = next.text;
    this.root.classList.toggle('temple', next.speaker === 'temple');
    this.root.hidden = false;
    this.remaining = next.seconds;
  }

  dispose(): void {
    this.root.remove();
  }
}
