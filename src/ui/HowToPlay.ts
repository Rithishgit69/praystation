import type { Engine } from '@/engine/Engine';
import type { InputDeviceKind } from '@/engine/types';

type Row = [string, string];

const OBJECTIVES: Record<'missions' | 'story', string[]> = {
  missions: [
    'Five tasks. Five asuras of the Vinayaka Purana tradition — the blade warrior, the wrestler, the buffalo demon, the three-faced deluder and the fire king — each with its own way of fighting, each harder than the last. Every task opens with the villain’s story; then the temple arms you and the battle begins.',
    'Four Astras, granted one per task: the Astra (rifle — hold to fire, aim to tighten), the Dhanush (bow — hold to draw, release; a full draw pierces), the Chakra (disc — cuts out and back, returns to your hand) and the Vajra (thunder burst — six pellets, devastating up close). Switch with 1–4 or the mouse wheel.',
    'You have three hearts. When the asura brings you down you lose one and return to the edge of the arena; the asura keeps its wounds. Lose all three and you choose: continue from the same stage, or play the previous task again. The villain’s health bar sits at the top of the screen. Finish all five for your rank and a place on the leaderboard.',
  ],
  story: [
    'Explore the abandoned temple. The quest tracker in the top-left corner names your next goal; the compass minimap points the way.',
    'Murals awaken playable memories. Light braziers, solve what the temple asks, and follow the moon — the night never ends until you finish what was left undone.',
  ],
};

/** Mission mode: eleven things to know, nothing that can trap a player in a stance. */
const KBM: Row[] = [
  ['W A S D / arrows', 'Move'],
  ['Mouse', 'Look around · click the view to capture the mouse, Esc releases it'],
  ['Shift (hold)', 'Run (uses stamina)'],
  ['Space', 'Jump'],
  ['Q', 'Dodge — a quick roll the way you are moving (brief invulnerability)'],
  ['Left mouse', 'Fire · hold to draw the bow'],
  ['Right mouse (hold)', 'Aim down the sights (closer camera, tighter spread, slower walk)'],
  ['R', 'Reload'],
  ['1 2 3 4 / wheel', 'Switch weapon (X / Z also cycle)'],
  ['B', 'Show these controls (pauses the game)'],
  ['Esc', 'Pause: options, controls, leaderboard, choose a task'],
];

const PAD: Row[] = [
  ['Left stick', 'Move (push fully to run)'],
  ['Right stick', 'Look around'],
  ['LB / L3', 'Run'],
  ['A / Y', 'Jump'],
  ['B', 'Dodge'],
  ['RT', 'Fire · hold to draw the bow'],
  ['LT (hold)', 'Aim'],
  ['X', 'Reload'],
  ['D-pad ◀ ▶', 'Switch weapon'],
  ['Back', 'Show these controls'],
  ['Start', 'Pause'],
];

const TOUCH: Row[] = [
  ['Left half: drag', 'Move (push to the rim to run)'],
  ['Right half: swipe', 'Look around'],
  ['FIRE', 'Fire · hold to draw the bow'],
  ['↻', 'Reload'],
  ['⟳', 'Switch weapon'],
  ['▲', 'Jump'],
  ['◇', 'Dodge'],
  ['?', 'Show these controls'],
  ['❚❚', 'Pause'],
];

/** Story mode keeps the exploration verbs. */
const KBM_STORY: Row[] = [
  ['W A S D / arrows', 'Move'],
  ['Mouse', 'Look around · click the view to capture the mouse, Esc releases it'],
  ['Shift (hold)', 'Run (uses stamina)'],
  ['Space', 'Jump'],
  ['Q', 'Dodge (brief invulnerability)'],
  ['C / Ctrl', 'Crouch (press again to stand)'],
  ['E', 'Interact'],
  ['V', 'Reset the camera behind you'],
  ['M / Tab', 'Map'],
  ['J', 'Journal'],
  ['B', 'Show these controls'],
  ['Esc', 'Pause: options, controls'],
];

const PAD_STORY: Row[] = [
  ['Left stick', 'Move (push fully to run)'],
  ['Right stick', 'Look around'],
  ['LB / L3', 'Run'],
  ['Y', 'Jump'],
  ['B', 'Dodge'],
  ['RB', 'Crouch'],
  ['A', 'Interact'],
  ['R3', 'Reset the camera'],
  ['Back', 'Map'],
  ['D-pad up', 'Journal'],
  ['Start', 'Pause'],
];

