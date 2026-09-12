import * as THREE from 'three';
import type { SurfaceMaterial, SurfaceSource } from '@/engine/Physics';

export interface BoxCollider {
  kind: 'box';
  center: THREE.Vector3;
  half: THREE.Vector3;
  quaternion: THREE.Quaternion;
  surface: SurfaceMaterial;
}
export interface CylinderCollider {
  kind: 'cylinder';
  center: THREE.Vector3;
  halfHeight: number;
  radius: number;
  surface: SurfaceMaterial;
}
export interface TrimeshCollider {
  kind: 'trimesh';
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  surface: SurfaceSource;
}
export type ColliderSpec = BoxCollider | CylinderCollider | TrimeshCollider;

export interface PropResult {
  object: THREE.Object3D;
  colliders: ColliderSpec[];
  /** Per-frame hook (cloth, fire, mist). Called with camera for billboards. */
  update?: (dt: number, elapsed: number, camera: THREE.Camera) => void;
  dispose?: () => void;
}

export const boxCollider = (center: THREE.Vector3, size: THREE.Vector3, surface: SurfaceMaterial, quaternion = new THREE.Quaternion()): BoxCollider => ({
  kind: 'box',
  center: center.clone(),
  half: size.clone().multiplyScalar(0.5),
  quaternion: quaternion.clone(),
  surface,
});

export const cylinderCollider = (center: THREE.Vector3, halfHeight: number, radius: number, surface: SurfaceMaterial): CylinderCollider => ({
  kind: 'cylinder',
  center: center.clone(),
  halfHeight,
  radius,
  surface,
});

/** Transform collider specs by a world matrix (rotation + translation; uniform scale only). */
export const transformColliders = (specs: ColliderSpec[], matrix: THREE.Matrix4): ColliderSpec[] => {
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  matrix.decompose(p, q, s);
  return specs.map((c) => {
    if (c.kind === 'trimesh') return { ...c, matrix: matrix.clone().multiply(c.matrix) };
    const center = c.center.clone().applyMatrix4(matrix);
    if (c.kind === 'box') return { ...c, center, quaternion: q.clone().multiply(c.quaternion) };
    return { ...c, center };
  });
};
