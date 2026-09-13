import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import { CharacterMesh, type HeroVariant } from '@/player/CharacterMesh';
import { gameStore, DEFAULT_PROFILE, type Profile } from '@/state/store';

const PROFILE_KEY = 'eka:profile';
const NAME_MAX = 16;

export const loadProfile = (): Profile => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Profile>;
      return { name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, NAME_MAX) : DEFAULT_PROFILE.name, hero: p.hero === 'female' ? 'female' : 'male' };
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_PROFILE };
};

export const saveProfile = (p: Profile): void => {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
};

/**
 * "Your traveller": name the character and choose the male or female traveller before entering the
 * temple. Both travellers turn slowly in live previews rendered by a small second renderer.
 */
export class TravellerCard {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly cards = new Map<HeroVariant, HTMLButtonElement>();
  private hero: HeroVariant = 'male';
  private onDone: ((profile: Profile) => void) | null = null;
  private preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; meshes: Map<HeroVariant, CharacterMesh>; canvases: Map<HeroVariant, HTMLCanvasElement>; disc: THREE.Mesh; raf: number; last: number } | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.submit();
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      if (document.activeElement === this.input) return;
      this.select(this.hero === 'male' ? 'female' : 'male');
    }
  };

  constructor(private readonly engine: Engine) {
    this.root = document.createElement('div');
    this.root.className = 'traveller';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="traveller-inner">
        <h1 class="boot-title">Your traveller</h1>
        <p class="traveller-sub">Give your traveller a name, and choose who walks into the temple.</p>
        <label class="traveller-name"><span>Name</span><input type="text" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Traveller" /></label>
        <div class="traveller-heroes">
          <button type="button" class="traveller-hero" data-hero="male"><canvas width="300" height="420"></canvas><strong>Male traveller</strong><small>Grey coat, crimson scarf, pack on the back</small></button>
          <button type="button" class="traveller-hero" data-hero="female"><canvas width="300" height="420"></canvas><strong>Female traveller</strong><small>Teal kurti, saffron dupatta, long braid</small></button>
        </div>
        <button class="boot-continue traveller-go">Enter the temple</button>
        <p class="howto-hint">Enter confirms · ← → switch traveller</p>
      </div>`;
    engine.uiRoot.appendChild(this.root);
    this.input = this.root.querySelector('input') as HTMLInputElement;
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>('.traveller-hero')) {
      const hero = btn.dataset.hero as HeroVariant;
      this.cards.set(hero, btn);
      btn.addEventListener('click', () => this.select(hero));
    }
    (this.root.querySelector('.traveller-go') as HTMLButtonElement).addEventListener('click', () => this.submit());
  }

  get isVisible(): boolean {
    return !this.root.hidden;
  }

  show(onDone: (profile: Profile) => void): void {
    const p = loadProfile();
    this.onDone = onDone;
    this.input.value = p.name === DEFAULT_PROFILE.name ? '' : p.name;
    this.select(p.hero);
    this.root.hidden = false;
    this.engine.uiBlocking = true;
    this.engine.input.gameplayBlocked = true;
    this.engine.input.mouse.lockOnClick = false;
    this.engine.input.mouse.unlock();
    window.addEventListener('keydown', this.onKey);
    this.startPreview();
    setTimeout(() => this.input.focus(), 50);
  }

  private select(hero: HeroVariant): void {
    this.hero = hero;
    for (const [k, btn] of this.cards) btn.classList.toggle('selected', k === hero);
  }

  private submit(): void {
    const name = this.input.value.trim().slice(0, NAME_MAX) || DEFAULT_PROFILE.name;
    const profile: Profile = { name, hero: this.hero };
    saveProfile(profile);
    gameStore.getState().setProfile(profile);
    const done = this.onDone;
    this.onDone = null;
    this.hide();
    done?.(profile);
  }

  private hide(): void {
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.stopPreview();
    this.engine.uiBlocking = false;
    this.engine.input.gameplayBlocked = this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
  }

  /** Two small live renders of the travellers, turning slowly on a warm spot of light. */
  private startPreview(): void {
    if (this.preview) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 420;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1);
      renderer.setSize(300, 420, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x3a2a1a, 1.6));
      const key = new THREE.DirectionalLight(0xffd9a8, 2.6);
      key.position.set(1.5, 3, 2.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x8fb4e8, 1.4);
      rim.position.set(-2, 2, -2);
      scene.add(rim);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: 0xd9b370, transparent: true, opacity: 0.18 }));
      disc.rotation.x = -Math.PI / 2;
      scene.add(disc);
      const camera = new THREE.PerspectiveCamera(30, 300 / 420, 0.1, 20);
      camera.position.set(0, 1.0, 3.9);
      camera.lookAt(0, 0.95, 0);
      const meshes = new Map<HeroVariant, CharacterMesh>();
      const canvases = new Map<HeroVariant, HTMLCanvasElement>();
      for (const [hero, btn] of this.cards) {
        meshes.set(hero, new CharacterMesh(hero));
        canvases.set(hero, btn.querySelector('canvas') as HTMLCanvasElement);
      }
      this.preview = { renderer, scene, camera, meshes, canvases, disc, raf: 0, last: performance.now() };
      const t0 = performance.now();
      const tick = (now: number): void => {
        const p = this.preview;
        if (!p) return;
        const dt = Math.min(0.05, (now - p.last) / 1000);
        p.last = now;
        for (const [hero, mesh] of p.meshes) {
          const target = p.canvases.get(hero);
          if (!target) continue;
          p.scene.add(mesh.root);
          // Face the viewer (+Z is the traveller's front) with a slow sway.
          mesh.root.rotation.y = Math.sin((now - t0) * 0.0009 + (hero === 'female' ? 1.6 : 0)) * 0.5;
          mesh.animate(dt, 'idle', 0, 6.6, now / 1000);
          p.renderer.render(p.scene, p.camera);
          p.scene.remove(mesh.root);
          const ctx = target.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, target.width, target.height);
            ctx.drawImage(p.renderer.domElement, 0, 0);
          }
        }
        p.raf = requestAnimationFrame(tick);
      };
      this.preview.raf = requestAnimationFrame(tick);
    } catch {
      /* no second context available: the cards keep their labels */
      this.preview = null;
    }
  }

  private stopPreview(): void {
    const p = this.preview;
    if (!p) return;
    this.preview = null;
    cancelAnimationFrame(p.raf);
    for (const m of p.meshes.values()) m.dispose();
    p.disc.geometry.dispose();
    (p.disc.material as THREE.Material).dispose();
    p.renderer.dispose();
    p.renderer.forceContextLoss();
  }

  dispose(): void {
    this.hide();
    this.root.remove();
  }
}
