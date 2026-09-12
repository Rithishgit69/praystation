import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { gameStore } from '@/state/store';
import loreData from '@data/lore/entries.json';

export interface LoreEntry {
  id: string;
  title: string;
  chapter: string;
  body: string;
  /** Marks the per-chapter "Inspirations" note (GDD §25). */
  inspiration?: boolean;
}

const ENTRIES = loreData as LoreEntry[];
export const loreEntry = (id: string): LoreEntry | undefined => ENTRIES.find((e) => e.id === id);

/** Optional lore journal (J / Y). Lists unlocked entries grouped by chapter; never gates progress. */
export class Journal implements System {
  readonly name = 'journal';
  private readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private visible = false;
  private selected: string | null = null;
  private readonly unsub: () => void;

  constructor(private readonly engine: Engine) {
    this.root = document.createElement('div');
    this.root.className = 'journal menu';
    this.root.hidden = true;
    this.root.innerHTML = '<h2>Journal</h2><div class="journal-cols"><div class="journal-list"></div><div class="journal-body"></div></div><p class="hint">J / Y to close</p>';
    this.list = this.root.querySelector('.journal-list') as HTMLDivElement;
    this.body = this.root.querySelector('.journal-body') as HTMLDivElement;
    engine.uiRoot.appendChild(this.root);
    this.unsub = gameStore.subscribe(() => {
      if (this.visible) this.render();
    });
  }

  unlock(id: string): boolean {
    if (!loreEntry(id)) return false;
    const s = gameStore.getState();
    if (s.journal.includes(id)) return false;
    s.unlockJournal(id);
    return true;
  }

  private render(): void {
    const unlocked = gameStore.getState().journal;
    this.list.innerHTML = '';
    let lastChapter = '';
    for (const e of ENTRIES) {
      if (!unlocked.includes(e.id)) continue;
      if (e.chapter !== lastChapter) {
        const h = document.createElement('h3');
        h.textContent = e.chapter;
        this.list.appendChild(h);
        lastChapter = e.chapter;
      }
      const b = document.createElement('button');
      b.textContent = (e.inspiration ? '✦ ' : '') + e.title;
      b.classList.toggle('selected', e.id === this.selected);
      b.addEventListener('click', () => {
        this.selected = e.id;
        this.render();
      });
      this.list.appendChild(b);
    }
    if (!this.selected) this.selected = ENTRIES.find((e) => unlocked.includes(e.id))?.id ?? null;
    const sel = this.selected ? loreEntry(this.selected) : undefined;
    this.body.innerHTML = sel ? `<h3>${sel.title}</h3>${sel.body.split('\n').map((p) => `<p>${p}</p>`).join('')}` : '<p class="hint">Nothing recorded yet. The temple remembers what you notice.</p>';
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }
  setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
    this.engine.uiBlocking = v;
    this.engine.input.gameplayBlocked = v || this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = !v;
    if (v) {
      this.engine.input.mouse.unlock();
      this.render();
    }
  }

  update(): void {
    if (this.engine.input.pressed('journal')) this.toggle();
  }

  dispose(): void {
    this.unsub();
    this.root.remove();
  }
}
