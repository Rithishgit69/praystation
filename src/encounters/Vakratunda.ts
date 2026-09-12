import * as THREE from 'three';
import gsap from 'gsap';
import type { MemoryController, MemoryPortal } from '@/systems/MemoryPortal';
import type { EncounterContext } from './BrokenTusk';
import { ShadeMesh } from './ShadeMesh';
import type { MaterialLibrary } from '@/world/Materials';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { LightingStates } from '@/systems/LightingStates';
import { clamp, dampAngle } from '@/util/math';

type Phase = 'illusion' | 'envy' | 'rage' | 'resolution' | 'ended';
const ARENA = new THREE.Vector3(2000, 0, 0);
const HIT = 25;

/**
 * Chapter II — Vakratunda and Matsarasura (GDD §9). The player, as the memory's luminous form, faces a
 * distortion that envies what is real. Illusion: three shades, one real; the memory-light exposes the
 * copies. Envy: the shade steals the braziers' fire; relight them while it hunts. Rage: charges and
 * shockwaves to dodge and leap. Resolution: the shade kneels and is released, never destroyed — in the
 * tradition the demon surrenders and reforms.
 */
export class VakratundaEncounter implements MemoryController {
  private readonly shades: ShadeMesh[] = [];
  private realIndex = 0;
  private phase: Phase = 'illusion';
  private timer = 0;
  private resolve = 100;
  private relit = 0;
  private charges = 0;
  private chargeState: 'wind' | 'charge' | 'slam' | 'rest' = 'wind';
  private readonly chargeFrom = new THREE.Vector3();
  private readonly chargeTo = new THREE.Vector3();
  private readonly rings: Array<{ mesh: THREE.Mesh; r: number; hit: boolean }> = [];
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ringGeo: THREE.RingGeometry;
  private done: ((silent?: boolean) => void) | null = null;
  private portal: MemoryPortal | null = null;
  private readonly tmp = new THREE.Vector3();
  private hintTimer = 0;

  constructor(
    private readonly ctx: EncounterContext,
    private readonly lib: MaterialLibrary,
    private readonly streamer: WorldStreamer,
    private readonly lighting: LightingStates,
  ) {
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x8a5ad8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
  }

  private get real(): ShadeMesh {
    return this.shades[this.realIndex] as ShadeMesh;
  }

  start(c: { portal: MemoryPortal; done: (silent?: boolean) => void }): void {
    this.portal = c.portal;
    this.done = c.done;
    void this.lighting.transition('corruption', 2.5);
    this.ctx.hud.setThreat(true);
    this.ctx.hud.setResolve(this.resolve);
    this.ctx.subtitles.say('ch2-illusion');
    this.realIndex = Math.floor(Math.random() * 3);
    for (let i = 0; i < 3; i++) {
      const s = new ShadeMesh(this.lib, 2.6);
      const a = (i / 3) * Math.PI * 2 + 0.4;
      s.root.position.set(ARENA.x + Math.cos(a) * 9, 0, ARENA.z - 4 + Math.sin(a) * 9);
      s.root.scale.setScalar(0.01);
      gsap.to(s.root.scale, { x: 1, y: 1, z: 1, duration: 1.6, delay: i * 0.3, ease: 'power2.out' });
      this.ctx.engine.scene.add(s.root);
      this.shades.push(s);
    }
    this.ctx.audio.play('drone-loop', { volume: 0.5 });
    if (window.__eka) window.__eka.encounter = () => ({ phase: this.phase, realIndex: this.realIndex, real: this.real.root.position.toArray(), resolve: this.resolve, relit: this.relit, charges: this.charges, chargeState: this.chargeState, timer: this.timer });
  }

  private hitPlayer(amount = HIT): void {
    if (this.ctx.player.dodgeTimer > 0) return;
    this.resolve = Math.max(0, this.resolve - amount);
    this.ctx.hud.setResolve(this.resolve);
    this.ctx.audio.play('block-impact', { volume: 0.9, rate: 0.6 });
    this.ctx.rig.shake(0.9);
    if (this.resolve <= 0) {
      this.portal?.flash(1.2);
      this.ctx.audio.play('shimmer', { volume: 0.7, rate: 0.8 });
      this.resolve = 100;
      this.ctx.hud.setResolve(this.resolve);
      // The memory falters: restart the current phase.
      if (this.phase === 'envy') {
        this.relit = 0;
        this.setBraziers(false);
      } else if (this.phase === 'rage') {
        this.charges = 0;
        this.chargeState = 'wind';
        this.timer = 0;
      }
      this.real.root.position.set(ARENA.x, 0, ARENA.z - 10);
    }
  }

