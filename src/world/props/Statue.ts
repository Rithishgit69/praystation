import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../Materials';
import { setTriplanar } from '../zones/UnitKit';

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Tapered cylinder between two points. */
const bone = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, segments = 14): THREE.BufferGeometry => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, segments, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
};

const sphere = (c: THREE.Vector3, r: number, sx = 1, sy = 1, sz = 1, rotX = 0, rotY = 0, rotZ = 0): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(r, 28, 20);
  g.scale(sx, sy, sz);
  g.rotateX(rotX);
  g.rotateY(rotY);
  g.rotateZ(rotZ);
  g.translate(c.x, c.y, c.z);
  return g;
};

/** Tapered tube along a curve (three pieces of decreasing radius). */
const taperedTube = (points: THREE.Vector3[], r0: number, r1: number): THREE.BufferGeometry[] => {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const out: THREE.BufferGeometry[] = [];
  const pieces = 4;
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const sub = new THREE.CatmullRomCurve3([curve.getPointAt(t0), curve.getPointAt(t0 + (t1 - t0) * 0.5), curve.getPointAt(t1)], false, 'centripetal');
    const r = r0 + (r1 - r0) * ((t0 + t1) / 2);
    out.push(new THREE.TubeGeometry(sub, 10, r, 14, false));
    out.push(sphere(curve.getPointAt(t1), r));
  }
  return out;
};

/**
 * The sanctum's seated Ganesha: monumental, calm and intact — lotus base, crossed legs, rounded belly,
 * broad ears, a gently curling trunk resting toward the sweet in the left hand, one whole tusk and one
 * broken, the right palm raised in reassurance, a tall crown and a halo disc. Proportions follow classic
 * temple sculpture: nothing comic, nothing distorted. Origin at the base centre; faces +Z. ~13 m tall.
 */
