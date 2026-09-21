import type { Action, ControlProfile, InputDevice, InputFrame } from './types';

/** The lean mission set: nothing here can strand a player in a mode they did not choose. */
const MISSION_KEYS: Record<string, Action> = {
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  KeyQ: 'dodge',
  Escape: 'pause',
  KeyR: 'reload',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Digit3: 'weapon3',
  Digit4: 'weapon4',
  KeyX: 'weaponNext',
  KeyZ: 'weaponPrev',
  KeyB: 'help',
  KeyH: 'help',
  F1: 'devmenu',
  Backquote: 'devmenu',
  F3: 'profiler',
};

/** Story mode keeps the exploration verbs. */
const STORY_KEYS: Record<string, Action> = {
  ...MISSION_KEYS,
  KeyE: 'interact',
  Enter: 'interact',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyF: 'block',
  KeyJ: 'journal',
  KeyM: 'map',
  Tab: 'map',
  KeyV: 'cameraReset',
};

const PROFILES: Record<ControlProfile, Record<string, Action>> = { missions: MISSION_KEYS, story: STORY_KEYS };

export class Keyboard implements InputDevice {
  readonly kind = 'kbm' as const;
  private keymap: Record<string, Action> = PROFILES.missions;
  setProfile(profile: ControlProfile): void {
    this.keymap = PROFILES[profile];
  }
  private readonly down = new Set<string>();
  /** Keys pressed since the last poll: a tap shorter than a frame still counts for one frame. */
  private readonly tapped = new Set<string>();
  private readonly onDown = (e: KeyboardEvent): void => {
    // Typing in a text field (the traveller's name) is not game input.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F3' || e.code === 'Space') e.preventDefault();
    if (this.down.has(e.code)) return;
    this.down.add(e.code);
    this.tapped.add(e.code);
    this.activity = true;
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => this.down.clear();
  private activity = false;

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  poll(frame: InputFrame): boolean {
    let x = 0;
    let y = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    frame.moveX += x;
    frame.moveY += y;
    for (const code of this.down) {
      const a = this.keymap[code];
      if (a) frame.held.add(a);
    }
    for (const code of this.tapped) {
      const a = this.keymap[code];
      if (a) frame.held.add(a);
    }
    this.tapped.clear();
    const had = this.activity || x !== 0 || y !== 0;
    this.activity = false;
    return had;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
