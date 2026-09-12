import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBlocks, makePillar, makeSteps, stackedBlocks } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Corrupted Passage (Chapter II). A descending corridor with mirrored "false" side rooms; the
 * distortion spawns copies of rooms and objects, which the light mechanic later exposes.
 */
export function* buildPassage(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'passage');
  const y0 = 1.92;
  // Segment A: east from the hall's east door (x 35.5, z −100) at floor 1.92, with the twin side rooms.
  yield* buildRoom(acc, { cx: 68, cz: -100, floorY: y0, width: 64, depth: 5, height: 5, doors: [{ side: 'w', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 8, width: 3.2, height: 3.8 }, { side: 's', offset: -8, width: 3.2, height: 3.8 }], ceiling: true, dark: true, wallThickness: 1.4 });
  // Twin side rooms: the true room (north) and its false copy (south), mirrored.
  yield* buildRoom(acc, { cx: 76, cz: -112, floorY: y0, width: 10, depth: 12, height: 5, doors: [{ side: 's', offset: 0, width: 3.2, height: 3.8 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: 60, cz: -88, floorY: y0, width: 10, depth: 12, height: 5, doors: [{ side: 'n', offset: 0, width: 3.2, height: 3.8 }], ceiling: true, dark: true });
  for (const [x, z, id] of [[76, -114, 'true'], [60, -86, 'false']] as const) {
    const altar = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.0, 1.0, 2, 0.04), id === 'true' ? ctx.lib.sandstone : ctx.lib.sandstone.clone());
    setTriplanar(altar.geometry, 2, 0.85);
    altar.position.set(x, y0 + 0.5, z);
    if (id === 'true') acc.mesh(altar);
    else {
      altar.castShadow = false; // the false altar casts no shadow: the clue
      acc.group.add(altar);
      acc.disposables.push(() => (altar.material as THREE.Material).dispose());
    }
    acc.glyph('broken-circle', x, y0 + 1.01, z, new THREE.Vector3(0, 1, 0), 0.5, 0xffd98a, 0.7);
    acc.anchor(`object:passage-altar-${id}`, 'mechanism', x, y0 + 1.0, z, 0, 2.8, { real: id === 'true' }, altar);
    acc.fire(x, y0 + 1.1, z, { scale: 0.4, intensity: 10, distance: 7 });
  }
  // More false copies along the corridor: a pillar and a block stack that are not there.
  const falsePillar = makePillar(ctx.lib, { height: 4.9, rng: ctx.rng.fork(31) });
  const fpMesh = falsePillar.object as THREE.Mesh;
  fpMesh.material = ctx.lib.sandstone.clone();
  fpMesh.castShadow = false;
  fpMesh.position.set(56, y0, -100);
  acc.group.add(fpMesh);
  acc.disposables.push(() => (fpMesh.material as THREE.Material).dispose());
  acc.anchor('illusion:passage-pillar', 'mechanism', 56, y0 + 1.5, -100, 0, 2.6, { real: false }, fpMesh);
  const falseBlocks = makeBlocks(ctx.lib, stackedBlocks(ctx.rng.fork(32), 3, 3, 1.1), ctx.rng.fork(33));
  const fbMesh = falseBlocks.object as THREE.Mesh;
  fbMesh.material = ctx.lib.sandstone.clone();
  fbMesh.castShadow = false;
  fbMesh.position.set(88, y0, -98.5);
  acc.group.add(fbMesh);
  acc.disposables.push(() => (fbMesh.material as THREE.Material).dispose());
  acc.anchor('illusion:passage-blocks', 'mechanism', 88, y0 + 0.8, -98.5, 0, 2.6, { real: false }, fbMesh);
  yield;
  // Segment B: stair room descending from the corridor level (1.92) to −2, heading north; then the corridor
  // north with the collapsed side room, and the last leg to the moon chamber's south door at (103, −148).
  yield* buildRoom(acc, { cx: 103, cz: -100, floorY: -2, width: 6, depth: 20, height: 8, doors: [{ side: 'w', offset: 0, width: 4.2, height: 8 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, floor: true });
  acc.landing(103, y0, -95, 6, 12);
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 16, rise: 0.245, run: 0.5, rng: ctx.rng.fork(8) }), 103, -2, -109, Math.PI); // rises toward +z: −2 at z −109 → 1.92 at z −101
  yield* buildRoom(acc, { cx: 103, cz: -125, floorY: -2, width: 5, depth: 30, height: 5, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 6, width: 3, height: 3.6 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: 113, cz: -119, floorY: -2, width: 12, depth: 10, height: 5, doors: [{ side: 'w', offset: 0, width: 3, height: 3.6 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: 103, cz: -144, floorY: -2, width: 5, depth: 8, height: 5, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true });
  const sealed = ctx.flags['door:passage-moon'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.6), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(103, -2 + 2.3 + (sealed ? 0 : 4.7), -147.4);
  acc.mesh(slab, sealed);
  acc.anchor('door:passage-moon', 'door', 103, -2, -147.4, 0, 3, { opened: !sealed }, slab);
  // Torches and cookies along the way.
  for (const [x, z, y] of [[46, -101.6, y0], [70, -101.6, y0], [92, -101.6, y0], [103, -114, -2], [103, -132, -2]] as const) {
    acc.fire(x, y + 3.1, z, { scale: 0.5, light: false, intensity: 0, distance: 0 });
    acc.cookie(x, y + 0.03, z, 5);
  }
  acc.anchor('trigger:passage-enter', 'trigger', 42, y0, -100, 0, 4);
  acc.mist([{ x: 68, y: y0 + 0.3, z: -100, size: 20, opacity: 0.18 }, { x: 103, y: -1.7, z: -125, size: 18, opacity: 0.2 }], 0x2a2440);
  yield;
  return yield* acc.finish();
}