export const buildGaneshaStatue = (lib: MaterialLibrary): { group: THREE.Group; height: number } => {
  const parts: THREE.BufferGeometry[] = [];
  // Lotus pedestal: two rings of petals around a drum.
  parts.push(new THREE.CylinderGeometry(5.2, 5.6, 1.2, 40).translate(0, 0.6, 0));
  for (let ring = 0; ring < 2; ring++) {
    const n = 18 + ring * 6;
    const r = 5.4 + ring * 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.17;
      const petal = new THREE.SphereGeometry(0.75, 10, 8);
      petal.scale(1.0, 0.45, 1.6);
      petal.rotateY(-a + Math.PI / 2);
      petal.rotateX(ring === 0 ? -0.35 : -0.15);
      petal.translate(Math.cos(a) * r, 1.1 + ring * 0.15, Math.sin(a) * r);
      parts.push(petal);
    }
  }
  const y0 = 1.3;
  // Crossed legs: a broad low mass with knees and the soles turned up at the front.
  parts.push(sphere(v(0, y0 + 1.3, 0.3), 4.2, 1.15, 0.42, 0.95));
  parts.push(sphere(v(-3.2, y0 + 1.5, 1.4), 1.35, 1.0, 0.85, 1.0));
  parts.push(sphere(v(3.2, y0 + 1.5, 1.4), 1.35, 1.0, 0.85, 1.0));
  parts.push(sphere(v(-1.0, y0 + 1.15, 3.3), 0.9, 1.3, 0.45, 0.9, 0, 0, 0.3));
  parts.push(sphere(v(1.0, y0 + 1.15, 3.3), 0.9, 1.3, 0.45, 0.9, 0, 0, -0.3));
  // Belly and chest.
  parts.push(sphere(v(0, y0 + 4.2, 0.2), 3.0, 1.12, 1.15, 1.0));
  parts.push(sphere(v(0, y0 + 6.4, 0.1), 2.5, 1.32, 0.78, 0.92));
  // Belt / sash and a serpent-band around the belly (traditional ornament), sacred thread.
  parts.push(new THREE.TorusGeometry(3.25, 0.22, 10, 48).rotateX(Math.PI / 2).translate(0, y0 + 3.2, 0.2));
  parts.push(new THREE.TorusGeometry(2.55, 0.16, 8, 40).rotateX(Math.PI / 2 + 0.55).translate(0, y0 + 5.9, 0.3));
  // Neck and head.
  parts.push(bone(v(0, y0 + 7.0, 0.1), v(0, y0 + 8.0, 0.2), 1.1, 1.0));
  parts.push(sphere(v(0, y0 + 9.4, 0.2), 2.15, 1.0, 1.08, 1.0));
  parts.push(sphere(v(0, y0 + 10.1, 0.9), 1.4, 1.15, 0.7, 0.9)); // brow
  // Ears: broad, slightly cupped.
  for (const s of [-1, 1]) {
    parts.push(sphere(v(s * 2.55, y0 + 9.3, -0.1), 1.7, 0.28, 1.15, 0.95, 0, s * 0.35, 0));
    parts.push(sphere(v(s * 2.75, y0 + 9.3, -0.05), 1.3, 0.16, 0.95, 0.75, 0, s * 0.35, 0));
  }
  // Eyes (gentle, half-closed) as shallow lids.
  for (const s of [-1, 1]) parts.push(sphere(v(s * 0.8, y0 + 9.6, 2.05), 0.36, 1.2, 0.55, 0.6));
  // Trunk: from the face, down and curling toward the left hand's sweet.
  parts.push(...taperedTube([v(0, y0 + 9.0, 1.9), v(0.1, y0 + 7.6, 2.7), v(-0.4, y0 + 6.0, 2.9), v(-1.3, y0 + 4.9, 2.9), v(-2.0, y0 + 4.5, 2.2)], 0.85, 0.42));
  // Tusks: the right one whole (viewer's left), the left broken short (Eka-Danta).
  parts.push(...taperedTube([v(0.9, y0 + 8.3, 2.0), v(1.5, y0 + 7.8, 2.6), v(1.9, y0 + 7.0, 2.9)], 0.34, 0.12));
  parts.push(sphere(v(-1.0, y0 + 8.2, 2.1), 0.33, 1, 0.7, 0.8));
  // Arms. Right raised in abhaya (palm forward); left lowered, holding the modak.
  parts.push(sphere(v(2.9, y0 + 6.7, 0.2), 0.95));
  parts.push(bone(v(2.9, y0 + 6.7, 0.2), v(3.9, y0 + 7.9, 0.9), 0.85, 0.72));
  parts.push(bone(v(3.9, y0 + 7.9, 0.9), v(3.7, y0 + 9.9, 1.5), 0.72, 0.6));
  const palm = new THREE.SphereGeometry(0.9, 18, 14);
  palm.scale(0.95, 1.2, 0.35);
  palm.rotateX(-0.15);
  palm.translate(3.65, y0 + 10.9, 1.6);
  parts.push(palm);
  for (let f = 0; f < 4; f++) parts.push(bone(v(3.1 + f * 0.36, y0 + 11.5, 1.65), v(3.05 + f * 0.4, y0 + 12.3, 1.7), 0.14, 0.11));
  parts.push(sphere(v(-2.9, y0 + 6.7, 0.2), 0.95));
  parts.push(bone(v(-2.9, y0 + 6.7, 0.2), v(-3.6, y0 + 4.9, 1.2), 0.85, 0.72));
  parts.push(bone(v(-3.6, y0 + 4.9, 1.2), v(-2.5, y0 + 3.9, 2.4), 0.72, 0.6));
  parts.push(sphere(v(-2.3, y0 + 3.7, 2.7), 0.7, 1.0, 0.6, 1.1));
  parts.push(sphere(v(-2.1, y0 + 4.4, 2.6), 0.6)); // the modak, resting in the palm
  parts.push(new THREE.ConeGeometry(0.45, 0.5, 12).translate(-2.1, y0 + 4.95, 2.6));
  // Armbands and bangles.
  for (const s of [-1, 1]) parts.push(new THREE.TorusGeometry(0.86, 0.1, 8, 24).rotateZ(Math.PI / 2 + s * 0.6).translate(s * 3.4, y0 + 7.3, 0.55));
  parts.push(new THREE.TorusGeometry(0.66, 0.09, 8, 24).rotateX(1.2).translate(3.75, y0 + 9.5, 1.35));
  parts.push(new THREE.TorusGeometry(0.66, 0.09, 8, 24).rotateX(0.6).translate(-2.7, y0 + 4.2, 2.1));
  // Crown: stacked tiers with a finial; halo disc behind the head.
  parts.push(new THREE.CylinderGeometry(1.7, 2.0, 0.7, 32).translate(0, y0 + 11.4, 0.1));
  parts.push(new THREE.CylinderGeometry(1.25, 1.7, 1.0, 32).translate(0, y0 + 12.2, 0.1));
  parts.push(new THREE.ConeGeometry(1.25, 2.2, 32).translate(0, y0 + 13.8, 0.1));
  parts.push(sphere(v(0, y0 + 15.0, 0.1), 0.32));
  parts.push(new THREE.TorusGeometry(3.6, 0.18, 10, 64).translate(0, y0 + 9.6, -1.4));
  parts.push(new THREE.CylinderGeometry(3.45, 3.45, 0.12, 64).rotateX(Math.PI / 2).translate(0, y0 + 9.6, -1.45));

  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('statue: merge failed');
  merged.computeVertexNormals();
  setTriplanar(merged, 2.6, 1.0);
  const mesh = new THREE.Mesh(merged, lib.sandstone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, height: y0 + 15.3 };
};
