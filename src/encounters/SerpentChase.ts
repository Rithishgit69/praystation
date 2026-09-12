import * as THREE from 'three';
import gsap from 'gsap';
import type { PresentEncounter } from '@/systems/EncounterRunner';
import type { EncounterContext } from './BrokenTusk';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { MaterialLibrary } from '@/world/Materials';
import type { DoorSystem } from '@/systems/Doors';
import type { InteractionSystem } from '@/systems/Interaction';
import { gameStore } from '@/state/store';
import { setTriplanar } from '@/world/zones/UnitKit';

const SEGMENTS = 16;
const SEGMENT_SPACING = 1.25;
const CATCH_DISTANCE = 1.7;
const CRUMB_SPACING = 0.5;
const START_BEHIND = 16;

/**
 * Chapter IV — The Serpent Below (original). Waking the shrine sets the carved serpent moving: its head
 * lifts from the wall and pursues the traveller along their own trail through the collapsing corridor
 * and the water passage. It stops at the threshold of the evidence chamber: it was guarding, not hunting.
 */
export class SerpentChase implements PresentEncounter {
  private readonly head: THREE.Group;
  private readonly segments: THREE.Mesh[] = [];
  private readonly crumbs: THREE.Vector3[] = [];
  private headDist = 0; // distance travelled along the crumb trail
  private trailLength = 0;
  private speed = 3.2;
  private done: (() => void) | null = null;
  private phase: 'wake' | 'chase' | 'stop' | 'retreat' | 'ended' = 'wake';
  private timer = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly rubble: THREE.Mesh[] = [];
  private readonly rubbleGeo: THREE.BufferGeometry;
  private readonly rubbleMat: THREE.Material;
  private collapsed = new Set<number>();
  private readonly resetPoint = new THREE.Vector3(-46, -13.9, -257);
  private readonly serpentMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.SpriteMaterial;
  private readonly hissTimer = { t: 0 };

