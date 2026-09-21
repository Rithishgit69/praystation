import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '@/world/Materials';
import type { DesignId } from './MissionData';

/** The bone groups every design fills; the pose system animates these. Units: metres at scale 1 (~3.2 m tall). */
export interface AsuraRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  lArm: THREE.Group;
  rArm: THREE.Group;
  lLeg: THREE.Group;
  rLeg: THREE.Group;
  lHand: THREE.Group;
  rHand: THREE.Group;
  mouth: THREE.Object3D;
  /** Extra arm pairs (the six-armed design): [left, right] groups that follow the main arms. */
  extraArms: Array<[THREE.Group, THREE.Group]>;
  /** Long cloth pieces that ripple (scarves, sashes). */
  scarves: THREE.Object3D[];
  /** Hovering designs float above the floor and do not step. */
  hover: boolean;
}

export interface DesignContext {
  lib: MaterialLibrary;
  /** The vice colour: eyes, core, aura. */
  color: number;
  bodyMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  /** Registers a material for disposal and returns it. */
  mat(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number): THREE.Mesh;
  eye(parent: THREE.Object3D, x: number, y: number, z: number, size?: number): THREE.Sprite;
}

const capsule = (r: number, len: number): THREE.CapsuleGeometry => new THREE.CapsuleGeometry(r, len, 6, 14);
const sphere = (r: number, w = 14, h = 10): THREE.SphereGeometry => new THREE.SphereGeometry(r, w, h);
const box = (w: number, h: number, d: number, r = 0.04): RoundedBoxGeometry => new RoundedBoxGeometry(w, h, d, 2, r);
const cone = (r: number, h: number, seg = 8): THREE.ConeGeometry => new THREE.ConeGeometry(r, h, seg);
const torus = (r: number, tube: number, arc = Math.PI * 2, seg = 24): THREE.TorusGeometry => new THREE.TorusGeometry(r, tube, 8, seg, arc);
const cyl = (rt: number, rb: number, h: number, seg = 16, open = false): THREE.CylinderGeometry => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

interface BodyOptions {
  torso: [number, number, number];
  belly?: number;
  armR: number;
  legR: number;
  neckR?: number;
  headR?: number;
  feet: 'bare' | 'sandals' | 'hooves' | 'bare-narrow';
  skin: THREE.Material;
  legCloth?: THREE.Material;
}

