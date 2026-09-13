import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import { RAPIER } from '@/engine/Physics';
import type { System } from '@/engine/types';
import { Perlin } from '@/util/noise';
import { clamp, damp, dampAngle, degToRad } from '@/util/math';
import { gameStore } from '@/state/store';

/** What the rig follows. Positions are feet positions in world space. */
export interface CameraFollowTarget {
  readonly renderPosition: THREE.Vector3;
  readonly facingYaw: number;
  readonly horizontalSpeed: number;
  readonly movingForward: boolean;
  readonly excludeCollider: RAPIER.Collider | null;
}

const DEFAULT_BOOM = 4.8;
const PIVOT_HEIGHT = 2.35;
const SHOULDER_OFFSET = 0.55;
const DEFAULT_PITCH = degToRad(38);
const PITCH_MIN = degToRad(-12);
const PITCH_MAX = degToRad(58);
const PROBE_RADIUS = 0.35;
const EASE_BACK_SECONDS = 0.25;
const REALIGN_DELAY = 1.2;
const REALIGN_LERP = 6.0;
const NOISE_AMPLITUDE = degToRad(0.4);
const MOUSE_RAD_PER_PX = 0.0022;
const MIN_BOOM = 0.55;

/**
 * Third-person over-the-shoulder spring arm (§2). Numbers are the spec's: 4.8 m boom, 2.35 m pivot,
 * +0.55 m shoulder, 38° default pitch, -12°..+58° clamp, 0.35 m collision probe easing back over 0.25 s,
 * auto-realign after 1.2 s of forward travel (lerp 6), ±0.4° handheld Perlin noise while idle.
 */
export class CameraRig implements System {
  readonly name = 'camera';
  yaw = 0;
  pitch = DEFAULT_PITCH;
  boom = DEFAULT_BOOM;
  /** Cinematics take the camera: input, noise and follow are suspended. */
  cinematic = false;
  /** Impact shake amount (decays). */
  private shakeAmount = 0;
  private currentBoom = DEFAULT_BOOM;
  private forwardTimer = 0;
  private readonly noise = new Perlin(42);
  private readonly engine: Engine;
  private readonly target: CameraFollowTarget;
  private readonly probe = new RAPIER.Ball(PROBE_RADIUS);
  private readonly tmpPivot = new THREE.Vector3();
  private readonly tmpShoulder = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpDesired = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly identityRot = { x: 0, y: 0, z: 0, w: 1 };
  private lookInputThisFrame = false;

  constructor(engine: Engine, target: CameraFollowTarget, initialYaw = 0) {
    this.engine = engine;
    this.target = target;
    this.yaw = initialYaw;
    engine.camera.fov = 58;
    engine.camera.updateProjectionMatrix();
  }

  shake(amount: number): void {
    this.shakeAmount = Math.min(2, this.shakeAmount + amount);
  }

  /** Set absolute yaw/pitch (radians); used by tests and cinematics hand-off. */
  setYawPitch(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clamp(pitch, PITCH_MIN, PITCH_MAX);
    this.forwardTimer = 0;
  }

  /** Snap behind the target immediately (spawn, chapter transitions). */
  snapBehind(): void {
    this.yaw = this.target.facingYaw;
    this.pitch = DEFAULT_PITCH;
    this.currentBoom = this.boom;
    this.forwardTimer = 0;
    this.apply(0, true);
  }

  private readInput(dt: number): void {
    const input = this.engine.input;
    this.lookInputThisFrame = false;
    if (this.cinematic || input.gameplayBlocked) return;
    const f = input.frame;
    const s = gameStore.getState().settings;
    const invert = s.invertY ? -1 : 1;
    const lx = f.lookX * MOUSE_RAD_PER_PX * s.lookSensitivity;
    const ly = f.lookY * MOUSE_RAD_PER_PX * s.lookSensitivity * invert;
    if (lx !== 0 || ly !== 0) {
      this.yaw -= lx;
      this.pitch = clamp(this.pitch + ly, PITCH_MIN, PITCH_MAX);
      this.lookInputThisFrame = true;
      this.forwardTimer = 0;
    }
    if (input.pressed('cameraReset')) {
      this.yaw = this.target.facingYaw;
      this.pitch = DEFAULT_PITCH;
    }
    // Auto-realign: after 1.2 s of forward movement without camera input, settle behind the player.
    if (this.target.movingForward && this.target.horizontalSpeed > 0.5) this.forwardTimer += dt;
    else this.forwardTimer = 0;
    if (this.forwardTimer > REALIGN_DELAY) {
      this.yaw = dampAngle(this.yaw, this.target.facingYaw, REALIGN_LERP, dt);
      this.pitch = damp(this.pitch, DEFAULT_PITCH, REALIGN_LERP * 0.5, dt);
    }
  }

