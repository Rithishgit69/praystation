import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import { gameStore } from '@/state/store';
import { glowSprite } from '@/world/TextureGen';
import type { System } from '@/engine/types';
import { CharacterMesh, type HeroVariant } from './CharacterMesh';
import type { PlayerController } from './PlayerController';

/** Binds the physics controller to the animated character mesh. */
export class PlayerVisual implements System {
  readonly name = 'player-visual';
  mesh: CharacterMesh;
  /** Objects carried in the right hand (the Astra); re-attached when the traveller is rebuilt. */
  private readonly handHeld: THREE.Object3D[] = [];
  /** Hand lantern: the traveller's own warm light through the forest; goes out at the first mural. */
  readonly lantern = new THREE.Group();
  readonly lanternLight: THREE.PointLight;
  private readonly lanternFlame: THREE.Sprite;
  private readonly memoryMat = new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xd9a55a, emissiveIntensity: 1.1, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.92 });
  private readonly originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private memoryForm = false;

  constructor(
    private readonly engine: Engine,
    private readonly controller: PlayerController,
  ) {
    this.mesh = new CharacterMesh(gameStore.getState().profile.hero);
    engine.scene.add(this.mesh.root);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x3e2d22, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffb15a, emissiveIntensity: 1.4, transparent: true, opacity: 0.7, roughness: 0.2 }));
    this.lanternFlame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(64), color: 0xffb15a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.lanternFlame.scale.set(0.6, 0.6, 1);
    this.lanternLight = new THREE.PointLight(0xffb15a, 9, 9, 2);
    this.lantern.add(cage, glass, this.lanternFlame, this.lanternLight);
    this.lantern.position.set(-0.36, 0.72, 0.22);
    this.mesh.root.add(this.lantern);
    this.setLantern(gameStore.getState().flags['lantern:lit'] !== false, true);
  }

  /** Carry something in the right hand; survives a rebuild of the traveller. */
  attachToRightHand(obj: THREE.Object3D): void {
    this.handHeld.push(obj);
    this.mesh.rightHand.add(obj);
  }

  /** Swap the traveller (male / female); keeps the lantern, the weapon and the pose. */
  setVariant(variant: HeroVariant): void {
    if (variant === this.mesh.variant) return;
    const old = this.mesh;
    const hold = old.holdWeapon;
    this.engine.scene.remove(old.root);
    old.root.remove(this.lantern);
    for (const h of this.handHeld) old.rightHand.remove(h);
    old.dispose();
    this.originalMaterials.clear();
    this.mesh = new CharacterMesh(variant);
    this.mesh.holdWeapon = hold;
    this.mesh.aim = old.aim;
    this.mesh.root.add(this.lantern);
    for (const h of this.handHeld) this.mesh.rightHand.add(h);
    this.engine.scene.add(this.mesh.root);
    if (this.memoryForm) {
      this.memoryForm = false;
      this.setMemoryForm(true);
    }
  }

  setLantern(lit: boolean, immediate = false): void {
    const target = lit ? 1 : 0;
    const apply = (v: number): void => {
      this.lanternLight.intensity = 9 * v;
      this.lanternFlame.material.opacity = 0.35 * v;
      (this.lantern.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.emissiveIntensity = 1.4 * v;
    };
    if (immediate) apply(target);
    else {
      const o = { v: this.lanternLight.intensity / 9 };
      gsap.to(o, { v: target, duration: lit ? 1.2 : 0.6, ease: 'power2.in', onUpdate: () => apply(o.v) });
    }
  }

  /** Inside a memory the traveller is a luminous form: the deity is embodied, never puppeted (GDD §25). */
  setMemoryForm(on: boolean): void {
    if (on === this.memoryForm) return;
    this.memoryForm = on;
    this.lantern.visible = !on;
    this.mesh.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || this.lantern.children.includes(m) || m === (this.lantern as unknown as THREE.Mesh)) return;
      if (on) {
        if (!this.originalMaterials.has(m)) this.originalMaterials.set(m, m.material);
        m.material = this.memoryMat;
      } else {
        const orig = this.originalMaterials.get(m);
        if (orig) m.material = orig;
      }
    });
  }
  private prevYaw = 0;
  private yawRate = 0;

  /** What the traveller looks at when no weapon is out (the villain on its card); null looks ahead. */
  lookTarget: THREE.Vector3 | null = null;

  /** Weapon recoil / a hit: forwarded to the character's animation. */
  kick(amount = 1): void {
    this.mesh.kick(amount);
  }
  flinch(): void {
    this.mesh.flinch();
  }

  update(dt: number, elapsed: number): void {
    const c = this.controller;
    this.mesh.root.position.copy(c.renderPosition);
    this.mesh.root.rotation.y = c.facingYaw;
    if (dt > 0) {
      const d = Math.atan2(Math.sin(c.facingYaw - this.prevYaw), Math.cos(c.facingYaw - this.prevYaw));
      this.yawRate += ((d / dt) - this.yawRate) * Math.min(1, dt * 10);
    }
    this.prevYaw = c.facingYaw;
    const mo = this.mesh.motion;
    mo.dodge = c.dodgeProgress;
    mo.dodgeAngle = c.dodgeAngle;
    mo.moveAngle = c.moveAngle;
    mo.yawRate = this.yawRate;
    this.mesh.lookTarget = this.lookTarget;
    this.mesh.animate(dt, c.state, c.horizontalSpeed, c.tuning.sprintSpeed, elapsed);
  }
  dispose(): void {
    this.engine.scene.remove(this.mesh.root);
    this.mesh.dispose();
    this.memoryMat.dispose();
  }
}
