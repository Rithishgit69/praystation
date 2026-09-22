import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import { ParticleSystem } from '@/engine/Particles';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { MaterialLibrary } from '@/world/Materials';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import { buildGaneshaIdol, type GaneshaStatue } from '@/world/props/Statue';

/** Seconds from the start of the sequence until the idol stands at full height. */
export const CLIMAX_RISE_SECONDS = 15;
const FULL_SCALE = 1.0;
const DIYA_COUNT = 14;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/**
 * The climax: with the last asura broken, the temple's lord is revealed. A small golden idol stands on
 * the floor before the mountain gateway; as the traveller kneels it rises to its full height while the
 * diyas light, the Om swells, marigold petals fall, the halo blazes and dawn comes up behind it. The
 * camera pulls back and looks up with it. Nothing is fought; the figure is honoured, never handled.
 */
export class Climax {
  private idol: GaneshaStatue | null = null;
  /** Borrowed from the pool so the light count never changes (no shader rebuild mid-scene). */
  private light: THREE.PointLight | null = null;
  private crownLight: THREE.PointLight | null = null;
  private readonly motes: ParticleSystem;
  private readonly petals: ParticleSystem;
  private readonly diyas: THREE.Sprite[] = [];
  private readonly diyaLit: number[] = [];
  private readonly at = new THREE.Vector3();
  private readonly camA = new THREE.Vector3();
  private readonly camB = new THREE.Vector3();
  private readonly lookTmp = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private t = 0;
  private running = false;
  private risen = false;
  private scale = 0.02;
  private glow = 0;
  private onRisen: (() => void) | null = null;
  private readonly tweens: gsap.core.Tween[] = [];

