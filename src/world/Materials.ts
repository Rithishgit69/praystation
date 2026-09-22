import * as THREE from 'three';
import { muralTextures, type MuralScene } from './MuralArt';
import { bannerTexture, barkTextures, canopyTexture, debrisTexture, flagstoneTextures, forestFloorTextures, glowSprite, ivyLeafTexture, noiseTexture, sandstoneTextures } from './TextureGen';

/** All shipped materials. Created once; textures are procedural (see TextureGen). */
export class MaterialLibrary {
  readonly flagstone: THREE.MeshStandardMaterial;
  readonly sandstone: THREE.MeshStandardMaterial;
  readonly sandstoneDark: THREE.MeshStandardMaterial;
  readonly bark: THREE.MeshStandardMaterial;
  readonly ivy: THREE.MeshStandardMaterial;
  readonly canopy: THREE.MeshStandardMaterial;
  readonly banner: THREE.MeshStandardMaterial;
  readonly wood: THREE.MeshStandardMaterial;
  readonly iron: THREE.MeshStandardMaterial;
  readonly debris: THREE.MeshStandardMaterial;
  readonly forestFloor: THREE.MeshStandardMaterial;
  private readonly murals = new Map<MuralScene, THREE.MeshStandardMaterial>();
  readonly water: THREE.MeshStandardMaterial;
  readonly glowTexture: THREE.Texture;
  readonly noiseTexture: THREE.Texture;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private static instance: MaterialLibrary | null = null;

  /**
   * `detail` scales the procedural texture resolutions (1 on desktop, 0.5 on phones: the per-pixel
   * bakes are the single largest cost of booting); `murals` pre-bakes the story murals here rather
   * than at first sight (mission mode never shows one).
   */
  static get(anisotropy: number, opts: { detail?: number; murals?: boolean } = {}): MaterialLibrary {
    if (!MaterialLibrary.instance) MaterialLibrary.instance = new MaterialLibrary(anisotropy, opts.detail ?? 1, opts.murals ?? true);
    return MaterialLibrary.instance;
  }

  private constructor(anisotropy: number, detail: number, murals: boolean) {
    const track = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };
    const aniso = (t: THREE.Texture): THREE.Texture => {
      t.anisotropy = anisotropy;
      return track(t);
    };
    const step = (name: string): void => void performance.mark(`eka:tex-${name}`);
    const px = (n: number): number => Math.max(128, Math.round(n * detail));
    step('flagstone');
    const fs = flagstoneTextures(px(1024), 3);
    this.flagstone = track(
      new THREE.MeshStandardMaterial({
        map: aniso(fs.map),
        normalMap: aniso(fs.normalMap),
        roughnessMap: aniso(fs.roughnessMap),
        roughness: 1,
        metalness: 0,
        normalScale: new THREE.Vector2(0.9, 0.9),
        envMapIntensity: 0.5,
        vertexColors: true,
      }),
    );
    step('sandstone');
    const ss = sandstoneTextures(px(512), 11);
    this.sandstone = track(
      new THREE.MeshStandardMaterial({ map: aniso(ss.map), normalMap: aniso(ss.normalMap), roughnessMap: aniso(ss.roughnessMap), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true }),
    );
    step('sandstone-dark');
    const sd = sandstoneTextures(px(512), 23, [0.3, 0.29, 0.26]);
    this.sandstoneDark = track(
      new THREE.MeshStandardMaterial({ map: aniso(sd.map), normalMap: aniso(sd.normalMap), roughnessMap: aniso(sd.roughnessMap), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true }),
    );
    step('bark');
    const bk = barkTextures(px(256), 83);
    this.bark = track(new THREE.MeshStandardMaterial({ map: aniso(bk.map), normalMap: aniso(bk.normalMap), roughness: 0.95, metalness: 0 }));
    step('ivy');
    this.ivy = track(new THREE.MeshStandardMaterial({ map: aniso(ivyLeafTexture(256)), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, metalness: 0, color: 0xffffff }));
    step('canopy');
    this.canopy = track(new THREE.MeshStandardMaterial({ map: track(canopyTexture(px(512), 71)), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: 0xffffff }));
    step('banner');
    const bn = bannerTexture(px(512));
    this.banner = track(new THREE.MeshStandardMaterial({ map: aniso(bn.map), alphaMap: track(bn.alphaMap), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 }));
    this.wood = track(new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.85, metalness: 0 }));
    this.iron = track(new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.7 }));
    step('debris');
    this.debris = track(new THREE.MeshStandardMaterial({ map: track(debrisTexture(px(512))), transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    step('forest-floor');
    const ff = forestFloorTextures(px(512), 151);
    this.forestFloor = track(new THREE.MeshStandardMaterial({ map: aniso(ff.map), normalMap: aniso(ff.normalMap), roughnessMap: aniso(ff.roughnessMap), roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true }));
    this.water = track(new THREE.MeshStandardMaterial({ color: 0x0c1a26, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86 }));
    this.glowTexture = track(glowSprite(128));
    this.noiseTexture = track(noiseTexture(256));
    step('murals');
    // Murals bake per-pixel and cost ~200 ms each: story mode does it here, behind the title card, never
    // during streaming. Mission mode never shows one and skips them.
    if (murals) for (const scene of ['broken-tusk', 'scribe', 'moon', 'serpent', 'remembrance'] as const) this.mural(scene);
    step('done');
  }

  /** Mural material per scene (lazy; each is unique so a waking mural can pulse its own emissive). */
  mural(scene: MuralScene): THREE.MeshStandardMaterial {
    let m = this.murals.get(scene);
    if (!m) {
      const t = muralTextures(scene);
      this.disposables.push(t.map, t.emissiveMap);
      m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xd9a55a, emissiveIntensity: 0, roughness: 0.92, metalness: 0 });
      this.disposables.push(m);
      this.murals.set(scene, m);
    }
    return m;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    MaterialLibrary.instance = null;
  }
}
