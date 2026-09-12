import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Merges the direct child meshes of `group` that share a material into one mesh per material.
 * Children listed in `keep` are left untouched (animated geometry). Cuts draw calls for rigid parts.
 */
export const mergeStaticChildren = (group: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set(), onlyMaterials?: ReadonlySet<THREE.Material>, limit = Infinity): number => {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const toRemove: THREE.Mesh[] = [];
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || keep.has(mesh) || Array.isArray(mesh.material) || mesh.children.length > 0) continue;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) continue;
    if (onlyMaterials && !onlyMaterials.has(mesh.material)) continue;
    if (toRemove.length >= limit) break;
    if (mesh.userData.mergedBatch === true && limit !== Infinity) continue;
    mesh.updateMatrix();
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    // Normalise attribute sets so geometries can be merged.
    if (geo.getAttribute('uv') === undefined) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
    if (geo.index === null) {
      const n = geo.getAttribute('position').count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (geo.getAttribute('color') === undefined) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') geo.deleteAttribute(name);
    let list = byMaterial.get(mesh.material);
    if (!list) {
      list = [];
      byMaterial.set(mesh.material, list);
    }
    list.push(geo);
    toRemove.push(mesh);
  }
  for (const m of toRemove) {
    group.remove(m);
    m.geometry.dispose();
  }
  for (const [material, geos] of byMaterial) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.mergedBatch = true;
    group.add(mesh);
  }
  return toRemove.length;
};
