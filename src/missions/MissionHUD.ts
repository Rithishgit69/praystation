import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { Gun } from './Gun';

const HEART = '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.1C1 8.5 3 5 6.6 5c2 0 3.4 1.1 5.4 3 2-1.9 3.4-3 5.4-3C21 5 23 8.5 21.6 11.9 19.5 16.4 12 21 12 21z"/></svg>';

/**
 * Mission overlay: three hearts and the player's health, the villain's name and health bar, ammo,
 * crosshair, task banners and a damage vignette. Sits on top of the locked HUD.
 */
export class MissionHUD implements System {
  readonly name = 'mission-hud';
  private readonly root: HTMLDivElement;
  private readonly hearts: HTMLElement[] = [];
  private readonly healthFill: HTMLElement;
  private readonly boss: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossText: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly ammoText: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly vignette: HTMLElement;
  private bannerTimer = 0;
  private vignetteTimer = 0;
  private lowHealthPulse = 0;

  constructor(
    private readonly engine: Engine,
    private readonly gun: Gun,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mhud';
    this.root.innerHTML = `
      <div class="mhud-lives"><div class="mhud-hearts"></div><div class="mhud-health"><div class="mhud-health-fill"></div></div></div>
      <div class="mhud-boss" hidden><div class="mhud-boss-name"></div><div class="mhud-boss-bar"><div class="mhud-boss-fill"></div></div><div class="mhud-boss-text"></div></div>
      <div class="mhud-ammo" hidden><span class="mhud-ammo-text">14 / 14</span><span class="mhud-ammo-hint">R to reload</span></div>
      <div class="mhud-crosshair" hidden><div class="ch-dot"></div><div class="ch-ring"></div></div>
      <div class="mhud-banner" hidden></div>
      <div class="mhud-vignette"></div>`;
    engine.uiRoot.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string): T => this.root.querySelector(sel) as T;
    const heartsEl = q('.mhud-hearts');
    for (let i = 0; i < 3; i++) {
      const h = document.createElement('span');
      h.className = 'mhud-heart';
      h.innerHTML = HEART;
      heartsEl.appendChild(h);
      this.hearts.push(h);
    }
    this.healthFill = q('.mhud-health-fill');
    this.boss = q('.mhud-boss');
    this.bossName = q('.mhud-boss-name');
    this.bossFill = q('.mhud-boss-fill');
    this.bossText = q('.mhud-boss-text');
    this.ammoEl = q('.mhud-ammo');
    this.ammoText = q('.mhud-ammo-text');
    this.crosshair = q('.mhud-crosshair');
    this.banner = q('.mhud-banner');
    this.vignette = q('.mhud-vignette');
    this.setHearts(3);
    this.setHealth(100);
  }

  setHearts(n: number): void {
    this.hearts.forEach((h, i) => h.classList.toggle('lost', i >= n));
  }
  setHealth(hp: number): void {
    this.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.healthFill.classList.toggle('low', hp < 35);
  }
  showBoss(name: string, epithet: string): void {
    this.bossName.textContent = `${name}, ${epithet}`;
    this.boss.hidden = false;
  }
  hideBoss(): void {
    this.boss.hidden = true;
  }
  setBossHealth(hp: number, max: number, shielded: boolean): void {
    this.bossFill.style.width = `${(hp / max) * 100}%`;
    this.bossFill.classList.toggle('shielded', shielded);
    this.bossText.textContent = shielded ? `${Math.ceil(hp)} / ${max}  ·  SHIELDED` : `${Math.ceil(hp)} / ${max}`;
  }
  setWeaponVisible(v: boolean): void {
    this.ammoEl.hidden = !v;
    this.crosshair.hidden = !v;
  }
  /** Big centred banner ("TASK 1", "BEGIN", "TASK COMPLETE"). */
  showBanner(text: string, seconds = 2.4, sub = ''): void {
    this.banner.innerHTML = `<div class="mhud-banner-main">${text}</div>${sub ? `<div class="mhud-banner-sub">${sub}</div>` : ''}`;
    this.banner.hidden = false;
    this.banner.classList.remove('out');
    this.bannerTimer = seconds;
  }
  damageFlash(): void {
    this.vignetteTimer = 0.5;
  }

  update(dt: number, elapsed: number): void {
    if (!this.ammoEl.hidden) {
      const g = this.gun;
      this.ammoText.textContent = g.reloading > 0 ? 'RELOADING…' : `${g.ammo} / ${g.magSize}`;
      this.ammoEl.classList.toggle('empty', g.ammo === 0 && g.reloading === 0);
      const d = this.engine.input.device;
      (this.root.querySelector('.mhud-ammo-hint') as HTMLElement).textContent = d === 'gamepad' ? 'X to reload' : d === 'touch' ? '' : 'R to reload';
      this.crosshair.classList.toggle('aim', g.aiming);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.classList.add('out');
        setTimeout(() => {
          if (this.bannerTimer <= 0) this.banner.hidden = true;
        }, 600);
      }
    }
    this.vignetteTimer = Math.max(0, this.vignetteTimer - dt);
    const low = this.healthFill.classList.contains('low') ? (Math.sin(elapsed * 5) * 0.5 + 0.5) * 0.25 : 0;
    this.lowHealthPulse = low;
    this.vignette.style.opacity = String(Math.max(this.vignetteTimer * 1.6, this.lowHealthPulse));
  }

  dispose(): void {
    this.root.remove();
  }
}