/** Shared body: chest, belly, legs, arms, hands, neck and skull. Designs decorate on top. */
const body = (rig: AsuraRig, c: DesignContext, o: BodyOptions): void => {
  const { add } = c;
  add(rig.hips, capsule(0.42, 0.3), o.legCloth ?? o.skin, 0, -0.05, 0).scale.set(1.2, 0.8, 1);
  for (const [leg, x] of [[rig.lLeg, -0.3], [rig.rLeg, 0.3]] as const) {
    leg.position.set(x, -0.1, 0);
    rig.hips.add(leg);
    add(leg, capsule(o.legR, 0.8), o.legCloth ?? o.skin, 0, -0.6, 0);
    if (o.feet === 'hooves') add(leg, box(0.34, 0.26, 0.4, 0.06), c.mat({ color: 0x1a1414, roughness: 0.6 }), 0, -1.32, 0.08);
    else if (o.feet === 'sandals') {
      add(leg, box(0.4, 0.14, 0.62, 0.05), o.skin, 0, -1.3, 0.12);
      add(leg, box(0.42, 0.05, 0.66, 0.02), c.mat({ color: 0x5a3a22, roughness: 0.85 }), 0, -1.39, 0.12);
    } else add(leg, box(o.feet === 'bare-narrow' ? 0.3 : 0.38, 0.16, 0.58, 0.06), o.skin, 0, -1.3, 0.12);
  }
  const chest = add(rig.torso, capsule(0.62, 0.7), o.skin, 0, 0.7, 0);
  chest.scale.set(...o.torso);
  if (o.belly) add(rig.torso, sphere(o.belly, 18, 14), o.skin, 0, 0.25, 0.28).scale.set(1.15, 0.95, 0.9);
  for (const s of [-1, 1]) add(rig.torso, sphere(0.34 * o.torso[0] / 1.35 + 0.08), o.skin, s * (0.78 * o.torso[0] / 1.35 + 0.05), 1.32, 0);
  add(rig.torso, cyl(o.neckR ?? 0.22, o.neckR ?? 0.26, 0.3), o.skin, 0, 1.55, 0.05);
  for (const [arm, hand, side] of [[rig.lArm, rig.lHand, -1], [rig.rArm, rig.rHand, 1]] as const) {
    arm.position.set(side * (0.86 * o.torso[0] / 1.35 + 0.05), 1.3, 0);
    rig.torso.add(arm);
    add(arm, capsule(o.armR, 0.7), o.skin, 0, -0.5, 0);
    const fore = add(arm, capsule(o.armR * 0.85, 0.7), o.skin, 0, -1.2, 0.15);
    fore.rotation.x = -0.3;
    add(arm, sphere(o.armR * 0.95), o.skin, 0, -1.65, 0.3);
    hand.position.set(0, -1.65, 0.3);
    arm.add(hand);
  }
  rig.head.position.set(0, 1.6, 0.05);
  rig.torso.add(rig.head);
  const skull = add(rig.head, sphere(o.headR ?? 0.36, 16, 14), o.skin, 0, 0.25, 0);
  skull.scale.set(1, 1.15, 1);
  rig.mouth.position.set(0, 0.08, 0.42);
  rig.head.add(rig.mouth);
};

const goldOf = (c: DesignContext): THREE.MeshStandardMaterial => c.mat({ color: 0xe0b24a, roughness: 0.28, metalness: 0.9, emissive: 0x4a3410, emissiveIntensity: 0.25 });
const necklace = (c: DesignContext, parent: THREE.Object3D, r: number, tube: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
  const m = c.add(parent, torus(r, tube, Math.PI * 2, 28), mat, 0, y, z);
  m.rotation.x = Math.PI / 2 + 0.35;
  return m;
};
const beadStrand = (c: DesignContext, parent: THREE.Object3D, r: number, y: number, z: number, n: number, bead: number, mat: THREE.Material): void => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sag = Math.max(0, Math.cos(a)) * 0.22; // hangs lower at the front
    c.add(parent, sphere(bead, 8, 6), mat, Math.sin(a) * r, y - sag, z + Math.cos(a) * r * 0.75);
  }
};
const armlet = (c: DesignContext, arm: THREE.Group, y: number, r: number, mat: THREE.Material): void => {
  c.add(arm, torus(r, 0.035, Math.PI * 2, 18), mat, 0, y, 0).rotation.x = Math.PI / 2;
};

/** A curved talwar for the right hand. */
const talwar = (c: DesignContext, hand: THREE.Group): void => {
  const metal = c.mat({ color: 0xc8ccd4, roughness: 0.22, metalness: 0.95 });
  const gold = goldOf(c);
  const wood = c.mat({ color: 0x4a2a18, roughness: 0.85 });
  const sword = new THREE.Group();
  hand.add(sword);
  c.add(sword, cyl(0.05, 0.06, 0.5, 8), wood, 0, 0.15, 0);
  c.add(sword, torus(0.16, 0.03, Math.PI * 2, 14), gold, 0, 0.4, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const seg = c.add(sword, new THREE.BoxGeometry(0.022, 0.42, 0.22 - t * 0.06), metal, 0, 0.6 + i * 0.38, Math.sin(t * 1.1) * 0.55);
    seg.rotation.x = -t * 0.75;
  }
  c.add(sword, cone(0.11, 0.35, 4), metal, 0, 2.7, 0.55).rotation.x = -0.75;
};

