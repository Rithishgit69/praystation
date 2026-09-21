import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SeededRandom } from '@/util/random';
import { mergeStaticChildren } from '@/util/merge';
import { clamp, damp, lerp } from '@/util/math';
import type { LocomotionState } from './PlayerController';

export type HeroVariant = 'male' | 'female';

/** The traveller: dark messy hair, crimson scarf, grey-brown coat, backpack. */
const MALE = {
  hair: 0x141116,
  skin: 0xc48b62,
  scarf: 0xb3202b,
  scarfDark: 0x7d1520,
  coat: 0x5c554a,
  coatTrim: 0x4a433a,
  shirt: 0x8a8577,
  trousers: 0x3b3733,
  leather: 0x3e2d22,
  boots: 0x2b2420,
  metal: 0x9a9a92,
};

/** The traveller: long braid, deep-teal kurti with gold trim, saffron dupatta, plum churidar, sandals. */
const FEMALE = {
  hair: 0x1a0f0c,
  skin: 0xc9946a,
  scarf: 0xe0842a,
  scarfDark: 0xb0601a,
  coat: 0x1f5f6a,
  coatTrim: 0xd9b370,
  shirt: 0x2a7a86,
  trousers: 0x2e2a33,
  leather: 0x4a3222,
  boots: 0x4a3222,
  metal: 0xd9b370,
};

const mat = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * Procedural traveller in two versions — the same rig, animation and weapon hold; different build,
 * hair and outfit. Fully animated in code (walk/jog/sprint cycle, idle breathing, landing squash,
 * crouch, scarf and braid flutter). Origin is at the feet; +Z is forward for the rig.
 */
