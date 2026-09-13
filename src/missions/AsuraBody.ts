import * as THREE from 'three';
import type { Physics } from '@/engine/Physics';
import { RAPIER } from '@/engine/Physics';
import { degToRad } from '@/util/math';

/**
 * Ground- and obstacle-aware movement for asuras and their shades: a kinematic capsule driven by a
 * Rapier character controller, so they climb stairs, stay on floors of different heights and slide
 * around pillars and block stacks instead of walking through them. The player's capsule is ignored
 * (the asura may close to melee range); the player's own controller treats the asura as solid.
 */
export class AsuraBody {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private readonly kcc: RAPIER.KinematicCharacterController;
  private readonly halfHeight: number;
  private vy = 0;
  grounded = false;
  /** Set when the last move was cut short by a wall (steep contact). */
  blocked = false;
  private readonly scratch = new RAPIER.CharacterCollision();

  constructor(
    private readonly physics: Physics,
    feet: THREE.Vector3,
    private readonly radius: number,
    height: number,
    private readonly ignore: () => Iterable<RAPIER.Collider>,
  ) {
    const world = physics.world;
    this.halfHeight = height / 2;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(feet.x, feet.y + this.halfHeight, feet.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(Math.max(0.05, this.halfHeight - radius), radius), this.body);
    this.kcc = world.createCharacterController(0.04);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(Math.min(0.9, height * 0.28), 0.3, true);
    this.kcc.setMaxSlopeClimbAngle(degToRad(52));
    this.kcc.setMinSlopeSlideAngle(degToRad(56));
    this.kcc.enableSnapToGround(0.6);
  }

  private isIgnored(c: RAPIER.Collider): boolean {
    if (c === this.collider) return true;
    for (const x of this.ignore()) if (x === c) return true;
    return false;
  }

  /** Move the feet by (dx, dz) over `dt`, with gravity; `feet` is updated to the new feet position. */
  move(feet: THREE.Vector3, dx: number, dz: number, dt: number): void {
    this.vy -= 9.81 * dt;
    if (this.vy < -25) this.vy = -25;
    const desired = { x: dx, y: this.vy * dt, z: dz };
    this.kcc.computeColliderMovement(this.collider, desired, undefined, undefined, (c) => !this.isIgnored(c));
    const moved = this.kcc.computedMovement();
    const pos = this.body.translation();
    const next = { x: pos.x + moved.x, y: pos.y + moved.y, z: pos.z + moved.z };
    this.body.setNextKinematicTranslation(next);
    this.body.setTranslation(next, true);
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = -0.05;
    const want = Math.hypot(dx, dz);
    const got = Math.hypot(moved.x, moved.z);
    this.blocked = want > 1e-4 && got < want * 0.5 && this.touchingWall();
    feet.set(next.x, next.y - this.halfHeight, next.z);
  }

  private touchingWall(): boolean {
    const n = this.kcc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = this.kcc.computedCollision(i, this.scratch);
      if (c && Math.abs(c.normal1.y) < 0.5) return true;
    }
    return false;
  }

  /** Place the feet at (x, z), dropping onto whatever floor is below (or keeping y when nothing is). */
  teleport(feet: THREE.Vector3, x: number, z: number, y = feet.y): void {
    const origin = new THREE.Vector3(x, y + 3, z);
    const hit = this.physics.raycast(origin, new THREE.Vector3(0, -1, 0), 12, this.collider, (c) => !this.isIgnored(c));
    const fy = hit ? hit.point.y : y;
    feet.set(x, fy, z);
    this.body.setTranslation({ x, y: fy + this.halfHeight, z }, true);
    this.body.setNextKinematicTranslation({ x, y: fy + this.halfHeight, z });
    this.vy = 0;
  }

  get capsuleRadius(): number {
    return this.radius;
  }

  dispose(): void {
    const world = this.physics.world;
    world.removeCharacterController(this.kcc);
    world.removeCollider(this.collider, false);
    world.removeRigidBody(this.body);
  }
}
