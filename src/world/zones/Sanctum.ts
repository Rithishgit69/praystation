import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSteps } from '../props/Stone';
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
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 90, depth: 74, height: 24, doors: [{ side: 's', offset: 0, width: 5, height: 7 }], pillars: { cols: 5, rows: 4, inset: 9 }, ceiling: true, roofHoles: [{ x: 0, z: -6, w: 20, d: 20 }] });
  yield;
  // Dais.
  acc.place(makeSteps(ctx.lib, { width: 24, count: 7, rise: 0.24, run: 0.55, rng: ctx.rng.fork(3) }), cx, y, cz - 4);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(30, 1.68, 20), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.85);
  dais.position.set(cx, y + 0.84, cz - 18);
  acc.mesh(dais);
  // The statue: seated body, head with broad ears and a gently curved trunk, one intact tusk, a raised
  // right palm (abhaya) and a modak in the left. Proportions are calm and monumental.
  const statue = new THREE.Group();
  const stone = ctx.lib.sandstone;
  const add = (geo: THREE.BufferGeometry, x: number, yy: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): THREE.Mesh => {
    setTriplanar(geo, 2.4, 1.0);
    const m = new THREE.Mesh(geo, stone);
    m.position.set(x, yy, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    statue.add(m);
    return m;
  };
  const base = y + 1.68;
  add(new RoundedBoxGeometry(9, 1.2, 7, 2, 0.15), 0, base + 0.6, 0); // seat (lotus base)
  add(new THREE.SphereGeometry(3.2, 20, 14), 0, base + 3.9, 0, 1.25, 1.0, 1.0); // torso
  add(new THREE.CylinderGeometry(3.6, 4.2, 2.6, 20), 0, base + 2.3, 0.4); // crossed legs mass
  add(new THREE.SphereGeometry(1.9, 20, 14), 0, base + 7.6, 0.2, 1.05, 1.0, 1.0); // head
  add(new THREE.SphereGeometry(1.4, 16, 10), -2.4, base + 7.4, 0.0, 0.35, 1.0, 1.0); // left ear
  add(new THREE.SphereGeometry(1.4, 16, 10), 2.4, base + 7.4, 0.0, 0.35, 1.0, 1.0); // right ear
  const trunk = add(new THREE.CylinderGeometry(0.35, 0.6, 3.4, 12), 0.3, base + 5.6, 1.9, 1, 1, 1, 0.35, 0, -0.35); // trunk curving
  trunk.geometry.translate(0, 0, 0);
  add(new THREE.ConeGeometry(0.28, 1.6, 10), -0.9, base + 6.4, 1.6, 1, 1, 1, 1.2, 0, 0.5); // the single tusk (left side intact)
  add(new THREE.CylinderGeometry(0.55, 0.65, 3.2, 12), -3.9, base + 5.0, 0.6, 1, 1, 1, 0.3, 0, 0.5); // left arm lowered, holding
  add(new THREE.SphereGeometry(0.7, 12, 10), -4.4, base + 3.5, 1.5); // modak
  add(new THREE.CylinderGeometry(0.55, 0.65, 3.0, 12), 3.9, base + 5.8, 0.8, 1, 1, 1, -0.6, 0, -0.35); // right arm raised in abhaya
  add(new RoundedBoxGeometry(1.1, 1.3, 0.4, 2, 0.1), 4.6, base + 7.4, 1.6, 1, 1, 1, -0.2, 0, 0); // raised palm
  add(new THREE.TorusGeometry(2.1, 0.22, 8, 24), 0, base + 8.9, -0.2, 1, 1, 1, 0.3); // crown ring / halo
  statue.position.set(cx, 0, cz - 18);
  acc.group.add(statue);
  acc.colliders.push({ kind: 'box', center: new THREE.Vector3(cx, base + 4.5, cz - 18), half: new THREE.Vector3(5, 4.5, 3.8), quaternion: new THREE.Quaternion(), surface: 'dry-stone' });
  acc.anchor('statue:ganesha-sanctum', 'statue', cx, base + 1.5, cz - 12, Math.PI, 6, { chapter: 'finale' }, statue);
  yield;
  // Ring of braziers and the hidden-symbol floor inlay.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    acc.fire(cx + Math.cos(a) * 26, y + 1.35, cz + Math.sin(a) * 22, { scale: 0.8, intensity: 26, distance: 12 });
  }
  const inlay = new THREE.Mesh(new THREE.RingGeometry(5, 7, 32), new THREE.MeshStandardMaterial({ color: 0xd9b370, emissive: 0x6b4c1c, emissiveIntensity: ctx.flags['sanctum:restored'] === true ? 1.6 : 0.15, roughness: 0.4, metalness: 0.6 }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(cx, y + 0.02, cz + 8);
  acc.group.add(inlay);
  acc.disposables.push(() => (inlay.material as THREE.Material).dispose());
  acc.anchor('mechanism:sanctum-seal', 'mechanism', cx, y + 0.5, cz + 8, 0, 4, {}, inlay);
  acc.anchor('encounter:finale', 'trigger', cx, y, cz - 2, 0, 12, { chapter: 'finale' });
  acc.mist([{ x: cx, y: y + 0.5, z: cz, size: 60, opacity: 0.12 }], 0x3f5f8f);
  acc.anchor('trigger:sanctum-enter', 'trigger', cx, y, cz + 34, 0, 6);
  yield;
  return yield* acc.finish();
}
