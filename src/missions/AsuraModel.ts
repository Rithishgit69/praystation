import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { AsuraAvatar, AsuraPose } from './AsuraMesh';
import type { MissionDef } from './MissionData';

/** Clip names looked up (case-insensitive, substring) for each pose; the first found wins. */
const CLIP_NAMES: Record<AsuraPose, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk', 'run', 'move'],
  cast: ['cast', 'spell', 'attack'],
  throw: ['throw', 'cast', 'attack'],
  sweep: ['sweep', 'slash', 'swing', 'attack'],
  lunge: ['lunge', 'dash', 'charge', 'run'],
  breathe: ['breath', 'roar', 'cast', 'attack'],
  draw: ['draw', 'bow', 'aim', 'attack'],
  raise: ['raise', 'summon', 'cast', 'attack'],
  mirror: ['block', 'guard', 'shield', 'idle'],
  charge: ['charge', 'run', 'dash', 'walk'],
  'slam-wind': ['windup', 'wind', 'raise', 'attack'],
  slam: ['slam', 'smash', 'attack'],
  stagger: ['stagger', 'hit', 'hurt', 'flinch'],
  shield: ['shield', 'guard', 'block', 'idle'],
  death: ['death', 'die', 'dead'],
};

const PROCEDURAL_HEIGHT = 3.2;
const cache = new Map<string, Promise<GLTF | null>>();
let index: Promise<Record<string, string>> | null = null;

