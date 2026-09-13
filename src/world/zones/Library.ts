import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, buildRoom, setTriplanar } from './UnitKit';
import { glyphDecal } from '../MuralArt';

/**
 * Ancient Library (Chapter V). Underground stacks of stone shelves, a scribe's dais, and the
 * inscription wall whose fragments the player reassembles; walls, pillars and statues are the puzzle.
 */
export function* buildLibrary(ctx: ZoneBuildContext): Generator<void, UnitBuild, void> {
  const acc = new UnitAccumulator(ctx.lib, ctx.rng, 'library');
  const y = -10;
  const cx = -110;
  const cz = -100;
  yield* buildRoom(acc, { cx, cz, floorY: y, width: 74, depth: 64, height: 8, doors: [{ side: 'n', offset: -2, width: 4.2, height: 4.6 }, { side: 's', offset: 0, width: 4.2, height: 4.6 }, { side: 'e', offset: 12, width: 4.2, height: 4.6 }], pillars: { cols: 4, rows: 3, inset: 9 }, ceiling: true, dark: true, roofHoles: [{ x: 0, z: 0, w: 6, d: 6 }] });
  // Shelf stacks: long dark block walls in rows.
  acc.mark('library:shelves');
  for (let i = 0; i < 5; i++) {
    const z = cz - 24 + i * 10;
    acc.wall(cx - 37, z, cx - 15, z, y, 2.9, 1.3, true);
    acc.wall(cx - 3, z, cx + 19, z, y, 2.9, 1.3, true);
    // Scroll niches along each shelf face.
    for (let k = 0; k < 6; k++) {
      for (const dx of [-36 + k * 4, -2 + k * 4]) {
        acc.glyph('scroll', cx + dx, y + 1.6, z + 0.66, new THREE.Vector3(0, 0, 1), 0.5, 0xd9b370, 0.35);
        acc.glyph('scroll', cx + dx, y + 1.6, z - 0.66, new THREE.Vector3(0, 0, -1), 0.5, 0xd9b370, 0.35);
      }
    }
    yield;
  }
  // Scribe's dais and inscription wall (north wall, east of the north door).
  const sx = cx + 14;
  const dais = new THREE.Mesh(new THREE.BoxGeometry(18, 0.7, 8), ctx.lib.flagstone);
  setTriplanar(dais.geometry, 5.6, 0.75);
  dais.position.set(sx, y + 0.35, cz - 27);
  acc.mesh(dais);
  const wallFrame = new THREE.Mesh(new RoundedBoxGeometry(16.6, 5.6, 0.5, 2, 0.05), ctx.lib.sandstoneDark);
  setTriplanar(wallFrame.geometry, 3, 0.85);
  wallFrame.position.set(sx, y + 0.7 + 3.2, cz - 31.5);
  acc.mesh(wallFrame, false);
  const wallPanel = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 4.8), ctx.lib.mural('scribe'));
  wallPanel.position.set(sx, y + 0.7 + 3.2, cz - 31.22);
  acc.group.add(wallPanel);
  acc.anchor('puzzle:scribe-wall', 'mural', sx, y + 0.7 + 1.4, cz - 30.6, Math.PI, 3.4, { chapter: 'ch5' }, wallPanel);
  // Movable fragment plinths (statue orientation + fragment arrangement).
  for (let i = 0; i < 5; i++) {
    const fx = sx - 8 + i * 4;
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.1, 1.2, 2, 0.04), ctx.lib.sandstone);
    setTriplanar(plinth.geometry, 2, 0.9);
    plinth.position.set(fx, y + 0.7 + 0.55, cz - 24);
    acc.mesh(plinth);
    const frag = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.3, 2, 0.03), ctx.lib.sandstoneDark);
    setTriplanar(frag.geometry, 1.2, 0.85);
    frag.position.set(fx, y + 0.7 + 1.55, cz - 24);
    const saved = ctx.flags[`fragment:${i}`];
    frag.rotation.y = typeof saved === 'number' ? saved : [1, 3, 2, 1, 3][i] as number * (Math.PI / 2);
    acc.mesh(frag, false);
    const glyphDeco = glyphDecal('scroll', 0.6, 0xffd98a, 0.7);
    glyphDeco.position.z = 0.165;
    frag.add(glyphDeco);
    acc.disposables.push(() => glyphDeco.material.dispose(), () => glyphDeco.geometry.dispose());
    if (i === 4 && ctx.flags['fragment:placed'] !== true) frag.visible = false;
    acc.anchor(`mechanism:fragment-${i}`, 'mechanism', fx, y + 0.7 + 1.2, cz - 23.4, Math.PI, 2, { index: i }, frag);
  }
  // The missing fifth fragment lies on a shelf across the hall until it is found and carried back.
  if (ctx.flags['fragment:placed'] !== true) {
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.9, 2, 0.04), ctx.lib.sandstone);
    setTriplanar(pedestal.geometry, 2, 0.9);
    pedestal.position.set(cx + 24, y + 0.4, cz + 24);
    acc.mesh(pedestal);
    const lost = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.3, 2, 0.03), ctx.lib.sandstoneDark);
    setTriplanar(lost.geometry, 1.2, 0.85);
    lost.position.set(cx + 24, y + 1.3, cz + 24);
    lost.rotation.set(0.1, 0.3, 0.05);
    acc.mesh(lost, false);
    acc.anchor('object:fragment-missing', 'mechanism', cx + 24, y + 1.2, cz + 24, 0, 2.6, {}, lost);
  }
  // Mural of the scribe (Inspirations note) and the sealed deep door to the shrine corridor (east).
  acc.anchor('mural:scribe', 'mural', cx - 30, y + 2.2, cz - 10, Math.PI / 2, 3, { chapter: 'ch5' });
  const sealed = ctx.flags['door:library-shrine'] !== true;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.6, 4.2), ctx.lib.sandstoneDark);
  setTriplanar(slab.geometry, 2, 0.7);
  slab.position.set(cx + 37 + 0.6, y + 2.3 + (sealed ? 0 : 4.7), cz + 12);
  acc.mesh(slab, sealed);
  acc.anchor('door:library-shrine', 'door', cx + 37.6, y, cz + 12, Math.PI / 2, 3, { opened: !sealed }, slab);
  for (const [dx, dz] of [[-30, 20], [30, 20], [-30, -20], [30, -20]] as const) acc.brazier(cx + dx, y, cz + dz, { scale: 0.8, intensity: 24, distance: 11 });
  // Aisle torches on the shelf ends: the first three carry real lights, the rest baked pools.
  for (let i = 0; i < 5; i++) {
    const z = cz - 24 + i * 10 + 5;
    for (const dx of [-13.5, -4.5]) {
      acc.fire(cx + dx, y + 2.6, z, { scale: 0.5, light: i < 2, intensity: 14, distance: 9 });
      if (i >= 2) acc.cookie(cx + dx, y + 0.03, z, 5);
    }
  }
  acc.mist([{ x: cx, y: y + 0.4, z: cz, size: 40, opacity: 0.12 }], 0x30281c);
  acc.anchor('trigger:library-enter', 'trigger', cx - 2, y, cz - 27, 0, 5);
  acc.anchor('shrine:library', 'shrine', cx + 30, y + 1.35, cz + 20, 0, 2.4, { lit: ctx.flags['shrine:library'] === true });
  yield;
  return yield* acc.finish();
}
