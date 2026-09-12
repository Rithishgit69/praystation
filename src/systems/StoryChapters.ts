import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { MaterialLibrary } from '@/world/Materials';
import { gameStore } from '@/state/store';
import type { ChapterManager } from './ChapterManager';
import type { InteractionSystem } from './Interaction';
import type { EncounterRunner } from './EncounterRunner';
import type { LightingStates } from './LightingStates';
import type { PuzzleSystem } from './Puzzles';
import type { Subtitles } from '@/ui/Subtitles';
import { SerpentChase } from '@/encounters/SerpentChase';
import { CorruptionEncounter } from '@/encounters/Corruption';
import { FinaleCinematic } from '@/encounters/Finale';
import type { EncounterContext } from '@/encounters/BrokenTusk';
import type { DoorSystem } from './Doors';
import type { MoonLight } from '@/world/fx/Atmosphere';

const MOON_CX = 110;
const MOON_CZ = -190;
const MOON_Y = -2;
const MIRROR_SOLUTION = [5, 3, 1, 7];

/**
 * Chapters II–VI and the finale on top of the shared systems: lantern relighting, the moon chamber's
 * roof wheel and mirror beams, the serpent shrine, the missing fragment, the Forgetting, and the ending.
 */
export class StoryChapters implements System {
  readonly name = 'story-chapters';
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly beamGeo: THREE.CylinderGeometry;
  private roofPinned = false;
  private finaleStarted = false;
  private lockedHintAt = 0;

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly interaction: InteractionSystem,
    private readonly chapters: ChapterManager,
    private readonly audio: AudioSystem,
    private readonly visual: PlayerVisual,
    private readonly subtitles: Subtitles,
    private readonly lighting: LightingStates,
    private readonly doors: DoorSystem,
    private readonly puzzles: PuzzleSystem,
    private readonly runner: EncounterRunner,
    private readonly encounterContext: EncounterContext,
    private readonly lib: MaterialLibrary,
    private readonly moon: MoonLight,
    private readonly setDawn: (t: number) => void,
  ) {
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0x9ac2f4, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.beamGeo = new THREE.CylinderGeometry(0.22, 0.32, 1, 10, 1, true);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(this.beamGeo, this.beamMat);
      b.visible = false;
      engine.scene.add(b);
      this.beams.push(b);
    }
    this.bind();
  }

  private bind(): void {
    const { interaction, chapters, subtitles, audio } = this;
    // ---- Chapter II: relight the lantern at the hall's diyas; the passage needs it.
    interaction.register('diyas:hall', {
      label: () => (gameStore.getState().flags['lantern:lit'] === false && gameStore.getState().flags['diyas:hall'] === true ? 'Light your lantern' : null),
      onInteract: (a) => {
        const s = gameStore.getState();
        s.setFlag('lantern:lit', true);
        s.setFlag('lantern:relit', true);
        this.visual.setLantern(true);
        audio.play('diya-light', { position: a.position, volume: 0.8 });
        subtitles.sayText('The lamp takes the flame.', 3, 'traveller');
      },
    });
    interaction.onTrigger('trigger:passage-enter', () => {
      if (gameStore.getState().flags['lantern:lit'] === false) subtitles.say('ch2-dark');
    });
    // ---- Chapter III: the roof wheel closes the sky; beams show aligned mirrors.
    interaction.register('mechanism:moon-roof', {
      label: () => (gameStore.getState().flags['moon:roof-closed'] === true ? 'Open the roof' : 'Close the roof'),
      onInteract: (a) => {
        const s = gameStore.getState();
        const closed = s.flags['moon:roof-closed'] !== true;
        s.setFlag('moon:roof-closed', closed);
        chapters.beat('beat:roof-turned', 'ch3-roof');
        audio.play('stone-grind', { position: a.position, volume: 0.9, rate: 0.8 });
        audio.play('rumble', { position: a.position, volume: 0.6 });
        if (a.object) gsap.to(a.object.rotation, { x: a.object.rotation.x + Math.PI, duration: 3, ease: 'power1.inOut' });
        const shutter = this.streamer.anchors.get('moon:shutter')?.object;
        if (shutter) gsap.to(shutter.position, { z: closed ? MOON_CZ - 22 : MOON_CZ - 66, duration: 4.5, ease: 'power1.inOut' });
      },
    });
    // ---- Chapter IV: the serpent shrine.
    interaction.register('mechanism:serpent-shrine', {
      label: () => (gameStore.getState().flags['serpent:awake'] === true ? null : 'Wake the shrine'),
      onInteract: () => {
        if (this.runner.active) return;
        this.runner.run(new SerpentChase(this.encounterContext, this.lib, this.streamer, this.doors, this.interaction));
        gsap.delayedCall(3.2, () => subtitles.say('ch4-awake'));
        chapters.setLoop('SOLVE');
      },
    });
    // ---- Chapter V: the missing fragment.
    interaction.register('object:fragment-missing', {
      label: () => (gameStore.getState().flags['fragment:carried'] === true ? null : 'Take the fragment'),
      onInteract: (a) => {
        gameStore.getState().setFlag('fragment:carried', true);
        if (a.object) a.object.visible = false;
        audio.play('ui-open', { volume: 0.6 });
        subtitles.say('ch5-found');
      },
    });
    const fragPuzzle = this.puzzles.handlers.get('mechanism:fragment-4');
    interaction.register('mechanism:fragment-4', {
      label: (a) => {
        const s = gameStore.getState();
        if (s.flags['fragment:placed'] === true) return fragPuzzle?.label(a) ?? null;
        return s.flags['fragment:carried'] === true ? 'Place the fragment' : null;
      },
      onInteract: (a) => {
        const s = gameStore.getState();
        if (s.flags['fragment:placed'] === true) {
          fragPuzzle?.onInteract(a);
          return;
        }
        s.setFlag('fragment:placed', true);
        if (a.object) a.object.visible = true;
        audio.play('stone-grind', { position: a.position, volume: 0.5, rate: 1.5 });
        subtitles.say('ch5-placed');
      },
    });
    interaction.onTrigger('trigger:library-enter', () => {
      if (gameStore.getState().flags['fragment:placed'] !== true) gsap.delayedCall(5, () => subtitles.say('ch5-missing'));
    });
    // ---- Chapter VI: the Forgetting.
    interaction.onTrigger('encounter:corruption', () => {
      const s = gameStore.getState();
      if (s.flags['shrine:cleansed'] === true || this.runner.active) return;
      const ready = ['memory:vakratunda', 'puzzle:moon-shadow', 'beat:evidence', 'puzzle:scribe-fragments'].every((f) => s.flags[f] === true);
      if (!ready) {
        if (performance.now() - this.lockedHintAt > 15000) {
          this.lockedHintAt = performance.now();
          subtitles.say('ch6-locked');
        }
        return;
      }
      this.runner.run(new CorruptionEncounter(this.encounterContext, this.lib, this.streamer, this.lighting, this.doors));
      chapters.setLoop('SOLVE');
    });
    // ---- Finale hint when the seal puzzle is not yet available.
    interaction.onTrigger('encounter:finale', () => {
      if (gameStore.getState().flags['shrine:cleansed'] !== true) subtitles.say('finale-locked');
    });
  }

  private updateMoonChamber(): void {
    const s = gameStore.getState();
    const inMoon = this.streamer.zone === 'moon';
    if (inMoon) {
      const closed = s.flags['moon:roof-closed'] === true;
      this.lighting.pinned = closed ? 'shadow' : 'moonlit';
      this.roofPinned = true;
    } else if (this.roofPinned && !this.runner.active) {
      this.lighting.pinned = null;
      this.roofPinned = false;
    }
    // Beams from correctly turned mirrors to the lens, in moonlight only.
    const lens = new THREE.Vector3(MOON_CX, MOON_Y + 1.2, MOON_CZ);
    for (let i = 0; i < 4; i++) {
      const beam = this.beams[i] as THREE.Mesh;
      const a = this.streamer.anchors.get(`mechanism:mirror-${i}`);
      const solved = s.flags['puzzle:moon-alignment'] === true;
      if (!a || !inMoon || this.lighting.moonState !== 'moonlit') {
        beam.visible = false;
        continue;
      }
      const rot = typeof s.flags[`mirror:${i}`] === 'number' ? (s.flags[`mirror:${i}`] as number) : a.object?.rotation.y ?? 0;
      const steps = ((Math.round(rot / (Math.PI / 4)) % 8) + 8) % 8;
      const aligned = steps === MIRROR_SOLUTION[i] || solved;
      beam.visible = aligned;
      if (!aligned) continue;
      const from = new THREE.Vector3(a.position.x, MOON_Y + 2.6, a.position.z);
      const mid = from.clone().add(lens).multiplyScalar(0.5);
      const len = from.distanceTo(lens);
      beam.position.copy(mid);
      beam.scale.set(1, len, 1);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lens.clone().sub(from).normalize());
    }
  }

  update(): void {
    this.updateMoonChamber();
    const s = gameStore.getState();
    if (!this.finaleStarted && s.flags['puzzle:sanctum-seal'] === true && s.flags['sanctum:restored'] !== true && !this.runner.active) {
      this.finaleStarted = true;
      this.runner.run(new FinaleCinematic(this.encounterContext, this.lighting, this.streamer, this.moon, () => location.reload(), this.setDawn));
    }
    void this.engine;
  }

  dispose(): void {
    for (const b of this.beams) this.engine.scene.remove(b);
    this.beamGeo.dispose();
    this.beamMat.dispose();
  }
}