/** public/models/asuras/index.json lists which asuras have a modelled avatar (so nothing 404s). */
const loadIndex = (): Promise<Record<string, string>> => {
  if (!index) {
    index = fetch('./models/asuras/index.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ models?: Record<string, string> }>) : { models: {} }))
      .then((j) => j.models ?? {})
      .catch(() => ({}));
  }
  return index;
};

/**
 * A modelled asura loaded from public/models/asuras/<id>.glb (see docs/VILLAINS.md). Auto-fitted to the
 * procedural asura's height, feet on the floor, facing +Z. Animation clips are matched by name; poses
 * without a clip fall back to the nearest one, and a model with no clips simply stands (the fight, the
 * projectiles and the hazards do not depend on the avatar's animation).
 */
export class GltfAsura implements AsuraAvatar {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer | null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private pose: AsuraPose = 'idle';
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly originalEmissive: THREE.Color[] = [];
  private flash = 0;
  private enraged = false;
  private readonly shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly mirrorMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  private readonly handR: THREE.Object3D | null;
  private readonly handL: THREE.Object3D | null;
  private readonly head: THREE.Object3D | null;
  private readonly fitScale: number;

  /** Resolves null when no model exists for this asura (the procedural stand-in is used). */
  static load(def: MissionDef, timeoutMs = 8000): Promise<GltfAsura | null> {
    let p = cache.get(def.id);
    if (!p) {
      p = loadIndex().then((models) => {
        const file = models[def.id];
        if (!file) return null;
        return new Promise<GLTF | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), timeoutMs);
          new GLTFLoader().load(
            `./models/asuras/${file}`,
            (gltf) => {
              clearTimeout(timer);
              resolve(gltf);
            },
            undefined,
            () => {
              clearTimeout(timer);
              resolve(null);
            },
          );
        });
      });
      cache.set(def.id, p);
    }
    return p.then((gltf) => (gltf ? new GltfAsura(gltf, def) : null));
  }

  private constructor(gltf: GLTF, def: MissionDef) {
    const scene = cloneSkeleton(gltf.scene) as THREE.Group;
    // Fit: height → the procedural asura's, feet at y = 0, centred on x/z. Precise bounds so skinned
    // meshes (bind pose) and rotated root nodes measure correctly.
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y || 1;
    this.fitScale = PROCEDURAL_HEIGHT / height;
    scene.scale.setScalar(this.fitScale);
    scene.position.set(-(box.min.x + size.x / 2) * this.fitScale, -box.min.y * this.fitScale, -(box.min.z + size.z / 2) * this.fitScale);
    this.root.add(scene);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (std.isMeshStandardMaterial && !this.materials.includes(std)) {
            this.materials.push(std);
            this.originalEmissive.push(std.emissive.clone());
          }
        }
      }
    });
    const find = (names: string[]): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (found) return;
        const n = o.name.toLowerCase();
        if (names.some((x) => n.includes(x))) found = o;
      });
      return found;
    };
    this.handR = find(['righthand', 'hand_r', 'hand.r', 'r_hand', 'handr']);
    this.handL = find(['lefthand', 'hand_l', 'hand.l', 'l_hand', 'handl']);
    this.head = find(['head']);
    // Animation clips.
    if (gltf.animations.length) {
      this.mixer = new THREE.AnimationMixer(scene);
      for (const clip of gltf.animations) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip));
      this.setPose('idle');
    } else this.mixer = null;
    // Shield bubble and mirror hemisphere, as on the procedural avatar.
    const color = def.boss.color;
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 18), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.shieldMesh.position.y = 1.8;
    this.shieldMesh.visible = false;
    this.mirrorMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16, 0, Math.PI, 0, Math.PI), new THREE.MeshPhysicalMaterial({ color: 0xeef4ff, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    this.mirrorMesh.position.y = 1.8;
    this.mirrorMesh.visible = false;
    this.root.add(this.shieldMesh, this.mirrorMesh);
    const glow = new THREE.PointLight(color, 24, 14, 2);
    glow.position.set(0, 2.2, 0.9);
    this.root.add(glow);
  }

  private findAction(pose: AsuraPose): THREE.AnimationAction | null {
    for (const key of CLIP_NAMES[pose]) {
      for (const [name, action] of this.actions) if (name.includes(key)) return action;
    }
    return this.actions.get('idle') ?? this.actions.values().next().value ?? null;
  }

  setPose(p: AsuraPose): void {
    if (p === this.pose && this.current) return;
    this.pose = p;
    if (!this.mixer) return;
    const next = this.findAction(p);
    if (!next || next === this.current) return;
    const oneShot = p === 'death';
    next.reset();
    next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = oneShot;
    next.enabled = true;
    if (this.current) next.crossFadeFrom(this.current, 0.18, true);
    next.play();
    this.current = next;
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
    this.enraged = on;
  }
  handWorld(side: 'left' | 'right', out: THREE.Vector3): THREE.Vector3 {
    const node = side === 'left' ? this.handL : this.handR;
    if (node) return node.getWorldPosition(out);
    out.set(side === 'left' ? -0.8 : 0.8, 2.0, 0.5).multiplyScalar(this.root.scale.x).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y).add(this.root.position);
    return out;
  }
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.head) {
      this.head.getWorldPosition(out);
      out.y -= 0.1 * this.root.scale.x;
      return out;
    }
    out.set(0, 2.9, 0.45).multiplyScalar(this.root.scale.x).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.root.rotation.y).add(this.root.position);
    return out;
  }

  animate(dt: number, elapsed: number, speed: number): void {
    if (this.mixer) {
      if (this.current && this.pose === 'walk') this.current.timeScale = Math.max(0.4, speed / 2.6);
      else if (this.current) this.current.timeScale = 1;
      this.mixer.update(dt);
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    for (let i = 0; i < this.materials.length; i++) {
      const m = this.materials[i] as THREE.MeshStandardMaterial;
      const base = this.originalEmissive[i] as THREE.Color;
      m.emissive.copy(base);
      if (this.enraged) m.emissive.lerp(new THREE.Color(0xff3030), 0.35);
      if (this.flash > 0) m.emissive.lerp(new THREE.Color(0xffffff), this.flash * 0.8);
    }
    this.shieldMesh.material.opacity = 0.14 + Math.sin(elapsed * 6) * 0.05;
    this.shieldMesh.rotation.y = elapsed * 0.6;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.shieldMesh.material.dispose();
    this.mirrorMesh.material.dispose();
  }
}
