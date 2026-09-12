import { describe, expect, it } from 'vitest';
import chapters from '@data/chapters/chapters.json';
import puzzles from '@data/puzzles/puzzles.json';
import lines from '@data/dialogue/lines.json';
import lore from '@data/lore/entries.json';

interface Ch {
  id: string;
  objectives: Array<{ doneFlag: string }>;
  journal: string[];
  memory?: { enterLine?: string; returnLine?: string; afterLine?: string; journal: string[]; doors: string[] };
}
interface Pz {
  id: string;
  anchors: string[];
  solution: number[];
  reward: { journal: string[]; line?: string };
}
const lineIds = new Set((lines as Array<{ id: string }>).map((l) => l.id));
const loreIds = new Set((lore as Array<{ id: string }>).map((l) => l.id));

describe('content data', () => {
  it('chapters reference existing lines and lore', () => {
    for (const c of chapters as Ch[]) {
      for (const j of c.journal) expect(loreIds.has(j), `${c.id} journal ${j}`).toBe(true);
      const m = c.memory;
      if (!m) continue;
      for (const l of [m.enterLine, m.returnLine, m.afterLine]) if (l) expect(lineIds.has(l), `${c.id} line ${l}`).toBe(true);
      for (const j of m.journal) expect(loreIds.has(j), `${c.id} memory journal ${j}`).toBe(true);
    }
  });
  it('every chapter has an Inspirations note or is the prologue/epilogue', () => {
    const inspirations = (lore as Array<{ id: string; inspiration?: boolean; chapter: string }>).filter((l) => l.inspiration);
    for (const c of chapters as Ch[]) {
      if (c.id === 'prologue' || c.id === 'epilogue') continue;
      expect(c.journal.some((j) => inspirations.some((i) => i.id === j)), `${c.id} inspirations note`).toBe(true);
    }
  });
  it('puzzle solutions index their anchors and rewards reference lines', () => {
    for (const p of puzzles as Pz[]) {
      for (const s of p.solution) expect(s, `${p.id} solution`).toBeLessThan(Math.max(p.anchors.length, 8));
      if (p.reward.line) expect(lineIds.has(p.reward.line), `${p.id} line`).toBe(true);
      for (const j of p.reward.journal) expect(loreIds.has(j), `${p.id} journal`).toBe(true);
    }
  });
  it('objective flags are unique within a chapter', () => {
    for (const c of chapters as Ch[]) {
      const flags = c.objectives.map((o) => o.doneFlag);
      expect(new Set(flags).size).toBe(flags.length);
    }
  });
});
