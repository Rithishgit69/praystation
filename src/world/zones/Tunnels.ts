import * as THREE from 'three';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Serpent Tunnels (Chapter IV). A stairwell drops from the moon chamber to -14; winding tunnels lead
 * west through a flooded gallery and collapsing corridors to the serpent shrine, whose carved coils
 * ring the room. The sealed chamber it guards opens toward the library.
 */
export function* buildTunnels(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'tunnels');
  const y = -14;
  // Stairwell: from the moon chamber north door (110, -2, -232) down to (110, -14, -256).
  yield* buildRoom(acc, { cx: 110, cz: -246, floorY: y, width: 6, depth: 28, height: 15, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'w', offset: -8, width: 4, height: 4.5 }], ceiling: true, dark: true, floor: true });
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 49, rise: 0.245, run: 0.5, rng: ctx.rng.fork(2) }), 110, y, -256.5, Math.PI); // rises toward +Z up to -2 at z≈-232
  yield;
  // Tunnel west: winding segments.
  yield* buildRoom(acc, { cx: 80, cz: -254, floorY: y, width: 54, depth: 4, height: 4.5, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  // Flooded gallery: lower floor with a water plane and stepping stones.
  yield* buildRoom(acc, { cx: 38, cz: -254, floorY: y - 1.6, width: 30, depth: 14, height: 6, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, pillars: { cols: 3, rows: 2, inset: 5 } });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), ctx.lib.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(38, y - 0.75, -254);
  acc.group.add(water);
  acc.colliders.push({ kind: 'box', center: new THREE.Vector3(38, y - 1.2, -254), half: new THREE.Vector3(15, 0.4, 7), quaternion: new THREE.Quaternion(), surface: 'water' });
  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 1.9, 10), ctx.lib.sandstoneDark);
    setTriplanar(stone.geometry, 2, 0.8);
    stone.position.set(52 - i * 5.2, y - 0.75, -254 + (i % 2 === 0 ? -1.2 : 1.2));
    acc.mesh(stone);
  }
  // Ledges at both ends so the player steps down into the water and back up.
  for (const x of [52.5, 23.5]) acc.place(makeSteps(ctx.lib, { width: 4, count: 3, rise: 0.24, run: 0.5, rng: ctx.rng.fork(3) }), x, y - 1.6 + 0.9, -254, x > 38 ? -Math.PI / 2 : Math.PI / 2);
  yield;
  // Collapsing corridor (timed escape) and the serpent shrine.
  yield* buildRoom(acc, { cx: 0, cz: -254, floorY: y, width: 44, depth: 4, height: 4.5, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  for (let i = 0; i < 5; i++) acc.anchor(`collapse:${i}`, 'trigger', -18 + i * 9, y, -254, 0, 2.5, { order: i });
  yield* buildRoom(acc, { cx: -46, cz: -240, floorY: y, width: 40, depth: 40, height: 12, doors: [{ side: 'e', offset: -14, width: 4, height: 4.5 }, { side: 'n', offset: 0, width: 4.2, height: 5 }], pillars: { cols: 2, rows: 2, inset: 8 }, ceiling: true, dark: true });
  // Serpent coils: a carved band spiralling around the room's walls.
  const coil = new THREE.Mesh(new THREE.TorusGeometry(17.5, 0.9, 10, 48), ctx.lib.sandstone);
  setTriplanar(coil.geometry, 2, 0.85);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-46, y + 5, -240);
  acc.mesh(coil, false);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), ctx.lib.sandstone);
  setTriplanar(head.geometry, 2, 0.85);
  head.scale.set(1.6, 0.9, 1.1);
  head.position.set(-46, y + 5.5, -258);
  acc.mesh(head, false);
  acc.anchor('statue:serpent', 'statue', -46, y + 5, -240, 0, 6, { awake: ctx.flags['serpent:awake'] === true }, coil);
  // Shrine at the centre and the sealed chamber door (north, to the evidence room).
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.2, 16), ctx.lib.sandstoneDark);
  setTriplanar(altar.geometry, 2, 0.8);
  altar.position.set(-46, y + 0.6, -240);
  acc.mesh(altar);
  acc.anchor('mechanism:serpent-shrine', 'mechanism', -46, y + 1.4, -240, 0, 3.2, {}, altar);
  const sealed = ctx.flags['door:serpent-chamber'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 5, 0.6), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(-46, y + 2.5 + (sealed ? 0 : 5.1), -261.2);
  acc.mesh(slab, sealed);
  acc.anchor('door:serpent-chamber', 'door', -46, y, -261, 0, 3, { opened: !sealed }, slab);
  // Evidence chamber beyond, with the stair up to the library (west).
  yield* buildRoom(acc, { cx: -46, cz: -272, floorY: y, width: 16, depth: 14, height: 6, doors: [{ side: 's', offset: 0, width: 4.2, height: 5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true });
  acc.anchor('lore:temple-purpose', 'lore', -46, y + 1.2, -278, 0, 3, { text: 'temple-purpose' });
  yield* buildRoom(acc, { cx: -80, cz: -272, floorY: y, width: 50, depth: 4, height: 4.5, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  // Stair up to the library level (-10) heading north into the library's south door at (-110, -160).
  yield* buildRoom(acc, { cx: -110, cz: -230, floorY: y, width: 6, depth: 84, height: 8, doors: [{ side: 'e', offset: 42 - 2, width: 4, height: 4.5 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, floor: true });
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 17, rise: 0.235, run: 0.5, rng: ctx.rng.fork(5) }), -110, y, -230 + 4.3);
  // Torches only near the stairwell; deeper tunnels use cookies and dripping ambience anchors.
  for (const [x, z] of [[110, -236], [110, -252], [60, -256], [24, -256], [-10, -256]] as const) {
    acc.fire(x, y + 3.0, z, { scale: 0.45, light: false, intensity: 0, distance: 0 });
    acc.cookie(x, y + 0.03, z, 4.5);
  }
  for (let i = 0; i < 4; i++) acc.anchor(`drip:${i}`, 'trigger', -30 + i * 20, y + 3, -254, 0, 1, { audio: 'drip' });
  acc.mist([{ x: 38, y: y - 0.6, z: -254, size: 30, opacity: 0.18 }, { x: -46, y: y + 0.3, z: -240, size: 36, opacity: 0.16 }], 0x1a2a3a);
  acc.anchor('trigger:tunnels-enter', 'trigger', 110, y, -250, 0, 4);
  acc.anchor('shrine:tunnels', 'shrine', -20, y + 1.2, -238, 0, 2.4, { lit: ctx.flags['shrine:tunnels'] === true });
  yield;
  return yield* acc.finish();
}
