import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { gameStore, type Inventory, type Quest } from '@/state/store';
import { damp } from '@/util/math';

export interface MapRect {
  x: number;
  z: number;
  w: number;
  d: number;
  rotY: number;
}

const ICONS = {
  pouch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l1 3H8l1-3z"/><path d="M7 7c-2 3-3 6-3 9a8 8 0 0 0 16 0c0-3-1-6-3-9"/><path d="M8 7c0 2 2 3 4 3s4-1 4-3"/></svg>',
  scroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2z"/><path d="M7 20a2 2 0 0 1-2-2v-1h13"/><path d="M9 9h7M9 12h7M9 15h4"/></svg>',
  blade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l9-9"/><path d="M13 11l7-8-1 6-6 5"/><path d="M11 13l-1.5 1.5M6 18l-2 2"/><path d="M9 15l2 2"/></svg>',
};

/**
 * Locked HUD (§2): quest tracker top-left, three diamond slots bottom-left, compass minimap bottom-right.
 * Auto-fades after 6 s with no input or threat; Cinematic Mode hides it entirely.
 */
export class HUD implements System {
  readonly name = 'hud';
  private readonly root: HTMLDivElement;
  private readonly questTitle: HTMLElement;
  private readonly questObjective: HTMLElement;
  private readonly countBadge: HTMLElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly prompt: HTMLDivElement;
  private readonly promptKey: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly stamina: HTMLDivElement;
  private readonly staminaFill: HTMLDivElement;
  private readonly resolve: HTMLDivElement;
  private readonly resolveFill: HTMLDivElement;
  private opacity = 1;
  private threat = false;
  private rects: MapRect[] = [];
  private lastYaw = 0;
  private readonly engine: Engine;
  private readonly unsub: () => void;
  private getPlayer: (() => { x: number; z: number; yaw: number; stamina: number; sprinting: boolean }) | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="quest">
        <div class="quest-glyph"></div>
        <div class="quest-text"><div class="quest-title"></div><div class="quest-objective"></div></div>
      </div>
      <div class="slots">
        <div class="slot slot-consumable"><div class="slot-inner">${ICONS.pouch}</div><div class="slot-count"></div></div>
        <div class="slot slot-scroll"><div class="slot-inner">${ICONS.scroll}</div></div>
        <div class="slot slot-blade"><div class="slot-inner">${ICONS.blade}</div></div>
      </div>
      <div class="minimap"><canvas width="176" height="176"></canvas></div>
      <div class="prompt" hidden><span class="prompt-key"></span><span class="prompt-text"></span></div>
      <div class="resolve" hidden><div class="resolve-fill"></div></div>
      <div class="stamina" hidden><div class="stamina-fill"></div></div>`;
    engine.uiRoot.appendChild(this.root);
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = this.root.querySelector(sel);
      if (!el) throw new Error(`HUD: missing ${sel}`);
      return el as T;
    };
    this.questTitle = q('.quest-title');
    this.questObjective = q('.quest-objective');
    this.countBadge = q('.slot-count');
    this.mapCanvas = q<HTMLCanvasElement>('.minimap canvas');
    const ctx = this.mapCanvas.getContext('2d');
    if (!ctx) throw new Error('HUD: 2D context unavailable');
    this.mapCtx = ctx;
    this.prompt = q('.prompt');
    this.promptKey = q('.prompt-key');
    this.promptText = q('.prompt-text');
    this.stamina = q('.stamina');
    this.staminaFill = q('.stamina-fill');
    this.resolve = q('.resolve');
    this.resolveFill = q('.resolve-fill');
    const apply = (): void => {
      const s = gameStore.getState();
      this.setQuest(s.quest);
      this.setInventory(s.inventory);
      this.root.classList.toggle('cinematic', s.settings.cinematicMode);
    };
    apply();
    this.unsub = gameStore.subscribe(apply);
  }

  bindPlayer(fn: () => { x: number; z: number; yaw: number; stamina: number; sprinting: boolean }): void {
    this.getPlayer = fn;
  }
  setMapGeometry(rects: MapRect[]): void {
    this.rects = rects;
  }
  setThreat(v: boolean): void {
    this.threat = v;
  }
  /** Hide the whole HUD for a cinematic (independent of the player's Cinematic Mode setting). */
  setCinematic(v: boolean): void {
    this.root.classList.toggle('cinematic', v || gameStore.getState().settings.cinematicMode);
  }
  /** Encounter resolve (0–100) shown only during action sequences; null hides it. */
  setResolve(v: number | null): void {
    this.resolve.hidden = v === null;
    if (v !== null) this.resolveFill.style.width = `${Math.max(0, Math.min(100, v))}%`;
  }
  setQuest(quest: Quest): void {
    this.questTitle.textContent = quest.title;
    this.questObjective.textContent = quest.objective;
  }
  setInventory(inv: Inventory): void {
    this.countBadge.textContent = inv.consumables > 0 ? String(inv.consumables) : '';
    this.root.querySelector('.slot-scroll')?.classList.toggle('empty', !inv.hasScroll);
    this.root.querySelector('.slot-blade')?.classList.toggle('empty', !inv.hasBlade);
  }
  /** Contextual prompt; pass null to hide. Shown only when an interaction is in range (§20). */
  setPrompt(text: string | null, showKey = true): void {
    if (text === null) {
      this.prompt.hidden = true;
      this.engine.input.touch.setActionLabel(null);
      return;
    }
    const d = this.engine.input.device;
    this.promptKey.textContent = d === 'gamepad' ? 'A' : d === 'touch' ? '' : 'E';
    this.promptKey.hidden = d === 'touch' || !showKey;
    this.promptText.textContent = text;
    this.prompt.hidden = false;
    this.engine.input.touch.setActionLabel(text);
  }

  update(dt: number): void {
    const settings = gameStore.getState().settings;
    const idleMs = performance.now() - this.engine.input.lastActivityTime;
    const wantVisible = !settings.hudAutoFade || this.threat || idleMs < 6000;
    this.opacity = wantVisible ? 1 : damp(this.opacity, 0, 1.6, dt);
    if (wantVisible && this.opacity < 1) this.opacity = 1;
    this.root.style.opacity = String(this.opacity);
    if (this.getPlayer) {
      const p = this.getPlayer();
      this.drawMap(p.x, p.z, p.yaw);
      const showStamina = p.sprinting || this.threat || p.stamina < 99;
      this.stamina.hidden = !showStamina;
      this.staminaFill.style.width = `${p.stamina}%`;
    }
  }

  private drawMap(px: number, pz: number, yaw: number): void {
    const ctx = this.mapCtx;
    const S = this.mapCanvas.width;
    const c = S / 2;
    const r = S / 2 - 6;
    const scale = 2.6; // px per metre
    this.lastYaw = yaw;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(11,18,32,0.55)';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(c, c);
    ctx.rotate(yaw);
    ctx.strokeStyle = 'rgba(232,220,192,0.3)';
    ctx.lineWidth = 1;
    for (const rc of this.rects) {
      ctx.save();
      ctx.translate((rc.x - px) * scale, (rc.z - pz) * scale);
      ctx.rotate(-rc.rotY);
      ctx.strokeRect((-rc.w / 2) * scale, (-rc.d / 2) * scale, rc.w * scale, rc.d * scale);
      ctx.restore();
    }
    ctx.restore();
    // Ring.
    ctx.strokeStyle = 'rgba(217,179,112,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
    // North marker rides on the ring.
    const nAng = yaw - Math.PI / 2;
    const nx = c + Math.cos(nAng) * (r - 12);
    const ny = c + Math.sin(nAng) * (r - 12);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = '600 13px "EB Garamond", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
    // Player arrow (always up).
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, c - 9);
    ctx.lineTo(c + 6, c + 7);
    ctx.lineTo(c, c + 3);
    ctx.lineTo(c - 6, c + 7);
    ctx.closePath();
    ctx.fill();
  }

  get mapYaw(): number {
    return this.lastYaw;
  }

  dispose(): void {
    this.unsub();
    this.root.remove();
  }
}
