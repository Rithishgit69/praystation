import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SeededRandom } from '@/util/random';
import type { MaterialLibrary } from '../Materials';
import { applyWeathering, jitterVertices, mat4, mergeWithMatrices, triplanarUVs } from './geometry';
import { boxCollider, cylinderCollider, type PropResult } from './types';

const STONE_TILE = 2.2;

const finishStone = (geo: THREE.BufferGeometry, mossHeight: number, seed: number, mossStrength = 0.8): THREE.BufferGeometry => {
  triplanarUVs(geo, STONE_TILE);
  applyWeathering(geo, { mossHeight, mossStrength, dirt: 0.3, seed });
  geo.computeBoundingSphere();
  return geo;
};

const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export interface PillarOptions {
  height: number;
  /** When set, the shaft is truncated with a jagged top and no capital. */
  brokenAt?: number;
  rng: SeededRandom;
  dark?: boolean;
}

/**
 * Temple pillar: square plinth, carved lower block, octagonal shaft, upper block, cushion capital, abacus.
 * Origin at the base centre.
 */
export const makePillar = (lib: MaterialLibrary, o: PillarOptions): PropResult => {
  const parts: Array<[THREE.BufferGeometry, THREE.Matrix4]> = [];
  const base = 0.95;
  parts.push([new RoundedBoxGeometry(base, 0.32, base, 2, 0.02), mat4(0, 0.16, 0)]);
  parts.push([new RoundedBoxGeometry(0.72, 0.9, 0.72, 2, 0.015), mat4(0, 0.32 + 0.45, 0)]);
  // Carved band ring.
  parts.push([new THREE.CylinderGeometry(0.44, 0.44, 0.1, 8, 1), mat4(0, 1.27, 0, Math.PI / 8)]);
  const shaftTop = o.brokenAt ?? o.height - 0.95;
  const shaftH = Math.max(0.3, shaftTop - 1.32);
  const shaft = new THREE.CylinderGeometry(0.31, 0.34, shaftH, 8, 6);
  if (o.brokenAt !== undefined) {
    // Jagged fracture: displace the top ring and cap.
    const pos = shaft.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > shaftH / 2 - 0.01) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        pos.setY(i, shaftH / 2 - o.rng.range(0, 0.35) - (r < 0.05 ? 0.2 : 0));
        pos.setX(i, pos.getX(i) * o.rng.range(0.85, 1.05));
        pos.setZ(i, pos.getZ(i) * o.rng.range(0.85, 1.05));
      }
    }
  }
  parts.push([shaft, mat4(0, 1.32 + shaftH / 2, 0, Math.PI / 8)]);
  if (o.brokenAt === undefined) {
    const y0 = 1.32 + shaftH;
    parts.push([new THREE.CylinderGeometry(0.4, 0.34, 0.12, 8, 1), mat4(0, y0 + 0.06, 0, Math.PI / 8)]);
    parts.push([new RoundedBoxGeometry(0.66, 0.34, 0.66, 2, 0.015), mat4(0, y0 + 0.12 + 0.17, 0)]);
    // Cushion capital.
    const cushion = new THREE.SphereGeometry(0.46, 12, 8);
    parts.push([cushion, mat4(0, y0 + 0.46 + 0.16, 0, 0, 1, 0.42, 1)]);
    parts.push([new RoundedBoxGeometry(0.95, 0.16, 0.95, 2, 0.02), mat4(0, y0 + 0.46 + 0.36, 0)]);
    parts.push([new RoundedBoxGeometry(1.1, 0.12, 0.7, 2, 0.02), mat4(0, y0 + 0.46 + 0.5, 0)]);
  }
  const geo = mergeWithMatrices(parts);
  jitterVertices(geo, o.rng, 0.012);
  geo.computeVertexNormals();
  finishStone(geo, 1.1, o.rng.int(0, 1000));
  const mesh = shadowed(new THREE.Mesh(geo, o.dark ? lib.sandstoneDark : lib.sandstone));
  const totalH = o.brokenAt ?? o.height;
  return {
    object: mesh,
    colliders: [boxCollider(new THREE.Vector3(0, 0.16, 0), new THREE.Vector3(base, 0.32, base), 'dry-stone'), cylinderCollider(new THREE.Vector3(0, totalH / 2 + 0.1, 0), totalH / 2 - 0.1, 0.42, 'dry-stone')],
  };
};

export interface BlockOptions {
  size: THREE.Vector3;
  rng: SeededRandom;
  dark?: boolean;
  mossHeight?: number;
}

