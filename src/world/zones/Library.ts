import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';

/**
 * Ancient Library (Chapter V). Underground stacks of stone shelves, a scribe's dais, and the
 * inscription wall whose fragments the player reassembles; walls, pillars and statues are the puzzle.
 */
export function* buildLibrary(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'library');
  const y = -10;
  const cx = -110;
  const cz = -100;
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 74, depth: 64, height: 8, doors: [{ side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 12, width: 4.2, height: 4.6 }], pillars: { cols: 4, rows: 3, inset: 9 }, ceiling: true, dark: true, roofHoles: [{ x: 0, z: 0, w: 6, d: 6 }] });
  // Shelf stacks: long dark block walls in rows.
  for (let i = 0; i < 5; i++) {
    const z = cz - 24 + i * 10;
    acc.blockStack(cx - 26, y, z, 22, 6, 1.3, 0);
    acc.blockStack(cx + 8, y, z, 22, 6, 1.3, 0);
  }
  yield;
  // Scribe's dais and inscription wall (north).
  const dais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 8), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(cx, y + 0.35, cz - 27);
  acc.mesh(dais);
  const wallFrame = new THREE.Mesh(new RoundedBoxGeometry(16.6, 5.6, 0.5, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(wallFrame.geometry, 3, 0.85);
  wallFrame.position.set(cx, y + 0.7 + 3.2, cz - 31.5);
  acc.mesh(wallFrame, false);
  const wallPanel = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 4.8), ctx.lib.mural('scribe'));
  wallPanel.position.set(cx, y + 0.7 + 3.2, cz - 31.22);
  acc.group.add(wallPanel);
  acc.anchor('puzzle:scribe-wall', 'mural', cx, y + 0.7 + 1.4, cz - 30.6, Math.PI, 3.4, { chapter: 'ch5' }, wallPanel);
  // Movable fragment plinths (statue orientation + fragment arrangement).
  for (let i = 0; i < 5; i++) {
    const fx = cx - 8 + i * 4;
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.1, 1.2, 2, 0.04), ctx.lib.sandstone);
    setTriplanar(plinth.geometry, 2, 0.9);
    plinth.position.set(fx, y + 0.7 + 0.55, cz - 24);
    acc.mesh(plinth);
    const frag = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.3, 2, 0.03), ctx.lib.sandstoneDark);
    setTriplanar(frag.geometry, 1.2, 0.85);
    frag.position.set(fx, y + 0.7 + 1.55, cz - 24);
    const saved = ctx.flags[`fragment:${i}`];
    frag.rotation.y = typeof saved === 'number' ? saved : ((i * 7) % 4) * (Math.PI / 2);
    acc.mesh(frag, false);
    acc.anchor(`mechanism:fragment-${i}`, 'mechanism', fx, y + 0.7 + 1.2, cz - 23.4, Math.PI, 2, { index: i }, frag);
  }
  // Mural of the scribe (Inspirations note) and the sealed deep door to the shrine corridor (east).
  acc.anchor('mural:scribe', 'mural', cx - 30, y + 2.2, cz - 10, Math.PI / 2, 3, { chapter: 'ch5' });
  const sealed = ctx.flags['door:library-shrine'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, 4.2), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx + 37 + 0.6, y + 2.3 + (sealed ? 0 : 4.7), cz + 12);
  acc.mesh(slab, sealed);
  acc.anchor('door:library-shrine', 'door', cx + 37.6, y, cz + 12, Math.PI / 2, 3, { opened: !sealed }, slab);
  for (const [dx, dz] of [[-30, 20], [30, 20], [-30, -20], [30, -20]] as const) acc.fire(cx + dx, y + 1.35, cz + dz, { scale: 0.7, intensity: 24, distance: 11 });
  acc.mist([{ x: cx, y: y + 0.4, z: cz, size: 40, opacity: 0.12 }], 0x30281c);
  acc.anchor('trigger:library-enter', 'trigger', cx, y, cz + 28, 0, 5);
  acc.anchor('shrine:library', 'shrine', cx + 30, y + 1.35, cz + 20, 0, 2.4, { lit: ctx.flags['shrine:library'] === true });
  yield;
  return yield* acc.finish();
}
