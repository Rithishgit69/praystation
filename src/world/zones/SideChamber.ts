import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { UnitBuild, ZoneBuildContext, ZoneId } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/** Optional lore chambers off the courtyard's side walls: a small vaulted room with an inscription. */
export function* buildSideChamber(ctx: ZoneBuildContext, id: ZoneId): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, id);
  const east = id === 'side-east';
  const cx = east ? 56 : -56;
  const cz = -16;
  yield* buildRoom(acc, { cx, cz, floorY: 0, width: 16, depth: 18, height: 6, doors: [{ side: east ? 'w' : 'e', offset: 0, width: 3.2, height: 3.6 }], ceiling: true, roofHoles: [{ x: east ? 3 : -3, z: -3, w: 4, d: 4 }], dark: true });
  // Inscription plinth and a pair of diyas.
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.1, 0.9, 2, 0.04), ctx.lib.sandstone);
  setTriplanar(plinth.geometry, 2, 0.9);
  plinth.position.set(cx, 0.55, cz - 6);
  acc.mesh(plinth);
  const tablet = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.2, 0.2, 2, 0.03), ctx.lib.sandstoneDark);
  setTriplanar(tablet.geometry, 1.5, 0.8);
  tablet.position.set(cx, 1.7, cz - 6.3);
  acc.mesh(tablet, false);
  acc.anchor(`lore:${id}`, 'lore', cx, 1.4, cz - 5.2, Math.PI, 2.2, { text: id });
  for (const s of [-1, 1]) acc.fire(cx + s * 1.4, 1.15, cz - 6, { scale: 0.35, intensity: 8, distance: 6 });
  acc.mist([{ x: cx, y: 0.3, z: cz, size: 12, opacity: 0.12 }], 0x2f4b7a);
  yield;
  return yield* acc.finish();
}
