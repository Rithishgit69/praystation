import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Fireflies } from '../fx/Atmosphere';
import { TreeBuilder } from '../props/Foliage';
import { makeBrazierPlinth } from '../props/Stone';
import type { UnitBuild, ZoneBuildContext } from '../WorldTypes';
import { UnitAccumulator, addWhiteColor, setTriplanar } from './UnitKit';

/**
 * One 64 m forest cell: terrain tile, instanced trees/bushes, rocks, fallen logs, fireflies and mist,
 * plus any authored path landmarks that fall inside the cell (milestone, roadside shrine, bell trigger).
 */
export function* buildForestCell(ctx: ZoneBuildContext, cx: number, cz: number, size: number): Generator<void, UnitBuild, void> {
  const { lib, terrain, world, rng, quality } = ctx;
  const acc = new UnitAccumulator(lib, rng, 'forest');
  const half = size / 2;
  const tile = terrain.buildCell(lib, cx, cz, size, 24);
  acc.group.add(tile.mesh);
  acc.colliders.push(tile.collider);
  yield;

  const excluded = (x: number, z: number, margin: number): boolean => {
    if (world.footprintAt(x, z, margin)) return true;
    for (const p of terrain.paths) if (p.nearest(x, z).distance < p.halfWidth + margin) return true;
    return Math.hypot(x, z) > terrain.ravineRadius - 6;
  };

  // Trees on a jittered grid so density is even but never regular.
  const forest = new TreeBuilder(rng.fork(1));
  const spacing = 7.5 / Math.sqrt(quality.foliageDensity);
  const n = Math.floor(size / spacing);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = cx - half + (i + 0.2 + rng.next() * 0.6) * spacing;
      const z = cz - half + (j + 0.2 + rng.next() * 0.6) * spacing;
      if (excluded(x, z, 4)) continue;
      if (terrain.slopeAt(x, z) > 0.75) continue;
      const y = terrain.heightAt(x, z) - 0.3;
      forest.tree(x, z, rng.range(9, 16), rng.range(0, Math.PI * 2), rng.range(0.85, 1.15), y);
    }
  const bushes = Math.floor(22 * quality.foliageDensity);
  for (let i = 0; i < bushes; i++) {
    const x = cx + rng.range(-half, half);
    const z = cz + rng.range(-half, half);
    if (excluded(x, z, 1.5)) continue;
    forest.bush(x, z, rng.range(1.4, 3.0), terrain.heightAt(x, z) - 0.2);
  }
  for (const o of forest.build(lib)) acc.group.add(o);
  acc.colliders.push(...forest.colliders);
  yield;

  // Rocks and fallen logs.
  const rockGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
  setTriplanar(rockGeo, 1.5, 0.55);
  for (let i = 0; i < 6; i++) {
    const x = cx + rng.range(-half, half);
    const z = cz + rng.range(-half, half);
    if (excluded(x, z, 1)) continue;
    const s = rng.range(0.6, 2.2);
    const rock = new THREE.Mesh(rockGeo, lib.sandstoneDark);
    rock.position.set(x, terrain.heightAt(x, z) - s * 0.25, z);
    rock.rotation.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI), rng.range(-0.3, 0.3));
    rock.scale.set(s * rng.range(0.8, 1.4), s * 0.7, s);
    acc.mesh(rock);
  }
  for (let i = 0; i < 2; i++) {
    const x = cx + rng.range(-half, half);
    const z = cz + rng.range(-half, half);
    if (excluded(x, z, 2)) continue;
    const len = rng.range(5, 9);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, len, 8), lib.bark);
    log.position.set(x, terrain.heightAt(x, z) + 0.3, z);
    log.rotation.set(Math.PI / 2, 0, rng.range(0, Math.PI));
    log.rotateX(rng.range(-0.15, 0.15));
    acc.mesh(log);
  }
  yield;

  // Authored landmarks that fall inside this cell.
  for (const lm of world.landmarks) {
    if (Math.abs(lm.position.x - cx) > half || Math.abs(lm.position.z - cz) > half) continue;
    const y = terrain.heightAt(lm.position.x, lm.position.z);
    if (lm.kind === 'shrine') {
      const b = makeBrazierPlinth(lib, { rng: rng.fork(77), tiers: 2 });
      acc.place(b, lm.position.x, y, lm.position.z, lm.yaw);
      const lit = ctx.flags[`shrine:${lm.id}`] === true;
      if (lit) acc.fire(lm.position.x, y + b.fireHeight, lm.position.z, { intensity: 30, distance: 10 });
      acc.anchor(`shrine:${lm.id}`, 'shrine', lm.position.x, y + b.fireHeight, lm.position.z, lm.yaw, 2.4, { lit });
    } else if (lm.kind === 'lore') {
      const stone = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.6, 0.35, 2, 0.05), lib.sandstone);
      addWhiteColor(stone.geometry, 0.9);
      setTriplanar(stone.geometry, 1.6, 0.9);
      stone.position.set(lm.position.x, y + 0.7, lm.position.z);
      stone.rotation.y = lm.yaw + rng.range(-0.1, 0.1);
      acc.mesh(stone);
      acc.anchor(`lore:${lm.id}`, 'lore', lm.position.x, y + 0.8, lm.position.z, lm.yaw, 2.2, { text: lm.id });
    } else if (lm.kind === 'trigger') {
      acc.anchor(`trigger:${lm.id}`, 'trigger', lm.position.x, y, lm.position.z, lm.yaw, lm.radius);
    }
  }
  // Moonbeams between the trees near the path (volume only, no light cost).
  for (const p of terrain.paths) {
    const n = p.nearest(cx, cz);
    if (n.distance < 40 && rng.chance(0.7)) {
      const t = rng.range(0, 1);
      const pt = p.pointAt(t);
      if (Math.abs(pt.x - cx) < half && Math.abs(pt.z - cz) < half) acc.moonShaft(pt.x + rng.range(-6, 6), terrain.heightAt(pt.x, pt.z) + 14, terrain.heightAt(pt.x, pt.z), pt.z + rng.range(-6, 6), 3, 3, false);
    }
  }
  // Ambient: a few fireflies and one drifting mist card per cell.
  const flies = new Fireflies(lib, rng.fork(61), Math.floor(18 * quality.particleScale), { min: new THREE.Vector3(cx - half, terrain.heightAt(cx, cz) + 1, cz - half), max: new THREE.Vector3(cx + half, terrain.heightAt(cx, cz) + 5, cz + half) });
  acc.group.add(flies.points);
  acc.updates.push((_dt, t) => flies.update(t));
  acc.disposables.push(() => flies.dispose());
  acc.mist([{ x: cx + rng.range(-20, 20), y: terrain.heightAt(cx, cz) + 0.6, z: cz + rng.range(-20, 20), size: rng.range(26, 40), opacity: 0.14 }]);
  yield;
  return yield* acc.finish();
}
