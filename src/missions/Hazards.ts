import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import { ParticleSystem } from '@/engine/Particles';
import type { MaterialLibrary } from '@/world/Materials';

export interface HazardContext {
  /** Player feet position. */
  feet: THREE.Vector3;
  grounded: boolean;
  hurt(damage: number, source: string): void;
}

interface Hazard {
  /** Returns false when finished. */
  update(dt: number, elapsed: number, ctx: HazardContext): boolean;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

const near = (a: THREE.Vector3, feet: THREE.Vector3, radius: number, height = 2.4): boolean => Math.hypot(a.x - feet.x, a.z - feet.z) < radius && feet.y > a.y - 1.2 && feet.y < a.y + height;

/**
 * Ground and area effects: telegraph circles, expanding shock rings, burning patches, gold mines,
 * fissures that run in a straight line, root eruptions, falling arrows, the petal ring and the
 * flame cone. Each one is drawn on the floor before it can hurt, so it can be seen and left.
 */
export class Hazards {
  private readonly list: Hazard[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
  private readonly discGeo = new THREE.CircleGeometry(1, 32);
  private readonly coneGeo = new THREE.ConeGeometry(0.16, 1.0, 6);
  private readonly rootGeo = new THREE.ConeGeometry(0.22, 1.6, 5);
  private readonly arrowGeo: THREE.BufferGeometry;
  private readonly mats = new Map<string, THREE.Material>();
  /** All fire in the arena (breath, burning ground, bursts) is one particle draw call. */
  private readonly flames: ParticleSystem;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    private readonly lib: MaterialLibrary,
  ) {
    this.arrowGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 5);
    this.arrowGeo.rotateX(Math.PI / 2);
    this.flames = new ParticleSystem(lib.glowTexture, 0xff8a3c, 512);
    this.flames.setViewportHeight(window.innerHeight);
    engine.scene.add(this.flames.points);
  }

  private borrowLight(color: number, intensity: number, distance: number): THREE.PointLight | null {
    return this.engine.lights.acquire(color, intensity, distance, 2);
  }

