import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '@/world/Materials';
import { damp, lerp } from '@/util/math';

export type AsuraPose = 'idle' | 'walk' | 'cast' | 'charge' | 'slam-wind' | 'slam' | 'stagger' | 'shield' | 'death';

/**
 * An asura: a towering, horned demon-form of dark stone-flesh lit from within by the colour of its
 * vice, carrying a great mace. Menacing and mythic; never a sacred figure. Code-animated poses.
 */
export class AsuraMesh {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly lArm = new THREE.Group();
  private readonly rArm = new THREE.Group();
  private readonly lLeg = new THREE.Group();
  private readonly rLeg = new THREE.Group();
  private readonly mace = new THREE.Group();
  private readonly aura: THREE.Points;
  private readonly auraGeo: THREE.BufferGeometry;
  private readonly auraMat: THREE.PointsMaterial;
  private readonly eyeMat: THREE.SpriteMaterial;
  readonly bodyMat: THREE.MeshStandardMaterial;
  readonly coreMat: THREE.MeshStandardMaterial;
  private readonly shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private pose: AsuraPose = 'idle';
  private phase = 0;
  private readonly cur = { rArmX: 0, rArmZ: 0, lArmX: 0, torsoX: 0, torsoY: 0, hipsY: 0, legSwing: 0, scale: 1 };
  private flash = 0;

  constructor(lib: MaterialLibrary, color: number, scale = 1) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2e3c, roughness: 0.7, metalness: 0.15, emissive: color, emissiveIntensity: 0.22 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 2.2, roughness: 0.4 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.6 });
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
    const coreLight = new THREE.PointLight(color, 140, 26, 2);
    coreLight.position.set(0, 0.9, 0.6);
    this.torso.add(coreLight);
    for (const s of [-1, 1]) add(this.torso, new THREE.SphereGeometry(0.34, 12, 10), this.bodyMat, s * 0.78, 1.32, 0);
    this.head.position.set(0, 1.6, 0.05);
    this.torso.add(this.head);
    add(this.head, new THREE.SphereGeometry(0.36, 16, 14), this.bodyMat, 0, 0.25, 0).scale.set(1, 1.15, 1);
    add(this.head, new RoundedBoxGeometry(0.42, 0.3, 0.36, 2, 0.08), this.bodyMat, 0, 0.05, 0.2); // jaw
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
    for (const [arm, side] of [[this.lArm, -1], [this.rArm, 1]] as const) {
      arm.position.set(side * 0.86, 1.3, 0);
      this.torso.add(arm);
      add(arm, new THREE.CapsuleGeometry(0.2, 0.7, 6, 12), this.bodyMat, 0, -0.5, 0);
      const fore = add(arm, new THREE.CapsuleGeometry(0.17, 0.7, 6, 12), this.bodyMat, 0, -1.2, 0.15);
      fore.rotation.x = -0.3;
      add(arm, new THREE.SphereGeometry(0.2, 10, 8), this.bodyMat, 0, -1.65, 0.3);
    }
    this.mace.position.set(0, -1.65, 0.3);
    this.rArm.add(this.mace);
    add(this.mace, new THREE.CylinderGeometry(0.06, 0.08, 2.2, 8), bone, 0, 0.8, 0);
    add(this.mace, new THREE.SphereGeometry(0.42, 12, 10), this.bodyMat, 0, 2.0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = add(this.mace, new THREE.ConeGeometry(0.08, 0.35, 6), bone, Math.cos(a) * 0.42, 2.0, Math.sin(a) * 0.42);
      spike.lookAt(this.mace.localToWorld(new THREE.Vector3(Math.cos(a) * 2, 2.0, Math.sin(a) * 2)));
    }
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
    this.root.scale.setScalar(scale);
    this.cur.scale = scale;
  }

  setPose(p: AsuraPose): void {
    this.pose = p;
  }
  setShield(on: boolean): void {
    this.shieldMesh.visible = on;
  }
  /** Brief white flash on hit. */
  hitFlash(): void {
    this.flash = 1;
  }

  animate(dt: number, elapsed: number, speed: number): void {
    const t = { rArmX: 0.25, rArmZ: 0.2, lArmX: 0.15, torsoX: 0.08, torsoY: 0, hipsY: 0, legSwing: 0 };
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
    const k = this.pose === 'slam' || this.pose === 'charge' ? 20 : 7;
    c.rArmX = damp(c.rArmX, t.rArmX, k, dt);
    c.rArmZ = damp(c.rArmZ, t.rArmZ, k, dt);
    c.lArmX = damp(c.lArmX, t.lArmX, k, dt);
    c.torsoX = damp(c.torsoX, t.torsoX, k, dt);
    c.torsoY = damp(c.torsoY, t.torsoY, k, dt);
    c.hipsY = damp(c.hipsY, t.hipsY, k, dt);
    c.legSwing = damp(c.legSwing, t.legSwing, 6, dt);
    if (speed > 0.05) this.phase += (speed / 2.2) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase) * 0.5 * c.legSwing;
    this.lLeg.rotation.x = s;
    this.rLeg.rotation.x = -s;
    this.rArm.rotation.x = c.rArmX + (this.pose === 'walk' ? -s * 0.25 : 0);
    this.rArm.rotation.z = c.rArmZ;
    this.lArm.rotation.x = c.lArmX + (this.pose === 'walk' ? s * 0.35 : 0);
    this.lArm.rotation.z = -0.2;
    this.torso.rotation.x = c.torsoX;
    this.torso.rotation.y = c.torsoY;
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
    void lerp;
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
  }
}
