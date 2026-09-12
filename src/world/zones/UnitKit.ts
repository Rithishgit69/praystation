import * as THREE from 'three';
import type { MapRect } from '@/ui/HUD';
import { mergeStaticChildren } from '@/util/merge';
import type { SeededRandom } from '@/util/random';
import type { MaterialLibrary } from '../Materials';
import { FireEffect } from '../fx/Fire';
import { GroundMist, MoonShaft } from '../fx/Atmosphere';
import { IvyBuilder } from '../props/Foliage';
import { makeBlocks, makePillar, makeWallSlab, stackedBlocks } from '../props/Stone';
import { transformColliders, type ColliderSpec, type PropResult } from '../props/types';
import type { Anchor, AnchorKind, UnitBuild, UpdateFn, ZoneId } from '../WorldTypes';

export interface FireOpts {
  scale?: number;
  light?: boolean;
  intensity?: number;
  distance?: number;
}

/** Accumulates one streamed unit: props, colliders, fires, anchors; finishes with merged static stone. */
export class UnitAccumulator {
  readonly group = new THREE.Group();
  readonly colliders: ColliderSpec[] = [];
  readonly updates: UpdateFn[] = [];
  readonly disposables: Array<() => void> = [];
  readonly mapRects: MapRect[] = [];
  readonly fires: FireEffect[] = [];
  readonly anchors: Anchor[] = [];
  readonly ivy: IvyBuilder;
  private readonly cookieGeo = new THREE.PlaneGeometry(1, 1);
  private readonly cookieMat: THREE.MeshBasicMaterial;

  constructor(
    readonly lib: MaterialLibrary,
    readonly rng: SeededRandom,
    readonly zone: ZoneId,
  ) {
    this.ivy = new IvyBuilder(rng.fork(3));
    this.cookieMat = new THREE.MeshBasicMaterial({ map: lib.glowTexture, color: 0xff8a3c, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.disposables.push(() => this.cookieGeo.dispose(), () => this.cookieMat.dispose());
  }

  place(prop: PropResult, x: number, y: number, z: number, ry = 0): THREE.Object3D {
    prop.object.position.set(x, y, z);
    prop.object.rotation.y = ry;
    prop.object.updateMatrix();
    this.group.add(prop.object);
    const world = transformColliders(prop.colliders, prop.object.matrix);
    this.colliders.push(...world);
    for (const c of world) {
      if (c.kind === 'box' && c.half.x * c.half.z * 4 < 60) {
        const e = new THREE.Euler().setFromQuaternion(c.quaternion);
        this.mapRects.push({ x: c.center.x, z: c.center.z, w: c.half.x * 2, d: c.half.z * 2, rotY: e.y });
      } else if (c.kind === 'cylinder') this.mapRects.push({ x: c.center.x, z: c.center.z, w: c.radius * 2, d: c.radius * 2, rotY: 0 });
    }
    if (prop.update) this.updates.push(prop.update);
    if (prop.dispose) this.disposables.push(prop.dispose);
    return prop.object;
  }

  /** A raw mesh with an optional box collider matching its geometry bounds. */
  mesh(mesh: THREE.Mesh, collide = true): THREE.Mesh {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    this.group.add(mesh);
    if (collide) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox as THREE.Box3;
      const size = bb.getSize(new THREE.Vector3()).multiply(mesh.scale);
      const center = bb.getCenter(new THREE.Vector3()).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position);
      this.colliders.push({ kind: 'box', center, half: size.multiplyScalar(0.5), quaternion: mesh.quaternion.clone(), surface: 'dry-stone' });
    }
    return mesh;
  }

  fire(x: number, y: number, z: number, o: FireOpts = {}): FireEffect {
    const scale = o.scale ?? 1;
    const f = new FireEffect(this.lib, { scale, light: o.light ?? true, lightIntensity: o.intensity ?? 40, lightDistance: o.distance ?? 12, embers: scale < 0.6 ? 10 : 26 });
    f.group.position.set(x, y, z);
    this.group.add(f.group);
    this.updates.push((dt, t, cam) => f.update(dt, t, cam));
    this.disposables.push(() => f.dispose());
    this.fires.push(f);
    return f;
  }

