import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import { RAPIER, type SurfaceMaterial } from '@/engine/Physics';
import type { System } from '@/engine/types';
import { gameStore } from '@/state/store';
import { clamp, damp, dampAngle, degToRad } from '@/util/math';
import type { CameraFollowTarget } from './CameraRig';

export type LocomotionState = 'idle' | 'walk' | 'jog' | 'sprint' | 'air' | 'land-soft' | 'land-hard' | 'crouch' | 'crouch-move';

export interface PlayerTuning {
  radius: number;
  height: number;
  walkSpeed: number;
  jogSpeed: number;
  sprintSpeed: number;
  acceleration: number;
  friction: number;
  airControl: number;
  stepOffset: number;
  slopeLimitDeg: number;
  coyoteTimeMs: number;
  inputBufferMs: number;
  gravity: number;
  jumpHeight: number;
  staminaDrain: number;
  staminaRegen: number;
  staminaRegenDelay: number;
}

export const DEFAULT_TUNING: PlayerTuning = {
  radius: 0.4,
  height: 1.8,
  walkSpeed: 2.2,
  jogSpeed: 4.4,
  sprintSpeed: 6.6,
  acceleration: 12,
  friction: 14,
  airControl: 0.25,
  stepOffset: 0.45,
  slopeLimitDeg: 48,
  coyoteTimeMs: 120,
  inputBufferMs: 150,
  gravity: 16,
  jumpHeight: 0.9,
  staminaDrain: 22,
  staminaRegen: 16,
  staminaRegenDelay: 0.8,
};

export interface PlayerEvents {
  onFootstep?(surface: SurfaceMaterial, position: THREE.Vector3, intensity: number): void;
  onLand?(surface: SurfaceMaterial, position: THREE.Vector3, hard: boolean): void;
  onJump?(): void;
}

/** Kinematic capsule character (Rapier KCC) with the §5 feel numbers. Feet-origin positions. */
export class PlayerController implements System, CameraFollowTarget {
  readonly name = 'player';
  readonly tuning: PlayerTuning;
  readonly position = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  readonly renderPosition = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facingYaw = 0;
  state: LocomotionState = 'idle';
  grounded = false;
  crouching = false;
  stamina = 100;
  surface: SurfaceMaterial = 'dry-stone';
  /** Locks movement input (cinematics, interactions). Gravity still applies. */
  movementLocked = false;
  /** Multiplier for movement speed (memory sequences, injuries). */
  speedScale = 1;
  /** Extra multiplier while aiming down the Astra. */
  aimSlow = 1;
  /** When true (a weapon is out) the hero faces where the camera looks, strafing like a shooter. */
  faceViewYaw = false;
  events: PlayerEvents = {};
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly engine: Engine;
  private readonly getViewYaw: () => number;
  private timeSinceGrounded = 0;
  private staminaTimer = 0;
  private sprintLockout = false;
  private sprintLatch = false;
  private lastVerticalSpeed = 0;
  private strideAccumulator = 0;
  private landTimer = 0;
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpWish = new THREE.Vector3();
  private readonly tmpDelta = new THREE.Vector3();
  private readonly collisionScratch = new RAPIER.CharacterCollision();
  private readonly downDir = new THREE.Vector3(0, -1, 0);
  moveInputForward = 0;
  moveInputMagnitude = 0;
  /** Diagnostics: how often the KCC returned less horizontal movement than requested. */
  clipCount = 0;
  lastClip = { want: 0, got: 0, y: 0 };
  /** Seconds of invulnerability left after a dodge (encounters read this). */
  dodgeTimer = 0;
  /** External horizontal push (m/s) applied this fixed step on top of input movement; cleared each step. */
  readonly externalPush = new THREE.Vector3();

