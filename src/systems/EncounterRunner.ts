import type { System } from '@/engine/types';

/** A present-day encounter (not a memory): start/update/dispose with a completion callback. */
export interface PresentEncounter {
  start(done: () => void): void;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

/** Runs at most one present-day encounter at a time (Chapter IV chase, Chapter VI confrontation, finale). */
export class EncounterRunner implements System {
  readonly name = 'encounters';
  private current: PresentEncounter | null = null;

  get active(): boolean {
    return this.current !== null;
  }

  run(e: PresentEncounter): void {
    if (this.current) this.current.dispose();
    this.current = e;
    e.start(() => {
      if (this.current === e) {
        e.dispose();
        this.current = null;
      }
    });
  }

  update(dt: number, elapsed: number): void {
    this.current?.update(dt, elapsed);
  }

  dispose(): void {
    this.current?.dispose();
    this.current = null;
  }
}
