import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBanner } from '../props/Banner';
import { makeBrazierPlinth, makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext, ZoneId } from '../WorldTypes';
import { UnitAccumulator, addWhiteColor, buildRoom, setTriplanar } from './UnitKit';

/**
 * The battle arenas: one wide, flat, unobstructed floor per task, dressed after the temple room the
 * villain belongs to (courtyard, Hall of Memories, library, Moon Chamber). Everything that could block
 * a sidestep — pillars, braziers, shelves, block stacks — stands at the rim, outside the fighting
 * circle. They sit far outside the terrain (x ≈ 2000) like the memory arena, so nothing streams
 * under them and the temple itself is untouched.
 */
export const ARENA_CENTRES: Record<'arena-courtyard' | 'arena-hall' | 'arena-library' | 'arena-moon', { x: number; z: number }> = {
  'arena-courtyard': { x: 2000, z: -400 },
  'arena-hall': { x: 2000, z: -800 },
  'arena-library': { x: 2000, z: -1200 },
  'arena-moon': { x: 2000, z: -1600 },
};

const CORNERS: Array<[number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Round flagstone floor with a broken rim of rocks (the courtyard sits under the open sky). */
function terrace(acc: UnitAccumulator, ctx: ZoneBuildContext, cx: number, cz: number, radius: number): void {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 2, 3, 48), ctx.lib.flagstone);
  setTriplanar(floor.geometry, 5.6, 0.95);
  floor.position.set(cx, -1.5, cz);
  acc.mesh(floor);
  acc.colliders.pop();
  acc.colliders.push({ kind: 'cylinder', center: new THREE.Vector3(cx, -1.5, cz), halfHeight: 1.5, radius, surface: 'dry-stone' });
  const rockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
  setTriplanar(rockGeo, 1.6, 0.85);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const r = radius + 1 + ctx.rng.range(-0.5, 2.5);
    const s = ctx.rng.range(1.4, 3.6);
    const rock = new THREE.Mesh(rockGeo, ctx.lib.sandstone);
    rock.position.set(cx + Math.cos(a) * r, ctx.rng.range(-0.6, 0.9), cz + Math.sin(a) * r);
    rock.scale.set(s * ctx.rng.range(0.8, 1.6), s * ctx.rng.range(0.5, 1.2), s);
    rock.rotation.set(ctx.rng.range(-0.3, 0.3), a, ctx.rng.range(-0.3, 0.3));
    acc.mesh(rock);
  }
}

/** Low waist-high wall segments between rim pillars: the edge reads without boxing the fight in. */
function parapet(acc: UnitAccumulator, cx: number, cz: number, radius: number, count: number, gapAt: number[]): void {
  for (let i = 0; i < count; i++) {
    if (gapAt.includes(i)) continue;
    const a0 = (i / count) * Math.PI * 2 + 0.08;
    const a1 = ((i + 1) / count) * Math.PI * 2 - 0.08;
    acc.wall(cx + Math.cos(a0) * radius, cz + Math.sin(a0) * radius, cx + Math.cos(a1) * radius, cz + Math.sin(a1) * radius, 0, 1.1, 0.9);
  }
}

