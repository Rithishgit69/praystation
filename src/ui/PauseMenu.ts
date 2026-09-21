import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { gameStore, type Profile, type Settings } from '@/state/store';
import { saveProfile } from './TravellerCard';
import type { SaveSystem } from '@/systems/SaveSystem';
import type { QualityTier } from '@/engine/types';

/** Pause / options. Esc, Start, or the touch pause button. Also the Android back button target. */
export class PauseMenu implements System {
  readonly name = 'pause';
  private readonly root: HTMLDivElement;
  private visible = false;
  private readonly onBack = (): void => this.setVisible(!this.visible);

  constructor(
    private readonly engine: Engine,
    private readonly save: SaveSystem,
    private readonly onQuitToTitle: () => void,
    private readonly onJournal: () => void,
    private readonly onTaskSelect: (() => void) | null,
    private readonly onControls: (() => void) | null = null,
    private readonly onLeaderboard: (() => void) | null = null,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pause menu';
    this.root.hidden = true;
    this.build();
    engine.uiRoot.appendChild(this.root);
    window.addEventListener('eka:back', this.onBack);
  }

  private build(): void {
    const s = gameStore.getState().settings;
    const row = (label: string, control: HTMLElement): HTMLElement => {
      const r = document.createElement('label');
      r.className = 'row opt';
      const l = document.createElement('span');
      l.textContent = label;
      r.append(l, control);
      return r;
    };
    const toggle = (key: keyof Settings, label: string): HTMLElement => {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = Boolean(gameStore.getState().settings[key]);
      c.addEventListener('change', () => gameStore.getState().setSettings({ [key]: c.checked } as Partial<Settings>));
      return row(label, c);
    };
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number): HTMLElement => {
      const c = document.createElement('input');
      c.type = 'range';
      c.min = String(min);
      c.max = String(max);
      c.step = String(step);
      c.value = String(gameStore.getState().settings[key]);
      c.addEventListener('input', () => gameStore.getState().setSettings({ [key]: Number(c.value) } as Partial<Settings>));
      return row(label, c);
    };
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    const resume = document.createElement('button');
    resume.textContent = 'Resume';
    resume.addEventListener('click', () => {
      this.setVisible(false);
      if (this.engine.input.device === 'kbm') this.engine.input.mouse.requestLock();
    });
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      saveBtn.textContent = this.save.save() ? 'Saved' : 'Save failed (storage unavailable)';
    });
    const quality = document.createElement('select');
    for (const t of ['auto', 'low', 'medium', 'high', 'ultra']) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      quality.appendChild(o);
    }
    quality.value = s.quality;
    quality.addEventListener('change', () => {
      const v = quality.value as QualityTier | 'auto';
      gameStore.getState().setSettings({ quality: v });
      if (v !== 'auto') this.engine.setQualityTier(v);
    });
    const narrator = document.createElement('select');
    for (const [value, label] of [
      ['heart', 'Heart (American English)'],
      ['emma', 'Emma (British English)'],
    ] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      narrator.appendChild(o);
    }
    narrator.value = s.narrator;
    narrator.addEventListener('change', () => gameStore.getState().setSettings({ narrator: narrator.value as Settings['narrator'] }));
    // The traveller: name and body can be changed mid-game (saved with the profile).
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 16;
    nameInput.value = gameStore.getState().profile.name;
    nameInput.addEventListener('change', () => {
      const name = nameInput.value.trim().slice(0, 16) || 'Traveller';
      nameInput.value = name;
      gameStore.getState().setProfile({ name });
      saveProfile(gameStore.getState().profile);
    });
    const hero = document.createElement('select');
    for (const [value, label] of [
      ['male', 'Male traveller'],
      ['female', 'Female traveller'],
    ] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      hero.appendChild(o);
    }
    hero.value = gameStore.getState().profile.hero;
    hero.addEventListener('change', () => {
      gameStore.getState().setProfile({ hero: hero.value as Profile['hero'] });
      saveProfile(gameStore.getState().profile);
    });
    const opts = document.createElement('div');
    opts.className = 'devmenu-section';
    opts.append(
      row('Name', nameInput),
      row('Traveller', hero),
      row('Quality', quality),
      toggle('cinematicMode', 'Cinematic mode (hide HUD)'),
      toggle('hudAutoFade', 'HUD auto-fade'),
      toggle('invertY', 'Invert camera Y'),
      slider('lookSensitivity', 'Look sensitivity', 0.3, 2.5, 0.05),
      toggle('sprintToggle', 'Shift toggles running (instead of holding it)'),
      slider('masterVolume', 'Master volume', 0, 1, 0.01),
      slider('musicVolume', 'Music & chant volume', 0, 1, 0.01),
      slider('sfxVolume', 'Effects volume', 0, 1, 0.01),
      slider('voiceVolume', 'Narration volume', 0, 1, 0.01),
      row('Narrator', narrator),
    );
    const journalBtn = document.createElement('button');
    journalBtn.textContent = 'Journal';
    journalBtn.addEventListener('click', () => {
      this.setVisible(false);
      this.onJournal();
    });
    const extras: HTMLElement[] = [];
    if (this.onControls) {
      const controls = document.createElement('button');
      controls.textContent = 'Controls / how to play';
      controls.addEventListener('click', () => {
        this.setVisible(false);
        this.onControls?.();
      });
      extras.push(controls);
    }
    if (this.onLeaderboard) {
      const board = document.createElement('button');
      board.textContent = 'Leaderboard';
      board.addEventListener('click', () => {
        this.setVisible(false);
        this.onLeaderboard?.();
      });
      extras.push(board);
    }
    if (this.onTaskSelect) {
      const tasks = document.createElement('button');
      tasks.textContent = 'Choose a task';
      tasks.addEventListener('click', () => {
        this.setVisible(false);
        this.onTaskSelect?.();
      });
      extras.push(tasks);
    }
    const quit = document.createElement('button');
    quit.textContent = 'Save & return to title';
    quit.addEventListener('click', () => {
      this.save.save();
      this.setVisible(false);
      this.onQuitToTitle();
    });
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Inspired by traditional stories; all events, characters and the temple in this game are fictional.';
    this.root.append(h, resume, ...extras, saveBtn, journalBtn, opts, quit, note);
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.hidden = !v;
    this.engine.uiBlocking = v;
    this.engine.input.gameplayBlocked = v || this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = !v;
    this.engine.timeScale = v ? 0 : 1;
    if (v) this.engine.input.mouse.unlock();
  }
  get isVisible(): boolean {
    return this.visible;
  }

  update(): void {
    if (this.engine.input.pressed('pause')) this.setVisible(!this.visible);
  }

  dispose(): void {
    window.removeEventListener('eka:back', this.onBack);
    this.root.remove();
  }
}
