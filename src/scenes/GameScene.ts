import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { SceneModule, System } from '@/engine/types';
import { CameraRig } from '@/player/CameraRig';
import { PlayerController } from '@/player/PlayerController';
import { PlayerVisual } from '@/player/PlayerVisual';
import { HUD } from '@/ui/HUD';
import { Journal } from '@/ui/Journal';
import { Subtitles } from '@/ui/Subtitles';
import { PauseMenu } from '@/ui/PauseMenu';
import { MapScreen } from '@/ui/MapScreen';
import { HowToPlay } from '@/ui/HowToPlay';
import { TravellerCard, loadProfile } from '@/ui/TravellerCard';
import { Leaderboard } from '@/systems/Leaderboard';
import { LeaderboardCard } from '@/ui/LeaderboardCard';
import { MaterialLibrary } from '@/world/Materials';
import { MoonLight } from '@/world/fx/Atmosphere';
import { patchIvyMaterial } from '@/world/props/Foliage';
import { WorldMap } from '@/world/WorldMap';
import { WorldStreamer } from '@/world/WorldStreamer';
import { DistantForest } from '@/world/DistantForest';
import type { ZoneId } from '@/world/WorldTypes';
import { AudioSystem } from '@/audio/AudioSystem';
import { InteractionSystem } from '@/systems/Interaction';
import { DoorSystem } from '@/systems/Doors';
import { LightingStates } from '@/systems/LightingStates';
import { SaveSystem } from '@/systems/SaveSystem';
import { ChapterManager } from '@/systems/ChapterManager';
import { PuzzleSystem } from '@/systems/Puzzles';
import { MemoryPortal, type FogOverride, type MemoryController } from '@/systems/MemoryPortal';
import { Story } from '@/systems/Story';
import { WaypointTrail } from '@/systems/WaypointTrail';
import { BrokenTuskEncounter } from '@/encounters/BrokenTusk';
import { VakratundaEncounter } from '@/encounters/Vakratunda';
import { EncounterRunner } from '@/systems/EncounterRunner';
import { IllusionSystem } from '@/systems/Illusions';
import { StoryChapters } from '@/systems/StoryChapters';
import { gameStore } from '@/state/store';
import { Gun } from '@/missions/Gun';
import { MissionHUD } from '@/missions/MissionHUD';
import { MissionDirector } from '@/missions/MissionDirector';

const EXTERIOR_FOG = { color: 0x0f2038, density: 0.022 };

/** Blends fog/ambient per zone, applies transition veils, and keeps the moon's shadow frustum on the player. */
class WorldAtmosphere implements System {
  readonly name = 'world-atmosphere';
  private readonly fog: THREE.FogExp2;
  private readonly targetColor = new THREE.Color(EXTERIOR_FOG.color);
  private targetDensity = EXTERIOR_FOG.density;
  private readonly ambient = new THREE.AmbientLight(0x34507a, 0);
  private targetAmbient = 0;
  private readonly tmpColor = new THREE.Color();
  /** Dark travel veil 0..1 (fast travel). */
  veil = 0;
  /** Sunrise 0..1 (finale): fog to pale warm, background to dawn. */
  dawn = 0;
  private readonly dawnColor = new THREE.Color(0xd9b48a);
  overrideProvider: (() => FogOverride | null) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly moon: MoonLight,
    private readonly lighting: LightingStates,
    private readonly focus: () => THREE.Vector3,
  ) {
    this.fog = new THREE.FogExp2(EXTERIOR_FOG.color, EXTERIOR_FOG.density);
    engine.scene.fog = this.fog;
    engine.scene.background = new THREE.Color(0x0b1626);
    engine.scene.add(this.ambient);
  }

  setZone(fog: { color: number; density: number } | undefined, ambient: { color: number; intensity: number } | undefined): void {
    this.targetColor.set(fog?.color ?? EXTERIOR_FOG.color);
    this.targetDensity = fog?.density ?? EXTERIOR_FOG.density;
    this.targetAmbient = ambient?.intensity ?? 0;
    if (ambient) this.ambient.color.set(ambient.color);
  }

  update(dt: number, elapsed: number): void {
    const override = this.overrideProvider?.() ?? null;
    let color = this.targetColor;
    let density = this.targetDensity;
    let k = 1 - Math.exp(-2.2 * dt);
    if (override) {
      color = override.color;
      density = override.density;
      k = 1 - Math.exp(-6 * dt);
    }
    if (this.dawn > 0.001) {
      this.tmpColor.copy(color).lerp(this.dawnColor, this.dawn);
      color = this.tmpColor;
      density = density * (1 - this.dawn * 0.6);
    }
    if (this.veil > 0.001) {
      this.tmpColor.copy(color).lerp(new THREE.Color(0x03060c), this.veil);
      color = this.tmpColor;
      density = density + this.veil * this.veil * 0.7;
      k = 1 - Math.exp(-8 * dt);
    }
    this.fog.color.lerp(color, k);
    this.fog.density += (density - this.fog.density) * k;
    this.ambient.intensity += (this.targetAmbient - this.ambient.intensity) * (1 - Math.exp(-2.2 * dt));
    (this.engine.scene.background as THREE.Color).copy(this.fog.color).multiplyScalar(0.75);
    this.moon.place(this.lighting.moonAzimuth, this.lighting.moonElevation, this.focus(), elapsed);
  }
}

