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
import { Climax } from './Climax';
import { GltfAsura } from './AsuraModel';
import type { Gun } from './Gun';
import { MISSIONS, missionByTask, type AttackKind, type MissionDef } from './MissionData';
import type { MissionHUD } from './MissionHUD';
import { Narration } from './Narration';
import { TaskMenu } from './TaskMenu';
import { Voice } from '@/audio/Voice';
import { missionLineId } from './VoiceLines';
import { scoreOf, type Leaderboard, type RunResult } from '@/systems/Leaderboard';
import type { LeaderboardCard } from '@/ui/LeaderboardCard';

type Phase = 'idle' | 'travel' | 'narration' | 'arming' | 'battle' | 'respawn' | 'victory' | 'failed' | 'ended';

const MAX_HEARTS = 3;
const FLAG_UNLOCKED = 'mission:unlocked';
const FLAG_STATS = 'mission:stats:';

/** What one completed task took: seconds of battle, hearts lost, shots fired and hit, retries. */
interface TaskStats {
  seconds: number;
  heartsLost: number;
  shots: number;
  hits: number;
  retries: number;
}

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (hits: number, shots: number): string => (shots > 0 ? `${Math.round((hits / shots) * 100)} %` : '—');

/** Rank a run: only a full run of every task can rank above C; then hearts lost, accuracy and retries. */
const rankOf = (t: TaskStats, complete: boolean): { rank: string; title: string } => {
  const acc = t.shots > 0 ? t.hits / t.shots : 0;
  if (!complete) return { rank: 'C', title: 'Unbroken — a partial run' };
  if (t.heartsLost <= 1 && acc >= 0.55 && t.retries === 0) return { rank: 'S', title: 'Flawless pilgrim' };
  if (t.heartsLost <= 5 && t.retries <= 1) return { rank: 'A', title: 'Steadfast' };
  if (t.heartsLost <= 10) return { rank: 'B', title: 'Persevering' };
  return { rank: 'C', title: 'Unbroken' };
};
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
  /** Bumped per task start so a slow model load cannot spawn an asura for a task already left. */
  private generation = 0;
  onDawn: ((t: number) => void) | null = null;
  setVeil: ((v: number) => void) | null = null;
  /** Hide/show the base HUD (quest tracker, compass) around the climax. */
  onCinematic: ((v: boolean) => void) | null = null;
  private readonly climax: Climax;
  /** Battle clock and counters for the task in progress. */
  private battleSeconds = 0;
  private taskHeartsLost = 0;
  private taskRetries = 0;
  private shotsAtStart = 0;
  private hitsAtStart = 0;

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
    private readonly leaderboard: Leaderboard,
    private readonly leaderboardCard: LeaderboardCard,
  ) {
    this.voice = new Voice();
    this.narration = new Narration(engine, audio, this.voice);
    // A key or click that closes the card is a user gesture: capture the mouse for the battle.
    this.narration.onGestureDismiss = () => {
      if (engine.input.device === 'kbm') engine.input.mouse.requestLock();
    };
    this.menu = new TaskMenu(engine);
    this.climax = new Climax(engine, lib, player, rig, audio, visual);
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
      // `?task=N` starts a new game at a given task (testing / screenshots).
      const forced = Number(new URLSearchParams(location.search).get('task') ?? '1');
      this.task = missionByTask(forced) ? forced : 1;
      this.hearts = MAX_HEARTS;
      s.setFlag(FLAG_UNLOCKED, this.task);
      this.startTask(this.task);
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
    if (fresh) gameStore.getState().setFlag(`${FLAG_STATS}${task}`, '');
    this.startTask(task);
  }

  private readStats(task: number): TaskStats | null {
    const raw = gameStore.getState().flags[`${FLAG_STATS}${task}`];
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw) as TaskStats;
    } catch {
      return null;
    }
  }

  /** The run's results: one row per task plus totals and a rank. */
  private buildResults(): { table: HTMLElement; total: TaskStats; rank: { rank: string; title: string } } {
    const total: TaskStats = { seconds: 0, heartsLost: 0, shots: 0, hits: 0, retries: 0 };
    const table = document.createElement('table');
    table.className = 'results';
    table.innerHTML = '<thead><tr><th>Task</th><th>Asura</th><th>Time</th><th>Accuracy</th><th>Hearts lost</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const m of MISSIONS) {
      const t = this.readStats(m.task);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${m.task}</td><td>${m.villain}</td><td>${t ? fmtTime(t.seconds) : '—'}</td><td>${t ? pct(t.hits, t.shots) : '—'}</td><td>${t ? t.heartsLost : '—'}</td>`;
      body.appendChild(tr);
      if (t) {
        total.seconds += t.seconds;
        total.heartsLost += t.heartsLost;
        total.shots += t.shots;
        total.hits += t.hits;
        total.retries += t.retries;
      }
    }
    table.appendChild(body);
    const rank = rankOf(total, MISSIONS.every((m) => this.readStats(m.task) !== null));
    const foot = document.createElement('tfoot');
    foot.innerHTML = `<tr><td colspan="2">Rank <strong class="results-rank">${rank.rank}</strong> · ${rank.title}</td><td>${fmtTime(total.seconds)}</td><td>${pct(total.hits, total.shots)}</td><td>${total.heartsLost}</td></tr>`;
    table.appendChild(foot);
    return { table, total, rank };
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
    if (bossHp === undefined) {
      this.battleSeconds = 0;
      this.taskHeartsLost = 0;
      this.taskRetries = 0;
    } else this.taskRetries++;
    this.shotsAtStart = this.gun.shotsFired;
    this.hitsAtStart = this.gun.shotsHit;
    this.gun.setEquipped(false);
    this.hud.setWeaponVisible(false);
    this.climax.dispose();
    this.hud.setCinematic(false);
    this.onCinematic?.(false);
    this.phase = 'travel';
    this.player.movementLocked = true;
    this.audio.play('task-begin', { volume: 0.7 });
    // A modelled avatar (public/models/asuras/<id>.glb) replaces the procedural stand-in when present.
    const model = GltfAsura.load(def);
    const generation = ++this.generation;
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
      void model.then((avatar) => {
        if (generation !== this.generation || this.def !== def) return;
        this.asura = new Asura(this.engine, this.lib, this.player, this.rig, this.audio, this.gun, def, {
          onPlayerHit: (dmg, src) => this.onPlayerHit(dmg, src),
          onDefeated: () => this.onVictory(),
          onHealth: (hp, max, shielded) => {
            this.hud.setBossHealth(hp, max, shielded);
            gameStore.getState().setFlag(FLAG_BOSS_HP, hp);
          },
        }, bossHp, avatar ?? undefined);
        // The model may arrive after the card or even the battle has begun.
        if (this.phase === 'narration' || this.phase === 'arming' || this.phase === 'battle') this.asura.appear();
        if (this.phase === 'battle') this.asura.wake();
      });
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
    const fresh = this.gun.setUnlockedTask(Math.max(this.unlocked, this.def.task));
    this.gun.setEquipped(true);
    this.gun.refill();
    this.hud.setWeaponVisible(true);
    this.hud.showBoss(this.def.villain, this.def.epithet);
    this.hud.setBossHealth(this.asura?.hp ?? 0, this.asura?.maxHp ?? 1, false);
    this.player.movementLocked = false;
    const granted = fresh.find((w) => w.unlockTask === this.def?.task);
    if (granted) {
      // A new Astra is granted with this task: hand it over, then the fighting tip.
      this.gun.select(granted.id, true);
      this.hud.showBanner(`THE ${granted.name.toUpperCase()}`, 3.4, `${granted.epithet} · ${granted.howTo}`);
      this.audio.play('weapon-granted', { volume: 0.8 });
      this.voice.speak(`weapon-${granted.id}`);
      gsap.delayedCall(3.6, () => {
        if (this.phase === 'arming' || this.phase === 'battle') this.hud.showBanner(`TASK ${this.def?.task ?? ''}`, 3.0, this.def?.hint ?? '');
      });
    } else {
      this.hud.showBanner(`TASK ${this.def.task}`, 3.4, `The Astra is yours. ${this.def.hint}`);
      this.audio.play('diya-light', { volume: 0.8, rate: 0.8 });
      this.voice.speak('astra-granted');
    }
    gsap.delayedCall(granted ? 3.6 : 2.4, () => {
      if (this.phase !== 'arming') return;
      this.phase = 'battle';
      this.hud.showBanner('BEGIN', 1.4);
      this.asura?.wake();
      this.audio.play('asura-roar', { volume: 0.8 });
    });
  }

  private onPlayerHit(damage: number, source: string): void {
    if (this.phase !== 'battle' || this.invuln > 0) return;
    this.health = Math.min(100, Math.max(0, this.health - damage));
    this.hud.setHealth(this.health);
    this.hud.damageFlash();
    this.rig.shake(0.7);
    this.visual.flinch();
    this.audio.play('block-impact', { volume: 0.8, rate: 0.75 });
    this.invuln = 0.35;
    void source;
    if (this.health <= 0) this.loseHeart();
  }

  private loseHeart(): void {
    this.hearts--;
    this.taskHeartsLost++;
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
      this.gun.refill();
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
    this.menu.show(`Task ${def.task} failed`, `${def.villain} has defeated you, ${gameStore.getState().profile.name}.`, buttons);
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
    const prev = this.readStats(def.task);
    const stats: TaskStats = {
      seconds: this.battleSeconds,
      heartsLost: this.taskHeartsLost,
      shots: (prev?.shots ?? 0) + (this.gun.shotsFired - this.shotsAtStart),
      hits: (prev?.hits ?? 0) + (this.gun.shotsHit - this.hitsAtStart),
      retries: this.taskRetries,
    };
    s.setFlag(`${FLAG_STATS}${def.task}`, JSON.stringify(stats));
    const hearts = stats.heartsLost === 0 ? 'no hearts lost' : `${stats.heartsLost} ${stats.heartsLost === 1 ? 'heart' : 'hearts'} lost`;
    this.hud.showBanner('TASK COMPLETE', 3.6, `${def.villain}, ${def.epithet}, is broken. ${fmtTime(stats.seconds)} · ${pct(stats.hits, stats.shots)} accuracy · ${hearts}. Well fought, ${gameStore.getState().profile.name}.`);
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
    this.hud.hideBoss();
    this.hud.setCinematic(true);
    this.onCinematic?.(true);
    void this.lighting.transition('present', 4);
    // The climax: before the mountain gateway (the last arena) the temple's lord is revealed — the
    // idol rises to its full height while the traveller kneels and dawn comes up. Then the results.
    const def = this.def as MissionDef;
    const [cx, cy, cz] = def.arenaCenter;
    const idolAt = new THREE.Vector3(cx, cy, cz - 12);
    const heroAt = new THREE.Vector3(cx, cy + 0.2, cz + 10);
    const generation = ++this.generation;
    this.setVeil?.(1);
    gsap.delayedCall(1.0, () => {
      if (generation !== this.generation) return;
      const dawn = { t: 0 };
      gsap.to(dawn, { t: 0.7, duration: 13, delay: 2.5, ease: 'sine.inOut', onUpdate: () => this.onDawn?.(dawn.t) });
      this.climax.start(idolAt, heroAt, 0, (id) => this.voice.speak(id), () => {
        if (generation !== this.generation) return;
        this.hud.showBanner('ALL FIVE ARE BROKEN', 6, 'The temple remembers whose house it is. Pride, anger, greed, delusion and ego — none of them holds it now.');
        this.voice.speak('all-broken');
        gsap.delayedCall(7.5, () => generation === this.generation && this.showResults());
      });
      this.setVeil?.(0);
    });
  }

  private showResults(): void {
    {
      const { table, total, rank } = this.buildResults();
      const profile = gameStore.getState().profile;
      // Record the run once per ending; the card shows where it landed.
      const done = MISSIONS.filter((m) => this.readStats(m.task) !== null).length;
      const run: RunResult = { name: profile.name, hero: profile.hero, rank: rank.rank as RunResult['rank'], seconds: Math.round(total.seconds), heartsLost: total.heartsLost, accuracy: total.shots > 0 ? Math.round((total.hits / total.shots) * 100) : 0, tasks: done, date: new Date().toISOString(), score: 0 };
      run.score = scoreOf(run);
      const localPos = this.leaderboard.recordLocal(run);
      const note = document.createElement('p');
      note.className = 'taskmenu-sub results-note';
      note.textContent = `Recorded: #${localPos} on this device${this.leaderboard.hasRemote ? ' · submitting to everyone…' : ''}`;
      void this.leaderboard.submitRemote(run).then((pos) => {
        if (pos !== null) note.textContent = `Recorded: #${localPos} on this device · #${pos} among everyone`;
        else if (this.leaderboard.hasRemote) note.textContent = `Recorded: #${localPos} on this device · the shared board could not be reached`;
      });
      const body = document.createElement('div');
      body.append(table, note);
      this.menu.show(
        `${profile.name} — Rank ${rank.rank}`,
        `${rank.title}. Every asura has been faced. Inspired by traditional stories; all events and characters here are fictional.`,
        [
          { label: 'Leaderboard', primary: true, onSelect: () => void this.leaderboardCard.show(run, () => this.menu.show(`${profile.name} — Rank ${rank.rank}`, rank.title, [
            { label: 'Play any task again', primary: true, onSelect: () => this.openTaskSelect() },
            { label: 'New game', detail: 'from Task 1 with a fresh traveller', onSelect: () => this.engine.resetSaveAndReload() },
            { label: 'Return to title', onSelect: () => location.reload() },
          ])) },
          { label: 'Play any task again', onSelect: () => this.openTaskSelect() },
          { label: 'New game', detail: 'from Task 1 with a fresh traveller', onSelect: () => this.engine.resetSaveAndReload() },
          { label: 'Return to title', onSelect: () => location.reload() },
        ],
        body,
      );
    }
  }

  private teardownAsura(): void {
    this.asura?.dispose();
    this.asura = null;
    this.gun.clearTargets();
  }

  update(dt: number, elapsed: number): void {
    this.narration.update(dt);
    this.climax.update(dt, elapsed);
    this.visual.lookTarget = this.asura && this.asura.alive ? this.asura.position : null;
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.phase === 'battle') this.battleSeconds += dt;
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
    return { phase: this.phase, task: this.task, hearts: this.hearts, health: this.health, bossHp: this.asura?.hp ?? null, bossMax: this.asura?.maxHp ?? null, bossState: this.asura?.state ?? null, bossPos: this.asura?.position.toArray() ?? null, narrating: this.narration.isActive, menu: this.menu.isVisible, climax: this.climax.isRunning, ...(this.asura?.debugState() ?? {}) };
  }
  /** Test hook: narration voice state. */
  debugVoice(): Record<string, unknown> {
    return this.narration.debugVoice();
  }
  /** Test hook: skip the narration. */
  debugSkipNarration(): void {
    while (this.narration.isActive) this.narration.advance();
  }
  /** Test hook: freeze the boss for a few seconds (portraits). */
  debugHold(seconds: number): void {
    this.asura?.hold(seconds);
  }
  /** Test hook: make the boss perform an attack. */
  debugAttack(kind: string): void {
    this.asura?.debugAttack(kind as AttackKind);
  }
  /** Test hook: hit the boss directly. */
  debugDamageBoss(amount: number): void {
    if (this.asura) this.asura.onShot(amount, this.asura.position.clone(), true);
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
    this.climax.dispose();
    this.narration.dispose();
    this.voice.dispose();
    this.audio.setChant(false);
    this.menu.dispose();
    this.engine.scene.remove(this.battleFill);
  }
}
