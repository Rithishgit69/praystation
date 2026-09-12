import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import type { HUD } from '@/ui/HUD';
import type { Subtitles } from '@/ui/Subtitles';
import type { MemoryController, MemoryPortal } from '@/systems/MemoryPortal';
import { WarriorMesh, type WarriorPose } from './WarriorMesh';
import { clamp, dampAngle } from '@/util/math';

export interface EncounterContext {
  engine: Engine;
  player: PlayerController;
  visual: PlayerVisual;
  rig: CameraRig;
  hud: HUD;
  audio: AudioSystem;
  subtitles: Subtitles;
}

type AttackKind = 'overhead' | 'sweep' | 'charge';
interface Attack {
  kind: AttackKind;
  telegraph: number;
}
type Phase = 'approach' | 'pattern' | 'final' | 'break' | 'ended';

const ARENA = new THREE.Vector3(2000, 0, 0);
const GATE_TOP = new THREE.Vector3(2000, 2, -26);
const PATTERN: Attack[] = [
  { kind: 'overhead', telegraph: 1.4 },
  { kind: 'sweep', telegraph: 1.2 },
  { kind: 'overhead', telegraph: 1.2 },
  { kind: 'charge', telegraph: 1.1 },
  { kind: 'sweep', telegraph: 1.0 },
  { kind: 'overhead', telegraph: 1.0 },
  { kind: 'charge', telegraph: 0.9 },
];
const HIT_DAMAGE = 34;
const BARRIER_DRAIN = 26;

/**
 * Chapter I — The Broken Tusk (GDD §8). The player embodies Ganesha at a mountain gateway; the warrior
 * will not be refused. Dodge, block and raise stone barriers while reading three telegraphed attacks.
 * The encounter is not won by striking back: once the patterns are weathered, the final blow can only
 * be met by holding still. The tusk breaks, every sound drops out, and the falling tusk carries the
 * player back to the present.
 */
export class BrokenTuskEncounter implements MemoryController {
  private readonly warrior = new WarriorMesh();
  private readonly tusk: THREE.Mesh;
  private readonly barrier: THREE.Mesh;
  private phase: Phase = 'approach';
  private timer = 0;
  private attackIndex = 0;
  private attackStage: 'telegraph' | 'strike' | 'recover' = 'telegraph';
  private resolve = 100;
  private barrierUp = false;
  private barrierCooldown = 0;
  private falters = 0;
  private finalTries = 0;
  private playerActedDuringFinal = false;
  private readonly toPlayer = new THREE.Vector3();
  private readonly tuskVel = new THREE.Vector3();
  private readonly tuskSpin = new THREE.Vector3();
  private readonly camTarget = new THREE.Vector3();
  private done: ((silent?: boolean) => void) | null = null;
  private portal: MemoryPortal | null = null;
  private walkSpeed = 0;
  private chargeFrom = new THREE.Vector3();
  private chargeTo = new THREE.Vector3();