/** The open world with every gameplay system attached. `?start=<zone>` spawns elsewhere for testing. */
export class GameScene implements SceneModule {
  readonly id = 'game';
  private save: SaveSystem | null = null;
  private streamer: WorldStreamer | null = null;
  private started = false;
  private missions: MissionDirector | null = null;
  private howto: HowToPlay | null = null;
  private traveller: TravellerCard | null = null;
  private leaderboardCard: LeaderboardCard | null = null;
  private visual: PlayerVisual | null = null;
  private readonly disposers: Array<() => void> = [];
  private mode: 'missions' | 'story' = 'missions';

  async init(engine: Engine): Promise<void> {
    const lib = MaterialLibrary.get(engine.maxAnisotropy);
    patchIvyMaterial(lib.ivy);
    engine.renderer.setClearColor(0x0b1626, 1);
    engine.renderer.toneMappingExposure = 1.2;
    engine.postfx.setBloom(0.6, 0.5, 0.86);
    engine.postfx.grade.set('present', 'present', 0);

    const world = new WorldMap();
    const params = new URLSearchParams(location.search);
    this.mode = params.get('mode') === 'story' ? 'story' : 'missions';
    const startZone = params.get('start') as ZoneId | null;
    // Test/dev: preset flags before the world builds (e.g. ?flags=door:hall-east,door:passage-moon).
    const preset = params.get('flags');
    if (preset) for (const f of preset.split(',')) if (f) gameStore.getState().setFlag(f, true);
    const spawn = startZone && startZone !== 'forest' ? this.zoneSpawn(startZone) : world.spawn;

    let rig: CameraRig | null = null;
    const controller = new PlayerController(engine, spawn.position, () => rig?.yaw ?? 0);
    controller.facingYaw = spawn.yaw;
    rig = new CameraRig(engine, controller, spawn.yaw);
    const cam = rig;
    const forward = new THREE.Vector3();
    const streamer = new WorldStreamer(engine, lib, world.terrain, world, () => {
      forward.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      return { position: controller.position, forward };
    });
    this.streamer = streamer;
    const moon = new MoonLight(engine.quality.settings.shadowMapSize);
    engine.scene.add(moon.sun, moon.sun.target, moon.hemi);
    const lighting = new LightingStates(engine, moon);
    const atmosphere = new WorldAtmosphere(engine, moon, lighting, () => controller.position);
    const audio = new AudioSystem(engine);
    audio.setListener(() => controller.position);
    streamer.onZoneChange = (zone) => {
      const def = world.zones.find((z) => z.id === zone);
      atmosphere.setZone(def?.fog, def?.ambient);
      audio.setZone(zone);
    };

    streamer.loadImmediate(1);
    const y = world.terrain.heightAt(spawn.position.x, spawn.position.z);
    if (!startZone || startZone === 'forest') controller.teleport(new THREE.Vector3(spawn.position.x, y + 0.3, spawn.position.z), spawn.yaw);

    // The last chosen traveller and name are the defaults for a new game; a save carries its own.
    gameStore.getState().setProfile(loadProfile());
    const visual = new PlayerVisual(engine, controller);
    this.visual = visual;
    // Changing the traveller in the pause menu rebuilds the character in place.
    const unsubProfile = gameStore.subscribe((s, prev) => {
      if (s.profile.hero !== prev.profile.hero) visual.setVariant(s.profile.hero);
    });
    this.disposers.push(unsubProfile);
    const hud = new HUD(engine);
    hud.setMapGeometry(streamer.mapRects);
    hud.bindPlayer(() => ({ x: controller.position.x, z: controller.position.z, yaw: cam.yaw, stamina: controller.stamina, sprinting: controller.state === 'sprint' }));
    const subtitles = new Subtitles(engine);
    const journal = new Journal(engine);
    const save = new SaveSystem(engine, controller, cam);
    this.save = save;
    const travel = (shrineId: string): void => {
      const sh = world.shrines.find((x) => x.id === shrineId);
      if (!sh) return;
      controller.movementLocked = true;
      audio.play('shimmer', { volume: 0.6, rate: 0.9 });
      gsap.to(atmosphere, {
        veil: 1,
        duration: 1.2,
        ease: 'power2.in',
        onComplete: () => {
          controller.teleport(sh.arrive, sh.yaw);
          cam.setYawPitch(sh.yaw, 0.66);
          streamer.loadImmediate(1);
          cam.snapBehind();
          gsap.to(atmosphere, { veil: 0, duration: 1.6, ease: 'power2.out', onComplete: () => (controller.movementLocked = false) });
        },
      });
    };
    const map = new MapScreen(engine, world, streamer, () => ({ x: controller.position.x, z: controller.position.z, yaw: cam.yaw }), travel);
    hud.onMinimapTap(() => map.setVisible(true));
    const trail = new WaypointTrail(engine, lib, () => map.waypoint, () => (map.waypoint = null), () => controller.position);
    const distant = new DistantForest(engine, lib, world.terrain, () => controller.position);
    controller.events = {
      onFootstep: (surface, position, intensity) => audio.footstep(surface, position, intensity),
      onLand: (_surface, position, hard) => audio.land(hard, position),
    };
    lighting.onMoonChange((state) => streamer.setMoonState(state));

    const howto = new HowToPlay(engine, this.mode);
    this.howto = howto;
    this.traveller = new TravellerCard(engine);
    const leaderboard = new Leaderboard();
    const leaderboardCard = new LeaderboardCard(engine, leaderboard);
    this.leaderboardCard = leaderboardCard;
    const showControls = (): void => howto.show({ mode: 'reference', onClose: () => undefined });
    const showBoard = (): void => void leaderboardCard.show();
    if (this.mode === 'missions') {
      // Mission mode: five tasks, five asuras, four weapons. The exploration story systems stay dormant.
      const gun = new Gun(engine, lib, controller, visual, cam, audio);
      const mhud = new MissionHUD(engine, gun);
      hud.setSlotsVisible(false);
      const missions = new MissionDirector(engine, lib, streamer, controller, visual, cam, audio, gun, mhud, lighting, save, leaderboard, leaderboardCard);
      missions.setVeil = (v) => gsap.to(atmosphere, { veil: v, duration: v > 0 ? 0.9 : 1.4, ease: v > 0 ? 'power2.in' : 'power2.out' });
      missions.onDawn = (t) => (atmosphere.dawn = t);
      this.missions = missions;
      const pause = new PauseMenu(engine, save, () => location.reload(), () => journal.toggle(), () => missions.openTaskSelect(), showControls, showBoard);
      for (const s of [controller, streamer, lighting, missions, gun, visual, atmosphere, audio, save, subtitles, journal, map, pause, trail, distant, cam, hud, mhud]) engine.addSystem(s);
      if (window.__eka) {
        window.__eka.mission = () => missions.debugState();
        window.__eka.missionSkipNarration = () => missions.debugSkipNarration();
        window.__eka.missionDamageBoss = (n) => missions.debugDamageBoss(n);
        window.__eka.missionHurtPlayer = (n) => missions.debugHurtPlayer(n);
        window.__eka.missionMenuChoose = (i) => missions.debugMenuChoose(i);
        window.__eka.missionVoice = () => missions.debugVoice();
        window.__eka.missionAttack = (kind) => missions.debugAttack(kind);
        window.__eka.gun = () => gun.debugState();
        window.__eka.missionHold = (sec) => missions.debugHold(sec);
      }
    } else {
      const interaction = new InteractionSystem(engine, streamer, controller, hud);
      const doors = new DoorSystem(engine, streamer, audio);
      const chapters = new ChapterManager(engine, journal, subtitles);
      const encounterContext = { engine, player: controller, visual, rig: cam, hud, audio, subtitles };
      const factory = (id: string): MemoryController => (id === 'vakratunda' ? new VakratundaEncounter(encounterContext, lib, streamer, lighting) : new BrokenTuskEncounter(encounterContext));
      const portal = new MemoryPortal(engine, streamer, controller, visual, cam, lighting, audio, doors, journal, subtitles, interaction, factory, lib);
      atmosphere.overrideProvider = () => portal.fogOverride;
      const puzzles = new PuzzleSystem(engine, streamer, interaction, audio, doors, journal, subtitles, lighting);
      const story = new Story(engine, streamer, interaction, chapters, portal, audio, visual, journal, subtitles, lighting, doors, lib);
      const runner = new EncounterRunner();
      const illusions = new IllusionSystem(engine, streamer, controller, audio, subtitles);
      const storyChapters = new StoryChapters(engine, streamer, interaction, chapters, audio, visual, subtitles, lighting, doors, puzzles, runner, encounterContext, lib, moon, (t) => (atmosphere.dawn = t));
      const pause = new PauseMenu(engine, save, () => location.reload(), () => journal.toggle(), null, showControls, showBoard);
      for (const s of [controller, streamer, lighting, story, storyChapters, interaction, puzzles, doors, portal, runner, illusions, chapters, visual, atmosphere, audio, save, subtitles, journal, map, pause, trail, distant, cam, hud]) engine.addSystem(s);
      if (window.__eka) {
        window.__eka.interact = () => {
          const f = interaction.focused;
          if (f) interaction.fire(f);
          return f ? f.id : null;
        };
        window.__eka.portal = { inMemory: () => portal.inMemory };
        if (!window.__eka.probe) window.__eka.probe = () => ({ moon: lighting.moonState, pinned: lighting.pinned, zone: streamer.zone, locked: controller.movementLocked, chapter: gameStore.getState().chapter });
      }
    }
    cam.snapBehind();
    audio.setZone(streamer.zone);

    if (window.__eka) {
      window.__eka.playerProvider = () => ({ x: controller.position.x, y: controller.position.y, z: controller.position.z });
      window.__eka.heroVariant = () => visual.mesh.variant;
      window.__eka.cameraControl = { setYawPitch: (yaw, pitch) => cam.setYawPitch(yaw, pitch) };
      window.__eka.teleport = (x, yy, z) => {
        controller.teleport(new THREE.Vector3(x, yy, z));
        streamer.loadImmediate(1);
        cam.snapBehind();
      };
      window.__eka.flags = () => gameStore.getState().flags;
      window.__eka.setFlag = (k, v) => gameStore.getState().setFlag(k, v);
      window.__eka.save = () => save.save();
      window.__eka.anchors = () => Array.from(streamer.anchors.values()).map((a) => ({ id: a.id, kind: a.kind, x: a.position.x, y: a.position.y, z: a.position.z }));
      window.__eka.slowSteps = () => streamer.slowSteps;
      window.__eka.activateShrine = (id) => gameStore.getState().activateShrine(id);
      window.__eka.clearSubtitles = () => subtitles.clear();
      window.__eka.playerState = () => ({ state: controller.state, surface: controller.surface, grounded: controller.grounded, vx: controller.velocity.x, vy: controller.velocity.y, vz: controller.velocity.z, stamina: controller.stamina, crouch: controller.crouching, locked: controller.movementLocked, scale: controller.speedScale, dodge: controller.dodgeTimer, moveX: engine.input.frame.moveX, moveY: engine.input.frame.moveY, device: engine.input.device, blocked: engine.input.gameplayBlocked, ui: engine.uiBlocking, dev: engine.devMenu.isVisible, held: Array.from(engine.input.frame.held), clips: controller.clipCount, lastClip: controller.lastClip, y: controller.position.y });
      if (!window.__eka.probe) window.__eka.probe = () => ({ moon: lighting.moonState, pinned: lighting.pinned, zone: streamer.zone, locked: controller.movementLocked, chapter: gameStore.getState().chapter });
    }
  }

