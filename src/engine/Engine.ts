import * as THREE from 'three';
import { EventBus } from './EventBus';
import { Physics, initRapier } from './Physics';
import { PostFX } from './PostFX';
import { Profiler } from './Profiler';
import { Quality, detectTier, isMobileDevice } from './Quality';
import type { QualityTier, SceneModule, System } from './types';
import { InputManager } from '@/input/InputManager';
import { DevMenu } from '@/ui/DevMenu';
import type { SceneEntry } from '@/scenes/registry';

export interface EngineEvents extends Record<string, unknown> {
  resize: { width: number; height: number };
  sceneloaded: string;
  qualitychange: QualityTier;
}

const FIXED_STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;

/**
 * Owns the renderer, scene graph, physics world, input, post chain and the main loop.
 * Systems are updated in registration order; the current SceneModule registers what it needs.
 */
export class Engine {
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly postfx: PostFX;
  readonly profiler: Profiler;
  readonly quality: Quality;
  readonly input: InputManager;
  readonly physics: Physics;
  readonly events = new EventBus<EngineEvents>();
  readonly devMenu: DevMenu;
  readonly mobile = isMobileDevice();
  readonly fixedStep = FIXED_STEP;
  timeScale = 1;
  /** Set by UI screens (pause, journal, map) to block gameplay input. */
  uiBlocking = false;
  elapsed = 0;
  private readonly systems: System[] = [];
  private currentScene: SceneModule | null = null;
  private running = false;
  private rafId = 0;
  private last = 0;
  private accumulator = 0;
  private wireframe = false;
  private basePixelRatio = 1;
  private readonly onResize = (): void => this.resize();
  private readonly onVisibility = (): void => {
    if (document.hidden) this.last = 0;
  };

  static async create(canvas: HTMLCanvasElement, uiRoot: HTMLElement): Promise<Engine> {
    await initRapier();
    return new Engine(canvas, uiRoot);
  }

  private constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x0b1220, 1);
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.08, 420);
    this.scene.add(this.camera);
    this.physics = new Physics();
    this.profiler = new Profiler(uiRoot);
    this.quality = new Quality(detectTier(), (s) => {
      this.postfx.applyQuality(s);
      this.profiler.setTierLabel(this.quality.label);
      this.events.emit('qualitychange', s.tier);
    });
    this.postfx = new PostFX(this.renderer, this.scene, this.camera, this.quality.settings);
    this.profiler.setTierLabel(this.quality.label);
    this.input = new InputManager(canvas, uiRoot);
    this.devMenu = new DevMenu(this, uiRoot);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
    if (new URLSearchParams(location.search).has('profiler')) this.profiler.setVisible(true);
  }

  get maxAnisotropy(): number {
    return Math.min(this.quality.settings.anisotropy, this.renderer.capabilities.getMaxAnisotropy());
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const tier = this.quality.settings.tier;
    const dprCap = tier === 'low' ? 1.25 : tier === 'medium' ? 1.5 : 2;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.postfx.setSize(width, height, this.basePixelRatio);
    this.events.emit('resize', { width, height });
  }

  addSystem(system: System): void {
    if (this.systems.includes(system)) return;
    this.systems.push(system);
  }

  removeSystem(system: System): void {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  async loadScene(entry: SceneEntry): Promise<SceneModule> {
    this.unloadScene();
    const mod = await entry.load();
    await mod.init(this);
    // Precompile every material in view so first-look shader builds never spike a gameplay frame.
    await this.renderer.compileAsync(this.scene, this.camera);
    this.currentScene = mod;
    this.events.emit('sceneloaded', mod.id);
    return mod;
  }

  unloadScene(): void {
    if (!this.currentScene) return;
    this.currentScene.dispose();
    this.currentScene = null;
    for (const s of [...this.systems]) {
      s.dispose?.();
      this.removeSystem(s);
    }
    this.scene.clear();
    this.scene.add(this.camera);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);
    this.profiler.beginFrame(now);
    this.renderer.info.reset();
    if (this.last === 0) this.last = now - 16.7;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    const sdt = dt * this.timeScale;

    this.input.update(dt);
    if (this.input.pressed('devmenu')) this.devMenu.toggle();
    if (this.input.pressed('profiler')) this.profiler.toggle();

    this.accumulator += sdt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      for (const s of this.systems) s.fixedUpdate?.(FIXED_STEP);
      this.physics.step();
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.elapsed += sdt;
    for (const s of this.systems) s.update?.(sdt, this.elapsed);
    for (const s of this.systems) s.lateUpdate?.(sdt);

    const scale = this.quality.tick(this.profiler.frameMsEma, now, this.mobile);
    this.postfx.setRenderScale(scale);
    const t0 = performance.now();
    this.postfx.render(dt);
    const renderMs = performance.now() - t0;
    this.profiler.endFrame(this.renderer, this.physics.lastStepMs, renderMs, scale);
  };

  /** Interpolation factor for rendering between fixed steps. */
  get alpha(): number {
    return this.accumulator / FIXED_STEP;
  }

  setQualityTier(tier: QualityTier): void {
    this.quality.setTier(tier);
    this.resize();
  }

  toggleWireframe(): void {
    this.wireframe = !this.wireframe;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if ('wireframe' in mat) (mat as THREE.MeshStandardMaterial).wireframe = this.wireframe;
      }
    });
  }

  resetSaveAndReload(): void {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('eka:')) localStorage.removeItem(k);
    } catch {
      /* storage unavailable: nothing to clear */
    }
    location.reload();
  }

  dispose(): void {
    this.stop();
    this.unloadScene();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.input.dispose();
    this.postfx.dispose();
    this.renderer.dispose();
  }
}
