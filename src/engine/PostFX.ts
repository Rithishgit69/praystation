import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GradeBlender } from './Grade';
import type { QualitySettings } from './Quality';

/**
 * GTAO whose normal/depth pre-pass ignores sprites, points, transparent and alpha-tested objects.
 * Without this, additive glow cards become opaque walls in the AO depth and render as black quads.
 */
class FilteredGTAOPass extends GTAOPass {
  private readonly hidden: THREE.Object3D[] = [];

  private static skip(o: THREE.Object3D): boolean {
    if ((o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints) return true;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return false;
    const mats = Array.isArray(m) ? m : [m];
    return mats.some((x) => x.transparent || x.alphaTest > 0 || x.blending !== THREE.NormalBlending);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime = 0, maskActive = false): void {
    this.hidden.length = 0;
    this.scene.traverse((o) => {
      if (o.visible && FilteredGTAOPass.skip(o)) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    for (const o of this.hidden) o.visible = true;
  }
}

/**
 * WebGL2 post chain: scene → GTAO (tier-gated) → bloom → 3D-LUT grade → SMAA → filmic output.
 * Dynamic resolution is applied through the renderer pixel ratio so every pass follows.
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly grade = new GradeBlender();
  private readonly renderPass: RenderPass;
  private readonly gtao: FilteredGTAOPass;
  private readonly bloom: UnrealBloomPass;
  private readonly lut: LUTPass;
  private readonly smaa: SMAAPass;
  private readonly output: OutputPass;
  private readonly renderer: THREE.WebGLRenderer;
  private width = 1;
  private height = 1;
  private basePixelRatio = 1;
  private scale = 1;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, q: QualitySettings) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.gtao = new FilteredGTAOPass(scene, camera, 512, 512);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.2, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
    this.gtao.blendIntensity = 0.85;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.65, 0.82);
    this.lut = new LUTPass({ lut: this.grade.texture, intensity: 1 });
    this.smaa = new SMAAPass();
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.lut);
    this.composer.addPass(this.smaa);
    this.composer.addPass(this.output);
    this.applyQuality(q);
  }

  applyQuality(q: QualitySettings): void {
    this.gtao.enabled = q.gtao;
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
    this.gtao.camera = camera;
  }

  setBloom(strength: number, radius: number, threshold: number): void {
    this.bloom.strength = strength;
    this.bloom.radius = radius;
    this.bloom.threshold = threshold;
  }

  setSize(width: number, height: number, basePixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.basePixelRatio = basePixelRatio;
    this.applyScale();
  }

  setRenderScale(scale: number): void {
    if (Math.abs(scale - this.scale) < 1e-4) return;
    this.scale = scale;
    this.applyScale();
  }

  private applyScale(): void {
    const pr = this.basePixelRatio * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.width, this.height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.grade.texture.dispose();
  }
}