/** Task 1 — the Courtyard of the Arrogant: an open moonlit court ringed by a torch-lit colonnade. */
export function* buildArenaCourtyard(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng.fork(41), 'arena-courtyard');
  const { x: cx, z: cz } = ARENA_CENTRES['arena-courtyard'];
  const R = 34;
  terrace(acc, ctx, cx, cz, R);
  yield;
  // Rim colonnade: 16 pillars with sconce torches on every other one; parapets between them, open at
  // the south (where the traveller arrives) and the north (the great steps).
  const N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = cx + Math.cos(a) * (R - 2.2);
    const pz = cz + Math.sin(a) * (R - 2.2);
    acc.pillar(px, 0, pz, 6.2 + ctx.rng.range(-0.2, 0.4));
    if (i % 2 === 0) acc.fire(px - Math.cos(a) * 1.1, 3.4, pz - Math.sin(a) * 1.1, { scale: 0.6, intensity: 16, distance: 14, light: i % 4 === 0 });
    if (i % 4 === 3) yield;
  }
  parapet(acc, cx, cz, R - 2.2, N, [3, 4, 11, 12]);
  yield;
  // The great steps and a colonnade façade at the north: the villain's entrance.
  acc.place(makeSteps(ctx.lib, { width: 16, count: 5, rise: 0.24, run: 0.5, rng: ctx.rng.fork(5) }), cx, 0, cz - R + 2.2);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 10), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.9);
  dais.position.set(cx, 1.2 - 0.0, cz - R - 3.4);
  acc.mesh(dais);
  for (const dx of [-9, -4.5, 0, 4.5, 9]) acc.pillar(cx + dx, 2.4, cz - R - 4.5, 7.4);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(22, 0.9, 1.6), ctx.lib.sandstoneDark);
  addWhiteColor(lintel.geometry, 0.55);
  lintel.position.set(cx, 2.4 + 7.4 + 0.45, cz - R - 4.5);
  acc.mesh(lintel, false);
  acc.place(makeBanner(ctx.lib, 1.75, 3.8), cx - 6.8, 2.4 + 6.2, cz - R - 4.0, 0.06);
  acc.place(makeBanner(ctx.lib, 1.75, 3.8), cx + 6.8, 2.4 + 6.2, cz - R - 4.0, -0.06);
  yield;
  // Braziers on the rim at the diagonals, and a banner column at the east and west.
  const rimBraziers: Array<[number, number]> = [
    [-22, -22],
    [22, -22],
    [-24, 18],
    [24, 18],
  ];
  for (const [dx, dz] of rimBraziers) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(Math.round(dx * 3 + dz)) });
    acc.place(b, cx + dx, 0, cz + dz);
    acc.fire(cx + dx, b.fireHeight, cz + dz, { scale: 1, intensity: 44, distance: 24 });
  }
  for (const side of [-1, 1]) {
    acc.pillar(cx + side * (R - 1.4), 0, cz + 2, 9);
    acc.place(makeBanner(ctx.lib, 1.6, 3.6), cx + side * (R - 1.4) - side * 0.9, 5.3, cz + 3.1, side * 0.05);
  }
  acc.mist([{ x: cx, y: 0.8, z: cz + R + 14, size: 80, opacity: 0.2 }, { x: cx - R - 16, y: 1.5, z: cz, size: 70, opacity: 0.18 }, { x: cx + R + 16, y: 1.5, z: cz, size: 70, opacity: 0.18 }], 0x3f5f8f);
  yield;
  return yield* acc.finish();
}

/** Pillars along the inside of a square room's walls (never on the floor itself). */
function rimPillars(acc: UnitAccumulator, cx: number, cz: number, half: number, floorY: number, height: number, every: number, skip: (x: number, z: number) => boolean = () => false): void {
  const inset = half - 3.2;
  for (let p = -inset; p <= inset + 0.01; p += every) {
    const spots: Array<[number, number]> = [
      [cx + p, cz - inset],
      [cx + p, cz + inset],
      [cx - inset, cz + p],
      [cx + inset, cz + p],
    ];
    for (const [x, z] of spots) {
      if (skip(x, z)) continue;
      acc.pillar(x, floorY, z, height - 0.05);
    }
  }
}