/** Single sandstone ashlar with bevelled edges. Origin at the block centre. */
export const makeBlockGeometry = (o: BlockOptions): THREE.BufferGeometry => {
  const g = new RoundedBoxGeometry(o.size.x, o.size.y, o.size.z, 1, Math.min(0.05, Math.min(o.size.x, o.size.y, o.size.z) * 0.12));
  jitterVertices(g, o.rng, 0.02);
  g.computeVertexNormals();
  g.translate(0, o.size.y / 2, 0);
  return g;
};

export interface BlockPlacement {
  size: THREE.Vector3;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

/** Merges many blocks into one mesh with box colliders. Positions are the block base centres. */
export const makeBlocks = (lib: MaterialLibrary, blocks: BlockPlacement[], rng: SeededRandom, dark = false): PropResult => {
  const parts: Array<[THREE.BufferGeometry, THREE.Matrix4]> = [];
  const colliders = [];
  for (const b of blocks) {
    const g = makeBlockGeometry({ size: b.size, rng });
    const m = new THREE.Matrix4().compose(b.position, new THREE.Quaternion().setFromEuler(b.rotation), new THREE.Vector3(1, 1, 1));
    parts.push([g, m]);
    const center = new THREE.Vector3(0, b.size.y / 2, 0).applyMatrix4(m);
    colliders.push(boxCollider(center, b.size, 'dry-stone', new THREE.Quaternion().setFromEuler(b.rotation)));
  }
  const geo = mergeWithMatrices(parts);
  finishStone(geo, 0.9, rng.int(0, 1000), 0.9);
  return { object: shadowed(new THREE.Mesh(geo, dark ? lib.sandstoneDark : lib.sandstone)), colliders };
};

/** Neat stack of blocks (wall fragment) `rows` high; origin at the base centre; extends along +X. */
export const stackedBlocks = (rng: SeededRandom, width: number, rows: number, depth: number, lean = 0.0): BlockPlacement[] => {
  const out: BlockPlacement[] = [];
  const rowH = 0.48;
  for (let r = 0; r < rows; r++) {
    let x = -width / 2 + (r % 2 === 0 ? 0 : rng.range(-0.15, 0.15));
    while (x < width / 2 - 0.2) {
      const w = Math.min(width / 2 - x, rng.range(0.7, 1.3));
      if (rng.chance(0.08) && r > 1) {
        x += w;
        continue; // missing block
      }
      out.push({
        size: new THREE.Vector3(w - 0.03, rowH - 0.02, depth + rng.range(-0.06, 0.06)),
        position: new THREE.Vector3(x + w / 2 + r * lean, r * rowH, rng.range(-0.03, 0.03)),
        rotation: new THREE.Euler(0, rng.range(-0.02, 0.02), rng.range(-0.01, 0.01) * r),
      });
      x += w;
    }
  }
  return out;
};

/** Toppled rubble scattered inside a radius. */
export const scatteredBlocks = (rng: SeededRandom, count: number, radius: number): BlockPlacement[] => {
  const out: BlockPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, radius);
    const size = new THREE.Vector3(rng.range(0.5, 1.2), rng.range(0.35, 0.55), rng.range(0.45, 0.9));
    out.push({ size, position: new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), rotation: new THREE.Euler(rng.range(-0.08, 0.08), rng.range(0, Math.PI), rng.range(-0.1, 0.1)) });
  }
  return out;
};

export interface StepsOptions {
  width: number;
  count: number;
  rise: number;
  run: number;
  rng: SeededRandom;
}

/** Solid stone stairs climbing toward -Z. Origin at the bottom-front centre. */
export const makeSteps = (lib: MaterialLibrary, o: StepsOptions): PropResult => {
  const parts: Array<[THREE.BufferGeometry, THREE.Matrix4]> = [];
  const colliders = [];
  for (let i = 0; i < o.count; i++) {
    const h = (i + 1) * o.rise;
    const depth = (o.count - i) * o.run;
    const zc = -(i * o.run) - depth / 2;
    const g = new THREE.BoxGeometry(o.width, h, depth, 6, 1, 1).toNonIndexed();
    jitterVertices(g, o.rng, 0.015);
    parts.push([g, mat4(0, h / 2, zc)]);
    colliders.push(boxCollider(new THREE.Vector3(0, h / 2, zc), new THREE.Vector3(o.width, h, depth), 'dry-stone'));
  }
  const geo = mergeWithMatrices(parts);
  finishStone(geo, 0.5, o.rng.int(0, 1000), 0.6);
  return { object: shadowed(new THREE.Mesh(geo, lib.sandstone)), colliders };
};