  constructor(
    private readonly ctx: EncounterContext,
    lib: MaterialLibrary,
    private readonly streamer: WorldStreamer,
    private readonly doors: DoorSystem,
    private readonly interaction: InteractionSystem,
  ) {
    this.serpentMat = new THREE.MeshStandardMaterial({ color: 0x6e6252, roughness: 0.85, metalness: 0.05, emissive: 0x2a2418, emissiveIntensity: 0.25 });
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), this.serpentMat);
    skull.scale.set(1.5, 0.8, 1.0);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 10), this.serpentMat);
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, -0.2, 1.4);
    this.eyeMat = new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xffb15a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const x of [-0.5, 0.5]) {
      const e = new THREE.Sprite(this.eyeMat);
      e.scale.set(0.35, 0.35, 1);
      e.position.set(x, 0.35, 0.9);
      this.head.add(e);
    }
    const light = new THREE.PointLight(0xffb15a, 12, 8, 2);
    light.position.set(0, 0.5, 1);
    this.head.add(skull, jaw, light);
    for (let i = 0; i < SEGMENTS; i++) {
      const r = 0.95 - (i / SEGMENTS) * 0.6;
      const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), this.serpentMat);
      seg.castShadow = true;
      this.segments.push(seg);
    }
    this.rubbleGeo = new THREE.BoxGeometry(1.4, 1.0, 1.2);
    setTriplanar(this.rubbleGeo, 1.6, 0.75);
    this.rubbleMat = lib.sandstoneDark;
  }

  start(done: () => void): void {
    this.done = done;
    const scene = this.ctx.engine.scene;
    gameStore.getState().setFlag('serpent:awake', true);
    this.ctx.hud.setThreat(true);
    this.ctx.subtitles.say('ch4-carving');
    this.ctx.audio.play('rumble', { volume: 0.9 });
    this.ctx.rig.shake(1.2);
    // The carving moves: coils turn, the head lifts from the wall.
    const carving = this.streamer.anchors.get('statue:serpent')?.object;
    if (carving) {
      const [coil, coil2, headStone] = carving.children;
      if (coil) gsap.to(coil.rotation, { z: coil.rotation.z + Math.PI * 0.5, duration: 6, ease: 'sine.inOut' });
      if (coil2) gsap.to(coil2.rotation, { z: coil2.rotation.z - Math.PI * 0.4, duration: 6, ease: 'sine.inOut' });
      if (headStone) gsap.to(headStone.position, { y: headStone.position.y + 3, z: headStone.position.z + 6, duration: 4, ease: 'power2.inOut' });
    }
    this.doors.open('door:serpent-chamber');
    // The chaser spawns at the north door once the player runs; trail starts at the altar.
    this.head.position.set(-46, -13, -240);
    this.head.visible = false;
    scene.add(this.head);
    for (const s of this.segments) {
      s.visible = false;
      scene.add(s);
    }
    for (let i = 0; i < 5; i++) this.interaction.onTrigger(`collapse:${i}`, (a) => this.collapse(i, a.position));
    this.interaction.onTrigger('trigger:evidence-chamber', () => this.reachSafety());
    this.phase = 'wake';
    this.timer = 0;
    if (window.__eka) window.__eka.encounter = () => ({ phase: this.phase, head: this.head.position.toArray(), behind: this.trailLength - this.headDist, speed: this.speed });
  }

  private collapse(i: number, at: THREE.Vector3): void {
    if (this.phase !== 'chase' || this.collapsed.has(i)) return;
    this.collapsed.add(i);
    this.ctx.audio.play('rumble', { position: at, volume: 0.9 });
    this.ctx.rig.shake(0.8);
    const back = this.tmp.set(at.x - this.ctx.player.position.x, 0, at.z - this.ctx.player.position.z);
    const len = back.length() || 1;
    back.divideScalar(len);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(this.rubbleGeo, this.rubbleMat);
      m.castShadow = true;
      m.position.set(at.x + back.x * 2.5 + (k % 2) * 1.3 - 0.6, at.y + 4.5 + k * 0.4, at.z + back.z * 2.5 + Math.floor(k / 2) * 1.2 - 0.5);
      m.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      this.ctx.engine.scene.add(m);
      this.rubble.push(m);
      gsap.to(m.position, { y: at.y + 0.5 + Math.floor(k / 2) * 0.9, duration: 0.55 + k * 0.08, ease: 'power2.in', onComplete: () => this.ctx.audio.play('block-impact', { position: m.position, volume: 0.8, rate: 0.7 }) });
    }
  }

  private reachSafety(): void {
    if (this.phase !== 'chase') return;
    this.phase = 'stop';
    this.timer = 0;
    this.ctx.audio.play('serpent-hiss', { position: this.head.position, volume: 0.9 });
    this.ctx.subtitles.say('ch4-twist');
    gameStore.getState().setFlag('beat:serpent-escaped', true);
    this.ctx.hud.setThreat(false);
  }

  private caught(): void {
    this.ctx.audio.play('serpent-hiss', { volume: 1, rate: 0.9 });
    this.ctx.rig.shake(1.4);
    this.ctx.subtitles.sayText('The tunnel closes on you. You wake at the altar.', 3.5, 'temple');
    this.ctx.player.teleport(this.resetPoint, 0);
    this.ctx.rig.snapBehind();
    this.crumbs.length = 0;
    this.trailLength = 0;
    this.headDist = -START_BEHIND;
    this.speed = 3.2;
  }

  private recordCrumb(): void {
    const p = this.ctx.player.position;
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last) {
      this.crumbs.push(p.clone());
      return;
    }
    const d = last.distanceTo(p);
    if (d >= CRUMB_SPACING) {
      this.crumbs.push(p.clone());
      this.trailLength += d;
    }
  }

  /** Position along the crumb trail at distance `dist` from the trail start. */
  private sampleTrail(dist: number, out: THREE.Vector3): void {
    if (this.crumbs.length === 0) {
      out.copy(this.resetPoint);
      return;
    }
    if (dist <= 0) {
      const first = this.crumbs[0] as THREE.Vector3;
      const second = this.crumbs[1] ?? first;
      out.copy(first).addScaledVector(this.tmp.copy(first).sub(second).normalize(), -dist);
      return;
    }
    let acc = 0;
    for (let i = 1; i < this.crumbs.length; i++) {
      const a = this.crumbs[i - 1] as THREE.Vector3;
      const b = this.crumbs[i] as THREE.Vector3;
      const seg = a.distanceTo(b);
      if (acc + seg >= dist) {
        out.lerpVectors(a, b, (dist - acc) / (seg || 1));
        return;
      }
      acc += seg;
    }
    out.copy(this.crumbs[this.crumbs.length - 1] as THREE.Vector3);
  }

  update(dt: number, elapsed: number): void {
    const p = this.ctx.player.position;
    switch (this.phase) {
      case 'wake':
        this.timer += dt;
        if (this.timer > 3.5) {
          this.phase = 'chase';
          this.crumbs.length = 0;
          this.trailLength = 0;
          this.headDist = -START_BEHIND;
          this.head.visible = true;
          for (const s of this.segments) s.visible = true;
        }
        break;
      case 'chase': {
        this.recordCrumb();
        this.speed = Math.min(5.3, this.speed + dt * 0.12);
        this.headDist += this.speed * dt;
        if (this.headDist > this.trailLength) this.headDist = this.trailLength;
        this.sampleTrail(this.headDist, this.head.position);
        this.head.position.y += 1.0 + Math.sin(elapsed * 4) * 0.15;
        this.sampleTrail(this.headDist + 0.8, this.tmp);
        this.head.lookAt(this.tmp.x, this.head.position.y, this.tmp.z);
        for (let i = 0; i < this.segments.length; i++) {
          const seg = this.segments[i] as THREE.Mesh;
          this.sampleTrail(this.headDist - (i + 1) * SEGMENT_SPACING, seg.position);
          seg.position.y += 0.7 + Math.sin(elapsed * 4 - i * 0.5) * 0.12;
        }
        const behind = this.trailLength - this.headDist;
        const d = Math.hypot(this.head.position.x - p.x, this.head.position.z - p.z);
        if (behind < 0.6 && d < CATCH_DISTANCE) this.caught();
        this.hissTimer.t += dt;
        if (this.hissTimer.t > 4) {
          this.hissTimer.t = 0;
          this.ctx.audio.play('serpent-hiss', { position: this.head.position, volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
        }
        break;
      }
      case 'stop':
        this.timer += dt;
        this.head.position.y += Math.sin(elapsed * 2) * 0.004;
        if (this.timer > 4) {
          this.phase = 'retreat';
          this.timer = 0;
        }
        break;
      case 'retreat': {
        this.timer += dt;
        this.headDist -= 6 * dt;
        this.sampleTrail(Math.max(0, this.headDist), this.head.position);
        this.head.position.y += 1.0;
        for (let i = 0; i < this.segments.length; i++) {
          const seg = this.segments[i] as THREE.Mesh;
          this.sampleTrail(Math.max(0, this.headDist - (i + 1) * SEGMENT_SPACING), seg.position);
          seg.position.y += 0.7;
        }
        const k = Math.max(0, 1 - this.timer / 6);
        this.serpentMat.opacity = k;
        this.serpentMat.transparent = true;
        this.eyeMat.opacity = 0.9 * k;
        if (this.timer > 6) {
          this.phase = 'ended';
          this.done?.();
        }
        break;
      }
      case 'ended':
        break;
    }
  }

  dispose(): void {
    if (window.__eka) window.__eka.encounter = null;
    const scene = this.ctx.engine.scene;
    scene.remove(this.head);
    for (const s of this.segments) {
      scene.remove(s);
      s.geometry.dispose();
    }
    for (const r of this.rubble) scene.remove(r);
    this.rubbleGeo.dispose();
    this.serpentMat.dispose();
    this.eyeMat.dispose();
    this.ctx.hud.setThreat(false);
  }
}