  private mat<T extends THREE.Material>(key: string, make: () => T): T {
    let m = this.mats.get(key);
    if (!m) {
      m = make();
      this.mats.set(key, m);
    }
    return m as T;
  }
  private additive(color: number, opacity: number): THREE.MeshBasicMaterial {
    return this.mat(`add:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  }
  private spriteMat(color: number): THREE.SpriteMaterial {
    return this.mat(`sprite:${color}`, () => new THREE.SpriteMaterial({ map: this.lib.glowTexture, color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  }
  private add(h: Hazard): void {
    this.list.push(h);
  }

  /** A pulsing circle on the floor: "something lands here". */
  telegraph(center: THREE.Vector3, radius: number, seconds: number, color: number): void {
    const ring = new THREE.Mesh(this.ringGeo, this.additive(color, 0.75).clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(center);
    ring.position.y += 0.06;
    ring.scale.setScalar(radius);
    const fill = new THREE.Mesh(this.discGeo, this.additive(color, 0.12));
    fill.rotation.x = -Math.PI / 2;
    fill.position.copy(ring.position);
    fill.scale.setScalar(radius * 0.96);
    this.engine.scene.add(ring, fill);
    let t = 0;
    const m = ring.material as THREE.MeshBasicMaterial;
    this.add({
      update: (dt, elapsed) => {
        t += dt;
        m.opacity = 0.45 + Math.sin(elapsed * 9) * 0.3;
        // Close in as the moment nears.
        ring.scale.setScalar(radius * (1 - 0.35 * Math.min(1, t / seconds)));
        return t < seconds;
      },
      dispose: () => {
        this.engine.scene.remove(ring, fill);
        m.dispose();
      },
    });
  }

  /** Expanding shock ring from a floor strike; grounded players inside the wavefront are hit once. */
  shockRing(center: THREE.Vector3, damage: number, color: number, maxRadius = 30, speed = 10): void {
    const mesh = new THREE.Mesh(this.ringGeo, this.additive(color, 0.6));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(center);
    mesh.position.y += 0.12;
    this.engine.scene.add(mesh);
    let r = 0.6;
    let hit = false;
    this.add({
      update: (dt, _e, ctx) => {
        r += dt * speed;
        mesh.scale.setScalar(r);
        const d = Math.hypot(center.x - ctx.feet.x, center.z - ctx.feet.z);
        if (!hit && Math.abs(d - r) < 0.7 && Math.abs(ctx.feet.y - center.y) < 1.5) {
          hit = true;
          if (ctx.grounded) ctx.hurt(damage, 'ring');
        }
        return r < maxRadius;
      },
      dispose: () => this.engine.scene.remove(mesh),
    });
  }

  /** A burning patch on the floor (fire charges). */
  burn(center: THREE.Vector3, radius: number, seconds: number, damage: number): void {
    const disc = new THREE.Mesh(this.discGeo, this.additive(0xff6a20, 0.35).clone());
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(center);
    disc.position.y += 0.05;
    disc.scale.setScalar(radius);
    const light = this.borrowLight(0xff7a2a, 12, radius * 4);
    if (light) light.position.set(center.x, center.y + 0.8, center.z);
    this.engine.scene.add(disc);
    let t = 0;
    let emitAcc = 0;
    const m = disc.material as THREE.MeshBasicMaterial;
    this.add({
      update: (dt, elapsed, ctx) => {
        t += dt;
        const k = t < seconds - 0.8 ? 1 : Math.max(0, (seconds - t) / 0.8);
        m.opacity = (0.28 + Math.sin(elapsed * 12) * 0.08) * k;
        if (light) light.intensity = (10 + Math.sin(elapsed * 17) * 3) * k;
        // Licking flames: a few particles a second, rising and fading.
        emitAcc += dt * 9 * k;
        while (emitAcc >= 1) {
          emitAcc -= 1;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * radius * 0.8;
          this.flames.emit({ x: center.x + Math.cos(a) * r, y: center.y + 0.15, z: center.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4, life: 0.7 + Math.random() * 0.4, size: 0.5 + Math.random() * 0.4, grow: 0.9, alpha: 0.75, drag: 1.2, lift: 0.6 });
        }
        if (near(center, ctx.feet, radius, 1.6)) ctx.hurt(damage, 'burn');
        return t < seconds;
      },
      dispose: () => {
        this.engine.scene.remove(disc);
        this.engine.lights.release(light);
        m.dispose();
      },
    });
  }

  /** A coin that lands, blinks, and bursts. */
  mine(center: THREE.Vector3, radius: number, fuse: number, damage: number, color: number): void {
    this.telegraph(center, radius, fuse, color);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 18), this.mat('coin', () => new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 0.9, roughness: 0.25, emissive: 0x9a6a10, emissiveIntensity: 0.6 })));
    coin.position.copy(center);
    coin.position.y += 0.06;
    const glow = new THREE.Sprite(this.spriteMat(color));
    glow.position.copy(coin.position);
    glow.position.y += 0.2;
    glow.scale.set(0.8, 0.8, 1);
    this.engine.scene.add(coin, glow);
    let t = 0;
    let burst: { light: THREE.PointLight | null; sprite: THREE.Sprite; t: number } | null = null;
    this.add({
      update: (dt, elapsed, ctx) => {
        t += dt;
        if (!burst) {
          coin.rotation.y += dt * 6;
          const blink = Math.sin(elapsed * (6 + (t / fuse) * 26)) > 0 ? 1.2 : 0.4;
          glow.scale.set(blink * 0.7, blink * 0.7, 1);
          if (t >= fuse) {
            const light = this.borrowLight(color, 60, radius * 5);
            if (light) light.position.set(center.x, center.y + 0.8, center.z);
            const sprite = new THREE.Sprite(this.spriteMat(color).clone());
            sprite.position.set(center.x, center.y + 0.8, center.z);
            this.engine.scene.add(sprite);
            burst = { light, sprite, t: 0 };
            this.engine.scene.remove(coin, glow);
            if (near(center, ctx.feet, radius, 2.4)) ctx.hurt(damage, 'mine');
          }
          return true;
        }
        burst.t += dt;
        const k = Math.max(0, 1 - burst.t / 0.45);
        burst.sprite.scale.set(radius * 2.4 * (1.2 - k), radius * 2.4 * (1.2 - k), 1);
        (burst.sprite.material as THREE.SpriteMaterial).opacity = 0.8 * k;
        if (burst.light) burst.light.intensity = 60 * k;
        return burst.t < 0.45;
      },
      dispose: () => {
        this.engine.scene.remove(coin, glow);
        coin.geometry.dispose();
        if (burst) {
          this.engine.scene.remove(burst.sprite);
          this.engine.lights.release(burst.light);
          burst.sprite.material.dispose();
        }
      },
    });
  }

  /** A line of eruptions running straight from `from` along `dir`; the front hurts once when it passes the player. */
  fissure(from: THREE.Vector3, dir: THREE.Vector3, speed: number, length: number, damage: number, color: number): void {
    const d = dir.clone().setY(0).normalize();
    const front = from.clone();
    let traveled = 0;
    let nextBurst = 0;
    let hit = false;
    const bursts: Array<{ cones: THREE.Mesh[]; t: number }> = [];
    const coneMat = this.mat('fissure-cone', () => new THREE.MeshStandardMaterial({ color: 0x3a2418, emissive: color, emissiveIntensity: 1.4, roughness: 0.9 }));
    const light = this.borrowLight(color, 26, 6);
    this.add({
      update: (dt, _e, ctx) => {
        if (traveled < length) {
          traveled += speed * dt;
          front.copy(from).addScaledVector(d, traveled);
          // Keep the front on the floor.
          const floor = this.engine.physics.raycast(this.tmp.copy(front).setY(front.y + 2.5), new THREE.Vector3(0, -1, 0), 6);
          if (floor) front.y = floor.point.y;
          if (traveled >= nextBurst) {
            nextBurst += 0.9;
            const cones: THREE.Mesh[] = [];
            for (let i = 0; i < 3; i++) {
              const c = new THREE.Mesh(this.coneGeo, coneMat);
              c.position.set(front.x + (Math.random() - 0.5) * 0.8, front.y, front.z + (Math.random() - 0.5) * 0.8);
              c.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6);
              c.scale.setScalar(0.01);
              cones.push(c);
            }
            this.engine.scene.add(...cones);
            bursts.push({ cones, t: 0 });
            for (let i = 0; i < 6; i++) this.flames.emit({ x: front.x, y: front.y + 0.2, z: front.z, vx: (Math.random() - 0.5) * 2.2, vy: 2 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 2.2, life: 0.5 + Math.random() * 0.3, size: 0.35, grow: 1.2, alpha: 0.9, drag: 1.5, lift: -6 });
          }
          if (light) light.position.set(front.x, front.y + 0.6, front.z);
          if (!hit && near(front, ctx.feet, 1.3, 2.6)) {
            hit = true;
            ctx.hurt(damage, 'fissure');
          }
        }
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i] as (typeof bursts)[number];
          b.t += dt;
          const k = b.t < 0.15 ? b.t / 0.15 : Math.max(0, 1 - (b.t - 0.15) / 0.9);
          for (const c of b.cones) c.scale.set(k * 1.2, k * (1.4 + Math.random() * 0.2), k * 1.2);
          if (b.t > 1.1) {
            this.engine.scene.remove(...b.cones);
            bursts.splice(i, 1);
          }
        }
        if (light && traveled >= length) light.intensity = Math.max(0, light.intensity - dt * 40);
        return traveled < length || bursts.length > 0;
      },
      dispose: () => {
        for (const b of bursts) this.engine.scene.remove(...b.cones);
        this.engine.lights.release(light);
      },
    });
  }

  /** Roots erupt after `delay` inside `radius`: damage plus a slow (returned through onCatch). */
  rootTrap(center: THREE.Vector3, radius: number, delay: number, damage: number, color: number, onCatch?: () => void): void {
    this.telegraph(center, radius, delay, color);
    let t = 0;
    let roots: THREE.Mesh[] | null = null;
    const rootMat = this.mat('root', () => new THREE.MeshStandardMaterial({ color: 0x4a3222, roughness: 0.9, emissive: 0x2a5a24, emissiveIntensity: 0.5 }));
    this.add({
      update: (dt, _e, ctx) => {
        t += dt;
        if (!roots) {
          if (t < delay) return true;
          roots = [];
          for (let i = 0; i < 7; i++) {
            const r = new THREE.Mesh(this.rootGeo, rootMat);
            const a = (i / 7) * Math.PI * 2;
            const rr = radius * (0.3 + Math.random() * 0.6);
            r.position.set(center.x + Math.cos(a) * rr, center.y - 0.8, center.z + Math.sin(a) * rr);
            r.rotation.set((Math.random() - 0.5) * 0.7, a, (Math.random() - 0.5) * 0.7);
            roots.push(r);
          }
          this.engine.scene.add(...roots);
          if (near(center, ctx.feet, radius, 2.2)) {
            ctx.hurt(damage, 'roots');
            onCatch?.();
          }
          return true;
        }
        const k = t - delay;
        const rise = k < 0.2 ? k / 0.2 : Math.max(0, 1 - (k - 0.9) / 0.6);
        for (const r of roots) r.position.y = center.y - 0.8 + rise * 1.4;
        return k < 1.5;
      },
      dispose: () => {
        if (roots) this.engine.scene.remove(...roots);
      },
    });
  }

  /** Arrows fall on a marked spot after `delay`; anyone inside is hit (jumping does not help — leave). */
  arrowRain(center: THREE.Vector3, radius: number, delay: number, damage: number, color: number): void {
    this.telegraph(center, radius, delay, color);
    let t = 0;
    let arrows: THREE.Mesh[] | null = null;
    const woodMat = this.mat('arrow-wood', () => new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 }));
    this.add({
      update: (dt, _e, ctx) => {
        t += dt;
        if (!arrows) {
          if (t < delay - 0.35) return true;
          arrows = [];
          for (let i = 0; i < 6; i++) {
            const a = new THREE.Mesh(this.arrowGeo, woodMat);
            a.position.set(center.x + (Math.random() - 0.5) * radius * 1.4, center.y + 9 + Math.random() * 2, center.z + (Math.random() - 0.5) * radius * 1.4);
            a.rotation.x = Math.PI / 2;
            arrows.push(a);
          }
          this.engine.scene.add(...arrows);
          return true;
        }
        let landed = 0;
        for (const a of arrows) {
          if (a.position.y > center.y + 0.05) a.position.y -= dt * 26;
          else landed++;
        }
        if (t >= delay && t - dt < delay && near(center, ctx.feet, radius, 3)) ctx.hurt(damage, 'arrow-rain');
        return !(landed === arrows.length && t > delay + 1.2);
      },
      dispose: () => {
        if (arrows) this.engine.scene.remove(...arrows);
      },
    });
  }

  /** A ring of petals orbiting `owner` at `radius` for `seconds`; the band hurts on contact. */
  petalRing(owner: () => THREE.Vector3, radius: number, seconds: number, damage: number, color: number): void {
    const petals: THREE.Sprite[] = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(this.spriteMat(color));
      s.scale.set(0.55, 0.55, 1);
      petals.push(s);
    }
    this.engine.scene.add(...petals);
    let t = 0;
    this.add({
      update: (dt, elapsed, ctx) => {
        t += dt;
        const o = owner();
        const fade = t < 0.4 ? t / 0.4 : t > seconds - 0.5 ? Math.max(0, (seconds - t) / 0.5) : 1;
        petals.forEach((p, i) => {
          const a = elapsed * 2.4 + (i / petals.length) * Math.PI * 2;
          p.position.set(o.x + Math.cos(a) * radius * fade, o.y + 1.0 + Math.sin(elapsed * 3 + i) * 0.5, o.z + Math.sin(a) * radius * fade);
          p.scale.set(0.55 * fade, 0.55 * fade, 1);
        });
        const d = Math.hypot(o.x - ctx.feet.x, o.z - ctx.feet.z);
        if (fade > 0.8 && Math.abs(d - radius) < 0.9 && Math.abs(ctx.feet.y - o.y) < 2.2) ctx.hurt(damage, 'petals');
        return t < seconds;
      },
      dispose: () => this.engine.scene.remove(...petals),
    });
  }

  /**
   * A cone of fire from `mouth` along `dir` (both re-read every frame so the breather can turn). Hurts
   * anyone inside the cone within `range`.
   */
  flameCone(mouth: () => THREE.Vector3, dir: () => THREE.Vector3, halfAngle: number, range: number, seconds: number, damage: number): void {
    const light = this.borrowLight(0xff7a2a, 0, 12);
    let t = 0;
    let emitAcc = 0;
    this.add({
      update: (dt, _e, ctx) => {
        t += dt;
        const m = mouth();
        const d = dir();
        const active = t < seconds;
        if (light) {
          light.position.copy(m).addScaledVector(d, 2.5);
          light.intensity = active ? 40 + Math.random() * 15 : Math.max(0, light.intensity - dt * 120);
        }
        if (active) {
          // ~150 particles a second along the cone: a thick tongue of fire, one draw call.
          emitAcc += dt * 150;
          const speed = range / 0.55;
          while (emitAcc >= 1) {
            emitAcc -= 1;
            const spread = halfAngle * 0.9;
            const v = this.tmp.copy(d).applyAxisAngle(UP, (Math.random() - 0.5) * 2 * spread);
            v.y += (Math.random() - 0.3) * 0.35;
            v.normalize().multiplyScalar(speed * (0.7 + Math.random() * 0.4));
            this.flames.emit({ x: m.x, y: m.y, z: m.z, vx: v.x, vy: v.y, vz: v.z, life: 0.55, size: 0.45, grow: 3.2, alpha: 0.85, drag: 1.6, lift: 2.2 });
          }
          this.tmp.copy(ctx.feet).setY(ctx.feet.y + 1).sub(m);
          const dist = this.tmp.length();
          if (dist < range && dist > 0.01) {
            const ang = Math.acos(Math.max(-1, Math.min(1, this.tmp.divideScalar(dist).dot(d))));
            if (ang < halfAngle) ctx.hurt(damage, 'flame');
          }
        }
        return active || t < seconds + 0.6;
      },
      dispose: () => this.engine.lights.release(light),
    });
  }

  update(dt: number, elapsed: number, ctx: HazardContext): void {
    this.flames.update(dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i] as Hazard;
      if (!h.update(dt, elapsed, ctx)) {
        h.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const h of this.list) h.dispose();
    this.list.length = 0;
    this.flames.clear();
  }

  dispose(): void {
    this.clear();
    this.engine.scene.remove(this.flames.points);
    this.flames.dispose();
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.coneGeo.dispose();
    this.rootGeo.dispose();
    this.arrowGeo.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}
