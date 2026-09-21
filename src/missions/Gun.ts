import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { ParticleSystem } from '@/engine/Particles';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import type { MaterialLibrary } from '@/world/Materials';
import { clamp, damp } from '@/util/math';
import { WEAPONS, weaponById, type WeaponDef, type WeaponId } from './WeaponData';

export interface Shootable {
  /** World-space centre of the hit sphere and its radius. Return null when not targetable. */
  hitSphere(): { center: THREE.Vector3; radius: number } | null;
  onShot(damage: number, point: THREE.Vector3): void;
  /** A heavy hit (the Vajra up close) may knock the target out of its action. */
  onStagger?(): void;
  readonly alive: boolean;
}

const AIM_ASSIST = 2.5 * (Math.PI / 180);
const DEG = Math.PI / 180;
const UP_AXIS = new THREE.Vector3(0, 1, 0);
const ORIGIN = new THREE.Vector3(0, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

interface HeroShot {
  weapon: WeaponDef;
  mesh: THREE.Object3D;
  readonly pos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  life: number;
  damage: number;
  /** Targets already hit on this pass (pierce / disc). */
  hit: Set<Shootable>;
  phase: 'out' | 'back' | 'stuck';
  traveled: number;
  light: THREE.PointLight | null;
}

/**
 * The hero's Astras: four weapons sharing one firing core — the Astra (hitscan rifle), the Dhanush
 * (draw-and-release bow that pierces), the Chakra (returning disc) and the Vajra (close-range burst).
 * Fires from the camera's crosshair with spread that blooms and settles, recoil that kicks the camera,
 * light aim assist, impact sparks, tracers and a hit marker. Weapons unlock task by task and switch
 * with 1–4, the mouse wheel, the gamepad d-pad or the touch weapon button.
 */
export class Gun implements System {
  readonly name = 'gun';
  equipped = false;
  ammo = 12;
  reloading = 0;
  aiming = false;
  /** 0..1 draw of the bow (charge mode). */
  charge = 0;
  /** Highest task reached: weapons with unlockTask ≤ this are available (0 until the temple grants the first). */
  unlockedTask = 0;
  private def: WeaponDef = WEAPONS[0] as WeaponDef;
  private cooldown = 0;
  private bloom = 0;
  private readonly targets = new Set<Shootable>();
  private readonly models = new Map<WeaponId, THREE.Group>();
  private readonly holder = new THREE.Group();
  private readonly muzzles = new Map<WeaponId, THREE.Object3D>();
  private readonly flashLight: THREE.PointLight;
  private readonly flashSprite: THREE.Sprite;
  private flashTimer = 0;
  private readonly tracers: Array<{ mesh: THREE.Mesh; life: number }> = [];
  private readonly tracerGeo: THREE.CylinderGeometry;
  private readonly tracerMat: THREE.MeshBasicMaterial;
  private readonly shots: HeroShot[] = [];
  private readonly sparks: ParticleSystem;
  private readonly arrowGeo: THREE.Group;
  private readonly discGeo: THREE.Group;
  private bowString: THREE.Mesh | null = null;
  private bowArrow: THREE.Object3D | null = null;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpMuzzle = new THREE.Vector3();
  private readonly tmpV = new THREE.Vector3();
  private fov = 58;
  private fireHeldLast = false;
  /** Rounds in each magazine when the weapon is put away, so switching never refills. */
  private readonly stored = new Map<WeaponId, number>();
  onFire: ((hit: boolean) => void) | null = null;
  /** Called on a confirmed hit (hit marker) and on a weapon change (HUD). */
  onHit: ((point: THREE.Vector3, damage: number) => void) | null = null;
  onWeaponChange: ((def: WeaponDef) => void) | null = null;
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
    this.buildModels(lib);
    this.flashLight = new THREE.PointLight(0xffc46b, 0, 7, 2);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashSprite.scale.set(0.5, 0.5, 1);
    this.holder.add(this.flashLight, this.flashSprite);
    // Held in the right hand: forearm space, pointing forward.
    this.holder.position.set(0.02, -0.28, 0.16);
    this.holder.rotation.set(0.95, 0, 0);
    this.holder.visible = false;
    this.visual.attachToRightHand(this.holder);
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1);
    this.tracerGeo.rotateX(Math.PI / 2);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.sparks = new ParticleSystem(lib.glowTexture, 0xffd9a0, 256);
    this.sparks.setViewportHeight(window.innerHeight);
    engine.scene.add(this.sparks.points);
    this.arrowGeo = this.buildArrow(lib);
    this.discGeo = this.buildDisc();
    this.select('astra', true);
  }

  // ---- models ---------------------------------------------------------------------------------

  private buildModels(lib: MaterialLibrary): void {
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2624, roughness: 0.5, metalness: 0.7 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9b370, roughness: 0.3, metalness: 0.9, emissive: 0x5a4210, emissiveIntensity: 0.25 });
    const glow = (c: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 });
    const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, rz = 0): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // Astra: stock, receiver, long barrel, a ring of light at the muzzle.
    const astra = new THREE.Group();
    part(astra, new THREE.BoxGeometry(0.06, 0.09, 0.28), wood, 0, -0.02, -0.14);
    part(astra, new THREE.BoxGeometry(0.06, 0.07, 0.3), dark, 0, 0.0, 0.1);
    part(astra, new THREE.CylinderGeometry(0.014, 0.016, 0.62, 10), dark, 0, 0.015, 0.55, Math.PI / 2);
    part(astra, new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), wood, 0, -0.04, 0.32, Math.PI / 2);
    part(astra, new THREE.TorusGeometry(0.03, 0.008, 6, 16), glow(0xffb15a), 0, 0.015, 0.84);
    part(astra, new THREE.BoxGeometry(0.01, 0.03, 0.02), dark, 0, 0.06, 0.2);
    const astraMuzzle = new THREE.Object3D();
    astraMuzzle.position.set(0, 0.015, 0.86);
    astra.add(astraMuzzle);
    this.muzzles.set('astra', astraMuzzle);
    // Dhanush: a recurve bow of flowering wood held upright, string and a nocked arrow while drawing.
    const bow = new THREE.Group();
    const limb = part(bow, new THREE.TorusGeometry(0.42, 0.016, 6, 24, Math.PI * 0.85), wood, 0, 0, 0.12, 0, 0);
    limb.rotation.set(0, Math.PI / 2, Math.PI * 0.075);
    part(bow, new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), gold, 0, 0, 0.12);
    for (let i = 0; i < 5; i++) part(bow, new THREE.SphereGeometry(0.02, 6, 5), glow(0x9ad8ff), 0, -0.34 + i * 0.17, 0.12 + Math.sin(i * 1.4) * 0.05);
    const string = part(bow, new THREE.CylinderGeometry(0.004, 0.004, 0.78, 4), new THREE.MeshBasicMaterial({ color: 0xe8f4ff }), 0, 0, -0.16);
    this.bowString = string;
    const bowMuzzle = new THREE.Object3D();
    bowMuzzle.position.set(0, 0, 0.2);
    bow.add(bowMuzzle);
    this.muzzles.set('dhanush', bowMuzzle);
    // Chakra: a golden disc with spokes and a glowing rim, carried flat in the hand.
    const chakra = new THREE.Group();
    part(chakra, new THREE.TorusGeometry(0.19, 0.022, 8, 32), gold, 0, 0.0, 0.1, Math.PI / 2);
    part(chakra, new THREE.TorusGeometry(0.21, 0.006, 6, 32), glow(0xffe36a), 0, 0.0, 0.1, Math.PI / 2);
    for (let i = 0; i < 8; i++) part(chakra, new THREE.BoxGeometry(0.012, 0.006, 0.34), gold, 0, 0, 0.1, 0, 0).rotation.y = (i / 8) * Math.PI;
    part(chakra, new THREE.SphereGeometry(0.035, 10, 8), glow(0xffe36a), 0, 0, 0.1);
    const chakraMuzzle = new THREE.Object3D();
    chakraMuzzle.position.set(0, 0.05, 0.3);
    chakra.add(chakraMuzzle);
    this.muzzles.set('chakra', chakraMuzzle);
    // Vajra: a short double-ended thunderbolt with three prongs at each end and a lit core.
    const vajra = new THREE.Group();
    part(vajra, new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10), gold, 0, 0, 0.16, Math.PI / 2);
    part(vajra, new THREE.SphereGeometry(0.05, 12, 10), glow(0xc8d8ff), 0, 0, 0.16);
    for (const end of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const prong = part(vajra, new THREE.ConeGeometry(0.014, 0.16, 6), gold, Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.16 + end * 0.2, end > 0 ? Math.PI / 2 : -Math.PI / 2);
        prong.rotation.z = end > 0 ? -Math.cos(a) * 0.25 : Math.cos(a) * 0.25;
      }
    }
    const vajraMuzzle = new THREE.Object3D();
    vajraMuzzle.position.set(0, 0, 0.44);
    vajra.add(vajraMuzzle);
    this.muzzles.set('vajra', vajraMuzzle);
    for (const [id, g] of [['astra', astra], ['dhanush', bow], ['chakra', chakra], ['vajra', vajra]] as const) {
      g.visible = false;
      this.models.set(id, g);
      this.holder.add(g);
    }
    void lib;
  }

  private buildArrow(lib: MaterialLibrary): THREE.Group {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x4aa8ff, emissiveIntensity: 1.2 }));
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xa8e8ff, emissiveIntensity: 2 }));
    tip.position.z = 0.46;
    tip.rotation.x = Math.PI / 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xa8e8ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.set(0.5, 0.5, 1);
    glow.position.z = 0.4;
    g.add(shaft, tip, glow);
    return g;
  }

  private buildDisc(): THREE.Group {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9b370, roughness: 0.3, metalness: 0.9, emissive: 0x5a4210, emissiveIntensity: 0.3 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 8, 32), gold);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.01, 6, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe36a, emissiveIntensity: 2 }));
    rim.rotation.x = Math.PI / 2;
    edge.rotation.x = Math.PI / 2;
    g.add(rim, edge);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.008, 0.52), gold);
      spoke.rotation.y = (i / 8) * Math.PI;
      g.add(spoke);
    }
    return g;
  }

  // ---- state ----------------------------------------------------------------------------------

  get weapon(): WeaponDef {
    return this.def;
  }
  get magSize(): number {
    return this.def.mag;
  }
  get available(): WeaponDef[] {
    return WEAPONS.filter((w) => w.unlockTask <= this.unlockedTask);
  }
  isUnlocked(id: WeaponId): boolean {
    return weaponById(id).unlockTask <= this.unlockedTask;
  }

  select(id: WeaponId, silent = false): boolean {
    if (!this.isUnlocked(id) && this.unlockedTask > 0) return false;
    if (this.def.id !== id) this.stored.set(this.def.id, this.ammo);
    this.def = weaponById(id);
    this.ammo = this.def.mode === 'throw' ? this.def.mag - this.discsOut() : (this.stored.get(id) ?? this.def.mag);
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.25);
    this.charge = 0;
    this.bloom = 0;
    for (const [k, g] of this.models) g.visible = k === id && this.equipped;
    if (this.bowArrow) this.bowArrow.visible = false;
    this.flashSprite.material.color.set(this.def.color);
    this.flashLight.color.set(this.def.color);
    if (!silent) this.audio.play('ui-tick', { volume: 0.5, rate: 1.4 });
    this.onWeaponChange?.(this.def);
    return true;
  }

  cycle(dir: 1 | -1): void {
    const list = this.available;
    const i = list.findIndex((w) => w.id === this.def.id);
    const next = list[(i + dir + list.length) % list.length];
    if (next && next.id !== this.def.id) this.select(next.id);
  }

  /** Grant every weapon up to `task`; returns the ones newly unlocked. */
  setUnlockedTask(task: number): WeaponDef[] {
    const before = this.available.map((w) => w.id);
    this.unlockedTask = Math.max(this.unlockedTask, task);
    const fresh = this.available.filter((w) => !before.includes(w.id));
    if (!this.isUnlocked(this.def.id) && this.available[0]) this.select(this.available[0].id, true);
    return fresh;
  }

  setEquipped(v: boolean): void {
    this.equipped = v;
    this.holder.visible = v;
    for (const [k, g] of this.models) g.visible = v && k === this.def.id;
    this.visual.mesh.holdWeapon = v;
    this.player.faceViewYaw = v;
    this.engine.input.touch.setWeaponButtons(v);
    if (!v) {
      this.aiming = false;
      this.charge = 0;
      this.rig.aim = 0;
    }
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

  /** Refill every magazine (respawn, new task). */
  refill(): void {
    this.ammo = this.def.mode === 'throw' ? this.def.mag - this.discsOut() : this.def.mag;
    this.stored.clear();
    this.reloading = 0;
    this.charge = 0;
  }

  reload(): void {
    if (this.def.mode === 'charge' || this.def.mode === 'throw') return;
    if (this.reloading > 0 || this.ammo === this.def.mag) return;
    this.reloading = this.def.reload;
    this.audio.play('astra-reload', { volume: 0.6, rate: this.def.mode === 'burst' ? 0.7 : 1 });
  }

  /** Current spread half-angle in radians. */
  get spread(): number {
    const base = this.aiming ? this.def.spreadAim : this.def.spreadHip;
    const moving = this.player.horizontalSpeed > 3 ? 1.6 : 1;
    return (base * moving + this.bloom) * DEG;
  }

  // ---- firing ---------------------------------------------------------------------------------

  private aimRay(): void {
    const cam = this.engine.camera;
    cam.getWorldDirection(this.tmpDir);
    this.tmpOrigin.copy(cam.position);
  }

  /** Nearest target inside the aim-assist cone, or null. */
  private assist(dir: THREE.Vector3, origin: THREE.Vector3, cone: number): Shootable | null {
    let best: Shootable | null = null;
    let bestAngle = cone;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hs = t.hitSphere();
      if (!hs) continue;
      this.tmpV.copy(hs.center).sub(origin);
      const dist = this.tmpV.length();
      if (dist > this.def.range) continue;
      this.tmpV.divideScalar(dist);
      const angle = Math.acos(clamp(dir.dot(this.tmpV), -1, 1));
      if (angle < Math.max(bestAngle, Math.atan(hs.radius / dist)) && angle < bestAngle + Math.atan(hs.radius / dist)) {
        best = t;
        bestAngle = angle;
      }
    }
    return best;
  }

  private jitter(dir: THREE.Vector3, spread: number): THREE.Vector3 {
    const j = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(spread);
    return dir.clone().add(j).normalize();
  }

  /** Hitscan along `dir`: first target sphere or wall. Returns the hit point and target. */
  private trace(origin: THREE.Vector3, dir: THREE.Vector3, range: number): { point: THREE.Vector3; target: Shootable | null; dist: number } {
    let hitDist = range;
    let hitTarget: Shootable | null = null;
    const oc = this.tmpV;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const hs = t.hitSphere();
      if (!hs) continue;
      oc.copy(origin).sub(hs.center);
      const b = oc.dot(dir);
      const c = oc.dot(oc) - hs.radius * hs.radius;
      const disc = b * b - c;
      if (disc < 0) continue;
      const d = -b - Math.sqrt(disc);
      if (d > 0 && d < hitDist) {
        hitDist = d;
        hitTarget = t;
      }
    }
    const wall = this.engine.physics.raycast(origin, dir, hitDist, this.player.collider);
    if (wall && wall.distance < hitDist) {
      hitDist = wall.distance;
      hitTarget = null;
    }
    return { point: origin.clone().addScaledVector(dir, hitDist), target: hitTarget, dist: hitDist };
  }

  private recoil(): void {
    const k = this.def.recoil * (this.aiming ? 0.65 : 1) * DEG;
    this.rig.kick(k, (Math.random() - 0.5) * k * 0.6);
    this.visual.kick(Math.min(1.2, this.def.recoil * 0.9));
    this.bloom = Math.min(this.def.spreadHip * 3, this.bloom + this.def.bloom);
  }

  private impact(point: THREE.Vector3, color: number, n: number, onTarget: boolean): void {
    for (let i = 0; i < n; i++) {
      const s = 2 + Math.random() * 4;
      this.sparks.emit({ x: point.x, y: point.y, z: point.z, vx: (Math.random() - 0.5) * s, vy: Math.random() * s * 0.8, vz: (Math.random() - 0.5) * s, life: 0.25 + Math.random() * 0.25, size: onTarget ? 0.22 : 0.14, grow: 0.5, alpha: 0.9, drag: 3, lift: -12 });
    }
    void color;
  }

  private flash(): void {
    this.flashTimer = 0.07;
  }

  private fireAuto(): void {
    this.aimRay();
    const dir = this.jitter(this.tmpDir, this.spread);
    const assisted = this.assist(dir, this.tmpOrigin, AIM_ASSIST);
    if (assisted) {
      const hs = assisted.hitSphere();
      if (hs) dir.copy(hs.center).sub(this.tmpOrigin).normalize();
    }
    const hit = this.trace(this.tmpOrigin, dir, this.def.range);
    this.registerHit(hit.target, hit.point, this.def.damage);
    this.tracer(hit.point);
    this.impact(hit.point, this.def.color, hit.target ? 6 : 4, hit.target !== null);
    this.ammo--;
    this.cooldown = 1 / this.def.rate;
    this.recoil();
    this.flash();
    this.audio.play('astra-shot', { volume: 0.75, rate: 0.95 + Math.random() * 0.1 });
  }

  private fireBurst(): void {
    this.aimRay();
    const n = this.def.pellets ?? 6;
    let hits = 0;
    const struck = new Set<Shootable>();
    for (let i = 0; i < n; i++) {
      const dir = this.jitter(this.tmpDir, this.spread);
      const hit = this.trace(this.tmpOrigin, dir, this.def.range);
      // Damage falls off past `falloffStart` to nothing at `range`.
      const start = this.def.falloffStart ?? this.def.range;
      const k = hit.dist <= start ? 1 : Math.max(0, 1 - (hit.dist - start) / (this.def.range - start));
      if (hit.target && k > 0) {
        hits++;
        struck.add(hit.target);
      }
      this.registerHit(k > 0 ? hit.target : null, hit.point, this.def.damage * k);
      this.tracer(hit.point);
      this.impact(hit.point, this.def.color, 3, hit.target !== null);
    }
    if (hits >= 4) for (const t of struck) t.onStagger?.();
    this.ammo--;
    this.cooldown = 1 / this.def.rate;
    this.recoil();
    this.flash();
    this.rig.shake(0.5);
    this.audio.play('vajra-burst', { volume: 0.9, rate: 0.95 + Math.random() * 0.1 });
  }

  /**
   * Where the crosshair points: the first thing the camera ray meets (assisted toward a target in the
   * cone). Projectiles leave the hand toward this point, so they land where the reticle is.
   */
  private aimPoint(spread: number, assistCone: number): THREE.Vector3 {
    this.aimRay();
    const dir = this.jitter(this.tmpDir, spread);
    const assisted = this.assist(dir, this.tmpOrigin, assistCone);
    if (assisted) {
      const hs = assisted.hitSphere();
      if (hs) return hs.center.clone();
    }
    return this.trace(this.tmpOrigin, dir, this.def.range).point;
  }

  private loose(charge: number): void {
    const w = this.def;
    const p = w.projectile;
    if (!p) return;
    const target = this.aimPoint(this.spread * (1 - charge * 0.7), AIM_ASSIST * 0.6);
    // The arrow leaves the bow toward the aim point; gravity is pre-compensated for the flight.
    this.muzzleWorld(this.tmpMuzzle);
    const speed = p.speed * (0.55 + charge * 0.45);
    const dir = target.sub(this.tmpMuzzle);
    const dist = dir.length();
    dir.divideScalar(dist || 1);
    dir.y += (0.5 * p.gravity * (dist / speed)) / speed;
    dir.normalize();
    const mesh = this.arrowGeo.clone();
    mesh.position.copy(this.tmpMuzzle);
    this.engine.scene.add(mesh);
    const weak = charge < 0.2;
    this.shots.push({ weapon: w, mesh, pos: mesh.position, vel: dir.multiplyScalar(speed), life: 4, damage: weak ? w.damage * 0.15 : w.damage * (0.3 + charge * 0.7), hit: new Set(), phase: 'out', traveled: 0, light: this.engine.lights.acquire(w.color, 6, 5, 2) });
    this.cooldown = 0.35;
    this.recoil();
    this.audio.play('bow-release', { volume: 0.7, rate: 0.9 + charge * 0.3 });
    this.shotsFired++;
  }

  private throwDisc(): void {
    const w = this.def;
    const p = w.projectile;
    if (!p) return;
    const target = this.aimPoint(this.spread, AIM_ASSIST);
    this.muzzleWorld(this.tmpMuzzle);
    const dir = target.sub(this.tmpMuzzle).normalize();
    const mesh = this.discGeo.clone();
    mesh.position.copy(this.tmpMuzzle);
    this.engine.scene.add(mesh);
    this.shots.push({ weapon: w, mesh, pos: mesh.position, vel: dir.multiplyScalar(p.speed), life: 8, damage: w.damage, hit: new Set(), phase: 'out', traveled: 0, light: this.engine.lights.acquire(w.color, 5, 4, 2) });
    this.ammo = w.mag - this.discsOut();
    this.cooldown = 1 / w.rate;
    this.recoil();
    this.audio.play('chakra-throw', { volume: 0.7, rate: 0.95 + Math.random() * 0.1 });
    this.shotsFired++;
  }

  private lastShot: { hit: boolean; dist: number; damage: number } | null = null;

  private registerHit(target: Shootable | null, point: THREE.Vector3, damage: number): void {
    this.shotsFired++;
    this.lastShot = { hit: target !== null && damage > 0, dist: point.distanceTo(this.tmpOrigin), damage };
    if (target && damage > 0) {
      target.onShot(damage, point.clone());
      this.shotsHit++;
      this.onHit?.(point, damage);
    }
    this.onFire?.(target !== null);
  }

  private tracer(to: THREE.Vector3): void {
    this.muzzleWorld(this.tmpMuzzle);
    const len = this.tmpMuzzle.distanceTo(to);
    const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    tracer.position.copy(this.tmpMuzzle).lerp(to, 0.5);
    tracer.scale.set(1, 1, len);
    tracer.lookAt(to);
    this.engine.scene.add(tracer);
    this.tracers.push({ mesh: tracer, life: 0.09 });
  }

  private muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const m = this.muzzles.get(this.def.id);
    if (m) return m.getWorldPosition(out);
    return this.holder.getWorldPosition(out);
  }

  /** Move arrows and discs; the disc turns back at range or on a wall and returns to the hand. */
  private updateShots(dt: number): void {
    const chest = this.tmpV;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i] as HeroShot;
      const p = s.weapon.projectile as NonNullable<WeaponDef['projectile']>;
      s.life -= dt;
      if (s.phase === 'stuck') {
        if (s.life <= 0) this.removeShot(i);
        continue;
      }
      if (s.phase === 'back') {
        this.muzzleWorld(chest);
        const d = chest.distanceTo(s.pos);
        if (d < 0.9) {
          // Caught: the disc is back in hand.
          this.audio.play('ui-tick', { volume: 0.35, rate: 1.8 });
          this.removeShot(i);
          continue;
        }
        s.vel.copy(chest).sub(s.pos).normalize().multiplyScalar(p.speed * 1.15);
      } else if (p.gravity) s.vel.y -= p.gravity * dt;
      const stepLen = s.vel.length() * dt;
      this.tmpDir.copy(s.vel).normalize();
      const wall = stepLen > 1e-5 ? this.engine.physics.raycast(s.pos, this.tmpDir, stepLen + 0.2, this.player.collider) : null;
      if (wall) {
        if (p.returnRange !== undefined && s.phase === 'out') {
          s.pos.copy(wall.point).addScaledVector(this.tmpDir, -0.3);
          s.phase = 'back';
          s.hit.clear();
          this.impact(wall.point, s.weapon.color, 5, false);
          this.audio.play('asura-hit', { position: wall.point, volume: 0.4, rate: 1.7 });
        } else {
          // Arrows stick where they land for a moment.
          s.pos.copy(wall.point).addScaledVector(this.tmpDir, -0.35);
          s.phase = 'stuck';
          s.life = 2.5;
          this.impact(wall.point, s.weapon.color, 6, false);
          this.engine.lights.release(s.light);
          s.light = null;
          this.audio.play('asura-hit', { position: wall.point, volume: 0.35, rate: 1.3 });
        }
        continue;
      }
      s.pos.addScaledVector(s.vel, dt);
      s.traveled += stepLen;
      s.mesh.quaternion.setFromUnitVectors(FORWARD, this.tmpDir);
      if (s.weapon.id === 'chakra') s.mesh.rotateY(dt * 30);
      if (s.light) s.light.position.copy(s.pos);
      // Targets: sphere test; pierce keeps flying, each target once per pass.
      for (const t of this.targets) {
        if (!t.alive || s.hit.has(t)) continue;
        const hs = t.hitSphere();
        if (!hs) continue;
        const r = hs.radius + p.radius;
        if (s.pos.distanceToSquared(hs.center) < r * r) {
          s.hit.add(t);
          // Core hit: the arrow through the centre of the sphere strikes hardest.
          const core = s.weapon.mode === 'charge' && s.pos.distanceTo(hs.center) < hs.radius * 0.45 ? 1.4 : 1;
          t.onShot(s.damage * core, s.pos.clone());
          this.shotsHit++;
          this.onHit?.(s.pos, s.damage * core);
          this.impact(s.pos, s.weapon.color, 8, true);
          this.audio.play('asura-hit', { position: s.pos, volume: 0.6, rate: core > 1 ? 1.4 : 1 });
          if (!p.pierce) {
            this.removeShot(i);
            break;
          }
        }
      }
      if (this.shots[i] !== s) continue;
      if (s.phase === 'out' && p.returnRange !== undefined && s.traveled >= p.returnRange) {
        s.phase = 'back';
        s.hit.clear();
      }
      if (s.life <= 0) this.removeShot(i);
    }
  }

  private discsOut(): number {
    let n = 0;
    for (const s of this.shots) if (s.weapon.id === 'chakra' && s.phase !== 'stuck') n++;
    return n;
  }

  private removeShot(i: number): void {
    const s = this.shots[i] as HeroShot;
    this.engine.scene.remove(s.mesh);
    this.engine.lights.release(s.light);
    this.shots.splice(i, 1);
  }

  update(dt: number): void {
    const input = this.engine.input;
    const cam = this.engine.camera;
    const active = this.equipped && !input.gameplayBlocked && !this.player.movementLocked;
    // Weapon switching.
    if (active) {
      if (input.pressed('weapon1')) this.select('astra');
      if (input.pressed('weapon2')) this.select('dhanush');
      if (input.pressed('weapon3')) this.select('chakra');
      if (input.pressed('weapon4')) this.select('vajra');
      if (input.pressed('weaponNext')) this.cycle(1);
      if (input.pressed('weaponPrev')) this.cycle(-1);
    }
    const wantAim = active && input.held('aim');
    this.aiming = wantAim;
    this.rig.aim = damp(this.rig.aim, wantAim ? 1 : 0, 12, dt);
    this.player.aimSlow = wantAim ? 0.55 : 1;
    this.fov = damp(this.fov, wantAim ? this.def.fovAim : 58, 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - this.def.bloomDecay * dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = this.def.mag;
      }
    }
    // Discs in hand = discs not in flight (a lost disc counts as returned once its flight expires).
    if (this.def.mode === 'throw') this.ammo = this.def.mag - this.discsOut();
    const fireHeld = active && input.held('fire');
    const firePressed = active && input.pressed('fire');
    if (active) {
      if (input.pressed('reload')) this.reload();
      switch (this.def.mode) {
        case 'auto':
          if (fireHeld && this.cooldown === 0 && this.reloading === 0 && this.ammo > 0) this.fireAuto();
          else if (firePressed && this.ammo === 0) this.audio.play('astra-empty', { volume: 0.5, rate: 0.7 });
          // An empty magazine reloads on its own once the last round has left (R still reloads early).
          if (this.ammo === 0 && this.reloading === 0 && this.cooldown === 0) this.reload();
          break;
        case 'burst':
          if (firePressed && this.cooldown === 0 && this.reloading === 0) {
            if (this.ammo > 0) this.fireBurst();
            else this.audio.play('astra-empty', { volume: 0.5, rate: 0.5 });
          }
          if (this.ammo === 0 && this.reloading === 0 && this.cooldown === 0) this.reload();
          break;
        case 'charge': {
          const ct = this.def.chargeTime ?? 1;
          if (fireHeld && this.cooldown === 0) this.charge = Math.min(1, this.charge + dt / ct);
          else if (!fireHeld && this.fireHeldLast && this.charge > 0) {
            this.loose(this.charge);
            this.charge = 0;
          } else if (!fireHeld) this.charge = 0;
          break;
        }
        case 'throw':
          if (firePressed && this.cooldown === 0 && this.ammo > 0) this.throwDisc();
          else if (firePressed && this.ammo === 0) this.audio.play('astra-empty', { volume: 0.4, rate: 0.9 });
          break;
      }
    } else this.charge = 0;
    this.fireHeldLast = fireHeld;
    // The bow shows its draw: the string pulls back and an arrow appears.
    if (this.bowString) {
      const k = this.def.id === 'dhanush' ? this.charge : 0;
      this.bowString.position.z = -0.16 - k * 0.28;
      this.bowString.scale.y = 1 + k * 0.35;
      if (!this.bowArrow && k > 0) {
        this.bowArrow = this.arrowGeo.clone();
        this.bowArrow.scale.setScalar(0.9);
        this.models.get('dhanush')?.add(this.bowArrow);
      }
      if (this.bowArrow) {
        this.bowArrow.visible = k > 0;
        this.bowArrow.position.set(0, 0, -0.1 - k * 0.28 + 0.4);
      }
    }
    this.visual.mesh.aim = this.equipped ? { pitch: this.rig.pitch, weapon: this.def.id, draw: this.charge, aiming: this.rig.aim } : null;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.flashLight.intensity = this.flashTimer > 0 ? 40 : 0;
    this.flashSprite.material.opacity = this.flashTimer > 0 ? 0.9 : 0;
    const mz = this.muzzles.get(this.def.id);
    if (mz) {
      this.flashLight.position.copy(mz.position);
      this.flashSprite.position.copy(mz.position);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i] as (typeof this.tracers)[number];
      t.life -= dt;
      if (t.life <= 0) {
        this.engine.scene.remove(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
    this.updateShots(dt);
    this.sparks.update(dt);
  }

  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();

  /** After the body is posed: point the weapon exactly where the camera looks (the arms approximate it). */
  lateUpdate(): void {
    if (!this.equipped) return;
    const parent = this.holder.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    this.engine.camera.getWorldDirection(this.tmpDir);
    // Matrix4.lookAt builds a camera-style frame (−Z toward the target); swapping eye and target
    // makes +Z — the barrel — point along the view direction.
    this.tmpM.lookAt(this.tmpDir, ORIGIN, UP_AXIS);
    this.tmpQ.setFromRotationMatrix(this.tmpM);
    parent.getWorldQuaternion(this.tmpQ2).invert();
    this.holder.quaternion.copy(this.tmpQ2.multiply(this.tmpQ));
  }

  /** Test hook. */
  debugState(): Record<string, unknown> {
    return { weapon: this.def.id, ammo: this.ammo, mag: this.def.mag, charge: this.charge, aiming: this.aiming, unlocked: this.available.map((w) => w.id), shots: this.shots.length, spread: this.spread, fired: this.shotsFired, hits: this.shotsHit, last: this.lastShot };
  }

  dispose(): void {
    for (const t of this.tracers) this.engine.scene.remove(t.mesh);
    for (let i = this.shots.length - 1; i >= 0; i--) this.removeShot(i);
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    this.flashSprite.material.dispose();
    this.engine.scene.remove(this.sparks.points);
    this.sparks.dispose();
    this.holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.holder.removeFromParent();
    this.player.faceViewYaw = false;
  }
}
