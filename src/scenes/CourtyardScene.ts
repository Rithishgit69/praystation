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
import type { ColliderSpec } from '@/world/props/types';
import { buildCourtyard } from '@/world/zones/Courtyard';
import { WorldMap } from '@/world/WorldMap';
import { runToCompletion, type UnitBuild } from '@/world/WorldTypes';
import { SeededRandom } from '@/util/random';
import { gameStore } from '@/state/store';
import type { RAPIER } from '@/engine/Physics';
import { degToRad } from '@/util/math';

export const addColliders = (engine: Engine, specs: ColliderSpec[]): RAPIER.Collider[] =>
  specs.map((c) => {
    if (c.kind === 'box') return engine.physics.addStaticBox(c.center, c.half, c.quaternion, c.surface);
    if (c.kind === 'cylinder') return engine.physics.addStaticCylinder(c.center, c.halfHeight, c.radius, c.surface);
    return engine.physics.addStaticTrimesh(c.geometry, c.matrix, c.surface);
  });

/** Runs per-frame prop/effect updates and keeps the moon's shadow frustum on the player. */
class ZoneFX implements System {
  readonly name = 'zone-fx';
  constructor(
    private readonly engine: Engine,
    private readonly zone: UnitBuild,
    private readonly moon: MoonLight,
    private readonly focus: () => THREE.Vector3,
  ) {}
  update(dt: number, elapsed: number): void {
    const cam = this.engine.camera;
    for (const u of this.zone.updates) u(dt, elapsed, cam);
    this.moon.place(degToRad(-48), degToRad(52), this.focus(), elapsed);
  }
}

/** Phase 3: the reference screenshot, rebuilt as a playable courtyard. */
export class CourtyardScene implements SceneModule {
  readonly id = 'courtyard';
  private colliders: RAPIER.Collider[] = [];
  private zone: UnitBuild | null = null;
  private engine: Engine | null = null;

  async init(engine: Engine): Promise<void> {
    this.engine = engine;
    const lib = MaterialLibrary.get(engine.maxAnisotropy);
    patchIvyMaterial(lib.ivy);
    const scene = engine.scene;
    scene.background = new THREE.Color(0x0b1626);
    scene.fog = new THREE.FogExp2(0x0f2038, 0.038);
    engine.renderer.setClearColor(0x0a1424, 1);
    engine.renderer.toneMappingExposure = 1.2;
    engine.postfx.setBloom(0.6, 0.5, 0.86);
    engine.postfx.grade.set('present', 'present', 0);

    const world = new WorldMap();
    const zone = runToCompletion(buildCourtyard({ lib, quality: engine.quality.settings, rng: new SeededRandom(1), terrain: world.terrain, world, flags: gameStore.getState().flags }));
    this.zone = zone;
    scene.add(zone.group);
    this.colliders = addColliders(engine, zone.colliders);

    const moon = new MoonLight(engine.quality.settings.shadowMapSize);
    scene.add(moon.sun, moon.sun.target, moon.hemi);

    let rig: CameraRig | null = null;
    const controller = new PlayerController(engine, zone.spawn.position, () => rig?.yaw ?? 0);
    controller.facingYaw = zone.spawn.yaw;
    rig = new CameraRig(engine, controller, zone.spawn.yaw);
    const visual = new PlayerVisual(engine, controller);
    const hud = new HUD(engine);
    hud.setMapGeometry(zone.mapRects);
    hud.bindPlayer(() => ({ x: controller.position.x, z: controller.position.z, yaw: rig?.yaw ?? 0, stamina: controller.stamina, sprinting: controller.state === 'sprint' }));
    engine.addSystem(controller);
    engine.addSystem(visual);
    engine.addSystem(new ZoneFX(engine, zone, moon, () => controller.position));
    engine.addSystem(rig);
    engine.addSystem(hud);
    rig.snapBehind();
    if (window.__eka) {
      const cam = rig;
      window.__eka.playerProvider = () => ({ x: controller.position.x, y: controller.position.y, z: controller.position.z });
      window.__eka.cameraControl = { setYawPitch: (yaw, pitch) => cam.setYawPitch(yaw, pitch) };
    }
  }

  dispose(): void {
    if (this.zone) for (const d of this.zone.disposables) d();
    this.zone = null;
    for (const c of this.colliders) this.engine?.physics.remove(c);
    this.colliders = [];
  }
}