export class CharacterMesh {
  readonly root = new THREE.Group();
  readonly variant: HeroVariant;
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly lThigh = new THREE.Group();
  private readonly rThigh = new THREE.Group();
  private readonly lShin = new THREE.Group();
  private readonly rShin = new THREE.Group();
  private readonly lUpperArm = new THREE.Group();
  private readonly rUpperArm = new THREE.Group();
  private readonly lForearm = new THREE.Group();
  private readonly rForearm = new THREE.Group();
  private braid: THREE.Group | null = null;
  private readonly scarfTails: THREE.Mesh[] = [];
  private readonly scarfTailBase: Float32Array[] = [];
  private phase = 0;
  private blend = { walk: 0, jog: 0, sprint: 0, crouch: 0, air: 0, land: 0 };
  private breathe = 0;
  /** When true the arms hold a weapon in front of the chest. */
  holdWeapon = false;
  /** Aim state while a weapon is held: camera pitch to follow, which weapon, bow draw and ADS blend. */
  aim: { pitch: number; weapon: 'astra' | 'dhanush' | 'chakra' | 'vajra'; draw: number; aiming: number } | null = null;
  get rightHand(): THREE.Group {
    return this.rForearm;
  }
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(variant: HeroVariant = 'male') {
    this.variant = variant;
    const female = variant === 'female';
    const C = female ? FEMALE : MALE;
    const rng = new SeededRandom(7);
    const m = (c: number, r?: number, mt?: number): THREE.MeshStandardMaterial => {
      const x = mat(c, r, mt);
      this.materials.push(x);
      return x;
    };
    const hairMat = m(C.hair, female ? 0.55 : 0.62);
    const skinMat = m(C.skin, 0.6);
    const scarfMat = m(C.scarf, 0.9);
    const scarfMat2 = m(C.scarfDark, 0.9);
    const coatMat = m(C.coat, 0.92);
    const trimMat = m(C.coatTrim, female ? 0.45 : 0.92, female ? 0.6 : 0);
    const trouserMat = m(C.trousers, 0.9);
    const leatherMat = m(C.leather, 0.7);
    const bootMat = m(C.boots, 0.75);
    const metalMat = m(C.metal, 0.45, 0.8);
    const gemMat = m(0xc8202a, 0.3);
    scarfMat.side = THREE.DoubleSide;
    scarfMat2.side = THREE.DoubleSide;

    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Hips / pelvis.
    this.hips.position.y = female ? 0.93 : 0.95;
    this.root.add(this.hips);
    add(this.hips, new THREE.CapsuleGeometry(female ? 0.175 : 0.17, 0.1, 6, 12), trouserMat, 0, 0.02, 0).scale.set(1, 0.7, 0.85);

    // Legs (thigh pivot at hip, shin pivot at knee).
    const legs: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lThigh, this.lShin, female ? -0.1 : -0.11],
      [this.rThigh, this.rShin, female ? 0.1 : 0.11],
    ];
    for (const [thigh, shin, x] of legs) {
      thigh.position.set(x, -0.02, 0);
      this.hips.add(thigh);
      add(thigh, new THREE.CapsuleGeometry(female ? 0.08 : 0.085, 0.3, 6, 10), trouserMat, 0, -0.22, 0);
      shin.position.set(0, -0.45, 0);
      thigh.add(shin);
      add(shin, new THREE.CapsuleGeometry(female ? 0.062 : 0.07, 0.3, 6, 10), trouserMat, 0, -0.2, 0);
      if (female) {
        // Churidar gathers at the ankle, a gold anklet, flat sandals.
        add(shin, new THREE.TorusGeometry(0.068, 0.012, 6, 14), metalMat, 0, -0.35, 0).rotation.x = Math.PI / 2;
        add(shin, new RoundedBoxGeometry(0.13, 0.05, 0.25, 3, 0.02), bootMat, 0, -0.455, 0.04);
        add(shin, new RoundedBoxGeometry(0.11, 0.03, 0.06, 2, 0.01), leatherMat, 0, -0.42, 0.06);
      } else {
        const boot = add(shin, new RoundedBoxGeometry(0.15, 0.12, 0.27, 3, 0.03), bootMat, 0, -0.42, 0.04);
        boot.scale.set(1, 1, 1);
        add(shin, new THREE.CylinderGeometry(0.085, 0.09, 0.12, 10), bootMat, 0, -0.33, 0);
      }
    }

    // Torso.
    this.torso.position.y = 0.12;
    this.hips.add(this.torso);
    const chest = add(this.torso, new THREE.CapsuleGeometry(female ? 0.185 : 0.2, 0.28, 6, 14), coatMat, 0, 0.26, 0);
    chest.scale.set(female ? 0.95 : 1.05, 1, female ? 0.74 : 0.78);
    if (female) {
      // Kurti: fitted bodice, flared hem to mid-thigh with a gold border, a gold neckline.
      const hem = add(this.torso, new THREE.CylinderGeometry(0.2, 0.31, 0.62, 18, 1, true), coatMat, 0, -0.2, 0);
      hem.scale.set(1, 1, 0.82);
      (hem.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      add(this.torso, new THREE.TorusGeometry(0.31, 0.012, 6, 24), trimMat, 0, -0.5, 0).rotation.x = Math.PI / 2;
      add(this.torso, new THREE.TorusGeometry(0.21, 0.016, 6, 22), trimMat, 0, 0.1, 0).rotation.x = Math.PI / 2;
      add(this.torso, new THREE.TorusGeometry(0.09, 0.012, 6, 16), trimMat, 0, 0.5, 0.06).rotation.x = Math.PI / 2 - 0.5;
      // A slim waist cord and a small satchel at the left hip instead of a backpack.
      add(this.torso, new THREE.TorusGeometry(0.2, 0.012, 6, 20), leatherMat, 0, 0.02, 0).rotation.x = Math.PI / 2;
      const satchel = add(this.torso, new RoundedBoxGeometry(0.16, 0.13, 0.07, 3, 0.02), leatherMat, -0.2, -0.06, -0.08);
      satchel.rotation.y = 0.4;
      const strap = add(this.torso, new RoundedBoxGeometry(0.035, 0.5, 0.025, 2, 0.008), leatherMat, -0.02, 0.24, 0.16);
      strap.rotation.set(-0.1, 0, 0.5);
    } else {
      // Coat skirt flaring from the waist.
      const skirt = add(this.torso, new THREE.CylinderGeometry(0.23, 0.29, 0.5, 16, 1, true), coatMat, 0, -0.14, 0);
      skirt.scale.set(1, 1, 0.8);
      (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      add(this.torso, new THREE.TorusGeometry(0.215, 0.02, 6, 20), trimMat, 0, 0.1, 0).rotation.x = Math.PI / 2;
      // Belt + buckle.
      add(this.torso, new THREE.TorusGeometry(0.21, 0.018, 6, 20), leatherMat, 0, 0.0, 0).rotation.x = Math.PI / 2;
      add(this.torso, new RoundedBoxGeometry(0.05, 0.04, 0.02, 2, 0.008), metalMat, 0, 0.0, 0.19);
    }
    // Shoulders.
    const shoulderX = female ? 0.2 : 0.22;
    add(this.torso, new THREE.SphereGeometry(female ? 0.08 : 0.095, 12, 10), coatMat, -shoulderX, 0.44, 0);
    add(this.torso, new THREE.SphereGeometry(female ? 0.08 : 0.095, 12, 10), coatMat, shoulderX, 0.44, 0);

    if (!female) {
      // Backpack on the back (-Z) with straps over the shoulders.
      const pack = add(this.torso, new RoundedBoxGeometry(0.3, 0.36, 0.16, 4, 0.04), leatherMat, 0, 0.24, -0.24);
      pack.rotation.x = 0.05;
      add(this.torso, new RoundedBoxGeometry(0.26, 0.1, 0.17, 3, 0.03), leatherMat, 0, 0.44, -0.235);
      add(this.torso, new RoundedBoxGeometry(0.12, 0.09, 0.05, 2, 0.015), leatherMat, 0, 0.2, -0.335);
      for (const x of [-0.11, 0.11]) {
        const strap = add(this.torso, new RoundedBoxGeometry(0.05, 0.34, 0.03, 2, 0.01), leatherMat, x, 0.3, 0.17);
        strap.rotation.x = -0.22;
        const top = add(this.torso, new RoundedBoxGeometry(0.05, 0.03, 0.28, 2, 0.01), leatherMat, x, 0.47, -0.02);
        top.rotation.x = 0.1;
        add(this.torso, new THREE.BoxGeometry(0.06, 0.03, 0.03), metalMat, x, 0.16, 0.2);
      }
    }

    // Arms.
    const arms: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lUpperArm, this.lForearm, -1],
      [this.rUpperArm, this.rForearm, 1],
    ];
    for (const [upper, fore, side] of arms) {
      upper.position.set(side * (female ? 0.23 : 0.25), 0.42, 0);
      this.torso.add(upper);
      add(upper, new THREE.CapsuleGeometry(female ? 0.058 : 0.065, 0.24, 6, 10), coatMat, 0, -0.18, 0);
      fore.position.set(0, -0.32, 0);
      upper.add(fore);
      add(fore, new THREE.CapsuleGeometry(female ? 0.05 : 0.055, 0.22, 6, 10), female ? skinMat : coatMat, 0, -0.14, 0);
      if (female) {
        // Three-quarter sleeve edge and bangles.
        add(fore, new THREE.CylinderGeometry(0.056, 0.058, 0.05, 10), trimMat, 0, -0.02, 0);
        for (let i = 0; i < 3; i++) add(fore, new THREE.TorusGeometry(0.056, 0.008, 6, 14), metalMat, 0, -0.22 - i * 0.02, 0).rotation.x = Math.PI / 2;
      } else add(fore, new THREE.CylinderGeometry(0.06, 0.065, 0.06, 10), trimMat, 0, -0.27, 0);
      add(fore, new THREE.SphereGeometry(0.055, 10, 8), skinMat, 0, -0.33, 0).scale.set(0.9, 1.15, 0.7);
    }

    // Neck, head, hair.
    add(this.torso, new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10), skinMat, 0, 0.55, 0);
    this.head.position.set(0, 0.62, 0);
    this.torso.add(this.head);
    const skull = add(this.head, new THREE.SphereGeometry(female ? 0.12 : 0.125, 18, 16), skinMat, 0, 0.1, 0);
    skull.scale.set(0.92, 1.05, 0.98);
    add(this.head, new THREE.SphereGeometry(0.035, 8, 6), skinMat, -0.11, 0.09, 0).scale.set(0.5, 1, 0.8);
    add(this.head, new THREE.SphereGeometry(0.035, 8, 6), skinMat, 0.11, 0.09, 0).scale.set(0.5, 1, 0.8);
    const tuftGeo = new THREE.ConeGeometry(0.05, 0.15, 7, 1);
    tuftGeo.translate(0, 0.05, 0);
    if (female) {
      // Smooth hair cap, centre parting, a low knot at the nape, and a long braid down the back.
      const cap = add(this.head, new THREE.SphereGeometry(0.135, 20, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat, 0, 0.115, -0.01);
      cap.scale.set(1.02, 1.04, 1.06);
      for (const side of [-1, 1]) {
        const sweep = add(this.head, new THREE.SphereGeometry(0.06, 10, 8), hairMat, side * 0.09, 0.19, 0.08);
        sweep.scale.set(1.2, 0.5, 1.1);
      }
      add(this.head, new THREE.SphereGeometry(0.07, 12, 10), hairMat, 0, 0.04, -0.12).scale.set(1.1, 0.9, 0.9); // the knot
      const braid = new THREE.Group();
      braid.position.set(0, 0.02, -0.14);
      this.head.add(braid);
      this.braid = braid;
      for (let i = 0; i < 8; i++) {
        const seg = add(braid, new THREE.SphereGeometry(0.045 - i * 0.002, 10, 8), hairMat, (i % 2 ? 1 : -1) * 0.012, -0.07 * i - 0.02, -0.01 * i);
        seg.scale.set(1, 1.35, 1);
      }
      add(braid, new THREE.SphereGeometry(0.02, 8, 6), trimMat, 0, -0.6, -0.08); // gold tie
      // Bindi and earrings.
      add(this.head, new THREE.SphereGeometry(0.011, 8, 6), gemMat, 0, 0.145, 0.115);
      for (const side of [-1, 1]) add(this.head, new THREE.TorusGeometry(0.018, 0.005, 6, 12), metalMat, side * 0.125, 0.05, 0.0);
    } else {
      // Hair cap plus messy tufts on the upper hemisphere and the nape.
      const cap = add(this.head, new THREE.SphereGeometry(0.14, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat, 0, 0.115, -0.01);
      cap.scale.set(1.0, 1.02, 1.04);
      for (let i = 0; i < 26; i++) {
        const theta = rng.range(0, Math.PI * 2);
        const phi = rng.range(0.08, 1.25);
        const r = 0.13;
        const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
        const tuft = new THREE.Mesh(tuftGeo, hairMat);
        tuft.position.copy(dir).multiplyScalar(r).add(new THREE.Vector3(0, 0.115, -0.01));
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3(rng.range(-0.5, 0.5), rng.range(-0.2, 0.4), rng.range(-0.5, 0.2))).normalize());
        tuft.quaternion.copy(q);
        tuft.scale.set(rng.range(0.7, 1.2), rng.range(0.8, 1.5), rng.range(0.7, 1.2));
        tuft.castShadow = true;
        this.head.add(tuft);
      }
      // Fringe hanging over the brow and nape hair.
      for (let i = 0; i < 6; i++) {
        const tuft = new THREE.Mesh(tuftGeo, hairMat);
        tuft.position.set(rng.range(-0.1, 0.1), 0.19, 0.09);
        tuft.rotation.set(Math.PI * 0.62 + rng.range(-0.2, 0.2), 0, rng.range(-0.4, 0.4));
        this.head.add(tuft);
      }
      for (let i = 0; i < 5; i++) {
        const tuft = new THREE.Mesh(tuftGeo, hairMat);
        tuft.position.set(rng.range(-0.08, 0.08), 0.04, -0.1);
        tuft.rotation.set(-Math.PI * 0.85 + rng.range(-0.25, 0.25), 0, rng.range(-0.3, 0.3));
        this.head.add(tuft);
      }
    }

    // Scarf (male) / dupatta (female): wrapped at the neck plus two tails down the back.
    if (female) {
      // The dupatta crosses the chest from the right shoulder to the left hip and trails behind.
      const band = add(this.torso, new THREE.TorusGeometry(0.2, 0.03, 8, 24, Math.PI * 1.05), scarfMat, 0, 0.2, 0.0);
      band.rotation.set(Math.PI / 2, 0.35, -0.9);
      band.scale.set(1, 1.25, 1);
      const wrap = add(this.torso, new THREE.TorusGeometry(0.13, 0.04, 8, 22), scarfMat2, 0, 0.5, -0.01);
      wrap.rotation.x = Math.PI / 2 + 0.1;
      wrap.scale.set(1, 1.1, 0.9);
    } else {
      const wrap = add(this.torso, new THREE.TorusGeometry(0.135, 0.055, 8, 22), scarfMat, 0, 0.53, -0.01);
      wrap.rotation.x = Math.PI / 2 + 0.12;
      wrap.scale.set(1, 1.15, 0.9);
      const wrap2 = add(this.torso, new THREE.TorusGeometry(0.15, 0.045, 8, 22), scarfMat2, 0, 0.48, -0.02);
      wrap2.rotation.x = Math.PI / 2 - 0.15;
      wrap2.scale.set(1.05, 1.1, 0.85);
    }
    const tailLen = female ? 0.56 : 0.42;
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(female ? 0.14 : 0.11, tailLen, 1, 8);
      geo.translate(0, -tailLen / 2, 0);
      const tail = new THREE.Mesh(geo, side < 0 ? scarfMat : scarfMat2);
      tail.position.set(side * 0.07, 0.5, -0.17);
      tail.rotation.set(0.12, side * 0.25, side * 0.08);
      tail.castShadow = true;
      this.torso.add(tail);
      this.scarfTails.push(tail);
      this.scarfTailBase.push(new Float32Array(geo.getAttribute('position').array));
    }

    const keep = new Set<THREE.Object3D>(this.scarfTails);
    const groups = [this.hips, this.torso, this.head, this.lThigh, this.rThigh, this.lShin, this.rShin, this.lUpperArm, this.rUpperArm, this.lForearm, this.rForearm];
    if (this.braid) {
      keep.add(this.braid);
      groups.push(this.braid);
    }
    for (const g of groups) mergeStaticChildren(g, keep);
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  /** Apply the locomotion state; called every rendered frame. */
  animate(dt: number, state: LocomotionState, horizontalSpeed: number, sprintSpeed: number, elapsed: number): void {
    const tgt = {
      walk: state === 'walk' ? 1 : 0,
      jog: state === 'jog' ? 1 : 0,
      sprint: state === 'sprint' ? 1 : 0,
      crouch: state === 'crouch' || state === 'crouch-move' ? 1 : 0,
      air: state === 'air' ? 1 : 0,
      land: state === 'land-hard' ? 1 : state === 'land-soft' ? 0.4 : 0,
    };
    const b = this.blend;
    for (const k of Object.keys(b) as Array<keyof typeof b>) b[k] = damp(b[k], tgt[k], k === 'land' ? 18 : 10, dt);
    const moving = clamp(horizontalSpeed / 1.2, 0, 1);
    const stride = lerp(1.1, 1.9, clamp(horizontalSpeed / sprintSpeed, 0, 1));
    if (horizontalSpeed > 0.05) this.phase += (horizontalSpeed / stride) * Math.PI * 2 * dt;
    else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 8, dt);
    const p = this.phase;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const swing = lerp(0.42, 0.95, b.sprint) * moving * (1 - b.crouch * 0.5);
    const legL = s * swing;
    const legR = -s * swing;
    this.lThigh.rotation.x = legL;
    this.rThigh.rotation.x = legR;
    // Knees bend when the leg swings back.
    this.lShin.rotation.x = Math.max(0, -c * swing * 1.2) + 0.08 + b.crouch * 0.9 + b.air * 0.6;
    this.rShin.rotation.x = Math.max(0, c * swing * 1.2) + 0.08 + b.crouch * 0.9 + b.air * 0.6;
    const armSwing = swing * 0.7;
    if (this.holdWeapon) {
      // Two-handed hold in front of the chest, pitched with the camera so the weapon points where the
      // crosshair is; the bow is held out to the left and its string arm draws back.
      const a = this.aim;
      // Camera pitch is positive looking down; the arms lower with it (less negative x).
      const pitch = a ? a.pitch * 0.75 : 0;
      const bobArm = Math.sin(p) * 0.04 * moving;
      const bow = a?.weapon === 'dhanush';
      const draw = bow ? a.draw : 0;
      const ads = a?.aiming ?? 0;
      if (bow) {
        this.rUpperArm.rotation.x = -1.35 + pitch + bobArm;
        this.rUpperArm.rotation.z = -0.15;
        this.rForearm.rotation.x = -0.25 - draw * 0.2;
        this.lUpperArm.rotation.x = -1.45 + pitch + bobArm;
        this.lUpperArm.rotation.z = 0.25 - draw * 0.3;
        this.lForearm.rotation.x = -0.7 - draw * 1.1;
      } else {
        this.rUpperArm.rotation.x = -1.05 - ads * 0.08 + pitch + bobArm;
        this.rUpperArm.rotation.z = -0.35 + ads * 0.12;
        this.rForearm.rotation.x = -0.75 + ads * 0.05;
        this.lUpperArm.rotation.x = -1.25 - ads * 0.06 + pitch + bobArm;
        this.lUpperArm.rotation.z = 0.55 - ads * 0.15;
        this.lForearm.rotation.x = -1.15;
      }
    } else {
      this.lUpperArm.rotation.x = -s * armSwing + b.air * -0.6 + b.sprint * 0.2;
      this.rUpperArm.rotation.x = s * armSwing + b.air * -0.6 + b.sprint * 0.2;
      this.lUpperArm.rotation.z = 0.12 + b.sprint * 0.1;
      this.rUpperArm.rotation.z = -0.12 - b.sprint * 0.1;
      this.lForearm.rotation.x = -0.35 - Math.max(0, -s) * armSwing * 0.8 - b.sprint * 0.7;
      this.rForearm.rotation.x = -0.35 - Math.max(0, s) * armSwing * 0.8 - b.sprint * 0.7;
    }

    // Body: bob, lean, crouch, land squash, idle breathing.
    this.breathe = Math.sin(elapsed * 1.4) * 0.5 + 0.5;
    const bob = Math.abs(Math.sin(p)) * lerp(0.02, 0.05, b.sprint) * moving;
    const crouchDrop = b.crouch * 0.42;
    const landDrop = b.land * 0.22;
    const hipsBase = this.variant === 'female' ? 0.93 : 0.95;
    this.hips.position.y = hipsBase + bob - crouchDrop - landDrop;
    this.hips.rotation.y = -s * 0.08 * moving;
    this.hips.rotation.x = 0;
    this.torso.rotation.x = lerp(0.03, 0.26, b.sprint) * moving + b.crouch * 0.55 + b.land * 0.35 + (1 - moving) * this.breathe * 0.015;
    this.torso.rotation.y = s * 0.1 * moving;
    this.torso.scale.y = 1 + (1 - moving) * this.breathe * 0.012;
    this.head.rotation.x = -this.torso.rotation.x * 0.6;
    this.head.rotation.y = -this.torso.rotation.y * 0.8;
    if (this.holdWeapon && this.aim) {
      // Lean the torso and head with the aim so the whole figure tracks the crosshair.
      this.torso.rotation.x += this.aim.pitch * 0.12;
      this.head.rotation.x += this.aim.pitch * 0.35;
    }

    // Scarf / dupatta tails: sway with stride and lift back with speed.
    const lift = clamp(horizontalSpeed / sprintSpeed, 0, 1);
    for (let i = 0; i < this.scarfTails.length; i++) {
      const tail = this.scarfTails[i] as THREE.Mesh;
      const base = this.scarfTailBase[i] as Float32Array;
      const pos = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const side = i === 0 ? -1 : 1;
      const len = this.variant === 'female' ? 0.56 : 0.42;
      for (let v = 0; v < pos.count; v++) {
        const bx = base[v * 3] as number;
        const by = base[v * 3 + 1] as number;
        const bz = base[v * 3 + 2] as number;
        const d = -by / len; // 0 at neck, 1 at tip
        const wave = Math.sin(elapsed * 6 + d * 4 + side) * 0.03 * (0.4 + lift) * d;
        arr[v * 3] = bx + wave + side * d * d * 0.02;
        arr[v * 3 + 1] = by + d * d * lift * 0.12;
        arr[v * 3 + 2] = bz - d * d * (0.06 + lift * 0.28) + Math.cos(elapsed * 5 + d * 3) * 0.02 * d;
      }
      pos.needsUpdate = true;
      tail.geometry.computeVertexNormals();
    }
    // The braid swings with the stride and streams back at speed.
    if (this.braid) {
      this.braid.rotation.x = -0.15 - lift * 0.55 - b.air * 0.4;
      this.braid.rotation.z = Math.sin(elapsed * 2.6) * 0.04 + s * 0.12 * moving;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
