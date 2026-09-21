import type { InputDevice, InputFrame } from './types';

/**
 * Mouse look + buttons. Look deltas are in pixels; the camera rig applies sensitivity.
 *
 * Pointer lock is requested from user gestures (a click on the game view, the "Begin" button, the
 * click that dismisses a narration card). Until the lock is granted — or when the browser refuses it,
 * as embedded webviews sometimes do — the camera still follows mouse movement over the game view
 * ("unlocked look"), so looking around always works; the lock only removes the screen-edge limit.
 */
export class Mouse implements InputDevice {
  readonly kind = 'kbm' as const;
  private dx = 0;
  private dy = 0;
  private readonly buttons = new Set<number>();
  /** Buttons clicked since the last poll: a click shorter than a frame still fires once. */
  private readonly tapped = new Set<number>();
  private activity = false;
  private readonly canvas: HTMLCanvasElement;
  private lastX: number | null = null;
  private lastY: number | null = null;
  locked = false;
  /** False after the browser reported a pointer-lock error; unlocked look carries the game. */
  lockAvailable = true;
  /** When false (menus open), clicks do not request pointer lock and unlocked look is suspended. */
  lockOnClick = true;
  /** Set when a lock request was refused or dropped; the HUD shows a "click to capture" hint. */
  lockRequests = 0;

  /** True when a pointer event landed on the game view rather than on a UI control. */
  private isGameSurface(target: EventTarget | null): boolean {
    if (target === this.canvas) return true;
    const el = target as HTMLElement | null;
    if (!el || typeof el.closest !== 'function') return false;
    if (el.closest('button, input, select, textarea, a, label, .menu, .narration, .taskmenu, .mapscreen, .ending, .howto, .touch-btn, .boot')) return false;
    return true;
  }

  /** Mouse events synthesised from touches are ignored: touch has its own device. */
  private isMouse(e: PointerEvent): boolean {
    return e.pointerType === 'mouse' || e.pointerType === 'pen';
  }

  /** Pointer events report chorded buttons only through the `buttons` mask: sync the set from it. */
  private syncButtons(e: PointerEvent): void {
    const mask = e.buttons;
    const now: number[] = [];
    if (mask & 1) now.push(0);
    if (mask & 2) now.push(2);
    if (mask & 4) now.push(1);
    for (const b of now) if (!this.buttons.has(b)) this.tapped.add(b);
    this.buttons.clear();
    for (const b of now) this.buttons.add(b);
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.isMouse(e)) return;
    if (this.buttons.size > 0 || e.buttons !== 0) this.syncButtons(e);
    if (this.locked) {
      // Browsers occasionally emit huge spurious deltas right after lock; clamp them.
      this.dx += Math.max(-200, Math.min(200, e.movementX));
      this.dy += Math.max(-200, Math.min(200, e.movementY));
      this.activity = true;
      return;
    }
    // Unlocked look: follow the pointer while it moves over the game view during gameplay.
    if (!this.lockOnClick || !this.isGameSurface(e.target)) {
      this.lastX = null;
      this.lastY = null;
      return;
    }
    let mx = e.movementX;
    let my = e.movementY;
    if (typeof mx !== 'number' || typeof my !== 'number' || (mx === 0 && my === 0)) {
      mx = this.lastX === null ? 0 : e.clientX - this.lastX;
      my = this.lastY === null ? 0 : e.clientY - this.lastY;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (mx === 0 && my === 0) return;
    this.dx += Math.max(-200, Math.min(200, mx));
    this.dy += Math.max(-200, Math.min(200, my));
    this.activity = true;
  };
  private readonly onDown = (e: PointerEvent): void => {
    if (!this.isMouse(e) || !this.isGameSurface(e.target)) return;
    this.syncButtons(e);
    this.buttons.add(e.button);
    this.tapped.add(e.button);
    this.activity = true;
    if (!this.locked && this.lockOnClick) this.requestLock();
  };
  private readonly onUp = (e: PointerEvent): void => {
    if (!this.isMouse(e)) return;
    this.buttons.delete(e.button);
    this.syncButtons(e);
  };
  private readonly onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.lockAvailable = true;
    this.lastX = null;
    this.lastY = null;
  };
  private readonly onLockError = (): void => {
    this.locked = false;
    this.lockAvailable = false;
  };
  private wheelDir = 0;
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.lockOnClick || !this.isGameSurface(e.target)) return;
    if (Math.abs(e.deltaY) < 1) return;
    this.wheelDir = e.deltaY > 0 ? 1 : -1;
    this.activity = true;
    e.preventDefault();
  };
  private readonly onBlur = (): void => this.buttons.clear();
  private readonly onContextMenu = (e: MouseEvent): void => {
    if (this.isGameSurface(e.target)) e.preventDefault();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  /** Ask for pointer lock. Only succeeds from a user gesture; failures fall back to unlocked look. */
  requestLock(): void {
    if (this.locked || document.pointerLockElement === this.canvas) return;
    if (typeof this.canvas.requestPointerLock !== 'function') {
      this.lockAvailable = false;
      return;
    }
    this.lockRequests++;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  unlock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  poll(frame: InputFrame): boolean {
    frame.lookX += this.dx;
    frame.lookY += this.dy;
    this.dx = 0;
    this.dy = 0;
    if (this.buttons.has(0) || this.tapped.has(0)) {
      frame.held.add('interact');
      frame.held.add('fire');
    }
    if (this.buttons.has(2) || this.tapped.has(2)) {
      frame.held.add('block');
      frame.held.add('aim');
    }
    this.tapped.clear();
    if (this.wheelDir !== 0) {
      frame.held.add(this.wheelDir > 0 ? 'weaponNext' : 'weaponPrev');
      this.wheelDir = 0;
    }
    const had = this.activity;
    this.activity = false;
    return had;
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }
}
