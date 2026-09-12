import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { gameStore, type ChapterId } from '@/state/store';
import chaptersData from '@data/chapters/chapters.json';
import type { Journal } from '@/ui/Journal';
import type { Subtitles } from '@/ui/Subtitles';

export interface ObjectiveDef {
  id: string;
  text: string;
  doneFlag: string;
}

export interface MemoryDef {
  id: string;
  trigger: string;
  zone: string;
  spawn: [number, number, number, number];
  requiresFlag?: string;
  completionFlag: string;
  doors: string[];
  journal: string[];
  enterLine?: string;
  returnLine?: string;
  afterLine?: string;
}

export interface ChapterDef {
  id: ChapterId;
  title: string;
  questTitle: string;
  objectives: ObjectiveDef[];
  memory?: MemoryDef;
  journal: string[];
}

export const CHAPTERS = chaptersData as ChapterDef[];
export const chapterById = (id: ChapterId): ChapterDef | undefined => CHAPTERS.find((c) => c.id === id);
export const memoryByTrigger = (trigger: string): MemoryDef | undefined => CHAPTERS.map((c) => c.memory).find((m) => m?.trigger === trigger);

export type LoopState = 'EXPLORE' | 'OBSERVE' | 'INTERACT' | 'ENTER_MEMORY' | 'SOLVE' | 'DISCOVER_CLUE' | 'RETURN' | 'UNLOCK';

/**
 * The core loop as a real state machine (GDD §6) plus chapter/objective tracking from data. Other
 * systems report transitions; this manager keeps the quest tracker honest and advances chapters when
 * every objective flag is set. Knowledge-based: objectives are flags, never items.
 */
export class ChapterManager implements System {
  readonly name = 'chapters';
  loop: LoopState = 'EXPLORE';
  private readonly onLoopChange = new Set<(s: LoopState) => void>();
  private lastObjectiveText = '';

  constructor(
    private readonly engine: Engine,
    private readonly journal: Journal,
    private readonly subtitles: Subtitles,
  ) {}

  setLoop(s: LoopState): void {
    if (s === this.loop) return;
    this.loop = s;
    for (const fn of this.onLoopChange) fn(s);
  }
  onLoop(fn: (s: LoopState) => void): () => void {
    this.onLoopChange.add(fn);
    return () => this.onLoopChange.delete(fn);
  }

  /** Mark a story beat flag and optionally speak a line once. */
  beat(flag: string, line?: string): boolean {
    const s = gameStore.getState();
    if (s.flags[flag] === true) return false;
    s.setFlag(flag, true);
    if (line) this.subtitles.say(line);
    return true;
  }

  get chapter(): ChapterDef {
    return chapterById(gameStore.getState().chapter) ?? (CHAPTERS[0] as ChapterDef);
  }

  update(): void {
    const s = gameStore.getState();
    const ch = this.chapter;
    for (const j of ch.journal) this.journal.unlock(j);
    const pending = ch.objectives.find((o) => s.flags[o.doneFlag] !== true);
    const text = pending ? pending.text : ch.objectives.length === 0 ? '' : 'Chapter complete';
    if (s.quest.title !== ch.questTitle || s.quest.objective !== text) s.setQuest({ title: ch.questTitle, objective: text });
    if (text !== this.lastObjectiveText) {
      this.lastObjectiveText = text;
      this.engine.input.lastActivityTime = performance.now(); // wake the HUD so the new objective is seen
    }
    if (!pending && ch.objectives.length > 0) {
      const i = CHAPTERS.indexOf(ch);
      const next = CHAPTERS[i + 1];
      if (next) {
        s.setChapter(next.id);
        this.setLoop('EXPLORE');
      }
    }
  }
}
