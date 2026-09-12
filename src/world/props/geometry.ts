import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SeededRandom } from '@/util/random';
import { clamp, smoothstep } from '@/util/math';
import { fbmTile } from '../TextureGen';

/** Planar UVs chosen per vertex from the dominant normal axis; `tile` metres per texture repeat. */
export const triplanarUVs = (geo: THREE.BufferGeometry, tile: number): void => {
  const pos = geo.getAttribute('position');
  let nrm = geo.getAttribute('normal');
  if (!nrm) {
    geo.computeVertexNormals();
    nrm = geo.getAttribute('normal');
  }
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    if (ny >= nx && ny >= nz) {
      uv[i * 2] = x / tile;
      uv[i * 2 + 1] = z / tile;
    } else if (nx >= nz) {
      uv[i * 2] = z / tile;
      uv[i * 2 + 1] = y / tile;
    } else {
      uv[i * 2] = x / tile;
      uv[i * 2 + 1] = y / tile;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
};

export interface WeatherOptions {
  /** Height (local Y) below which moss creeps in. */
  mossHeight: number;
  mossStrength: number;
  /** Darken crevices / undersides. */
  dirt: number;
  seed: number;
}

/** Writes a vertex colour attribute: moss at the base, dirt in downward-facing and low areas. */
export const applyWeathering = (geo: THREE.BufferGeometry, opts: WeatherOptions): void => {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm ? nrm.getY(i) : 0;
    const n = fbmTile(((x * 0.35) % 1 + 1) % 1, ((z * 0.35 + y * 0.2) % 1 + 1) % 1, 4, 3, opts.seed);
    const low = 1 - smoothstep(0, opts.mossHeight, y);
    const moss = clamp(low * (0.5 + n) * opts.mossStrength + Math.max(0, ny) * n * 0.35 * opts.mossStrength, 0, 1);
    const under = ny < -0.3 ? opts.dirt : 0;
    const dirt = clamp(1 - under - low * opts.dirt * 0.5 - (n < 0.35 ? 0.15 : 0), 0.35, 1);
    colors[i * 3] = (1 - moss) * dirt + moss * 0.45 * dirt;
    colors[i * 3 + 1] = (1 - moss) * dirt + moss * 0.62 * dirt;
    colors[i * 3 + 2] = (1 - moss) * dirt + moss * 0.32 * dirt;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
};

/** Random vertex jitter for weathered stone edges (applied before normals are computed). */
export const jitterVertices = (geo: THREE.BufferGeometry, rng: SeededRandom, amount: number): void => {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + (rng.next() - 0.5) * amount, pos.getY(i) + (rng.next() - 0.5) * amount, pos.getZ(i) + (rng.next() - 0.5) * amount);
  }
  pos.needsUpdate = true;
};

/** Merges geometries after baking each one's matrix; clears extra attributes for compatibility. */
export const mergeWithMatrices = (parts: Array<[THREE.BufferGeometry, THREE.Matrix4]>): THREE.BufferGeometry => {
  const geos = parts.map(([g, m]) => {
    const c = g.index ? g.toNonIndexed() : g.clone();
    c.applyMatrix4(m);
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal') c.deleteAttribute(name);
    return c;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('mergeWithMatrices: nothing to merge');
  merged.computeVertexNormals();
  return merged;
};

export const mat4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
