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
/** Height of the dodge-roll pivot above the feet. */
const ROLL_PIVOT_Y = 0.62;
/** Leg bone lengths (hip → knee, knee → sole) and the planted share of each foot's cycle. */
const THIGH = 0.45;
const SHIN = 0.48;
/* stance share and half stride vary with speed: a walk plants long, a sprint barely touches. */
const TWO_PI = Math.PI * 2;
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export class CharacterMesh {
  readonly root = new THREE.Group();
  readonly variant: HeroVariant;
  /** Roll pivot at mid-body: the whole figure turns around it during a dodge. */
  private readonly roll = new THREE.Group();
  private readonly hips = new THREE.Group();
  /** The legs' parent: turned toward the direction of travel while the torso keeps facing the aim. */
  private readonly legs = new THREE.Group();
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
  /** Gait cycle in steps (the left foot at 0, the right at 0.5); advances by distance travelled. */
  private gait = 0;
  private blend = { walk: 0, jog: 0, sprint: 0, crouch: 0, air: 0, land: 0, dodge: 0, pray: 0 };
  /** Kneel with joined hands (the climax): blended in over ~1.5 s while true. */
  pray = false;
  /** World point the head turns toward when no weapon is out (the villain during its card); null to look ahead. */
  lookTarget: THREE.Vector3 | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private breathe = 0;
  private legYaw = 0;
  private lean = 0;
  private turnLean = 0;
  private speedSmooth = 0;
  private recoil = 0;
  private flinchAmount = 0;
  private readonly rollAxis = new THREE.Vector3(1, 0, 0);
  /** Motion cues from the controller (all optional; zero when absent). */
  motion: { dodge: number; dodgeAngle: number; moveAngle: number; yawRate: number } = { dodge: 0, dodgeAngle: 0, moveAngle: 0, yawRate: 0 };
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

    // Hips / pelvis (under the roll pivot, which sits at mid-body).
    this.roll.position.y = ROLL_PIVOT_Y;
    this.root.add(this.roll);
    this.hips.position.y = (female ? 0.93 : 0.95) - ROLL_PIVOT_Y;
    this.roll.add(this.hips);
    this.hips.add(this.legs);
    add(this.hips, new THREE.CapsuleGeometry(female ? 0.175 : 0.17, 0.1, 6, 12), trouserMat, 0, 0.02, 0).scale.set(1, 0.7, 0.85);

    // Legs (thigh pivot at hip, shin pivot at knee).
    const legs: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lThigh, this.lShin, female ? -0.1 : -0.11],
      [this.rThigh, this.rShin, female ? 0.1 : 0.11],
    ];
    for (const [thigh, shin, x] of legs) {
      thigh.position.set(x, -0.02, 0);
      this.legs.add(thigh);
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
  /** A shot was fired: the arms and shoulders kick back for a moment. */
  kick(amount = 1): void {
    this.recoil = Math.min(1.5, this.recoil + amount);
  }

  /** The hero was hit: a short flinch. */
  flinch(): void {
    this.flinchAmount = 1;
  }

  animate(dt: number, state: LocomotionState, horizontalSpeed: number, sprintSpeed: number, elapsed: number): void {
    const mo = this.motion;
    const dodging = mo.dodge > 0;
    const tgt = {
      walk: state === 'walk' ? 1 : 0,
      jog: state === 'jog' ? 1 : 0,
      sprint: state === 'sprint' ? 1 : 0,
      crouch: state === 'crouch' || state === 'crouch-move' ? 1 : 0,
      air: state === 'air' && !dodging ? 1 : 0,
      land: state === 'land-hard' ? 1 : state === 'land-soft' ? 0.4 : 0,
      dodge: dodging ? 1 : 0,
      pray: this.pray ? 1 : 0,
    };
    const b = this.blend;
    for (const k of Object.keys(b) as Array<keyof typeof b>) b[k] = damp(b[k], tgt[k], k === 'land' ? 18 : k === 'dodge' ? 22 : k === 'pray' ? 2.2 : 10, dt);
    this.recoil = Math.max(0, this.recoil - dt * 11);
    this.flinchAmount = Math.max(0, this.flinchAmount - dt * 4);
    this.speedSmooth = damp(this.speedSmooth, horizontalSpeed, 6, dt);
    // Lean forward with acceleration, back when braking; lean into turns.
    const accel = (horizontalSpeed - this.speedSmooth) * 0.6;
    this.lean = damp(this.lean, clamp(accel * 0.08, -0.12, 0.16), 8, dt);
    this.turnLean = damp(this.turnLean, clamp(-mo.yawRate * 0.05, -0.14, 0.14) * clamp(horizontalSpeed / 3, 0, 1), 8, dt);

    // Gait phase: driven by distance so steps never slide. Moving backwards runs the cycle in reverse;
    // the legs turn (up to ~70°) toward the direction of travel while the torso keeps facing forward.
    const moving = clamp(horizontalSpeed / 1.2, 0, 1) * (1 - b.dodge);
    const backward = Math.abs(mo.moveAngle) > Math.PI * 0.6;
    const legTarget = horizontalSpeed > 0.3 ? clamp(backward ? wrapAngle(mo.moveAngle + Math.PI) : mo.moveAngle, -1.2, 1.2) : 0;
    this.legYaw = damp(this.legYaw, legTarget, 10, dt);
    this.legs.rotation.y = this.legYaw;
    // Feet plant: each foot has a stance (planted, moving back under the body at exactly the body's
    // speed) and a swing (an arc forward). The cycle advances by distance, so nothing slides. The legs
    // are then solved with two-bone IK to reach the foot, which gives real knee bends and heel strikes.
    const speedK = clamp(horizontalSpeed / sprintSpeed, 0, 1);
    const stance = lerp(0.62, 0.38, speedK);
    const half = lerp(0.42, 0.78, speedK); // the foot travels from +half to −half while planted
    if (horizontalSpeed > 0.05 && !dodging) this.gait += ((stance * horizontalSpeed) / (2 * half)) * dt * (backward ? -1 : 1);
    else {
      // Coming to rest: finish the step to the nearest planted pose (both feet under the body).
      const rest = Math.round(this.gait * 2) / 2;
      this.gait = damp(this.gait, rest, 8, dt);
    }
    const p = this.gait * TWO_PI;
    const s = Math.sin(p);
    const sa = Math.cos(p); // arm / hip swing: at its extreme when a foot lands
    const swing = lerp(0.44, 0.98, b.sprint) * moving * (1 - b.crouch * 0.5);
    const footLift = lerp(0.07, 0.16, speedK);
    const tuck = b.air * 0.55 + b.dodge * 1.1;
    const kneel = b.pray;
    // Body height this frame (the IK needs it): bob at double time, drops for crouch / landing / roll / kneel.
    const bob = Math.abs(s) * lerp(0.02, 0.055, b.sprint) * moving;
    const hipsBase = (this.variant === 'female' ? 0.93 : 0.95) - ROLL_PIVOT_Y;
    this.hips.position.y = hipsBase + bob - b.crouch * 0.42 - b.land * 0.22 - b.dodge * 0.3 - kneel * 0.44;
    const hipsHeight = ROLL_PIVOT_Y + this.hips.position.y; // hip joint height above the soles
    const gaitWeight = clamp(1 - b.air - b.dodge - b.pray - b.crouch, 0, 1);
    const legsIK: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lThigh, this.lShin, 0],
      [this.rThigh, this.rShin, 0.5],
    ];
    for (const [thigh, shin, offset] of legsIK) {
      // Foot position along the direction of travel (+z is forward in the rig).
      const phi = ((this.gait + offset) % 1 + 1) % 1;
      let z: number;
      let y = 0;
      if (phi < stance) z = half - (2 * half * phi) / stance;
      else {
        const u = (phi - stance) / (1 - stance);
        z = -half + 2 * half * smoothstep(u);
        y = footLift * Math.sin(Math.PI * u);
      }
      z *= moving;
      y *= moving;
      // Two-bone IK in the sagittal plane: hip → knee (THIGH) → sole (SHIN).
      const ty = -(hipsHeight - 0.02) + y;
      const tz = z;
      const d = clamp(Math.hypot(ty, tz), Math.abs(THIGH - SHIN) + 0.01, THIGH + SHIN - 0.005);
      const gamma = Math.atan2(tz, -ty);
      const delta = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
      const knee = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
      // Positive x rotation swings backward, so a forward foot (+gamma) is a negative thigh angle.
      const ikThigh = -(gamma + delta);
      const ikShin = knee;
      // Pose-driven legs for the air, the roll, the crouch and the kneel.
      const poseThigh = (-b.air * 0.3 - b.dodge * 1.2 + b.crouch * -0.6) * (1 - kneel) + kneel * 0.1 + (offset === 0 ? -b.air * 0.1 : 0);
      const poseShin = (0.08 + b.crouch * 0.9 + tuck + b.land * 0.5) * (1 - kneel) + kneel * 1.62;
      thigh.rotation.x = ikThigh * gaitWeight + poseThigh * (1 - gaitWeight);
      shin.rotation.x = ikShin * gaitWeight + poseShin * (1 - gaitWeight);
      thigh.rotation.z = (offset === 0 ? 1 : -1) * (0.02 + b.air * 0.06 + kneel * 0.08);
    }

    const armSwing = swing * 0.75;
    const recoilBack = this.recoil * 0.22;
    if (this.holdWeapon) {
      // Two-handed hold in front of the chest, pitched with the camera so the weapon points where the
      // crosshair is; the bow is held out to the left and its string arm draws back. Shots kick the
      // arms up and back; a hit throws them up for a moment.
      const a = this.aim;
      // Camera pitch is positive looking down; the arms lower with it (less negative x).
      const pitch = a ? a.pitch * 0.75 : 0;
      const bobArm = s * 0.03 * moving - this.flinchAmount * 0.25;
      const bow = a?.weapon === 'dhanush';
      const draw = bow ? a.draw : 0;
      const ads = a?.aiming ?? 0;
      if (bow) {
        this.rUpperArm.rotation.x = -1.35 + pitch + bobArm - recoilBack * 0.5;
        this.rUpperArm.rotation.z = -0.15;
        this.rForearm.rotation.x = -0.25 - draw * 0.2;
        this.lUpperArm.rotation.x = -1.45 + pitch + bobArm;
        this.lUpperArm.rotation.z = 0.25 - draw * 0.3;
        this.lForearm.rotation.x = -0.7 - draw * 1.1;
      } else {
        this.rUpperArm.rotation.x = -1.05 - ads * 0.08 + pitch + bobArm - recoilBack;
        this.rUpperArm.rotation.z = -0.35 + ads * 0.12;
        this.rForearm.rotation.x = -0.75 + ads * 0.05 - recoilBack * 0.6;
        this.lUpperArm.rotation.x = -1.25 - ads * 0.06 + pitch + bobArm - recoilBack * 0.8;
        this.lUpperArm.rotation.z = 0.55 - ads * 0.15;
        this.lForearm.rotation.x = -1.15 - recoilBack * 0.3;
      }
    } else {
      // Walking arms swing opposite the legs with the elbow bending on the forward swing; at a sprint
      // the elbows stay bent and pump. In the air the arms lift; in a roll they cross over the chest.
      const pump = b.sprint;
      this.lUpperArm.rotation.x = sa * armSwing * (1 - pump * 0.35) + b.air * -0.7 + pump * 0.15 - b.dodge * 0.9 - this.flinchAmount * 0.6;
      this.rUpperArm.rotation.x = -sa * armSwing * (1 - pump * 0.35) + b.air * -0.7 + pump * 0.15 - b.dodge * 0.9 - this.flinchAmount * 0.6;
      this.lUpperArm.rotation.z = 0.14 + pump * 0.12 + b.air * 0.5 - b.dodge * 0.3;
      this.rUpperArm.rotation.z = -0.14 - pump * 0.12 - b.air * 0.5 + b.dodge * 0.3;
      this.lForearm.rotation.x = -0.3 - Math.max(0, -sa) * armSwing * 0.9 - pump * 1.3 - b.dodge * 1.4 - b.air * 0.3;
      this.rForearm.rotation.x = -0.3 - Math.max(0, sa) * armSwing * 0.9 - pump * 1.3 - b.dodge * 1.4 - b.air * 0.3;
    }

    if (b.pray > 0.001) {
      // Anjali: the upper arms come forward, the forearms fold up and inward so the palms meet at the chest.
      const k = b.pray;
      const mix = (cur: number, to: number): number => cur + (to - cur) * k;
      this.lUpperArm.rotation.x = mix(this.lUpperArm.rotation.x, -0.55);
      this.rUpperArm.rotation.x = mix(this.rUpperArm.rotation.x, -0.55);
      this.lUpperArm.rotation.z = mix(this.lUpperArm.rotation.z, 0.42);
      this.rUpperArm.rotation.z = mix(this.rUpperArm.rotation.z, -0.42);
      this.lForearm.rotation.x = mix(this.lForearm.rotation.x, -2.05);
      this.rForearm.rotation.x = mix(this.rForearm.rotation.x, -2.05);
    }

    // Body: double-time bob, hip sway and roll, crouch, land squash, idle breathing and weight shift.
    this.breathe = Math.sin(elapsed * 1.4) * 0.5 + 0.5;
    const idle = 1 - moving;
    this.hips.position.x = sa * 0.018 * moving + Math.sin(elapsed * 0.6) * 0.012 * idle;
    this.hips.rotation.y = -sa * 0.09 * moving;
    this.hips.rotation.z = -sa * 0.05 * moving + Math.sin(elapsed * 0.6) * 0.02 * idle;
    this.hips.rotation.x = 0;
    this.torso.rotation.x = lerp(0.03, 0.24, b.sprint) * moving + this.lean + b.crouch * 0.55 + b.land * 0.35 + b.dodge * 0.7 + idle * this.breathe * 0.015 - this.flinchAmount * 0.18 - this.recoil * 0.03 + kneel * 0.16;
    this.torso.rotation.y = sa * 0.11 * moving;
    this.torso.rotation.z = -this.hips.rotation.z * 0.8 + this.turnLean;
    this.torso.scale.y = 1 + idle * this.breathe * 0.012;
    // The head stays level and looks where the body goes; idle, it glances around slowly.
    this.head.rotation.x = -this.torso.rotation.x * 0.6 - this.flinchAmount * 0.25 + kneel * 0.42;
    this.head.rotation.y = -this.torso.rotation.y * 0.8 + this.legYaw * 0.15 + Math.sin(elapsed * 0.35) * 0.08 * idle;
    this.head.rotation.z = -this.torso.rotation.z * 0.6;
    if (this.holdWeapon && this.aim) {
      // Lean the torso and head with the aim so the whole figure tracks the crosshair.
      this.torso.rotation.x += this.aim.pitch * 0.12;
      this.head.rotation.x += this.aim.pitch * 0.35;
    }
    // Look-at: with no weapon out the head (and a little of the torso) turns toward the target.
    let wantYaw = 0;
    let wantPitch = 0;
    if (this.lookTarget && !this.holdWeapon && !this.pray) {
      const dx = this.lookTarget.x - this.root.position.x;
      const dz = this.lookTarget.z - this.root.position.z;
      const dy = this.lookTarget.y - (this.root.position.y + 1.5);
      // The rig faces +z; yaw here is relative to the root's heading.
      wantYaw = clamp(wrapAngle(Math.atan2(dx, dz) - this.root.rotation.y), -1.1, 1.1);
      wantPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.45);
    }
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    this.head.rotation.y += this.lookYaw * 0.75;
    this.head.rotation.x += this.lookPitch * 0.8;
    this.torso.rotation.y += this.lookYaw * 0.18;

    // Dodge roll: one full turn around the mid-body pivot, in the direction of the dodge.
    if (dodging) {
      const sx = Math.sin(mo.dodgeAngle);
      const sz = -Math.cos(mo.dodgeAngle);
      this.rollAxis.set(sz, 0, -sx).normalize();
      this.roll.quaternion.setFromAxisAngle(this.rollAxis, TWO_PI * smoothstep(clamp(mo.dodge, 0, 1)));
    } else this.roll.quaternion.identity();

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
      this.braid.rotation.z = Math.sin(elapsed * 2.6) * 0.04 + sa * 0.12 * moving;
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
