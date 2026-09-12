import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Corrupted Passage (Chapter II). A descending corridor with mirrored "false" side rooms; the
 * distortion spawns copies of rooms and objects, which the light mechanic later exposes.
 */
export function* buildPassage(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'passage');
  const y0 = 1.92;
  // Segment A: east from the hall door (x 44..92, z -100), floor 1.92.
  yield* buildRoom(acc, { cx: 68, cz: -100, floorY: y0, width: 46, depth: 5, height: 5, doors: [{ side: 'w', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 8, width: 3.2, height: 3.8 }, { side: 's', offset: -8, width: 3.2, height: 3.8 }], ceiling: true, dark: true, wallThickness: 1.4 });
  // Twin side rooms: the true room (north) and its false copy (south), mirrored.
  yield* buildRoom(acc, { cx: 76, cz: -112, floorY: y0, width: 10, depth: 12, height: 5, doors: [{ side: 's', offset: 0, width: 3.2, height: 3.8 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: 60, cz: -88, floorY: y0, width: 10, depth: 12, height: 5, doors: [{ side: 'n', offset: 0, width: 3.2, height: 3.8 }], ceiling: true, dark: true });
  for (const [x, z, id] of [[76, -114, 'true'], [60, -86, 'false']] as const) {
    const altar = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.0, 1.0, 2, 0.04), ctx.lib.sandstone);
    setTriplanar(altar.geometry, 2, 0.85);
    altar.position.set(x, y0 + 0.5, z);
    acc.mesh(altar);
    acc.anchor(`object:passage-altar-${id}`, 'mechanism', x, y0 + 1.0, z, 0, 2.2, { real: id === 'true' });
    acc.fire(x, y0 + 1.1, z, { scale: 0.4, intensity: 10, distance: 7 });
  }
  yield;
  // Segment B: descending stair south-east to floor -2, then corridor to the moon chamber door.
  acc.place(makeSteps(ctx.lib, { width: 4.4, count: 16, rise: 0.245, run: 0.5, rng: ctx.rng.fork(8) }), 96, -2, -100 + 8, Math.PI); // rises toward +Z: from y=-2 at z=-92 up to 1.92 at z=-100
  yield* buildRoom(acc, { cx: 96, cz: -96, floorY: -2, width: 5, depth: 16, height: 8, doors: [{ side: 'n', offset: 0, width: 4.2, height: 6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, floor: false });
  yield* buildRoom(acc, { cx: 96, cz: -120, floorY: -2, width: 5, depth: 32, height: 5, doors: [{ side: 'n', offset: 0, width: 4.2, height: 4.6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 6, width: 3, height: 3.6 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: 106, cz: -114, floorY: -2, width: 12, depth: 10, height: 5, doors: [{ side: 'w', offset: 0, width: 3, height: 3.6 }], ceiling: true, dark: true });
  // Final leg to the moon chamber (door at z -140, x 110).
  yield* buildRoom(acc, { cx: 103, cz: -138, floorY: -2, width: 20, depth: 5, height: 5, doors: [{ side: 'w', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 7, width: 4.2, height: 4.6 }], ceiling: true, dark: true });
  const sealed = ctx.flags['door:passage-moon'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.6), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(110, -2 + 2.3 + (sealed ? 0 : 4.7), -141.2);
  acc.mesh(slab, sealed);
  acc.anchor('door:passage-moon', 'door', 110, -2, -141, 0, 3, { opened: !sealed }, slab);
  // Torches and cookies along the way.
  for (const [x, z, y] of [[52, -101.5, y0], [84, -101.5, y0], [96, -110, -2], [96, -128, -2], [100, -139.5, -2]] as const) {
    acc.fire(x, y + 3.1, z, { scale: 0.5, light: false, intensity: 0, distance: 0 });
    acc.cookie(x, y + 0.03, z, 5);
  }
  acc.anchor('trigger:passage-enter', 'trigger', 50, y0, -100, 0, 4);
  acc.mist([{ x: 68, y: y0 + 0.3, z: -100, size: 20, opacity: 0.18 }, { x: 96, y: -1.7, z: -120, size: 18, opacity: 0.2 }], 0x2a2440);
  yield;
  return yield* acc.finish();
}
