import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let rapierReady: Promise<void> | null = null;
export const initRapier = (): Promise<void> => {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
};

export type SurfaceMaterial = 'wet-stone' | 'dry-stone' | 'gravel' | 'grass' | 'water' | 'wood' | 'moss';

/** Rapier world wrapper. Colliders carry a user-data surface material for footsteps. */
export class Physics {
  readonly world: RAPIER.World;
  private readonly surfaces = new Map<number, SurfaceMaterial>();
  lastStepMs = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
  }

  step(): void {
    const t0 = performance.now();
    this.world.step();
    this.lastStepMs = performance.now() - t0;
  }

  addStaticBox(center: THREE.Vector3, halfExtents: THREE.Vector3, quaternion: THREE.Quaternion, surface: SurfaceMaterial): RAPIER.Collider {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation(quaternion));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z), body);
    this.surfaces.set(col.handle, surface);
    return col;
  }

  addStaticCylinder(center: THREE.Vector3, halfHeight: number, radius: number, surface: SurfaceMaterial): RAPIER.Collider {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius), body);
    this.surfaces.set(col.handle, surface);
    return col;
  }

  addStaticTrimesh(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, surface: SurfaceMaterial): RAPIER.Collider {
    const pos = geometry.getAttribute('position');
    const verts = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      verts[i * 3] = v.x;
      verts[i * 3 + 1] = v.y;
      verts[i * 3 + 2] = v.z;
    }
    let indices: Uint32Array;
    const idx = geometry.getIndex();
    if (idx) indices = new Uint32Array(idx.array);
    else {
      indices = new Uint32Array(pos.count);
      for (let i = 0; i < pos.count; i++) indices[i] = i;
    }
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const col = this.world.createCollider(RAPIER.ColliderDesc.trimesh(verts, indices), body);
    this.surfaces.set(col.handle, surface);
    return col;
  }

  addStaticHeightfield(nrows: number, ncols: number, heights: Float32Array, scale: THREE.Vector3, center: THREE.Vector3, surface: SurfaceMaterial): RAPIER.Collider {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, { x: scale.x, y: scale.y, z: scale.z }), body);
    this.surfaces.set(col.handle, surface);
    return col;
  }

  remove(collider: RAPIER.Collider): void {
    this.surfaces.delete(collider.handle);
    const body = collider.parent();
    if (body) this.world.removeRigidBody(body);
    else this.world.removeCollider(collider, true);
  }

  surfaceOf(collider: RAPIER.Collider | null | undefined): SurfaceMaterial {
    if (!collider) return 'dry-stone';
    return this.surfaces.get(collider.handle) ?? 'dry-stone';
  }

  /** Ray query. Returns hit point, normal, distance and the collider. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, exclude?: RAPIER.Collider): { point: THREE.Vector3; normal: THREE.Vector3; distance: number; collider: RAPIER.Collider } | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, exclude);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      point: new THREE.Vector3(p.x, p.y, p.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: hit.timeOfImpact,
      collider: hit.collider,
    };
  }
}

export { RAPIER };