  /** Baked warm light pool (additive decal) for torches that get no real light. */
  cookie(x: number, y: number, z: number, size: number, rotX = -Math.PI / 2, rotY = 0): void {
    const c = new THREE.Mesh(this.cookieGeo, this.cookieMat);
    c.position.set(x, y, z);
    c.rotation.set(rotX, rotY, 0);
    c.scale.setScalar(size);
    this.group.add(c);
  }

  anchor(id: string, kind: AnchorKind, x: number, y: number, z: number, yaw = 0, radius = 2.2, data?: Record<string, string | number | boolean>, object?: THREE.Object3D): Anchor {
    const a: Anchor = { id, kind, zone: this.zone, position: new THREE.Vector3(x, y, z), yaw, radius };
    if (data) a.data = data;
    if (object) a.object = object;
    this.anchors.push(a);
    return a;
  }

  private shaftCount = 0;
  /** Moon shaft through a roof hole (max 3 real spot lights per unit). */
  moonShaft(x: number, topY: number, floorY: number, z: number, w: number, d: number): void {
    if (this.shaftCount >= 3) return;
    this.shaftCount++;
    const shaft = new MoonShaft(this.lib, x, topY, floorY, z, w, d);
    this.group.add(shaft.group);
    this.updates.push((_dt, t) => shaft.update(t));
    this.disposables.push(() => shaft.dispose());
  }

  mist(cards: Array<{ x: number; y: number; z: number; size: number; opacity?: number }>, color = 0x3f5f8f): void {
    const m = new GroundMist(this.lib, this.rng.fork(60), cards, color);
    this.group.add(m.group);
    this.updates.push((dt) => m.update(dt));
    this.disposables.push(() => m.dispose());
  }

  /** Wall slab helper: from (x0,z0) to (x1,z1) at base y. */
  wall(x0: number, z0: number, x1: number, z1: number, y: number, height: number, thickness = 1.1, dark = false): THREE.Object3D {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    return this.place(makeWallSlab(this.lib, len, height, thickness, this.rng.fork(Math.round(x0 * 3 + z0 * 7 + x1 * 11 + z1)), dark), (x0 + x1) / 2, y, (z0 + z1) / 2, ry);
  }

  pillar(x: number, y: number, z: number, height: number, brokenAt?: number, ry = 0): THREE.Object3D {
    return this.place(makePillar(this.lib, brokenAt === undefined ? { height, rng: this.rng.fork(Math.round(x * 5 + z * 13)) } : { height, brokenAt, rng: this.rng.fork(Math.round(x * 5 + z * 13)) }), x, y, z, ry);
  }

  blockStack(x: number, y: number, z: number, width: number, rows: number, depth: number, ry = 0): THREE.Object3D {
    return this.place(makeBlocks(this.lib, stackedBlocks(this.rng.fork(Math.round(x * 7 + z * 3)), width, rows, depth), this.rng.fork(Math.round(x + z * 9))), x, y, z, ry);
  }

  /** Ivy on the four faces of a box footprint. */
  ivyBox(cx: number, cz: number, w: number, h: number, d: number, ry: number, density = 1): void {
    const faces: Array<[number, number, number]> = [
      [0, d / 2, w],
      [Math.PI, -d / 2, w],
      [Math.PI / 2, w / 2, d],
      [-Math.PI / 2, -w / 2, d],
    ];
    for (const [a, off, len] of faces) {
      const n = new THREE.Vector3(Math.sin(a + ry), 0, Math.cos(a + ry));
      const o = new THREE.Vector3(cx + n.x * Math.abs(off), 0, cz + n.z * Math.abs(off));
      this.ivy.coverFace(o, n, len, h, density, 0.6);
    }
  }

