import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { CameraRig } from '@/player/CameraRig';
import type { MaterialLibrary } from '@/world/Materials';
import { ShadeMesh } from '@/encounters/ShadeMesh';
import { clamp, dampAngle } from '@/util/math';
import { AsuraMesh } from './AsuraMesh';
import type { Gun, Shootable } from './Gun';
import type { AttackKind, MissionDef } from './MissionData';

type State = 'dormant' | 'idle' | 'attack' | 'stagger' | 'dead';

interface Bolt {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}
interface Ring {
  mesh: THREE.Mesh;
  r: number;
  hit: boolean;
}

class Shade implements Shootable {
  hp = 30;
  alive = true;
  readonly mesh: ShadeMesh;
  private readonly pos = new THREE.Vector3();
  constructor(lib: MaterialLibrary, at: THREE.Vector3) {
    this.mesh = new ShadeMesh(lib, 2.4);
    this.mesh.root.position.copy(at);
    this.mesh.root.scale.setScalar(0.01);
    gsap.to(this.mesh.root.scale, { x: 1, y: 1, z: 1, duration: 0.7 });
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
  constructor(lib: MaterialLibrary, color: number, scale: number, at: THREE.Vector3) {
    this.mesh = new AsuraMesh(lib, color, scale);
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

export interface AsuraCallbacks {
  onPlayerHit(damage: number, source: string): void;
  onDefeated(): void;
  onHealth(hp: number, max: number, shielded: boolean): void;
}

/**
 * Boss AI for one asura. Closes distance, picks attacks from its pattern list on a timer that tightens
 * as it is wounded, enrages below a health fraction, and dies with a roar. Every attack is telegraphed.
 */
export class Asura implements Shootable {
  readonly mesh: AsuraMesh;
  hp: number;
  readonly maxHp: number;
  alive = true;
  state: State = 'dormant';
  private timer = 0;
  private attack: AttackKind | null = null;
  private attackStage = 0;
  private attackTimer = 0;
  private nextAttackIn: number;
  private enraged = false;
  private shieldHits = 0;
  private shieldTimer = 0;
  private readonly bolts: Bolt[] = [];
  private readonly rings: Ring[] = [];
  private readonly shades: Shade[] = [];
  private readonly illusions: Illusion[] = [];
  private readonly boltGeo: THREE.SphereGeometry;
  private readonly boltMat: THREE.MeshBasicMaterial;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly chargeFrom = new THREE.Vector3();
  private readonly chargeTo = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private walkSpeed = 0;
  private meleeCooldown = 0;
  private lastPlayerHit = 0;
  private volleyCount = 0;

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
  ) {
    const b = def.boss;
    this.maxHp = b.hp;
    this.hp = startHp !== undefined ? clamp(startHp, 1, b.hp) : b.hp;
    this.mesh = new AsuraMesh(lib, b.color, b.scale);
    this.mesh.root.position.set(def.bossSpawn[0], def.bossSpawn[1], def.bossSpawn[2]);
    this.mesh.root.scale.setScalar(0.01);
    engine.scene.add(this.mesh.root);
    this.nextAttackIn = b.attackInterval;
    this.boltGeo = new THREE.SphereGeometry(0.28, 12, 10);
    this.boltMat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.95, fog: false });
    this.ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    this.ringMat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    gun.addTarget(this);
  }

  /** Rise from the ground (during the narration). */
  appear(): void {
    gsap.to(this.mesh.root.scale, { x: this.def.boss.scale, y: this.def.boss.scale, z: this.def.boss.scale, duration: 2.6, ease: 'power2.out' });
    this.audio.play('asura-roar', { position: this.mesh.root.position, volume: 0.9, rate: 0.8 });
    this.mesh.setPose('idle');
  }

  /** Unleash: the fight starts. */
  wake(): void {
    if (this.state !== 'dormant') return;
    this.state = 'idle';
    this.timer = 0;
    this.cb.onHealth(this.hp, this.maxHp, false);
  }

