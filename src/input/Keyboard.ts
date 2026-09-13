import type { Action, InputDevice, InputFrame } from './types';

const KEYMAP: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyQ: 'dodge',
  KeyF: 'block',
  Escape: 'pause',
  KeyJ: 'journal',
  KeyM: 'map',
  Tab: 'map',
  F1: 'devmenu',
  Backquote: 'devmenu',
  F3: 'profiler',
  KeyV: 'cameraReset',
  KeyR: 'reload',
};

export class Keyboard implements InputDevice {
  readonly kind = 'kbm' as const;
  private readonly down = new Set<string>();
  private readonly onDown = (e: KeyboardEvent): void => {
    // Typing in a text field (the traveller's name) is not game input.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F3' || e.code === 'Space') e.preventDefault();
    if (this.down.has(e.code)) return;
    this.down.add(e.code);
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
      const a = KEYMAP[code];
      if (a) frame.held.add(a);
    }
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
