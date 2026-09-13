import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { RAPIER } from '@/engine/Physics';
import type { MaterialLibrary } from '@/world/Materials';

export type ProjectileKind = 'shard' | 'orb' | 'blade' | 'hook' | 'coin' | 'arrow' | 'vine';

export interface ProjectileSpec {
  kind: ProjectileKind;
  from: THREE.Vector3;
  /** Launch direction (normalised). The projectile keeps flying along it; nothing homes. */
  dir: THREE.Vector3;
  speed: number;
  damage: number;
  color: number;
  /** Hit radius against the player (m). */
  radius?: number;
  /** Seconds before it fades. */
  life?: number;
  /** Downward acceleration for lobbed things (orbs, coins). */
  gravity?: number;
  /** Fly out `range` metres then come straight back to `owner`; hits on both passes. */
  boomerang?: { range: number; owner: () => THREE.Vector3 };
  /** Draw a chain / vine from this moving point to the projectile. */
  chainFrom?: () => THREE.Vector3;
  /** Add a point light (single dramatic shots only; bursts use sprite glow). */
  light?: boolean;
  onHitPlayer?: (p: Projectile) => void;
  /** Called where the projectile stops in the world (floor, wall) or expires. */
  onLand?: (position: THREE.Vector3) => void;
}

export interface Projectile {
  readonly spec: ProjectileSpec;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  life: number;
  /** Boomerangs: 'out' then 'back'. */
  phase: 'out' | 'back';
  traveled: number;
  hitThisPass: boolean;
  readonly mesh: THREE.Object3D;
  chain: THREE.Mesh | null;
  dead: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * Every thrown thing in a fight: crystal shards, the envy orb, the returning blade, the hook on its
 * chain, coins that land as mines, arrows and vines. Straight-line flight (plus gravity for lobs),
 * continuous collision against the world, sphere tests against the player.
 */
export class Projectiles {
  private readonly list: Projectile[] = [];
  private readonly geos = new Map<string, THREE.BufferGeometry>();
  private readonly mats = new Map<string, THREE.Material>();
  private readonly tmp = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();
  /** Colliders projectiles must ignore (the thrower, the player). */
  ignore: () => Iterable<RAPIER.Collider> = () => [];

  constructor(
    private readonly engine: Engine,
    private readonly lib: MaterialLibrary,
  ) {}

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(key);
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }
  private mat(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m;
  }
  private glow(color: number, size: number): THREE.Sprite {
    const s = new THREE.Sprite(this.mat(`glow:${color}`, () => new THREE.SpriteMaterial({ map: this.lib.glowTexture, color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })) as THREE.SpriteMaterial);
    s.scale.set(size, size, 1);
    return s;
  }

