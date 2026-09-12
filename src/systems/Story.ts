import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { Anchor } from '@/world/WorldTypes';
import type { MaterialLibrary } from '@/world/Materials';
import { FireEffect } from '@/world/fx/Fire';
import { gameStore } from '@/state/store';
import { memoryByTrigger, type ChapterManager } from './ChapterManager';
import type { InteractionSystem } from './Interaction';
import type { MemoryPortal } from './MemoryPortal';
import type { Journal } from '@/ui/Journal';
import type { Subtitles } from '@/ui/Subtitles';
import type { LightingStates } from './LightingStates';
import type { DoorSystem } from './Doors';

/**
 * Story orchestration: the first-20-minutes beats (GDD §22), shrine lighting, lore stones, mural
 * triggers routed through the Memory Portal, and the visible present-day changes after each memory.
 * Everything here is driven by flags so it survives save/load and never repeats.
 */
export class Story implements System {
  readonly name = 'story';
  private readonly liveFires = new Map<string, FireEffect>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly interaction: InteractionSystem,
    private readonly chapters: ChapterManager,
    private readonly portal: MemoryPortal,
    private readonly audio: AudioSystem,
    private readonly visual: PlayerVisual,
    private readonly journal: Journal,
    private readonly subtitles: Subtitles,
    private readonly lighting: LightingStates,
    private readonly doors: DoorSystem,
    private readonly lib: MaterialLibrary,
  ) {
    this.bindTriggers();
    this.bindHandlers();
    if (gameStore.getState().flags['beat:arrived'] !== true) {
      chapters.beat('beat:arrived');
      gsap.delayedCall(2.5, () => subtitles.say('pro-arrive'));
    }
  }

  private bindTriggers(): void {
    const { interaction, chapters, subtitles } = this;
    interaction.onTrigger('trigger:bell-first', () => {
      if (!chapters.beat('beat:bell-first')) return;
      // A distant temple bell from the direction of the gate (§22 00:00–03:00).
      this.audio.play('bell-distant', { position: new THREE.Vector3(0, 8, 68), volume: 0.9, refDistance: 60 });
      gsap.delayedCall(2.2, () => subtitles.say('pro-bell'));
      chapters.setLoop('OBSERVE');
    });
    interaction.onTrigger('trigger:gate-sight', () => {
      if (chapters.beat('beat:gate-sight', 'pro-gate')) this.journal.unlock('pro-temple');
    });
    interaction.onTrigger('trigger:gate-enter', () => chapters.beat('beat:gate-enter'));
    interaction.onTrigger('trigger:courtyard-enter', () => {
      chapters.beat('beat:courtyard-enter', 'pro-courtyard');
    });
    interaction.onTrigger('trigger:hall-enter', () => {
      chapters.beat('beat:hall-enter', 'pro-hall');
      chapters.setLoop('EXPLORE');
    });
    interaction.onTrigger('trigger:hall-dais', () => {
      if (!chapters.beat('beat:hall-dais', 'pro-mural')) return;
      gsap.delayedCall(4, () => this.lanternSequence());
    });
    interaction.onTrigger('trigger:passage-enter', () => {
      chapters.beat('beat:passage-enter', 'ch2-enter');
      chapters.setLoop('EXPLORE');
    });
    interaction.onTrigger('trigger:moon-enter', () => chapters.beat('beat:moon-enter', 'ch3-enter'));
    interaction.onTrigger('trigger:tunnels-enter', () => chapters.beat('beat:tunnels-enter'));
    interaction.onTrigger('trigger:library-enter', () => chapters.beat('beat:library-enter', 'ch5-enter'));
    interaction.onTrigger('trigger:shrine-enter', () => chapters.beat('beat:shrine-enter', 'ch6-enter'));
    interaction.onTrigger('trigger:sanctum-enter', () => chapters.beat('beat:sanctum-enter', 'finale-enter'));
    interaction.onTrigger('lore:temple-purpose', () => chapters.beat('beat:evidence', 'ch4-twist'));
  }

  /** §22 07:00–10:00 — the lantern goes out and a lamp the traveller did not light answers. */
  private lanternSequence(): void {
    const s = gameStore.getState();
    if (s.flags['diyas:hall'] === true) return;
    this.chapters.setLoop('OBSERVE');
    this.visual.setLantern(false);
    s.setFlag('lantern:lit', false);
    this.audio.play('lantern-out', { volume: 0.7 });
    this.subtitles.say('pro-lantern');
    const anchor = this.streamer.anchors.get('diyas:hall');
    const diyas = anchor?.object;
    gsap.delayedCall(1.6, () => {
      if (!diyas) return;
      diyas.children.forEach((d, i) => {
        gsap.delayedCall(i * 0.55, () => {
          const flame = d.children[1];
          const glow = d.children[2];
          if (flame) flame.visible = true;
          if (glow && i % 2 === 0) glow.visible = true;
          d.getWorldPosition(this.tmp);
          this.audio.play('diya-light', { position: this.tmp.clone(), volume: 0.55, rate: 0.95 + i * 0.03 });
          if (i === 0) this.subtitles.say('pro-diya');
          if (i === diyas.children.length - 1) {
            this.subtitles.say('pro-path');
            s.setFlag('diyas:hall', true);
            this.chapters.setLoop('EXPLORE');
          }
        });
      });
    });
  }

  private bindHandlers(): void {
    const { interaction, chapters, portal, subtitles } = this;
    // Lore stones and inscriptions.
    interaction.registerKind('lore', {
      label: (a) => (a.data?.hidden === true && this.lighting.moonState !== 'shadow' ? null : 'Read'),
      onInteract: (a) => {
        const text = typeof a.data?.text === 'string' ? a.data.text : a.id;
        const line = typeof a.data?.line === 'string' ? a.data.line : null;
        this.audio.play('ui-open', { volume: 0.5 });
        if (line) subtitles.say(line);
        else if (this.journal.unlock(text)) subtitles.sayText('Recorded in the journal.', 2.5);
        else subtitles.sayText('Already recorded.', 2);
        this.journal.unlock(text);
        if (a.id === 'lore:inscription-first') chapters.beat('beat:inscription-read');
        if (a.id === 'lore:milestone') this.journal.unlock('pro-milestone');
        chapters.setLoop('DISCOVER_CLUE');
      },
    });
    // Shrines: light once, fast-travel points forever.
    interaction.registerKind('shrine', {
      label: (a) => (this.isShrineLit(a) ? null : 'Light the shrine'),
      onInteract: (a) => this.lightShrine(a),
    });
    // Murals and statues that hold memories.
    interaction.registerKind('mural', {
      label: (a) => {
        const def = memoryByTrigger(a.id);
        if (!def) return 'Examine the mural';
        const s = gameStore.getState();
        if (s.flags[def.completionFlag] === true) return null;
        if (def.requiresFlag && s.flags[def.requiresFlag] !== true) return 'Examine the mural';
        return 'Touch the mural';
      },
      onInteract: (a) => {
        const def = memoryByTrigger(a.id);
        const s = gameStore.getState();
        if (!def || (def.requiresFlag && s.flags[def.requiresFlag] !== true)) {
          subtitles.say(a.id === 'mural:broken-tusk' ? 'pro-mural' : 'ch5-enter');
          chapters.setLoop('OBSERVE');
          return;
        }
        chapters.setLoop('ENTER_MEMORY');
        void portal.enter(def, a.object).then(() => chapters.setLoop('SOLVE'));
      },
    });
    interaction.register('object:passage-altar-true', {
      label: () => {
        const s = gameStore.getState();
        if (s.flags['memory:vakratunda'] === true) return null;
        return s.flags['puzzle:passage-illusion'] === true ? 'Touch the altar' : 'Touch';
      },
      onInteract: (a) => {
        const s = gameStore.getState();
        const def = memoryByTrigger(a.id);
        if (!def) return;
        if (s.flags['puzzle:passage-illusion'] !== true) {
          s.setFlag('puzzle:passage-illusion', true);
          subtitles.say('ch2-light');
          this.audio.play('symbol-chime', { volume: 0.7 });
          return;
        }
        void portal.enter(def, a.object);
      },
    });
    interaction.register('object:passage-altar-false', {
      label: () => (gameStore.getState().flags['puzzle:passage-illusion'] === true ? null : 'Touch'),
      onInteract: () => {
        subtitles.sayText('It casts no shadow. The hand passes through.', 3.5, 'temple');
        this.audio.play('shimmer', { volume: 0.5, rate: 0.7 });
      },
    });
    // Present-day change after the Broken Tusk memory: the statue by the east door turns (§22 19:00–20:00).
    this.engine.events.on('sceneloaded', () => undefined);
  }

  private isShrineLit(a: Anchor): boolean {
    return gameStore.getState().flags[a.id] === true;
  }

  private lightShrine(a: Anchor): void {
    const s = gameStore.getState();
    s.setFlag(a.id, true);
    s.activateShrine(a.id);
    this.audio.play('diya-light', { position: a.position, volume: 0.8 });
    this.subtitles.say('shrine-lit');
    this.chapters.setLoop('UNLOCK');
    this.spawnFire(a);
  }

  private spawnFire(a: Anchor): void {
    if (this.liveFires.has(a.id)) return;
    const f = new FireEffect(this.lib, { scale: 1, light: true, lightIntensity: 30, lightDistance: 10 });
    f.group.position.copy(a.position);
    this.engine.scene.add(f.group);
    this.liveFires.set(a.id, f);
  }

  update(dt: number, elapsed: number): void {
    const cam = this.engine.camera;
    for (const f of this.liveFires.values()) f.update(dt, elapsed, cam);
    // Once the memory completes, the temple recognises it: the passage opens (handled by the portal) and
    // the diyas stay lit; here we only keep shrine fires alive across unit reloads.
    for (const a of this.streamer.anchors.values()) {
      if (a.kind === 'shrine' && a.data?.lit !== true && this.isShrineLit(a) && !this.liveFires.has(a.id)) this.spawnFire(a);
    }
    void this.doors;
  }

  dispose(): void {
    for (const f of this.liveFires.values()) {
      this.engine.scene.remove(f.group);
      f.dispose();
    }
    this.liveFires.clear();
  }
}
