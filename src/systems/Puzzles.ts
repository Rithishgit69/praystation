import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { Anchor } from '@/world/WorldTypes';
import { gameStore } from '@/state/store';
import puzzleData from '@data/puzzles/puzzles.json';
import type { InteractionHandler, InteractionSystem } from './Interaction';
import type { DoorSystem } from './Doors';
import type { Journal } from '@/ui/Journal';
import type { Subtitles } from '@/ui/Subtitles';
import type { LightingStates, MoonState } from './LightingStates';
import gsap from 'gsap';

export type PuzzleType = 'symbol-sequence' | 'choose-real' | 'mirror-alignment' | 'observe' | 'rotation-match' | 'bell-sequence' | 'rangoli' | 'water-flow';

export interface PuzzleDef {
  id: string;
  type: PuzzleType;
  zone: string;
  anchors: string[];
  solution: number[];
  requiresMoon?: MoonState;
  /** The puzzle is inert (no prompts, no solve) until this flag is set. */
  requiresFlag?: string;
  clueText: string;
  reward: { flags: string[]; doors?: string[]; journal: string[]; line?: string };
}

export const PUZZLES = puzzleData as PuzzleDef[];

/**
 * Data-driven puzzle framework (GDD §16). Every type is grounded in temple objects that already exist as
 * anchors; solving sets flags, opens doors and unlocks journal entries. Progress is stored in flags so
 * a partially solved puzzle survives save/load.
 */
export class PuzzleSystem implements System {
  readonly name = 'puzzles';
  private readonly sequence = new Map<string, number[]>();
  readonly handlers = new Map<string, InteractionHandler>();

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly interaction: InteractionSystem,
    private readonly audio: AudioSystem,
    private readonly doors: DoorSystem,
    private readonly journal: Journal,
    private readonly subtitles: Subtitles,
    private readonly lighting: LightingStates,
  ) {
    for (const p of PUZZLES) this.bind(p);
  }

  isSolved(id: string): boolean {
    return gameStore.getState().flags[`puzzle-solved:${id}`] === true;
  }

  private ready(p: PuzzleDef): boolean {
    return !p.requiresFlag || gameStore.getState().flags[p.requiresFlag] === true;
  }

  private solve(p: PuzzleDef): void {
    if (!this.ready(p)) return;
    const s = gameStore.getState();
    s.setFlag(`puzzle-solved:${p.id}`, true);
    for (const f of p.reward.flags) s.setFlag(f, true);
    for (const j of p.reward.journal) this.journal.unlock(j);
    for (const d of p.reward.doors ?? []) this.doors.open(d);
    this.audio.play('symbol-chime', { volume: 0.8 });
    if (p.reward.line) this.subtitles.say(p.reward.line);
  }

  private fail(p: PuzzleDef): void {
    this.sequence.set(p.id, []);
    this.audio.play('ui-tick', { volume: 0.5, rate: 0.6 });
    this.subtitles.say('puzzle-wrong');
  }

  private bind(p: PuzzleDef): void {
    const index = (a: Anchor): number => p.anchors.indexOf(a.id);
    const register = (id: string, h: InteractionHandler): void => {
      const wrapped: InteractionHandler = { label: (a) => (this.ready(p) ? h.label(a) : null), onInteract: (a) => h.onInteract(a) };
      this.handlers.set(id, wrapped);
      this.interaction.register(id, wrapped);
    };
    switch (p.type) {
      case 'symbol-sequence':
      case 'bell-sequence':
        for (const id of p.anchors)
          register(id, {
            label: () => (this.isSolved(p.id) ? null : p.type === 'bell-sequence' ? 'Ring the bell' : 'Press the symbol'),
            onInteract: (a) => {
              const seq = this.sequence.get(p.id) ?? [];
              seq.push(index(a));
              this.sequence.set(p.id, seq);
              this.audio.play(p.type === 'bell-sequence' ? 'bell-near' : 'ui-open', { position: a.position, volume: 0.6, rate: 0.9 + index(a) * 0.08 });
              if (a.object) gsap.fromTo(a.object.scale, { y: 0.92 }, { y: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)' });
              const ok = seq.every((v, i) => v === p.solution[i]);
              if (!ok) this.fail(p);
              else if (seq.length === p.solution.length) this.solve(p);
            },
          });
        break;
      case 'choose-real':
      case 'observe':
        for (const id of p.anchors)
          register(id, {
            label: () => (this.isSolved(p.id) ? null : p.requiresMoon && this.lighting.moonState !== p.requiresMoon ? null : p.type === 'observe' ? 'Examine' : 'Touch'),
            onInteract: (a) => {
              if (p.solution.includes(index(a))) this.solve(p);
              else this.fail(p);
            },
          });
        break;
      case 'mirror-alignment':
      case 'rotation-match':
        for (const id of p.anchors)
          register(id, {
            label: () => (this.isSolved(p.id) ? null : p.type === 'mirror-alignment' ? 'Turn the mirror' : 'Turn the fragment'),
            onInteract: (a) => {
              const i = index(a);
              const key = p.type === 'mirror-alignment' ? `mirror:${i}` : `fragment:${i}`;
              const stepRad = p.type === 'mirror-alignment' ? Math.PI / 4 : Math.PI / 2;
              const cur = typeof gameStore.getState().flags[key] === 'number' ? (gameStore.getState().flags[key] as number) : a.object?.rotation.y ?? 0;
              const next = cur + stepRad;
              gameStore.getState().setFlag(key, next);
              if (a.object) gsap.to(a.object.rotation, { y: next, duration: 0.9, ease: 'power2.inOut' });
              this.audio.play('mirror-turn', { position: a.position, volume: 0.7 });
              // Solved when every anchor's rotation matches its solution step (mod full turn).
              const all = p.anchors.every((aid, k) => {
                const v = aid === a.id ? next : (gameStore.getState().flags[p.type === 'mirror-alignment' ? `mirror:${k}` : `fragment:${k}`] as number | undefined) ?? this.streamer.anchors.get(aid)?.object?.rotation.y ?? 0;
                const steps = Math.round(v / stepRad);
                const total = Math.round((Math.PI * 2) / stepRad);
                return ((steps % total) + total) % total === (((p.solution[k] as number) % total) + total) % total;
              });
              if (all && (!p.requiresMoon || this.lighting.moonState === p.requiresMoon)) this.solve(p);
            },
          });
        break;
      case 'rangoli':
      case 'water-flow':
        for (const id of p.anchors)
          register(id, {
            label: () => (this.isSolved(p.id) ? null : p.type === 'rangoli' ? 'Turn the tile' : 'Open the sluice'),
            onInteract: (a) => {
              const i = index(a);
              const key = `${p.id}:${i}`;
              const cur = (gameStore.getState().flags[key] as number | undefined) ?? 0;
              const next = (cur + 1) % 3;
              gameStore.getState().setFlag(key, next);
              this.audio.play('stone-grind', { position: a.position, volume: 0.4, rate: 1.4 });
              const all = p.anchors.every((_aid, k) => ((gameStore.getState().flags[`${p.id}:${k}`] as number | undefined) ?? 0) === p.solution[k]);
              if (all) this.solve(p);
            },
          });
        break;
    }
    void this.engine;
  }
}
