import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SeededRandom } from '@/util/random';
import { mergeStaticChildren } from '@/util/merge';
import { clamp, damp, lerp } from '@/util/math';
import type { LocomotionState } from './PlayerController';

const COLORS = {
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

const mat = (color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * Procedural traveller: dark messy hair, crimson scarf, grey-brown coat, backpack with straps.
 * Fully animated in code (walk/jog/sprint cycle, idle breathing, landing squash, crouch, scarf flutter).
 * Origin is at the feet; +Z is forward for the rig (the group is yawed by the controller).
 */
export class CharacterMesh {
  readonly root = new THREE.Group();
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
  private readonly scarfTails: THREE.Mesh[] = [];
  private readonly scarfTailBase: Float32Array[] = [];
  private phase = 0;
  private blend = { walk: 0, jog: 0, sprint: 0, crouch: 0, air: 0, land: 0 };
  private breathe = 0;
  /** When true the arms hold a weapon in front of the chest. */
  holdWeapon = false;
  get rightHand(): THREE.Group {
    return this.rForearm;
  }
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor() {
    const rng = new SeededRandom(7);
    const m = (c: number, r?: number, mt?: number): THREE.MeshStandardMaterial => {
      const x = mat(c, r, mt);
      this.materials.push(x);
      return x;
    };
    const hairMat = m(COLORS.hair, 0.62);
    const skinMat = m(COLORS.skin, 0.6);
    const scarfMat = m(COLORS.scarf, 0.9);
    const scarfMat2 = m(COLORS.scarfDark, 0.9);
    const coatMat = m(COLORS.coat, 0.92);
    const trimMat = m(COLORS.coatTrim, 0.92);
    const trouserMat = m(COLORS.trousers, 0.9);
    const leatherMat = m(COLORS.leather, 0.7);
    const bootMat = m(COLORS.boots, 0.75);
    const metalMat = m(COLORS.metal, 0.45, 0.8);
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

    // Hips / pelvis at 0.95 m.
    this.hips.position.y = 0.95;
    this.root.add(this.hips);
    add(this.hips, new THREE.CapsuleGeometry(0.17, 0.1, 6, 12), trouserMat, 0, 0.02, 0).scale.set(1, 0.7, 0.85);

    // Legs (thigh pivot at hip, shin pivot at knee).
    const legs: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lThigh, this.lShin, -0.11],
      [this.rThigh, this.rShin, 0.11],
    ];
    for (const [thigh, shin, x] of legs) {
      thigh.position.set(x, -0.02, 0);
      this.hips.add(thigh);
      add(thigh, new THREE.CapsuleGeometry(0.085, 0.3, 6, 10), trouserMat, 0, -0.22, 0);
      shin.position.set(0, -0.45, 0);
      thigh.add(shin);
      add(shin, new THREE.CapsuleGeometry(0.07, 0.3, 6, 10), trouserMat, 0, -0.2, 0);
      const boot = add(shin, new RoundedBoxGeometry(0.15, 0.12, 0.27, 3, 0.03), bootMat, 0, -0.42, 0.04);
      boot.scale.set(1, 1, 1);
      add(shin, new THREE.CylinderGeometry(0.085, 0.09, 0.12, 10), bootMat, 0, -0.33, 0);
    }

    // Torso: coat.
    this.torso.position.y = 0.12;
    this.hips.add(this.torso);
    const chest = add(this.torso, new THREE.CapsuleGeometry(0.2, 0.28, 6, 14), coatMat, 0, 0.26, 0);
    chest.scale.set(1.05, 1, 0.78);
    // Coat skirt flaring from the waist.
    const skirt = add(this.torso, new THREE.CylinderGeometry(0.23, 0.29, 0.5, 16, 1, true), coatMat, 0, -0.14, 0);
    skirt.scale.set(1, 1, 0.8);
    (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    add(this.torso, new THREE.TorusGeometry(0.215, 0.02, 6, 20), trimMat, 0, 0.1, 0).rotation.x = Math.PI / 2;
    // Belt + buckle.
    add(this.torso, new THREE.TorusGeometry(0.21, 0.018, 6, 20), leatherMat, 0, 0.0, 0).rotation.x = Math.PI / 2;
    add(this.torso, new RoundedBoxGeometry(0.05, 0.04, 0.02, 2, 0.008), metalMat, 0, 0.0, 0.19);
    // Shoulders.
    add(this.torso, new THREE.SphereGeometry(0.095, 12, 10), coatMat, -0.22, 0.44, 0);
    add(this.torso, new THREE.SphereGeometry(0.095, 12, 10), coatMat, 0.22, 0.44, 0);

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

    // Arms.
    const arms: Array<[THREE.Group, THREE.Group, number]> = [
      [this.lUpperArm, this.lForearm, -1],
      [this.rUpperArm, this.rForearm, 1],
    ];
    for (const [upper, fore, side] of arms) {
      upper.position.set(side * 0.25, 0.42, 0);
      this.torso.add(upper);
      add(upper, new THREE.CapsuleGeometry(0.065, 0.24, 6, 10), coatMat, 0, -0.18, 0);
      fore.position.set(0, -0.32, 0);
      upper.add(fore);
      add(fore, new THREE.CapsuleGeometry(0.055, 0.22, 6, 10), coatMat, 0, -0.14, 0);
      add(fore, new THREE.CylinderGeometry(0.06, 0.065, 0.06, 10), trimMat, 0, -0.27, 0);
      add(fore, new THREE.SphereGeometry(0.055, 10, 8), skinMat, 0, -0.33, 0).scale.set(0.9, 1.15, 0.7);
    }

    // Neck, head, hair.
    add(this.torso, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat, 0, 0.55, 0);
    this.head.position.set(0, 0.62, 0);
    this.torso.add(this.head);
    const skull = add(this.head, new THREE.SphereGeometry(0.125, 18, 16), skinMat, 0, 0.1, 0);
    skull.scale.set(0.92, 1.05, 0.98);
    add(this.head, new THREE.SphereGeometry(0.035, 8, 6), skinMat, -0.11, 0.09, 0).scale.set(0.5, 1, 0.8);
    add(this.head, new THREE.SphereGeometry(0.035, 8, 6), skinMat, 0.11, 0.09, 0).scale.set(0.5, 1, 0.8);
    // Hair cap plus messy tufts on the upper hemisphere and the nape.
    const cap = add(this.head, new THREE.SphereGeometry(0.14, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat, 0, 0.115, -0.01);
    cap.scale.set(1.0, 1.02, 1.04);
    const tuftGeo = new THREE.ConeGeometry(0.05, 0.15, 7, 1);
    tuftGeo.translate(0, 0.05, 0);
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

    // Scarf: wrapped torus around the neck plus two tails down the back.
    const wrap = add(this.torso, new THREE.TorusGeometry(0.135, 0.055, 8, 22), scarfMat, 0, 0.53, -0.01);
    wrap.rotation.x = Math.PI / 2 + 0.12;
    wrap.scale.set(1, 1.15, 0.9);
    const wrap2 = add(this.torso, new THREE.TorusGeometry(0.15, 0.045, 8, 22), scarfMat2, 0, 0.48, -0.02);
    wrap2.rotation.x = Math.PI / 2 - 0.15;
    wrap2.scale.set(1.05, 1.1, 0.85);
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(0.11, 0.42, 1, 8);
      geo.translate(0, -0.21, 0);
      const tail = new THREE.Mesh(geo, side < 0 ? scarfMat : scarfMat2);
      tail.position.set(side * 0.07, 0.5, -0.17);
      tail.rotation.set(0.12, side * 0.25, side * 0.08);
      tail.castShadow = true;
      this.torso.add(tail);
      this.scarfTails.push(tail);
      this.scarfTailBase.push(new Float32Array(geo.getAttribute('position').array));
    }

    const keep = new Set<THREE.Object3D>(this.scarfTails);
    for (const g of [this.hips, this.torso, this.head, this.lThigh, this.rThigh, this.lShin, this.rShin, this.lUpperArm, this.rUpperArm, this.lForearm, this.rForearm]) mergeStaticChildren(g, keep);
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
      // Two-handed hold in front of the chest; slight bob with the stride.
      const bobArm = Math.sin(p) * 0.04 * moving;
      this.rUpperArm.rotation.x = -1.05 + bobArm;
      this.rUpperArm.rotation.z = -0.35;
      this.rForearm.rotation.x = -0.75;
      this.lUpperArm.rotation.x = -1.25 + bobArm;
      this.lUpperArm.rotation.z = 0.55;
      this.lForearm.rotation.x = -1.15;
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
    this.hips.position.y = 0.95 + bob - crouchDrop - landDrop;
    this.hips.rotation.y = -s * 0.08 * moving;
    this.hips.rotation.x = 0;
    this.torso.rotation.x = lerp(0.03, 0.26, b.sprint) * moving + b.crouch * 0.55 + b.land * 0.35 + (1 - moving) * this.breathe * 0.015;
    this.torso.rotation.y = s * 0.1 * moving;
    this.torso.scale.y = 1 + (1 - moving) * this.breathe * 0.012;
    this.head.rotation.x = -this.torso.rotation.x * 0.6;
    this.head.rotation.y = -this.torso.rotation.y * 0.8;

    // Scarf tails: sway with stride and lift back with speed.
    const lift = clamp(horizontalSpeed / sprintSpeed, 0, 1);
    for (let i = 0; i < this.scarfTails.length; i++) {
      const tail = this.scarfTails[i] as THREE.Mesh;
      const base = this.scarfTailBase[i] as Float32Array;
      const pos = tail.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const side = i === 0 ? -1 : 1;
      for (let v = 0; v < pos.count; v++) {
        const bx = base[v * 3] as number;
        const by = base[v * 3 + 1] as number;
        const bz = base[v * 3 + 2] as number;
        const d = -by / 0.42; // 0 at neck, 1 at tip
        const wave = Math.sin(elapsed * 6 + d * 4 + side) * 0.03 * (0.4 + lift) * d;
        arr[v * 3] = bx + wave + side * d * d * 0.02;
        arr[v * 3 + 1] = by + d * d * lift * 0.12;
        arr[v * 3 + 2] = bz - d * d * (0.06 + lift * 0.28) + Math.cos(elapsed * 5 + d * 3) * 0.02 * d;
      }
      pos.needsUpdate = true;
      tail.geometry.computeVertexNormals();
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