  lateUpdate(dt: number): void {
    if (this.cinematic) return;
    this.readInput(dt);
    this.apply(dt, false);
  }

  private apply(dt: number, snap: boolean): void {
    const cam = this.engine.camera;
    const t = this.engine.elapsed;
    let yaw = this.yaw;
    let pitch = this.pitch;
    // Handheld noise only while the player stands still.
    if (!this.cinematic && this.target.horizontalSpeed < 0.15) {
      yaw += this.noise.noise2(t * 0.35, 3.1) * NOISE_AMPLITUDE;
      pitch += this.noise.noise2(t * 0.42, 9.7) * NOISE_AMPLITUDE;
    }
    if (this.shakeAmount > 0) {
      yaw += this.noise.noise2(t * 31, 1.3) * 0.03 * this.shakeAmount;
      pitch += this.noise.noise2(t * 37, 5.9) * 0.025 * this.shakeAmount;
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.4);
    }
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    this.tmpForward.set(-sy, 0, -cy);
    this.tmpRight.set(cy, 0, -sy);
    this.tmpLook.set(-sy * cp, -sp, -cy * cp);
    this.tmpPivot.copy(this.target.renderPosition);
    this.tmpPivot.y += PIVOT_HEIGHT;

    // Shoulder offset, shortened if a wall is right beside the player.
    let shoulder = SHOULDER_OFFSET;
    const sideHit = this.engine.physics.raycast(this.tmpPivot, this.tmpRight, SHOULDER_OFFSET + PROBE_RADIUS, this.target.excludeCollider ?? undefined);
    if (sideHit) shoulder = Math.max(0, sideHit.distance - PROBE_RADIUS);
    this.tmpShoulder.copy(this.tmpPivot).addScaledVector(this.tmpRight, shoulder);

    // Spring-arm probe: sphere cast from the shoulder pivot back along the boom.
    this.tmpDesired.copy(this.tmpShoulder).addScaledVector(this.tmpLook, -this.boom);
    const vel = { x: this.tmpDesired.x - this.tmpShoulder.x, y: this.tmpDesired.y - this.tmpShoulder.y, z: this.tmpDesired.z - this.tmpShoulder.z };
    let allowed = this.boom;
    const hit = this.engine.physics.world.castShape(
      { x: this.tmpShoulder.x, y: this.tmpShoulder.y, z: this.tmpShoulder.z },
      this.identityRot,
      vel,
      this.probe,
      0,
      1,
      true,
      undefined,
      undefined,
      this.target.excludeCollider ?? undefined,
    );
    if (hit) allowed = Math.max(MIN_BOOM, hit.time_of_impact * this.boom);
    if (snap || allowed < this.currentBoom) this.currentBoom = allowed;
    else this.currentBoom = damp(this.currentBoom, allowed, 1 / EASE_BACK_SECONDS * 2.2, dt);

    this.tmpPos.copy(this.tmpShoulder).addScaledVector(this.tmpLook, -this.currentBoom);
    cam.position.copy(this.tmpPos);
    cam.lookAt(this.tmpPos.x + this.tmpLook.x, this.tmpPos.y + this.tmpLook.y, this.tmpPos.z + this.tmpLook.z);
  }

  /** Flat forward vector of the camera (for movement relative to view). */
  get forwardFlat(): THREE.Vector3 {
    return this.tmpForward;
  }
  get rightFlat(): THREE.Vector3 {
    return this.tmpRight;
  }
  get hadLookInput(): boolean {
    return this.lookInputThisFrame;
  }
}
