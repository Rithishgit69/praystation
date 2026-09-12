import * as THREE from 'three';
import { Fireflies } from '../fx/Atmosphere';
import { TreeBuilder } from '../props/Foliage';
import { makeBanner } from '../props/Banner';
import { makeBlocks, makeBrazierPlinth, makeFloor, makePillar, makeSteps, makeWallSlab, scatteredBlocks, stackedBlocks } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator } from './UnitKit';

/**
 * The reference-frame courtyard (§2). North is -Z; the player spawns on the foreground terrace facing
 * north with the banner column to the left, the great steps and colonnade ahead-right.
 */
export function* buildCourtyard(ctx: ZoneBuildContext): Generator<void, UnitBuild & { spawn: { position: THREE.Vector3; yaw: number } }, void> {
  const { lib, quality: q } = ctx;
  const rng = ctx.rng.fork(2024);
  const acc = new UnitAccumulator(lib, rng, 'courtyard');
  const { group, colliders, updates, disposables, ivy } = acc;
  const place = acc.place.bind(acc);
  const fire = (x: number, y: number, z: number, opts: { scale?: number; light?: boolean; intensity?: number; distance?: number }): void => {
    acc.fire(x, y, z, { scale: opts.scale ?? 1, light: opts.light ?? true, intensity: opts.intensity ?? 26, distance: opts.distance ?? 16 });
  };
  // ---- Floors -------------------------------------------------------------------------------
  place(makeFloor(lib, 36, 36, 1.2, 1), 0, 0, -8);
  place(makeFloor(lib, 11, 8, 0.9, 2), 1.5, 0.9, 1.5); // foreground terrace (z -2.5..5.5)
  // Short stair descending from the terrace to the courtyard (rises toward +Z so it faces the player).
  place(makeSteps(lib, { width: 7.2, count: 4, rise: 0.225, run: 0.62, rng: rng.fork(6) }), 3.2, 0, -4.98, Math.PI);
  place(makeSteps(lib, { width: 7.2, count: 4, rise: 0.225, run: 0.62, rng: rng.fork(15) }), 1.5, 0, 8.0); // south stair up to the terrace
  place(makeFloor(lib, 9.5, 17, 0.62, 3), 12.7, 0.62, -4); // right terrace
  place(makeFloor(lib, 8, 48, 1.92, 4), 4.5, 1.92, -37); // colonnade floor, reaching the hall's south door

  yield;
  // ---- Great steps and colonnade ------------------------------------------------------------
  place(makeSteps(lib, { width: 7.6, count: 8, rise: 0.24, run: 0.46, rng: rng.fork(5) }), 4.5, 0, -8.5);
  const corridorZ0 = -14.2;
  for (let i = 0; i < 12; i++) {
    const z = corridorZ0 - i * 3.6;
    for (const x of [1.4, 7.6]) {
      place(makePillar(lib, { height: 5.1, rng: rng.fork(100 + i * 2 + (x > 4 ? 1 : 0)) }), x, 1.92, z);
    }
    if (i % 2 === 0) {
      const scale = 0.6;
      const near = i < 3;
      for (const x of [1.95, 7.05]) {
        const sconce = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 8, 1, true), lib.iron);
        sconce.position.set(x, 1.92 + 3.0, z);
        sconce.rotation.x = Math.PI;
        group.add(sconce);
        fire(x, 1.92 + 3.1, z, { scale, light: near, intensity: 14, distance: 8 });
        if (!near) {
          // Baked light pool instead of a real point light for far torches.
          acc.cookie(x + (x < 4.5 ? 0.9 : -0.9), 1.92 + 0.03, z, 5.5);
          acc.cookie(x + (x < 4.5 ? -0.55 : 0.55), 1.92 + 3.1, z, 3.2, 0, x < 4.5 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }
  }
  // Lintels along each pillar row, cross beams and a dark roof slab so the corridor recedes into darkness.
  for (const x of [1.4, 7.6]) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 12 * 3.6), lib.sandstoneDark);
    lintel.position.set(x, 1.92 + 5.1 + 0.25, corridorZ0 - 5.5 * 3.6);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    const col = new Float32Array(lintel.geometry.getAttribute('position').count * 3).fill(0.55);
    lintel.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(lintel);
  }
  for (let i = 0; i < 12; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.42, 0.7), lib.sandstoneDark);
    beam.position.set(4.5, 1.92 + 5.1 + 0.55, corridorZ0 - i * 3.6);
    beam.castShadow = true;
    const col = new Float32Array(beam.geometry.getAttribute('position').count * 3).fill(0.5);
    beam.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(beam);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.4, 12 * 3.6 + 2), lib.sandstoneDark);
  roof.position.set(4.5, 1.92 + 5.1 + 0.95, corridorZ0 - 5.5 * 3.6);
  roof.receiveShadow = true;
  const roofCol = new Float32Array(roof.geometry.getAttribute('position').count * 3).fill(0.35);
  roof.geometry.setAttribute('color', new THREE.BufferAttribute(roofCol, 3));
  group.add(roof);
  // Side walls enclosing the colonnade.
  place(makeWallSlab(lib, 44, 5.4, 1.1, rng.fork(7), true), -0.4, 1.92, corridorZ0 - 20.8, Math.PI / 2);
  place(makeWallSlab(lib, 44, 5.4, 1.1, rng.fork(9), true), 9.4, 1.92, corridorZ0 - 20.8, Math.PI / 2);
  // Flanking walls beside the stairs (retaining walls of the colonnade floor).
  place(makeBlocks(lib, stackedBlocks(rng.fork(11), 4.2, 4, 1.0), rng.fork(12)), 0.4, 0, -10.5, -Math.PI / 2);
  place(makeBlocks(lib, stackedBlocks(rng.fork(13), 4.2, 4, 1.0), rng.fork(14)), 8.6, 0, -10.5, -Math.PI / 2);

  yield;
  // ---- Left: banner column, block stack, broken pillars, rubble ------------------------------
  place(makePillar(lib, { height: 8.6, rng: rng.fork(20) }), -6.0, 0, -8.8);
  const banner = makeBanner(lib, 1.75, 3.8);
  place(banner, -6.9, 5.05, -7.85, 0.06);
  place(makeBlocks(lib, stackedBlocks(rng.fork(21), 3.3, 7, 1.25, 0.03), rng.fork(22)), -8.2, 0, -4.4, -0.42);
  place(makeBlocks(lib, scatteredBlocks(rng.fork(23), 8, 3.2), rng.fork(24)), -10.5, 0, -2.5);
  place(makePillar(lib, { height: 8, brokenAt: 4.4, rng: rng.fork(25) }), -11.6, 0, -9.5, 0.3);
  place(makePillar(lib, { height: 8, brokenAt: 6.2, rng: rng.fork(26) }), -13.4, 0, -14.5, 0.1);
  place(makePillar(lib, { height: 7.4, rng: rng.fork(27) }), -10.6, 0, -17.5, 0.2);
  place(makeBlocks(lib, stackedBlocks(rng.fork(28), 6, 3, 1.2), rng.fork(29)), -12.5, 0, -20.5, 0.15);
  // Toppled pillar drum lying on the ground.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 2.6, 8), lib.sandstone);
  drum.rotation.set(Math.PI / 2, 0, 0.4);
  drum.position.set(-9.8, 0.34, -12.6);
  drum.castShadow = drum.receiveShadow = true;
  const drumCol = new Float32Array(drum.geometry.getAttribute('position').count * 3).fill(0.8);
  drum.geometry.setAttribute('color', new THREE.BufferAttribute(drumCol, 3));
  group.add(drum);
  colliders.push({ kind: 'box', center: drum.position.clone(), half: new THREE.Vector3(0.4, 0.34, 1.3), quaternion: drum.quaternion.clone(), surface: 'dry-stone' });

  yield;
  // ---- Braziers ---------------------------------------------------------------------------------
  const brazier = (x: number, y: number, z: number, opts: { intensity?: number; distance?: number }): void => {
    const b = makeBrazierPlinth(lib, { rng: rng.fork(Math.round(x * 7 + z * 13)) });
    place(b, x, y, z);
    fire(x, y + b.fireHeight, z, { scale: 1, light: true, intensity: opts.intensity ?? 30, distance: opts.distance ?? 18 });
  };
  brazier(-4.6, 0, -3.2, { intensity: 55, distance: 13 }); // left foreground (hero)
  brazier(1.6, 1.92, -13.6, { intensity: 45, distance: 12 }); // top of steps, left
  brazier(12.4, 0.62, -10.8, { intensity: 40, distance: 11 }); // far right
  brazier(9.6, 0.62, 0.2, { intensity: 34, distance: 9 }); // right, near the camera

  yield;
  // ---- Right terrace -------------------------------------------------------------------------
  place(makeBlocks(lib, stackedBlocks(rng.fork(30), 4.4, 5, 1.3), rng.fork(31)), 13.2, 0.62, -5.2, 0.12);
  place(makeBlocks(lib, scatteredBlocks(rng.fork(32), 5, 2.2), rng.fork(33)), 11.0, 0.62, -1.2);
  place(makePillar(lib, { height: 6.4, rng: rng.fork(34) }), 15.2, 0.62, -9.5);
  place(makePillar(lib, { height: 7, brokenAt: 3.6, rng: rng.fork(35) }), 15.8, 0.62, -1.5, 0.2);
  place(makePillar(lib, { height: 6.4, rng: rng.fork(36) }), 16.4, 0.0, 5.5, 0.1);
  // Terrace retaining edge.
  place(makeBlocks(lib, stackedBlocks(rng.fork(37), 9, 1, 0.9), rng.fork(38)), 8.0, 0, -6.5, -Math.PI / 2);
  place(makeBlocks(lib, stackedBlocks(rng.fork(39), 5, 3, 1.2), rng.fork(44)), 8.6, 0.62, 5.0, -Math.PI / 2);

  // ---- Behind the player: gate remnants -------------------------------------------------------
  place(makePillar(lib, { height: 7.6, rng: rng.fork(40) }), -4.5, 0, 7.5);
  place(makePillar(lib, { height: 7.6, brokenAt: 5.5, rng: rng.fork(41) }), 7.5, 0, 7.5);
  place(makeBlocks(lib, scatteredBlocks(rng.fork(42), 6, 2.5), rng.fork(43)), -9, 0, 6);

  yield;
  // ---- Ivy ------------------------------------------------------------------------------------------
  const stackFaces = (cx: number, cz: number, w: number, h: number, d: number, ry: number, density = 1): void => {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const faces: Array<[number, number, number]> = [
      [0, d / 2, w],
      [Math.PI, -d / 2, w],
      [Math.PI / 2, w / 2, d],
      [-Math.PI / 2, -w / 2, d],
    ];
    for (const [a, off, len] of faces) {
      const n = new THREE.Vector3(Math.sin(a + ry), 0, Math.cos(a + ry));
      const o = new THREE.Vector3(cx + n.x * Math.abs(off), 0, cz + n.z * Math.abs(off));
      void cos;
      void sin;
      ivy.coverFace(o, n, len, h, density, 0.6);
    }
  };
  stackFaces(-8.2, -4.4, 3.3, 3.2, 1.25, -0.42, 1.8);
  stackFaces(-6.0, -8.8, 1.0, 5.5, 1.0, 0, 0.9);
  stackFaces(13.2, -5.2, 4.4, 2.4, 1.3, 0.12, 1.6);
  stackFaces(-11.6, -9.5, 0.9, 3.5, 0.9, 0.3, 0.8);
  stackFaces(0.4, -10.5, 1.0, 1.9, 4.2, 0, 0.9);
  stackFaces(8.6, -10.5, 1.0, 1.9, 4.2, 0, 0.9);
  stackFaces(-4.5, 7.5, 1.0, 4.5, 1.0, 0, 0.7);
  for (let i = 0; i < 8; i++) ivy.strand(new THREE.Vector3(-6.4 + rng.range(-0.3, 0.3), 6.4 - i * 0.2, -8.3), rng.range(1.2, 2.6), new THREE.Vector3(0, 0, 1));
  stackFaces(8.6, 5.0, 1.2, 1.6, 5, 0, 1.1);
  for (let i = 0; i < 6; i++) ivy.strand(new THREE.Vector3(1.4 + rng.range(-0.4, 0.4), 4.6, corridorZ0 + 0.5), rng.range(1, 2), new THREE.Vector3(0, 0, 1));
  ivy.patch(new THREE.Vector3(-5.5, 0, -2), 2.2, 70);
  ivy.patch(new THREE.Vector3(9.5, 0.62, -8), 1.6, 40);
  ivy.patch(new THREE.Vector3(-2.5, 0, -7.5), 1.4, 36);
  ivy.patch(new THREE.Vector3(6.5, 0.9, 3.5), 1.2, 28);
  ivy.patch(new THREE.Vector3(-9.5, 0, 3), 2.5, 60);

  yield;
  // ---- Near trees (inside the zone bounds; the forest cells provide the ring beyond) -----------------
  const treeRng = rng.fork(50);
  const forest = new TreeBuilder(treeRng);
  for (let i = 0; i < 10; i++) forest.tree(treeRng.range(-40, -22), treeRng.range(-30, 4), treeRng.range(11, 15), treeRng.range(0, Math.PI * 2));
  for (let i = 0; i < 6; i++) forest.tree(treeRng.range(22, 40), treeRng.range(-40, 10), treeRng.range(10, 14), treeRng.range(0, Math.PI * 2));
  for (let i = 0; i < 14; i++) forest.bush(treeRng.range(-40, -20), treeRng.range(-36, 10), treeRng.range(1.6, 3.2));
  for (const o of forest.build(lib)) group.add(o);
  colliders.push(...forest.colliders);
  yield;
  // ---- Atmosphere ------------------------------------------------------------------------------
  acc.mist([
    { x: -16, y: 0.5, z: -12, size: 24, opacity: 0.2 },
    { x: -20, y: 0.4, z: 4, size: 22, opacity: 0.18 },
    { x: 4.5, y: 2.4, z: -38, size: 20, opacity: 0.16 },
    { x: 20, y: 0.8, z: -14, size: 22, opacity: 0.16 },
    { x: 2, y: 0.4, z: 16, size: 24, opacity: 0.16 },
    { x: -8, y: 0.3, z: -6, size: 12, opacity: 0.1 },
  ]);
  const flies = new Fireflies(lib, rng.fork(61), q.tier === 'low' ? 30 : 70, { min: new THREE.Vector3(-34, 1, -34), max: new THREE.Vector3(-12, 6, 8) });
  group.add(flies.points);
  updates.push((_dt, t) => flies.update(t));
  disposables.push(() => flies.dispose());
  const flies2 = new Fireflies(lib, rng.fork(62), q.tier === 'low' ? 14 : 30, { min: new THREE.Vector3(16, 1, -30), max: new THREE.Vector3(34, 5, 8) });
  group.add(flies2.points);
  updates.push((_dt, t) => flies2.update(t));
  disposables.push(() => flies2.dispose());

  // Debris decals on the foreground stones.
  const debrisRng = rng.fork(63);
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5), lib.debris);
    d.rotation.set(-Math.PI / 2, 0, debrisRng.range(0, Math.PI * 2));
    const onPlatform = i < 4;
    d.position.set(debrisRng.range(-3, 6), onPlatform ? 0.905 : 0.005, onPlatform ? debrisRng.range(-3, 5) : debrisRng.range(-8, -5));
    d.receiveShadow = true;
    group.add(d);
  }

  // Side-wall openings to the lore chambers and outer walls to the forest.
  acc.wall(-38, -50, -38, -20, 0, 5.5, 1.4);
  acc.wall(-38, -12, -38, 30, 0, 5.5, 1.4);
  acc.wall(38, -50, 38, -20, 0, 5.5, 1.4);
  acc.wall(38, -12, 38, 30, 0, 5.5, 1.4);
  acc.moonOnly(acc.glyph('broken-circle', -6.0, 3.2, -8.3, new THREE.Vector3(0, 0, 1), 0.9, 0xa9c6f0, 0.55), 'moonlit');
  acc.anchor('shrine:courtyard', 'shrine', -4.6, 1.6, -3.2, 0, 2.4, { lit: ctx.flags['shrine:courtyard'] === true });
  acc.anchor('trigger:courtyard-enter', 'trigger', 1.6, 1.0, 2.6, 0, 6);
  yield;
  void q;
  void updates;
  void disposables;
  const out = yield* acc.finish();
  return { ...out, spawn: { position: new THREE.Vector3(1.6, 1.0, 2.6), yaw: 0 } };
}
