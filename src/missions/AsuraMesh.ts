import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '@/world/Materials';
import { damp } from '@/util/math';
import type { WeaponKind } from './MissionData';

export type AsuraPose = 'idle' | 'walk' | 'cast' | 'charge' | 'slam-wind' | 'slam' | 'stagger' | 'shield' | 'death' | 'throw' | 'sweep' | 'lunge' | 'breathe' | 'draw' | 'raise' | 'mirror';

/** What the fight needs from an asura's avatar, whether procedural (AsuraMesh) or a loaded model (GltfAsura). */
export interface AsuraAvatar {
  readonly root: THREE.Group;
  setPose(p: AsuraPose): void;
  setShield(on: boolean): void;
  /** The ego's mirror: a reflective hemisphere held in front. */
  setMirror(on: boolean): void;
  /** Brief white flash on hit. */
  hitFlash(): void;
  /** Tint the core (enrage). */
  setEnraged(on: boolean): void;
  animate(dt: number, elapsed: number, speed: number): void;
  /** World position of a hand / the mouth (projectile and flame origins). */
  handWorld(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3;
  mouthWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

/**
 * An asura: a towering, horned demon-form of dark stone-flesh lit from within by the colour of its
 * vice, carrying the weapon of its kit. Menacing and mythic; never a sacred figure. Code-animated poses.
 * Stand-in art until a modelled avatar is dropped into public/models/asuras/<id>.glb (docs/VILLAINS.md).
 */
export class AsuraMesh implements AsuraAvatar {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly lArm = new THREE.Group();
  private readonly rArm = new THREE.Group();
  private readonly lLeg = new THREE.Group();
  private readonly rLeg = new THREE.Group();
  private readonly lHand = new THREE.Group();
  private readonly rHand = new THREE.Group();
  private readonly mouth = new THREE.Object3D();
  private readonly aura: THREE.Points;
  private readonly auraGeo: THREE.BufferGeometry;
  private readonly auraMat: THREE.PointsMaterial;
  private readonly eyeMat: THREE.SpriteMaterial;
  readonly bodyMat: THREE.MeshStandardMaterial;
  readonly coreMat: THREE.MeshStandardMaterial;
  private readonly shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly mirrorMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private readonly extraMats: THREE.Material[] = [];
  private readonly color: number;
  private pose: AsuraPose = 'idle';
  private phase = 0;
  private readonly cur = { rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0, torsoX: 0, torsoY: 0, hipsY: 0, headX: 0, legSwing: 0 };
  private flash = 0;

  constructor(lib: MaterialLibrary, color: number, scale = 1, weapon: WeaponKind = 'mace', withLight = true) {
    this.color = color;
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2e3c, roughness: 0.7, metalness: 0.15, emissive: color, emissiveIntensity: 0.22 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.6 });
    this.extraMats.push(bone);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // ~3.2 m tall at scale 1.
    this.hips.position.y = 1.55;
    this.root.add(this.hips);
    add(this.hips, new THREE.CapsuleGeometry(0.42, 0.3, 6, 14), this.bodyMat, 0, -0.05, 0).scale.set(1.2, 0.8, 1);
    for (const [leg, x] of [[this.lLeg, -0.3], [this.rLeg, 0.3]] as const) {
      leg.position.set(x, -0.1, 0);
      this.hips.add(leg);
      add(leg, new THREE.CapsuleGeometry(0.2, 0.8, 6, 12), this.bodyMat, 0, -0.6, 0);
      add(leg, new RoundedBoxGeometry(0.42, 0.22, 0.6, 2, 0.06), this.bodyMat, 0, -1.3, 0.1);
      for (let c = 0; c < 3; c++) add(leg, new THREE.ConeGeometry(0.05, 0.22, 6), bone, -0.12 + c * 0.12, -1.34, 0.45).rotation.x = Math.PI / 2;
    }
    this.torso.position.y = 0.2;
    this.hips.add(this.torso);
    const chest = add(this.torso, new THREE.CapsuleGeometry(0.62, 0.7, 8, 18), this.bodyMat, 0, 0.7, 0);
    chest.scale.set(1.35, 1, 0.85);
    add(this.torso, new THREE.SphereGeometry(0.22, 14, 10), this.coreMat, 0, 0.75, 0.5); // the vice burning in the chest
    if (withLight) {
      const coreLight = new THREE.PointLight(color, 140, 26, 2);
      coreLight.position.set(0, 0.9, 0.6);
      this.torso.add(coreLight);
    }
    for (const s of [-1, 1]) add(this.torso, new THREE.SphereGeometry(0.34, 12, 10), this.bodyMat, s * 0.78, 1.32, 0);
    this.head.position.set(0, 1.6, 0.05);
    this.torso.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.36, 16, 14), this.bodyMat, 0, 0.25, 0).scale.set(1, 1.15, 1);
    add(this.head, new RoundedBoxGeometry(0.42, 0.3, 0.36, 2, 0.08), this.bodyMat, 0, 0.05, 0.2); // jaw
    this.mouth.position.set(0, 0.08, 0.42);
    this.head.add(this.mouth);
    for (const s of [-1, 1]) {
      const horn = add(this.head, new THREE.ConeGeometry(0.1, 0.7, 8), bone, s * 0.26, 0.6, -0.05);
      horn.rotation.z = -s * 0.5;
      horn.rotation.x = -0.3;
      add(this.head, new THREE.ConeGeometry(0.05, 0.3, 6), bone, s * 0.14, -0.02, 0.36).rotation.x = -Math.PI / 2 + 0.6; // fangs
    }
    this.eyeMat = new THREE.SpriteMaterial({ map: lib.glowTexture, color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const s of [-1, 1]) {
      const e = new THREE.Sprite(this.eyeMat);
      e.scale.set(0.24, 0.24, 1);
      e.position.set(s * 0.15, 0.32, 0.36);
      this.head.add(e);
    }
    for (const [arm, hand, side] of [[this.lArm, this.lHand, -1], [this.rArm, this.rHand, 1]] as const) {
      arm.position.set(side * 0.86, 1.3, 0);
      this.torso.add(arm);
      add(arm, new THREE.CapsuleGeometry(0.2, 0.7, 6, 12), this.bodyMat, 0, -0.5, 0);
      const fore = add(arm, new THREE.CapsuleGeometry(0.17, 0.7, 6, 12), this.bodyMat, 0, -1.2, 0.15);
      fore.rotation.x = -0.3;
      add(arm, new THREE.SphereGeometry(0.2, 10, 8), this.bodyMat, 0, -1.65, 0.3);
      hand.position.set(0, -1.65, 0.3);
      arm.add(hand);
    }
    this.buildWeapon(weapon, add, bone);
    // Aura motes.
    const n = 90;
    this.auraGeo = new THREE.BufferGeometry();
    this.auraGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.auraMat = new THREE.PointsMaterial({ map: lib.glowTexture, color, size: 0.2, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Points(this.auraGeo, this.auraMat);
    this.aura.frustumCulled = false;
    this.root.add(this.aura);
    // Shield bubble.
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.shieldMesh.position.y = 1.8;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
    // The mirror: a front hemisphere of polished silver.
    this.mirrorMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xeef4ff, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide, envMapIntensity: 1 }));
    this.mirrorMesh.position.y = 1.8;
    // phi 0..π keeps the +Z half: the hemisphere faces the way the asura faces.
    this.mirrorMesh.visible = false;
    this.root.add(this.mirrorMesh);
    this.root.scale.setScalar(scale);
  }

  private buildWeapon(weapon: WeaponKind, add: (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh, bone: THREE.Material): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.25, metalness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.3, metalness: 0.9, emissive: 0x6a4a10, emissiveIntensity: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.85 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3d7a34, roughness: 0.8, emissive: 0x1e4a1a, emissiveIntensity: 0.4 });
    this.extraMats.push(metal, gold, wood, leaf);
    switch (weapon) {
      case 'mace': {
        const mace = new THREE.Group();
        this.rHand.add(mace);
        add(mace, new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), bone, 0, 0.8, 0);
        add(mace, new THREE.SphereGeometry(0.42, 12, 10), this.bodyMat, 0, 2.0, 0);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const spike = add(mace, new THREE.ConeGeometry(0.08, 0.35, 6), bone, Math.cos(a) * 0.42, 2.0, Math.sin(a) * 0.42);
          spike.lookAt(mace.localToWorld(new THREE.Vector3(Math.cos(a) * 2, 2.0, Math.sin(a) * 2)));
        }
        break;
      }
      case 'claws':
        for (const hand of [this.lHand, this.rHand]) {
          for (let c = -1; c <= 1; c++) {
            const claw = add(hand, new THREE.ConeGeometry(0.05, 0.75, 6), bone, c * 0.11, -0.1, 0.35);
            claw.rotation.x = Math.PI / 2 - 0.2;
          }
        }
        // Crystal growths on the shoulders and knuckles (envy made solid).
        for (const s of [-1, 1]) {
          const crystal = add(this.torso, new THREE.OctahedronGeometry(0.28, 0), this.coreMat, s * 0.82, 1.6, 0);
          crystal.scale.set(0.7, 1.6, 0.7);
          crystal.rotation.z = -s * 0.5;
        }
        break;
      case 'flame':
        for (const hand of [this.lHand, this.rHand]) add(hand, new THREE.SphereGeometry(0.3, 12, 10), this.coreMat, 0, 0, 0.05);
        add(this.head, new THREE.TorusGeometry(0.34, 0.06, 6, 16), gold, 0, 0.64, 0).rotation.x = Math.PI / 2 - 0.2; // a crown too large for him
        for (let i = 0; i < 5; i++) add(this.head, new THREE.ConeGeometry(0.06, 0.28, 5), gold, Math.sin((i / 5) * Math.PI * 2) * 0.32, 0.78, Math.cos((i / 5) * Math.PI * 2) * 0.32);
        break;
      case 'sword': {
        // A great curved talwar: six blade segments along an arc, a guard and a wrapped hilt.
        const sword = new THREE.Group();
        this.rHand.add(sword);
        add(sword, new THREE.CylinderGeometry(0.05, 0.06, 0.5, 8), wood, 0, 0.15, 0);
        add(sword, new THREE.TorusGeometry(0.16, 0.03, 6, 14), gold, 0, 0.4, 0).rotation.x = Math.PI / 2;
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          const seg = add(sword, new THREE.BoxGeometry(0.022, 0.42, 0.22 - t * 0.06), metal, 0, 0.6 + i * 0.38, Math.sin(t * 1.1) * 0.55);
          seg.rotation.x = -t * 0.75;
        }
        add(sword, new THREE.ConeGeometry(0.11, 0.35, 4), metal, 0, 2.7, 0.55).rotation.x = -0.75;
        break;
      }
      case 'chain': {
        // Hook on a heavy chain; coin sacks on the hips.
        const chain = new THREE.Group();
        this.rHand.add(chain);
        for (let i = 0; i < 7; i++) {
          const link = add(chain, new THREE.TorusGeometry(0.09, 0.03, 6, 12), metal, 0, -0.16 * i - 0.05, 0.3 + i * 0.02);
          link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        }
        const hook = add(chain, new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI * 1.4), metal, 0, -1.25, 0.42);
        hook.rotation.y = Math.PI / 2;
        add(chain, new THREE.ConeGeometry(0.05, 0.22, 6), metal, 0, -1.1, 0.58).rotation.x = -0.4;
        for (const s of [-1, 1]) add(this.hips, new THREE.SphereGeometry(0.34, 10, 8), gold, s * 0.62, -0.15, -0.1).scale.set(0.9, 1.15, 0.7);
        for (let i = 0; i < 6; i++) add(this.torso, new THREE.TorusGeometry(0.08, 0.025, 6, 10), gold, -0.5 + i * 0.2, 0.55 + (i % 2) * 0.12, 0.62).rotation.x = 0.3; // rings and chains across the chest
        break;
      }
      case 'bow': {
        // A long bow of flowering wood in the left hand, quiver on the back.
        const bow = new THREE.Group();
        this.lHand.add(bow);
        const limb = add(bow, new THREE.TorusGeometry(1.15, 0.045, 6, 28, Math.PI * 0.82), wood, 0, 0, 0.2);
        limb.rotation.set(0, Math.PI / 2, Math.PI * 0.09);
        add(bow, new THREE.CylinderGeometry(0.008, 0.008, 2.15, 4), metal, 0, 0, 0.55);
        for (let i = 0; i < 5; i++) add(bow, new THREE.SphereGeometry(0.07, 6, 5), this.coreMat, 0, -0.9 + i * 0.45, 0.2 + Math.sin(i * 1.3) * 0.15); // blossoms
        const quiver = add(this.torso, new THREE.CylinderGeometry(0.16, 0.14, 1.1, 10), wood, -0.35, 0.9, -0.62);
        quiver.rotation.set(0.25, 0, 0.3);
        for (let i = 0; i < 5; i++) add(this.torso, new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), bone, -0.42 + i * 0.05, 1.55 + (i % 2) * 0.08, -0.7 - (i % 3) * 0.04).rotation.set(0.25, 0, 0.3);
        // A garland of blossoms.
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          add(this.torso, new THREE.SphereGeometry(0.09, 7, 6), this.coreMat, Math.sin(a) * 0.72, 1.05 - Math.abs(Math.cos(a)) * 0.35, Math.cos(a) * 0.62);
        }
        break;
      }
      case 'roots':
        for (const arm of [this.lArm, this.rArm]) {
          for (let i = 0; i < 5; i++) {
            const vine = add(arm, new THREE.TorusGeometry(0.22 - i * 0.012, 0.035, 6, 12), leaf, 0, -0.3 - i * 0.3, 0.05 + i * 0.03);
            vine.rotation.x = Math.PI / 2 + Math.sin(i) * 0.25;
          }
        }
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(this.torso, new THREE.ConeGeometry(0.09, 0.5, 6), leaf, s * (0.7 + i * 0.12), 1.5 + i * 0.2, -0.1 + i * 0.1).rotation.z = -s * (0.5 + i * 0.25);
        for (let i = 0; i < 6; i++) add(this.hips, new THREE.CylinderGeometry(0.05, 0.12, 1.1, 5), wood, Math.sin(i) * 0.45, -0.9, Math.cos(i * 1.7) * 0.4).rotation.set(Math.sin(i * 2) * 0.25, 0, Math.cos(i * 3) * 0.25); // trailing roots
        break;
      case 'scepter': {
        const scepter = new THREE.Group();
        this.rHand.add(scepter);
        add(scepter, new THREE.CylinderGeometry(0.05, 0.06, 2.0, 8), gold, 0, 0.7, 0);
        add(scepter, new THREE.OctahedronGeometry(0.28, 0), this.coreMat, 0, 1.85, 0).scale.set(0.8, 1.5, 0.8);
        // Crown of many faces.
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          add(this.head, new THREE.ConeGeometry(0.09, 0.45, 5), gold, Math.sin(a) * 0.34, 0.75, Math.cos(a) * 0.34).rotation.set(0, 0, 0);
          add(this.head, new THREE.SphereGeometry(0.07, 8, 6), this.coreMat, Math.sin(a) * 0.36, 0.6, Math.cos(a) * 0.36);
        }
        // Mirror disc on the left forearm.
        const disc = add(this.lArm, new THREE.CylinderGeometry(0.55, 0.55, 0.06, 24), metal, -0.2, -1.1, 0.25);
        disc.rotation.z = Math.PI / 2;
        break;
      }
    }
  }

  setPose(p: AsuraPose): void {
    this.pose = p;
  }
  setShield(on: boolean): void {
    this.shieldMesh.visible = on;
  }
  setMirror(on: boolean): void {
    this.mirrorMesh.visible = on;
  }
  hitFlash(): void {
    this.flash = 1;
  }
  setEnraged(on: boolean): void {
    this.coreMat.emissive.set(on ? 0xff3030 : this.color);
  }
  handWorld(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3 {
    return (side === 'left' ? this.lHand : this.rHand).getWorldPosition(out);
  }
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.mouth.getWorldPosition(out);
  }

  animate(dt: number, elapsed: number, speed: number): void {
    const t = { rArmX: 0.25, rArmZ: 0.2, lArmX: 0.15, lArmZ: -0.2, torsoX: 0.08, torsoY: 0, hipsY: 0, headX: 0, legSwing: 0 };
    switch (this.pose) {
      case 'idle':
        t.rArmX = 0.35 + Math.sin(elapsed * 1.1) * 0.05;
        t.torsoX = 0.1 + Math.sin(elapsed * 1.5) * 0.02;
        break;
      case 'walk':
        t.legSwing = 1;
        t.torsoX = 0.2;
        break;
      case 'cast':
        t.lArmX = -2.4;
        t.rArmX = -0.4;
        t.torsoX = -0.15;
        break;
      case 'throw':
        t.rArmX = -2.8;
        t.rArmZ = 0.5;
        t.lArmX = -0.9;
        t.torsoX = -0.25;
        t.torsoY = -0.5;
        break;
      case 'sweep':
        t.rArmX = -1.4;
        t.rArmZ = -1.3;
        t.lArmX = -0.6;
        t.torsoX = 0.35;
        t.torsoY = 0.7;
        break;
      case 'lunge':
        t.rArmX = -1.6;
        t.rArmZ = 0.3;
        t.lArmX = 0.6;
        t.torsoX = 0.7;
        t.legSwing = 1.4;
        break;
      case 'breathe':
        t.headX = -0.55;
        t.torsoX = -0.3;
        t.rArmX = 0.9;
        t.lArmX = 0.9;
        t.rArmZ = 0.9;
        t.lArmZ = -0.9;
        break;
      case 'draw':
        t.lArmX = -1.55;
        t.lArmZ = 0.1;
        t.rArmX = -1.45;
        t.rArmZ = -0.9;
        t.torsoY = 0.55;
        break;
      case 'raise':
        t.lArmX = -2.9;
        t.rArmX = -2.9;
        t.lArmZ = -0.5;
        t.rArmZ = 0.5;
        t.torsoX = -0.3;
        t.headX = -0.4;
        break;
      case 'mirror':
        t.lArmX = -1.5;
        t.lArmZ = 0.35;
        t.rArmX = -0.6;
        t.torsoX = 0.1;
        break;
      case 'charge':
        t.torsoX = 0.6;
        t.rArmX = -1.0;
        t.legSwing = 1.6;
        break;
      case 'slam-wind':
        t.rArmX = -2.9;
        t.rArmZ = -0.2;
        t.lArmX = -2.2;
        t.torsoX = -0.35;
        t.hipsY = 0.1;
        break;
      case 'slam':
        t.rArmX = 1.2;
        t.lArmX = 0.9;
        t.torsoX = 0.9;
        t.hipsY = -0.4;
        break;
      case 'stagger':
        t.torsoX = -0.5;
        t.rArmX = -0.8;
        t.lArmX = -0.8;
        t.hipsY = -0.15;
        break;
      case 'shield':
        t.lArmX = -1.6;
        t.rArmX = -1.6;
        t.torsoX = -0.1;
        break;
      case 'death':
        t.torsoX = 1.2;
        t.hipsY = -0.9;
        t.rArmX = 0.5;
        t.lArmX = 0.5;
        break;
    }
    const c = this.cur;
    const fast = this.pose === 'slam' || this.pose === 'charge' || this.pose === 'sweep' || this.pose === 'lunge' || this.pose === 'throw';
    const k = fast ? 22 : 7;
    c.rArmX = damp(c.rArmX, t.rArmX, k, dt);
    c.rArmZ = damp(c.rArmZ, t.rArmZ, k, dt);
    c.lArmX = damp(c.lArmX, t.lArmX, k, dt);
    c.lArmZ = damp(c.lArmZ, t.lArmZ, k, dt);
    c.torsoX = damp(c.torsoX, t.torsoX, k, dt);
    c.torsoY = damp(c.torsoY, t.torsoY, k, dt);
    c.hipsY = damp(c.hipsY, t.hipsY, k, dt);
    c.headX = damp(c.headX, t.headX, k, dt);
    c.legSwing = damp(c.legSwing, t.legSwing, 6, dt);
    if (speed > 0.05) this.phase += (speed / 2.2) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase) * 0.5 * c.legSwing;
    this.lLeg.rotation.x = s;
    this.rLeg.rotation.x = -s;
    this.rArm.rotation.x = c.rArmX + (this.pose === 'walk' ? -s * 0.25 : 0);
    this.rArm.rotation.z = c.rArmZ;
    this.lArm.rotation.x = c.lArmX + (this.pose === 'walk' ? s * 0.35 : 0);
    this.lArm.rotation.z = c.lArmZ;
    this.torso.rotation.x = c.torsoX;
    this.torso.rotation.y = c.torsoY;
    this.head.rotation.x = c.headX;
    this.hips.position.y = 1.55 + c.hipsY + Math.abs(Math.sin(this.phase)) * 0.06 * c.legSwing;
    // Hit flash.
    this.flash = Math.max(0, this.flash - dt * 6);
    this.bodyMat.emissiveIntensity = 0.22 + this.flash * 1.6;
    this.coreMat.emissiveIntensity = 2.2 + Math.sin(elapsed * 4) * 0.4 + this.flash * 2;
    // Aura.
    const pos = this.auraGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = i * 0.9 + elapsed * 0.7;
      const r = 0.9 + Math.sin(i * 1.3 + elapsed) * 0.3;
      pos.setXYZ(i, Math.cos(a) * r, ((i / pos.count + elapsed * 0.1) % 1) * 3.4, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    this.shieldMesh.material.opacity = 0.14 + Math.sin(elapsed * 6) * 0.05;
    this.shieldMesh.rotation.y = elapsed * 0.6;
    this.mirrorMesh.material.opacity = 0.45 + Math.sin(elapsed * 5) * 0.1;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.bodyMat.dispose();
    this.coreMat.dispose();
    this.eyeMat.dispose();
    this.auraGeo.dispose();
    this.auraMat.dispose();
    this.shieldMesh.material.dispose();
    this.mirrorMesh.material.dispose();
    for (const m of this.extraMats) m.dispose();
  }
}
