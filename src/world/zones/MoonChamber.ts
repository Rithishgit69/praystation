import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Moon Chamber (Chapter III). An open-roofed court sunk into the plateau with four rotating mirror
 * stands, a central lens dais and a roof-mechanism wheel; the north door leads down to the tunnels.
 */
export function* buildMoonChamber(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'moon');
  const cx = 110;
  const cz = -190;
  const y = -2;
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 84, depth: 84, height: 9, doors: [{ side: 's', offset: -7, width: 4.2, height: 4.6 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], pillars: { cols: 4, rows: 4, inset: 10 }, ceiling: false });
  // Central dais with the lens.
  acc.place(makeSteps(ctx.lib, { width: 12, count: 3, rise: 0.24, run: 0.5, rng: ctx.rng.fork(3) }), cx, y, cz + 6);
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.72, 24), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.8);
  dais.position.set(cx, y + 0.36, cz);
  acc.mesh(dais);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.4, 24), ctx.lib.iron);
  lens.position.set(cx, y + 0.92, cz);
  acc.mesh(lens);
  acc.anchor('mechanism:moon-lens', 'mechanism', cx, y + 1.2, cz, 0, 3, {}, lens);
  yield;
  // Four mirror stands on rotating pedestals.
  const mirrorGeo = new RoundedBoxGeometry(2.4, 3.0, 0.25, 2, 0.05);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const mx = cx + Math.cos(a) * 20;
    const mz = cz + Math.sin(a) * 20;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.0, 16), ctx.lib.sandstone);
    setTriplanar(ped.geometry, 2, 0.9);
    ped.position.set(mx, y + 0.5, mz);
    acc.mesh(ped);
    const pivot = new THREE.Group();
    pivot.position.set(mx, y + 1.0, mz);
    pivot.rotation.y = typeof ctx.flags[`mirror:${i}`] === 'number' ? (ctx.flags[`mirror:${i}`] as number) : a + Math.PI;
    const mirror = new THREE.Mesh(mirrorGeo, ctx.lib.iron);
    mirror.position.y = 1.6;
    mirror.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.7), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, roughness: 0.05, metalness: 1.0 }));
    face.position.set(0, 1.6, 0.14);
    pivot.add(mirror, face);
    acc.group.add(pivot);
    acc.disposables.push(() => face.material.dispose());
    acc.colliders.push({ kind: 'cylinder', center: new THREE.Vector3(mx, y + 2.0, mz), halfHeight: 1.6, radius: 1.3, surface: 'dry-stone' });
    acc.anchor(`mechanism:mirror-${i}`, 'mechanism', mx, y + 1.4, mz, a, 3, { index: i }, pivot);
  }
  // Roof mechanism wheel on the east wall and the sealed north door.
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.16, 8, 20), ctx.lib.iron);
  wheel.position.set(cx + 40, y + 1.6, cz + 12);
  wheel.rotation.y = Math.PI / 2;
  acc.mesh(wheel, false);
  acc.anchor('mechanism:moon-roof', 'mechanism', cx + 39, y + 1.4, cz + 12, -Math.PI / 2, 2.6, {}, wheel);
  const sealed = ctx.flags['door:moon-tunnels'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.6, 0.6), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx, y + 2.3 + (sealed ? 0 : 4.7), cz - 42 - 0.6);
  acc.mesh(slab, sealed);
  acc.anchor('door:moon-tunnels', 'door', cx, y, cz - 42, 0, 3, { opened: !sealed }, slab);
  // Hidden moon-symbols on the walls (revealed in the moonlit state), braziers, mist, rubble.
  for (let i = 0; i < 6; i++) acc.anchor(`symbol:moon-${i}`, 'lore', cx - 41 + (i % 3) * 41, y + 2.2, cz - 30 + Math.floor(i / 3) * 60, i % 3 === 0 ? Math.PI / 2 : i % 3 === 2 ? -Math.PI / 2 : 0, 2.5, { hidden: true });
  for (const [dx, dz] of [[-30, -30], [30, -30], [-30, 30], [30, 30]] as const) acc.fire(cx + dx, y + 1.35, cz + dz, { scale: 0.7, intensity: 22, distance: 10 });
  acc.blockStack(cx - 34, y, cz + 20, 6, 3, 1.2, 0.3);
  acc.pillar(cx + 34, y, cz - 20, 8, 4.2);
  acc.mist([{ x: cx, y: y + 0.5, z: cz, size: 40, opacity: 0.12 }, { x: cx - 25, y: y + 0.4, z: cz + 25, size: 24, opacity: 0.14 }], 0x4a6a9c);
  acc.anchor('trigger:moon-enter', 'trigger', cx - 7, y, cz + 38, 0, 5);
  acc.anchor('shrine:moon', 'shrine', cx + 30, y + 1.35, cz + 30, 0, 2.4, { lit: ctx.flags['shrine:moon'] === true });
  yield;
  return yield* acc.finish();
}
