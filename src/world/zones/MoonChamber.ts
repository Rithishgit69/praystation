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
    const startOffsets = [Math.PI / 2, (3 * Math.PI) / 4, Math.PI / 2, Math.PI / 4];
    pivot.rotation.y = typeof ctx.flags[`mirror:${i}`] === 'number' ? (ctx.flags[`mirror:${i}`] as number) : a + (startOffsets[i] ?? 0);
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
  // Six wall marks. Moonlit: identical silver moons appear. Shadow: five vanish and the fourth shows what
  // the corruption wrote over it — the one that is not like the others (puzzle 'moon-shadow').
  const marks: Array<[number, number, THREE.Vector3]> = [
    [cx - 41.4, cz - 20, new THREE.Vector3(1, 0, 0)],
    [cx - 41.4, cz + 20, new THREE.Vector3(1, 0, 0)],
    [cx + 41.4, cz - 20, new THREE.Vector3(-1, 0, 0)],
    [cx + 41.4, cz + 20, new THREE.Vector3(-1, 0, 0)],
    [cx - 15, cz + 41.4, new THREE.Vector3(0, 0, -1)],
    [cx + 15, cz + 41.4, new THREE.Vector3(0, 0, -1)],
  ];
  marks.forEach(([mx, mz, n], i) => {
    acc.moonOnly(acc.glyph('moon', mx, y + 2.6, mz, n, 1.4, 0xa9c6f0, 0.7), 'moonlit');
    if (i === 4) acc.moonOnly(acc.glyph('corrupt', mx, y + 2.6, mz, n, 1.5, 0xb06cff, 0.85), 'shadow');
    acc.anchor(`symbol:moon-${i}`, 'lore', mx + n.x * 1.2, y + 2.2, mz + n.z * 1.2, Math.atan2(-n.x, -n.z), 2.6, { hidden: true, index: i });
  });
  // Shadow state also shows a false doorway and floor spikes that were never there in moonlight.
  const shadowDoor = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.MeshBasicMaterial({ color: 0x1a0a2a, transparent: true, opacity: 0.85, fog: false }));
  shadowDoor.position.set(cx + 41.3, y + 2.5, cz - 4);
  shadowDoor.rotation.y = -Math.PI / 2;
  acc.moonOnly(shadowDoor, 'shadow');
  acc.disposables.push(() => shadowDoor.material.dispose(), () => shadowDoor.geometry.dispose());
  const spikes = new THREE.Group();
  const spikeGeo = new THREE.ConeGeometry(0.18, 0.9, 6);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, emissive: 0x4a1a6a, emissiveIntensity: 0.4, roughness: 0.6 });
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Mesh(spikeGeo, spikeMat);
    sp.position.set(cx - 30 + ctx.rng.range(0, 14), y + 0.45, cz - 6 + ctx.rng.range(-8, 8));
    spikes.add(sp);
  }
  acc.moonOnly(spikes, 'shadow');
  acc.disposables.push(() => spikeGeo.dispose(), () => spikeMat.dispose());
  // Roof shutter: a great stone slab the wheel drags across the sky opening.
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(88, 0.8, 44), ctx.lib.sandstoneDark);
  setTriplanar(shutter.geometry, 4, 0.5);
  const closed = ctx.flags['moon:roof-closed'] === true;
  shutter.position.set(cx, y + 9.5, closed ? cz - 22 : cz - 66);
  acc.group.add(shutter);
  acc.anchor('moon:shutter', 'mechanism', cx, y + 9.5, cz - 44, 0, 1, { closed }, shutter);
  for (const [dx, dz] of [[-30, -30], [30, -30], [-30, 30], [30, 30]] as const) acc.brazier(cx + dx, y, cz + dz, { scale: 0.8, intensity: 24, distance: 11 });
  acc.blockStack(cx - 34, y, cz + 20, 6, 3, 1.2, 0.3);
  acc.pillar(cx + 34, y, cz - 20, 8, 4.2);
  acc.mist([{ x: cx, y: y + 0.5, z: cz, size: 40, opacity: 0.12 }, { x: cx - 25, y: y + 0.4, z: cz + 25, size: 24, opacity: 0.14 }], 0x4a6a9c);
  acc.anchor('trigger:moon-enter', 'trigger', cx - 7, y, cz + 38, 0, 5);
  acc.anchor('shrine:moon', 'shrine', cx + 30, y + 1.35, cz + 30, 0, 2.4, { lit: ctx.flags['shrine:moon'] === true });
  yield;
  return yield* acc.finish();
}
