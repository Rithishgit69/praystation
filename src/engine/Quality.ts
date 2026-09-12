import type { QualityTier } from './types';

export interface QualitySettings {
  tier: QualityTier;
  shadowMapSize: number;
  maxShadowLights: number;
  gtao: boolean;
  bloom: boolean;
  smaa: boolean;
  anisotropy: number;
  foliageDensity: number;
  particleScale: number;
  streamRadiusCells: number;
  frameBudgetMs: number;
  /** Rapier and animation LOD distances scale with this. */
  lodBias: number;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  low: { shadowMapSize: 1024, maxShadowLights: 1, gtao: false, bloom: true, smaa: false, anisotropy: 2, foliageDensity: 0.45, particleScale: 0.4, streamRadiusCells: 2, frameBudgetMs: 33.3, lodBias: 0.6 },
  medium: { shadowMapSize: 2048, maxShadowLights: 2, gtao: false, bloom: true, smaa: true, anisotropy: 4, foliageDensity: 0.7, particleScale: 0.7, streamRadiusCells: 3, frameBudgetMs: 33.3, lodBias: 0.8 },
  high: { shadowMapSize: 4096, maxShadowLights: 4, gtao: true, bloom: true, smaa: true, anisotropy: 8, foliageDensity: 1, particleScale: 1, streamRadiusCells: 3, frameBudgetMs: 16.7, lodBias: 1 },
  ultra: { shadowMapSize: 4096, maxShadowLights: 4, gtao: true, bloom: true, smaa: true, anisotropy: 16, foliageDensity: 1.2, particleScale: 1.2, streamRadiusCells: 4, frameBudgetMs: 16.7, lodBias: 1.3 },
};

export const isMobileDevice = (): boolean =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);

export const detectTier = (): QualityTier => {
  const params = new URLSearchParams(location.search);
  const forced = params.get('quality');
  if (forced === 'low' || forced === 'medium' || forced === 'high' || forced === 'ultra') return forced;
  if (isMobileDevice()) {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
    return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  }
  return 'high';
};

/**
 * Quality tiers, the dynamic resolution scaler (0.6–1.0) and the thermal-aware step-down.
 * The scaler protects the frame budget automatically; the tier defines the static feature set.
 */
export class Quality {
  settings: QualitySettings;
  renderScale = 1;
  readonly minScale = 0.6;
  private readonly onChange: (s: QualitySettings) => void;
  private overBudgetFrames = 0;
  private underBudgetFrames = 0;
  private readonly sessionStart = performance.now();
  private thermalDropped = false;
  private lastAdjust = 0;
  dynamicResolution = true;

  constructor(tier: QualityTier, onChange: (s: QualitySettings) => void) {
    this.settings = { tier, ...PRESETS[tier] };
    this.onChange = onChange;
  }

  setTier(tier: QualityTier): void {
    this.settings = { tier, ...PRESETS[tier] };
    this.renderScale = 1;
    this.onChange(this.settings);
  }

  get label(): string {
    return `${this.settings.tier}${this.thermalDropped ? '·thermal' : ''}`;
  }

  /** Called every frame with the EMA of frame time. Returns the new render scale. */
  tick(frameMsEma: number, now: number, mobile: boolean): number {
    const budget = this.settings.frameBudgetMs;
    if (this.dynamicResolution) {
      if (frameMsEma > budget * 1.06) {
        this.overBudgetFrames++;
        this.underBudgetFrames = 0;
      } else if (frameMsEma < budget * 0.72) {
        this.underBudgetFrames++;
        this.overBudgetFrames = 0;
      } else {
        this.overBudgetFrames = 0;
        this.underBudgetFrames = 0;
      }
      if (now - this.lastAdjust > 350) {
        if (this.overBudgetFrames > 12 && this.renderScale > this.minScale) {
          this.renderScale = Math.max(this.minScale, this.renderScale - 0.05);
          this.lastAdjust = now;
          this.overBudgetFrames = 0;
        } else if (this.underBudgetFrames > 90 && this.renderScale < 1) {
          this.renderScale = Math.min(1, this.renderScale + 0.05);
          this.lastAdjust = now;
          this.underBudgetFrames = 0;
        }
      }
    }
    // Thermal-aware drop: browsers expose no thermal API, so after 10 minutes of mobile play we
    // step down one tier if the scaler has been pinned at its floor (sustained throttling signature).
    if (mobile && !this.thermalDropped && now - this.sessionStart > 10 * 60 * 1000) {
      if (this.renderScale <= this.minScale + 0.001 && this.settings.tier !== 'low') {
        this.thermalDropped = true;
        this.setTier(this.settings.tier === 'high' ? 'medium' : 'low');
      }
    }
    return this.renderScale;
  }
}
