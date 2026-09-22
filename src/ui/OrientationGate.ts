import type { Engine } from '@/engine/Engine';

/**
 * Phones play in landscape. On a touch device held upright the game stands still behind a "turn your
 * phone" card until it is turned; the first tap on the title also asks the browser for fullscreen and
 * a landscape lock (Android Chrome honours both; where a lock is refused, the card does the asking).
 */
export class OrientationGate {
  private readonly root: HTMLDivElement;
  private shown = false;
  private prev = { timeScale: 1, blocked: false, ui: false };
  private readonly onChange = (): void => this.check();

  constructor(private readonly engine: Engine) {
    this.root = document.createElement('div');
    this.root.className = 'rotate-gate';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="rotate-gate-inner">
        <div class="rotate-gate-phone" aria-hidden="true"></div>
        <h2>Turn your phone sideways</h2>
        <p>PrayStation plays in landscape — the fight needs the width.</p>
      </div>`;
    // On the document itself, above the title card (#boot, z-index 50) and every in-game layer.
    document.body.appendChild(this.root);
    window.addEventListener('resize', this.onChange);
    window.addEventListener('orientationchange', this.onChange);
    screen.orientation?.addEventListener?.('change', this.onChange);
    this.check();
  }

  /** True on phones and tablets: a coarse pointer and touch points. */
  static isTouchDevice(): boolean {
    return navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;
  }

  private get portrait(): boolean {
    return window.innerHeight > window.innerWidth * 1.05;
  }

  check(): void {
    const want = OrientationGate.isTouchDevice() && this.portrait;
    if (want === this.shown) return;
    this.shown = want;
    this.root.hidden = !want;
    if (want) {
      this.prev = { timeScale: this.engine.timeScale, blocked: this.engine.input.gameplayBlocked, ui: this.engine.uiBlocking };
      this.engine.timeScale = 0;
      this.engine.input.gameplayBlocked = true;
      this.engine.uiBlocking = true;
    } else {
      this.engine.timeScale = this.prev.timeScale;
      this.engine.input.gameplayBlocked = this.prev.blocked || this.engine.devMenu.isVisible;
      this.engine.uiBlocking = this.prev.ui;
      this.engine.resize();
    }
  }

  /** From a user gesture: go fullscreen and lock to landscape where the browser allows it. */
  static async requestLandscape(): Promise<void> {
    if (!OrientationGate.isTouchDevice()) return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* fullscreen refused (iOS Safari): the rotate card still guides the player */
    }
    try {
      const o = screen.orientation as ScreenOrientation & { lock?: (t: string) => Promise<void> };
      await o.lock?.('landscape');
    } catch {
      /* lock unsupported or not allowed outside fullscreen */
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onChange);
    window.removeEventListener('orientationchange', this.onChange);
    screen.orientation?.removeEventListener?.('change', this.onChange);
    this.root.remove();
  }
}
