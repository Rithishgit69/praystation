import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp, lerp } from '@/util/math';

export type WarriorPose = 'idle' | 'walk' | 'raise' | 'overhead' | 'sweep-wind' | 'sweep' | 'charge' | 'recover' | 'final-raise' | 'final-strike' | 'still';

/**
 * The axe-bearing warrior of the Broken Tusk memory. A dignified, stylised figure rendered in the same
 * luminous memory-light as the player: tall, robed, topknot, a long-hafted crescent axe. Code-animated.
 */
export class WarriorMesh {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly rArm = new THREE.Group();
  private readonly lArm = new THREE.Group();
  private readonly lLeg = new THREE.Group();
  private readonly rLeg = new THREE.Group();
  readonly axe = new THREE.Group();
  readonly axeHead: THREE.Mesh;
  private pose: WarriorPose = 'idle';
  private phase = 0;
  private readonly cur = { rArmX: 0, rArmZ: 0, lArmX: 0, torsoX: 0, torsoY: 0, hipsY: 0, axeZ: 0, legSwing: 0 };
  readonly material: THREE.MeshStandardMaterial;
  readonly glowMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: 0xe8c48a, emissive: 0xb4772e, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.05 });
    this.glowMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc46b, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.4 });
    const m = this.material;
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // Scale: ~2.3 m tall.
    this.hips.position.y = 1.2;
    this.root.add(this.hips);
    add(this.hips, new THREE.CylinderGeometry(0.3, 0.42, 1.1, 12, 1, true), m, 0, -0.5, 0); // dhoti skirt
    for (const [leg, x] of [[this.lLeg, -0.16], [this.rLeg, 0.16]] as const) {
      leg.position.set(x, 0, 0);
      this.hips.add(leg);
      add(leg, new THREE.CapsuleGeometry(0.11, 0.9, 6, 10), m, 0, -0.6, 0);
    }
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    const chest = add(this.torso, new THREE.CapsuleGeometry(0.34, 0.5, 8, 16), m, 0, 0.45, 0);
    chest.scale.set(1.15, 1, 0.8);
    add(this.torso, new THREE.TorusGeometry(0.28, 0.035, 6, 20), this.glowMaterial, 0, 0.62, 0.02).rotation.x = 0.4; // sacred thread / ornament
    add(this.torso, new THREE.SphereGeometry(0.19, 16, 14), m, 0, 1.05, 0); // head
    add(this.torso, new THREE.SphereGeometry(0.1, 10, 8), m, 0, 1.28, -0.06); // topknot
    add(this.torso, new THREE.ConeGeometry(0.14, 0.34, 10), m, 0, 0.8, 0.08).rotation.x = -0.2; // beard
    for (const [arm, side] of [[this.lArm, -1], [this.rArm, 1]] as const) {
      arm.position.set(side * 0.42, 0.7, 0);
      this.torso.add(arm);
      add(arm, new THREE.CapsuleGeometry(0.1, 0.55, 6, 10), m, 0, -0.35, 0);
      const fore = add(arm, new THREE.CapsuleGeometry(0.085, 0.5, 6, 10), m, 0, -0.95, 0.08);
      fore.rotation.x = -0.35;
    }
    // Axe held in the right hand: long haft, crescent head.
    this.axe.position.set(0, -1.25, 0.2);
    this.rArm.add(this.axe);
    add(this.axe, new THREE.CylinderGeometry(0.035, 0.045, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 }), 0, 0.5, 0);
    const headGeo = new RoundedBoxGeometry(0.7, 0.9, 0.08, 2, 0.04);
    this.axeHead = add(this.axe, headGeo, this.glowMaterial, 0.35, 1.45, 0);
    add(this.axe, new THREE.TorusGeometry(0.12, 0.03, 6, 12), this.glowMaterial, 0, 1.55, 0).rotation.y = Math.PI / 2;
  }

  setPose(p: WarriorPose): void {
    this.pose = p;
  }

  /** `speed` = horizontal m/s for the walk cycle. */
  animate(dt: number, elapsed: number, speed: number): void {
    const t = { rArmX: 0.2, rArmZ: 0.15, lArmX: 0.1, torsoX: 0.05, torsoY: 0, hipsY: 0, axeZ: 0, legSwing: 0 };
    switch (this.pose) {
      case 'idle':
      case 'still':
        t.rArmX = 0.35 + Math.sin(elapsed * 1.2) * 0.03;
        t.torsoX = 0.03;
        break;
      case 'walk':
        t.legSwing = 1;
        t.rArmX = 0.5;
        t.torsoX = 0.12;
        break;
      case 'raise':
        t.rArmX = -2.6;
        t.rArmZ = -0.3;
        t.lArmX = -2.2;
        t.torsoX = -0.25;
        t.hipsY = 0.05;
        break;
      case 'overhead':
        t.rArmX = 0.9;
        t.rArmZ = 0;
        t.lArmX = 0.7;
        t.torsoX = 0.75;
        t.hipsY = -0.2;
        break;
      case 'sweep-wind':
        t.rArmX = -0.4;
        t.rArmZ = -1.4;
        t.torsoY = -0.9;
        t.torsoX = 0.15;
        break;
      case 'sweep':
        t.rArmX = -0.3;
        t.rArmZ = 1.3;
        t.torsoY = 1.1;
        t.torsoX = 0.2;
        break;
      case 'charge':
        t.rArmX = -1.2;
        t.rArmZ = -0.2;
        t.torsoX = 0.55;
        t.legSwing = 1.6;
        break;
      case 'recover':
        t.rArmX = 0.6;
        t.torsoX = 0.3;
        t.hipsY = -0.08;
        break;
      case 'final-raise':
        t.rArmX = -2.9;
        t.rArmZ = -0.1;
        t.lArmX = -2.7;
        t.torsoX = -0.35;
        t.hipsY = 0.08;
        break;
      case 'final-strike':
        t.rArmX = 1.1;
        t.lArmX = 0.9;
        t.torsoX = 0.85;
        t.hipsY = -0.25;
        break;
    }
    const c = this.cur;
    const k = this.pose === 'overhead' || this.pose === 'sweep' || this.pose === 'final-strike' ? 22 : this.pose === 'charge' ? 10 : 7;
    c.rArmX = damp(c.rArmX, t.rArmX, k, dt);
    c.rArmZ = damp(c.rArmZ, t.rArmZ, k, dt);
    c.lArmX = damp(c.lArmX, t.lArmX, k, dt);
    c.torsoX = damp(c.torsoX, t.torsoX, k, dt);
    c.torsoY = damp(c.torsoY, t.torsoY, k, dt);
    c.hipsY = damp(c.hipsY, t.hipsY, k, dt);
    c.legSwing = damp(c.legSwing, t.legSwing, 6, dt);
    if (speed > 0.05) this.phase += (speed / 1.6) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase) * 0.55 * c.legSwing;
    this.lLeg.rotation.x = s;
    this.rLeg.rotation.x = -s;
    this.rArm.rotation.x = c.rArmX + (this.pose === 'walk' ? -s * 0.2 : 0);
    this.rArm.rotation.z = c.rArmZ;
    this.lArm.rotation.x = c.lArmX + (this.pose === 'walk' ? s * 0.4 : 0);
    this.lArm.rotation.z = -0.15;
    this.torso.rotation.x = c.torsoX;
    this.torso.rotation.y = c.torsoY;
    this.hips.position.y = 1.2 + c.hipsY + Math.abs(Math.sin(this.phase)) * 0.03 * c.legSwing;
    this.axe.rotation.z = lerp(0, 0.2, c.legSwing);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.material.dispose();
    this.glowMaterial.dispose();
  }
}
