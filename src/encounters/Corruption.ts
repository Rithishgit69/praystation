import * as THREE from 'three';
import gsap from 'gsap';
import type { PresentEncounter } from '@/systems/EncounterRunner';
import type { EncounterContext } from './BrokenTusk';
import { ShadeMesh } from './ShadeMesh';
import type { MaterialLibrary } from '@/world/Materials';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { LightingStates } from '@/systems/LightingStates';
import type { DoorSystem } from '@/systems/Doors';
import { gameStore } from '@/state/store';
import { clamp, dampAngle } from '@/util/math';

type Phase = 'named' | 'seals' | 'moon' | 'rage' | 'resolution' | 'ended';
const ALTAR = new THREE.Vector3(0, -19.04, -308);

/**
 * Chapter VI — the Forgetting revealed (original fictional antagonist, GDD §13/§25). A present-day
 * confrontation at the underground altar: it pins the moon in shadow and snuffs the braziers; the
 * traveller relights the three memory seals (each summons a shade to dodge), moonlight returns through
 * the shaft, the mass rages with charges and shockwaves, and finally shrinks under the moon until it
 * can be restored at the altar. Knowledge from every chapter is what opens the way, not force.
 */
export class CorruptionEncounter implements PresentEncounter {
  private readonly mass: ShadeMesh;
  private readonly shades: ShadeMesh[] = [];
  private phase: Phase = 'named';
  private timer = 0;
  private resolve = 100;
  private sealsLit = 0;
  private charges = 0;
  private chargeState: 'wind' | 'charge' | 'slam' | 'rest' = 'wind';
  private readonly chargeFrom = new THREE.Vector3();
  private readonly chargeTo = new THREE.Vector3();
  private readonly rings: Array<{ mesh: THREE.Mesh; r: number; hit: boolean }> = [];
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ringGeo: THREE.RingGeometry;
  private done: (() => void) | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly ctx: EncounterContext,
    private readonly lib: MaterialLibrary,
    private readonly streamer: WorldStreamer,
    private readonly lighting: LightingStates,
    private readonly doors: DoorSystem,
  ) {
    this.mass = new ShadeMesh(lib, 4.5);
    this.mass.setCore(0x5a2a8a);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x8a5ad8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
  }

  start(done: () => void): void {
    this.done = done;
    this.ctx.subtitles.say('ch6-named');
    void this.lighting.transition('corruption', 3);
    this.lighting.pinned = 'shadow';
    this.ctx.hud.setThreat(true);
    this.ctx.hud.setResolve(this.resolve);
    this.mass.root.position.copy(ALTAR).setY(ALTAR.y + 0.9);
    this.mass.root.scale.setScalar(0.01);
    this.ctx.engine.scene.add(this.mass.root);
    gsap.to(this.mass.root.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 3, ease: 'power2.out' });
    this.ctx.audio.play('drone-loop', { volume: 0.6 });
    this.ctx.audio.play('rumble', { volume: 0.8 });
    // The braziers go out.
    for (const f of this.streamer.unitFires('shrine')) {
      if (f.light) gsap.to(f.light, { intensity: 0.5, duration: 2.5 });
      gsap.to(f.group.scale, { x: 0.25, y: 0.25, z: 0.25, duration: 2.5 });
    }
    this.phase = 'named';
    this.timer = 0;
    if (window.__eka) window.__eka.encounter = () => ({ phase: this.phase, resolve: this.resolve, sealsLit: this.sealsLit, charges: this.charges, chargeState: this.chargeState, timer: this.timer, shades: this.shades.length });
  }

  private hitPlayer(amount: number): void {
    if (this.ctx.player.dodgeTimer > 0) return;
    this.resolve = Math.max(0, this.resolve - amount);
    this.ctx.hud.setResolve(this.resolve);
    this.ctx.audio.play('block-impact', { volume: 0.9, rate: 0.6 });
    this.ctx.rig.shake(0.9);
    if (this.resolve <= 0) {
      // The Forgetting takes the moment: the traveller is thrown back to the dais steps and the phase restarts.
      this.resolve = 100;
      this.ctx.hud.setResolve(this.resolve);
      this.ctx.audio.play('shimmer', { volume: 0.7, rate: 0.6 });
      this.ctx.player.teleport(new THREE.Vector3(ALTAR.x, ALTAR.y - 0.96, ALTAR.z + 14), 0);
      this.ctx.rig.snapBehind();
      for (const s of this.shades) {
        this.ctx.engine.scene.remove(s.root);
        s.dispose();
      }
      this.shades.length = 0;
      if (this.phase === 'rage') {
        this.charges = 0;
        this.chargeState = 'wind';
        this.timer = 0;
      }
    }
  }

  private spawnShade(at: THREE.Vector3): void {
    const s = new ShadeMesh(this.lib, 2.6);
    s.root.position.copy(at).setY(ALTAR.y - 0.96);
    s.root.scale.setScalar(0.01);
    gsap.to(s.root.scale, { x: 1, y: 1, z: 1, duration: 0.8 });
    this.ctx.engine.scene.add(s.root);
    this.shades.push(s);
    this.ctx.audio.play('serpent-hiss', { position: at, volume: 0.6, rate: 1.2 });
  }

  private updateShades(dt: number): void {
    const p = this.ctx.player.position;
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const s = this.shades[i] as ShadeMesh;
      const w = s.root.position;
      this.tmp.set(p.x - w.x, 0, p.z - w.z);
      const d = this.tmp.length();
      if (d > 1.1) w.addScaledVector(this.tmp.divideScalar(d), Math.min(d - 1.1, 3.2 * dt));
      s.root.rotation.y = dampAngle(s.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), 6, dt);
      // Shades dissolve in the player's lantern light after a few seconds; they strike if they reach you.
      s.solidity = Math.max(0.15, s.solidity - dt * 0.18);
      if (d < 1.3 && s.solidity > 0.3) {
        this.hitPlayer(20);
        w.addScaledVector(this.tmp, -3);
      }
      if (s.solidity <= 0.16) {
        this.ctx.engine.scene.remove(s.root);
        s.dispose();
        this.shades.splice(i, 1);
      }
    }
  }

  private sealAnchor(i: number): THREE.Vector3 | null {
    return this.streamer.anchors.get(`seal:${i}`)?.position ?? null;
  }

  private updateSeals(dt: number): void {
    const input = this.ctx.engine.input;
    const p = this.ctx.player.position;
    const s = gameStore.getState();
    this.updateShades(dt);
    if (input.pressed('dodge')) {
      const side = input.frame.moveX < 0 ? -1 : 1;
      this.ctx.player.dodge(side, 0, 9);
    }
    let prompt: string | null = null;
    for (let i = 0; i < 3; i++) {
      if (s.flags[`seal:${i}`] === true) continue;
      const a = this.sealAnchor(i);
      if (!a) continue;
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < 2.4) {
        prompt = 'Press the mark';
        if (input.pressed('interact')) {
          s.setFlag(`seal:${i}`, true);
          this.sealsLit++;
          this.ctx.audio.play('symbol-chime', { position: a, volume: 0.8, rate: 0.9 + i * 0.1 });
          const obj = this.streamer.anchors.get(`seal:${i}`)?.object;
          if (obj) gsap.fromTo(obj.position, { y: obj.position.y - 0.15 }, { y: obj.position.y, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
          // Each seal costs the Forgetting: it answers with a shade.
          this.spawnShade(new THREE.Vector3(ALTAR.x + (Math.random() - 0.5) * 10, 0, ALTAR.z + (Math.random() - 0.5) * 10));
          if (this.sealsLit >= 3) {
            this.phase = 'moon';
            this.timer = 0;
            this.ctx.subtitles.say('ch6-moon');
            this.lighting.pinned = 'moonlit';
            this.ctx.audio.play('shimmer', { volume: 0.9 });
          }
        }
      }
    }
    this.ctx.hud.setPrompt(prompt);
  }

  private spawnRing(): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.mass.root.position).setY(ALTAR.y - 0.96 + 0.12);
    this.ctx.engine.scene.add(mesh);
    this.rings.push({ mesh, r: 0.5, hit: false });
    this.ctx.audio.play('rumble', { position: mesh.position, volume: 0.7 });
    this.ctx.rig.shake(0.7);
  }

  private updateRage(dt: number): void {
    const input = this.ctx.engine.input;
    const p = this.ctx.player.position;
    const w = this.mass.root.position;
    this.timer += dt;
    if (input.pressed('dodge')) {
      const side = input.frame.moveX < 0 ? -1 : 1;
      this.ctx.player.dodge(-(w.z - p.z) * side, (w.x - p.x) * side, 9);
    }
    switch (this.chargeState) {
      case 'wind':
        this.mass.root.rotation.y = dampAngle(this.mass.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), 8, dt);
        if (this.timer > 1.3) {
          this.chargeFrom.copy(w);
          this.tmp.set(p.x - w.x, 0, p.z - w.z);
          const d = this.tmp.length() || 1;
          this.chargeTo.copy(w).addScaledVector(this.tmp.divideScalar(d), Math.min(d + 2, 22));
          this.chargeState = 'charge';
          this.timer = 0;
        }
        break;
      case 'charge': {
        const t = clamp(this.timer / 0.6, 0, 1);
        w.lerpVectors(this.chargeFrom, this.chargeTo, t * t);
        if (Math.hypot(w.x - p.x, w.z - p.z) < 2.2 && t < 1) this.hitPlayer(25);
        if (t >= 1) {
          this.chargeState = 'slam';
          this.timer = 0;
          this.spawnRing();
        }
        break;
      }
      case 'slam':
        if (this.timer > 1.0) {
          this.chargeState = 'rest';
          this.timer = 0;
        }
        break;
      case 'rest':
        if (this.timer > 1.2) {
          this.charges++;
          this.chargeState = 'wind';
          this.timer = 0;
          // It drags itself back toward the altar between charges.
          gsap.to(w, { x: ALTAR.x, z: ALTAR.z, duration: 1.0 });
          if (this.charges >= 3) {
            this.phase = 'resolution';
            this.timer = 0;
            this.ctx.subtitles.say('ch6-resolution');
            gsap.to(this.mass.root.scale, { x: 0.5, y: 0.45, z: 0.5, duration: 3, ease: 'sine.inOut' });
            this.ctx.hud.setThreat(false);
            this.ctx.hud.setResolve(null);
          }
        }
        break;
    }
    for (const ring of this.rings) {
      ring.r += dt * 9;
      ring.mesh.scale.setScalar(ring.r);
      const d = Math.hypot(ring.mesh.position.x - p.x, ring.mesh.position.z - p.z);
      if (!ring.hit && Math.abs(d - ring.r) < 0.6) {
        ring.hit = true;
        if (this.ctx.player.grounded && this.ctx.player.dodgeTimer <= 0) this.hitPlayer(20);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i] as (typeof this.rings)[number];
      if (ring.r > 30) {
        this.ctx.engine.scene.remove(ring.mesh);
        this.rings.splice(i, 1);
      }
    }
  }

  private updateResolution(dt: number): void {
    const input = this.ctx.engine.input;
    const p = this.ctx.player.position;
    this.timer += dt;
    const d = Math.hypot(ALTAR.x - p.x, ALTAR.z - p.z);
    if (d < 3.4 && this.timer > 2.5) {
      this.ctx.hud.setPrompt('Restore');
      if (input.pressed('interact')) {
        this.ctx.hud.setPrompt(null);
        this.phase = 'ended';
        const s = gameStore.getState();
        s.setFlag('shrine:cleansed', true);
        this.ctx.audio.duckToSilence(0.6);
        gsap.to(this.mass.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 2.4, ease: 'power2.in' });
        void this.lighting.transition('present', 4);
        this.lighting.pinned = null;
        for (const f of this.streamer.unitFires('shrine')) {
          if (f.light) gsap.to(f.light, { intensity: 40, duration: 3, delay: 2 });
          gsap.to(f.group.scale, { x: 1, y: 1, z: 1, duration: 3, delay: 2 });
        }
        gsap.delayedCall(3.2, () => {
          this.ctx.audio.release(3);
          this.ctx.audio.play('bell-near', { volume: 0.5, rate: 0.8 });
          this.doors.open('door:shrine-sanctum');
          this.ctx.subtitles.say('ch6-cleansed');
          this.done?.();
        });
      }
    } else this.ctx.hud.setPrompt(null);
  }

  update(dt: number, elapsed: number): void {
    this.mass.update(dt, elapsed);
    for (const s of this.shades) s.update(dt, elapsed);
    switch (this.phase) {
      case 'named':
        this.timer += dt;
        if (this.timer > 4) {
          this.phase = 'seals';
          this.timer = 0;
          this.ctx.subtitles.say('ch6-seals');
        }
        break;
      case 'seals':
        this.updateSeals(dt);
        break;
      case 'moon':
        this.timer += dt;
        this.updateShades(dt);
        if (this.timer > 3.5) {
          this.phase = 'rage';
          this.timer = 0;
          this.charges = 0;
          this.chargeState = 'wind';
          this.ctx.subtitles.say('ch6-rage');
          this.mass.setCore(0xd83a5a);
        }
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
    this.ctx.engine.scene.remove(this.mass.root);
    this.mass.dispose();
    for (const s of this.shades) {
      this.ctx.engine.scene.remove(s.root);
      s.dispose();
    }
    for (const r of this.rings) this.ctx.engine.scene.remove(r.mesh);
    this.ringGeo.dispose();
    this.ringMat.dispose();
    this.ctx.audio.stop('drone-loop');
    this.lighting.pinned = null;
  }
}
