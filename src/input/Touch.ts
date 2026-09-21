import type { InputDevice, InputFrame } from './types';

const STICK_RADIUS = 56; // px from origin to full deflection
const SPRINT_THRESHOLD = 0.94;
const SWIPE_LOOK_GAIN = 1.65;

/**
 * Touch controls: floating-origin virtual stick on the left half, swipe-to-orbit on the right half,
 * contextual action button, and sprint by pushing the stick past its rim. One-thumb friendly.
 */
export class Touch implements InputDevice {
  readonly kind = 'touch' as const;
  private readonly root: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  readonly actionButton: HTMLButtonElement;
  readonly secondaryButton: HTMLButtonElement;
  readonly pauseButton: HTMLButtonElement;
  readonly fireButton: HTMLButtonElement;
  readonly reloadButton: HTMLButtonElement;
  readonly jumpButton: HTMLButtonElement;
  readonly weaponButton: HTMLButtonElement;
  private fireHeld = false;
  private jumpHeld = false;
  private weaponPressed = false;
  private reloadPressed = false;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickVec = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private lookDelta = { x: 0, y: 0 };
  private actionHeld = false;
  private secondaryHeld = false;
  private pausePressed = false;
  private activity = false;
  private lastTapTime = 0;
  private tapCount = 0;
  devMenuRequested = false;
  private readonly canvas: HTMLCanvasElement;

