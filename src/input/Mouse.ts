import type { InputDevice, InputFrame } from './types';

/** Pointer-lock orbit look + mouse buttons. Look deltas are in pixels; the camera rig applies sensitivity. */
export class Mouse implements InputDevice {
  readonly kind = 'kbm' as const;
  private dx = 0;
  private dy = 0;
  private readonly buttons = new Set<number>();
  private activity = false;
  private readonly canvas: HTMLCanvasElement;
  locked = false;
  /** When false (menus open), clicks do not request pointer lock. */
  lockOnClick = true;

  private readonly onMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    // Browsers occasionally emit huge spurious deltas right after lock; clamp them.
    this.dx += Math.max(-200, Math.min(200, e.movementX));
    this.dy += Math.max(-200, Math.min(200, e.movementY));
    this.activity = true;
  };
  private readonly onDown = (e: MouseEvent): void => {
    if (e.target !== this.canvas) return;
    this.buttons.add(e.button);
    this.activity = true;
    if (!this.locked && this.lockOnClick && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock();
    }
  };
  private readonly onUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };
  private readonly onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mousedown', this.onDown);
    window.addEventListener('mouseup', this.onUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  unlock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  poll(frame: InputFrame): boolean {
    frame.lookX += this.dx;
    frame.lookY += this.dy;
    this.dx = 0;
    this.dy = 0;
    if (this.buttons.has(0)) frame.held.add('interact');
    if (this.buttons.has(2)) frame.held.add('block');
    const had = this.activity;
    this.activity = false;
    return had;
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