/** Task 2 — the Hall of the Wrathful: a hypostyle hall with its pillars pushed to the walls and the roof open to the moon. */
export function* buildArenaHall(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng.fork(42), 'arena-hall');
  const { x: cx, z: cz } = ARENA_CENTRES['arena-hall'];
  const W = 72;
  yield* buildRoom(acc, {
    cx,
    cz,
    floorY: 0,
    width: W,
    depth: W,
    height: 12,
    doors: [{ side: 's', offset: 0, width: 8, height: 7 }],
    ceiling: true,
    roofHoles: [
      { x: 0, z: 0, w: 14, d: 14 },
      { x: -22, z: -20, w: 8, d: 8 },
      { x: 22, z: -20, w: 8, d: 8 },
      { x: -22, z: 22, w: 8, d: 8 },
      { x: 22, z: 22, w: 8, d: 8 },
    ],
  });
  rimPillars(acc, cx, cz, W / 2, 0, 12, 9, (x, z) => Math.abs(x - cx) < 5 && z > cz + 30);
  yield;
  // The dais at the north wall with its braziers and banners.
  acc.place(makeSteps(ctx.lib, { width: 16, count: 4, rise: 0.24, run: 0.5, rng: ctx.rng.fork(4) }), cx, 0, cz - W / 2 + 9);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(26, 0.96, 8), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, 0.48, cz - W / 2 + 4.2);
  acc.mesh(dais);
  for (const s of [-1, 1]) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(9 + s) });
    acc.place(b, cx + s * 9, 0.96, cz - W / 2 + 4);
    acc.fire(cx + s * 9, 0.96 + b.fireHeight, cz - W / 2 + 4, { intensity: 44, distance: 16 });
    acc.place(makeBanner(ctx.lib, 2.0, 4.4), cx + s * 16, 7.6, cz - W / 2 + 1.2, 0);
  }
  yield;
  // Braziers in the four corners (outside the fighting circle) and torches along the walls.
  for (const [sx, sz] of CORNERS) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(20 + sx * 2 + sz) });
    acc.place(b, cx + sx * 30, 0, cz + sz * 30);
    acc.fire(cx + sx * 30, b.fireHeight, cz + sz * 30, { intensity: 36, distance: 22 });
  }
  for (const p of [-18, 0, 18]) {
    acc.fire(cx - W / 2 + 1.0, 3.2, cz + p, { scale: 0.6, intensity: 12, distance: 9, light: false });
    acc.fire(cx + W / 2 - 1.0, 3.2, cz + p, { scale: 0.6, intensity: 12, distance: 9, light: false });
    acc.cookie(cx - W / 2 + 2.2, 0.03, cz + p, 5);
    acc.cookie(cx + W / 2 - 2.2, 0.03, cz + p, 5);
  }
  yield;
  return yield* acc.finish();
}

/** Task 3 — the Library of the Grasping: a long reading hall, the shelf stacks pushed to its walls. */
export function* buildArenaLibrary(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng.fork(43), 'arena-library');
  const { x: cx, z: cz } = ARENA_CENTRES['arena-library'];
  const W = 74;
  yield* buildRoom(acc, { cx, cz, floorY: 0, width: W, depth: W, height: 10, doors: [{ side: 's', offset: 0, width: 5, height: 5 }], ceiling: true, roofHoles: [{ x: 0, z: -6, w: 10, d: 16 }] });
  // Shelf stacks along the east and west walls, with scroll niches; lamps on their ends.
  acc.mark('arena-library:shelves');
  for (let i = 0; i < 4; i++) {
    const z = cz - 27 + i * 18;
    for (const side of [-1, 1]) {
      const x0 = cx + side * (W / 2 - 1.6);
      const x1 = cx + side * (W / 2 - 7.6);
      acc.wall(x0, z, x1, z, 0, 2.9, 1.3, true);
      for (let k = 0; k < 3; k++) {
        const x = cx + side * (W / 2 - 2.6 - k * 2);
        acc.glyph('scroll', x, 1.6, z + 0.66, new THREE.Vector3(0, 0, 1), 0.5, 0xd9b370, 0.35);
        acc.glyph('scroll', x, 1.6, z - 0.66, new THREE.Vector3(0, 0, -1), 0.5, 0xd9b370, 0.35);
      }
      acc.fire(x1 - side * 0.2, 3.3, z, { scale: 0.5, intensity: 12, distance: 9, light: i % 2 === 0 && side < 0 });
      acc.cookie(x1 - side * 1.4, 0.03, z, 5);
    }
    yield;
  }
  // Scribe's dais and inscription wall at the north.
  acc.place(makeSteps(ctx.lib, { width: 14, count: 3, rise: 0.24, run: 0.5, rng: ctx.rng.fork(6) }), cx, 0, cz - W / 2 + 8.6);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(24, 0.72, 8), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, 0.36, cz - W / 2 + 4.2);
  acc.mesh(dais);
  const frame = new THREE.Mesh(new RoundedBoxGeometry(18, 5.6, 0.5, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(frame.geometry, 3, 0.85);
  frame.position.set(cx, 0.72 + 3.2, cz - W / 2 + 0.5);
  acc.mesh(frame, false);
  for (let k = 0; k < 7; k++) acc.glyph('scroll', cx - 7.2 + k * 2.4, 3.6, cz - W / 2 + 0.8, new THREE.Vector3(0, 0, 1), 0.9, 0xd9b370, 0.5);
  for (const s of [-1, 1]) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(12 + s) });
    acc.place(b, cx + s * 9, 0.72, cz - W / 2 + 4);
    acc.fire(cx + s * 9, 0.72 + b.fireHeight, cz - W / 2 + 4, { intensity: 40, distance: 16 });
  }
  yield;
  // Reading lamps in the corners and a warm pool under the roof opening.
  for (const [sx, sz] of CORNERS.filter(([, z]) => z > 0)) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(30 + sx) });
    acc.place(b, cx + sx * 31, 0, cz + sz * 31);
    acc.fire(cx + sx * 31, b.fireHeight, cz + sz * 31, { intensity: 34, distance: 22 });
  }
  yield;
  return yield* acc.finish();
}

