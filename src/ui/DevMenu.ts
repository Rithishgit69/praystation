import type { Engine } from '@/engine/Engine';
import type { QualityTier } from '@/engine/types';
import { SCENES } from '@/scenes/registry';

/** Developer menu: scene switcher, quality tier, toggles. F1 / ` / Select+Start / triple-tap. */
export class DevMenu {
  private readonly root: HTMLDivElement;
  private readonly engine: Engine;
  private visible = false;

  constructor(engine: Engine, parent: HTMLElement) {
    this.engine = engine;
    this.root = document.createElement('div');
    this.root.className = 'devmenu menu';
    this.root.hidden = true;
    this.build();
    parent.appendChild(this.root);
  }

  private build(): void {
    const h = document.createElement('h2');
    h.textContent = 'Developer menu';
    this.root.appendChild(h);
    const scenes = document.createElement('div');
    scenes.className = 'devmenu-section';
    const groups = new Map<string, HTMLElement>();
    for (const s of SCENES) {
      let g = groups.get(s.group);
      if (!g) {
        g = document.createElement('div');
        const t = document.createElement('h3');
        t.textContent = s.group;
        g.appendChild(t);
        groups.set(s.group, g);
        scenes.appendChild(g);
      }
      const b = document.createElement('button');
      b.textContent = s.title;
      b.addEventListener('click', () => {
        const url = new URL(location.href);
        url.searchParams.set('scene', s.id);
        location.href = url.toString();
      });
      g.appendChild(b);
    }
    this.root.appendChild(scenes);

    const opts = document.createElement('div');
    opts.className = 'devmenu-section';
    const t = document.createElement('h3');
    t.textContent = 'engine';
    opts.appendChild(t);
    const tierRow = document.createElement('div');
    tierRow.className = 'row';
    for (const tier of ['low', 'medium', 'high', 'ultra'] as QualityTier[]) {
      const b = document.createElement('button');
      b.textContent = tier;
      b.addEventListener('click', () => this.engine.setQualityTier(tier));
      tierRow.appendChild(b);
    }
    opts.appendChild(tierRow);
    const toggles: Array<[string, () => void]> = [
      ['Toggle profiler (F3)', () => this.engine.profiler.toggle()],
      ['Toggle dynamic resolution', () => (this.engine.quality.dynamicResolution = !this.engine.quality.dynamicResolution)],
      ['Toggle wireframe', () => this.engine.toggleWireframe()],
      ['Time scale ×0.25', () => (this.engine.timeScale = 0.25)],
      ['Time scale ×1', () => (this.engine.timeScale = 1)],
      ['Reset save & reload', () => this.engine.resetSaveAndReload()],
    ];
    for (const [label, fn] of toggles) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', fn);
      opts.appendChild(b);
    }
    this.root.appendChild(opts);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'F1 / ` close · F3 profiler · R recentre camera';
    this.root.appendChild(hint);
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
    this.engine.input.gameplayBlocked = v || this.engine.uiBlocking;
    this.engine.input.mouse.lockOnClick = !v;
    if (v) this.engine.input.mouse.unlock();
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