const TOUCH_STORY: Row[] = [
  ['Left half: drag', 'Move (push to the rim to run)'],
  ['Right half: swipe', 'Look around'],
  ['▲', 'Jump'],
  ['◇', 'Dodge'],
  ['Action button', 'Interact'],
  ['Minimap', 'Open the map'],
  ['❚❚', 'Pause'],
];

export interface HowToPlayOptions {
  /** "start": the card gates the first task and its button reads Begin; "reference": opened from the pause menu. */
  mode: 'start' | 'reference';
  onClose(): void;
}

/**
 * The instructions card shown before the first task and from the pause menu: the objective, the heart
 * and villain-health rules, and every control for keyboard+mouse, gamepad and touch. The active input
 * device's column is highlighted. Closing it from a click or key captures the mouse for gameplay.
 */
export class HowToPlay {
  private readonly root: HTMLDivElement;
  private active: HowToPlayOptions | null = null;
  private prevTimeScale = 1;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.close(true);
    } else if (e.code === 'Escape' && this.active?.mode === 'reference') this.close(true);
  };
  private readonly onDevice = (kind: InputDeviceKind): void => this.highlight(kind);

  constructor(
    private readonly engine: Engine,
    objective: 'missions' | 'story' = 'missions',
  ) {
    this.root = document.createElement('div');
    this.root.className = 'howto';
    this.root.hidden = true;
    const col = (kind: InputDeviceKind, title: string, rows: Row[]): string =>
      `<section class="howto-col" data-device="${kind}"><h3>${title}</h3><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
    this.root.innerHTML = `
      <div class="howto-inner">
        <h1 class="boot-title">How to play</h1>
        <div class="howto-objective">${OBJECTIVES[objective].map((p) => `<p>${p}</p>`).join('')}</div>
        ${
          objective === 'missions'
            ? `<div class="howto-hud">
          <span><i class="howto-hearts">♥♥♥</i> your hearts and health</span>
          <span><i class="howto-bossbar"></i> the villain’s health</span>
          <span><i class="howto-ammo">12 / 12</i> the Astra’s magazine</span>
        </div>`
            : ''
        }
        <div class="howto-cols">${col('kbm', 'Keyboard & mouse', objective === 'missions' ? KBM : KBM_STORY)}${col('gamepad', 'Gamepad', objective === 'missions' ? PAD : PAD_STORY)}${col('touch', 'Touch', objective === 'missions' ? TOUCH : TOUCH_STORY)}</div>
        <div class="howto-actions">
          <button class="boot-continue howto-begin">Begin</button>
          <p class="howto-hint">Press Enter to begin · in the game, B shows these controls again and Esc opens the pause menu.</p>
        </div>
      </div>`;
    engine.uiRoot.appendChild(this.root);
    (this.root.querySelector('.howto-begin') as HTMLButtonElement).addEventListener('click', () => this.close(true));
    engine.input.events.on('devicechange', this.onDevice);
  }

  get isVisible(): boolean {
    return this.active !== null;
  }

  show(opts: HowToPlayOptions): void {
    this.active = opts;
    const btn = this.root.querySelector('.howto-begin') as HTMLButtonElement;
    btn.textContent = opts.mode === 'start' ? 'Begin' : 'Back to the game';
    (this.root.querySelector('.howto-hint') as HTMLElement).textContent =
      opts.mode === 'start' ? 'Press Enter to begin · in the game, B shows these controls again and Esc opens the pause menu.' : 'Press Enter, B or Esc to return.';
    this.highlight(this.engine.input.device);
    this.root.hidden = false;
    this.root.scrollTop = 0;
    // Opened mid-fight (B key): the game stands still until the card closes.
    this.prevTimeScale = this.engine.timeScale;
    this.engine.timeScale = 0;
    this.engine.uiBlocking = true;
    this.engine.input.gameplayBlocked = true;
    this.engine.input.mouse.lockOnClick = false;
    this.engine.input.mouse.unlock();
    window.addEventListener('keydown', this.onKey);
  }

  private highlight(kind: InputDeviceKind): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.howto-col')) el.classList.toggle('active', el.dataset.device === kind);
  }

  /** Close the card; `capture` is true for a click or key gesture so the mouse can be captured for play. */
  close(capture: boolean): void {
    const opts = this.active;
    if (!opts) return;
    this.active = null;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.engine.timeScale = this.prevTimeScale;
    this.engine.uiBlocking = false;
    this.engine.input.gameplayBlocked = this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
    if (capture && this.engine.input.device === 'kbm') this.engine.input.mouse.requestLock();
    opts.onClose();
  }

  dispose(): void {
    this.engine.input.events.off('devicechange', this.onDevice);
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