  private build(spec: ProjectileSpec): THREE.Object3D {
    const c = spec.color;
    const group = new THREE.Group();
    const basic = (key: string, color: number, opacity = 1): THREE.Material => this.mat(`basic:${key}:${color}`, () => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false }));
    const std = (key: string, opts: THREE.MeshStandardMaterialParameters): THREE.Material => this.mat(`std:${key}`, () => new THREE.MeshStandardMaterial(opts));
    switch (spec.kind) {
      case 'shard': {
        const m = new THREE.Mesh(this.geo('shard', () => new THREE.OctahedronGeometry(0.2, 0)), basic('shard', c));
        m.scale.set(0.7, 0.7, 2.6);
        group.add(m, this.glow(c, 1.1));
        break;
      }
      case 'orb': {
        const m = new THREE.Mesh(this.geo('orb', () => new THREE.SphereGeometry(0.42, 14, 12)), std('orb', { color: 0x120a18, emissive: c, emissiveIntensity: 0.9, roughness: 0.4 }));
        group.add(m, this.glow(c, 1.8));
        break;
      }
      case 'blade': {
        const metal = std('blade', { color: 0xc8ccd4, metalness: 0.95, roughness: 0.2, emissive: c, emissiveIntensity: 0.25 });
        for (let i = 0; i < 4; i++) {
          const seg = new THREE.Mesh(this.geo('blade-seg', () => new THREE.BoxGeometry(0.03, 0.5, 0.2)), metal);
          seg.position.set(0, 0.45 + i * 0.45, Math.sin(i * 0.35) * 0.4);
          seg.rotation.x = -i * 0.3;
          group.add(seg);
        }
        const tip = new THREE.Mesh(this.geo('blade-tip', () => new THREE.ConeGeometry(0.1, 0.4, 4)), metal);
        tip.position.set(0, 2.1, 0.6);
        group.add(tip);
        group.add(this.glow(c, 1.4));
        break;
      }
      case 'hook': {
        const metal = std('hook', { color: 0xb8bcc4, metalness: 0.95, roughness: 0.25 });
        const hook = new THREE.Mesh(this.geo('hook-ring', () => new THREE.TorusGeometry(0.2, 0.045, 6, 14, Math.PI * 1.4)), metal);
        hook.rotation.y = Math.PI / 2;
        const tip = new THREE.Mesh(this.geo('hook-tip', () => new THREE.ConeGeometry(0.06, 0.3, 6)), metal);
        tip.position.set(0, 0.2, 0.2);
        tip.rotation.x = 0.5;
        group.add(hook, tip, this.glow(c, 0.7));
        break;
      }
      case 'coin': {
        const m = new THREE.Mesh(this.geo('coin', () => new THREE.CylinderGeometry(0.24, 0.24, 0.06, 18)), std('coin', { color: 0xe8b84a, metalness: 0.9, roughness: 0.25, emissive: 0x9a6a10, emissiveIntensity: 0.5 }));
        group.add(m, this.glow(c, 0.9));
        break;
      }
      case 'arrow': {
        const shaft = new THREE.Mesh(this.geo('arrow-shaft', () => new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5)), std('arrow-wood', { color: 0x6a4a2a, roughness: 0.8 }));
        shaft.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(this.geo('arrow-tip', () => new THREE.ConeGeometry(0.035, 0.16, 5)), std('arrow-metal', { color: 0xd8dce4, metalness: 0.9, roughness: 0.3 }));
        tip.position.z = 0.55;
        tip.rotation.x = Math.PI / 2;
        const fin = new THREE.Mesh(this.geo('arrow-fin', () => new THREE.PlaneGeometry(0.08, 0.18)), basic('fin', c, 0.9));
        fin.position.z = -0.4;
        const fin2 = fin.clone();
        fin2.rotation.z = Math.PI / 2;
        group.add(shaft, tip, fin, fin2, this.glow(c, 0.5));
        break;
      }
      case 'vine': {
        const m = new THREE.Mesh(this.geo('vine', () => new THREE.CapsuleGeometry(0.09, 0.9, 4, 8)), std('vine', { color: 0x3d7a34, roughness: 0.8, emissive: 0x1e4a1a, emissiveIntensity: 0.6 }));
        m.rotation.x = Math.PI / 2;
        const leaf = new THREE.Mesh(this.geo('leaf', () => new THREE.ConeGeometry(0.12, 0.3, 4)), std('leaf', { color: 0x5aa04a, roughness: 0.8 }));
        leaf.position.set(0.1, 0.05, -0.2);
        leaf.rotation.z = -1.2;
        group.add(m, leaf, this.glow(c, 0.8));
        break;
      }
    }
    if (spec.light) {
      const l = new THREE.PointLight(c, 8, 6, 2);
      group.add(l);
    }
    return group;
  }

  spawn(spec: ProjectileSpec): Projectile {
    const mesh = this.build(spec);
    mesh.position.copy(spec.from);
    this.engine.scene.add(mesh);
    let chain: THREE.Mesh | null = null;
    if (spec.chainFrom) {
      chain = new THREE.Mesh(this.geo('chain', () => new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1)), this.mat(spec.kind === 'vine' ? 'chain-vine' : 'chain-metal', () => new THREE.MeshStandardMaterial(spec.kind === 'vine' ? { color: 0x3d7a34, roughness: 0.85, emissive: 0x1e4a1a, emissiveIntensity: 0.5 } : { color: 0x9a9ea6, metalness: 0.9, roughness: 0.35 })));
      this.engine.scene.add(chain);
    }
    const p: Projectile = { spec, position: mesh.position, velocity: spec.dir.clone().normalize().multiplyScalar(spec.speed), life: spec.life ?? 5, phase: 'out', traveled: 0, hitThisPass: false, mesh, chain, dead: false };
    this.orient(p);
    this.list.push(p);
    return p;
  }

  private orient(p: Projectile): void {
    const v = p.velocity;
    if (v.lengthSq() < 1e-6) return;
    this.tmp.copy(v).normalize();
    if (p.spec.kind === 'blade' || p.spec.kind === 'coin') return; // they spin instead
    p.mesh.quaternion.setFromUnitVectors(FORWARD, this.tmp);
  }

  private updateChain(p: Projectile): void {
    if (!p.chain || !p.spec.chainFrom) return;
    const a = p.spec.chainFrom();
    const b = p.position;
    const len = a.distanceTo(b);
    p.chain.position.copy(a).lerp(b, 0.5);
    p.chain.scale.set(1, Math.max(0.01, len), 1);
    this.tmp.copy(b).sub(a).normalize();
    p.chain.quaternion.setFromUnitVectors(UP, this.tmp);
  }

  /** Advance every projectile. `chest` is the player's chest position; `playerRadius` its hit radius. */
  update(dt: number, chest: THREE.Vector3, playerRadius: number, hurt: (damage: number, source: string) => void): void {
    const ignore = Array.from(this.ignore());
    const pred = (c: RAPIER.Collider): boolean => !ignore.includes(c);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i] as Projectile;
      const s = p.spec;
      if (p.dead) {
        this.remove(i);
        continue;
      }
      p.life -= dt;
      if (s.gravity) p.velocity.y -= s.gravity * dt;
      if (s.boomerang) {
        if (p.phase === 'out' && p.traveled >= s.boomerang.range) this.turnBack(p);
        if (p.phase === 'back') {
          const owner = s.boomerang.owner();
          this.tmp.set(owner.x - p.position.x, owner.y + 1.6 - p.position.y, owner.z - p.position.z);
          const d = this.tmp.length();
          if (d < 1.2) {
            this.remove(i);
            continue;
          }
          p.velocity.copy(this.tmp.divideScalar(d).multiplyScalar(s.speed));
        }
      }
      const stepLen = p.velocity.length() * dt;
      this.tmpB.copy(p.position);
      // World collision: a ray along this frame's motion.
      if (stepLen > 1e-5) {
        this.tmp.copy(p.velocity).normalize();
        const hit = this.engine.physics.raycast(p.position, this.tmp, stepLen + 0.25, undefined, pred);
        if (hit) {
          if (s.boomerang && p.phase === 'out') {
            p.position.copy(hit.point).addScaledVector(this.tmp, -0.3);
            this.turnBack(p);
          } else {
            s.onLand?.(hit.point.clone().addScaledVector(hit.normal, 0.05));
            this.remove(i);
            continue;
          }
        }
      }
      p.position.addScaledVector(p.velocity, dt);
      p.traveled += stepLen;
      // Player.
      if (!p.hitThisPass) {
        const r = (s.radius ?? 0.5) + playerRadius;
        if (p.position.distanceToSquared(chest) < r * r) {
          p.hitThisPass = true;
          hurt(s.damage, s.kind);
          s.onHitPlayer?.(p);
          if (!s.boomerang) {
            s.onLand?.(p.position.clone());
            this.remove(i);
            continue;
          }
        }
      }
      if (p.life <= 0) {
        s.onLand?.(p.position.clone());
        this.remove(i);
        continue;
      }
      // Visuals.
      if (s.kind === 'blade') p.mesh.rotation.y += dt * 28;
      else if (s.kind === 'coin') {
        p.mesh.rotation.x += dt * 9;
        p.mesh.rotation.z += dt * 4;
      } else this.orient(p);
      this.updateChain(p);
    }
    void this.tmpM;
    void this.tmpQ;
  }

  private turnBack(p: Projectile): void {
    p.phase = 'back';
    p.hitThisPass = false;
    p.traveled = 0;
    p.life = Math.max(p.life, 4);
  }

  private remove(i: number): void {
    const p = this.list[i] as Projectile;
    this.engine.scene.remove(p.mesh);
    if (p.chain) this.engine.scene.remove(p.chain);
    this.list.splice(i, 1);
  }

  get count(): number {
    return this.list.length;
  }

  clear(): void {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }

  dispose(): void {
    this.clear();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geos.clear();
    this.mats.clear();
  }
}