  private readonly onStart = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if ((e.target as HTMLElement).closest('button, .menu, .devmenu')) return;
    this.activity = true;
    const half = window.innerWidth * 0.5;
    if (e.clientX < half && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickVec = { x: 0, y: 0 };
      this.stickBase.style.transform = `translate(${e.clientX - 64}px, ${e.clientY - 64}px)`;
      this.stickBase.classList.add('active');
      this.stickKnob.style.transform = 'translate(0px, 0px)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
    // Three-finger tap opens the dev menu.
    const now = performance.now();
    if (now - this.lastTapTime < 250) this.tapCount++;
    else this.tapCount = 1;
    this.lastTapTime = now;
    if (this.tapCount >= 3) {
      this.devMenuRequested = true;
      this.tapCount = 0;
    }
  };
  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickOrigin.x;
      const dy = e.clientY - this.stickOrigin.y;
      const m = Math.hypot(dx, dy);
      const s = m > STICK_RADIUS ? STICK_RADIUS / m : 1;
      const kx = dx * s;
      const ky = dy * s;
      this.stickVec = { x: kx / STICK_RADIUS, y: -ky / STICK_RADIUS };
      this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      // Floating origin: drag the base along when the finger overshoots the rim.
      if (m > STICK_RADIUS) {
        this.stickOrigin.x = e.clientX - kx;
        this.stickOrigin.y = e.clientY - ky;
        this.stickBase.style.transform = `translate(${this.stickOrigin.x - 64}px, ${this.stickOrigin.y - 64}px)`;
      }
    } else if (e.pointerId === this.lookId) {
      this.lookDelta.x += (e.clientX - this.lookLast.x) * SWIPE_LOOK_GAIN;
      this.lookDelta.y += (e.clientY - this.lookLast.y) * SWIPE_LOOK_GAIN;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.activity = true;
    }
  };
  private readonly onEnd = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickVec = { x: 0, y: 0 };
      this.stickBase.classList.remove('active');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  };

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.root.hidden = true;
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'vstick';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'vstick-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.actionButton = document.createElement('button');
    this.actionButton.className = 'touch-btn touch-action';
    this.actionButton.setAttribute('aria-label', 'Interact');
    this.secondaryButton = document.createElement('button');
    this.secondaryButton.className = 'touch-btn touch-secondary';
    this.secondaryButton.setAttribute('aria-label', 'Dodge');
    this.secondaryButton.textContent = '◇';
    this.pauseButton = document.createElement('button');
    this.pauseButton.className = 'touch-btn touch-pause';
    this.pauseButton.setAttribute('aria-label', 'Pause');
    this.pauseButton.textContent = '❚❚';
    this.fireButton = document.createElement('button');
    this.fireButton.className = 'touch-btn touch-fire';
    this.fireButton.setAttribute('aria-label', 'Fire');
    this.fireButton.textContent = 'FIRE';
    this.fireButton.hidden = true;
    this.reloadButton = document.createElement('button');
    this.reloadButton.className = 'touch-btn touch-reload';
    this.reloadButton.setAttribute('aria-label', 'Reload');
    this.reloadButton.textContent = '↻';
    this.reloadButton.hidden = true;
    this.jumpButton = document.createElement('button');
    this.jumpButton.className = 'touch-btn touch-jump';
    this.jumpButton.setAttribute('aria-label', 'Jump');
    this.jumpButton.textContent = '▲';
    this.weaponButton = document.createElement('button');
    this.weaponButton.className = 'touch-btn touch-weapon';
    this.weaponButton.setAttribute('aria-label', 'Next weapon');
    this.weaponButton.textContent = '⟳';
    this.weaponButton.hidden = true;
    this.weaponButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.weaponPressed = true;
    });
    const hold = (btn: HTMLButtonElement, set: (v: boolean) => void): void => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        set(true);
        this.activity = true;
      });
      const up = (): void => set(false);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    };
    hold(this.actionButton, (v) => (this.actionHeld = v));
    hold(this.secondaryButton, (v) => (this.secondaryHeld = v));
    hold(this.fireButton, (v) => (this.fireHeld = v));
    hold(this.jumpButton, (v) => (this.jumpHeld = v));
    this.reloadButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.reloadPressed = true;
    });
    this.pauseButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pausePressed = true;
    });
    this.root.append(this.stickBase, this.actionButton, this.secondaryButton, this.pauseButton, this.fireButton, this.reloadButton, this.jumpButton, this.weaponButton);
    uiRoot.appendChild(this.root);
    canvas.addEventListener('pointerdown', this.onStart);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onEnd);
    window.addEventListener('pointercancel', this.onEnd);
  }

  setVisible(v: boolean): void {
    this.root.hidden = !v;
  }
  get isVisible(): boolean {
    return !this.root.hidden;
  }
  /** Show the fire/reload buttons (mission mode with a weapon). */
  setWeaponButtons(v: boolean): void {
    this.fireButton.hidden = !v;
    this.reloadButton.hidden = !v;
    this.weaponButton.hidden = !v;
  }
  /** Label the weapon button with the current weapon's initial. */
  setWeaponLabel(label: string): void {
    this.weaponButton.textContent = label;
  }
  setActionLabel(label: string | null): void {
    this.actionButton.textContent = label ?? '';
    this.actionButton.classList.toggle('has-action', label !== null);
  }

  poll(frame: InputFrame): boolean {
    frame.moveX += this.stickVec.x;
    frame.moveY += this.stickVec.y;
    frame.lookX += this.lookDelta.x;
    frame.lookY += this.lookDelta.y;
    this.lookDelta = { x: 0, y: 0 };
    if (Math.hypot(this.stickVec.x, this.stickVec.y) > SPRINT_THRESHOLD) frame.stickSprint = true;
    if (this.actionHeld) frame.held.add('interact');
    if (this.secondaryHeld) frame.held.add('dodge');
    if (this.fireHeld) frame.held.add('fire');
    if (this.jumpHeld) frame.held.add('jump');
    if (this.reloadPressed) {
      frame.held.add('reload');
      this.reloadPressed = false;
    }
    if (this.weaponPressed) {
      frame.held.add('weaponNext');
      this.weaponPressed = false;
    }
    if (this.pausePressed) {
      frame.held.add('pause');
      this.pausePressed = false;
    }
    if (this.devMenuRequested) {
      frame.held.add('devmenu');
      this.devMenuRequested = false;
    }
    const had = this.activity || this.stickId !== null;
    this.activity = false;
    return had;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onStart);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onEnd);
    window.removeEventListener('pointercancel', this.onEnd);
    this.root.remove();
  }
}