/** Long cloth ribbon along +Y from the origin, used for sashes and scarves (registered for rippling). */
const ribbon = (rig: AsuraRig, parent: THREE.Object3D, mat: THREE.Material, w: number, len: number, x: number, y: number, z: number, rx: number, ry: number, rz: number): THREE.Mesh => {
  const geo = new THREE.PlaneGeometry(w, len, 1, 6);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  rig.scarves.push(m);
  return m;
};

// ---- 1. Madasura: the blade warrior (reference: comic-style warrior with top-knot, tilak, gold, red sash) ----
const bladeWarrior = (rig: AsuraRig, c: DesignContext): void => {
  const skin = c.mat({ color: 0x9a5a34, roughness: 0.55, metalness: 0.05 });
  const gold = goldOf(c);
  const red = c.mat({ color: 0xb0202a, roughness: 0.85, side: THREE.DoubleSide });
  const redDark = c.mat({ color: 0x7a1220, roughness: 0.85, side: THREE.DoubleSide });
  const white = c.mat({ color: 0xe8e0d0, roughness: 0.9, side: THREE.DoubleSide });
  const hair = c.mat({ color: 0x14100e, roughness: 0.6 });
  const { add } = c;
  body(rig, c, { torso: [1.2, 1.05, 0.82], armR: 0.22, legR: 0.21, feet: 'bare', skin, legCloth: white });
  // Abs and pectorals.
  for (let r = 0; r < 3; r++) for (const s of [-1, 1]) add(rig.torso, sphere(0.13, 8, 6), skin, s * 0.16, 0.42 - r * 0.2, 0.5).scale.set(1, 0.7, 0.5);
  // Hair: slicked back into a bun with a gold ornament; long strands down the back.
  add(rig.head, sphere(0.38, 16, 12, ), hair, 0, 0.3, -0.05).scale.set(0.98, 0.95, 1);
  add(rig.head, sphere(0.16, 10, 8), hair, 0, 0.72, -0.08);
  add(rig.head, torus(0.14, 0.03, Math.PI * 2, 14), gold, 0, 0.62, -0.08).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) add(rig.head, capsule(0.06, 0.9), hair, s * 0.28, -0.25, -0.22).rotation.x = 0.25;
  // Tilak: white stripe with a red centre; red glowing eyes; brow ridge.
  add(rig.head, box(0.16, 0.26, 0.02, 0.01), white, 0, 0.42, 0.4);
  add(rig.head, box(0.06, 0.14, 0.02, 0.01), red, 0, 0.42, 0.415);
  c.eye(rig.head, -0.14, 0.3, 0.38);
  c.eye(rig.head, 0.14, 0.3, 0.38);
  add(rig.head, box(0.22, 0.12, 0.18, 0.03), skin, 0, 0.02, 0.24); // jaw
  // Earrings, necklaces and bead strands.
  for (const s of [-1, 1]) add(rig.head, torus(0.06, 0.012, Math.PI * 2, 12), gold, s * 0.36, 0.14, 0.02);
  necklace(c, rig.torso, 0.5, 0.045, 1.28, 0.1, gold);
  beadStrand(c, rig.torso, 0.55, 1.2, 0.12, 22, 0.035, c.mat({ color: 0x5a2a14, roughness: 0.7 }));
  add(rig.torso, cone(0.08, 0.16, 6), gold, 0, 0.78, 0.66).rotation.x = Math.PI; // pendant
  // Gold pauldron on the right shoulder, armlets, bracelets, belt with a great medallion.
  const pauldron = add(rig.torso, box(0.62, 0.5, 0.58, 0.08), gold, 0.86, 1.5, 0);
  pauldron.rotation.z = -0.35;
  add(rig.torso, sphere(0.09, 10, 8), c.coreMat, 1.02, 1.55, 0.26);
  for (const arm of [rig.lArm, rig.rArm]) {
    armlet(c, arm, -0.35, 0.26, gold);
    armlet(c, arm, -1.45, 0.2, gold);
  }
  for (const leg of [rig.lLeg, rig.rLeg]) armlet(c, leg, -1.15, 0.24, gold);
  necklace(c, rig.torso, 0.62, 0.05, 0.12, 0, gold).rotation.x = Math.PI / 2;
  add(rig.torso, cyl(0.2, 0.2, 0.06, 12), gold, 0, 0.1, 0.62).rotation.x = Math.PI / 2;
  // White dhoti below the belt, red sash across the chest and hanging strips.
  add(rig.hips, cyl(0.62, 0.72, 1.0, 16, true), white, 0, -0.5, 0).scale.set(1.05, 1, 0.85);
  ribbon(rig, rig.torso, red, 0.34, 1.9, -0.55, 1.45, 0.5, 0.1, 0.15, 0.55);
  ribbon(rig, rig.hips, red, 0.4, 1.7, -0.45, 0.05, 0.55, 0.15, 0.1, 0.12);
  ribbon(rig, rig.hips, redDark, 0.34, 1.6, 0.55, 0.05, 0.5, 0.15, -0.1, -0.12);
  ribbon(rig, rig.hips, red, 0.3, 1.5, 0, 0.05, -0.62, -0.2, Math.PI, 0);
  talwar(c, rig.rHand);
};

