import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { SceneModule, System } from '@/engine/types';
import { CameraRig } from '@/player/CameraRig';
import { PlayerController } from '@/player/PlayerController';
import { PlayerVisual } from '@/player/PlayerVisual';
import { HUD } from '@/ui/HUD';
import { MaterialLibrary } from '@/world/Materials';
import { MoonLight } from '@/world/fx/Atmosphere';
import { patchIvyMaterial } from '@/world/props/Foliage';
import { WorldMap } from '@/world/WorldMap';
import { WorldStreamer } from '@/world/WorldStreamer';
import type { ZoneId } from '@/world/WorldTypes';
import { degToRad } from '@/util/math';

const EXTERIOR_FOG = { color: 0x0f2038, density: 0.022 };

/** Keeps the moon's shadow frustum on the player and blends fog per zone. */
class WorldAtmosphere implements System {
  readonly name = 'world-atmosphere';
  private readonly fog: THREE.FogExp2;
  private targetColor = new THREE.Color(EXTERIOR_FOG.color);
  private targetDensity = EXTERIOR_FOG.density;
  private readonly ambient = new THREE.AmbientLight(0x34507a, 0);
  private targetAmbient = 0;
  constructor(
    private readonly engine: Engine,
    private readonly moon: MoonLight,
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
    const k = 1 - Math.exp(-2.2 * dt);
    this.fog.color.lerp(this.targetColor, k);
    this.fog.density += (this.targetDensity - this.fog.density) * k;
    this.ambient.intensity += (this.targetAmbient - this.ambient.intensity) * k;
    (this.engine.scene.background as THREE.Color).copy(this.fog.color).multiplyScalar(0.75);
    this.moon.place(degToRad(-48), degToRad(52), this.focus(), elapsed);
  }
}

/** The open world: streamed forest + temple zones, player, camera and HUD. Story systems layer on top. */
export class GameScene implements SceneModule {
  readonly id = 'game';

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
    const spawn = startZone && startZone !== 'forest' ? this.zoneSpawn(world, startZone) : world.spawn;

    let rig: CameraRig | null = null;
    const controller = new PlayerController(engine, spawn.position, () => rig?.yaw ?? 0);
    controller.facingYaw = spawn.yaw;
    rig = new CameraRig(engine, controller, spawn.yaw);
    const forward = new THREE.Vector3();
    const streamer = new WorldStreamer(engine, lib, world.terrain, world, () => {
      forward.set(-Math.sin(rig?.yaw ?? 0), 0, -Math.cos(rig?.yaw ?? 0));
      return { position: controller.position, forward };
    });
    const moon = new MoonLight(engine.quality.settings.shadowMapSize);
    engine.scene.add(moon.sun, moon.sun.target, moon.hemi);
    const atmosphere = new WorldAtmosphere(engine, moon, () => controller.position);
    streamer.onZoneChange = (zone) => {
      const def = world.zones.find((z) => z.id === zone);
      atmosphere.setZone(def?.fog, def?.ambient);
    };

    // Load the player's surroundings synchronously so there is ground under their feet, then stream.
    streamer.loadImmediate(1);
    // Drop the player onto the terrain if they spawned in the forest.
    const y = world.terrain.heightAt(spawn.position.x, spawn.position.z);
    if (!startZone || startZone === 'forest') controller.teleport(new THREE.Vector3(spawn.position.x, y + 0.3, spawn.position.z), spawn.yaw);

    const visual = new PlayerVisual(engine, controller);
    const hud = new HUD(engine);
    hud.setMapGeometry(streamer.mapRects);
    hud.bindPlayer(() => ({ x: controller.position.x, z: controller.position.z, yaw: rig?.yaw ?? 0, stamina: controller.stamina, sprinting: controller.state === 'sprint' }));
    engine.addSystem(controller);
    engine.addSystem(streamer);
    engine.addSystem(visual);
    engine.addSystem(atmosphere);
    engine.addSystem(rig);
    engine.addSystem(hud);
    rig.snapBehind();
    if (window.__eka) {
      const cam = rig;
      window.__eka.playerProvider = () => ({ x: controller.position.x, y: controller.position.y, z: controller.position.z });
      window.__eka.cameraControl = { setYawPitch: (yaw, pitch) => cam.setYawPitch(yaw, pitch) };
      window.__eka.teleport = (x, yy, z) => {
        controller.teleport(new THREE.Vector3(x, yy, z));
        streamer.loadImmediate(1);
      };
    }
  }

  private zoneSpawn(world: WorldMap, zone: ZoneId): { position: THREE.Vector3; yaw: number } {
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
    };
    const s = spawns[zone] ?? [0, 0, 470, Math.PI];
    void world;
    return { position: new THREE.Vector3(s[0], s[1], s[2]), yaw: s[3] };
  }

  dispose(): void {
    // Systems (streamer, player, HUD) are disposed by the engine when the scene unloads.
  }
}
