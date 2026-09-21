import * as THREE from 'three';
import type { MaterialLibrary } from '@/world/Materials';
import { damp } from '@/util/math';
import { DESIGNS, type AsuraRig, type DesignContext } from './AsuraDesigns';
import type { DesignId, WeaponKind } from './MissionData';

const WHITE = new THREE.Color(0xffffff);

export type AsuraPose = 'idle' | 'walk' | 'cast' | 'charge' | 'slam-wind' | 'slam' | 'stagger' | 'shield' | 'death' | 'throw' | 'sweep' | 'lunge' | 'breathe' | 'draw' | 'raise' | 'mirror' | 'leap';

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
  /** Height of the feet above the floor (hovering designs). */
  readonly hoverHeight: number;
  dispose(): void;
}

/**
 * A procedural asura built to a reference design (AsuraDesigns.ts): the blade warrior, the wrestler,
 * the buffalo demon, the three-faced deluder, the fire king. One shared bone rig is posed in code;
 * designs add proportions, faces, hair, ornaments, cloth and weapons. Menacing and mythic; never a
 * sacred figure. A modelled .glb can replace any of them (AsuraModel.ts).
 */
export class AsuraMesh implements AsuraAvatar {
  readonly root = new THREE.Group();
  private readonly rig: AsuraRig;
  private readonly aura: THREE.Points;
  private readonly auraGeo: THREE.BufferGeometry;
  private readonly auraMat: THREE.PointsMaterial;
  private readonly eyeMat: THREE.SpriteMaterial;
  readonly bodyMat: THREE.MeshStandardMaterial;
  readonly coreMat: THREE.MeshStandardMaterial;
  private readonly shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly mirrorMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private readonly extraMats: THREE.MeshStandardMaterial[] = [];
  /** Each design material's own emissive colour and intensity, restored after every hit flash. */
  private readonly baseEmissive: Array<{ color: THREE.Color; intensity: number }> = [];
  private flashApplied = false;
  private readonly scarfBase: Float32Array[] = [];
  private readonly color: number;
  private pose: AsuraPose = 'idle';
  private phase = 0;
  private readonly cur = { rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0, torsoX: 0, torsoY: 0, hipsY: 0, headX: 0, legSwing: 0 };
  private flash = 0;
  readonly hoverHeight: number;