// ---- 2. Krodhasura: the wrestler (reference: sumo-built brute, rope necklace and belt, hakama) ----
const wrestler = (rig: AsuraRig, c: DesignContext): void => {
  const skin = c.mat({ color: 0xb87850, roughness: 0.7 });
  const hair = c.mat({ color: 0x141210, roughness: 0.7 });
  const rope = c.mat({ color: 0xc8b070, roughness: 0.95 });
  const navy = c.mat({ color: 0x26304a, roughness: 0.9, side: THREE.DoubleSide });
  const redCloth = c.mat({ color: 0xa02a2a, roughness: 0.9, side: THREE.DoubleSide });
  const leather = c.mat({ color: 0x2a221c, roughness: 0.8 });
  const gold = goldOf(c);
  const ink = c.mat({ color: 0x2a2018, roughness: 0.9 });
  const { add } = c;
  body(rig, c, { torso: [1.75, 1.05, 1.35], belly: 0.92, armR: 0.3, legR: 0.34, neckR: 0.34, headR: 0.36, feet: 'sandals', skin, legCloth: navy });
  // A full black beard down to the chest, moustache, heavy brows, hair cap and top-knot.
  const beard = add(rig.head, sphere(0.4, 14, 10), hair, 0, -0.18, 0.22);
  beard.scale.set(1.0, 1.15, 0.8);
  add(rig.head, sphere(0.3, 12, 8), hair, 0, -0.5, 0.2).scale.set(0.9, 0.9, 0.6);
  add(rig.head, box(0.46, 0.12, 0.18, 0.04), hair, 0, 0.16, 0.42);
  for (const s of [-1, 1]) add(rig.head, box(0.18, 0.06, 0.08, 0.02), hair, s * 0.15, 0.42, 0.36).rotation.z = -s * 0.3;
  add(rig.head, sphere(0.36, 14, 10), hair, 0, 0.42, -0.04).scale.set(1.02, 0.72, 1.02);
  add(rig.head, cyl(0.07, 0.09, 0.28, 8), hair, 0, 0.78, -0.06);
  add(rig.head, sphere(0.1, 8, 6), hair, 0, 0.92, -0.06);
  c.eye(rig.head, -0.13, 0.3, 0.38, 0.2);
  c.eye(rig.head, 0.13, 0.3, 0.38, 0.2);
  // A thick braided straw rope hangs on the chest; knots along it.
  const loop = add(rig.torso, torus(0.86, 0.15, Math.PI * 2, 32), rope, 0, 1.0, 0.42);
  loop.rotation.x = Math.PI / 2 + 0.95;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    add(rig.torso, sphere(0.17, 8, 6), rope, Math.sin(a) * 0.86, 1.0 - Math.cos(a) * 0.5, 0.42 + Math.cos(a) * 0.7).scale.set(1, 0.85, 1.1);
  }
  const belt = add(rig.hips, torus(0.86, 0.13, Math.PI * 2, 30), rope, 0, 0.12, 0.05);
  belt.rotation.x = Math.PI / 2;
  for (let i = 0; i < 9; i++) add(rig.hips, sphere(0.14, 8, 6), rope, -0.5 + (i % 3) * 0.5, -0.1 - Math.floor(i / 3) * 0.28, 0.82).scale.set(1, 1.25, 0.9);
  for (let i = 0; i < 6; i++) add(rig.hips, cyl(0.04, 0.02, 0.7, 6), rope, -0.65 + i * 0.26, -0.55, 0.8);
  // Hakama: wide pleated skirt with red side panels; studded bracers; tattoo rings on the right shoulder.
  add(rig.hips, cyl(0.95, 1.05, 1.5, 20, true), navy, 0, -0.85, 0);
  for (const s of [-1, 1]) add(rig.hips, box(0.5, 0.9, 0.08, 0.02), redCloth, s * 0.95, -0.5, 0.2);
  for (const arm of [rig.lArm, rig.rArm]) {
    add(arm, cyl(0.31, 0.31, 0.45, 12), leather, 0, -1.3, 0.16).rotation.x = -0.3;
    for (let i = 0; i < 6; i++) add(arm, sphere(0.035, 6, 5), gold, Math.sin(i) * 0.3, -1.22 - (i % 2) * 0.16, 0.16 + Math.cos(i) * 0.3);
  }
  add(rig.torso, torus(0.3, 0.05, Math.PI * 2, 20), ink, 1.05, 1.42, 0.05).rotation.y = Math.PI / 2;
  add(rig.torso, torus(0.18, 0.04, Math.PI * 2, 16), ink, 1.06, 1.42, 0.05).rotation.y = Math.PI / 2;
  // Fists.
  for (const hand of [rig.lHand, rig.rHand]) add(hand, sphere(0.3, 10, 8), skin, 0, -0.05, 0.05).scale.set(1, 0.9, 1.1);
};

