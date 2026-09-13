import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { PlayerVisual } from '@/player/PlayerVisual';
import type { CameraRig } from '@/player/CameraRig';
import type { MaterialLibrary } from '@/world/Materials';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { LightingStates } from '@/systems/LightingStates';
import type { SaveSystem } from '@/systems/SaveSystem';
import { gameStore } from '@/state/store';
import { Asura } from './Asura';
import type { Gun } from './Gun';
import { MISSIONS, missionByTask, type MissionDef } from './MissionData';
import type { MissionHUD } from './MissionHUD';
import { Narration } from './Narration';
import { TaskMenu } from './TaskMenu';
import { Voice } from '@/audio/Voice';
import { missionLineId } from './VoiceLines';

type Phase = 'idle' | 'travel' | 'narration' | 'arming' | 'battle' | 'respawn' | 'victory' | 'failed' | 'ended';

const MAX_HEARTS = 3;
const FLAG_UNLOCKED = 'mission:unlocked';
const FLAG_CURRENT = 'mission:current';
const FLAG_BOSS_HP = 'mission:bossHp';
const FLAG_HEARTS = 'mission:hearts';

/**
 * The mission flow: Task N card → travel to the arena → the asura rises while its story is narrated →
 * the Astra is granted → battle with hearts and a villain health bar → victory card → Task N+1, or on
 * losing every heart a choice: replay the previous task, or continue this one from the same stage.
 */
