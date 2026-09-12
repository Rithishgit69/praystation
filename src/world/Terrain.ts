import * as THREE from 'three';
import { Perlin } from '@/util/noise';
import { clamp, smoothstep } from '@/util/math';
import type { SurfaceMaterial } from '@/engine/Physics';
import type { MaterialLibrary } from './Materials';
import type { ColliderSpec } from './props/types';

/** Catmull-Rom path through the forest; provides distance queries for flattening and tree exclusion. */
export class Path {
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly samples: THREE.Vector3[];
  readonly length: number;
  constructor(points: THREE.Vector3[], readonly halfWidth: number) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
    this.samples = this.curve.getSpacedPoints(Math.ceil(this.curve.getLength() / 2));
    this.length = this.curve.getLength();
  }
  /** Distance from (x,z) to the nearest sampled path point, and that point's height. */
  nearest(x: number, z: number): { distance: number; y: number; t: number } {
    let best = Infinity;
    let bestY = 0;
    let bestI = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const p = this.samples[i] as THREE.Vector3;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) {
        best = d;
        bestY = p.y;
        bestI = i;
      }
    }
    return { distance: Math.sqrt(best), y: bestY, t: bestI / (this.samples.length - 1) };
  }
  pointAt(t: number): THREE.Vector3 {
    return this.curve.getPointAt(clamp(t, 0, 1));
  }
  tangentAt(t: number): THREE.Vector3 {
    return this.curve.getTangentAt(clamp(t, 0, 1));
  }
}

export interface FlatArea {
  min: THREE.Vector2;
  max: THREE.Vector2;
  height: number;
  /** Blend distance outside the rectangle. */
  margin: number;
}

/** Height function for the whole 1.2 km world plus per-cell mesh/collider construction. */
export class Terrain {
  private readonly noise = new Perlin(9001);
  readonly worldRadius = 600;
  readonly ravineRadius = 545;
  readonly flats: FlatArea[] = [];
  readonly paths: Path[] = [];

  /** Raw hills before any flattening. */
  private hills(x: number, z: number): number {
    const n = this.noise.fbm2(x * 0.006, z * 0.006, 4) * 9 + this.noise.fbm2(x * 0.03 + 7, z * 0.03 - 3, 3) * 1.4;
    return n;
  }

  heightAt(x: number, z: number): number {
    let h = this.hills(x, z);
    // Flatten authored areas.
    for (const f of this.flats) {
      const dx = Math.max(f.min.x - x, 0, x - f.max.x);
      const dz = Math.max(f.min.y - z, 0, z - f.max.y);
      const d = Math.hypot(dx, dz);
      const w = 1 - smoothstep(0, f.margin, d);
      h = h + (f.height - h) * w;
    }
    // Flatten across paths to the path's own sampled height.
    for (const p of this.paths) {
      const n = p.nearest(x, z);
      const w = 1 - smoothstep(p.halfWidth, p.halfWidth + 5, n.distance);
      if (w > 0) h = h + (n.y - h) * w;
    }
    // Ravine ring: the world boundary is a visible cliff, not an invisible wall.
    const r = Math.hypot(x, z);
    if (r > this.ravineRadius) h -= Math.pow((r - this.ravineRadius) / 12, 1.6) * 22;
    return h;
  }

  /** Path heights are sampled from the hills so the trail follows the land; call after adding flats. */
  addPath(points: THREE.Vector3[], halfWidth: number): Path {
    const withHeights = points.map((p) => new THREE.Vector3(p.x, this.heightAt(p.x, p.z), p.z));
    const path = new Path(withHeights, halfWidth);
    this.paths.push(path);
    return path;
  }

  surfaceAt(x: number, z: number): SurfaceMaterial {
    for (const p of this.paths) if (p.nearest(x, z).distance < p.halfWidth + 0.5) return 'gravel';
    for (const f of this.flats) if (x >= f.min.x && x <= f.max.x && z >= f.min.y && z <= f.max.y) return 'earth';
    return 'grass';
  }

  /** Slope in [0,1] (0 flat) from finite differences. */
  slopeAt(x: number, z: number): number {
    const e = 0.75;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return clamp(Math.hypot(dx, dz) / (2 * e), 0, 1);
  }

  /** Builds a 64 m terrain tile (mesh + trimesh collider spec) with vertex-coloured ground cover. */
  buildCell(lib: MaterialLibrary, cx: number, cz: number, size: number, segments: number): { mesh: THREE.Mesh; collider: ColliderSpec } {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const n1 = segments + 1;
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) heights[i] = this.heightAt(cx + pos.getX(i), cz + pos.getZ(i));
    const step = size / segments;
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + pos.getX(i);
      const wz = cz + pos.getZ(i);
      const h = heights[i] as number;
      pos.setY(i, h);
      uv.setXY(i, wx / 6, wz / 6);
      const col = i % n1;
      const row = Math.floor(i / n1);
      const hx0 = heights[row * n1 + Math.max(0, col - 1)] as number;
      const hx1 = heights[row * n1 + Math.min(segments, col + 1)] as number;
      const hz0 = heights[Math.max(0, row - 1) * n1 + col] as number;
      const hz1 = heights[Math.min(segments, row + 1) * n1 + col] as number;
      const slope = clamp(Math.hypot(hx1 - hx0, hz1 - hz0) / (2 * step), 0, 1);
      const n = this.noise.fbm2(wx * 0.08, wz * 0.08, 3) * 0.5 + 0.5;
      let pathW = 0;
      for (const p of this.paths) pathW = Math.max(pathW, 1 - smoothstep(p.halfWidth - 1, p.halfWidth + 1.5, p.nearest(wx, wz).distance));
      // grass (green-blue under moon) → earth (brown) on slopes/noise → gravel (grey) on the path
      let r = 0.26 + n * 0.14;
      let g = 0.34 + n * 0.16;
      let b = 0.2 + n * 0.09;
      const earth = clamp(slope * 1.6 + (n < 0.38 ? 0.5 : 0), 0, 1);
      r = r * (1 - earth) + 0.36 * earth;
      g = g * (1 - earth) + 0.28 * earth;
      b = b * (1 - earth) + 0.2 * earth;
      r = r * (1 - pathW) + 0.5 * pathW;
      g = g * (1 - pathW) + 0.47 * pathW;
      b = b * (1 - pathW) + 0.42 * pathW;
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, lib.forestFloor);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return { mesh, collider: { kind: 'trimesh', geometry: geo, matrix: new THREE.Matrix4().makeTranslation(cx, 0, cz), surface: (p) => this.surfaceAt(p.x, p.z) } };
  }
}