  constructor(private readonly ctx: EncounterContext) {
    const tuskGeo = new THREE.ConeGeometry(0.06, 0.42, 10);
    tuskGeo.translate(0, 0.21, 0);
    this.tusk = new THREE.Mesh(tuskGeo, this.warrior.glowMaterial);
    this.tusk.position.set(0.13, 1.6, 0.16);
    this.tusk.rotation.set(1.35, 0, -0.35);
    this.barrier = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.35), new THREE.MeshStandardMaterial({ color: 0xd8c2a0, emissive: 0x8a5a20, emissiveIntensity: 0.5, roughness: 0.8 }));
    this.barrier.castShadow = true;
    this.barrier.visible = false;
  }

  start(c: { portal: MemoryPortal; done: (silent?: boolean) => void }): void {
    this.portal = c.portal;
    this.done = c.done;
    const scene = this.ctx.engine.scene;
    this.warrior.root.position.copy(GATE_TOP);
    scene.add(this.warrior.root, this.barrier);
    this.ctx.visual.mesh.root.add(this.tusk);
    this.ctx.hud.setThreat(true);
    this.ctx.hud.setResolve(this.resolve);
    this.ctx.subtitles.say('ch1-gateway');
    this.phase = 'approach';
    this.timer = 0;
    if (window.__eka) window.__eka.encounter = () => ({ phase: this.phase, attackIndex: this.attackIndex, stage: this.attackStage, kind: PATTERN[this.attackIndex]?.kind ?? 'final', resolve: this.resolve, timer: this.timer });
  }

  private faceWarriorToPlayer(dt: number): void {
    const p = this.ctx.player.position;
    const w = this.warrior.root.position;
    const yaw = Math.atan2(p.x - w.x, p.z - w.z);
    this.warrior.root.rotation.y = dampAngle(this.warrior.root.rotation.y, yaw, 8, dt);
  }

  private distanceToPlayer(): number {
    const p = this.ctx.player.position;
    const w = this.warrior.root.position;
    return Math.hypot(p.x - w.x, p.z - w.z);
  }

  /** Walk toward a target at `speed`; returns true when within `stop`. */
  private walkTo(target: THREE.Vector3, speed: number, stop: number, dt: number): boolean {
    const w = this.warrior.root.position;
    this.toPlayer.set(target.x - w.x, 0, target.z - w.z);
    const d = this.toPlayer.length();
    if (d <= stop + 0.01) {
      this.walkSpeed = 0;
      return true;
    }
    this.toPlayer.divideScalar(d);
    const step = Math.min(d - stop, speed * dt);
    w.addScaledVector(this.toPlayer, step);
    // Follow the terrace height: the stair drops from y=2 (z<-18) to y=0.
    w.y = w.z < -18 ? 2 * clamp((-18 - w.z) / 8, 0, 1) : 0;
    this.walkSpeed = speed;
    return false;
  }

  private hitPlayer(): void {
    if (this.ctx.player.dodgeTimer > 0) return;
    this.resolve = Math.max(0, this.resolve - HIT_DAMAGE);
    this.ctx.hud.setResolve(this.resolve);
    this.ctx.audio.play('block-impact', { volume: 1, rate: 0.7 });
    this.ctx.rig.shake(1);
    if (this.resolve <= 0) this.falter();
  }

  /** The memory falters rather than the player dying: gold flash, the warrior returns to the gate. */
  private falter(): void {
    this.falters++;
    this.portal?.flash(1.2);
    this.ctx.audio.play('shimmer', { volume: 0.7, rate: 0.8 });
    this.resolve = 100;
    this.ctx.hud.setResolve(this.resolve);
    this.attackIndex = 0;
    this.attackStage = 'telegraph';
    this.warrior.root.position.copy(GATE_TOP);
    this.phase = 'approach';
    this.timer = 1.5; // shorter re-approach
    this.lowerBarrier();
  }

  private raiseBarrier(): void {
    if (this.barrierUp || this.barrierCooldown > 0) return;
    const p = this.ctx.player.position;
    const w = this.warrior.root.position;
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    this.barrier.position.set(p.x + (dx / d) * 1.3, p.y - 0.75, p.z + (dz / d) * 1.3);
    this.barrier.rotation.y = Math.atan2(dx, dz);
    this.barrier.scale.set(1, 1, 1);
    this.barrier.visible = true;
    this.barrierUp = true;
    gsap.to(this.barrier.position, { y: p.y + 0.75, duration: 0.25, ease: 'power2.out' });
    this.ctx.audio.play('barrier-raise', { position: this.barrier.position, volume: 0.8 });
  }

  private lowerBarrier(): void {
    if (!this.barrierUp) return;
    this.barrierUp = false;
    gsap.to(this.barrier.position, { y: this.barrier.position.y - 1.6, duration: 0.3, ease: 'power2.in', onComplete: () => (this.barrier.visible = false) });
  }

  private shatterBarrier(): void {
    this.barrierUp = false;
    this.barrierCooldown = 2.2;
    this.ctx.audio.play('block-impact', { position: this.barrier.position, volume: 0.9, rate: 1.2 });
    this.ctx.rig.shake(0.5);
    gsap.to(this.barrier.scale, { x: 0.2, y: 0.1, z: 0.2, duration: 0.35, ease: 'power3.in', onComplete: () => (this.barrier.visible = false) });
  }

  private resolveStrike(kind: AttackKind): void {
    const d = this.distanceToPlayer();
    this.ctx.audio.play('axe-swing', { position: this.warrior.root.position, volume: 0.9, rate: kind === 'sweep' ? 0.85 : 1 });
    if (kind === 'overhead') {
      if (this.barrierUp) this.shatterBarrier();
      else if (d < 3.3) this.hitPlayer();
    } else if (kind === 'sweep') {
      if (this.barrierUp) this.ctx.audio.play('block-impact', { position: this.barrier.position, volume: 0.7 });
      else if (d < 3.8) this.hitPlayer();
    } else if (this.barrierUp) {
      this.ctx.audio.play('block-impact', { position: this.barrier.position, volume: 0.8 });
      this.warrior.setPose('recover');
    } else if (d < 2.2) this.hitPlayer();
  }

  private updatePattern(dt: number): void {
    const input = this.ctx.engine.input;
    const player = this.ctx.player;
    if (this.barrierCooldown > 0) this.barrierCooldown -= dt;
    // Player responses.
    if (input.pressed('dodge')) {
      const w = this.warrior.root.position;
      const dx = w.x - player.position.x;
      const dz = w.z - player.position.z;
      const side = input.frame.moveX < 0 ? -1 : 1;
      const back = Math.abs(input.frame.moveX) < 0.2 && input.frame.moveY < -0.2;
      if (back) player.dodge(-dx, -dz, 8);
      else player.dodge(-dz * side, dx * side, 9);
      this.ctx.audio.play('lantern-out', { volume: 0.35, rate: 1.6 });
    }
    if (input.held('block') && player.stamina > 5) {
      this.raiseBarrier();
      player.stamina = Math.max(0, player.stamina - BARRIER_DRAIN * dt);
    } else this.lowerBarrier();

    const attack = PATTERN[this.attackIndex] as Attack;
    this.timer += dt;
    if (this.attackStage === 'telegraph') {
      // Close distance first, then wind up in place.
      const near = this.walkTo(player.position, 2.4, attack.kind === 'charge' ? 6.5 : 3.0, dt);
      if (!near) {
        this.warrior.setPose('walk');
        this.timer = 0;
        return;
      }
      this.warrior.setPose(attack.kind === 'overhead' ? 'raise' : attack.kind === 'sweep' ? 'sweep-wind' : 'charge');
      if (this.timer >= attack.telegraph) {
        this.attackStage = 'strike';
        this.timer = 0;
        if (attack.kind === 'charge') {
          this.chargeFrom.copy(this.warrior.root.position);
          const w = this.warrior.root.position;
          this.toPlayer.set(player.position.x - w.x, 0, player.position.z - w.z);
          const d = this.toPlayer.length() || 1;
          this.chargeTo.copy(w).addScaledVector(this.toPlayer.divideScalar(d), Math.max(0, d - 1.4));
        } else this.warrior.setPose(attack.kind === 'overhead' ? 'overhead' : 'sweep');
      }
    } else if (this.attackStage === 'strike') {
      const strikeAt = attack.kind === 'charge' ? 0.45 : 0.18;
      if (attack.kind === 'charge') {
        const t = clamp(this.timer / 0.45, 0, 1);
        this.warrior.root.position.lerpVectors(this.chargeFrom, this.chargeTo, t * t);
        this.warrior.setPose('charge');
        this.walkSpeed = 6;
      }
      if (this.timer >= strikeAt) {
        this.resolveStrike(attack.kind);
        this.attackStage = 'recover';
        this.timer = 0;
        this.warrior.setPose('recover');
      }
    } else {
      this.walkSpeed = 0;
      if (this.timer >= 0.9) {
        this.attackIndex++;
        this.attackStage = 'telegraph';
        this.timer = 0;
        if (this.attackIndex >= PATTERN.length) {
          this.phase = 'final';
          this.timer = 0;
          this.finalTries = 0;
          this.playerActedDuringFinal = false;
          this.ctx.subtitles.say('ch1-restraint');
        }
      }
    }
  }

  private updateFinal(dt: number): void {
    const input = this.ctx.engine.input;
    const player = this.ctx.player;
    this.lowerBarrier();
    const near = this.walkTo(player.position, 2.0, 2.6, dt);
    if (!near) {
      this.warrior.setPose('walk');
      this.timer = 0;
      return;
    }
    this.timer += dt;
    const windUp = 2.6;
    if (this.timer < windUp) {
      this.warrior.setPose('final-raise');
      this.ctx.hud.setPrompt('Hold', false);
      if (input.pressed('dodge') || input.held('block') || input.frame.moveY !== 0 || input.frame.moveX !== 0) this.playerActedDuringFinal = true;
      return;
    }
    this.ctx.hud.setPrompt(null);
    this.warrior.setPose('final-strike');
    if (this.timer < windUp + 0.22) return;
    if (this.playerActedDuringFinal) {
      // The blow is avoided; the warrior recovers and raises the axe again. Restraint is the only way through.
      this.finalTries++;
      this.ctx.audio.play('axe-swing', { position: this.warrior.root.position, volume: 0.8 });
      this.timer = -0.9;
      this.playerActedDuringFinal = false;
      if (this.finalTries === 2) this.ctx.subtitles.say('ch1-restraint');
      return;
    }
    this.breakTusk();
  }

  private breakTusk(): void {
    this.phase = 'break';
    this.timer = 0;
    const engine = this.ctx.engine;
    this.ctx.audio.play('tusk-break', { volume: 1 });
    this.ctx.audio.duckToSilence(0.35);
    this.ctx.rig.shake(1.4);
    this.ctx.hud.setThreat(false);
    this.ctx.hud.setResolve(null);
    // Detach the tusk into the world and let it fall in slow motion; the camera goes with it.
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    this.tusk.getWorldPosition(wp);
    this.tusk.getWorldQuaternion(wq);
    this.ctx.visual.mesh.root.remove(this.tusk);
    this.tusk.position.copy(wp);
    this.tusk.quaternion.copy(wq);
    engine.scene.add(this.tusk);
    const fwd = new THREE.Vector3(-Math.sin(this.ctx.player.facingYaw), 0, -Math.cos(this.ctx.player.facingYaw));
    this.tuskVel.set(fwd.x * 1.4 + 0.6, 2.6, fwd.z * 1.4);
    this.tuskSpin.set(4.2, 1.1, 2.6);
    engine.timeScale = 0.28;
    this.ctx.rig.cinematic = true;
    this.ctx.player.movementLocked = true;
    this.warrior.setPose('still');
    // Hand back to the portal after the tusk has fallen for a moment; it will lift the veil while the
    // tusk is still in the air and only stop this controller once the present has returned.
    gsap.delayedCall(1.1, () => this.done?.(true));
  }

  private updateBreak(dt: number): void {
    this.timer += dt;
    this.tuskVel.y -= 9.81 * dt;
    this.tusk.position.addScaledVector(this.tuskVel, dt);
    this.tusk.rotation.x += this.tuskSpin.x * dt;
    this.tusk.rotation.y += this.tuskSpin.y * dt;
    this.tusk.rotation.z += this.tuskSpin.z * dt;
    if (this.tusk.position.y < 0.05) {
      this.tusk.position.y = 0.05;
      this.tuskVel.set(0, 0, 0);
      this.tuskSpin.set(0, 0, 0);
    }
    const cam = this.ctx.engine.camera;
    this.camTarget.copy(this.tusk.position);
    cam.position.lerp(new THREE.Vector3(this.tusk.position.x + 1.2, this.tusk.position.y + 0.9, this.tusk.position.z + 1.6), 1 - Math.exp(-dt * 6));
    cam.lookAt(this.camTarget);
  }

  update(dt: number, elapsed: number): void {
    switch (this.phase) {
      case 'approach': {
        this.timer += dt;
        const arrived = this.walkTo(new THREE.Vector3(ARENA.x, 0, ARENA.z - 8), 2.0, 0.3, dt);
        this.warrior.setPose(arrived ? 'idle' : 'walk');
        if (arrived && this.timer > 2.5) {
          this.phase = 'pattern';
          this.timer = 0;
        }
        break;
      }
      case 'pattern':
        this.updatePattern(dt);
        break;
      case 'final':
        this.updateFinal(dt);
        break;
      case 'break':
        this.updateBreak(dt);
        break;
      case 'ended':
        break;
    }
    if (this.phase !== 'break') this.faceWarriorToPlayer(dt);
    this.warrior.animate(dt, elapsed, this.walkSpeed);
    void this.falters;
  }

  dispose(): void {
    this.phase = 'ended';
    if (window.__eka) window.__eka.encounter = null;
    const engine = this.ctx.engine;
    engine.timeScale = 1;
    this.ctx.rig.cinematic = false;
    this.ctx.hud.setThreat(false);
    this.ctx.hud.setResolve(null);
    this.ctx.hud.setPrompt(null);
    engine.scene.remove(this.warrior.root, this.barrier, this.tusk);
    this.ctx.visual.mesh.root.remove(this.tusk);
    this.warrior.dispose();
    this.tusk.geometry.dispose();
    this.barrier.geometry.dispose();
    (this.barrier.material as THREE.Material).dispose();
  }
}

export const poseNames: readonly WarriorPose[] = ['idle', 'walk', 'raise', 'overhead', 'sweep-wind', 'sweep', 'charge', 'recover', 'final-raise', 'final-strike', 'still'];
