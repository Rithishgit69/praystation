import * as THREE from 'three';
import { Perlin } from '@/util/noise';
import type { MaterialLibrary } from '../Materials';
import type { PropResult } from './types';

/**
 * Hanging crimson banner on a wooden bar. Origin at the bar centre; cloth hangs down -Y and faces +Z.
 * Cloth is CPU-animated (few hundred vertices) so the PBR material stays standard.
 */
export const makeBanner = (lib: MaterialLibrary, width = 1.7, height = 3.6): PropResult => {
  const group = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, width + 0.5, 8), lib.wood);
  bar.rotation.z = Math.PI / 2;
  bar.castShadow = true;
  group.add(bar);
  for (const x of [-width / 2 - 0.15, width / 2 + 0.15]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), lib.iron);
    cap.position.x = x;
    group.add(cap);
  }
  const segX = 10;
  const segY = 22;
  const geo = new THREE.PlaneGeometry(width, height, segX, segY);
  geo.translate(0, -height / 2 - 0.02, 0.02);
  const base = new Float32Array(geo.getAttribute('position').array);
  const cloth = new THREE.Mesh(geo, lib.banner);
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  group.add(cloth);
  // Rope loops over the bar.
  for (let i = 0; i <= 4; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 5, 10), lib.iron);
    loop.position.set(-width / 2 + (i / 4) * width, 0, 0.0);
    loop.rotation.y = Math.PI / 2;
    group.add(loop);
  }
  const noise = new Perlin(23);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  const update = (_dt: number, t: number): void => {
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3] as number;
      const by = base[i * 3 + 1] as number;
      const bz = base[i * 3 + 2] as number;
      const d = -by / height; // 0 at bar, 1 at hem
      const w = d * d;
      const gust = noise.noise2(t * 0.35, 1.7) * 0.5 + 0.5;
      const ripple = Math.sin(t * 2.1 + bx * 2.4 + d * 5.5) * 0.045 * w;
      const sway = noise.noise2(t * 0.6 + bx * 0.3, d * 2.0) * 0.16 * w * (0.4 + gust);
      const lift = w * 0.18 * gust;
      arr[i * 3] = bx + Math.sin(d * 3.0 + t * 0.8) * 0.02 * w;
      arr[i * 3 + 1] = by + lift * 0.35;
      arr[i * 3 + 2] = bz + ripple + sway + lift;
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return { object: group, colliders: [], update, dispose: () => geo.dispose() };
};
