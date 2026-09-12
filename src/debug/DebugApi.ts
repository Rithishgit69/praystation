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
  };
  window.__eka = api;
  engine.events.on('sceneloaded', (id) => {
    api.sceneId = id;
    api.ready = true;
  });
  return api;
};
