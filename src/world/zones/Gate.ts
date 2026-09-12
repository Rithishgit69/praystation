import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBrazierPlinth } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, setTriplanar } from './UnitKit';

/** Temple Gate: outer wall with a stepped gopuram-style tower over the passage; the first landmark. */
export function* buildGate(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'gate');
  const wallZ = 68;
  // Outer wall left and right of the 5 m passage.
  acc.wall(-40, wallZ, -2.5, wallZ, -0.4, 6.5, 1.6);
  acc.wall(2.5, wallZ, 40, wallZ, -0.4, 6.5, 1.6);
  yield;
  // Gopuram: stepped tiers with a barrel-vault crown; open passage through the base.
  const tiers = 6;
  let w = 13;
  let d = 7;
  let y = 6.5;
  for (let i = 0; i < tiers; i++) {
    const h = i === 0 ? 2.4 : 2.0;
    const g = new RoundedBoxGeometry(w, h, d, 2, 0.06);
    setTriplanar(g, 2.2, 1 - i * 0.05);
    const m = new THREE.Mesh(g, ctx.lib.sandstone);
    m.position.set(0, y + h / 2, wallZ);
    acc.mesh(m);
    // Small pavilion niches along each tier.
    const niches = Math.max(2, Math.floor(w / 2.2));
    for (let n = 0; n < niches; n++) {
      const nx = -w / 2 + 1.1 + (n * (w - 2.2)) / Math.max(1, niches - 1);
      const ng = new RoundedBoxGeometry(0.9, h * 0.8, 0.5, 2, 0.05);
      setTriplanar(ng, 1.2, 0.85);
      for (const side of [-1, 1]) {
        const niche = new THREE.Mesh(ng, ctx.lib.sandstoneDark);
        niche.position.set(nx, y + h / 2, wallZ + side * (d / 2 + 0.2));
        acc.mesh(niche, false);
      }
    }
    y += h;
    w -= 1.7;
    d -= 0.8;
  }
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4.5, 12, 1, false, 0, Math.PI), ctx.lib.sandstone);
  setTriplanar(crown.geometry, 1.5, 0.95);
  crown.rotation.z = Math.PI / 2;
  crown.position.set(0, y + 0.4, wallZ);
  acc.mesh(crown, false);
  yield;
  // Passage jambs and flanking pillars.
  for (const side of [-1, 1]) {
    acc.pillar(side * 3.4, -0.4, wallZ + 3.2, 6.0);
    acc.pillar(side * 3.4, -0.4, wallZ - 3.2, 6.0);
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 6.5, 1.8), ctx.lib.sandstoneDark);
    setTriplanar(jamb.geometry, 2, 0.8);
    jamb.position.set(side * 3.0, -0.4 + 3.25, wallZ);
    acc.mesh(jamb);
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(5 + side), tiers: 2 });
    acc.place(b, side * 6.5, -0.4, wallZ + 6.5);
    acc.fire(side * 6.5, -0.4 + b.fireHeight, wallZ + 6.5, { intensity: 34, distance: 12 });
  }
  acc.ivyBox(-21, wallZ, 38, 4.5, 1.6, 0, 0.5);
  acc.ivyBox(21, wallZ, 38, 4.5, 1.6, 0, 0.5);
  // Path paving through the gate.
  const paving = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 30, 3, 1, 10), ctx.lib.flagstone);
  setTriplanar(paving.geometry, 5.6, 0.75);
  paving.position.set(0, -0.5, wallZ);
  acc.mesh(paving);
  acc.anchor('shrine:gate', 'shrine', 6.5, -0.4 + 1.0, wallZ + 6.5, 0, 2.4, { lit: ctx.flags['shrine:gate'] === true });
  acc.anchor('trigger:gate-enter', 'trigger', 0, 0, wallZ, 0, 4);
  acc.mist([{ x: -18, y: 0.3, z: wallZ + 12, size: 26, opacity: 0.14 }, { x: 18, y: 0.3, z: wallZ + 12, size: 26, opacity: 0.14 }]);
  yield;
  return yield* acc.finish();
}
