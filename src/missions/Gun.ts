import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import type { MaterialLibrary } from '@/world/Materials';
import { clamp, damp } from '@/util/math';

export interface Shootable {
  /** World-space centre of the hit sphere and its radius. Return null when not targetable. */
  hitSphere(): { center: THREE.Vector3; radius: number } | null;
  onShot(damage: number, point: THREE.Vector3): void;
  /** Shots absorbed by a shield return true (no damage, sparks only). */
  readonly alive: boolean;
}

const MAG = 12;
const FIRE_INTERVAL = 1 / 5;
const RELOAD_SECONDS = 1.5;
const DAMAGE = 8;
const SPREAD_HIP = 1.6 * (Math.PI / 180);
const SPREAD_AIM = 0.4 * (Math.PI / 180);
const AIM_ASSIST = 3.5 * (Math.PI / 180);
const RANGE = 90;

/**
 * The Astra: the temple's gun of remembered light. Third-person hitscan from the camera crosshair with
 * spread, light aim assist, magazine + reload, tracers, muzzle flash and recoil. Targets register as
 * Shootables; walls block shots (physics ray).
 */
export class Gun implements System {
  readonly name = 'gun';
  equipped = false;
  ammo = MAG;
  readonly magSize = MAG;
  reloading = 0;
  aiming = false;
  private cooldown = 0;
  private readonly targets = new Set<Shootable>();
  private readonly model: THREE.Group;
  private readonly muzzle = new THREE.Object3D();
  private readonly flashLight: THREE.PointLight;
  private readonly flashSprite: THREE.Sprite;
  private flashTimer = 0;
  private readonly tracers: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private readonly tracerGeo: THREE.CylinderGeometry;
  private readonly tracerMat: THREE.MeshBasicMaterial;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpHit = new THREE.Vector3();
  private readonly tmpMuzzle = new THREE.Vector3();
  private fov = 58;
  onFire: ((hit: boolean) => void) | null = null;
  shotsFired = 0;
  shotsHit = 0;