  constructor(lib: MaterialLibrary, color: number, scale = 1, weapon: WeaponKind = 'claws', withLight = true, design: DesignId = 'fire-king') {
    void weapon;
    this.color = color;
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2e3c, roughness: 0.7, metalness: 0.15, emissive: color, emissiveIntensity: 0.22 });
    this.coreMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 });
    this.eyeMat = new THREE.SpriteMaterial({ map: lib.glowTexture, color, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const rig: AsuraRig = { root: this.root, hips: new THREE.Group(), torso: new THREE.Group(), head: new THREE.Group(), lArm: new THREE.Group(), rArm: new THREE.Group(), lLeg: new THREE.Group(), rLeg: new THREE.Group(), lHand: new THREE.Group(), rHand: new THREE.Group(), mouth: new THREE.Object3D(), extraArms: [], scarves: [], hover: false };
    this.rig = rig;
    rig.hips.position.y = 1.55;
    this.root.add(rig.hips);
    rig.torso.position.y = 0.2;
    rig.hips.add(rig.torso);
    const ctx: DesignContext = {
      lib,
      color,
      bodyMat: this.bodyMat,
      coreMat: this.coreMat,
      mat: (params) => {
        const m = new THREE.MeshStandardMaterial(params);
        this.extraMats.push(m);
        this.baseEmissive.push({ color: m.emissive.clone(), intensity: m.emissiveIntensity });
        return m;
      },
      add: (parent, geo, mat, x = 0, y = 0, z = 0) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        parent.add(m);
        return m;
      },
      eye: (parent, x, y, z, size = 0.24) => {
        const e = new THREE.Sprite(this.eyeMat);
        e.scale.set(size, size, 1);
        e.position.set(x, y, z);
        parent.add(e);
        return e;
      },
    };
    DESIGNS[design](rig, ctx);
    this.hoverHeight = rig.hover ? 0.6 : 0;
    for (const s of rig.scarves) {
      const geo = (s as THREE.Mesh).geometry;
      this.scarfBase.push(new Float32Array(geo.getAttribute('position').array));
    }
    // The vice burning in the chest, and its light.
    ctx.add(rig.torso, new THREE.SphereGeometry(0.11, 12, 8), this.coreMat, 0, 0.82, 0.58 * (design === 'wrestler' || design === 'buffalo' ? 1.3 : 1));
    if (withLight) {
      // Lit skin and gold blow out under a strong chest light; keep it a glow, not a lamp.
      const coreLight = new THREE.PointLight(new THREE.Color(color).lerp(new THREE.Color(0xfff2e0), 0.55), 7, 12, 2);
      coreLight.position.set(0, 2.6, 2.0);
      rig.torso.add(coreLight);
    }
    // Aura motes.
    const n = 90;
    this.auraGeo = new THREE.BufferGeometry();
    this.auraGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.auraMat = new THREE.PointsMaterial({ map: lib.glowTexture, color, size: 0.2, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Points(this.auraGeo, this.auraMat);
    this.aura.frustumCulled = false;
    this.root.add(this.aura);
    // Shield bubble and the mirror hemisphere.
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.shieldMesh.position.y = 1.8;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
    this.mirrorMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xeef4ff, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide, envMapIntensity: 1 }));
    this.mirrorMesh.position.y = 1.8;
    this.mirrorMesh.visible = false;
    this.root.add(this.mirrorMesh);
    this.root.scale.setScalar(scale);
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
    this.eyeMat.color.set(on ? 0xff4040 : this.color);
  }
  handWorld(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3 {
    return (side === 'left' ? this.rig.lHand : this.rig.rHand).getWorldPosition(out);
  }
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.mouth.getWorldPosition(out);
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
      case 'leap':
        t.torsoX = -0.2;
        t.rArmX = -2.6;
        t.lArmX = -2.6;
        t.rArmZ = 0.4;
        t.lArmZ = -0.4;
        t.legSwing = 0.4;
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
    const rig = this.rig;
    const fast = this.pose === 'slam' || this.pose === 'charge' || this.pose === 'sweep' || this.pose === 'lunge' || this.pose === 'throw' || this.pose === 'leap';
    const k = fast ? 22 : 7;
    c.rArmX = damp(c.rArmX, t.rArmX, k, dt);
    c.rArmZ = damp(c.rArmZ, t.rArmZ, k, dt);
    c.lArmX = damp(c.lArmX, t.lArmX, k, dt);
    c.lArmZ = damp(c.lArmZ, t.lArmZ, k, dt);
    c.torsoX = damp(c.torsoX, t.torsoX, k, dt);
    c.torsoY = damp(c.torsoY, t.torsoY, k, dt);
    c.hipsY = damp(c.hipsY, t.hipsY, k, dt);
    c.headX = damp(c.headX, t.headX, k, dt);
    c.legSwing = damp(c.legSwing, rig.hover ? 0 : t.legSwing, 6, dt);
    if (speed > 0.05) this.phase += (speed / 2.2) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase) * 0.5 * c.legSwing;
    rig.lLeg.rotation.x = rig.hover ? 0.15 + Math.sin(elapsed * 1.3) * 0.05 : s;
    rig.rLeg.rotation.x = rig.hover ? 0.05 + Math.cos(elapsed * 1.1) * 0.05 : -s;
    rig.rArm.rotation.x = c.rArmX + (this.pose === 'walk' ? -s * 0.25 : 0);
    rig.rArm.rotation.z = c.rArmZ;
    rig.lArm.rotation.x = c.lArmX + (this.pose === 'walk' ? s * 0.35 : 0);
    rig.lArm.rotation.z = c.lArmZ;
    rig.extraArms.forEach(([l, r], i) => {
      const lag = 0.35 + i * 0.3;
      const wave = Math.sin(elapsed * 1.6 + i * 1.3) * 0.18;
      l.rotation.x = c.lArmX * 0.7 + wave - lag * 0.3;
      r.rotation.x = c.rArmX * 0.7 - wave - lag * 0.3;
      l.rotation.z = -(0.35 + i * 0.35) + c.lArmZ * 0.3;
      r.rotation.z = 0.35 + i * 0.35 + c.rArmZ * 0.3;
    });
    rig.torso.rotation.x = c.torsoX;
    rig.torso.rotation.y = c.torsoY;
    rig.head.rotation.x = c.headX;
    const hover = rig.hover ? this.hoverHeight + Math.sin(elapsed * 1.4) * 0.18 : 0;
    rig.hips.position.y = 1.55 + c.hipsY + hover + Math.abs(Math.sin(this.phase)) * 0.06 * c.legSwing;
    // Cloth ripples.
    for (let i = 0; i < rig.scarves.length; i++) {
      const mesh = rig.scarves[i] as THREE.Mesh;
      const base = this.scarfBase[i] as Float32Array;
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const len = -(base[base.length - 2] as number) || 1;
      for (let v = 0; v < pos.count; v++) {
        const bx = base[v * 3] as number;
        const by = base[v * 3 + 1] as number;
        const d = -by / len;
        arr[v * 3] = bx + Math.sin(elapsed * 2.2 + d * 5 + i) * 0.12 * d;
        arr[v * 3 + 2] = (base[v * 3 + 2] as number) + Math.cos(elapsed * 1.7 + d * 4 + i * 2) * 0.16 * d * d + speed * 0.05 * d * d;
      }
      pos.needsUpdate = true;
    }
    // Hit flash: a short, restrained brightening (a rifle lands five rounds a second, so a strong
    // flash would keep the whole body white and blooming for the length of a magazine).
    this.flash = Math.max(0, this.flash - dt * 10);
    this.bodyMat.emissiveIntensity = 0.22 + this.flash * 0.7;
    if (this.flash > 0 || this.flashApplied) {
      // Blend every design material toward a white glow, and put its own emissive back when the
      // flash has faded (a material with no emissive of its own must not stay lit).
      for (let i = 0; i < this.extraMats.length; i++) {
        const m = this.extraMats[i] as THREE.MeshStandardMaterial;
        const base = this.baseEmissive[i] as { color: THREE.Color; intensity: number };
        if (this.flash > 0) {
          m.emissive.copy(base.color).lerp(WHITE, this.flash);
          m.emissiveIntensity = base.intensity + (0.35 - base.intensity) * this.flash;
        } else {
          m.emissive.copy(base.color);
          m.emissiveIntensity = base.intensity;
        }
      }
      this.flashApplied = this.flash > 0;
    }
    this.coreMat.emissiveIntensity = 0.9 + Math.sin(elapsed * 4) * 0.2 + this.flash * 1.2;
    // Aura.
    const pos = this.auraGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = i * 0.9 + elapsed * 0.7;
      const r = 0.9 + Math.sin(i * 1.3 + elapsed) * 0.3;
      pos.setXYZ(i, Math.cos(a) * r, ((i / pos.count + elapsed * 0.1) % 1) * 3.4 + hover, Math.sin(a) * r);
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
