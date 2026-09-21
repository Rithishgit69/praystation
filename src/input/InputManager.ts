import type { InputDeviceKind } from '@/engine/types';
import { EventBus } from '@/engine/EventBus';
import { GamepadDevice } from './GamepadDevice';
import { Keyboard } from './Keyboard';
import { Mouse } from './Mouse';
import { Touch } from './Touch';
import { ACTIONS, type Action, type InputDevice, type InputFrame } from './types';

export interface InputEvents extends Record<string, unknown> {
  devicechange: InputDeviceKind;
  activity: undefined;
}

/**
 * Merges keyboard/mouse, gamepad and touch into one InputFrame per render frame.
 * Provides edge detection (`pressed`/`released`), a 150 ms press buffer, and the last active device.
 */
export class InputManager {
  readonly frame: InputFrame = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, stickSprint: false, held: new Set(), device: 'kbm' };
  readonly events = new EventBus<InputEvents>();
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;
  readonly gamepad: GamepadDevice;
  readonly touch: Touch;
  private readonly devices: InputDevice[];
  private readonly prevHeld = new Set<Action>();
  private readonly pressedNow = new Set<Action>();
  private readonly releasedNow = new Set<Action>();
  private readonly lastPressTime = new Map<Action, number>();
  private readonly consumed = new Set<Action>();
  /** Time of the last input of any kind (for HUD auto-fade). */
  lastActivityTime = performance.now();
  device: InputDeviceKind = 'kbm';
  /** When true, gameplay actions are suppressed (menus, cinematics). Menu keys still work. */
  gameplayBlocked = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.keyboard = new Keyboard();
    this.mouse = new Mouse(canvas);
    this.touch = new Touch(canvas, uiRoot);
    this.gamepad = new GamepadDevice((connected) => {
      if (connected) this.setDevice('gamepad');
    });
    this.devices = [this.keyboard, this.mouse, this.gamepad, this.touch];
    const touchCapable = navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (touchCapable) this.setDevice('touch');
  }

  private setDevice(kind: InputDeviceKind): void {
    if (this.device === kind) return;
    this.device = kind;
    this.touch.setVisible(kind === 'touch');
    this.events.emit('devicechange', kind);
  }

  update(dt: number): void {
    const f = this.frame;
    f.moveX = 0;
    f.moveY = 0;
    f.lookX = 0;
    f.lookY = 0;
    f.stickSprint = false;
    f.held.clear();
    let activeKind: InputDeviceKind | null = null;
    for (const d of this.devices) {
      const produced = d.poll(f, dt);
      if (produced) activeKind = d.kind;
    }
    if (activeKind) {
      this.lastActivityTime = performance.now();
      this.events.emit('activity', undefined);
      if (activeKind !== this.device) this.setDevice(activeKind);
    }
    const m = Math.hypot(f.moveX, f.moveY);
    if (m > 1) {
      f.moveX /= m;
      f.moveY /= m;
    }
    f.device = this.device;
    this.pressedNow.clear();
    this.releasedNow.clear();
    const now = performance.now();
    for (const a of ACTIONS) {
      const held = f.held.has(a);
      const was = this.prevHeld.has(a);
      if (held && !was) {
        this.pressedNow.add(a);
        this.lastPressTime.set(a, now);
        this.consumed.delete(a);
      }
      if (!held && was) this.releasedNow.add(a);
      if (held) this.prevHeld.add(a);
      else this.prevHeld.delete(a);
    }
  }

  private allowed(a: Action): boolean {
    if (!this.gameplayBlocked) return true;
    return a === 'pause' || a === 'devmenu' || a === 'profiler' || a === 'journal' || a === 'map' || a === 'interact' || a === 'help';
  }

  held(a: Action): boolean {
    return this.allowed(a) && this.frame.held.has(a);
  }
  pressed(a: Action): boolean {
    return this.allowed(a) && this.pressedNow.has(a);
  }
  released(a: Action): boolean {
    return this.allowed(a) && this.releasedNow.has(a);
  }
  /** Input buffer: true if `a` was pressed within `windowMs` and not yet consumed. Consumes it. */
  consumeBuffered(a: Action, windowMs = 150): boolean {
    if (!this.allowed(a)) return false;
    const t = this.lastPressTime.get(a);
    if (t === undefined || this.consumed.has(a)) return false;
    if (performance.now() - t > windowMs) return false;
    this.consumed.add(a);
    return true;
  }

  get sprintRequested(): boolean {
    return this.held('sprint') || (!this.gameplayBlocked && this.frame.stickSprint);
  }

  dispose(): void {
    for (const d of this.devices) d.dispose();
    this.events.clear();
  }
}