// ---- 3. Lobhasura: the buffalo demon (reference: grey bull-headed demon, curling horns, red eyes) ----
const buffalo = (rig: AsuraRig, c: DesignContext): void => {
  const hide = c.mat({ color: 0x3e3e46, roughness: 0.7 });
  const dark = c.mat({ color: 0x1c1a20, roughness: 0.8 });
  const horn = c.mat({ color: 0x4a4038, roughness: 0.5 });
  const bone = c.mat({ color: 0xd8c8a8, roughness: 0.6 });
  const stone = c.mat({ color: 0x2c2a30, roughness: 0.55, metalness: 0.2 });
  const red = c.mat({ color: 0x8a1a1a, roughness: 0.6, emissive: 0x6a0a0a, emissiveIntensity: 0.6 });
  const { add } = c;
  body(rig, c, { torso: [1.65, 1.1, 1.25], belly: 0.55, armR: 0.32, legR: 0.34, neckR: 0.4, headR: 0.42, feet: 'hooves', skin: hide });
  // Snout, nostrils, open jaw with fangs.
  const snout = add(rig.head, box(0.48, 0.42, 0.62, 0.1), hide, 0, 0.1, 0.5);
  snout.rotation.x = 0.1;
  for (const s of [-1, 1]) add(rig.head, sphere(0.06, 8, 6), dark, s * 0.12, 0.12, 0.8);
  add(rig.head, box(0.4, 0.14, 0.44, 0.04), dark, 0, -0.16, 0.5).rotation.x = 0.4;
  for (const s of [-1, 1]) {
    add(rig.head, cone(0.045, 0.22, 6), bone, s * 0.16, -0.06, 0.66).rotation.x = Math.PI;
    add(rig.head, cone(0.035, 0.16, 6), bone, s * 0.08, -0.02, 0.72);
  }
  rig.mouth.position.set(0, -0.08, 0.8);
  // Eyes with red tilak marks, pointed ears, great curling horns.
  c.eye(rig.head, -0.2, 0.42, 0.4, 0.2);
  c.eye(rig.head, 0.2, 0.42, 0.4, 0.2);
  add(rig.head, box(0.05, 0.3, 0.02, 0.01), red, 0, 0.62, 0.36);
  for (const s of [-1, 1]) add(rig.head, box(0.03, 0.22, 0.02, 0.01), red, s * 0.2, 0.2, 0.42);
  for (const s of [-1, 1]) {
    const ear = add(rig.head, cone(0.12, 0.42, 6), hide, s * 0.5, 0.36, -0.05);
    ear.rotation.z = -s * 1.35;
    ear.rotation.x = 0.2;
    const h = add(rig.head, torus(0.5, 0.09, Math.PI * 1.2, 20), horn, s * 0.55, 0.45, -0.15);
    h.rotation.set(-0.3, s * 0.35, s * (Math.PI * 0.55));
    add(rig.head, cone(0.09, 0.4, 8), horn, s * 1.05, 0.95, 0.15).rotation.z = -s * 0.6;
  }
  // Shaggy mane over the skull, neck and shoulders.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const tuft = add(rig.head, cone(0.09, 0.5, 5), dark, Math.sin(a) * 0.36, 0.55 + (i % 3) * 0.08, Math.cos(a) * 0.3 - 0.15);
    tuft.rotation.set(-0.5 + Math.cos(a) * 0.4, 0, Math.sin(a) * 0.9);
  }
  for (let i = 0; i < 14; i++) add(rig.torso, cone(0.11, 0.6, 5), dark, -0.7 + i * 0.11, 1.55 + (i % 2) * 0.1, -0.3 + (i % 3) * 0.08).rotation.x = -1.3;
  // Bead necklaces and carved stone shoulder plates with swirls.
  beadStrand(c, rig.torso, 0.85, 1.25, 0.2, 28, 0.05, c.mat({ color: 0x4a3a2e, roughness: 0.7 }));
  beadStrand(c, rig.torso, 0.9, 1.05, 0.25, 24, 0.06, c.mat({ color: 0x6a5a4a, roughness: 0.7 }));
  for (const s of [-1, 1]) {
    const plate = add(rig.torso, box(0.7, 0.45, 0.7, 0.08), stone, s * 0.95, 1.55, 0);
    plate.rotation.z = -s * 0.3;
    add(rig.torso, torus(0.18, 0.03, Math.PI * 1.7, 16), c.mat({ color: 0x5a5460, roughness: 0.5 }), s * 1.0, 1.72, 0.25).rotation.x = Math.PI / 2 - 0.4;
  }
  // Fists.
  for (const hand of [rig.lHand, rig.rHand]) add(hand, sphere(0.32, 10, 8), hide, 0, -0.05, 0.05).scale.set(1, 0.9, 1.1);
};

