import * as THREE from 'three';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Underground Shrine (Chapter VI). A long descending corridor from the library reaches a deep,
 * high-ceilinged shrine with a single moon shaft over the corrupted altar where the confrontation happens.
 */
export function* buildShrine(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'shrine');
  const y = -20;
  // Corridor from the library east door (-72, -10, -88) descending south to the shrine: stair room then corridor.
  yield* buildRoom(acc, { cx: -58, cz: -88, floorY: -10, width: 24, depth: 5, height: 5, doors: [{ side: 'w', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true });
  yield* buildRoom(acc, { cx: -44, cz: -114, floorY: y, width: 6, depth: 56, height: 14, doors: [{ side: 'n', offset: 0, width: 4.2, height: 4.6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true });
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 41, rise: 0.244, run: 0.5, rng: ctx.rng.fork(2) }), -44, y, -114 - 28 + 0.5 + 20.5, Math.PI); // rises toward +Z from -20 up to -10 at the north door
  yield* buildRoom(acc, { cx: -44, cz: -200, floorY: y, width: 5, depth: 116, height: 5, doors: [{ side: 'n', offset: 0, width: 4.2, height: 4.6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield* buildRoom(acc, { cx: -22, cz: -260, floorY: y, width: 48, depth: 5, height: 5, doors: [{ side: 'w', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield;
  // The shrine hall.
  const cx = 0;
  const cz = -308;
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 60, depth: 60, height: 14, doors: [{ side: 'n', offset: 0, width: 4.2, height: 5 }, { side: 'w', offset: 0, width: 4.2, height: 4.6 }], pillars: { cols: 3, rows: 3, inset: 9 }, ceiling: true, dark: true, roofHoles: [{ x: 0, z: 0, w: 6, d: 6 }] });
  // Note: the west door of the shrine hall connects to the corridor above via (−30, −308) → corridor at (−22,−260)? The
  // corridor's east end turns south to the hall's north door; the west door is a collapsed dead end (rubble).
  acc.blockStack(-31.5, y, cz, 4.2, 5, 1.2, Math.PI / 2);
  acc.place(makeSteps(ctx.lib, { width: 10, count: 4, rise: 0.24, run: 0.5, rng: ctx.rng.fork(6) }), cx, y, cz + 7);
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.96, 24), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, y + 0.48, cz);
  acc.mesh(dais);
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 1.4, 16), ctx.lib.sandstoneDark);
  setTriplanar(altar.geometry, 2, 0.7);
  altar.position.set(cx, y + 0.96 + 0.7, cz);
  acc.mesh(altar);
  acc.anchor('encounter:corruption', 'trigger', cx, y + 0.96, cz, 0, 8, { chapter: 'ch6' }, altar);
  // Three memory seals around the dais; each bears the remembrance mark the corruption tried to erase.
  const sealGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.5, 12);
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * (Math.PI * 2) / 3;
    const sx = cx + Math.cos(a) * 12;
    const sz = cz + Math.sin(a) * 12;
    const seal = new THREE.Mesh(sealGeo, ctx.lib.sandstone);
    setTriplanar(seal.geometry, 2, 0.9);
    seal.position.set(sx, y + 0.25, sz);
    acc.mesh(seal, false);
    const lit = ctx.flags[`seal:${i}`] === true;
    acc.glyph('broken-circle', sx, y + 0.51, sz, new THREE.Vector3(0, 1, 0), 1.1, lit ? 0xffd98a : 0x6a4a8a, lit ? 0.9 : 0.35);
    acc.anchor(`seal:${i}`, 'mechanism', sx, y + 0.6, sz, 0, 2.4, { index: i, lit }, seal);
  }
  // Corrupted brazier: dark flames until cleansed.
  const cleansed = ctx.flags['shrine:cleansed'] === true;
  acc.fire(cx, y + 0.96 + 1.5, cz, { scale: cleansed ? 1 : 1.3, intensity: cleansed ? 40 : 18, distance: 14 });
  for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]] as const) acc.brazier(cx + dx, y, cz + dz, { scale: 0.8, intensity: 22, distance: 10 });
  // Sealed sanctum door (north).
  const sealed = ctx.flags['door:shrine-sanctum'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5, 0.6), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx, y + 2.5 + (sealed ? 0 : 5.1), cz - 30 - 0.6);
  acc.mesh(slab, sealed);
  acc.anchor('door:shrine-sanctum', 'door', cx, y, cz - 30, 0, 3, { opened: !sealed }, slab);
  acc.mist([{ x: cx, y: y + 0.4, z: cz, size: 44, opacity: 0.16 }], cleansed ? 0x3f5f8f : 0x2a1830);
  acc.anchor('trigger:shrine-enter', 'trigger', cx, y, cz + 27, 0, 5);
  acc.anchor('shrine:deep', 'shrine', cx - 22, y + 1.35, cz + 22, 0, 2.4, { lit: ctx.flags['shrine:deep'] === true });
  yield;
  return yield* acc.finish();
}