export class MissionDirector implements System {
  readonly name = 'missions';
  phase: Phase = 'idle';
  task = 1;
  hearts = MAX_HEARTS;
  health = 100;
  private asura: Asura | null = null;
  private def: MissionDef | null = null;
  private readonly narration: Narration;
  private readonly menu: TaskMenu;
  private readonly voice: Voice;
  private invuln = 0;
  /** Extra fill so arenas read clearly during battle (interiors are lit for exploration, not aiming). */
  private readonly battleFill = new THREE.HemisphereLight(0x8a9ab8, 0x2a2430, 1.4);
  private lastTaskBanner = 0;
  onDawn: ((t: number) => void) | null = null;
  setVeil: ((v: number) => void) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly lib: MaterialLibrary,
    private readonly streamer: WorldStreamer,
    private readonly player: PlayerController,
    private readonly visual: PlayerVisual,
    private readonly rig: CameraRig,
    private readonly audio: AudioSystem,
    private readonly gun: Gun,
    private readonly hud: MissionHUD,
    private readonly lighting: LightingStates,
    private readonly save: SaveSystem,
  ) {
    this.voice = new Voice();
    this.narration = new Narration(engine, audio, this.voice);
    // A key or click that closes the card is a user gesture: capture the mouse for the battle.
    this.narration.onGestureDismiss = () => {
      if (engine.input.device === 'kbm') engine.input.mouse.requestLock();
    };
    this.menu = new TaskMenu(engine);
    this.battleFill.visible = false;
    engine.scene.add(this.battleFill);
  }

  get unlocked(): number {
    const v = gameStore.getState().flags[FLAG_UNLOCKED];
    return typeof v === 'number' ? v : 1;
  }

  /** Begin (new game: task 1; continue: the saved task from its saved stage). */
  begin(mode: 'new' | 'continue'): void {
    const s = gameStore.getState();
    this.audio.setChant(true);
    if (mode === 'continue') {
      const cur = s.flags[FLAG_CURRENT];
      this.task = typeof cur === 'number' ? cur : 1;
      const hearts = s.flags[FLAG_HEARTS];
      this.hearts = typeof hearts === 'number' ? Math.max(1, hearts) : MAX_HEARTS;
      const bossHp = s.flags[FLAG_BOSS_HP];
      this.startTask(this.task, typeof bossHp === 'number' ? bossHp : undefined);
    } else {
      this.task = 1;
      this.hearts = MAX_HEARTS;
      s.setFlag(FLAG_UNLOCKED, 1);
      this.startTask(1);
    }
  }

  /** Open the task select (pause menu / fail screen). */
  openTaskSelect(): void {
    const buttons = MISSIONS.filter((m) => m.task <= this.unlocked).map((m) => ({
      label: `Task ${m.task}: ${m.villain}`,
      detail: `${m.epithet} · threat ${'★'.repeat(m.threat)}`,
      primary: m.task === this.task,
      onSelect: () => this.restartTask(m.task, true),
    }));
    this.menu.show('Choose a task', 'Every task you have reached stays open.', buttons);
  }

  private restartTask(task: number, fresh: boolean): void {
    this.teardownAsura();
    this.hearts = MAX_HEARTS;
    this.health = 100;
    gameStore.getState().setFlag(FLAG_BOSS_HP, 0);
    this.startTask(task, fresh ? undefined : undefined);
  }

  private startTask(task: number, bossHp?: number): void {
    const def = missionByTask(task);
    if (!def) {
      this.ending();
      return;
    }
    this.def = def;
    this.task = task;
    const s = gameStore.getState();
    s.setFlag(FLAG_CURRENT, task);
    s.setFlag(FLAG_UNLOCKED, Math.max(this.unlocked, task));
    s.setFlag(FLAG_HEARTS, this.hearts);
    s.setQuest({ title: `Task ${task} — ${def.villain}`, objective: `Defeat ${def.villain}, ${def.epithet}` });
    this.hud.setHearts(this.hearts);
    this.health = 100;
    this.hud.setHealth(this.health);
    this.hud.hideBoss();
    this.gun.setEquipped(false);
    this.hud.setWeaponVisible(false);
    this.phase = 'travel';
    this.player.movementLocked = true;
    this.audio.play('task-begin', { volume: 0.7 });
    // Travel veil, then the arena.
    this.setVeil?.(1);
    gsap.delayedCall(1.0, () => {
      const [x, y, z, yaw] = def.playerSpawn;
      this.player.teleport(new THREE.Vector3(x, y, z), yaw);
      this.rig.setYawPitch(yaw, 0.3);
      this.streamer.loadImmediate(1);
      this.rig.snapBehind();
      this.audio.setZone(this.streamer.zone);
      void this.lighting.transition('present', 2.5);
      this.battleFill.visible = true;
      this.asura = new Asura(this.engine, this.lib, this.player, this.rig, this.audio, this.gun, def, {
        onPlayerHit: (dmg, src) => this.onPlayerHit(dmg, src),
        onDefeated: () => this.onVictory(),
        onHealth: (hp, max, shielded) => {
          this.hud.setBossHealth(hp, max, shielded);
          gameStore.getState().setFlag(FLAG_BOSS_HP, hp);
        },
      }, bossHp);
      gsap.delayedCall(0.8, () => {
        this.setVeil?.(0);
        this.phase = 'narration';
        this.asura?.appear();
        this.narration.show({
          title: `${def.villain}`,
          subtitle: `${def.epithet} — asura of ${def.vice}`,
          threat: def.threat,
          lines: def.intro,
          voiceIds: def.intro.map((_, i) => missionLineId(def.id, i)),
          onDone: () => this.arm(),
        });
      });
    });
  }

  private arm(): void {
    if (!this.def) return;
    this.phase = 'arming';
    this.visual.setLantern(true, true);
    this.gun.setEquipped(true);
    this.gun.ammo = this.gun.magSize;
    this.hud.setWeaponVisible(true);
    this.hud.showBoss(this.def.villain, this.def.epithet);
    this.hud.setBossHealth(this.asura?.hp ?? 0, this.asura?.maxHp ?? 1, false);
    this.hud.showBanner(`TASK ${this.def.task}`, 2.2, 'The Astra is yours. Defeat ' + this.def.villain + '.');
    this.audio.play('diya-light', { volume: 0.8, rate: 0.8 });
    this.voice.speak('astra-granted');
    this.player.movementLocked = false;
    gsap.delayedCall(2.4, () => {
      if (this.phase !== 'arming') return;
      this.phase = 'battle';
      this.hud.showBanner('BEGIN', 1.4);
      this.asura?.wake();
      this.audio.play('asura-roar', { volume: 0.8 });
    });
  }

  private onPlayerHit(damage: number, source: string): void {
    if (this.phase !== 'battle' || this.invuln > 0) return;
    this.health = Math.max(0, this.health - damage);
    this.hud.setHealth(this.health);
    this.hud.damageFlash();
    this.rig.shake(0.7);
    this.audio.play('block-impact', { volume: 0.8, rate: 0.75 });
    this.invuln = 0.35;
    void source;
    if (this.health <= 0) this.loseHeart();
  }

  private loseHeart(): void {
    this.hearts--;
    gameStore.getState().setFlag(FLAG_HEARTS, this.hearts);
    this.hud.setHearts(this.hearts);
    this.audio.play('heart-lost', { volume: 0.9 });
    this.rig.shake(1.4);
    if (this.hearts <= 0) {
      this.fail();
      return;
    }
    // Respawn at the arena entrance; the asura holds its ground and its health.
    this.phase = 'respawn';
    this.player.movementLocked = true;
    this.hud.showBanner('HEART LOST', 1.8, `${this.hearts} ${this.hearts === 1 ? 'heart' : 'hearts'} remain`);
    this.voice.speak(this.hearts === 1 ? 'last-heart' : 'heart-lost');
    this.setVeil?.(1);
    gsap.delayedCall(1.2, () => {
      if (!this.def) return;
      const [x, y, z, yaw] = this.def.playerSpawn;
      this.player.teleport(new THREE.Vector3(x, y, z), yaw);
      this.rig.setYawPitch(yaw, 0.3);
      this.rig.snapBehind();
      this.health = 100;
      this.hud.setHealth(this.health);
      this.gun.ammo = this.gun.magSize;
      this.asura?.hold(2.5);
      this.setVeil?.(0);
      gsap.delayedCall(0.8, () => {
        this.player.movementLocked = false;
        this.phase = 'battle';
        this.invuln = 1.5;
      });
    });
  }

  private fail(): void {
    if (!this.def) return;
    this.phase = 'failed';
    this.player.movementLocked = true;
    const def = this.def;
    const prev = missionByTask(def.task - 1);
    this.save.save();
    const buttons = [];
    buttons.push({
      label: `Continue Task ${def.task} from the same stage`,
      detail: `${def.villain} keeps the wounds you gave him · hearts restored`,
      primary: true,
      onSelect: () => {
        const hp = this.asura?.hp ?? def.boss.hp;
        this.teardownAsura();
        this.hearts = MAX_HEARTS;
        this.startTask(def.task, hp);
      },
    });
    if (prev) buttons.push({ label: `Play Task ${prev.task} again`, detail: `${prev.villain}, ${prev.epithet}`, onSelect: () => this.restartTask(prev.task, true) });
    buttons.push({ label: `Restart Task ${def.task}`, detail: 'from the beginning', onSelect: () => this.restartTask(def.task, true) });
    buttons.push({ label: 'Choose a task', onSelect: () => this.openTaskSelect() });
    this.menu.show(`Task ${def.task} failed`, `${def.villain} has defeated you.`, buttons);
    this.voice.speak('task-failed');
  }

  private onVictory(): void {
    if (!this.def) return;
    this.phase = 'victory';
    const def = this.def;
    const s = gameStore.getState();
    s.setFlag(`mission:done:${def.task}`, true);
    s.setFlag(FLAG_UNLOCKED, Math.max(this.unlocked, def.task + 1));
    s.setFlag(FLAG_BOSS_HP, 0);
    s.unlockJournal(`asura-${def.id}`);
    this.hud.hideBoss();
    this.hud.showBanner('TASK COMPLETE', 3.2, `${def.villain}, ${def.epithet}, is broken.`);
    this.audio.play('task-complete', { volume: 0.9 });
    this.voice.speak('task-complete');
    void this.lighting.transition('present', 3);
    this.player.movementLocked = true;
    this.save.save();
    gsap.delayedCall(4.0, () => {
      this.teardownAsura();
      const next = missionByTask(def.task + 1);
      if (next) {
        this.hearts = MAX_HEARTS;
        this.startTask(next.task);
      } else this.ending();
    });
  }

  private ending(): void {
    this.phase = 'ended';
    this.gun.setEquipped(false);
    this.hud.setWeaponVisible(false);
    this.hud.showBanner('ALL EIGHT ARE BROKEN', 6, 'The temple remembers. Envy, pride, delusion, greed, anger, desire, attachment and ego — none of them holds it now.');
    this.voice.speak('all-broken');
    void this.lighting.transition('present', 4);
    const dawn = { t: 0 };
    gsap.to(dawn, { t: 1, duration: 14, delay: 3, onUpdate: () => this.onDawn?.(dawn.t) });
    gsap.delayedCall(9, () => {
      this.menu.show('The Temple of Eka-Danta', 'Every asura of the Vinayaka Purana tradition has been faced. Inspired by traditional stories; all events and characters here are fictional.', [
        { label: 'Play any task again', primary: true, onSelect: () => this.openTaskSelect() },
        { label: 'Return to title', onSelect: () => location.reload() },
      ]);
    });
  }

  private teardownAsura(): void {
    this.asura?.dispose();
    this.asura = null;
    this.gun.clearTargets();
  }

  update(dt: number, elapsed: number): void {
    this.narration.update(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.asura?.update(dt, elapsed);
    if (this.phase === 'battle') {
      // Keep the player inside the arena: the asura will not chase beyond its ring.
      const d = this.def;
      if (d) {
        const dx = this.player.position.x - d.arenaCenter[0];
        const dz = this.player.position.z - d.arenaCenter[2];
        const dist = Math.hypot(dx, dz);
        if (dist > d.arenaRadius) this.player.externalPush.set((-dx / dist) * 6, 0, (-dz / dist) * 6);
      }
    }
    void this.lastTaskBanner;
  }

  /** Test hook. */
  debugState(): Record<string, unknown> {
    return { phase: this.phase, task: this.task, hearts: this.hearts, health: this.health, bossHp: this.asura?.hp ?? null, bossMax: this.asura?.maxHp ?? null, bossState: this.asura?.state ?? null, bossPos: this.asura?.position.toArray() ?? null, narrating: this.narration.isActive, menu: this.menu.isVisible };
  }
  /** Test hook: narration voice state. */
  debugVoice(): Record<string, unknown> {
    return this.narration.debugVoice();
  }
  /** Test hook: skip the narration. */
  debugSkipNarration(): void {
    while (this.narration.isActive) this.narration.advance();
  }
  /** Test hook: hit the boss directly. */
  debugDamageBoss(amount: number): void {
    if (this.asura) this.asura.onShot(amount, this.asura.position.clone());
  }
  /** Test hook: drain the player. */
  debugHurtPlayer(amount: number): void {
    this.onPlayerHit(amount, 'debug');
  }
  /** Test hook: choose a task menu option by index. */
  debugMenuChoose(index: number): void {
    const btn = this.engine.uiRoot.querySelectorAll('.taskmenu-btn')[index] as HTMLButtonElement | undefined;
    btn?.click();
  }

  dispose(): void {
    this.teardownAsura();
    this.narration.dispose();
    this.voice.dispose();
    this.audio.setChant(false);
    this.menu.dispose();
    this.engine.scene.remove(this.battleFill);
  }
}
