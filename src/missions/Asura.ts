import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { CameraRig } from '@/player/CameraRig';
import type { MaterialLibrary } from '@/world/Materials';
import { ShadeMesh } from '@/encounters/ShadeMesh';
import type { RAPIER } from '@/engine/Physics';
import { clamp, dampAngle } from '@/util/math';
import { AsuraMesh, type AsuraAvatar } from './AsuraMesh';
import { AsuraBody } from './AsuraBody';
import { Hazards } from './Hazards';
import { Projectiles } from './Projectiles';
import type { Gun, Shootable } from './Gun';
import type { AttackKind, MissionDef } from './MissionData';

type State = 'dormant' | 'idle' | 'attack' | 'stagger' | 'dead';

const UP = new THREE.Vector3(0, 1, 0);

class Shade implements Shootable {
  hp = 30;
  alive = true;
  readonly mesh: ShadeMesh;
  readonly body: AsuraBody;
  private readonly pos = new THREE.Vector3();
  constructor(lib: MaterialLibrary, engine: Engine, at: THREE.Vector3, ignore: () => Iterable<RAPIER.Collider>) {
    this.mesh = new ShadeMesh(lib, 2.4);
    this.mesh.root.position.copy(at);
    this.mesh.root.scale.setScalar(0.01);
    gsap.to(this.mesh.root.scale, { x: 1, y: 1, z: 1, duration: 0.7 });
    this.body = new AsuraBody(engine.physics, at, 0.45, 2.2, ignore);
  }
  hitSphere(): { center: THREE.Vector3; radius: number } | null {
    if (!this.alive) return null;
    this.pos.copy(this.mesh.root.position);
    this.pos.y += 1.3;
    return { center: this.pos, radius: 0.8 };
  }
  onShot(damage: number): void {
    this.hp -= damage;
    this.mesh.solidity = Math.max(0.2, this.hp / 30);
    if (this.hp <= 0) this.alive = false;
  }
}

class Illusion implements Shootable {
  hp = 20;
  alive = true;
  readonly mesh: AsuraMesh;
  private readonly pos = new THREE.Vector3();
  constructor(lib: MaterialLibrary, def: MissionDef, at: THREE.Vector3) {
    this.mesh = new AsuraMesh(lib, def.boss.color, def.boss.scale, def.boss.weapon, false, def.boss.design);
    this.mesh.coreMat.emissiveIntensity = 0.4;
    this.mesh.root.position.copy(at);
  }
  hitSphere(): { center: THREE.Vector3; radius: number } | null {
    if (!this.alive) return null;
    this.pos.copy(this.mesh.root.position);
    this.pos.y += 1.9 * this.mesh.root.scale.x;
    return { center: this.pos, radius: 1.1 * this.mesh.root.scale.x };
  }
  onShot(damage: number): void {
    this.hp -= damage;
    this.mesh.hitFlash();
    if (this.hp <= 0) this.alive = false;
  }
}

/** The glowing knot on a binding vine: shoot it to cut the tether. */
class TetherKnot implements Shootable {
  hp = 24;
  alive = true;
  readonly mesh: THREE.Mesh;
  readonly glow: THREE.Sprite;
  constructor(lib: MaterialLibrary, color: number) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9adf6a, emissive: color, emissiveIntensity: 1.8, roughness: 0.4 }));
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lib.glowTexture, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.scale.set(1.6, 1.6, 1);
    this.mesh.add(this.glow);
  }
  hitSphere(): { center: THREE.Vector3; radius: number } | null {
    return this.alive ? { center: this.mesh.position, radius: 0.55 } : null;
  }
  onShot(damage: number): void {
    this.hp -= damage;
    if (this.hp <= 0) this.alive = false;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.glow.material.dispose();
  }
}

export interface AsuraCallbacks {
  onPlayerHit(damage: number, source: string): void;
  onDefeated(): void;
  onHealth(hp: number, max: number, shielded: boolean): void;
}

/**
 * Boss AI for one asura. Walks the floor like the player does (stairs, ledges, around pillars), picks
 * attacks from its own kit on a timer that tightens as it is wounded, enrages below a health fraction,
 * and dies with a roar. Every attack is telegraphed; every projectile flies straight and can be
 * sidestepped; every area effect is drawn on the floor before it hurts.
 */
