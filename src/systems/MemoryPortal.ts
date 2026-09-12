import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import type { WorldStreamer } from '@/world/WorldStreamer';
import { gameStore } from '@/state/store';
import type { MemoryDef } from './ChapterManager';
import type { LightingStates } from './LightingStates';
import type { DoorSystem } from './Doors';
import type { Journal } from '@/ui/Journal';
import type { Subtitles } from '@/ui/Subtitles';
import type { InteractionSystem } from './Interaction';
import type { MaterialLibrary } from '@/world/Materials';

export interface FogOverride {
  color: THREE.Color;
  density: number;
}

/** A memory's gameplay (encounter/puzzle) runs here and resolves when the memory completes. */
export interface MemoryController {
  start(ctx: { portal: MemoryPortal; done: (silent?: boolean) => void }): void;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export type MemoryFactory = (id: string) => MemoryController;

/**
 * The reusable Memory Portal (GDD §24): present-state → transition → memory-state → completion →
 * present-state update. The transformation never cuts to black: gold memory-light rises through the
 * fog and particles until the present is fully veiled, the player is carried into the memory zone, and
 * the veil lifts. Returning reverses it, and the present is rebuilt with the completed memory's changes.
 */
export class MemoryPortal implements System {
  readonly name = 'memory-portal';
  active: MemoryDef | null = null;
  private controller: MemoryController | null = null;
  private returnPoint: { position: THREE.Vector3; yaw: number; camYaw: number; camPitch: number } | null = null;
  private readonly motes: THREE.Points;
  private readonly moteMat: THREE.PointsMaterial;
  private moteLife = 0;
  fogOverride: FogOverride | null = null;
  private readonly veil = { t: 0 };

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly player: PlayerController,
    private readonly visual: PlayerVisual,
    private readonly rig: CameraRig,
    private readonly lighting: LightingStates,
    private readonly audio: AudioSystem,
    private readonly doors: DoorSystem,
    private readonly journal: Journal,
    private readonly subtitles: Subtitles,
    private readonly interaction: InteractionSystem,
    private readonly factory: MemoryFactory,
    lib: MaterialLibrary,
  ) {
    const n = 400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.moteMat = new THREE.PointsMaterial({ map: lib.glowTexture, color: 0xffc46b, size: 0.18, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.motes = new THREE.Points(geo, this.moteMat);
    this.motes.frustumCulled = false;
    this.motes.visible = false;
    engine.scene.add(this.motes);
  }

  get inMemory(): boolean {
    return this.active !== null;
  }

  private scatterMotes(center: THREE.Vector3, radius: number): void {
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      pos.setXYZ(i, center.x + Math.cos(a) * r, center.y + Math.random() * 3.5, center.z + Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    this.motes.visible = true;
    this.moteLife = 0;
  }

  /** Gold veil: 0 = none, 1 = the world is fully veiled in memory-light. */
  private setVeil(t: number, warm: boolean): void {
    this.veil.t = t;
    const c = warm ? new THREE.Color(0xd9a55a) : new THREE.Color(0x0f2038);
    this.fogOverride = t > 0.001 ? { color: c.lerp(new THREE.Color(0xfff1c9), t * 0.6), density: 0.012 + t * t * 0.9 } : null;
    this.moteMat.opacity = Math.min(1, t * 2.2);
  }

  async enter(def: MemoryDef, anchorObject?: THREE.Object3D): Promise<void> {
    if (this.active) return;
    this.active = def;
    this.interaction.suppressed = true;
    this.player.movementLocked = true;
    this.returnPoint = { position: this.player.position.clone(), yaw: this.player.facingYaw, camYaw: this.rig.yaw, camPitch: this.rig.pitch };
    if (def.enterLine) this.subtitles.say(def.enterLine);
    this.audio.play('memory-enter', { volume: 0.9 });
    this.audio.setZone('memory');
    // The mural wakes: emissive pulse on its panel.
    if (anchorObject) {
      const m = (anchorObject as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && 'emissive' in m) gsap.fromTo(m, { emissiveIntensity: 0 }, { emissiveIntensity: 2.2, duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: 1 });
    }
    this.scatterMotes(this.player.position, 6);
    void this.lighting.transition('memory', 3.2);
    await gsap.to(this.veil, { t: 1, duration: 3.2, ease: 'sine.in', onUpdate: () => this.setVeil(this.veil.t, true) }).then();
    // Carried into the memory.
    const [x, y, z, yaw] = def.spawn;
    this.player.teleport(new THREE.Vector3(x, y, z), yaw);
    this.rig.setYawPitch(yaw, 0.45);
    this.streamer.loadImmediate(1);
    this.rig.snapBehind();
    this.visual.setMemoryForm(true);
    gameStore.getState().setFlag(`memory-active:${def.id}`, true);
    this.controller = this.factory(def.id);
    this.controller.start({ portal: this, done: (silent) => void this.exit(silent ?? false) });
    await gsap.to(this.veil, { t: 0, duration: 2.6, ease: 'sine.out', onUpdate: () => this.setVeil(this.veil.t, true) }).then();
    this.player.movementLocked = false;
    this.interaction.suppressed = false;
  }

  /** Brief gold flash (the memory faltering). */
  flash(seconds: number): void {
    gsap.killTweensOf(this.veil);
    gsap.to(this.veil, { t: 0.75, duration: seconds * 0.3, ease: 'power2.out', onUpdate: () => this.setVeil(this.veil.t, true), onComplete: () => gsap.to(this.veil, { t: 0, duration: seconds * 0.7, ease: 'sine.inOut', onUpdate: () => this.setVeil(this.veil.t, true) }) });
  }

  /** Called by the memory's controller when it resolves. `silent` keeps the audio ducked (the tusk). */
  async exit(silent = false): Promise<void> {
    const def = this.active;
    if (!def || !this.returnPoint) return;
    this.interaction.suppressed = true;
    this.player.movementLocked = true;
    if (!silent) this.audio.play('memory-exit', { volume: 0.8 });
    this.scatterMotes(this.player.position, 5);
    // The controller keeps running (e.g. the camera follows the falling tusk) until the veil is full.
    await gsap.to(this.veil, { t: 1, duration: 2.4, ease: 'sine.in', onUpdate: () => this.setVeil(this.veil.t, true) }).then();
    this.controller?.dispose();
    this.controller = null;
    // Back to the present, at the mural; the temple has changed.
    const s = gameStore.getState();
    s.setFlag(def.completionFlag, true);
    s.setFlag(`memory-active:${def.id}`, false);
    s.completeMemory(def.id);
    for (const j of def.journal) this.journal.unlock(j);
    const rp = this.returnPoint;
    this.player.teleport(rp.position, rp.yaw);
    this.rig.setYawPitch(rp.camYaw, rp.camPitch);
    this.visual.setMemoryForm(false);
    this.streamer.loadImmediate(1);
    this.active = null;
    void this.lighting.transition('present', 2.8);
    this.audio.setZone(this.streamer.zone);
    await gsap.to(this.veil, { t: 0, duration: 2.6, ease: 'sine.out', onUpdate: () => this.setVeil(this.veil.t, false) }).then();
    if (silent) this.audio.release(4);
    if (def.returnLine) this.subtitles.say(def.returnLine);
    for (const d of def.doors) this.doors.open(d);
    if (def.afterLine) this.subtitles.say(def.afterLine);
    this.player.movementLocked = false;
    this.interaction.suppressed = false;
  }

  update(dt: number, elapsed: number): void {
    if (this.motes.visible) {
      this.moteLife += dt;
      const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + dt * (0.35 + (i % 7) * 0.08));
      pos.needsUpdate = true;
      if (this.moteMat.opacity <= 0.001 && this.moteLife > 6) this.motes.visible = false;
    }
    this.controller?.update(dt, elapsed);
  }

  dispose(): void {
    this.controller?.dispose();
    this.engine.scene.remove(this.motes);
    this.motes.geometry.dispose();
    this.moteMat.dispose();
  }
}