/** Task 4 — the Moon Chamber of the Deluder: a great round-feeling chamber open to the moon, mirrors at the rim. */
export function* buildArenaMoon(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng.fork(44), 'arena-moon');
  const { x: cx, z: cz } = ARENA_CENTRES['arena-moon'];
  const W = 82;
  yield* buildRoom(acc, {
    cx,
    cz,
    floorY: 0,
    width: W,
    depth: W,
    height: 16,
    doors: [{ side: 's', offset: 0, width: 6, height: 6 }],
    ceiling: true,
    roofHoles: [
      { x: 0, z: 0, w: 18, d: 18 },
      { x: -26, z: -26, w: 7, d: 7 },
      { x: 26, z: -26, w: 7, d: 7 },
      { x: -26, z: 26, w: 7, d: 7 },
      { x: 26, z: 26, w: 7, d: 7 },
    ],
  });
  rimPillars(acc, cx, cz, W / 2, 0, 16, 10.25, (x, z) => Math.abs(x - cx) < 4 && z > cz + 34);
  yield;
  // A ring of shallow steps marks the fighting circle without blocking it (a 0.2 m lip, walkable).
  const ring = new THREE.Mesh(new THREE.RingGeometry(35, 37.5, 64), ctx.lib.sandstoneDark);
  addWhiteColor(ring.geometry, 0.7);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(cx, 0.02, cz);
  ring.receiveShadow = true;
  acc.group.add(ring);
  // Mirror stands at the rim (decorative here; the true chamber's puzzle mirrors).
  const mirrorGeo = new RoundedBoxGeometry(2.4, 3.0, 0.25, 2, 0.05);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mx = cx + Math.cos(a) * 36;
    const mz = cz + Math.sin(a) * 36;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.0, 16), ctx.lib.sandstone);
    setTriplanar(ped.geometry, 2, 0.9);
    ped.position.set(mx, 0.5, mz);
    acc.mesh(ped);
    const pivot = new THREE.Group();
    pivot.position.set(mx, 1.0, mz);
    pivot.rotation.y = a + Math.PI;
    const mirror = new THREE.Mesh(mirrorGeo, ctx.lib.iron);
    mirror.position.y = 1.6;
    mirror.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.7), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, roughness: 0.05, metalness: 1.0 }));
    face.position.set(0, 1.6, 0.14);
    pivot.add(mirror, face);
    acc.group.add(pivot);
    acc.disposables.push(() => face.material.dispose());
    acc.colliders.push({ kind: 'cylinder', center: new THREE.Vector3(mx, 2.0, mz), halfHeight: 1.6, radius: 1.3, surface: 'dry-stone' });
  }
  yield;
  // Cold braziers at the four corners; a pale pool of moonlight already falls through the roof.
  for (const [sx, sz] of CORNERS) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(50 + sx * 2 + sz) });
    acc.place(b, cx + sx * 34, 0, cz + sz * 34);
    acc.fire(cx + sx * 34, b.fireHeight, cz + sz * 34, { intensity: 30, distance: 22 });
  }
  acc.mist([{ x: cx, y: 1.2, z: cz, size: 60, opacity: 0.12 }], 0x3f5f8f);
  yield;
  return yield* acc.finish();
}

export const ARENA_BUILDERS: Record<keyof typeof ARENA_CENTRES, (ctx: ZoneBuildContext) => Generator<void, UnitBuild, void>> = {
  'arena-courtyard': buildArenaCourtyard,
  'arena-hall': buildArenaHall,
  'arena-library': buildArenaLibrary,
  'arena-moon': buildArenaMoon,
};

export const isArenaZone = (id: ZoneId): id is keyof typeof ARENA_CENTRES => id in ARENA_CENTRES;