// ---- 4. Mohasura: the three-faced deluder (reference: floating six-armed ascetic with white hair) ----
const threeFaced = (rig: AsuraRig, c: DesignContext): void => {
  const skin = c.mat({ color: 0x7a3a28, roughness: 0.55 });
  const white = c.mat({ color: 0xf0f0ea, roughness: 0.85 });
  const jade = c.mat({ color: 0x3aa87a, roughness: 0.3, emissive: 0x145a3a, emissiveIntensity: 0.5 });
  const goldCloth = c.mat({ color: 0xc8a040, roughness: 0.8, side: THREE.DoubleSide });
  const brown = c.mat({ color: 0x3a2a1c, roughness: 0.9, side: THREE.DoubleSide });
  const { add } = c;
  rig.hover = true;
  body(rig, c, { torso: [0.95, 1.05, 0.72], armR: 0.17, legR: 0.19, neckR: 0.18, headR: 0.34, feet: 'bare-narrow', skin, legCloth: brown });
  // Two more faces in profile: skulls merged into the sides of the head.
  for (const s of [-1, 1]) {
    const face = add(rig.head, sphere(0.3, 14, 12), skin, s * 0.3, 0.22, -0.06);
    face.scale.set(0.9, 1.1, 0.95);
    c.eye(rig.head, s * 0.52, 0.3, 0.1, 0.16);
    add(rig.head, box(0.14, 0.1, 0.12, 0.03), skin, s * 0.5, 0.02, 0.1);
  }
  c.eye(rig.head, -0.13, 0.32, 0.36, 0.16);
  c.eye(rig.head, 0.13, 0.32, 0.36, 0.16);
  add(rig.head, sphere(0.05, 8, 6), c.coreMat, 0, 0.48, 0.34); // third-eye jewel
  add(rig.head, box(0.2, 0.1, 0.16, 0.03), skin, 0, 0.0, 0.26);
  // A great mass of white hair streaming upward.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 0.25 + (i % 4) * 0.12;
    const strand = add(rig.head, cone(0.12, 1.2 + (i % 5) * 0.25, 5), white, Math.sin(a) * r, 0.9 + (i % 3) * 0.25, Math.cos(a) * r - 0.05);
    strand.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45 + (i % 2 ? 0.15 : -0.15));
  }
  add(rig.head, sphere(0.42, 14, 10), white, 0, 0.75, -0.05).scale.set(1.1, 0.7, 1.1);
  // Jade beads at the throat; gold sash; patterned trousers as one skirt.
  beadStrand(c, rig.torso, 0.42, 1.36, 0.08, 16, 0.07, jade);
  necklace(c, rig.torso, 0.56, 0.06, 0.12, 0, goldCloth).rotation.x = Math.PI / 2;
  add(rig.torso, box(0.3, 0.6, 0.06, 0.02), goldCloth, 0.35, -0.2, 0.55);
  add(rig.hips, cyl(0.58, 0.5, 1.3, 14, true), brown, 0, -0.7, 0);
  // Four extra arms, two per side, on the torso behind and below the main pair.
  for (const [y, z, rz] of [[1.08, -0.15, 0.35], [0.82, -0.28, 0.7]] as const) {
    const pair: [THREE.Group, THREE.Group] = [new THREE.Group(), new THREE.Group()];
    for (const [g, side] of [[pair[0], -1], [pair[1], 1]] as const) {
      g.position.set(side * 0.66, y, z);
      g.rotation.z = -side * rz;
      rig.torso.add(g);
      add(g, capsule(0.15, 0.7), skin, 0, -0.5, 0);
      const fore = add(g, capsule(0.13, 0.65), skin, 0, -1.15, 0.15);
      fore.rotation.x = -0.6;
      add(g, sphere(0.14, 8, 6), skin, 0, -1.55, 0.4);
    }
    rig.extraArms.push(pair);
  }
  // Golden scarves coiling around him.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ribbon(rig, rig.torso, goldCloth, 0.36, 2.6, Math.sin(a) * 1.1, 1.5 - i * 0.3, Math.cos(a) * 1.1, 0.9 + i * 0.4, a + Math.PI / 2, 0.6);
  }
};

