import * as THREE from 'three';
import { makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Serpent Tunnels (Chapter IV). Stairwell down from the moon chamber (y −2 → −14), a tunnel west through
 * a flooded gallery to the serpent shrine, whose carved coils ring the room. Waking the shrine opens the
 * north door onto the chase route: a collapsing corridor, a water passage and a climb to the guarded
 * evidence chamber, from which a long stair and gallery rise to the library's south door.
 */
export function* buildTunnels(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'tunnels');
  const y = -14;
  // Stairwell: from the moon chamber north door (110, -2, -232) down to (110, -14, -256).
  yield* buildRoom(acc, { cx: 110, cz: -246, floorY: y, width: 6, depth: 28, height: 15, doors: [{ side: 's', offset: 0, width: 4.2, height: 15 }, { side: 'w', offset: -8, width: 4, height: 4.5 }], ceiling: true, dark: true, floor: true });
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 49, rise: 0.245, run: 0.5, rng: ctx.rng.fork(2) }), 110, y, -256.5, Math.PI);
  yield;
  // Tunnel west, then the flooded gallery with stepping stones.
  yield* buildRoom(acc, { cx: 80, cz: -254, floorY: y, width: 54, depth: 4, height: 4.5, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
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
  for (const x of [52.5, 23.5]) acc.place(makeSteps(ctx.lib, { width: 4, count: 3, rise: 0.24, run: 0.5, rng: ctx.rng.fork(3) }), x, y - 1.6 + 0.9, -254, x > 38 ? -Math.PI / 2 : Math.PI / 2);
  acc.anchor('trigger:water-gallery', 'trigger', 38, y - 1.6, -254, 0, 12, { audio: 'water' });
  yield;
  // Corridor to the serpent shrine and the shrine itself (coils, head, altar).
  yield* buildRoom(acc, { cx: 0, cz: -254, floorY: y, width: 44, depth: 4, height: 4.5, doors: [{ side: 'e', offset: 0, width: 4, height: 4.5 }, { side: 'w', offset: 0, width: 4, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield* buildRoom(acc, { cx: -46, cz: -240, floorY: y, width: 40, depth: 40, height: 12, doors: [{ side: 'e', offset: -14, width: 4, height: 4.5 }, { side: 'n', offset: 0, width: 4.2, height: 5 }], pillars: { cols: 2, rows: 2, inset: 8 }, ceiling: true, dark: true });
  const coil = new THREE.Mesh(new THREE.TorusGeometry(17.5, 0.9, 10, 48), ctx.lib.sandstone);
  setTriplanar(coil.geometry, 2, 0.85);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-46, y + 5, -240);
  acc.mesh(coil, false);
  const coil2 = new THREE.Mesh(new THREE.TorusGeometry(15.5, 0.7, 10, 48), ctx.lib.sandstone);
  setTriplanar(coil2.geometry, 2, 0.8);
  coil2.rotation.x = Math.PI / 2;
  coil2.position.set(-46, y + 8, -240);
  acc.mesh(coil2, false);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), ctx.lib.sandstone);
  setTriplanar(head.geometry, 2, 0.85);
  head.scale.set(1.6, 0.9, 1.1);
  head.position.set(-46, y + 5.5, -258);
  acc.mesh(head, false);
  const serpentGroup = new THREE.Group();
  serpentGroup.add(coil, coil2, head);
  acc.group.add(serpentGroup);
  acc.anchor('statue:serpent', 'statue', -46, y + 5, -240, 0, 6, { awake: ctx.flags['serpent:awake'] === true }, serpentGroup);
  for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]] as const) acc.brazier(-46 + dx, y, -240 + dz, { scale: 0.8, intensity: 24, distance: 12 });
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
  yield;
  acc.mark('tunnels:chase');
  // Chase route (all at floor −14): corridor A north (collapsing), corridor B west (a wading passage),
  // corridor C north to the evidence chamber.
  yield* buildRoom(acc, { cx: -46, cz: -280, floorY: y, width: 4.4, depth: 34, height: 4.8, doors: [{ side: 's', offset: 0, width: 4.2, height: 5 }, { side: 'n', offset: 0, width: 4.2, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  for (let i = 0; i < 4; i++) acc.anchor(`collapse:${i}`, 'trigger', -46, y, -266 - i * 7.5, 0, 2.6, { order: i });
  yield* buildRoom(acc, { cx: -78, cz: -299, floorY: y, width: 66, depth: 4.4, height: 4.8, doors: [{ side: 'e', offset: 0, width: 4.2, height: 4.5 }, { side: 'w', offset: 0, width: 4.2, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(66, 4.4), ctx.lib.water);
  water2.rotation.x = -Math.PI / 2;
  water2.position.set(-78, y + 0.42, -299);
  acc.group.add(water2);
  acc.colliders.push({ kind: 'box', center: new THREE.Vector3(-78, y + 0.2, -299), half: new THREE.Vector3(33, 0.2, 2.2), quaternion: new THREE.Quaternion(), surface: 'water' });
  // Corner junctions so the turns are sealed.
  yield* buildRoom(acc, { cx: -46, cz: -299, floorY: y, width: 4.4, depth: 4.4, height: 4.8, doors: [{ side: 'n', offset: 0, width: 4.2, height: 4.5 }, { side: 'w', offset: 0, width: 4.2, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield* buildRoom(acc, { cx: -112, cz: -299, floorY: y, width: 4.4, depth: 4.4, height: 4.8, doors: [{ side: 'e', offset: 0, width: 4.2, height: 4.5 }, { side: 'n', offset: 0, width: 4.2, height: 4.5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield* buildRoom(acc, { cx: -112, cz: -283, floorY: y, width: 4.4, depth: 28, height: 4.8, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.5 }, { side: 'n', offset: 0, width: 4.2, height: 5 }], ceiling: true, dark: true, wallThickness: 1.6 });
  acc.anchor('collapse:4', 'trigger', -112, y, -290, 0, 2.6, { order: 4 });
  yield;
  acc.mark('tunnels:evidence');
  // Evidence chamber: untouched by corruption, the builders' purpose on its wall.
  yield* buildRoom(acc, { cx: -112, cz: -260, floorY: y, width: 18, depth: 16, height: 7, doors: [{ side: 's', offset: 0, width: 4.2, height: 5 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, roofHoles: [{ x: 0, z: 0, w: 4, d: 4 }] });
  acc.anchor('trigger:evidence-chamber', 'trigger', -112, y, -262, 0, 6);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.4), ctx.lib.sandstone);
  setTriplanar(tablet.geometry, 2, 1.0);
  tablet.position.set(-118, y + 2.2, -262);
  tablet.rotation.y = Math.PI / 2;
  acc.mesh(tablet, false);
  acc.anchor('lore:temple-purpose', 'lore', -117, y + 1.4, -262, Math.PI / 2, 3, { text: 'ch4-evidence' }, tablet);
  const remembrance = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), ctx.lib.mural('remembrance'));
  remembrance.position.set(-112, y + 3.2, -267.2);
  acc.group.add(remembrance);
  for (const dx of [-6, 6]) acc.brazier(-112 + dx, y, -256, { scale: 0.7, intensity: 20, distance: 9 });
  acc.anchor('shrine:tunnels', 'shrine', -106, y + 1.35, -256, 0, 2.4, { lit: ctx.flags['shrine:tunnels'] === true });
  yield;
  acc.mark('tunnels:climb');
  // Climb to the library: stair (y −14 → −10), a long gallery north with a pillared mid-hall, to (−110, −10, −68).
  yield* buildRoom(acc, { cx: -112, cz: -244, floorY: y, width: 6, depth: 16, height: 9, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 0, width: 4.2, height: 9 }], ceiling: true, dark: true, floor: true });
  // Climb: bottom at the north end (y −14), rising toward +z (south) to a landing at −10 by the south door.
  acc.place(makeSteps(ctx.lib, { width: 5.6, count: 17, rise: 0.235, run: 0.5, rng: ctx.rng.fork(5) }), -112, y, -251.5, Math.PI);
  acc.landing(-112, -10, -239, 5.6, 8);
  yield* buildRoom(acc, { cx: -112, cz: -200, floorY: -10, width: 5, depth: 72, height: 5, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, wallThickness: 1.6 });
  yield* buildRoom(acc, { cx: -112, cz: -156, floorY: -10, width: 16, depth: 16, height: 7, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'n', offset: 2, width: 4.2, height: 4.6 }], pillars: { cols: 2, rows: 2, inset: 4 }, ceiling: true, dark: true });
  // A short corridor south from the mid-hall to the library's north door (the library lies south, at +z).
  yield* buildRoom(acc, { cx: -112, cz: -140, floorY: -10, width: 5, depth: 16, height: 5, doors: [{ side: 'n', offset: 0, width: 4.2, height: 4.6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }], ceiling: true, dark: true, wallThickness: 1.6 });
  acc.mark('tunnels:torches');
  for (const [x, z, yy] of [[110, -236, y], [110, -252, y], [60, -256, y], [24, -256, y], [-10, -256, y], [-46, -272, y], [-60, -300, y - 1.2], [-96, -300, y - 1.2], [-112, -212, -10], [-112, -180, -10], [-112, -140, -10]] as const) {
    acc.fire(x, yy + 3.0, z, { scale: 0.45, light: false, intensity: 0, distance: 0 });
    acc.cookie(x, yy + 0.03, z, 4.5);
    yield;
  }
  for (let i = 0; i < 4; i++) acc.anchor(`drip:${i}`, 'trigger', -30 + i * 20, y + 3, -254, 0, 1, { audio: 'drip' });
  acc.mist([{ x: 38, y: y - 0.6, z: -254, size: 30, opacity: 0.18 }, { x: -46, y: y + 0.3, z: -240, size: 36, opacity: 0.16 }, { x: -78, y: y - 0.4, z: -299, size: 40, opacity: 0.18 }], 0x1a2a3a);
  acc.anchor('trigger:tunnels-enter', 'trigger', 110, y, -250, 0, 4);
  yield;
  return yield* acc.finish();
}
