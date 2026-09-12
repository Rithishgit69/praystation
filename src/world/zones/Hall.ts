import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBrazierPlinth, makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Hall of Memories (Chapter I). A hypostyle hall at colonnade level with collapsed roof sections
 * (moon shafts), a raised dais at the north wall bearing the Broken Tusk mural, and a sealed east door
 * that opens once the memory is complete.
 */
export function* buildHall(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'hall');
  const floorY = 1.92;
  const cx = 4.5;
  const cz = -92;
  yield* buildRoom(acc, {
    cx,
    cz,
    floorY,
    width: 62,
    depth: 72,
    height: 9.5,
    doors: [
      { side: 's', offset: 0, width: 7.6, height: 6.0 },
      { side: 'e', offset: -8, width: 4.2, height: 4.6 },
    ],
    pillars: { cols: 5, rows: 6, inset: 7 },
    ceiling: true,
    roofHoles: [
      { x: 4, z: 28, w: 10, d: 6 },
      { x: -12, z: 8, w: 8, d: 8 },
      { x: 14, z: -6, w: 8, d: 12 },
      { x: 0, z: -24, w: 12, d: 8 },
    ],
  });
  // Dais with steps at the north end.
  acc.place(makeSteps(ctx.lib, { width: 14, count: 4, rise: 0.24, run: 0.5, rng: ctx.rng.fork(4) }), cx, floorY, cz - 24);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(22, 0.96, 10), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, floorY + 0.48, cz - 31);
  acc.mesh(dais);
  yield;
  // Mural wall: a tall carved panel on the north wall, damaged at the edges.
  const panel = new THREE.Mesh(new RoundedBoxGeometry(12, 6, 0.5, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(panel.geometry, 3, 0.85);
  panel.position.set(cx, floorY + 0.96 + 3.6, cz - 35.4);
  acc.mesh(panel, false);
  acc.anchor('mural:broken-tusk', 'mural', cx, floorY + 0.96 + 1.4, cz - 34.6, Math.PI, 3.2, { chapter: 'ch1' }, panel);
  // Braziers flanking the dais.
  for (const s of [-1, 1]) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(9 + s) });
    acc.place(b, cx + s * 8, floorY + 0.96, cz - 33);
    acc.fire(cx + s * 8, floorY + 0.96 + b.fireHeight, cz - 33, { intensity: 44, distance: 14 });
  }
  // Sealed east door: a stone slab in the doorway until the memory completes.
  const opened = ctx.flags['door:hall-east'] === true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, 4.2), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx + 31 + 0.6, floorY + 2.3 + (opened ? 4.7 : 0), cz - 8);
  if (opened) acc.mesh(slab, false);
  else acc.mesh(slab);
  acc.anchor('door:hall-east', 'door', cx + 31.6, floorY, cz - 8, Math.PI / 2, 3, { opened }, slab);
  // Fallen roof rubble under the holes, wall torches, mist.
  acc.blockStack(cx - 12, floorY, cz + 6, 5, 2, 1.2, 0.4);
  acc.blockStack(cx + 14, floorY, cz - 4, 4, 1, 1.1, -0.3);
  for (let i = 0; i < 6; i++) {
    const z = cz + 30 - i * 12;
    for (const s of [-1, 1]) {
      const x = cx + s * 30.4;
      acc.fire(x - s * 0.5, floorY + 3.2, z, { scale: 0.55, light: i < 3, intensity: 16, distance: 10 });
      if (i >= 3) acc.cookie(x - s * 1.4, floorY + 0.03, z, 6);
    }
  }
  acc.mist([{ x: cx - 12, y: floorY + 0.4, z: cz + 8, size: 16, opacity: 0.16 }, { x: cx + 14, y: floorY + 0.4, z: cz - 6, size: 16, opacity: 0.16 }, { x: cx, y: floorY + 0.4, z: cz - 24, size: 18, opacity: 0.14 }], 0x4a6a9c);
  acc.anchor('trigger:hall-enter', 'trigger', cx, floorY, cz + 32, 0, 6);
  yield;
  return yield* acc.finish();
}