  constructor(
    private readonly engine: Engine,
    lib: MaterialLibrary,
    private readonly player: PlayerController,
    private readonly visual: PlayerVisual,
    private readonly rig: CameraRig,
    private readonly audio: AudioSystem,
  ) {
    // Rifle model: stock, receiver, long barrel, a ring of light at the muzzle.
    this.model = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 0.5, metalness: 0.7 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb15a, emissiveIntensity: 1.6 });
    const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      this.model.add(m);
      return m;
    };
    part(new THREE.BoxGeometry(0.06, 0.09, 0.28), wood, 0, -0.02, -0.14); // stock
    part(new THREE.BoxGeometry(0.06, 0.07, 0.3), dark, 0, 0.0, 0.1); // receiver
    part(new THREE.CylinderGeometry(0.014, 0.016, 0.62, 10), dark, 0, 0.015, 0.55, Math.PI / 2); // barrel
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), wood, 0, -0.04, 0.32, Math.PI / 2); // foregrip
    part(new THREE.TorusGeometry(0.03, 0.008, 6, 16), glow, 0, 0.015, 0.84); // muzzle ring of light
    part(new THREE.BoxGeometry(0.01, 0.03, 0.02), dark, 0, 0.06, 0.2); // sight
    this.muzzle.position.set(0, 0.015, 0.86);
    this.model.add(this.muzzle);
    this.flashLight = new THREE.PointLight(0xffc46b, 0, 6, 2);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashSprite.scale.set(0.5, 0.5, 1);
    this.muzzle.add(this.flashLight, this.flashSprite);
    // Held in the right hand: forearm space, pointing forward.
    this.model.position.set(0.02, -0.28, 0.16);
    this.model.rotation.set(0.95, 0, 0);
    this.model.visible = false;
    this.visual.attachToRightHand(this.model);
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  }

  setEquipped(v: boolean): void {
    this.equipped = v;
    this.model.visible = v;
    this.visual.mesh.holdWeapon = v;
    this.engine.input.touch.setWeaponButtons(v);
    if (!v) this.aiming = false;
  }

  addTarget(t: Shootable): void {
    this.targets.add(t);
  }
  removeTarget(t: Shootable): void {
    this.targets.delete(t);
  }
  clearTargets(): void {
    this.targets.clear();
  }

  reload(): void {
    if (this.reloading > 0 || this.ammo === this.magSize) return;
    this.reloading = RELOAD_SECONDS;
    this.audio.play('astra-reload', { volume: 0.6 });
  }

  private fire(): void {
    const cam = this.engine.camera;
    cam.getWorldDirection(this.tmpDir);
    this.tmpOrigin.copy(cam.position);
    // Spread.
    const spread = this.aiming ? SPREAD_AIM : SPREAD_HIP * (this.player.horizontalSpeed > 3 ? 1.8 : 1);
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(spread);
    this.tmpDir.add(jitter).normalize();
    // Aim assist: pull toward the nearest target within a small cone.
    let best: Shootable | null = null;
    let bestAngle = AIM_ASSIST;
    const toT = new THREE.Vector3();
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hs = t.hitSphere();
      if (!hs) continue;
      toT.copy(hs.center).sub(this.tmpOrigin);
      const dist = toT.length();
      if (dist > RANGE) continue;
      toT.divideScalar(dist);
      const angle = Math.acos(clamp(this.tmpDir.dot(toT), -1, 1));
      const cone = Math.max(bestAngle, Math.atan(hs.radius / dist));
      if (angle < cone && angle < bestAngle + Math.atan(hs.radius / dist)) {
        best = t;
        bestAngle = angle;
      }
    }
    if (best) {
      const hs = best.hitSphere();
      if (hs) this.tmpDir.copy(hs.center).sub(this.tmpOrigin).normalize();
    }
    // Ray vs targets (sphere) and the world.
    let hitDist = RANGE;
    let hitTarget: Shootable | null = null;
    const oc = new THREE.Vector3();
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hs = t.hitSphere();
      if (!hs) continue;
      oc.copy(this.tmpOrigin).sub(hs.center);
      const b = oc.dot(this.tmpDir);
      const c = oc.dot(oc) - hs.radius * hs.radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const d = -b - Math.sqrt(disc);
      if (d > 0 && d < hitDist) {
        hitDist = d;
        hitTarget = t;
      }
    }
    const wall = this.engine.physics.raycast(this.tmpOrigin, this.tmpDir, hitDist, this.player.collider);
    if (wall && wall.distance < hitDist) {
      hitDist = wall.distance;
      hitTarget = null;
    }
    this.tmpHit.copy(this.tmpOrigin).addScaledVector(this.tmpDir, hitDist);
    if (hitTarget) hitTarget.onShot(DAMAGE, this.tmpHit.clone());
    this.shotsFired++;
    if (hitTarget) this.shotsHit++;
    this.onFire?.(hitTarget !== null);
    // Feedback.
    this.ammo--;
    this.cooldown = FIRE_INTERVAL;
    this.flashTimer = 0.07;
    this.rig.shake(0.18);
    this.audio.play('astra-shot', { volume: 0.75, rate: 0.95 + Math.random() * 0.1 });
    this.muzzle.getWorldPosition(this.tmpMuzzle);
    const len = this.tmpMuzzle.distanceTo(this.tmpHit);
    const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    tracer.position.copy(this.tmpMuzzle).lerp(this.tmpHit, 0.5);
    tracer.scale.set(1, 1, len);
    tracer.lookAt(this.tmpHit);
    this.engine.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.09 });
  }

  update(dt: number): void {
    const input = this.engine.input;
    const cam = this.engine.camera;
    const wantAim = this.equipped && input.held('aim') && !input.gameplayBlocked;
    this.aiming = wantAim;
    this.fov = damp(this.fov, wantAim ? 44 : 58, 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = this.magSize;
      }
    }
    if (this.equipped && !input.gameplayBlocked && !this.player.movementLocked) {
      if (input.pressed('reload')) this.reload();
      if (input.held('fire') && this.cooldown === 0 && this.reloading === 0) {
        if (this.ammo > 0) this.fire();
        else {
          if (input.pressed('fire')) this.audio.play('astra-empty', { volume: 0.5, rate: 0.7 });
          this.reload();
        }
      }
    }
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.flashLight.intensity = this.flashTimer > 0 ? 40 : 0;
    this.flashSprite.material.opacity = this.flashTimer > 0 ? 0.9 : 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i] as (typeof this.tracers)[number];
      t.life -= dt;
      if (t.life <= 0) {
        this.engine.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const t of this.tracers) this.engine.scene.remove(t.mesh);
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    this.flashSprite.material.dispose();
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.model.removeFromParent();
  }
}