  canContinue(): boolean {
    return SaveSystem.hasSave();
  }

  /** Title-screen leaderboard. */
  showLeaderboard(onClose?: () => void): void {
    void this.leaderboardCard?.show(null, onClose);
  }

  start(mode: 'new' | 'continue'): void {
    if (this.started) return;
    this.started = true;
    if (mode === 'continue') {
      const file = SaveSystem.read();
      if (file && this.save && this.streamer) {
        this.save.apply(file);
        this.streamer.reset(1);
      }
    } else SaveSystem.clear();
    if (this.save) this.save.active = true;
    // New game: name + traveller, then the instructions card, then the first task. `?autostart` /
    // `?help=0` skip both (automation); `?hero=female&name=…` preset the profile.
    const params = new URLSearchParams(location.search);
    const skipCards = params.has('autostart') || params.get('help') === '0';
    const presetHero = params.get('hero');
    if (presetHero === 'male' || presetHero === 'female') gameStore.getState().setProfile({ hero: presetHero });
    const presetName = params.get('name');
    if (presetName) gameStore.getState().setProfile({ name: presetName.slice(0, 16) });
    this.visual?.setVariant(gameStore.getState().profile.hero);
    const begin = (): void => this.missions?.begin(mode);
    const help = (): void => {
      if (this.howto && !skipCards) this.howto.show({ mode: 'start', onClose: begin });
      else begin();
    };
    if (mode === 'new' && this.traveller && !skipCards) {
      this.traveller.show((profile) => {
        this.visual?.setVariant(profile.hero);
        help();
      });
    } else help();
  }

  private zoneSpawn(zone: ZoneId): { position: THREE.Vector3; yaw: number } {
    const spawns: Partial<Record<ZoneId, [number, number, number, number]>> = {
      gate: [0, 0, 84, 0],
      courtyard: [1.6, 1.0, 2.6, 0],
      hall: [4.5, 2.0, -60, 0],
      passage: [50, 2.0, -100, -Math.PI / 2],
      moon: [103, -1.9, -150, 0],
      tunnels: [110, -13.9, -250, Math.PI / 2],
      library: [-110, -9.9, -125, 0],
      shrine: [0, -19.9, -280, 0],
      sanctum: [0, -25.9, -368, 0],
      'side-west': [-48, 0.1, -16, Math.PI / 2],
      'side-east': [48, 0.1, -16, -Math.PI / 2],
      'memory-tusk': [2000, 0.2, 22, 0],
    };
    const s = spawns[zone] ?? [0, 0, 470, 0];
    return { position: new THREE.Vector3(s[0], s[1], s[2]), yaw: s[3] };
  }

  dispose(): void {
    // Systems are disposed by the engine when the scene unloads.
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
