import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { SeededRandom } from '@/util/random';
import type { MaterialLibrary } from './Materials';
import type { Terrain } from './Terrain';

const COUNT = 420;
const MIN_R = 150;
const MAX_R = 520;

/**
 * Impostor tree line beyond the streamed cells: instanced canopy cards on the terrain, recentred on the
 * player every few metres, so the forest never has a visible edge (brief §3 impostors beyond 120 m).
 */
export class DistantForest implements System {
  readonly name = 'distant-forest';
  private readonly mesh: THREE.InstancedMesh;
  private readonly offsets: Float32Array;
  private readonly lastCenter = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    lib: MaterialLibrary,
    private readonly terrain: Terrain,
    private readonly focus: () => THREE.Vector3,
  ) {
    const rng = new SeededRandom(777);
    this.offsets = new Float32Array(COUNT * 4);
    for (let i = 0; i < COUNT; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * (MAX_R - MIN_R) + MIN_R;
      this.offsets[i * 4] = Math.cos(a) * r;
      this.offsets[i * 4 + 1] = Math.sin(a) * r;
      this.offsets[i * 4 + 2] = rng.range(14, 24); // height
      this.offsets[i * 4 + 3] = rng.range(0, Math.PI);
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, lib.canopy, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    engine.scene.add(this.mesh);
  }

  update(): void {
    const f = this.focus();
    if (Math.hypot(f.x - this.lastCenter.x, f.z - this.lastCenter.z) < 24) return;
    this.lastCenter.copy(f);
    // Underground the player cannot see the horizon; keep the ring but it is behind rock anyway.
    const cam = this.engine.camera;
    for (let i = 0; i < COUNT; i++) {
      const ox = this.offsets[i * 4] as number;
      const oz = this.offsets[i * 4 + 1] as number;
      const h = this.offsets[i * 4 + 2] as number;
      const x = f.x + ox;
      const z = f.z + oz;
      const r = Math.hypot(x, z);
      const y = r > this.terrain.ravineRadius ? this.terrain.heightAt(x, z) : this.terrain.heightAt(x, z);
      this.p.set(x, y - 1, z);
      const yaw = Math.atan2(cam.position.x - x, cam.position.z - z) + (this.offsets[i * 4 + 3] as number) * 0.15;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.s.set(h * 0.9, h, 1);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.engine.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
