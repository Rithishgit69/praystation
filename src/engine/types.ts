import type { Engine } from './Engine';

/** A system participates in the engine loop. Order of registration is update order. */
export interface System {
  readonly name: string;
  /** Variable-step update, once per rendered frame. `dt` is scaled by timeScale. */
  update?(dt: number, elapsed: number): void;
  /** Fixed-step update at 60 Hz, before the physics step. */
  fixedUpdate?(step: number): void;
  /** Runs after all `update`s, before rendering. Camera rigs live here. */
  lateUpdate?(dt: number): void;
  dispose?(): void;
}

/** A loadable scene: either the full game or an isolated debug/test scene. */
export interface SceneModule {
  readonly id: string;
  init(engine: Engine): Promise<void>;
  dispose(): void;
  /** True when a saved game can be resumed (title screen shows Continue). */
  canContinue?(): boolean;
  /** Called once the title card is dismissed. */
  start?(mode: 'new' | 'continue'): void;
}

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
export type InputDeviceKind = 'kbm' | 'gamepad' | 'touch';

export interface FrameStats {
  fps: number;
  frameMs: number;
  frameMsMax: number;
  physicsMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  heapMb: number;
  renderScale: number;
  spikes25ms: number;
  chunksLoaded: number;
  /** Worst single cooperative build step and worst attach (ms) seen this session. */
  streamStepMaxMs: number;
  streamAttachMaxMs: number;
  streamWorstStep: string;
}