  /** Bakes ivy and merges rigid stone one material per step so the streamer can spread the cost. */
  *finish(): Generator<void, UnitBuild, void> {
    const ivyMesh = this.ivy.build(this.lib);
    if (ivyMesh) this.group.add(ivyMesh);
    yield;
    for (const m of [this.lib.sandstone, this.lib.sandstoneDark, this.lib.flagstone, this.lib.wood, this.lib.iron]) {
      // Merge in batches so no single step touches more than ~10 meshes.
      let merged = 0;
      do {
        merged = mergeStaticChildren(this.group, new Set(), new Set([m]), 6);
        if (merged > 0) yield;
      } while (merged > 1);
    }
    return { group: this.group, colliders: this.colliders, updates: this.updates, disposables: this.disposables, mapRects: this.mapRects, fires: this.fires, anchors: this.anchors };
  }
}

export interface DoorSpec {
  side: 'n' | 's' | 'e' | 'w';
  offset: number;
  width: number;
  height: number;
}

export interface RoomSpec {
  cx: number;
  cz: number;
  floorY: number;
  width: number;
  depth: number;
  height: number;
  doors: DoorSpec[];
  pillars?: { cols: number; rows: number; inset: number };
  ceiling: boolean;
  /** Holes in the ceiling (moon shafts): rectangles relative to the room centre. */
  roofHoles?: Array<{ x: number; z: number; w: number; d: number }>;
  dark?: boolean;
  wallThickness?: number;
  floor?: boolean;
}

/**
 * Enclosed stone room with door openings, optional pillar grid and a ceiling with optional holes.
 * Walls are built as slabs around each opening; the lintel above a door keeps the room sealed.
 */