/** Flat flagstone floor slab with a raised edge kerb. Origin at the top-surface centre. */
export const makeFloor = (lib: MaterialLibrary, w: number, d: number, thickness: number, seed: number): PropResult => {
  const geo = new THREE.BoxGeometry(w, thickness, d, Math.ceil(w / 2), 1, Math.ceil(d / 2)).toNonIndexed();
  geo.translate(0, -thickness / 2, 0);
  geo.computeVertexNormals();
  triplanarUVs(geo, 5.6);
  applyWeathering(geo, { mossHeight: -0.01, mossStrength: 0.5, dirt: 0.25, seed });
  const mesh = shadowed(new THREE.Mesh(geo, lib.flagstone));
  return { object: mesh, colliders: [boxCollider(new THREE.Vector3(0, -thickness / 2, 0), new THREE.Vector3(w, thickness, d), 'wet-stone')] };
};

export interface BrazierOptions {
  rng: SeededRandom;
  tiers?: number;
}

/** Stepped square plinth with an iron fire bowl. Origin at the base centre; `fireHeight` is where flames start. */
export const makeBrazierPlinth = (lib: MaterialLibrary, o: BrazierOptions): PropResult & { fireHeight: number } => {
  const tiers = o.tiers ?? 3;
  const parts: Array<[THREE.BufferGeometry, THREE.Matrix4]> = [];
  let y = 0;
  let w = 1.5;
  for (let i = 0; i < tiers; i++) {
    const h = i === tiers - 1 ? 0.55 : 0.3;
    const g = new RoundedBoxGeometry(w, h, w, 2, 0.02);
    jitterVertices(g, o.rng, 0.012);
    parts.push([g, mat4(0, y + h / 2, 0)]);
    y += h;
    w -= 0.32;
  }
  // Ledge under the bowl.
  parts.push([new RoundedBoxGeometry(w + 0.42, 0.1, w + 0.42, 2, 0.02), mat4(0, y + 0.05, 0)]);
  y += 0.1;
  const stone = mergeWithMatrices(parts);
  finishStone(stone, 0.7, o.rng.int(0, 1000), 0.7);
  const group = new THREE.Group();
  group.add(shadowed(new THREE.Mesh(stone, lib.sandstone)));
  const bowl = new THREE.LatheGeometry(
    [new THREE.Vector2(0.05, 0), new THREE.Vector2(0.4, 0.0), new THREE.Vector2(0.47, 0.1), new THREE.Vector2(0.45, 0.24), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.14, 0.3), new THREE.Vector2(0.12, 0.2)],
    20,
  );
  const bowlMesh = shadowed(new THREE.Mesh(bowl, lib.iron));
  bowlMesh.position.y = y;
  group.add(bowlMesh);
  // Charcoal bed (dark) with ember glow.
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff5a1c, emissiveIntensity: 1.6, roughness: 1 }));
  coals.position.y = y + 0.2;
  group.add(coals);
  return {
    object: group,
    colliders: [boxCollider(new THREE.Vector3(0, y / 2, 0), new THREE.Vector3(1.5, y, 1.5), 'dry-stone')],
    fireHeight: y + 0.22,
  };
};

/** Long ashlar wall as one slab (block pattern comes from the texture) with a few protruding stones. Origin at base centre; runs along +X. */
export const makeWallSlab = (lib: MaterialLibrary, length: number, height: number, thickness: number, rng: SeededRandom, dark = false): PropResult => {
  const parts: Array<[THREE.BufferGeometry, THREE.Matrix4]> = [];
  const slab = new THREE.BoxGeometry(length, height, thickness, Math.ceil(length / 2), Math.ceil(height / 1.5), 1);
  jitterVertices(slab, rng, 0.02);
  parts.push([slab, mat4(0, height / 2, 0)]);
  const n = Math.floor(length * 0.25);
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.6, 1.1);
    const h = rng.range(0.4, 0.5);
    const x = rng.range(-length / 2 + w, length / 2 - w);
    const y = rng.range(0.2, height - 0.6);
    const side = rng.chance(0.5) ? 1 : -1;
    parts.push([new RoundedBoxGeometry(w, h, 0.28, 2, 0.03), mat4(x, y, side * (thickness / 2 + 0.06))]);
  }
  const geo = mergeWithMatrices(parts);
  finishStone(geo, 1.2, rng.int(0, 1000), 0.8);
  return { object: shadowed(new THREE.Mesh(geo, dark ? lib.sandstoneDark : lib.sandstone)), colliders: [boxCollider(new THREE.Vector3(0, height / 2, 0), new THREE.Vector3(length, height, thickness + 0.2), 'dry-stone')] };
};
