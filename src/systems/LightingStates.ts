import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { MoonLight } from '@/world/fx/Atmosphere';
import { Perlin } from '@/util/noise';
import { gameStore } from '@/state/store';

export type WorldState = 'present' | 'memory' | 'corruption';
export type MoonState = 'moonlit' | 'shadow';

/** Real moon arc: rises in the east at session start, crosses the meridian and sets over ~40 min. */
const MOON_ARC_MINUTES = 40;

/**
 * Global lighting states (GDD §18) blended through the grade LUTs, exposure and bloom, plus the moon
 * as a gameplay system (§10): its position moves on a real arc, and cloud cover produces the
 * moonlit / shadow dual-state that zones and puzzles subscribe to.
 */
export class LightingStates implements System {
  readonly name = 'lighting';
  state: WorldState = 'present';
  moonState: MoonState = 'moonlit';
  /** 0..1 progress along the arc; persisted so save/load keeps the sky consistent. */
  arc = 0.18;
  private readonly cloud = new Perlin(77);
  private cloudCover = 0;
  private readonly listeners = new Set<(s: MoonState) => void>();
  private mix = { from: 'present' as WorldState, to: 'present' as WorldState, t: 0 };
  private tween: gsap.core.Tween | null = null;
  /** Puzzles can pin the moon state (Chapter III mechanisms) instead of the weather deciding. */
  pinned: MoonState | null = null;

  constructor(
    private readonly engine: Engine,
    readonly moon: MoonLight,
  ) {
    const saved = gameStore.getState().flags['moon:arc'];
    if (typeof saved === 'number') this.arc = saved;
  }

  onMoonChange(fn: (s: MoonState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Blend to a world state over `seconds` (present → memory is the "seamless transformation"). */
  transition(to: WorldState, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      this.tween?.kill();
      this.mix = { from: this.state, to, t: 0 };
      this.state = to;
      const bloom = to === 'memory' ? { s: 0.95, r: 0.7, th: 0.72 } : to === 'corruption' ? { s: 0.75, r: 0.4, th: 0.8 } : { s: 0.6, r: 0.5, th: 0.86 };
      const exposure = to === 'memory' ? 1.35 : to === 'corruption' ? 1.05 : 1.2;
      gsap.to(this.engine.renderer, { toneMappingExposure: exposure, duration: seconds });
      this.tween = gsap.to(this.mix, {
        t: 1,
        duration: seconds,
        ease: 'sine.inOut',
        onUpdate: () => {
          this.engine.postfx.grade.set(this.mix.from, this.mix.to, this.mix.t);
          this.engine.postfx.setBloom(0.6 + (bloom.s - 0.6) * this.mix.t, 0.5 + (bloom.r - 0.5) * this.mix.t, 0.86 + (bloom.th - 0.86) * this.mix.t);
        },
        onComplete: () => resolve(),
      });
    });
  }

  /** Azimuth/elevation of the moon right now (radians). */
  get moonAzimuth(): number {
    return -Math.PI * 0.85 + this.arc * Math.PI * 1.7;
  }
  get moonElevation(): number {
    return 0.25 + Math.sin(this.arc * Math.PI) * 0.75;
  }

  update(dt: number, elapsed: number): void {
    this.arc = (this.arc + dt / (MOON_ARC_MINUTES * 60)) % 1;
    if (Math.floor(elapsed) % 10 === 0 && Math.floor(elapsed) !== Math.floor(elapsed - dt)) gameStore.getState().setFlag('moon:arc', this.arc);
    // Slow cloud cover: a band of cloud crosses the moon every few minutes.
    this.cloudCover = this.cloud.noise2(elapsed * 0.012, 4.2) * 0.5 + 0.5;
    const shadowNow: MoonState = this.pinned ?? (this.cloudCover > 0.66 ? 'shadow' : 'moonlit');
    if (shadowNow !== this.moonState) {
      this.moonState = shadowNow;
      for (const l of this.listeners) l(shadowNow);
    }
    const target = this.moonState === 'shadow' ? 0.35 : 1.7;
    this.moon.sun.intensity += (target - this.moon.sun.intensity) * (1 - Math.exp(-dt * 0.6));
  }
}
