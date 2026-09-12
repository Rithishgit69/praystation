import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { MaterialLibrary } from '@/world/Materials';
import { Perlin } from '@/util/noise';

const COUNT = 64;
const REACH = 45;

/** A subtle trail of light motes drifting from the player toward the placed waypoint (never an arrow). */
export class WaypointTrail implements System {
  readonly name = 'waypoint-trail';
  private readonly points: THREE.Points;
  private readonly mat: THREE.PointsMaterial;
  private readonly noise = new Perlin(3);
  private readonly dir = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    lib: MaterialLibrary,
    private readonly getWaypoint: () => THREE.Vector3 | null,
    private readonly clearWaypoint: () => void,
    private readonly getPlayer: () => THREE.Vector3,
  ) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    this.mat = new THREE.PointsMaterial({ map: lib.glowTexture, color: 0xa9c6f0, size: 0.16, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    engine.scene.add(this.points);
  }

  update(dt: number, elapsed: number): void {
    const wp = this.getWaypoint();
    const p = this.getPlayer();
    if (!wp) {
      this.mat.opacity = Math.max(0, this.mat.opacity - dt * 2);
      return;
    }
    this.dir.set(wp.x - p.x, 0, wp.z - p.z);
    const dist = this.dir.length();
    if (dist < 4) {
      this.clearWaypoint();
      return;
    }
    this.dir.divideScalar(dist);
    this.mat.opacity = Math.min(0.55, this.mat.opacity + dt);
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const span = Math.min(dist, REACH);
    for (let i = 0; i < COUNT; i++) {
      const t = ((i / COUNT + elapsed * 0.045) % 1) * span + 2;
      const wob = this.noise.noise2(i * 0.7, elapsed * 0.6) * 0.6;
      pos.setXYZ(i, p.x + this.dir.x * t - this.dir.z * wob, p.y + 0.9 + this.noise.noise2(elapsed * 0.8, i) * 0.35, p.z + this.dir.z * t + this.dir.x * wob);
    }
    pos.needsUpdate = true;
  }

  dispose(): void {
    this.engine.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}