// ---- 5. Ahamkarasura: the fire king (reference: horned, crowned rakshasa in gold, fire behind him) ----
const fireKing = (rig: AsuraRig, c: DesignContext): void => {
  const skin = c.mat({ color: 0x8a4a2a, roughness: 0.55 });
  const gold = goldOf(c);
  const hair = c.mat({ color: 0x1a1210, roughness: 0.75 });
  const bone = c.mat({ color: 0xe8dcc0, roughness: 0.6 });
  const horn = c.mat({ color: 0x8a6a3a, roughness: 0.45, metalness: 0.2 });
  const redCloth = c.mat({ color: 0x8a2018, roughness: 0.85, side: THREE.DoubleSide });
  const { add } = c;
  body(rig, c, { torso: [1.45, 1.05, 1.05], belly: 0.5, armR: 0.28, legR: 0.3, neckR: 0.3, headR: 0.4, feet: 'bare', skin, legCloth: redCloth });
  // Crown: gold band, tiered spire, jewels; two great horns from the band.
  add(rig.head, torus(0.4, 0.06, Math.PI * 2, 24), gold, 0, 0.6, 0).rotation.x = Math.PI / 2;
  add(rig.head, cyl(0.28, 0.4, 0.3, 12), gold, 0, 0.78, -0.02);
  add(rig.head, cone(0.26, 0.5, 8), gold, 0, 1.15, -0.02);
  add(rig.head, cone(0.12, 0.45, 8), gold, 0, 1.55, -0.02);
  add(rig.head, sphere(0.07, 8, 6), c.coreMat, 0, 0.82, 0.32);
  for (const s of [-1, 1]) {
    const h = add(rig.head, torus(0.55, 0.1, Math.PI * 0.9, 18), horn, s * 0.45, 0.55, -0.1);
    h.rotation.set(0.1, s * 0.5, s * Math.PI * 0.42);
    add(rig.head, cone(0.1, 0.42, 8), horn, s * 0.98, 1.25, 0.05).rotation.z = -s * 0.25;
  }
  // Long dark curling hair, moustache, fangs, wide eyes.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    if (Math.abs(a - Math.PI) < 0.9) continue;
    add(rig.head, sphere(0.14, 8, 6), hair, Math.sin(a) * 0.4, 0.05 - (i % 3) * 0.22, Math.cos(a) * 0.3 - 0.12).scale.set(1, 1.6, 1);
  }
  for (const s of [-1, 1]) add(rig.head, torus(0.14, 0.04, Math.PI, 12), hair, s * 0.13, 0.08, 0.4).rotation.set(0, 0, s > 0 ? Math.PI : 0);
  for (const s of [-1, 1]) {
    add(rig.head, cone(0.05, 0.28, 6), bone, s * 0.16, -0.08, 0.38);
    add(rig.head, cone(0.03, 0.14, 6), bone, s * 0.06, 0.02, 0.4).rotation.x = Math.PI;
  }
  add(rig.head, box(0.36, 0.14, 0.2, 0.04), skin, 0, -0.06, 0.28);
  c.eye(rig.head, -0.15, 0.32, 0.38, 0.24);
  c.eye(rig.head, 0.15, 0.32, 0.38, 0.24);
  for (const s of [-1, 1]) add(rig.head, torus(0.07, 0.015, Math.PI * 2, 12), gold, s * 0.42, 0.1, 0.02);
  // Gold at the throat and arms; belt plate; red dhoti; claws.
  necklace(c, rig.torso, 0.5, 0.05, 1.3, 0.1, gold);
  necklace(c, rig.torso, 0.62, 0.045, 1.14, 0.14, gold);
  add(rig.torso, cyl(0.16, 0.16, 0.05, 12), gold, 0, 0.72, 0.68).rotation.x = Math.PI / 2;
  for (const arm of [rig.lArm, rig.rArm]) {
    armlet(c, arm, -0.3, 0.31, gold);
    armlet(c, arm, -1.45, 0.26, gold);
  }
  add(rig.torso, cyl(0.24, 0.24, 0.08, 12), gold, 0, 0.1, 0.72).rotation.x = Math.PI / 2;
  add(rig.hips, cyl(0.72, 0.82, 1.1, 16, true), redCloth, 0, -0.55, 0);
  for (const hand of [rig.lHand, rig.rHand]) {
    for (let k = -1; k <= 1; k++) {
      const claw = add(hand, cone(0.045, 0.5, 6), bone, k * 0.12, -0.05, 0.35);
      claw.rotation.x = Math.PI / 2 - 0.25;
    }
  }
};

export const DESIGNS: Record<DesignId, (rig: AsuraRig, c: DesignContext) => void> = {
  'blade-warrior': bladeWarrior,
  wrestler,
  buffalo,
  'three-faced': threeFaced,
  'fire-king': fireKing,
};
