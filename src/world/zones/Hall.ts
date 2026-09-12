import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeBrazierPlinth, makeSteps } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Hall of Memories (Chapter I). A hypostyle hall at colonnade level with collapsed roof sections
 * (moon shafts), a raised dais at the north wall bearing the Broken Tusk mural, and a sealed east door
 * that opens once the memory is complete.
 */
export function* buildHall(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'hall');
  const floorY = 1.92;
  const cx = 4.5;
  const cz = -92;
  yield* buildRoom(acc, {
    cx,
    cz,
    floorY,
    width: 62,
    depth: 72,
    height: 9.5,
    doors: [
      { side: 's', offset: 0, width: 7.6, height: 6.0 },
      { side: 'e', offset: -8, width: 4.2, height: 4.6 },
    ],
    pillars: { cols: 5, rows: 6, inset: 7 },
    ceiling: true,
    roofHoles: [
      { x: 4, z: 28, w: 10, d: 6 },
      { x: -12, z: 8, w: 8, d: 8 },
      { x: 14, z: -6, w: 8, d: 12 },
      { x: 0, z: -24, w: 12, d: 8 },
    ],
  });
  // Dais with steps at the north end.
  acc.place(makeSteps(ctx.lib, { width: 14, count: 4, rise: 0.24, run: 0.5, rng: ctx.rng.fork(4) }), cx, floorY, cz - 24);
  const dais = new THREE.Mesh(new THREE.BoxGeometry(22, 0.96, 10), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, floorY + 0.48, cz - 31);
  acc.mesh(dais);
  yield;
  // Mural wall: a tall carved panel on the north wall, damaged at the edges.
  const panel = new THREE.Mesh(new RoundedBoxGeometry(12, 6, 0.5, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(panel.geometry, 3, 0.85);
  panel.position.set(cx, floorY + 0.96 + 3.6, cz - 35.4);
  acc.mesh(panel, false);
  acc.anchor('mural:broken-tusk', 'mural', cx, floorY + 0.96 + 1.4, cz - 34.6, Math.PI, 3.2, { chapter: 'ch1' }, panel);
  // Braziers flanking the dais.
  for (const s of [-1, 1]) {
    const b = makeBrazierPlinth(ctx.lib, { rng: ctx.rng.fork(9 + s) });
    acc.place(b, cx + s * 8, floorY + 0.96, cz - 33);
    acc.fire(cx + s * 8, floorY + 0.96 + b.fireHeight, cz - 33, { intensity: 44, distance: 14 });
  }
  // Sealed east door: a stone slab in the doorway until the memory completes.
  const opened = ctx.flags['door:hall-east'] === true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, 4.2), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx + 31 + 0.6, floorY + 2.3 + (opened ? 4.7 : 0), cz - 8);
  if (opened) acc.mesh(slab, false);
  else acc.mesh(slab);
  acc.anchor('door:hall-east', 'door', cx + 31.6, floorY, cz - 8, Math.PI / 2, 3, { opened }, slab);
  // Fallen roof rubble under the holes, wall torches, mist.
  acc.blockStack(cx - 12, floorY, cz + 6, 5, 2, 1.2, 0.4);
  acc.blockStack(cx + 14, floorY, cz - 4, 4, 1, 1.1, -0.3);
  for (let i = 0; i < 6; i++) {
    const z = cz + 30 - i * 12;
    for (const s of [-1, 1]) {
      const x = cx + s * 30.4;
      acc.fire(x - s * 0.5, floorY + 3.2, z, { scale: 0.55, light: i < 3, intensity: 16, distance: 10 });
      if (i >= 3) acc.cookie(x - s * 1.4, floorY + 0.03, z, 6);
    }
  }
  acc.mist([{ x: cx - 12, y: floorY + 0.4, z: cz + 8, size: 16, opacity: 0.16 }, { x: cx + 14, y: floorY + 0.4, z: cz - 6, size: 16, opacity: 0.16 }, { x: cx, y: floorY + 0.4, z: cz - 24, size: 18, opacity: 0.14 }], 0x4a6a9c);
  acc.anchor('trigger:hall-enter', 'trigger', cx, floorY, cz + 32, 0, 6);
  acc.anchor('trigger:hall-dais', 'trigger', cx, floorY, cz - 20, 0, 7);
  // Diyas: small oil lamps that light one by one from the dais to the inscription and back (§22).
  const diyas = new THREE.Group();
  const route: Array<[number, number, number]> = [
    [cx - 3, floorY + 0.96, cz - 30],
    [cx - 6, floorY + 0.4, cz - 26],
    [cx - 10, floorY, cz - 20],
    [cx - 15, floorY, cz - 14],
    [cx - 20, floorY, cz - 8],
    [cx - 24, floorY, cz - 2],
    [cx - 27, floorY, cz + 4],
  ];
  const diyaGeo = new THREE.LatheGeometry([new THREE.Vector2(0.02, 0), new THREE.Vector2(0.11, 0.0), new THREE.Vector2(0.13, 0.05), new THREE.Vector2(0.09, 0.07)], 10);
  const diyaMat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
  const flameMat = new THREE.SpriteMaterial({ map: ctx.lib.glowTexture, color: 0xffb15a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  acc.disposables.push(() => diyaGeo.dispose(), () => diyaMat.dispose(), () => flameMat.dispose());
  route.forEach(([x, y, z], i) => {
    const d = new THREE.Group();
    const bowl = new THREE.Mesh(diyaGeo, diyaMat);
    const flame = new THREE.Sprite(flameMat.clone());
    flame.scale.set(0.35, 0.5, 1);
    flame.position.y = 0.16;
    flame.visible = ctx.flags['diyas:hall'] === true;
    const glow = new THREE.PointLight(0xffb15a, 3, 4, 2);
    glow.position.y = 0.2;
    glow.visible = flame.visible && i % 2 === 0;
    d.add(bowl, flame, glow);
    d.position.set(x, y, z);
    diyas.add(d);
  });
  acc.group.add(diyas);
  acc.anchor('diyas:hall', 'mechanism', cx - 12, floorY, cz - 16, 0, 1, { count: route.length }, diyas);
  // Inscription stone at the west wall, and the four symbol stones on the dais edge.
  const inscription = new THREE.Mesh(new RoundedBoxGeometry(1.6, 2.2, 0.4, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(inscription.geometry, 1.6, 0.85);
  inscription.position.set(cx - 29.6, floorY + 1.3, cz + 6);
  acc.mesh(inscription, false);
  acc.anchor('lore:inscription-first', 'lore', cx - 29, floorY + 1.2, cz + 6, Math.PI / 2, 2.4, { text: 'pro-inscription', line: 'pro-inscription' }, inscription);
  const symGeo = new RoundedBoxGeometry(0.9, 0.5, 0.9, 2, 0.04);
  setTriplanar(symGeo, 1.2, 0.9);
  for (let i = 0; i < 4; i++) {
    const sx = cx - 6 + i * 4;
    const stone = new THREE.Mesh(symGeo, ctx.lib.sandstone);
    stone.position.set(sx, floorY + 0.96 + 0.25, cz - 27);
    acc.mesh(stone, false);
    acc.anchor(`symbol:hall:${i}`, 'mechanism', sx, floorY + 0.96 + 0.5, cz - 27, 0, 2, { index: i }, stone);
  }
  yield;
  return yield* acc.finish();
}
