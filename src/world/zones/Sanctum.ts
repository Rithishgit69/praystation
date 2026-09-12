import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSteps } from '../props/Stone';
import { buildGaneshaStatue } from '../props/Statue';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Sealed Sanctum (Finale). The deepest chamber: a vast hall with a great roof opening, and on a
 * stepped dais the untouched statue — built as a dignified, stylised seated form, never a caricature.
 */
export function* buildSanctum(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'sanctum');
  const y = -26;
  const cx = 0;
  const cz = -404;
  // Stair down from the shrine door (0, -20, -338) to the sanctum floor.
  yield* buildRoom(acc, { cx, cz: -352, floorY: y, width: 6, depth: 28, height: 12, doors: [{ side: 's', offset: 0, width: 4.2, height: 5 }, { side: 'n', offset: 0, width: 5, height: 7 }], ceiling: true, dark: true });
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 25, rise: 0.24, run: 0.5, rng: ctx.rng.fork(2) }), cx, y, -352 - 14 + 0.5 + 13.5, Math.PI);
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 90, depth: 74, height: 24, doors: [{ side: 's', offset: 0, width: 5, height: 7 }], pillars: { cols: 4, rows: 4, inset: 9 }, ceiling: true, roofHoles: [{ x: 0, z: -6, w: 20, d: 20 }] });
  yield;
  // Dais.
  acc.place(makeSteps(ctx.lib, { width: 24, count: 7, rise: 0.24, run: 0.55, rng: ctx.rng.fork(3) }), cx, y, cz - 4);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(30, 1.68, 20), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.85);
  dais.position.set(cx, y + 0.84, cz - 18);
  acc.mesh(dais);
  // The statue (see props/Statue.ts): monumental, intact, respectful.
  const built = buildGaneshaStatue(ctx.lib);
  const statue = built.group;
  statue.position.set(cx, y + 1.68, cz - 18);
  acc.group.add(statue);
  acc.colliders.push({ kind: 'cylinder', center: new THREE.Vector3(cx, y + 1.68 + 6, cz - 18), halfHeight: 6, radius: 5.8, surface: 'dry-stone' });
  const base = y + 1.68;
  acc.anchor('statue:ganesha-sanctum', 'statue', cx, base + 1.5, cz - 12, Math.PI, 6, { chapter: 'finale' }, statue);
  yield;
  // Ring of braziers and the hidden-symbol floor inlay.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    acc.brazier(cx + Math.cos(a) * 26, y, cz + Math.sin(a) * 22, { scale: 0.9, intensity: 26, distance: 12 });
    if (i % 2 === 1) yield;
  }
  const inlay = new THREE.Mesh(new THREE.RingGeometry(5, 7, 32), new THREE.MeshStandardMaterial({ color: 0xd9b370, emissive: 0x6b4c1c, emissiveIntensity: ctx.flags['sanctum:restored'] === true ? 1.6 : 0.15, roughness: 0.4, metalness: 0.6 }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(cx, y + 0.02, cz + 8);
  acc.group.add(inlay);
  acc.disposables.push(() => (inlay.material as THREE.Material).dispose());
  acc.anchor('mechanism:sanctum-seal', 'mechanism', cx, y + 0.5, cz + 8, 0, 4, {}, inlay);
  const glyphs = ['tusk', 'circle', 'moon', 'serpent', 'scroll', 'broken-circle'] as const;
  const symGeo = new RoundedBoxGeometry(1.0, 0.5, 1.0, 2, 0.04);
  setTriplanar(symGeo, 1.2, 0.95);
  glyphs.forEach((g, i) => {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 9.5;
    const sz = cz + 8 + Math.sin(a) * 9.5;
    const stone = new THREE.Mesh(symGeo, ctx.lib.sandstone);
    stone.position.set(sx, y + 0.25, sz);
    acc.mesh(stone, false);
    acc.glyph(g, sx, y + 0.51, sz, new THREE.Vector3(0, 1, 0), 0.7, 0xffd98a, 0.8);
    acc.anchor(`symbol:sanctum:${i}`, 'mechanism', sx, y + 0.5, sz, 0, 2, { index: i }, stone);
  });
  acc.anchor('encounter:finale', 'trigger', cx, y, cz - 2, 0, 12, { chapter: 'finale' });
  acc.mist([{ x: cx, y: y + 0.5, z: cz, size: 60, opacity: 0.12 }], 0x3f5f8f);
  acc.anchor('trigger:sanctum-enter', 'trigger', cx, y, cz + 34, 0, 6);
  yield;
  return yield* acc.finish();
}
