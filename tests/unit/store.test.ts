import { describe, expect, it } from 'vitest';
import { gameStore, initialSnapshot, snapshotOf } from '@/state/store';

describe('game store', () => {
  it('round-trips a snapshot through hydrate', () => {
    const s = gameStore.getState();
    s.setChapter('ch3');
    s.setFlag('door:hall-east', true);
    s.setFlag('mirror:0', 1.57);
    s.completeMemory('broken-tusk');
    s.unlockJournal('pro-temple');
    s.activateShrine('shrine:gate');
    s.setSettings({ cinematicMode: true, lookSensitivity: 1.4 });
    const snap = snapshotOf(gameStore.getState());
    const json = JSON.parse(JSON.stringify(snap)) as typeof snap;
    gameStore.getState().hydrate(initialSnapshot());
    expect(gameStore.getState().chapter).toBe('prologue');
    gameStore.getState().hydrate(json);
    const r = gameStore.getState();
    expect(r.chapter).toBe('ch3');
    expect(r.flags['door:hall-east']).toBe(true);
    expect(r.flags['mirror:0']).toBe(1.57);
    expect(r.completedMemories).toEqual(['broken-tusk']);
    expect(r.journal).toEqual(['pro-temple']);
    expect(r.activatedShrines).toEqual(['shrine:gate']);
    expect(r.settings.cinematicMode).toBe(true);
    expect(r.settings.lookSensitivity).toBe(1.4);
    expect(r.settings.analyticsOptIn).toBe(false);
  });
  it('does not duplicate memories or journal entries', () => {
    const s = gameStore.getState();
    s.hydrate(initialSnapshot());
    s.completeMemory('x');
    s.completeMemory('x');
    s.unlockJournal('y');
    s.unlockJournal('y');
    expect(gameStore.getState().completedMemories).toEqual(['x']);
    expect(gameStore.getState().journal).toEqual(['y']);
  });
});