  private setBraziers(on: boolean, index?: number): void {
    const unit = this.streamer.unitFires('memory-tusk');
    unit.forEach((f, i) => {
      if (index !== undefined && i !== index) return;
      f.group.visible = on;
      if (f.light) f.light.intensity = on ? 30 : 0;
    });
  }

  private nearestBrazier(): { index: number; dist: number } {
    let best = -1;
    let bestD = Infinity;
    const p = this.ctx.player.position;
    for (const a of this.streamer.anchors.values()) {
      if (!a.id.startsWith('memory:brazier-')) continue;
      const d = Math.hypot(a.position.x - p.x, a.position.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = Number(a.data?.index ?? -1);
      }
    }
    return { index: best, dist: bestD };
  }

  private chasePlayer(shade: ShadeMesh, speed: number, dt: number): number {
    const p = this.ctx.player.position;
    const w = shade.root.position;
    this.tmp.set(p.x - w.x, 0, p.z - w.z);
    const d = this.tmp.length();
    if (d > 1.2) {
      this.tmp.divideScalar(d);
      w.addScaledVector(this.tmp, Math.min(d - 1.2, speed * dt));
    }
    shade.root.rotation.y = dampAngle(shade.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), 6, dt);
    return d;
  }

  private updateIllusion(dt: number): void {
    const p = this.ctx.player.position;
    const input = this.ctx.engine.input;
    let nearest = -1;
    let nearestD = Infinity;
    this.shades.forEach((s, i) => {
      const d = Math.hypot(s.root.position.x - p.x, s.root.position.z - p.z);
      // The memory-light exposes copies: they thin out as the player comes close. The real one holds.
      s.solidity = i === this.realIndex ? 1 : clamp((d - 2.5) / 4, 0.12, 1);
      s.root.rotation.y = dampAngle(s.root.rotation.y, Math.atan2(p.x - s.root.position.x, p.z - s.root.position.z), 4, dt);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    });
    this.hintTimer += dt;
    if (nearest >= 0 && nearestD < 2.4) {
      this.ctx.hud.setPrompt('Touch');
      if (input.pressed('interact')) {
        if (nearest === this.realIndex) {
          this.ctx.hud.setPrompt(null);
          this.ctx.audio.play('symbol-chime', { volume: 0.7 });
          this.ctx.subtitles.say('ch2-envy');
          for (let i = 0; i < 3; i++) if (i !== this.realIndex) gsap.to(this.shades[i]!.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.8 });
          this.phase = 'envy';
          this.timer = 0;
          this.relit = 0;
          gsap.delayedCall(1.5, () => this.setBraziers(false));
        } else {
          // A copy dissolves; the real one lunges from behind it.
          const copy = this.shades[nearest] as ShadeMesh;
          gsap.to(copy.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.5 });
          gsap.delayedCall(0.6, () => copy.root.position.set(ARENA.x + (Math.random() - 0.5) * 16, 0, ARENA.z - 4 + (Math.random() - 0.5) * 16));
          gsap.delayedCall(0.7, () => gsap.to(copy.root.scale, { x: 1, y: 1, z: 1, duration: 0.8 }));
          this.ctx.audio.play('serpent-hiss', { volume: 0.5, rate: 1.3 });
          this.hitPlayer(15);
        }
      }
    } else this.ctx.hud.setPrompt(null);
  }

  private updateEnvy(dt: number): void {
    const input = this.ctx.engine.input;
    const d = this.chasePlayer(this.real, 2.4, dt);
    this.timer += dt;
    if (d < 1.4 && this.timer > 1.2) {
      this.hitPlayer();
      this.timer = 0;
      this.real.root.position.addScaledVector(this.tmp, -4);
    }
    const nb = this.nearestBrazier();
    const fires = this.streamer.unitFires('memory-tusk');
    const f = nb.index >= 0 ? fires[nb.index] : undefined;
    if (f && nb.dist < 2.8 && !f.group.visible) {
      this.ctx.hud.setPrompt('Relight');
      if (input.pressed('interact')) {
        this.setBraziers(true, nb.index);
        this.relit++;
        this.ctx.audio.play('diya-light', { position: f.group.position, volume: 0.8 });
        if (this.relit >= 4) {
          this.phase = 'rage';
          this.timer = 0;
          this.charges = 0;
          this.chargeState = 'wind';
          this.ctx.hud.setPrompt(null);
          this.ctx.subtitles.say('ch2-rage');
          gsap.to(this.real.root.scale, { x: 1.8, y: 1.8, z: 1.8, duration: 1.2, ease: 'power2.out' });
          this.real.setCore(0xd83a5a);
        }
      }
    } else this.ctx.hud.setPrompt(null);
  }

  private spawnRing(): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.real.root.position);
    mesh.position.y = 0.12;
    this.ctx.engine.scene.add(mesh);
    this.rings.push({ mesh, r: 0.5, hit: false });
    this.ctx.audio.play('rumble', { position: mesh.position, volume: 0.7 });
    this.ctx.rig.shake(0.6);
  }

  private updateRage(dt: number): void {
    const input = this.ctx.engine.input;
    const p = this.ctx.player.position;
    const w = this.real.root.position;
    this.timer += dt;
    if (input.pressed('dodge')) {
      const side = input.frame.moveX < 0 ? -1 : 1;
      this.ctx.player.dodge(-(w.z - p.z) * side, (w.x - p.x) * side, 9);
    }
    switch (this.chargeState) {
      case 'wind':
        this.real.root.rotation.y = dampAngle(this.real.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), 8, dt);
        if (this.timer > 1.1) {
          this.chargeFrom.copy(w);
          this.tmp.set(p.x - w.x, 0, p.z - w.z);
          const d = this.tmp.length() || 1;
          this.chargeTo.copy(w).addScaledVector(this.tmp.divideScalar(d), d + 3);
          this.chargeState = 'charge';
          this.timer = 0;
          this.ctx.audio.play('serpent-hiss', { volume: 0.7, rate: 0.8 });
        }
        break;
      case 'charge': {
        const t = clamp(this.timer / 0.55, 0, 1);
        w.lerpVectors(this.chargeFrom, this.chargeTo, t * t);
        if (Math.hypot(w.x - p.x, w.z - p.z) < 1.6 && this.ctx.player.dodgeTimer <= 0 && t < 1) this.hitPlayer();
        if (t >= 1) {
          this.chargeState = 'slam';
          this.timer = 0;
          this.spawnRing();
        }
        break;
      }
      case 'slam':
        if (this.timer > 0.9) {
          this.chargeState = 'rest';
          this.timer = 0;
        }
        break;
      case 'rest':
        if (this.timer > 1.0) {
          this.charges++;
          this.chargeState = 'wind';
          this.timer = 0;
          if (this.charges >= 3) {
            this.phase = 'resolution';
            this.timer = 0;
            this.ctx.subtitles.say('ch2-resolution');
            gsap.to(this.real.root.scale, { x: 0.8, y: 0.55, z: 0.8, duration: 2.2, ease: 'sine.inOut' });
            this.real.setCore(0x6a8ad8);
            void this.lighting.transition('memory', 3);
            this.ctx.hud.setThreat(false);
            this.ctx.hud.setResolve(null);
          }
        }
        break;
    }
    // Shockwave rings: leap them (airborne) or take the hit.
    for (const ring of this.rings) {
      ring.r += dt * 9;
      ring.mesh.scale.setScalar(ring.r);
      this.ringMat.opacity = 0.55;
      const d = Math.hypot(ring.mesh.position.x - p.x, ring.mesh.position.z - p.z);
      if (!ring.hit && Math.abs(d - ring.r) < 0.6) {
        ring.hit = true;
        if (this.ctx.player.grounded && this.ctx.player.dodgeTimer <= 0) this.hitPlayer(20);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i] as (typeof this.rings)[number];
      if (ring.r > 26) {
        this.ctx.engine.scene.remove(ring.mesh);
        this.rings.splice(i, 1);
      }
    }
  }

  private updateResolution(dt: number): void {
    const input = this.ctx.engine.input;
    const p = this.ctx.player.position;
    const w = this.real.root.position;
    this.timer += dt;
    const d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < 2.6 && this.timer > 2.2) {
      this.ctx.hud.setPrompt('Release');
      if (input.pressed('interact')) {
        this.ctx.hud.setPrompt(null);
        this.phase = 'ended';
        this.ctx.audio.play('shimmer', { volume: 0.9 });
        gsap.to(this.real.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 1.8, ease: 'power2.in' });
        gsap.delayedCall(1.6, () => this.done?.(false));
      }
    } else this.ctx.hud.setPrompt(null);
  }

  update(dt: number, elapsed: number): void {
    for (const s of this.shades) s.update(dt, elapsed);
    switch (this.phase) {
      case 'illusion':
        this.updateIllusion(dt);
        break;
      case 'envy':
        this.updateEnvy(dt);
        break;
      case 'rage':
        this.updateRage(dt);
        break;
      case 'resolution':
        this.updateResolution(dt);
        break;
      case 'ended':
        break;
    }
  }

  dispose(): void {
    this.phase = 'ended';
    if (window.__eka) window.__eka.encounter = null;
    this.ctx.hud.setThreat(false);
    this.ctx.hud.setResolve(null);
    this.ctx.hud.setPrompt(null);
    for (const s of this.shades) {
      this.ctx.engine.scene.remove(s.root);
      s.dispose();
    }
    for (const r of this.rings) this.ctx.engine.scene.remove(r.mesh);
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.setBraziers(true);
    this.ctx.audio.stop('drone-loop');
  }
}
