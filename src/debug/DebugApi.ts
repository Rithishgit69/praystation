import type { Engine } from '@/engine/Engine';
import type { FrameStats } from '@/engine/types';

/** Test-facing hooks used by Playwright smoke/perf tests and the screenshot harness. */
export interface EkaDebugApi {
  /** The live engine (dev/test inspection only). */
  engine: Engine;
  ready: boolean;
  sceneId: string;
  stats(): FrameStats;
  frameMsEma(): number;
  /** Feet position of the player if a player exists in the current scene. */
  playerPosition(): { x: number; y: number; z: number } | null;
  cameraPosition(): { x: number; y: number; z: number };
  key(code: string, down: boolean): void;
  setTimeScale(v: number): void;
  /** Registered by scenes that own a player. */
  playerProvider: (() => { x: number; y: number; z: number }) | null;
  /** Registered by scenes that own a camera rig. */
  cameraControl: { setYawPitch(yaw: number, pitch: number): void } | null;
  setCamera(yaw: number, pitch: number): void;
  /** Registered by the world scene: move the player and load the surroundings synchronously. */
  teleport: ((x: number, y: number, z: number) => void) | null;
  /** Fire the focused interaction; returns the anchor id or null. */
  interact: (() => string | null) | null;
  flags: (() => Record<string, boolean | number | string>) | null;
  setFlag: ((key: string, value: boolean | number | string) => void) | null;
  save: (() => boolean) | null;
  anchors: (() => Array<{ id: string; kind: string; x: number; y: number; z: number }>) | null;
  portal: { inMemory(): boolean } | null;
  encounter: (() => Record<string, unknown>) | null;
  slowSteps: (() => Array<{ key: string; step: number; ms: number; mark: string }>) | null;
  /** Focused anchor id, moon state, zone: for scripted tests. */
  probe: (() => Record<string, unknown>) | null;
  activateShrine: ((id: string) => void) | null;
  clearSubtitles: (() => void) | null;
  playerState: (() => Record<string, unknown>) | null;
  mission: (() => Record<string, unknown>) | null;
  missionSkipNarration: (() => void) | null;
  missionDamageBoss: ((n: number) => void) | null;
  missionHurtPlayer: ((n: number) => void) | null;
  missionMenuChoose: ((i: number) => void) | null;
  missionVoice: (() => Record<string, unknown>) | null;
  missionAttack: ((kind: string) => void) | null;
  heroVariant: (() => string) | null;
  gun: (() => Record<string, unknown>) | null;
  missionHold: ((seconds: number) => void) | null;
}

declare global {
  interface Window {
    __eka?: EkaDebugApi;
  }
}

export const installDebugApi = (engine: Engine): EkaDebugApi => {
  const api: EkaDebugApi = {
    engine,
    ready: false,
    sceneId: '',
    stats: () => engine.profiler.stats,
    frameMsEma: () => engine.profiler.frameMsEma,
    playerPosition: () => (api.playerProvider ? api.playerProvider() : null),
    cameraPosition: () => ({ x: engine.camera.position.x, y: engine.camera.position.y, z: engine.camera.position.z }),
    key: (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })),
    setTimeScale: (v) => (engine.timeScale = v),
    playerProvider: null,
    cameraControl: null,
    setCamera: (yaw, pitch) => api.cameraControl?.setYawPitch(yaw, pitch),
    teleport: null,
    interact: null,
    flags: null,
    setFlag: null,
    save: null,
    anchors: null,
    portal: null,
    encounter: null,
    slowSteps: null,
    probe: null,
    activateShrine: null,
    clearSubtitles: null,
    playerState: null,
    mission: null,
    missionSkipNarration: null,
    missionDamageBoss: null,
    missionHurtPlayer: null,
    missionMenuChoose: null,
    missionVoice: null,
    missionAttack: null,
    heroVariant: null,
    gun: null,
    missionHold: null,
  };
  window.__eka = api;
  engine.events.on('sceneloaded', (id) => {
    api.sceneId = id;
    api.ready = true;
  });
  return api;
};
