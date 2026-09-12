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
import { MaterialLibrary } from '@/world/Materials';
import { MoonLight } from '@/world/fx/Atmosphere';
import { patchIvyMaterial } from '@/world/props/Foliage';
import { WorldMap } from '@/world/WorldMap';
import { WorldStreamer } from '@/world/WorldStreamer';
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
import { gameStore } from '@/state/store';

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

  async init(engine: Engine): Promise<void> {
    const lib = MaterialLibrary.get(engine.maxAnisotropy);
    patchIvyMaterial(lib.ivy);
    engine.renderer.setClearColor(0x0b1626, 1);
    engine.renderer.toneMappingExposure = 1.2;
    engine.postfx.setBloom(0.6, 0.5, 0.86);
    engine.postfx.grade.set('present', 'present', 0);

    const world = new WorldMap();
    const params = new URLSearchParams(location.search);
    const startZone = params.get('start') as ZoneId | null;
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

    const visual = new PlayerVisual(engine, controller);
    const hud = new HUD(engine);
    hud.setMapGeometry(streamer.mapRects);
    hud.bindPlayer(() => ({ x: controller.position.x, z: controller.position.z, yaw: cam.yaw, stamina: controller.stamina, sprinting: controller.state === 'sprint' }));
    const subtitles = new Subtitles(engine);
    const journal = new Journal(engine);
    const interaction = new InteractionSystem(engine, streamer, controller, hud);
    const doors = new DoorSystem(engine, streamer, audio);
    const chapters = new ChapterManager(engine, journal, subtitles);
    const encounterContext = { engine, player: controller, visual, rig: cam, hud, audio, subtitles };
    const factory = (id: string): MemoryController => {
      // Every memory currently resolves through the Broken Tusk encounter framework; later chapters plug
      // their own controllers in here without touching the portal.
      void id;
      return new BrokenTuskEncounter(encounterContext);
    };
    const portal = new MemoryPortal(engine, streamer, controller, visual, cam, lighting, audio, doors, journal, subtitles, interaction, factory, lib);
    atmosphere.overrideProvider = () => portal.fogOverride;
    const puzzles = new PuzzleSystem(engine, streamer, interaction, audio, doors, journal, subtitles, lighting);
    const story = new Story(engine, streamer, interaction, chapters, portal, audio, visual, journal, subtitles, lighting, doors, lib);
    const save = new SaveSystem(engine, controller, cam);
    this.save = save;
    const travel = (shrineId: string): void => {
      const sh = world.shrines.find((x) => x.id === shrineId);
      if (!sh || portal.inMemory) return;
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
    const trail = new WaypointTrail(engine, lib, () => map.waypoint, () => (map.waypoint = null), () => controller.position);
    const pause = new PauseMenu(engine, save, () => location.reload());

    // Player sounds.
    controller.events = {
      onFootstep: (surface, position, intensity) => audio.footstep(surface, position, intensity),
      onLand: (_surface, position, hard) => audio.land(hard, position),
    };

    for (const s of [controller, streamer, lighting, story, interaction, puzzles, doors, portal, chapters, visual, atmosphere, audio, save, subtitles, journal, map, pause, trail, cam, hud]) engine.addSystem(s);
    cam.snapBehind();
    audio.setZone(streamer.zone);

    if (window.__eka) {
      window.__eka.playerProvider = () => ({ x: controller.position.x, y: controller.position.y, z: controller.position.z });
      window.__eka.cameraControl = { setYawPitch: (yaw, pitch) => cam.setYawPitch(yaw, pitch) };
      window.__eka.teleport = (x, yy, z) => {
        controller.teleport(new THREE.Vector3(x, yy, z));
        streamer.loadImmediate(1);
        cam.snapBehind();
      };
      window.__eka.interact = () => {
        const f = interaction.focused;
        if (f) interaction.fire(f);
        return f ? f.id : null;
      };
      window.__eka.flags = () => gameStore.getState().flags;
      window.__eka.setFlag = (k, v) => gameStore.getState().setFlag(k, v);
      window.__eka.save = () => save.save();
      window.__eka.anchors = () => Array.from(streamer.anchors.values()).map((a) => ({ id: a.id, kind: a.kind, x: a.position.x, y: a.position.y, z: a.position.z }));
      window.__eka.portal = { inMemory: () => portal.inMemory };
    }
  }

  canContinue(): boolean {
    return SaveSystem.hasSave();
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
  }
}