  get position(): THREE.Vector3 {
    return this.mesh.root.position;
  }

  hitSphere(): { center: THREE.Vector3; radius: number } | null {
    if (!this.alive || this.state === 'dormant' || this.mesh.root.scale.x < 0.3) return null;
    this.hit.copy(this.mesh.root.position);
    this.hit.y += 1.9 * this.def.boss.scale;
    return { center: this.hit, radius: 1.15 * this.def.boss.scale };
  }

  onShot(damage: number, point: THREE.Vector3): void {
    if (!this.alive || this.state === 'dormant') return;
    if (this.shieldHits > 0) {
      this.shieldHits--;
      this.audio.play('asura-hit', { position: point, volume: 0.4, rate: 1.6 });
      if (this.shieldHits === 0) {
        this.mesh.setShield(false);
        this.shieldTimer = 0;
        this.audio.play('shimmer', { position: point, volume: 0.6, rate: 0.7 });
      }
      this.cb.onHealth(this.hp, this.maxHp, this.shieldHits > 0);
      return;
    }
    this.hp = Math.max(0, this.hp - damage);
    this.mesh.hitFlash();
    this.audio.play('asura-hit', { position: point, volume: 0.6, rate: 0.9 + Math.random() * 0.2 });
    this.cb.onHealth(this.hp, this.maxHp, false);
    if (!this.enraged && this.hp / this.maxHp <= this.def.boss.enrageAt) {
      this.enraged = true;
      this.audio.play('asura-roar', { position: this.position, volume: 1, rate: 1.1 });
      this.mesh.coreMat.emissive.set(0xff3030);
    }
    if (this.hp <= 0) this.die();
    else if (this.state === 'idle' && Math.random() < 0.08) {
      this.state = 'stagger';
      this.timer = 0;
      this.mesh.setPose('stagger');
    }
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.mesh.setPose('death');
    this.mesh.setShield(false);
    this.audio.play('asura-death', { position: this.position, volume: 1 });
    this.rig.shake(1.2);
    for (const s of this.shades) s.alive = false;
    for (const i of this.illusions) i.alive = false;
    gsap.to(this.mesh.root.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 3.0, delay: 1.2, ease: 'power2.in' });
    gsap.to(this.mesh.root.position, { y: this.position.y - 1.5, duration: 4, delay: 1.0 });
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
    this.mesh.root.rotation.y = dampAngle(this.mesh.root.rotation.y, Math.atan2(p.x - w.x, p.z - w.z), k, dt);
  }

  private keepInArena(): void {
    const c = this.def.arenaCenter;
    const w = this.position;
    const dx = w.x - c[0];
    const dz = w.z - c[2];
    const d = Math.hypot(dx, dz);
    const r = this.def.arenaRadius - 2;
    if (d > r) {
      w.x = c[0] + (dx / d) * r;
      w.z = c[2] + (dz / d) * r;
    }
  }

  private moveToward(target: THREE.Vector3, speed: number, stop: number, dt: number): boolean {
    const w = this.position;
    this.tmp.set(target.x - w.x, 0, target.z - w.z);
    const d = this.tmp.length();
    if (d <= stop + 0.01) {
      this.walkSpeed = 0;
      return true;
    }
    this.tmp.divideScalar(d);
    w.addScaledVector(this.tmp, Math.min(d - stop, speed * dt));
    this.walkSpeed = speed;
    this.keepInArena();
    return false;
  }

  private spawnBolt(spread = 0): void {
    const b = this.def.boss;
    const from = this.position.clone();
    from.y += 2.0 * b.scale;
    const to = this.player.position.clone();
    to.y += 1.0;
    const dir = to.sub(from).normalize();
    if (spread > 0) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * spread).normalize();
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    mesh.position.copy(from);
    const glow = new THREE.PointLight(b.color, 6, 5, 2);
    mesh.add(glow);
    this.engine.scene.add(mesh);
    this.bolts.push({ mesh, vel: dir.multiplyScalar(b.boltSpeed), life: 6 });
    this.audio.play('asura-bolt', { position: from, volume: 0.6, rate: 0.9 + Math.random() * 0.2 });
  }

  private spawnRing(): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.position);
    mesh.position.y += 0.12;
    this.engine.scene.add(mesh);
    this.rings.push({ mesh, r: 0.6, hit: false });
    this.audio.play('rumble', { position: this.position, volume: 0.8 });
    this.rig.shake(0.7);
  }

  private spawnShades(n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const at = this.position.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
      const s = new Shade(this.lib, at);
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
      return new THREE.Vector3(p.x + Math.sin(base) * 12, this.position.y, p.z + Math.cos(base) * 12);
    });
    this.position.copy(positions[real] as THREE.Vector3);
    positions.forEach((pos, i) => {
      if (i === real) return;
      const ill = new Illusion(this.lib, this.def.boss.color, this.def.boss.scale, pos);
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

  private teleport(): void {
    const p = this.player.position;
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * 6;
    this.position.set(p.x + Math.cos(a) * d, this.position.y, p.z + Math.sin(a) * d);
    this.keepInArena();
    this.audio.play('shimmer', { position: this.position, volume: 0.7, rate: 1.2 });
  }

  private beginAttack(): void {
    const b = this.def.boss;
    const pool = b.patterns;
    this.attack = pool[Math.floor(Math.random() * pool.length)] ?? 'bolt';
    // Shield only when not already up; illusions only when none are alive.
    if (this.attack === 'shield' && (this.shieldHits > 0 || b.shieldHits === 0)) this.attack = 'bolt';
    if (this.attack === 'illusion' && this.illusions.some((i) => i.alive)) this.attack = 'volley';
    if (this.attack === 'summon' && this.shades.filter((s) => s.alive).length >= 3) this.attack = 'bolt';
    this.attackStage = 0;
    this.attackTimer = 0;
    this.state = 'attack';
    this.volleyCount = 0;
  }

  private updateAttack(dt: number): void {
    const b = this.def.boss;
    const p = this.player.position;
    this.attackTimer += dt;
    const t = this.attackTimer;
    switch (this.attack) {
      case 'bolt':
        this.facePlayer(dt);
        this.mesh.setPose('cast');
        if (this.attackStage === 0 && t > 0.6) {
          this.spawnBolt();
          this.attackStage = 1;
        }
        if (t > 1.1) this.endAttack();
        break;
      case 'volley': {
        this.facePlayer(dt);
        this.mesh.setPose('cast');
        const total = this.enraged ? 6 : 4;
        if (t > 0.5 + this.volleyCount * 0.22 && this.volleyCount < total) {
          this.spawnBolt(0.35);
          this.volleyCount++;
        }
        if (this.volleyCount >= total && t > 0.5 + total * 0.22 + 0.4) this.endAttack();
        break;
      }
      case 'charge':
        if (this.attackStage === 0) {
          this.facePlayer(dt, 10);
          this.mesh.setPose('slam-wind');
          if (t > 0.7) {
            this.attackStage = 1;
            this.attackTimer = 0;
            this.chargeFrom.copy(this.position);
            this.tmp.set(p.x - this.position.x, 0, p.z - this.position.z);
            const d = this.tmp.length() || 1;
            this.chargeTo.copy(this.position).addScaledVector(this.tmp.divideScalar(d), Math.min(d + 2.5, 24));
            this.mesh.setPose('charge');
            this.audio.play('asura-roar', { position: this.position, volume: 0.6, rate: 1.3 });
          }
        } else if (this.attackStage === 1) {
          const k = clamp(t / 0.6, 0, 1);
          this.position.lerpVectors(this.chargeFrom, this.chargeTo, k * k);
          this.keepInArena();
          this.walkSpeed = 8;
          if (this.distanceToPlayer() < 2.0 * b.scale) this.hurtPlayer(b.meleeDamage, 'charge');
          if (k >= 1) {
            this.attackStage = 2;
            this.attackTimer = 0;
            this.mesh.setPose('stagger');
            this.walkSpeed = 0;
          }
        } else if (t > 1.1) this.endAttack();
        break;
      case 'slam':
        if (this.attackStage === 0) {
          this.facePlayer(dt);
          this.mesh.setPose('slam-wind');
          if (t > 0.9) {
            this.attackStage = 1;
            this.attackTimer = 0;
            this.mesh.setPose('slam');
            this.spawnRing();
            if (this.distanceToPlayer() < 3.2 * b.scale) this.hurtPlayer(b.meleeDamage, 'slam');
          }
        } else if (t > 1.0) this.endAttack();
        break;
      case 'summon':
        this.mesh.setPose('cast');
        if (this.attackStage === 0 && t > 0.7) {
          this.spawnShades(this.enraged ? 3 : 2);
          this.attackStage = 1;
        }
        if (t > 1.6) this.endAttack();
        break;
      case 'illusion':
        this.mesh.setPose('cast');
        if (this.attackStage === 0 && t > 0.5) {
          this.spawnIllusions();
          this.attackStage = 1;
        }
        if (t > 1.2) this.endAttack();
        break;
      case 'teleport':
        this.mesh.setPose('cast');
        if (this.attackStage === 0 && t > 0.35) {
          this.teleport();
          this.attackStage = 1;
        }
        if (this.attackStage === 1 && t > 0.9) {
          this.spawnBolt();
          this.attackStage = 2;
        }
        if (t > 1.4) this.endAttack();
        break;
      case 'pull': {
        this.facePlayer(dt);
        this.mesh.setPose('cast');
        if (t > 0.4 && t < 2.4) {
          this.tmp.set(this.position.x - p.x, 0, this.position.z - p.z);
          const d = this.tmp.length() || 1;
          if (d > 2.5) this.player.externalPush.addScaledVector(this.tmp.divideScalar(d), 3.6 + (this.enraged ? 1.4 : 0));
        }
        if (this.attackStage === 0 && t > 2.4) {
          this.attackStage = 1;
          this.mesh.setPose('slam');
          this.spawnRing();
          if (this.distanceToPlayer() < 3.4 * b.scale) this.hurtPlayer(b.meleeDamage, 'pull');
        }
        if (t > 3.4) this.endAttack();
        break;
      }
      case 'shield':
        this.mesh.setPose('shield');
        if (this.attackStage === 0 && t > 0.5) {
          this.shieldHits = b.shieldHits;
          this.shieldTimer = 9;
          this.mesh.setShield(true);
          this.cb.onHealth(this.hp, this.maxHp, true);
          this.attackStage = 1;
          this.audio.play('shimmer', { position: this.position, volume: 0.7 });
        }
        if (t > 1.0) this.endAttack();
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
    this.mesh.setPose('idle');
  }

  update(dt: number, elapsed: number): void {
    const b = this.def.boss;
    const p = this.player.position;
    this.mesh.animate(dt, elapsed, this.walkSpeed);
    for (const i of this.illusions) i.mesh.animate(dt, elapsed, 0);
    for (const s of this.shades) s.mesh.update(dt, elapsed);
    if (this.state === 'dormant' || this.state === 'dead') {
      this.walkSpeed = 0;
      return;
    }
    // Shield expiry.
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0 && this.shieldHits > 0) {
        this.shieldHits = 0;
        this.mesh.setShield(false);
        this.cb.onHealth(this.hp, this.maxHp, false);
      }
    }
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    if (this.state === 'idle') {
      this.timer += dt;
      const d = this.distanceToPlayer();
      const speed = b.speed * (this.enraged ? 1.25 : 1);
      // Casters keep some distance; everyone closes when far.
      const prefers = b.patterns.filter((x) => x === 'bolt' || x === 'volley').length >= b.patterns.length / 2 ? 7 : 3;
      if (d > prefers + 1) {
        this.moveToward(p, speed, prefers, dt);
        this.mesh.setPose('walk');
      } else {
        this.walkSpeed = 0;
        this.mesh.setPose('idle');
      }
      this.facePlayer(dt);
      // Melee when adjacent.
      if (d < 2.3 * b.scale && this.meleeCooldown === 0) {
        this.meleeCooldown = 1.6;
        this.mesh.setPose('slam');
        this.hurtPlayer(b.meleeDamage, 'melee');
        this.audio.play('axe-swing', { position: this.position, volume: 0.7, rate: 0.7 });
      }
      if (this.timer >= this.nextAttackIn) this.beginAttack();
    } else if (this.state === 'attack') {
      this.updateAttack(dt);
    } else if (this.state === 'stagger') {
      this.timer += dt;
      this.walkSpeed = 0;
      if (this.timer > 0.8) this.endAttack();
    }
    // Bolts.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i] as Bolt;
      // Light homing toward the player's chest.
      this.tmp.set(p.x - bolt.mesh.position.x, p.y + 1 - bolt.mesh.position.y, p.z - bolt.mesh.position.z);
      const d = this.tmp.length();
      if (d > 0.01) {
        this.tmp.divideScalar(d);
        bolt.vel.lerp(this.tmp.multiplyScalar(b.boltSpeed), clamp(dt * (this.enraged ? 2.2 : 1.4), 0, 1));
      }
      bolt.mesh.position.addScaledVector(bolt.vel, dt);
      bolt.life -= dt;
      const hitP = Math.hypot(bolt.mesh.position.x - p.x, bolt.mesh.position.y - (p.y + 1), bolt.mesh.position.z - p.z) < 0.9;
      const wall = bolt.life < 5.9 && this.engine.physics.raycast(bolt.mesh.position, bolt.vel.clone().normalize(), 0.4, this.player.collider) !== null;
      if (hitP || wall || bolt.life <= 0) {
        if (hitP) this.hurtPlayer(b.boltDamage, 'bolt');
        this.engine.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
      }
    }
    // Rings.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i] as Ring;
      ring.r += dt * 10;
      ring.mesh.scale.setScalar(ring.r);
      const d = Math.hypot(ring.mesh.position.x - p.x, ring.mesh.position.z - p.z);
      if (!ring.hit && Math.abs(d - ring.r) < 0.7) {
        ring.hit = true;
        if (this.player.grounded) this.hurtPlayer(b.meleeDamage * 0.75, 'ring');
      }
      if (ring.r > this.def.arenaRadius + 4) {
        this.engine.scene.remove(ring.mesh);
        this.rings.splice(i, 1);
      }
    }
    // Shades chase and strike; dead ones dissolve.
    for (let i = this.shades.length - 1; i >= 0; i--) {
      const s = this.shades[i] as Shade;
      if (!s.alive) {
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
      if (d > 1.2) w.addScaledVector(this.tmp.divideScalar(d), Math.min(d - 1.2, 3.0 * dt));
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

  /** Pause the fight (player respawning). */
  hold(seconds: number): void {
    if (this.state === 'dead') return;
    this.state = 'stagger';
    this.timer = -seconds;
    this.mesh.setPose('idle');
    for (const bolt of this.bolts) this.engine.scene.remove(bolt.mesh);
    this.bolts.length = 0;
  }

  dispose(): void {
    this.gun.removeTarget(this);
    for (const bolt of this.bolts) this.engine.scene.remove(bolt.mesh);
    for (const r of this.rings) this.engine.scene.remove(r.mesh);
    for (const s of this.shades) {
      this.gun.removeTarget(s);
      this.engine.scene.remove(s.mesh.root);
      s.mesh.dispose();
    }
    this.clearIllusions();
    this.engine.scene.remove(this.mesh.root);
    this.mesh.dispose();
    this.boltGeo.dispose();
    this.boltMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
  }
}