  constructor(engine: Engine, spawn: THREE.Vector3, getViewYaw: () => number, tuning: Partial<PlayerTuning> = {}) {
    this.engine = engine;
    this.getViewYaw = getViewYaw;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    const t = this.tuning;
    this.position.copy(spawn);
    this.prevPosition.copy(spawn);
    this.renderPosition.copy(spawn);
    const world = engine.physics.world;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + t.height / 2, spawn.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(t.height / 2 - t.radius, t.radius), this.body);
    this.kcc = world.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(t.stepOffset, 0.22, true);
    this.kcc.setMaxSlopeClimbAngle(degToRad(t.slopeLimitDeg));
    this.kcc.setMinSlopeSlideAngle(degToRad(t.slopeLimitDeg + 2));
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(70);
  }

  get excludeCollider(): RAPIER.Collider {
    return this.collider;
  }
  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }
  get movingForward(): boolean {
    return this.moveInputForward > 0.3 && this.moveInputMagnitude > 0.3;
  }
  get holdingWeapon(): boolean {
    return this.faceViewYaw;
  }
  get capsuleHeight(): number {
    return this.crouching ? this.tuning.height * 0.72 : this.tuning.height;
  }

  /** Quick sidestep/backstep used by encounters: sets horizontal velocity and grants 0.45 s of i-frames. */
  dodge(dirX: number, dirZ: number, speed = 9): void {
    const m = Math.hypot(dirX, dirZ) || 1;
    this.velocity.x = (dirX / m) * speed;
    this.velocity.z = (dirZ / m) * speed;
    this.dodgeTimer = 0.45;
  }

  teleport(position: THREE.Vector3, yaw?: number): void {
    this.position.copy(position);
    this.prevPosition.copy(position);
    this.renderPosition.copy(position);
    this.velocity.set(0, 0, 0);
    if (yaw !== undefined) this.facingYaw = yaw;
    this.body.setNextKinematicTranslation({ x: position.x, y: position.y + this.capsuleHeight / 2, z: position.z });
    this.body.setTranslation({ x: position.x, y: position.y + this.capsuleHeight / 2, z: position.z }, true);
  }

  private setCrouch(v: boolean): void {
    if (v === this.crouching) return;
    if (!v) {
      // Only stand if there is head room.
      const hit = this.engine.physics.raycast(this.position.clone().setY(this.position.y + this.capsuleHeight - 0.05), new THREE.Vector3(0, 1, 0), this.tuning.height - this.capsuleHeight + 0.1, this.collider);
      if (hit) return;
    }
    this.crouching = v;
    const h = this.capsuleHeight;
    this.collider.setHalfHeight(h / 2 - this.tuning.radius);
    this.body.setTranslation({ x: this.position.x, y: this.position.y + h / 2, z: this.position.z }, true);
  }

  fixedUpdate(step: number): void {
    const t = this.tuning;
    const input = this.engine.input;
    const f = input.frame;
    this.prevPosition.copy(this.position);
    if (this.dodgeTimer > 0) this.dodgeTimer -= step;

    const yaw = this.getViewYaw();
    this.tmpForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.tmpRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    let mx = f.moveX;
    let my = f.moveY;
    if (this.movementLocked || input.gameplayBlocked) {
      mx = 0;
      my = 0;
    }
    const mag = clamp(Math.hypot(mx, my), 0, 1);
    this.moveInputForward = my;
    this.moveInputMagnitude = mag;
    this.tmpWish.copy(this.tmpForward).multiplyScalar(my).addScaledVector(this.tmpRight, mx);
    if (mag > 0) this.tmpWish.normalize();

    if (!this.movementLocked && !input.gameplayBlocked) {
      if (input.pressed('crouch')) this.setCrouch(!this.crouching);
    }

    // Stamina. Shift is hold-to-run by default; the "toggle" setting latches it until the player stops.
    if (gameStore.getState().settings.sprintToggle) {
      if (!this.movementLocked && !input.gameplayBlocked && input.pressed('sprint')) this.sprintLatch = !this.sprintLatch;
      if (mag < 0.1 || this.movementLocked) this.sprintLatch = false;
    } else this.sprintLatch = false;
    const wantsSprint = (input.sprintRequested || this.sprintLatch) && mag > 0.5 && !this.crouching && !this.movementLocked;
    if (this.stamina <= 3) this.sprintLockout = true;
    if (this.stamina >= 25) this.sprintLockout = false;
    const sprinting = wantsSprint && !this.sprintLockout && this.grounded;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - t.staminaDrain * step);
      this.staminaTimer = 0;
    } else {
      this.staminaTimer += step;
      if (this.staminaTimer > t.staminaRegenDelay) this.stamina = Math.min(100, this.stamina + t.staminaRegen * step);
    }

    let targetSpeed = 0;
    if (mag > 0.02) {
      if (this.crouching) targetSpeed = t.walkSpeed * 0.85;
      else if (sprinting) targetSpeed = t.sprintSpeed;
      else if (mag < 0.55) targetSpeed = t.walkSpeed;
      else targetSpeed = t.jogSpeed;
      targetSpeed *= this.speedScale * this.aimSlow * (this.surface === 'water' ? 0.72 : 1);
      // Analog: scale walk/jog by stick deflection so partial pushes creep.
      if (!sprinting && !this.crouching && mag < 0.55) targetSpeed *= clamp(mag / 0.55, 0.35, 1);
    }

    // Horizontal acceleration / friction.
    const control = this.grounded ? 1 : t.airControl;
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    if (targetSpeed > 0) {
      const tx = this.tmpWish.x * targetSpeed;
      const tz = this.tmpWish.z * targetSpeed;
      const dx = tx - vx;
      const dz = tz - vz;
      const dl = Math.hypot(dx, dz);
      const maxChange = t.acceleration * control * step;
      if (dl <= maxChange) {
        this.velocity.x = tx;
        this.velocity.z = tz;
      } else {
        this.velocity.x = vx + (dx / dl) * maxChange;
        this.velocity.z = vz + (dz / dl) * maxChange;
      }
    } else {
      const sp = Math.hypot(vx, vz);
      const drop = t.friction * control * step;
      if (sp <= drop) this.velocity.x = this.velocity.z = 0;
      else {
        const k = (sp - drop) / sp;
        this.velocity.x = vx * k;
        this.velocity.z = vz * k;
      }
    }

    // Vertical.
    this.velocity.y -= t.gravity * step;
    if (this.velocity.y < -30) this.velocity.y = -30;
    this.timeSinceGrounded = this.grounded ? 0 : this.timeSinceGrounded + step;
    const canJump = this.grounded || this.timeSinceGrounded * 1000 <= t.coyoteTimeMs;
    if (!this.movementLocked && canJump && !this.crouching && input.consumeBuffered('jump', t.inputBufferMs)) {
      this.velocity.y = Math.sqrt(2 * t.gravity * t.jumpHeight);
      this.grounded = false;
      this.timeSinceGrounded = t.coyoteTimeMs / 1000 + 1;
      this.events.onJump?.();
    }

    // Move the capsule (plus any external push such as an asura's pull).
    this.tmpDelta.copy(this.velocity).multiplyScalar(step);
    this.tmpDelta.x += this.externalPush.x * step;
    this.tmpDelta.z += this.externalPush.z * step;
    this.externalPush.set(0, 0, 0);
    this.kcc.computeColliderMovement(this.collider, { x: this.tmpDelta.x, y: this.tmpDelta.y, z: this.tmpDelta.z }, undefined, undefined, (c) => c !== this.collider);
    const moved = this.kcc.computedMovement();
    const pos = this.body.translation();
    const next = { x: pos.x + moved.x, y: pos.y + moved.y, z: pos.z + moved.z };
    this.body.setNextKinematicTranslation(next);
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();
    // Rest lightly on the ground: pushing hard into the floor makes the KCC's depenetration cancel whole
    // steps of horizontal motion. Snap-to-ground keeps contact on slopes and steps.
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -0.05;
    if (this.velocity.y > 0 && moved.y < this.tmpDelta.y - 1e-4) this.velocity.y = 0; // head bump
    // Wall contacts kill velocity into the wall so we do not keep pushing — but only when a real wall
    // (steep contact normal) was hit; a ground-contact glitch frame must not collapse the run.
    const want = Math.hypot(this.tmpDelta.x, this.tmpDelta.z);
    const got = Math.hypot(moved.x, moved.z);
    if (want > 1e-4 && got < want * 0.6 && step > 0 && this.touchingWall()) {
      this.clipCount++;
      this.lastClip = { want, got, y: moved.y };
      this.velocity.x = moved.x / step;
      this.velocity.z = moved.z / step;
    }
    this.position.set(next.x, next.y - this.capsuleHeight / 2, next.z);

    // Surface under foot.
    this.surface = this.findSurface();

    // Landing.
    if (this.grounded && !wasGrounded) {
      const hard = this.lastVerticalSpeed < -7.5;
      this.landTimer = hard ? 0.45 : 0.18;
      this.events.onLand?.(this.surface, this.position, hard);
    }
    this.lastVerticalSpeed = this.velocity.y;

    // Facing: the movement direction, or the view direction while a weapon is out.
    const hs = this.horizontalSpeed;
    if (this.faceViewYaw && !this.movementLocked) this.facingYaw = dampAngle(this.facingYaw, this.getViewYaw(), 16, step);
    else if (hs > 0.2 && mag > 0.02) {
      const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      this.facingYaw = dampAngle(this.facingYaw, targetYaw, 12, step);
    }

    // Footsteps by stride distance.
    if (this.grounded && hs > 0.3) {
      const stride = this.crouching ? 0.9 : sprinting ? 1.9 : hs > 3.5 ? 1.45 : 1.1;
      this.strideAccumulator += hs * step;
      if (this.strideAccumulator >= stride) {
        this.strideAccumulator -= stride;
        this.events.onFootstep?.(this.surface, this.position, clamp(hs / t.sprintSpeed, 0.35, 1));
      }
    } else this.strideAccumulator = stride_reset(this.strideAccumulator);

    // State.
    if (this.landTimer > 0) {
      this.landTimer -= step;
      this.state = this.landTimer > 0.2 ? 'land-hard' : 'land-soft';
    } else if (!this.grounded && this.timeSinceGrounded > 0.08) this.state = 'air';
    else if (this.crouching) this.state = hs > 0.3 ? 'crouch-move' : 'crouch';
    else if (hs < 0.25) this.state = 'idle';
    else if (sprinting && hs > t.jogSpeed + 0.3) this.state = 'sprint';
    else if (hs < t.walkSpeed + 0.6) this.state = 'walk';
    else this.state = 'jog';
  }

  /** True if any KCC contact this step has a steep (wall-like) normal. */
  private touchingWall(): boolean {
    const n = this.kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = this.kcc.computedCollision(i, this.collisionScratch);
      if (c && Math.abs(c.normal1.y) < 0.5) return true;
    }
    return false;
  }

  private findSurface(): SurfaceMaterial {
    const n = this.kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = this.kcc.computedCollision(i, this.collisionScratch);
      if (c && c.normal1.y > 0.5 && c.collider) return this.engine.physics.surfaceOf(c.collider, this.position);
    }
    const origin = new THREE.Vector3(this.position.x, this.position.y + 0.3, this.position.z);
    const hit = this.engine.physics.raycast(origin, this.downDir, 0.8, this.collider);
    return hit ? this.engine.physics.surfaceOf(hit.collider, hit.point) : this.surface;
  }

  update(): void {
    const a = clamp(this.engine.alpha, 0, 1);
    this.renderPosition.lerpVectors(this.prevPosition, this.position, a);
  }

  dispose(): void {
    const world = this.engine.physics.world;
    world.removeCharacterController(this.kcc);
    world.removeRigidBody(this.body);
  }
}

const stride_reset = (acc: number): number => damp(acc, 0.6, 4, 1 / 60);
