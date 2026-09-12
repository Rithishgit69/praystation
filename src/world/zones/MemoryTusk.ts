import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, setTriplanar } from './UnitKit';

/**
 * The Broken Tusk memory: a mountain gateway above the clouds. A stone gate of two great pillars and a
 * lintel stands at the head of a stair; the arena is the terrace before it. Gold light, warm haze.
 * Sits far outside the terrain so no forest cells stream under it.
 */
export function* buildMemoryTusk(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'memory-tusk');
  const cx = 2000;
  const cz = 0;
  // Terrace slab and a broken rim of rocks; beyond the rim, cloud (mist) and nothing.
  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(34, 36, 3, 40), ctx.lib.flagstone);
  setTriplanar(terrace.geometry, 5.6, 0.95);
  terrace.position.set(cx, -1.5, cz);
  acc.mesh(terrace);
  acc.colliders.pop();
  acc.colliders.push({ kind: 'cylinder', center: new THREE.Vector3(cx, -1.5, cz), halfHeight: 1.5, radius: 34, surface: 'dry-stone' });
  const rockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.2);
  setTriplanar(rockGeo, 1.6, 0.85);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 33 + ctx.rng.range(-1, 2);
    const s = ctx.rng.range(1.5, 4);
    const rock = new THREE.Mesh(rockGeo, ctx.lib.sandstone);
    rock.position.set(cx + Math.cos(a) * r, ctx.rng.range(-0.5, 1.2), cz + Math.sin(a) * r);
    rock.scale.set(s * ctx.rng.range(0.8, 1.6), s * ctx.rng.range(0.6, 1.4), s);
    rock.rotation.set(ctx.rng.range(-0.3, 0.3), a, ctx.rng.range(-0.3, 0.3));
    acc.mesh(rock);
  }
  yield;
  // The gateway at the north: stair, two pillars, lintel, and the mountain wall behind.
  acc.place(makeSteps(ctx.lib, { width: 14, count: 8, rise: 0.25, run: 0.5, rng: ctx.rng.fork(2) }), cx, 0, cz - 18);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 12), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.95);
  dais.position.set(cx, 1, cz - 28);
  acc.mesh(dais);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(3.2, 16, 3.2, 2, 0.1), ctx.lib.sandstone);
    setTriplanar(pillar.geometry, 2.6, 1.0);
    pillar.position.set(cx + side * 6.5, 2 + 8, cz - 30);
    acc.mesh(pillar);
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(18, 2.6, 3.6, 2, 0.1), ctx.lib.sandstone);
  setTriplanar(lintel.geometry, 2.6, 1.0);
  lintel.position.set(cx, 2 + 16 + 1.3, cz - 30);
  acc.mesh(lintel);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 40, 6, 8, 6, 1), ctx.lib.sandstoneDark);
  setTriplanar(wall.geometry, 4, 0.75);
  wall.position.set(cx, 18, cz - 38);
  acc.mesh(wall);
  yield;
  // Gold braziers and the memory light.
  for (const [dx, dz] of [[-12, -8], [12, -8], [-20, 10], [20, 10]] as const) acc.fire(cx + dx, 1.35, cz + dz, { scale: 0.9, intensity: 30, distance: 14 });
  acc.mist([{ x: cx, y: 0.6, z: cz + 20, size: 70, opacity: 0.22 }, { x: cx - 30, y: 2, z: cz, size: 60, opacity: 0.2 }, { x: cx + 30, y: 2, z: cz, size: 60, opacity: 0.2 }], 0xc79a52);
  acc.anchor('memory:tusk-gate', 'trigger', cx, 2, cz - 30, 0, 6);
  acc.anchor('memory:tusk-arena', 'trigger', cx, 0, cz, 0, 30);
  yield;
  return yield* acc.finish();
}
