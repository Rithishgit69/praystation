import * as THREE from 'three';
import gsap from 'gsap';
import type { PresentEncounter } from '@/systems/EncounterRunner';
import type { EncounterContext } from './BrokenTusk';
import type { LightingStates } from '@/systems/LightingStates';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { MoonLight } from '@/world/fx/Atmosphere';
import { gameStore } from '@/state/store';

const STATUE = new THREE.Vector3(0, -26 + 1.68 + 6.5, -404 - 18);

/**
 * The ending (GDD §13). The seals are placed; the corruption dissolves; moonlight fills the sanctum;
 * silence returns. Then, slowly, sunrise: the light warms, the first birds, and the temple reads as
 * preserved rather than dead. The camera is taken for the only time in the game outside a memory.
 */
export class FinaleCinematic implements PresentEncounter {
  private done: (() => void) | null = null;
  private t = 0;
  private readonly camFrom = new THREE.Vector3();
  private readonly orbit = { a: 0.6, r: 17, h: 2 };
  private readonly ending: HTMLDivElement;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;

  constructor(
    private readonly ctx: EncounterContext,
    private readonly lighting: LightingStates,
    private readonly streamer: WorldStreamer,
    moon: MoonLight,
    private readonly onReturnToTitle: () => void,
    private readonly setDawn: (t: number) => void,
  ) {
    this.sun = moon.sun;
    this.hemi = moon.hemi;
    this.ending = document.createElement('div');
    this.ending.className = 'ending';
    this.ending.hidden = true;
    this.ending.innerHTML = `
      <div class="ending-inner">
        <div class="boot-glyph">ॐ</div>
        <h1 class="boot-title">Preserved</h1>
        <p class="ending-text">The temple was built to remember. Now it can.</p>
        <p class="ending-credits">PrayStation — The Temple of Eka-Danta<br/>An original work inspired by traditional stories of Ganesha.<br/>All events, characters and the temple in this game are fictional; sacred figures are portrayed with respect.<br/>Traditions differ across regions and sources; the journal's Inspirations notes describe the versions this game drew on.</p>
        <button class="boot-continue">Return to title</button>
      </div>`;
    this.ctx.engine.uiRoot.appendChild(this.ending);
    (this.ending.querySelector('button') as HTMLButtonElement).addEventListener('click', () => this.onReturnToTitle());
  }

  start(done: () => void): void {
    this.done = done;
    const s = gameStore.getState();
    s.setFlag('sanctum:restored', true);
    s.setChapter('epilogue');
    this.ctx.player.movementLocked = true;
    this.ctx.rig.cinematic = true;
    this.camFrom.copy(this.ctx.engine.camera.position);
    this.ctx.audio.duckToSilence(1.2);
    void this.lighting.transition('present', 3);
    this.lighting.pinned = 'moonlit';
    this.ctx.subtitles.say('finale-restore');
    // The inlay and the braziers answer.
    const inlay = this.streamer.anchors.get('mechanism:sanctum-seal')?.object as THREE.Mesh | undefined;
    if (inlay) gsap.to(inlay.material as THREE.MeshStandardMaterial, { emissiveIntensity: 2.2, duration: 4 });
    gsap.delayedCall(6, () => {
      this.ctx.audio.release(6);
      this.ctx.audio.play('bell-near', { volume: 0.4, rate: 0.7 });
    });
    gsap.delayedCall(12, () => this.ctx.subtitles.say('finale-end'));
    // Sunrise: the moon's light warms and brightens, fog lifts to a pale dawn.
    gsap.to(this.sun.color, { r: 1.0, g: 0.82, b: 0.6, duration: 16, delay: 8 });
    gsap.to(this.sun, { intensity: 3.2, duration: 16, delay: 8 });
    gsap.to(this.hemi.color, { r: 0.55, g: 0.5, b: 0.6, duration: 16, delay: 8 });
    gsap.to(this.hemi, { intensity: 1.6, duration: 16, delay: 8 });
    const dawn = { t: 0 };
    gsap.to(dawn, { t: 1, duration: 16, delay: 8, ease: 'sine.inOut', onUpdate: () => this.setDawn(dawn.t) });
    this.ctx.hud.setCinematic(true);
    gsap.delayedCall(24, () => {
      this.ending.hidden = false;
      this.ctx.engine.input.gameplayBlocked = true;
      this.ctx.engine.input.mouse.lockOnClick = false;
      this.ctx.engine.input.mouse.unlock();
      gameStore.getState().setFlag('beat:ending-seen', true);
      this.done?.();
    });
  }

  update(dt: number): void {
    this.t += dt;
    // Slow orbit in front of the statue (inside the pillar ring) that rises toward its face as the light warms.
    this.orbit.a = 0.6 - this.t * 0.05;
    this.orbit.r = Math.max(13, 17 - this.t * 0.18);
    this.orbit.h = -3 + this.t * 0.36;
    const cam = this.ctx.engine.camera;
    const target = new THREE.Vector3(STATUE.x + Math.sin(this.orbit.a) * this.orbit.r, STATUE.y + this.orbit.h, STATUE.z + Math.cos(this.orbit.a) * this.orbit.r);
    cam.position.lerp(target, 1 - Math.exp(-dt * 1.2));
    cam.lookAt(STATUE.x, STATUE.y + 0.5, STATUE.z);
    this.lighting.pinned = 'moonlit';
  }

  dispose(): void {
    // The ending screen stays until the player returns to the title; the camera remains cinematic.
  }
}