  constructor(
    private readonly engine: Engine,
    private readonly lib: MaterialLibrary,
    private readonly player: PlayerController,
    private readonly rig: CameraRig,
    private readonly audio: AudioSystem,
    private readonly visual: PlayerVisual,
  ) {
    this.motes = new ParticleSystem(lib.glowTexture, 0xffd88a, 220);
    this.petals = new ParticleSystem(lib.glowTexture, 0xf39a2a, 260);
    for (let i = 0; i < DIYA_COUNT; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xffb257, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.scale.set(1.2, 1.6, 1);
      this.diyas.push(s);
      this.diyaLit.push(0);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Begin: the idol is placed at `idolAt` facing the traveller, who is moved to `heroAt` and kneels.
   * `speak` plays the narrator's climax line; `onRisen` fires when the idol stands at full height.
   */
  start(idolAt: THREE.Vector3, heroAt: THREE.Vector3, heroYaw: number, speak: (id: string) => void, onRisen: () => void): void {
    this.dispose();
    this.running = true;
    this.risen = false;
    this.t = 0;
    this.scale = 0.02;
    this.glow = 0;
    this.onRisen = onRisen;
    this.at.copy(idolAt);
    // The idol.
    this.idol = buildGaneshaIdol(this.lib);
    this.idol.group.position.copy(idolAt);
    this.idol.group.scale.setScalar(this.scale);
    this.engine.scene.add(this.idol.group);
    this.light = this.engine.lights.acquire(0xffc37a, 0, 60, 2);
    this.crownLight = this.engine.lights.acquire(0xfff0c8, 0, 50, 2);
    this.light?.position.set(idolAt.x, idolAt.y + 4, idolAt.z + 6);
    this.crownLight?.position.set(idolAt.x, idolAt.y + 18, idolAt.z - 2);
    this.engine.scene.add(this.motes.points, this.petals.points);
    this.motes.setViewportHeight(window.innerHeight);
    this.petals.setViewportHeight(window.innerHeight);
    for (let i = 0; i < DIYA_COUNT; i++) {
      const a = (i / DIYA_COUNT) * Math.PI * 2;
      const d = this.diyas[i] as THREE.Sprite;
      d.position.set(idolAt.x + Math.cos(a) * 10.5, idolAt.y + 0.55, idolAt.z + Math.sin(a) * 10.5);
      this.engine.scene.add(d);
    }
    // The traveller: moved before the idol, movement locked, kneeling with joined hands.
    this.player.teleport(heroAt, heroYaw);
    this.player.movementLocked = true;
    this.player.faceViewYaw = false;
    this.visual.mesh.pray = false;
    gsap.delayedCall(1.6, () => {
      if (this.running) this.visual.mesh.pray = true;
    });
    // The camera is ours: from over the traveller's shoulder, pulling back and up as the idol grows.
    this.rig.cinematic = true;
    this.camA.set(heroAt.x + 1.6, heroAt.y + 1.6, heroAt.z + 3.4);
    this.camB.set(heroAt.x - 6.5, heroAt.y + 3.6, heroAt.z + 13.5);
    // Sound: a shimmer as the light gathers, the chant swelling, bells as the figure rises.
    this.audio.play('shimmer', { volume: 0.75, rate: 0.55 });
    this.tweens.push(gsap.to(this.audio, { chantBoostDb: 9, duration: 8, ease: 'sine.inOut' }));
    gsap.delayedCall(1.2, () => this.running && speak('climax'));
    gsap.delayedCall(5.5, () => this.running && this.audio.play('bell-near', { volume: 0.45, rate: 0.7 }));
    gsap.delayedCall(10.5, () => this.running && this.audio.play('bell-near', { volume: 0.5, rate: 0.8 }));
    gsap.delayedCall(CLIMAX_RISE_SECONDS - 0.4, () => this.running && this.audio.play('weapon-granted', { volume: 0.7, rate: 0.85 }));
    // Growth and glow.
    const g = { s: 0.02, k: 0 };
    this.tweens.push(
      gsap.to(g, {
        s: FULL_SCALE,
        duration: CLIMAX_RISE_SECONDS - 1,
        delay: 1,
        ease: 'power1.inOut',
        onUpdate: () => (this.scale = g.s),
      }),
      gsap.to(g, { k: 1, duration: CLIMAX_RISE_SECONDS, ease: 'sine.inOut', onUpdate: () => (this.glow = g.k) }),
    );
  }

  update(dt: number, elapsed: number): void {
    if (!this.running || !this.idol) return;
    this.t += dt;
    const idol = this.idol;
    idol.group.scale.setScalar(this.scale);
    // Glow: ornaments, halo and the figure itself brighten; two lights follow the growing body.
    const m = idol.materials;
    if (m) {
      const k = this.glow;
      m.gold.emissiveIntensity = 0.3 + k * 0.45;
      m.halo.emissiveIntensity = 0.4 + k * 1.1 + Math.sin(elapsed * 2.2) * 0.12 * k;
      m.body.emissiveIntensity = 0.2 + k * 0.18;
      m.lotus.emissiveIntensity = 0.2 + k * 0.25;
      m.marigold.emissiveIntensity = 0.25 + k * 0.2;
      m.marigoldPale.emissiveIntensity = 0.25 + k * 0.2;
      m.tilak.emissiveIntensity = 0.4 + k * 0.6;
    }
    const height = idol.height * this.scale;
    if (this.light) {
      this.light.intensity = this.glow * 70;
      this.light.position.set(this.at.x, this.at.y + height * 0.45, this.at.z + 3 + height * 0.25);
    }
    if (this.crownLight) {
      this.crownLight.intensity = this.glow * 30;
      this.crownLight.position.set(this.at.x, this.at.y + height + 2.5, this.at.z - 1);
    }
    // Diyas around the base light one after another.
    for (let i = 0; i < DIYA_COUNT; i++) {
      const lightAt = 2.0 + i * 0.42;
      if (this.t > lightAt && (this.diyaLit[i] as number) === 0) {
        this.diyaLit[i] = 1;
        if (i % 3 === 0) this.audio.play('diya-light', { volume: 0.35, rate: 0.9 + i * 0.02, position: (this.diyas[i] as THREE.Sprite).position });
      }
      const d = this.diyas[i] as THREE.Sprite;
      const lit = this.diyaLit[i] as number;
      d.material.opacity = lit * (0.55 + Math.sin(elapsed * 9 + i * 1.7) * 0.12);
      d.scale.set(1.1 + lit * 0.3, 1.5 + lit * 0.4 + Math.sin(elapsed * 7 + i) * 0.08, 1);
    }
    // Golden motes rising from the lotus, marigold petals drifting down from above the crown.
    if (this.glow > 0.05) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 5 * this.scale;
        this.motes.emit({ x: this.at.x + Math.cos(a) * r, y: this.at.y + 0.5 + Math.random() * 2, z: this.at.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4, life: 3 + Math.random() * 3, size: 0.25 + Math.random() * 0.2, grow: 0.05, alpha: 0.7 * this.glow, drag: 0.3, lift: 0.35 });
      }
      if (this.t > 4) {
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 6 * this.scale + 1;
          this.petals.emit({ x: this.at.x + Math.cos(a) * r, y: this.at.y + height + 3 + Math.random() * 3, z: this.at.z + Math.sin(a) * r + 2, vx: (Math.random() - 0.5) * 1.2, vy: -0.4, vz: (Math.random() - 0.5) * 1.2 + 0.3, life: 6 + Math.random() * 4, size: 0.22 + Math.random() * 0.14, grow: 0, alpha: 0.85, drag: 0.6, lift: -0.55 });
        }
      }
    }
    this.motes.update(dt);
    this.petals.update(dt);
    // Camera: over the shoulder → wide and low, looking up at the figure as it rises.
    const cam = this.engine.camera;
    const k = smoothstep(Math.min(1, this.t / (CLIMAX_RISE_SECONDS + 1)));
    this.tmp.copy(this.camA).lerp(this.camB, k);
    // A slow drift keeps the shot alive after the rise.
    const drift = Math.max(0, this.t - CLIMAX_RISE_SECONDS);
    this.tmp.x += Math.sin(drift * 0.15) * 1.2;
    this.tmp.y += drift * 0.08;
    cam.position.lerp(this.tmp, 1 - Math.exp(-dt * 2.5));
    // Look from the traveller's shoulders at first, then up the figure toward the face.
    const hero = this.player.renderPosition;
    this.lookTmp.set(hero.x, hero.y + 1.3, hero.z - 2).lerp(this.tmp.set(this.at.x, this.at.y + Math.max(1.5, height * 0.48), this.at.z), Math.min(1, 0.3 + k * 0.7));
    cam.lookAt(this.lookTmp);
    if (!this.risen && this.t >= CLIMAX_RISE_SECONDS) {
      this.risen = true;
      this.onRisen?.();
    }
  }

  /** Remove everything (a new task, a new game, or the title). The camera returns to the rig. */
  dispose(): void {
    if (!this.running && !this.idol) return;
    this.running = false;
    for (const tw of this.tweens) tw.kill();
    this.tweens.length = 0;
    this.audio.chantBoostDb = 0;
    if (this.idol) {
      this.engine.scene.remove(this.idol.group);
      this.idol.dispose();
      this.idol = null;
    }
    this.engine.lights.release(this.light);
    this.engine.lights.release(this.crownLight);
    this.light = null;
    this.crownLight = null;
    this.engine.scene.remove(this.motes.points, this.petals.points);
    for (const d of this.diyas) {
      this.engine.scene.remove(d);
      d.material.opacity = 0;
    }
    this.diyaLit.fill(0);
    this.visual.mesh.pray = false;
    this.rig.cinematic = false;
  }
}