export function* buildRoom(acc: UnitAccumulator, r: RoomSpec): Generator<void, void, void> {
  const t = r.wallThickness ?? 1.2;
  const hw = r.width / 2;
  const hd = r.depth / 2;
  const dark = r.dark ?? false;
  if (r.floor !== false) {
    const floorGeo = new THREE.BoxGeometry(r.width + t * 2, 1.0, r.depth + t * 2, Math.ceil(r.width / 3), 1, Math.ceil(r.depth / 3));
    floorGeo.translate(0, -0.5, 0);
    const floor = new THREE.Mesh(floorGeo, acc.lib.flagstone);
    floor.position.set(r.cx, r.floorY, r.cz);
    setTriplanar(floorGeo, 5.6, 0.6);
    acc.mesh(floor);
    floor.receiveShadow = true;
    const c = acc.colliders[acc.colliders.length - 1];
    if (c && c.kind === 'box') c.surface = 'dry-stone';
  }
  yield;
  // Walls per side, split around doors.
  const sides: Array<{ side: DoorSpec['side']; x0: number; z0: number; x1: number; z1: number }> = [
    { side: 'n', x0: r.cx - hw - t, z0: r.cz - hd - t / 2, x1: r.cx + hw + t, z1: r.cz - hd - t / 2 },
    { side: 's', x0: r.cx - hw - t, z0: r.cz + hd + t / 2, x1: r.cx + hw + t, z1: r.cz + hd + t / 2 },
    { side: 'w', x0: r.cx - hw - t / 2, z0: r.cz - hd, x1: r.cx - hw - t / 2, z1: r.cz + hd },
    { side: 'e', x0: r.cx + hw + t / 2, z0: r.cz - hd, x1: r.cx + hw + t / 2, z1: r.cz + hd },
  ];
  for (const s of sides) {
    const doors = r.doors.filter((d) => d.side === s.side).sort((a, b) => a.offset - b.offset);
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const dirX = (s.x1 - s.x0) / len;
    const dirZ = (s.z1 - s.z0) / len;
    let cursor = -len / 2;
    const segment = function* (a: number, b: number): Generator<void, void, void> {
      if (b - a < 0.3) return;
      // Long walls are split into ≤ 24 m slabs so each build step stays small.
      let p0 = a;
      while (p0 < b - 0.05) {
        const p1 = Math.min(b, p0 + 24);
        const ax = s.x0 + dirX * (p0 + len / 2);
        const az = s.z0 + dirZ * (p0 + len / 2);
        const bx = s.x0 + dirX * (p1 + len / 2);
        const bz = s.z0 + dirZ * (p1 + len / 2);
        acc.wall(ax, az, bx, bz, r.floorY, r.height, t, dark);
        p0 = p1;
        yield;
      }
    };
    for (const d of doors) {
      const a = d.offset - d.width / 2;
      const b = d.offset + d.width / 2;
      yield* segment(cursor, a);
      // Lintel above the opening.
      const lx = s.x0 + dirX * (d.offset + len / 2);
      const lz = s.z0 + dirZ * (d.offset + len / 2);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(d.width + 0.4, r.height - d.height, t), dark ? acc.lib.sandstoneDark : acc.lib.sandstone);
      addWhiteColor(lintel.geometry);
      setTriplanar(lintel.geometry, 2.2, 0.8);
      lintel.position.set(lx, r.floorY + d.height + (r.height - d.height) / 2, lz);
      lintel.rotation.y = Math.atan2(-dirZ, dirX);
      acc.mesh(lintel);
      cursor = b;
    }
    yield* segment(cursor, len / 2);
  }
  if (r.pillars) {
    const p = r.pillars;
    let n = 0;
    for (let i = 0; i < p.cols; i++)
      for (let j = 0; j < p.rows; j++) {
        const x = r.cx - hw + p.inset + ((r.width - p.inset * 2) * i) / Math.max(1, p.cols - 1);
        const z = r.cz - hd + p.inset + ((r.depth - p.inset * 2) * j) / Math.max(1, p.rows - 1);
        acc.pillar(x, r.floorY, z, r.height - 0.05);
        if (++n % 2 === 0) yield;
      }
    yield;
  }
  if (r.ceiling) {
    const tile = 4;
    const holes = r.roofHoles ?? [];
    const nx = Math.ceil((r.width + t * 2) / tile);
    const nz = Math.ceil((r.depth + t * 2) / tile);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = r.cx - hw - t + tile * (i + 0.5);
        const z = r.cz - hd - t + tile * (j + 0.5);
        if (holes.some((h) => Math.abs(x - (r.cx + h.x)) < h.w / 2 + tile * 0.5 - 0.01 && Math.abs(z - (r.cz + h.z)) < h.d / 2 + tile * 0.5 - 0.01)) continue;
        const g = new THREE.BoxGeometry(tile + 0.02, 0.5, tile + 0.02);
        g.translate(x, r.floorY + r.height + 0.25, z);
        parts.push(g);
      }
    if (parts.length > 0) {
      const merged = mergeBoxes(parts);
      addWhiteColor(merged, 0.45);
      setTriplanar(merged, 3, 0.45);
      const roof = new THREE.Mesh(merged, acc.lib.sandstoneDark);
      roof.receiveShadow = true;
      roof.castShadow = true;
      acc.group.add(roof);
      acc.colliders.push({ kind: 'box', center: new THREE.Vector3(r.cx, r.floorY + r.height + 0.25, r.cz), half: new THREE.Vector3(hw + t, 0.25, hd + t), quaternion: new THREE.Quaternion(), surface: 'dry-stone' });
    }
    for (const h of holes) {
      acc.anchor(`${acc.zone}:roof-hole:${h.x.toFixed(0)}:${h.z.toFixed(0)}`, 'roof-hole', r.cx + h.x, r.floorY + r.height, r.cz + h.z, 0, Math.max(h.w, h.d), { w: h.w, d: h.d, floorY: r.floorY });
      acc.moonShaft(r.cx + h.x, r.floorY + r.height, r.floorY, r.cz + h.z, h.w, h.d);
    }
    yield;
  }
}

const mergeBoxes = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const idx: number[] = [];
  let off = 0;
  for (const g of parts) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    pos.set(p.array as Float32Array, off * 3);
    nrm.set(n.array as Float32Array, off * 3);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    off += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setIndex(idx);
  return out;
};

export const addWhiteColor = (geo: THREE.BufferGeometry, v = 1): void => {
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(v), 3));
};

/** World-space triplanar UVs for meshes positioned later: uses local coordinates scaled by `tile`. */
export const setTriplanar = (geo: THREE.BufferGeometry, tile: number, colorMul = 1): void => {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
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
  if (!geo.getAttribute('color')) addWhiteColor(geo, colorMul);
};
