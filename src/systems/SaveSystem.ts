import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { PlayerController } from '@/player/PlayerController';
import type { CameraRig } from '@/player/CameraRig';
import { gameStore, snapshotOf, type GameSnapshot } from '@/state/store';

export const SAVE_KEY = 'eka:save:v1';
const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameSnapshot;
  player: { x: number; y: number; z: number; yaw: number };
  camera: { yaw: number; pitch: number };
}

/**
 * Deterministic save/load. The world is rebuilt from flags, so a save is the store snapshot plus the
 * exact player and camera transform. Autosaves every 30 s, on tab hide, and on demand after key events.
 */
export class SaveSystem implements System {
  readonly name = 'save';
  private timer = 0;
  private readonly onHide = (): void => {
    if (document.hidden) this.save();
  };
  private dirty = false;

  constructor(
    private readonly engine: Engine,
    private readonly player: PlayerController,
    private readonly rig: CameraRig,
  ) {
    document.addEventListener('visibilitychange', this.onHide);
    gameStore.subscribe(() => (this.dirty = true));
  }

  static hasSave(): boolean {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch {
      return false;
    }
  }

  static read(): SaveFile | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SaveFile;
      if (parsed.version !== SAVE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  serialize(): SaveFile {
    const p = this.player.position;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      state: snapshotOf(gameStore.getState()),
      player: { x: p.x, y: p.y, z: p.z, yaw: this.player.facingYaw },
      camera: { yaw: this.rig.yaw, pitch: this.rig.pitch },
    };
  }

  save(): boolean {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      this.dirty = false;
      return true;
    } catch {
      return false;
    }
  }

  /** Restore a save into the running scene (store first, then transforms). */
  apply(file: SaveFile): void {
    gameStore.getState().hydrate(file.state);
    this.player.teleport(new THREE.Vector3(file.player.x, file.player.y, file.player.z), file.player.yaw);
    this.rig.setYawPitch(file.camera.yaw, file.camera.pitch);
  }

  update(dt: number): void {
    this.timer += dt;
    gameStore.getState().addPlayTime(dt);
    if (this.timer >= 30) {
      this.timer = 0;
      if (this.dirty || this.player.horizontalSpeed > 0.1) this.save();
    }
    void this.engine;
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onHide);
  }
}
