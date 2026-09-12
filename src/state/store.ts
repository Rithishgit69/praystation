import { createStore } from 'zustand/vanilla';
import type { QualityTier } from '@/engine/types';

export type ChapterId = 'prologue' | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5' | 'ch6' | 'finale' | 'epilogue';
export type FlagValue = boolean | number | string;

export interface Settings {
  quality: QualityTier | 'auto';
  cinematicMode: boolean;
  hudAutoFade: boolean;
  lookSensitivity: number;
  invertY: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  analyticsOptIn: boolean;
  language: 'en';
}

export interface Inventory {
  consumables: number;
  hasScroll: boolean;
  hasBlade: boolean;
}

export interface Quest {
  title: string;
  objective: string;
}

/** Everything that must survive a save/load lives here (plus world placements in the SaveSystem). */
export interface GameState {
  chapter: ChapterId;
  quest: Quest;
  inventory: Inventory;
  flags: Record<string, FlagValue>;
  /** Memory ids completed, in order. */
  completedMemories: string[];
  /** Lore journal entries unlocked, by id. */
  journal: string[];
  activatedShrines: string[];
  settings: Settings;
  playTimeSec: number;
  setChapter(c: ChapterId): void;
  setQuest(q: Quest): void;
  setFlag(key: string, value: FlagValue): void;
  completeMemory(id: string): void;
  unlockJournal(id: string): void;
  activateShrine(id: string): void;
  setInventory(patch: Partial<Inventory>): void;
  setSettings(patch: Partial<Settings>): void;
  addPlayTime(sec: number): void;
  hydrate(snapshot: GameSnapshot): void;
}

export type GameSnapshot = Pick<GameState, 'chapter' | 'quest' | 'inventory' | 'flags' | 'completedMemories' | 'journal' | 'activatedShrines' | 'settings' | 'playTimeSec'>;

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  cinematicMode: false,
  hudAutoFade: true,
  lookSensitivity: 1,
  invertY: false,
  masterVolume: 1,
  musicVolume: 0.8,
  sfxVolume: 1,
  analyticsOptIn: false,
  language: 'en',
};

export const initialSnapshot = (): GameSnapshot => ({
  chapter: 'prologue',
  quest: { title: 'The Forgotten Temple', objective: 'Explore the temple' },
  inventory: { consumables: 3, hasScroll: true, hasBlade: true },
  flags: {},
  completedMemories: [],
  journal: [],
  activatedShrines: [],
  settings: { ...DEFAULT_SETTINGS },
  playTimeSec: 0,
});

export const gameStore = createStore<GameState>((set) => ({
  ...initialSnapshot(),
  setChapter: (chapter) => set({ chapter }),
  setQuest: (quest) => set({ quest }),
  setFlag: (key, value) => set((s) => ({ flags: { ...s.flags, [key]: value } })),
  completeMemory: (id) => set((s) => (s.completedMemories.includes(id) ? s : { completedMemories: [...s.completedMemories, id] })),
  unlockJournal: (id) => set((s) => (s.journal.includes(id) ? s : { journal: [...s.journal, id] })),
  activateShrine: (id) => set((s) => (s.activatedShrines.includes(id) ? s : { activatedShrines: [...s.activatedShrines, id] })),
  setInventory: (patch) => set((s) => ({ inventory: { ...s.inventory, ...patch } })),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  addPlayTime: (sec) => set((s) => ({ playTimeSec: s.playTimeSec + sec })),
  hydrate: (snap) => set({ ...snap, settings: { ...DEFAULT_SETTINGS, ...snap.settings } }),
}));

export const snapshotOf = (s: GameState): GameSnapshot => ({
  chapter: s.chapter,
  quest: { ...s.quest },
  inventory: { ...s.inventory },
  flags: { ...s.flags },
  completedMemories: [...s.completedMemories],
  journal: [...s.journal],
  activatedShrines: [...s.activatedShrines],
  settings: { ...s.settings },
  playTimeSec: s.playTimeSec,
});