export class Asura implements Shootable {
  readonly avatar: AsuraAvatar;
  hp: number;
  readonly maxHp: number;
  alive = true;
  state: State = 'dormant';
  private body: AsuraBody | null;
  private readonly projectiles: Projectiles;
  private readonly hazards: Hazards;
  private timer = 0;
  private attack: AttackKind | null = null;
  private stage = 0;
  private attackTimer = 0;
  private nextAttackIn: number;
  private enraged = false;
  private shieldHits = 0;
  private shieldTimer = 0;
  private mirrorTimer = 0;
  private readonly shades: Shade[] = [];
  private readonly illusions: Illusion[] = [];
  private tether: { knot: TetherKnot; tube: THREE.Mesh; t: number; tick: number } | null = null;
  private readonly tubeGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1);
  private readonly tubeMat = new THREE.MeshStandardMaterial({ color: 0x3d7a34, roughness: 0.85, emissive: 0x2a5a24, emissiveIntensity: 0.6 });
  private readonly chargeDir = new THREE.Vector3();
  private chargeLeft = 0;
  private chargeSpeed = 0;
  private burnDrop = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly chest = new THREE.Vector3();
  private walkSpeed = 0;
  private meleeWind = -1;
  private meleeCooldown = 0;
  private lastPlayerHit = 0;
  private counter = 0;
  private spiralAngle = 0;
  private slowTimer = 0;
  private yankTimer = 0;
  private readonly yankDir = new THREE.Vector3();
  private flurry = 0;
  private staggerCooldown = 0;
  private readonly leapFrom = new THREE.Vector3();
  private readonly leapTo = new THREE.Vector3();
  private stuckTime = 0;
  private stallTime = 0;
  private stallBest = Infinity;
  private sidestep = 0;
  private sidestepSign = 1;
  private dashTime = 0;

  constructor(
    private readonly engine: Engine,
    private readonly lib: MaterialLibrary,
    private readonly player: PlayerController,
    private readonly rig: CameraRig,
    private readonly audio: AudioSystem,
    private readonly gun: Gun,
    readonly def: MissionDef,
    private readonly cb: AsuraCallbacks,
    startHp?: number,
    avatar?: AsuraAvatar,
  ) {
    const b = def.boss;
    this.maxHp = b.hp;
    this.hp = startHp !== undefined ? clamp(startHp, 1, b.hp) : b.hp;
    this.avatar = avatar ?? new AsuraMesh(lib, b.color, b.scale, b.weapon, true, b.design);
    this.avatar.root.position.set(def.bossSpawn[0], def.bossSpawn[1], def.bossSpawn[2]);
    this.avatar.root.scale.setScalar(0.01);
    engine.scene.add(this.avatar.root);
    this.projectiles = new Projectiles(engine, lib);
    this.hazards = new Hazards(engine, lib);
    const ignore = (): RAPIER.Collider[] => {
      const out: RAPIER.Collider[] = [this.player.collider];
      if (this.body) out.push(this.body.collider);
      for (const s of this.shades) out.push(s.body.collider);
      return out;
    };
    this.projectiles.ignore = ignore;
    this.body = new AsuraBody(engine.physics, this.avatar.root.position, 0.7 * b.scale, 3.0 * b.scale, ignore);
    // Settle onto the floor wherever the spawn point was authored.
    this.body.teleport(this.avatar.root.position, def.bossSpawn[0], def.bossSpawn[2], def.bossSpawn[1]);
    this.nextAttackIn = b.attackInterval;
    gun.addTarget(this);
  }

  /** Rise from the ground (during the narration). */
  appear(): void {
    const s = this.def.boss.scale;
    gsap.to(this.avatar.root.scale, { x: s, y: s, z: s, duration: 2.6, ease: 'power2.out' });
    this.audio.play('asura-roar', { position: this.position, volume: 0.9, rate: 0.8 });
    this.avatar.setPose('idle');
  }

  /** Unleash: the fight starts. */
  wake(): void {
    if (this.state !== 'dormant') return;
    this.state = 'idle';
    this.timer = 0;
    this.cb.onHealth(this.hp, this.maxHp, false);
  }

  /** Feet position. */
  get position(): THREE.Vector3 {
    return this.avatar.root.position;
  }
  private get scale(): number {
    return this.def.boss.scale;
  }
  private get color(): number {
    return this.def.boss.color;
  }

  hitSphere(): { center: THREE.Vector3; radius: number } | null {
    if (!this.alive || this.state === 'dormant' || this.avatar.root.scale.x < 0.3) return null;
    this.hit.copy(this.position);
    this.hit.y += (1.9 + this.avatar.hoverHeight) * this.scale;
    return { center: this.hit, radius: 1.15 * this.scale };
  }

  onShot(damage: number, point: THREE.Vector3, ignoreGuards = false): void {
    if (!this.alive || this.state === 'dormant') return;
    // The mirror throws back anything fired at the front half.
    if (this.mirrorTimer > 0 && !ignoreGuards) {
      this.tmp.set(this.player.position.x - this.position.x, 0, this.player.position.z - this.position.z).normalize();
      const facing = this.tmpB.set(Math.sin(this.avatar.root.rotation.y), 0, Math.cos(this.avatar.root.rotation.y));
      if (facing.dot(this.tmp) > -0.2) {
        this.audio.play('shimmer', { position: point, volume: 0.5, rate: 1.5 });
        this.avatar.hitFlash();
        const from = this.tmpB.copy(this.position).setY(this.position.y + 1.8 * this.scale).addScaledVector(this.tmp, 1.6 * this.scale).clone();
        this.projectiles.spawn({ kind: 'shard', from, dir: this.aimDir(from, 0), speed: 13, damage: 8, color: 0xffffff, radius: 0.45, life: 4 });
        return;
      }
    }
    if (this.shieldHits > 0 && !ignoreGuards) {
      this.shieldHits--;
      this.audio.play('asura-hit', { position: point, volume: 0.4, rate: 1.6 });
      if (this.shieldHits === 0) {
        this.avatar.setShield(false);
        this.shieldTimer = 0;
        this.audio.play('shimmer', { position: point, volume: 0.6, rate: 0.7 });
      }
      this.cb.onHealth(this.hp, this.maxHp, this.shieldHits > 0);
      return;
    }
    this.hp = Math.max(0, this.hp - damage);
    this.avatar.hitFlash();
    this.audio.play('asura-hit', { position: point, volume: 0.6, rate: 0.9 + Math.random() * 0.2 });
    this.cb.onHealth(this.hp, this.maxHp, false);
    if (!this.enraged && this.hp / this.maxHp <= this.def.boss.enrageAt) {
      this.enraged = true;
      this.audio.play('asura-roar', { position: this.position, volume: 1, rate: 1.1 });
      this.avatar.setEnraged(true);
    }
    if (this.hp <= 0) this.die();
    else if (this.state === 'idle' && Math.random() < 0.08) {
      this.state = 'stagger';
      this.timer = 0;
      this.avatar.setPose('stagger');
    }
  }

  /** A heavy blow (the Vajra up close) knocks the asura out of what it was doing; not spammable. */
  onStagger(): void {
    if (!this.alive || this.state === 'dormant' || this.state === 'dead') return;
    if (this.staggerCooldown > 0) return;
    if (this.state === 'attack' && (this.attack === 'charge' || this.attack === 'fire-charge' || this.attack === 'sword-combo')) return;
    this.staggerCooldown = 5;
    this.state = 'stagger';
    this.attack = null;
    this.timer = 0;
    this.meleeWind = -1;
    this.avatar.setPose('stagger');
    this.audio.play('asura-roar', { position: this.position, volume: 0.6, rate: 1.5 });
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.avatar.setPose('death');
    this.avatar.setShield(false);
    this.avatar.setMirror(false);
    this.mirrorTimer = 0;
    this.audio.play('asura-death', { position: this.position, volume: 1 });
    this.rig.shake(1.2);
    for (const s of this.shades) s.alive = false;
    for (const i of this.illusions) i.alive = false;
    this.projectiles.clear();
    this.hazards.clear();
    this.breakTether();
    this.player.speedScale = 1;
    this.body?.dispose();
    this.body = null;
    const s = 0.01;
    gsap.to(this.avatar.root.scale, { x: s, y: s, z: s, duration: 3.0, delay: 1.2, ease: 'power2.in' });
    gsap.to(this.avatar.root.position, { y: this.position.y - 1.5, duration: 4, delay: 1.0 });
    gsap.delayedCall(4.2, () => this.cb.onDefeated());
  }

  private hurtPlayer(amount: number, source: string): void {
    const now = performance.now();
    if (this.player.dodgeTimer > 0 || now - this.lastPlayerHit < 450) return;
    this.lastPlayerHit = now;
    this.cb.onPlayerHit(amount, source);
  }

  private distanceToPlayer(): number {
    const p = this.player.position;
    const w = this.position;
    return Math.hypot(p.x - w.x, p.z - w.z);
  }

  private facePlayer(dt: number, k = 8): void {
    const p = this.player.position;
    const w = this.position;
    this.avatar.root.rotation.y = dampAngle(this.avatar.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), k, dt);
  }

  /** Angle (rad) between the asura's facing and the direction to the player. */
  private angleToPlayer(): number {
    const p = this.player.position;
    const w = this.position;
    const want = Math.atan2(p.x - w.x, p.z - w.z);
    let d = want - this.avatar.root.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }

  private facing(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.avatar.root.rotation.y), 0, Math.cos(this.avatar.root.rotation.y));
  }

  /** Straight aim from `from` to the player's chest; `lead` (0..1) predicts a fraction of the flight. */
  private aimDir(from: THREE.Vector3, lead: number, speed = this.def.boss.projectileSpeed): THREE.Vector3 {
    const p = this.player.position;
    const target = new THREE.Vector3(p.x, p.y + 1.0, p.z);
    if (lead > 0) {
      const t = from.distanceTo(target) / speed;
      target.x += this.player.velocity.x * t * lead;
      target.z += this.player.velocity.z * t * lead;
    }
    return target.sub(from).normalize();
  }

  private hand(side: 'left' | 'right'): THREE.Vector3 {
    return this.avatar.handWorld(side, new THREE.Vector3());
  }

  private floorY(x: number, z: number, yHint: number): number {
    const hit = this.engine.physics.raycast(new THREE.Vector3(x, yHint + 3, z), new THREE.Vector3(0, -1, 0), 12, undefined, (c) => !Array.from(this.projectiles.ignore()).includes(c));
    return hit ? hit.point.y : yHint;
  }

  private clampToArena(target: THREE.Vector3): THREE.Vector3 {
    const c = this.def.arenaCenter;
    const dx = target.x - c[0];
    const dz = target.z - c[2];
    const d = Math.hypot(dx, dz);
    const r = this.def.arenaRadius - 2;
    if (d > r) {
      target.x = c[0] + (dx / d) * r;
      target.z = c[2] + (dz / d) * r;
    }
    return target;
  }

  /** Walk toward a point on the floor (gravity, steps and obstacles handled by the body). */
  private moveToward(target: THREE.Vector3, speed: number, stop: number, dt: number): boolean {
    const w = this.position;
    this.tmp.set(target.x - w.x, 0, target.z - w.z);
    const d = this.tmp.length();
    if (d <= stop + 0.01) {
      this.walkSpeed = 0;
      this.body?.move(w, 0, 0, dt);
      return true;
    }
    this.tmp.divideScalar(d);
    // No pathfinding: when a pillar or block stack blocks the straight line, slide sideways for a moment.
    if (this.sidestep > 0) {
      this.sidestep -= dt;
      this.tmp.set(-this.tmp.z * this.sidestepSign + this.tmp.x * 0.3, 0, this.tmp.x * this.sidestepSign + this.tmp.z * 0.3).normalize();
    }
    this.tmp.multiplyScalar(Math.min(d - stop, speed * dt));
    this.body?.move(w, this.tmp.x, this.tmp.z, dt);
    if (this.body?.blocked) {
      this.stuckTime += dt;
      if (this.stuckTime > 0.35 && this.sidestep <= 0) {
        this.sidestep = 0.9;
        this.sidestepSign = Math.random() < 0.5 ? -1 : 1;
        this.stuckTime = 0;
      }
    } else this.stuckTime = Math.max(0, this.stuckTime - dt);
    this.walkSpeed = speed;
    return false;
  }

  // ---- projectiles & hazards --------------------------------------------------------------------

  private throwShard(from: THREE.Vector3, dir: THREE.Vector3, opts: { speed?: number; damage?: number; light?: boolean } = {}): void {
    const b = this.def.boss;
    this.projectiles.spawn({ kind: 'shard', from, dir, speed: opts.speed ?? b.projectileSpeed, damage: opts.damage ?? b.rangedDamage, color: this.color, radius: 0.5, life: 5, ...(opts.light ? { light: true } : {}) });
  }

  private spawnShades(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const at = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
      at.y = this.floorY(at.x, at.z, this.position.y);
      const s = new Shade(this.lib, this.engine, at, this.projectiles.ignore);
      this.engine.scene.add(s.mesh.root);
      this.shades.push(s);
      this.gun.addTarget(s);
    }
    this.audio.play('serpent-hiss', { position: this.position, volume: 0.6, rate: 1.1 });
  }

  private spawnIllusions(): void {
    this.clearIllusions();
    const p = this.player.position;
    const around = [Math.PI * 0.25, -Math.PI * 0.25, Math.PI];
    const real = Math.floor(Math.random() * 3);
    const positions = around.map((a) => {
      const base = Math.atan2(this.position.x - p.x, this.position.z - p.z) + a;
      const at = this.clampToArena(new THREE.Vector3(p.x + Math.sin(base) * 12, this.position.y, p.z + Math.cos(base) * 12));
      at.y = this.floorY(at.x, at.z, this.position.y);
      return at;
    });
    const mine = positions[real] as THREE.Vector3;
    this.body?.teleport(this.position, mine.x, mine.z, mine.y);
    positions.forEach((pos, i) => {
      if (i === real) return;
      const ill = new Illusion(this.lib, this.def, pos);
      ill.mesh.root.rotation.y = this.avatar.root.rotation.y;
      this.engine.scene.add(ill.mesh.root);
      this.illusions.push(ill);
      this.gun.addTarget(ill);
    });
    this.audio.play('shimmer', { position: this.position, volume: 0.8, rate: 0.7 });
  }

  private clearIllusions(): void {
    for (const i of this.illusions) {
      this.gun.removeTarget(i);
      this.engine.scene.remove(i.mesh.root);
      i.mesh.dispose();
    }
    this.illusions.length = 0;
  }

  /** Step through the air to a spot behind the player. */
  private teleport(): void {
    const p = this.player.position;
    const back = new THREE.Vector3(Math.sin(this.player.facingYaw), 0, Math.cos(this.player.facingYaw)).multiplyScalar(-1);
    const at = this.clampToArena(new THREE.Vector3(p.x + back.x * 6.5, p.y, p.z + back.z * 6.5));
    at.y = this.floorY(at.x, at.z, p.y);
    this.body?.teleport(this.position, at.x, at.z, at.y);
    this.avatar.root.rotation.y = Math.atan2(p.x - at.x, p.z - at.z);
    this.audio.play('shimmer', { position: this.position, volume: 0.7, rate: 1.2 });
  }

  private startTether(hitPoint: THREE.Vector3): void {
    this.breakTether();
    const knot = new TetherKnot(this.lib, this.color);
    knot.mesh.position.copy(hitPoint);
    const tube = new THREE.Mesh(this.tubeGeo, this.tubeMat);
    this.engine.scene.add(knot.mesh, tube);
    this.gun.addTarget(knot);
    this.tether = { knot, tube, t: 0, tick: 0 };
    this.audio.play('serpent-hiss', { position: hitPoint, volume: 0.6, rate: 0.8 });
  }

  private breakTether(): void {
    if (!this.tether) return;
    const t = this.tether;
    this.gun.removeTarget(t.knot);
    this.engine.scene.remove(t.knot.mesh, t.tube);
    t.knot.dispose();
    this.tether = null;
    if (this.slowTimer <= 0) this.player.speedScale = 1;
  }

  private updateTether(dt: number): void {
    const t = this.tether;
    if (!t) return;
    t.t += dt;
    t.tick += dt;
    const p = this.player.position;
    const hand = this.hand('right');
    const far = this.distanceToPlayer() > 16;
    if (!t.knot.alive || t.t > 5 || far) {
      this.audio.play('shimmer', { position: t.knot.mesh.position, volume: 0.5, rate: 1.6 });
      this.breakTether();
      return;
    }
    // The knot rides the vine a third of the way from the player; the vine runs hand → knot → player.
    t.knot.mesh.position.set(p.x + (hand.x - p.x) * 0.35, p.y + 1.1 + (hand.y - p.y - 1.1) * 0.35, p.z + (hand.z - p.z) * 0.35);
    this.chest.set(p.x, p.y + 1.0, p.z);
    t.tube.position.copy(hand).lerp(this.chest, 0.5);
    t.tube.scale.set(1, Math.max(0.01, hand.distanceTo(this.chest)), 1);
    t.tube.quaternion.setFromUnitVectors(UP, this.tmp.copy(this.chest).sub(hand).normalize());
    this.player.speedScale = 0.6;
    if (t.tick > 1.2) {
      t.tick = 0;
      this.hurtPlayer(5, 'tether');
    }
  }

  // ---- attacks ----------------------------------------------------------------------------------

  private beginAttack(kind?: AttackKind): void {
    const b = this.def.boss;
    const pool = b.patterns;
    let pick = kind ?? pool[Math.floor(Math.random() * pool.length)] ?? 'shard';
    if (pick === 'shield' && (this.shieldHits > 0 || b.shieldHits === 0)) pick = pool[0] ?? 'shard';
    if (pick === 'mirror-shield' && this.mirrorTimer > 0) pick = 'radial-burst';
    if (pick === 'illusion' && this.illusions.some((i) => i.alive)) pick = b.teleportFollowUp ?? 'charge';
    if (pick === 'summon' && this.shades.filter((s) => s.alive).length >= 3) pick = pool[0] ?? 'charge';
    if (pick === 'tether' && this.tether) pick = 'root-trap';
    if (pick === 'mace-flurry' && this.distanceToPlayer() > 5) pick = 'charge';
    if (pick === 'bellow' && this.distanceToPlayer() > 12) pick = 'charge';
    if (pick === 'leap-slam' && this.distanceToPlayer() < 3) pick = 'slam';
    if (pick === 'petal-ring' && this.distanceToPlayer() > 10) pick = 'arrow-fan';
    this.attack = pick;
    this.stage = 0;
    this.attackTimer = 0;
    this.counter = 0;
    this.state = 'attack';
  }

  private startDash(length: number, speed: number, pose: 'charge' | 'lunge'): void {
    const p = this.player.position;
    this.chargeDir.set(p.x - this.position.x, 0, p.z - this.position.z);
    const d = this.chargeDir.length() || 1;
    this.chargeDir.divideScalar(d);
    this.chargeLeft = Math.min(d + 2.5, length);
    this.chargeSpeed = speed;
    this.dashTime = 0;
    this.avatar.setPose(pose);
    this.audio.play('asura-roar', { position: this.position, volume: 0.6, rate: 1.3 });
  }

  /** Advance a dash; returns true when it has ended (distance covered or a wall). */
  private dash(dt: number, burn: boolean): boolean {
    const step = Math.min(this.chargeLeft, this.chargeSpeed * dt);
    this.body?.move(this.position, this.chargeDir.x * step, this.chargeDir.z * step, dt);
    this.chargeLeft -= step;
    this.walkSpeed = this.chargeSpeed;
    if (burn) {
      this.burnDrop -= dt;
      if (this.burnDrop <= 0) {
        this.burnDrop = 0.16;
        this.hazards.burn(this.position.clone(), 1.1, 3.6, 7);
      }
    }
    if (this.distanceToPlayer() < 2.0 * this.scale) this.hurtPlayer(this.def.boss.meleeDamage, 'charge');
    this.dashTime += dt;
    return this.chargeLeft <= 0.01 || Boolean(this.body?.blocked) || this.dashTime > 2.2;
  }

  /** A melee sweep in front: hits within `reach` and half-angle `arc`. */
  private sweep(reach: number, arc: number, damage: number, source: string): void {
    if (this.distanceToPlayer() < reach * this.scale && this.angleToPlayer() < arc) this.hurtPlayer(damage, source);
    this.audio.play('axe-swing', { position: this.position, volume: 0.7, rate: 0.7 + Math.random() * 0.2 });
  }

  private updateAttack(dt: number): void {
    const b = this.def.boss;
    const p = this.player.position;
    this.attackTimer += dt;
    const t = this.attackTimer;
    const lead = this.def.task >= 5 ? 0.3 : 0;
    // Everyone keeps facing the player while winding up, except mid-dash.
    switch (this.attack) {
      // ---- shared -----------------------------------------------------------------------------
      case 'charge':
      case 'fire-charge':
        if (this.stage === 0) {
          this.facePlayer(dt, 10);
          this.avatar.setPose('slam-wind');
          if (t > 0.7) {
            this.stage = 1;
            this.attackTimer = 0;
            this.burnDrop = 0;
            this.startDash(24, 9, 'charge');
          }
        } else if (this.stage === 1) {
          if (this.dash(dt, this.attack === 'fire-charge')) {
            this.stage = 2;
            this.attackTimer = 0;
            this.avatar.setPose('stagger');
            this.walkSpeed = 0;
          }
        } else if (t > 1.1) this.endAttack();
        break;
      case 'slam':
        if (this.stage === 0) {
          this.facePlayer(dt);
          this.avatar.setPose('slam-wind');
          if (t > 0.9) {
            this.stage = 1;
            this.attackTimer = 0;
            this.avatar.setPose('slam');
            this.hazards.shockRing(this.position.clone(), b.meleeDamage * 0.75, this.color, this.def.arenaRadius + 4);
            this.audio.play('rumble', { position: this.position, volume: 0.8 });
            this.rig.shake(0.7);
            if (this.distanceToPlayer() < 3.2 * this.scale) this.hurtPlayer(b.meleeDamage, 'slam');
          }
        } else if (t > 1.0) this.endAttack();
        break;
      case 'summon':
        this.avatar.setPose('cast');
        if (this.stage === 0 && t > 0.7) {
          this.spawnShades(this.enraged ? 3 : 2);
          this.stage = 1;
        }
        if (t > 1.6) this.endAttack();
        break;
      case 'illusion':
        this.avatar.setPose('cast');
        if (this.stage === 0 && t > 0.5) {
          this.spawnIllusions();
          this.stage = 1;
        }
        if (t > 1.2) this.endAttack();
        break;
      case 'teleport':
        this.avatar.setPose('cast');
        if (t > 0.35) {
          this.teleport();
          const next = b.teleportFollowUp;
          if (next) this.beginAttack(next);
          else this.endAttack();
        }
        break;
      case 'shield':
        this.avatar.setPose('shield');
        if (this.stage === 0 && t > 0.5) {
          this.shieldHits = b.shieldHits;
          this.shieldTimer = 9;
          this.avatar.setShield(true);
          this.cb.onHealth(this.hp, this.maxHp, true);
          this.stage = 1;
          this.audio.play('shimmer', { position: this.position, volume: 0.7 });
        }
        if (t > 1.0) this.endAttack();
        break;
      // ---- Krodhasura: the wrestler's leap ----------------------------------------------------
      case 'leap-slam':
        if (this.stage === 0) {
          this.facePlayer(dt, 10);
          this.avatar.setPose('slam-wind');
          if (t > 0.5) {
            // Mark the landing where the player stands now, then jump to it over one second.
            this.leapFrom.copy(this.position);
            this.leapTo.copy(this.clampToArena(new THREE.Vector3(p.x, p.y, p.z)));
            this.leapTo.y = this.floorY(this.leapTo.x, this.leapTo.z, p.y);
            this.hazards.telegraph(this.leapTo.clone(), 3.6 * this.scale, 1.0, this.color);
            this.audio.play('asura-roar', { position: this.position, volume: 0.7, rate: 0.9 });
            this.avatar.setPose('leap');
            this.stage = 1;
            this.attackTimer = 0;
          }
        } else if (this.stage === 1) {
          const k = clamp(t / 1.0, 0, 1);
          const x = this.leapFrom.x + (this.leapTo.x - this.leapFrom.x) * k;
          const z = this.leapFrom.z + (this.leapTo.z - this.leapFrom.z) * k;
          const y = this.leapFrom.y + (this.leapTo.y - this.leapFrom.y) * k + Math.sin(k * Math.PI) * 4.5;
          this.body?.teleport(this.position, x, z, y);
          this.position.y = y;
          this.walkSpeed = 0;
          if (k >= 1) {
            this.body?.teleport(this.position, this.leapTo.x, this.leapTo.z, this.leapTo.y);
            this.avatar.setPose('slam');
            this.hazards.shockRing(this.position.clone(), b.meleeDamage * 0.7, this.color, 22, 12);
            if (this.distanceToPlayer() < 3.6 * this.scale) this.hurtPlayer(b.meleeDamage, 'leap');
            this.audio.play('rumble', { position: this.position, volume: 1 });
            this.rig.shake(1.1);
            this.stage = 2;
            this.attackTimer = 0;
          }
        } else if (t > 0.9) this.endAttack();
        break;
      // ---- Lobhasura: the buffalo's bellow ----------------------------------------------------
      case 'bellow':
        if (this.stage === 0) {
          this.facePlayer(dt, 10);
          this.avatar.setPose('breathe');
          if (t > 0.7) {
            // A wall of air: everything in front within 14 m is shoved back; close, it hurts.
            const mouth = this.avatar.mouthWorld(new THREE.Vector3());
            this.hazards.shockRing(new THREE.Vector3(mouth.x, this.position.y, mouth.z), 0, this.color, 16, 24);
            this.audio.play('asura-roar', { position: this.position, volume: 1, rate: 0.6 });
            this.rig.shake(0.9);
            this.stage = 1;
            this.attackTimer = 0;
          }
        } else if (this.stage === 1) {
          this.tmp.set(p.x - this.position.x, 0, p.z - this.position.z);
          const d = this.tmp.length() || 1;
          this.tmp.divideScalar(d);
          if (d < 14 && this.facing(this.tmpB).dot(this.tmp) > 0.5) {
            this.player.externalPush.addScaledVector(this.tmp, 26 * (1 - d / 14));
            if (t < 0.1 && d < 6) this.hurtPlayer(b.rangedDamage * 0.5, 'bellow');
          }
          if (t > 0.55) {
            this.stage = 2;
            this.attackTimer = 0;
            this.avatar.setPose('idle');
          }
        } else if (t > 0.5) this.endAttack();
        break;
      // ---- Matsarasura: envy ------------------------------------------------------------------
      case 'shard':
        this.facePlayer(dt);
        this.avatar.setPose('throw');
        if (this.stage === 0 && t > 0.55) {
          const from = this.hand('right');
          this.throwShard(from, this.aimDir(from, lead), { light: true });
          this.audio.play('asura-bolt', { position: from, volume: 0.6, rate: 1.1 });
          this.stage = 1;
        }
        if (t > 1.0) this.endAttack();
        break;
      case 'shard-fan':
        this.facePlayer(dt);
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.7) {
          const from = this.hand('right');
          const dir = this.aimDir(from, 0);
          for (const a of [-0.24, 0, 0.24]) this.throwShard(from, dir.clone().applyAxisAngle(UP, a), { damage: b.rangedDamage * 0.8 });
          this.audio.play('asura-bolt', { position: from, volume: 0.7, rate: 0.9 });
          this.stage = 1;
        }
        if (t > 1.2) this.endAttack();
        break;
      case 'envy-orb':
        this.facePlayer(dt);
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.6) {
          // Lob to where the player stands now: the circle shows the landing spot.
          const from = this.hand('left');
          const target = new THREE.Vector3(p.x, p.y, p.z);
          const flight = 1.25;
          const g = 9.81;
          const vel = target.clone().sub(from).divideScalar(flight);
          vel.y += 0.5 * g * flight;
          const speed = vel.length();
          this.hazards.telegraph(target, 2.3, flight, this.color);
          this.projectiles.spawn({
            kind: 'orb',
            from,
            dir: vel.normalize(),
            speed,
            damage: b.rangedDamage,
            color: this.color,
            radius: 0.6,
            gravity: g,
            life: 3,
            light: true,
            onLand: (at) => {
              this.hazards.burn(at, 2.3, 0.5, 0);
              if (Math.hypot(at.x - this.player.position.x, at.z - this.player.position.z) < 2.3 && Math.abs(at.y - this.player.position.y) < 2.5) this.hurtPlayer(b.rangedDamage, 'envy-orb');
              this.audio.play('lantern-out', { position: at, volume: 0.8 });
            },
          });
          this.audio.play('asura-bolt', { position: from, volume: 0.5, rate: 0.6 });
          this.stage = 1;
        }
        if (t > 1.2) this.endAttack();
        break;
      // ---- Madasura: fire ---------------------------------------------------------------------
      case 'flame-breath':
        if (this.stage === 0) {
          this.facePlayer(dt, 10);
          this.avatar.setPose('breathe');
          if (t > 0.6) {
            this.stage = 1;
            this.attackTimer = 0;
            const seconds = this.enraged ? 2.6 : 2.2;
            const mouth = (): THREE.Vector3 => this.avatar.mouthWorld(new THREE.Vector3());
            const dir = (): THREE.Vector3 => this.facing(new THREE.Vector3()).setY(-0.08).normalize();
            this.hazards.flameCone(mouth, dir, 0.4, 11, seconds, 6);
            this.audio.play('asura-roar', { position: this.position, volume: 0.7, rate: 0.7 });
          }
        } else {
          // The breath turns slowly: sideways running escapes it.
          const turn = this.enraged ? 1.5 : 1.0;
          const want = Math.atan2(p.x - this.position.x, p.z - this.position.z);
          let d = want - this.avatar.root.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          this.avatar.root.rotation.y += clamp(d, -turn * dt, turn * dt);
          if (t > (this.enraged ? 2.6 : 2.2) + 0.5) this.endAttack();
        }
        break;
      // ---- Mohasura: the sword ----------------------------------------------------------------
      case 'sword-combo':
        if (this.stage === 0) {
          this.facePlayer(dt, 12);
          this.avatar.setPose('raise');
          if (t > 0.5) {
            this.stage = 1;
            this.attackTimer = 0;
            this.startDash(7, 16, 'lunge');
          }
        } else if (this.stage === 1) {
          if (this.dash(dt, false) || t > 0.5) {
            this.stage = 2;
            this.attackTimer = 0;
            this.avatar.setPose('sweep');
            this.sweep(2.8, 1.1, b.meleeDamage, 'sword');
          }
        } else if (this.stage === 2) {
          this.facePlayer(dt, 6);
          if (t > 0.45) {
            this.stage = 3;
            this.attackTimer = 0;
            this.avatar.setPose('throw');
            this.sweep(3.0, 1.4, b.meleeDamage * 0.8, 'sword');
          }
        } else if (t > 0.9) this.endAttack();
        break;
      case 'blade-throw':
        this.facePlayer(dt);
        this.avatar.setPose('throw');
        if (this.stage === 0 && t > 0.5) {
          const from = this.hand('right');
          this.projectiles.spawn({ kind: 'blade', from, dir: this.aimDir(from, lead), speed: b.projectileSpeed, damage: b.rangedDamage, color: this.color, radius: 0.9, life: 6, boomerang: { range: 14, owner: () => this.position } });
          this.audio.play('axe-swing', { position: from, volume: 0.8, rate: 1.2 });
          this.stage = 1;
        }
        if (t > 1.0) this.endAttack();
        break;
      // ---- Lobhasura: greed -------------------------------------------------------------------
      case 'chain-hook':
        this.facePlayer(dt);
        this.avatar.setPose('throw');
        if (this.stage === 0 && t > 0.6) {
          const from = this.hand('right');
          this.projectiles.spawn({
            kind: 'hook',
            from,
            dir: this.aimDir(from, 0),
            speed: b.projectileSpeed,
            damage: 10,
            color: this.color,
            radius: 0.55,
            life: 1.3,
            chainFrom: () => this.hand('right'),
            onHitPlayer: () => {
              // The yank: a short, hard pull toward the asura, then the follow-up blow.
              this.yankDir.set(this.position.x - this.player.position.x, 0, this.position.z - this.player.position.z).normalize();
              this.yankTimer = 0.35;
              this.stage = 2;
              this.attackTimer = 0;
              this.audio.play('stone-grind', { position: this.position, volume: 0.5, rate: 1.6 });
            },
          });
          this.audio.play('axe-swing', { position: from, volume: 0.7, rate: 0.8 });
          this.stage = 1;
        }
        if (this.stage === 1 && t > 1.8) this.endAttack();
        if (this.stage === 2) {
          this.avatar.setPose('slam-wind');
          if (t > 0.7) {
            this.avatar.setPose('slam');
            this.sweep(3.2, 1.3, b.meleeDamage, 'hook-blow');
            this.stage = 3;
            this.attackTimer = 0;
          }
        }
        if (this.stage === 3 && t > 0.7) this.endAttack();
        break;
      case 'coin-mines':
        this.facePlayer(dt);
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.5) {
          const from = this.hand('left');
          const n = this.enraged ? 5 : 4;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = i === 0 ? 0 : 1.5 + Math.random() * 3;
            const target = this.clampToArena(new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r));
            target.y = this.floorY(target.x, target.z, p.y);
            const flight = 0.9 + Math.random() * 0.3;
            const g = 9.81;
            const vel = target.clone().sub(from).divideScalar(flight);
            vel.y += 0.5 * g * flight;
            this.projectiles.spawn({ kind: 'coin', from, dir: vel.clone().normalize(), speed: vel.length(), damage: 0, color: this.color, radius: 0.01, gravity: g, life: flight + 0.4, onLand: (at) => this.hazards.mine(at, 2.4, 1.6, b.rangedDamage, this.color) });
          }
          this.audio.play('symbol-chime', { position: from, volume: 0.5, rate: 1.4 });
          this.stage = 1;
        }
        if (t > 1.1) this.endAttack();
        break;
      // ---- Krodhasura: wrath ------------------------------------------------------------------
      case 'fissure':
        if (this.stage === 0) {
          this.facePlayer(dt, 10);
          this.avatar.setPose('slam-wind');
          if (t > 0.7) {
            this.stage = 1;
            this.attackTimer = 0;
            this.avatar.setPose('slam');
            const dir = this.tmp.set(p.x - this.position.x, 0, p.z - this.position.z).normalize().clone();
            const from = this.position.clone().addScaledVector(dir, 1.5 * this.scale);
            if (b.weapon === 'horns') {
              // The horns tear two lines; enraged, a third runs straight between them.
              for (const a of [-0.22, 0.22]) this.hazards.fissure(from, dir.clone().applyAxisAngle(UP, a), 12, 22, b.rangedDamage, this.color);
              if (this.enraged) this.hazards.fissure(from, dir, 12, 22, b.rangedDamage * 0.8, this.color);
            } else {
              this.hazards.fissure(from, dir, 11, 20, b.rangedDamage, this.color);
              if (this.enraged) for (const a of [-0.32, 0.32]) this.hazards.fissure(from, dir.clone().applyAxisAngle(UP, a), 11, 18, b.rangedDamage * 0.8, this.color);
            }
            this.audio.play('rumble', { position: this.position, volume: 0.9, rate: 0.8 });
            this.rig.shake(0.6);
          }
        } else if (t > 1.2) this.endAttack();
        break;
      case 'mace-flurry':
        this.facePlayer(dt, 6);
        if (this.stage === 0) {
          this.avatar.setPose('slam-wind');
          if (t > 0.35) {
            this.stage = 1;
            this.attackTimer = 0;
            this.flurry = 0;
          }
        } else if (this.stage === 1) {
          if (t > this.flurry * 0.38) {
            this.avatar.setPose(this.flurry % 2 ? 'sweep' : 'slam');
            this.sweep(2.6, 1.2, b.meleeDamage * 0.6, 'flurry');
            this.flurry++;
            if (this.flurry >= 3) {
              this.stage = 2;
              this.attackTimer = 0;
              this.avatar.setPose('stagger');
            }
          }
        } else if (t > 0.8) this.endAttack();
        break;
      // ---- Kamasura: desire -------------------------------------------------------------------
      case 'arrow-fan':
        this.facePlayer(dt);
        this.avatar.setPose('draw');
        if (this.stage === 0 && t > 0.7) {
          const from = this.hand('left');
          const dir = this.aimDir(from, lead * 0.5);
          const n = this.enraged ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = ((i / (n - 1)) * 2 - 1) * 0.42;
            this.projectiles.spawn({ kind: 'arrow', from, dir: dir.clone().applyAxisAngle(UP, a), speed: b.projectileSpeed, damage: b.rangedDamage * 0.8, color: this.color, radius: 0.4, life: 4 });
          }
          this.audio.play('axe-swing', { position: from, volume: 0.6, rate: 1.6 });
          this.stage = 1;
        }
        if (t > 1.1) this.endAttack();
        break;
      case 'arrow-rain':
        this.facePlayer(dt);
        this.avatar.setPose('draw');
        if (this.stage === 0 && t > 0.6) {
          const n = this.enraged ? 7 : 5;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = i === 0 ? 0 : 1.5 + Math.random() * 4;
            const at = this.clampToArena(new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r));
            at.y = this.floorY(at.x, at.z, p.y);
            this.hazards.arrowRain(at, 1.7, 1.2 + i * 0.08, b.rangedDamage, this.color);
          }
          this.audio.play('axe-swing', { position: this.position, volume: 0.6, rate: 1.8 });
          this.stage = 1;
        }
        if (t > 1.0) this.endAttack();
        break;
      case 'petal-ring':
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.4) {
          this.hazards.petalRing(() => this.position, 3.4 * this.scale, this.enraged ? 7 : 5.5, 8, this.color);
          this.audio.play('shimmer', { position: this.position, volume: 0.6, rate: 1.1 });
          this.stage = 1;
        }
        if (t > 0.8) this.endAttack();
        break;
      // ---- Mamasura: attachment ---------------------------------------------------------------
      case 'root-trap':
        this.facePlayer(dt);
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.5) {
          const spots = [new THREE.Vector3(p.x, p.y, p.z)];
          const v = this.tmp.set(this.player.velocity.x, 0, this.player.velocity.z);
          const along = v.lengthSq() > 0.2 ? v.normalize().clone() : new THREE.Vector3(1, 0, 0);
          spots.push(new THREE.Vector3(p.x + along.x * 2.8, p.y, p.z + along.z * 2.8), new THREE.Vector3(p.x - along.z * 2.6, p.y, p.z + along.x * 2.6));
          if (this.enraged) spots.push(new THREE.Vector3(p.x + along.z * 2.6, p.y, p.z - along.x * 2.6));
          for (const at of spots) {
            this.clampToArena(at);
            at.y = this.floorY(at.x, at.z, p.y);
            this.hazards.rootTrap(at, 1.6, 0.95, 14, this.color, () => {
              this.slowTimer = 1.4;
              this.player.speedScale = 0.5;
            });
          }
          this.audio.play('rumble', { position: p, volume: 0.6, rate: 1.1 });
          this.stage = 1;
        }
        if (t > 1.0) this.endAttack();
        break;
      case 'tether':
        this.facePlayer(dt);
        this.avatar.setPose('throw');
        if (this.stage === 0 && t > 0.6) {
          const from = this.hand('right');
          this.projectiles.spawn({ kind: 'vine', from, dir: this.aimDir(from, 0), speed: b.projectileSpeed, damage: 6, color: this.color, radius: 0.5, life: 1.4, chainFrom: () => this.hand('right'), onHitPlayer: (pr) => this.startTether(pr.position.clone()) });
          this.audio.play('serpent-hiss', { position: from, volume: 0.5, rate: 1.3 });
          this.stage = 1;
        }
        if (t > 1.2) this.endAttack();
        break;
      // ---- Ahamkarasura: ego ------------------------------------------------------------------
      case 'radial-burst':
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.7) {
          const from = this.position.clone();
          from.y += 1.2 * this.scale;
          const n = this.enraged ? 16 : 12;
          const offset = Math.random() * Math.PI * 2;
          for (let i = 0; i < n; i++) {
            const a = offset + (i / n) * Math.PI * 2;
            this.throwShard(from, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), { speed: 12, damage: b.rangedDamage * 0.8 });
          }
          this.audio.play('asura-bolt', { position: from, volume: 0.8, rate: 0.7 });
          this.stage = 1;
        }
        if (t > 1.3) this.endAttack();
        break;
      case 'spiral':
        this.avatar.setPose('raise');
        if (this.stage === 0 && t > 0.5) {
          this.stage = 1;
          this.attackTimer = 0;
          this.counter = 0;
        } else if (this.stage === 1) {
          const every = this.enraged ? 0.09 : 0.12;
          if (t > this.counter * every) {
            const from = this.position.clone();
            from.y += 1.2 * this.scale;
            this.spiralAngle += 0.44;
            this.throwShard(from, new THREE.Vector3(Math.sin(this.spiralAngle), 0, Math.cos(this.spiralAngle)), { speed: 11, damage: b.rangedDamage * 0.7 });
            this.counter++;
          }
          if (t > 3.0) {
            this.stage = 2;
            this.attackTimer = 0;
            this.avatar.setPose('stagger');
          }
        } else if (t > 0.8) this.endAttack();
        break;
      case 'mirror-shield':
        this.facePlayer(dt);
        this.avatar.setPose('mirror');
        if (this.stage === 0 && t > 0.5) {
          this.mirrorTimer = 6;
          this.avatar.setMirror(true);
          this.audio.play('shimmer', { position: this.position, volume: 0.8, rate: 0.9 });
          this.stage = 1;
        }
        if (t > 0.9) this.endAttack();
        break;
      default:
        this.endAttack();
    }
  }

  private endAttack(): void {
    this.state = 'idle';
    this.attack = null;
    this.timer = 0;
    const b = this.def.boss;
    const frac = this.hp / this.maxHp;
    const base = b.attackInterval * (0.55 + frac * 0.45) * (this.enraged ? 0.65 : 1);
    this.nextAttackIn = base * (0.8 + Math.random() * 0.4);
    this.avatar.setPose('idle');
  }

  update(dt: number, elapsed: number): void {
    const b = this.def.boss;
    const p = this.player.position;
    this.avatar.animate(dt, elapsed, this.walkSpeed);
    for (const i of this.illusions) i.mesh.animate(dt, elapsed, 0);
    for (const s of this.shades) s.mesh.update(dt, elapsed);
    this.chest.set(p.x, p.y + 1.0, p.z);
    // Effects on the player: a slow from roots, the hook's yank.
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0 && !this.tether) this.player.speedScale = 1;
    }
    if (this.yankTimer > 0) {
      this.yankTimer -= dt;
      this.player.externalPush.addScaledVector(this.yankDir, 14);
    }
    this.updateTether(dt);
    if (this.state === 'dormant' || this.state === 'dead') {
      this.walkSpeed = 0;
      this.hazards.update(dt, elapsed, { feet: p, grounded: this.player.grounded, hurt: () => undefined });
      return;
    }
    // Shield and mirror expiry.
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0 && this.shieldHits > 0) {
        this.shieldHits = 0;
        this.avatar.setShield(false);
        this.cb.onHealth(this.hp, this.maxHp, false);
      }
    }
    if (this.mirrorTimer > 0) {
      this.mirrorTimer -= dt;
      if (this.mirrorTimer <= 0) this.avatar.setMirror(false);
    }
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.staggerCooldown = Math.max(0, this.staggerCooldown - dt);
    if (this.state === 'idle') {
      this.timer += dt;
      const d = this.distanceToPlayer();
      const speed = b.speed * (this.enraged ? 1.25 : 1);
      const keep = b.keepDistance;
      if (d > keep + 1) {
        this.moveToward(this.clampToArena(p.clone()), speed, keep, dt);
        this.avatar.setPose(this.meleeWind >= 0 ? 'slam-wind' : 'walk');
        // Safety net without pathfinding: an asura that cannot close the distance for a while steps
        // through the air to a spot in front of the player instead of pacing behind a shelf forever.
        if (d < this.stallBest - 0.5) {
          this.stallBest = d;
          this.stallTime = 0;
        } else this.stallTime += dt;
        if (this.stallTime > 5) {
          this.stallTime = 0;
          this.stallBest = Infinity;
          const fwd = new THREE.Vector3(Math.sin(this.player.facingYaw), 0, Math.cos(this.player.facingYaw));
          const at = this.clampToArena(new THREE.Vector3(p.x + fwd.x * 7, p.y, p.z + fwd.z * 7));
          at.y = this.floorY(at.x, at.z, p.y);
          this.body?.teleport(this.position, at.x, at.z, at.y);
          this.audio.play('shimmer', { position: this.position, volume: 0.7, rate: 1.2 });
        }
      } else {
        this.walkSpeed = 0;
        this.stallTime = 0;
        this.stallBest = Infinity;
        this.body?.move(this.position, 0, 0, dt);
        if (this.meleeWind < 0) this.avatar.setPose('idle');
      }
      this.facePlayer(dt);
      // Melee when adjacent: a visible wind-up, then the blow — step back or dodge through it.
      if (this.meleeWind < 0 && d < 2.6 * this.scale && this.meleeCooldown === 0) {
        this.meleeWind = 0;
        this.avatar.setPose('slam-wind');
      }
      if (this.meleeWind >= 0) {
        this.meleeWind += dt;
        if (this.meleeWind > 0.45) {
          this.meleeWind = -1;
          this.meleeCooldown = 1.6;
          this.avatar.setPose('slam');
          this.sweep(2.5, 1.3, b.meleeDamage, 'melee');
        }
      } else if (this.timer >= this.nextAttackIn) this.beginAttack();
    } else if (this.state === 'attack') {
      this.updateAttack(dt);
    } else if (this.state === 'stagger') {
      this.timer += dt;
      this.walkSpeed = 0;
      this.body?.move(this.position, 0, 0, dt);
      if (this.timer > 0.8) this.endAttack();
    }
    this.projectiles.update(dt, this.chest, 0.55, (dmg, src) => this.hurtPlayer(dmg, src));
    this.hazards.update(dt, elapsed, { feet: p, grounded: this.player.grounded, hurt: (dmg, src) => this.hurtPlayer(dmg, src) });
    // Shades chase and strike; dead ones dissolve.
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const s = this.shades[i] as Shade;
      if (!s.alive) {
        s.body.dispose();
        gsap.to(s.mesh.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.5, onComplete: () => {
          this.engine.scene.remove(s.mesh.root);
          s.mesh.dispose();
        } });
        this.gun.removeTarget(s);
        this.shades.splice(i, 1);
        continue;
      }
      const w = s.mesh.root.position;
      this.tmp.set(p.x - w.x, 0, p.z - w.z);
      const d = this.tmp.length();
      const step = d > 1.2 ? Math.min(d - 1.2, 3.0 * dt) : 0;
      this.tmp.divideScalar(d || 1).multiplyScalar(step);
      s.body.move(w, this.tmp.x, this.tmp.z, dt);
      s.mesh.root.rotation.y = dampAngle(s.mesh.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), 6, dt);
      if (d < 1.4 && Math.random() < dt * 1.2) this.hurtPlayer(12, 'shade');
    }
    // Illusions burst when shot out.
    for (let i = this.illusions.length - 1; i >= 0; i--) {
      const ill = this.illusions[i] as Illusion;
      if (ill.alive) continue;
      this.audio.play('shimmer', { position: ill.mesh.root.position, volume: 0.6, rate: 1.4 });
      this.gun.removeTarget(ill);
      const m = ill.mesh;
      gsap.to(m.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.4, onComplete: () => {
        this.engine.scene.remove(m.root);
        m.dispose();
      } });
      this.illusions.splice(i, 1);
    }
  }

  /** Pause the fight (player respawning): clear what is in the air. */
  hold(seconds: number): void {
    if (this.state === 'dead') return;
    this.state = 'stagger';
    this.attack = null;
    this.timer = -seconds;
    this.meleeWind = -1;
    this.avatar.setPose('idle');
    this.projectiles.clear();
    this.hazards.clear();
    this.breakTether();
    this.yankTimer = 0;
    this.slowTimer = 0;
    this.player.speedScale = 1;
  }

  /** Test hook: force an attack now (from idle). */
  debugAttack(kind: AttackKind): void {
    if (this.state === 'idle' || this.state === 'stagger') this.beginAttack(kind);
  }

  /** Test hook. */
  debugState(): Record<string, unknown> {
    const hs = this.hitSphere();
    return { attack: this.attack, stage: this.stage, projectiles: this.projectiles.count, shades: this.shades.length, illusions: this.illusions.length, tether: this.tether !== null, mirror: this.mirrorTimer > 0, grounded: this.body?.grounded ?? null, bossCenter: hs ? hs.center.toArray() : null, bossRadius: hs?.radius ?? null };
  }

  dispose(): void {
    this.gun.removeTarget(this);
    this.projectiles.dispose();
    this.hazards.dispose();
    this.breakTether();
    this.player.speedScale = 1;
    for (const s of this.shades) {
      this.gun.removeTarget(s);
      s.body.dispose();
      this.engine.scene.remove(s.mesh.root);
      s.mesh.dispose();
    }
    this.shades.length = 0;
    this.clearIllusions();
    this.body?.dispose();
    this.body = null;
    this.engine.scene.remove(this.avatar.root);
    this.avatar.dispose();
    this.tubeGeo.dispose();
    this.tubeMat.dispose();
  }
}
