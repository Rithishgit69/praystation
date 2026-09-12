import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { SceneModule } from '@/engine/types';
import { CameraRig } from '@/player/CameraRig';
import { PlayerController } from '@/player/PlayerController';
import { PlayerVisual } from '@/player/PlayerVisual';
import { gridTexture } from '@/util/textures';
import { degToRad } from '@/util/math';

/**
 * Traversal test: flat ground, stairs of 0.30/0.45/0.60 m, ramps at 30°/45°/55°, pillars for camera
 * probing, a low ceiling for crouch, and a jump platform. Used to tune feel before any art exists.
 */
export class GreyBoxScene implements SceneModule {
  readonly id = 'greybox';
  private readonly disposables: Array<() => void> = [];

  async init(engine: Engine): Promise<void> {
    const scene = engine.scene;
    scene.fog = new THREE.FogExp2(0x1a2438, 0.012);
    engine.renderer.setClearColor(0x1a2438, 1);
    const hemi = new THREE.HemisphereLight(0x8fb4e8, 0x2a2622, 0.9);
    const sun = new THREE.DirectionalLight(0xd8e6ff, 1.6);
    sun.position.set(20, 40, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
    sun.shadow.camera.right = sun.shadow.camera.top = 40;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004;
    scene.add(hemi, sun);

    const grid = gridTexture();
    grid.repeat.set(30, 30);
    grid.anisotropy = engine.maxAnisotropy;
    const groundMat = new THREE.MeshStandardMaterial({ map: grid, roughness: 0.9 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x6f7686, roughness: 0.8 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.7 });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    engine.physics.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(60, 0.5, 60), new THREE.Quaternion(), 'dry-stone');

    const box = (x: number, y: number, z: number, w: number, h: number, d: number, m = boxMat, rotY = 0, rotX = 0): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rotX, rotY, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      engine.physics.addStaticBox(mesh.position, new THREE.Vector3(w / 2, h / 2, d / 2), mesh.quaternion, 'dry-stone');
    };
    // Stairs: step heights 0.30, 0.45, 0.60 (the last must fail the 0.45 step offset).
    for (let i = 0; i < 6; i++) box(-8, 0.15 + i * 0.3, -6 - i * 0.6, 3, 0.3, 0.6);
    for (let i = 0; i < 5; i++) box(-4, 0.225 + i * 0.45, -6 - i * 0.7, 3, 0.45, 0.7, accentMat);
    for (let i = 0; i < 3; i++) box(0, 0.3 + i * 0.6, -6 - i * 0.8, 3, 0.6, 0.8);
    // Ramps.
    const ramp = (x: number, deg: number): void => {
      const len = 8;
      const a = degToRad(deg);
      box(x, (Math.sin(a) * len) / 2 - 0.1, 10 + (Math.cos(a) * len) / 2, 3, 0.2, len, boxMat, 0, -a);
    };
    ramp(6, 30);
    ramp(10, 45);
    ramp(14, 55);
    // Pillars for camera probe testing and a narrow corridor.
    for (let i = 0; i < 6; i++) box(-14 + i * 1.6, 2, 4, 0.6, 4, 0.6);
    box(-18, 2, -2, 0.5, 4, 8);
    box(-16.6, 2, -2, 0.5, 4, 8);
    // Low ceiling for crouch (1.3 m clearance).
    box(8, 1.45, -4, 4, 0.3, 4);
    for (const dx of [-1.9, 1.9]) box(8 + dx, 0.65, -4, 0.2, 1.3, 4);
    // Jump platforms 0.9 and 1.3 m.
    box(16, 0.45, -8, 3, 0.9, 3, accentMat);
    box(20, 0.65, -8, 3, 1.3, 3, accentMat);
    // Boundary walls.
    box(0, 2, -60, 120, 4, 1);
    box(0, 2, 60, 120, 4, 1);
    box(-60, 2, 0, 1, 4, 120);
    box(60, 2, 0, 1, 4, 120);

    let rig: CameraRig | null = null;
    const controller = new PlayerController(engine, new THREE.Vector3(0, 0.1, 0), () => rig?.yaw ?? 0);
    rig = new CameraRig(engine, controller, 0);
    const visual = new PlayerVisual(engine, controller);
    engine.addSystem(controller);
    engine.addSystem(visual);
    engine.addSystem(rig);
    rig.snapBehind();
    if (window.__eka) window.__eka.playerProvider = () => ({ x: controller.position.x, y: controller.position.y, z: controller.position.z });
    this.disposables.push(() => grid.dispose(), () => groundMat.dispose(), () => boxMat.dispose(), () => accentMat.dispose());
  }

  dispose(): void {
    for (const d of this.disposables) d();
  }
}
