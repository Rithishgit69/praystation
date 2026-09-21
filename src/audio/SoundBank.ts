import { SeededRandom } from '@/util/random';

export const SAMPLE_RATE = 22050;

export type SoundId =
  | 'step-wet-stone'
  | 'step-dry-stone'
  | 'step-gravel'
  | 'step-grass'
  | 'step-water'
  | 'step-wood'
  | 'step-moss'
  | 'step-earth'
  | 'land-soft'
  | 'land-hard'
  | 'bell-distant'
  | 'bell-near'
  | 'diya-light'
  | 'lantern-out'
  | 'fire-loop'
  | 'wind-loop'
  | 'wind-corridor-loop'
  | 'crickets-loop'
  | 'drip'
  | 'drone-loop'
  | 'tanpura-loop'
  | 'stone-grind'
  | 'memory-enter'
  | 'memory-exit'
  | 'tusk-break'
  | 'shimmer'
  | 'axe-swing'
  | 'block-impact'
  | 'barrier-raise'
  | 'ui-tick'
  | 'ui-open'
  | 'mirror-turn'
  | 'water-loop'
  | 'rumble'
  | 'serpent-hiss'
  | 'symbol-chime'
  | 'astra-shot'
  | 'astra-reload'
  | 'astra-empty'
  | 'asura-roar'
  | 'asura-bolt'
  | 'asura-hit'
  | 'asura-death'
  | 'heart-lost'
  | 'task-complete'
  | 'task-begin'
  | 'om-chant-loop'
  | 'bow-release'
  | 'chakra-throw'
  | 'vajra-burst'
  | 'weapon-granted'
  | 'dodge';

/** All game audio is synthesised here at startup; no audio files ship with the game. */
export class SoundBank {
  private readonly rng = new SeededRandom(4242);
  readonly buffers = new Map<SoundId, Float32Array>();

  constructor() {
    for (const s of ['wet-stone', 'dry-stone', 'gravel', 'grass', 'water', 'wood', 'moss', 'earth'] as const) this.buffers.set(`step-${s}`, this.footstep(s));
    this.buffers.set('land-soft', this.land(0.5));
    this.buffers.set('land-hard', this.land(1));
    this.buffers.set('bell-near', this.bell(1));
    this.buffers.set('bell-distant', this.bell(0.35));
    this.buffers.set('diya-light', this.whoosh(0.7, 900, 3200, 0.6));
    this.buffers.set('lantern-out', this.whoosh(0.5, 2400, 300, 0.4));
    this.buffers.set('fire-loop', this.fireLoop(4));
    this.buffers.set('wind-loop', this.windLoop(8, 420, 0.5));
    this.buffers.set('wind-corridor-loop', this.windLoop(8, 220, 0.35));
    this.buffers.set('crickets-loop', this.cricketsLoop(6));
    this.buffers.set('drip', this.drip());
    this.buffers.set('drone-loop', this.droneLoop(10, [55, 82.4, 110], 0.3));
    this.buffers.set('tanpura-loop', this.tanpuraLoop(12));
    this.buffers.set('stone-grind', this.grind(3.2));
    this.buffers.set('memory-enter', this.shimmer(3.2, 1));
    this.buffers.set('memory-exit', this.shimmer(2.4, -1));
    this.buffers.set('shimmer', this.shimmer(1.4, 1));
    this.buffers.set('tusk-break', this.crack());
    this.buffers.set('axe-swing', this.whoosh(0.35, 400, 2600, 0.8));
    this.buffers.set('dodge', this.whoosh(0.3, 900, 260, 0.55));
    this.buffers.set('block-impact', this.impact(0.25, 180));
    this.buffers.set('barrier-raise', this.grind(1.2));
    this.buffers.set('ui-tick', this.tick());
    this.buffers.set('ui-open', this.tone([660, 880], 0.35, 0.25));
    this.buffers.set('mirror-turn', this.grind(1.6));
    this.buffers.set('water-loop', this.waterLoop(6));
    this.buffers.set('rumble', this.rumble(2.5));
    this.buffers.set('serpent-hiss', this.hiss(1.8));
    this.buffers.set('symbol-chime', this.tone([523.25, 659.25, 783.99], 1.6, 0.4));
    this.buffers.set('astra-shot', this.shot());
    this.buffers.set('astra-reload', this.reload());
    this.buffers.set('astra-empty', this.tick());
    this.buffers.set('asura-roar', this.roar(1.8));
    this.buffers.set('asura-bolt', this.whoosh(0.5, 300, 1400, 0.7));
    this.buffers.set('asura-hit', this.impact(0.18, 260));
    this.buffers.set('asura-death', this.roar(3.2, true));
    this.buffers.set('heart-lost', this.tone([196, 146.83], 1.4, 0.6));
    this.buffers.set('task-complete', this.tone([392, 523.25, 659.25, 783.99], 2.6, 0.5));
    this.buffers.set('task-begin', this.tone([130.81, 196], 2.2, 0.6));
    this.buffers.set('om-chant-loop', this.omChant(14));
    this.buffers.set('bow-release', this.bowRelease());
    this.buffers.set('chakra-throw', this.chakraThrow());
    this.buffers.set('vajra-burst', this.vajraBurst());
    this.buffers.set('weapon-granted', this.tone([261.63, 392, 523.25, 659.25], 2.0, 0.5));
  }

  /** 16-bit PCM WAV blob URL for Howler. */
  wavUrl(id: SoundId): string {
    const data = this.buffers.get(id);
    if (!data) throw new Error(`SoundBank: unknown sound ${id}`);
    return URL.createObjectURL(new Blob([encodeWav(data, SAMPLE_RATE)], { type: 'audio/wav' }));
  }

  // ---- generators --------------------------------------------------------------------------------

  private noise(n: number): Float32Array {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.rng.next() * 2 - 1;
    return out;
  }

  private footstep(surface: string): Float32Array {
    const dur = surface === 'water' ? 0.42 : surface === 'gravel' ? 0.22 : 0.16;
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    let bp = 0;
    let bpPrev = 0;
    const cutoff = surface === 'wet-stone' ? 0.35 : surface === 'dry-stone' ? 0.28 : surface === 'gravel' ? 0.4 : surface === 'wood' ? 0.12 : surface === 'water' ? 0.3 : 0.1;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      let env = Math.exp(-t * (surface === 'water' ? 6 : 14)) * (1 - Math.exp(-i / 40));
      if (surface === 'gravel') env *= 0.6 + 0.4 * Math.abs(Math.sin(i * 0.9 + this.rng.next()));
      const s = src[i] as number;
      lp += (s - lp) * cutoff;
      const hp = s - lp;
      bp += (hp - bp) * 0.5;
      const val = surface === 'grass' || surface === 'moss' || surface === 'earth' ? lp * 1.6 : surface === 'wood' ? lp * 1.2 + Math.sin(i * 0.06) * Math.exp(-t * 20) * 0.5 : bp * 1.2 + lp * 0.4;
      out[i] = val * env * 0.8;
      bpPrev = bp;
    }
    void bpPrev;
    if (surface === 'wet-stone' || surface === 'water') {
      // Splash tail.
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const s = src[(i * 7) % n] as number;
        out[i] = (out[i] as number) + s * 0.25 * Math.exp(-t * 5) * (t > 0.08 ? 1 : 0) * (surface === 'water' ? 1.6 : 0.5);
      }
    }
    return normalize(out, 0.9);
  }

  private land(hard: number): Float32Array {
    const n = Math.floor(0.35 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((src[i] as number) - lp) * 0.08;
      out[i] = (lp * 2 + Math.sin(i * 0.05 * (1 + hard)) * 0.6 * Math.exp(-t * 18)) * Math.exp(-t * 9) * (0.5 + hard * 0.5);
    }
    return normalize(out, 0.95);
  }

  private bell(near: number): Float32Array {
    const dur = 5;
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const f0 = 196;
    const partials: Array<[number, number, number]> = [
      [1, 1, 1.1],
      [2.02, 0.55, 1.6],
      [2.41, 0.42, 2.0],
      [3.0, 0.3, 2.6],
      [4.47, 0.18, 3.5],
      [5.8, 0.1, 4.2],
    ];
    for (const [ratio, amp, decay] of partials) {
      const f = f0 * ratio * (near > 0.5 ? 1 : 0.998);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        out[i] = (out[i] as number) + Math.sin(2 * Math.PI * f * t) * amp * Math.exp(-t * decay) * (near > 0.5 ? 1 : ratio < 2.5 ? 1 : 0.3);
      }
    }
    // Strike transient.
    const src = this.noise(1200);
    for (let i = 0; i < 1200; i++) out[i] = (out[i] as number) + (src[i] as number) * 0.4 * Math.exp(-i / 150) * near;
    for (let i = 0; i < n; i++) out[i] = (out[i] as number) * (1 - Math.exp(-i / 60));
    return normalize(out, near > 0.5 ? 0.9 : 0.5);
  }

  private whoosh(dur: number, fStart: number, fEnd: number, amp: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let bp = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const f = fStart + (fEnd - fStart) * t;
      const k = Math.min(0.9, (f / SAMPLE_RATE) * 6);
      lp += ((src[i] as number) - lp) * k;
      bp += (lp - bp) * k * 0.5;
      const env = Math.sin(Math.PI * Math.min(1, t * 1.2)) * (1 - t * 0.3);
      out[i] = bp * env * amp * 3;
    }
    return normalize(out, amp);
  }

  private fireLoop(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      lp += ((src[i] as number) - lp) * 0.02;
      lp2 += ((src[i] as number) - lp2) * 0.3;
      let v = lp * 1.4 * (0.6 + 0.4 * Math.sin(i * 0.0003));
      // crackles: sparse impulses through the mid band
      if (this.rng.next() < 0.0025) {
        const len = 200 + this.rng.int(0, 500);
        for (let j = 0; j < len && i + j < n; j++) out[i + j] = (out[i + j] as number) + (src[(i + j * 3) % n] as number) * Math.exp(-j / 90) * 0.7;
      }
      v += (lp2 - lp) * 0.15;
      out[i] = (out[i] as number) + v;
    }
    return normalize(loopCrossfade(out, 0.3), 0.7);
  }

  private windLoop(dur: number, cutoffHz: number, amp: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const gust = 0.55 + 0.45 * Math.sin(t * 0.35 + Math.sin(t * 0.11) * 2);
      const k = (cutoffHz * (0.6 + gust * 0.8)) / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * Math.min(0.5, k * 4);
      lp2 += (lp - lp2) * Math.min(0.5, k * 2);
      out[i] = lp2 * 3 * gust;
    }
    return normalize(loopCrossfade(out, 0.8), amp);
  }

  private cricketsLoop(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const voices = [
      { f: 4100, rate: 19, phase: 0.0, amp: 0.5 },
      { f: 4550, rate: 23, phase: 1.3, amp: 0.35 },
      { f: 3800, rate: 15, phase: 2.9, amp: 0.3 },
    ];
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      for (const c of voices) {
        const pulse = Math.max(0, Math.sin(2 * Math.PI * c.rate * t + c.phase));
        const burst = pulse > 0.75 ? Math.pow((pulse - 0.75) / 0.25, 0.5) : 0;
        const train = Math.sin(t * 0.7 + c.phase) > -0.2 ? 1 : 0; // chirping bouts
        v += Math.sin(2 * Math.PI * c.f * t) * burst * train * c.amp;
      }
      out[i] = v;
    }
    return normalize(loopCrossfade(out, 0.2), 0.35);
  }

  private drip(): Float32Array {
    const n = Math.floor(0.9 * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const f = 1400 * Math.exp(-t * 6) + 520;
      out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * (1 - Math.exp(-i / 30));
    }
    return normalize(out, 0.7);
  }

  /**
   * A chanted "Om": a small chorus of low voices (harmonic-rich glottal buzz through three gliding
   * vowel formants) moving A → U → M with a breath before the next repeat. Loops seamlessly.
   */
  private omChant(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    // Vowel formants (Hz) and relative gains for a low male voice.
    const F = {
      a: { f: [700, 1150, 2600], g: [1, 0.5, 0.22] },
      u: { f: [350, 800, 2400], g: [1, 0.32, 0.12] },
      m: { f: [250, 1000, 2000], g: [1, 0.1, 0.05] },
    };
    // Timeline in seconds: attack, A, glide, U, glide, M hum, release, breath.
    const tA0 = 0.0, tA1 = 2.4, tU0 = 3.4, tU1 = 5.4, tM0 = 6.2, tM1 = 10.4, tEnd = 11.9;
    const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
    const smooth = (k: number): number => k * k * (3 - 2 * k);
    const vowelAt = (t: number): { f: number[]; g: number[]; closed: number } => {
      let k: number;
      if (t < tA1) return { f: F.a.f, g: F.a.g, closed: 0 };
      if (t < tU0) {
        k = smooth((t - tA1) / (tU0 - tA1));
        return { f: F.a.f.map((v, i) => lerp(v, F.u.f[i] as number, k)), g: F.a.g.map((v, i) => lerp(v, F.u.g[i] as number, k)), closed: 0 };
      }
      if (t < tU1) return { f: F.u.f, g: F.u.g, closed: 0 };
      if (t < tM0) {
        k = smooth((t - tU1) / (tM0 - tU1));
        return { f: F.u.f.map((v, i) => lerp(v, F.m.f[i] as number, k)), g: F.u.g.map((v, i) => lerp(v, F.m.g[i] as number, k)), closed: k };
      }
      return { f: F.m.f, g: F.m.g, closed: 1 };
    };
    const envAt = (t: number): number => {
      if (t < tA0 + 0.7) return smooth(Math.max(0, t - tA0) / 0.7);
      if (t < tM1) return 1;
      if (t < tEnd) return 1 - smooth((t - tM1) / (tEnd - tM1));
      return 0;
    };
    interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number; x1: number; x2: number; y1: number; y2: number }
    const bandpass = (): Biquad => ({ b0: 0, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 });
    const setBandpass = (q: Biquad, fc: number, Q: number): void => {
      const w = (2 * Math.PI * Math.min(fc, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
      const alpha = Math.sin(w) / (2 * Q);
      const a0 = 1 + alpha;
      q.b0 = alpha / a0;
      q.b1 = 0;
      q.b2 = -alpha / a0;
      q.a1 = (-2 * Math.cos(w)) / a0;
      q.a2 = (1 - alpha) / a0;
    };
    const tick = (q: Biquad, x: number): number => {
      const y = q.b0 * x + q.b1 * q.x1 + q.b2 * q.x2 - q.a1 * q.y1 - q.a2 * q.y2;
      q.x2 = q.x1;
      q.x1 = x;
      q.y2 = q.y1;
      q.y1 = y;
      return y;
    };
    // Voices: unison around G2 with a soft octave below and a quiet fifth above (a small chorus of chanters).
    const voices = [
      { f0: 98, amp: 1, vib: 5.1, vibDepth: 0.005, drift: 0.3, phase: 0.0 },
      { f0: 98 * 1.006, amp: 0.85, vib: 4.6, vibDepth: 0.006, drift: 1.7, phase: 1.3 },
      { f0: 98 * 0.994, amp: 0.85, vib: 5.6, vibDepth: 0.005, drift: 2.9, phase: 2.1 },
      { f0: 49, amp: 0.55, vib: 4.2, vibDepth: 0.004, drift: 0.9, phase: 0.7 },
      { f0: 147, amp: 0.22, vib: 5.3, vibDepth: 0.006, drift: 2.2, phase: 1.9 },
    ];
    const HARMONICS = 18;
    for (const v of voices) {
      const filters = [bandpass(), bandpass(), bandpass()];
      let ph = v.phase;
      let vowel = vowelAt(0);
      for (let i = 0; i < n; i++) {
        const t = i / SAMPLE_RATE;
        if (i % 64 === 0) {
          vowel = vowelAt(t);
          for (let k = 0; k < 3; k++) setBandpass(filters[k] as Biquad, vowel.f[k] as number, k === 0 ? 7 : 10);
        }
        const env = envAt(t);
        if (env <= 0) continue;
        const vib = 1 + v.vibDepth * Math.sin(2 * Math.PI * v.vib * t + v.phase) + 0.002 * Math.sin(2 * Math.PI * 0.23 * t + v.drift);
        ph += (2 * Math.PI * v.f0 * vib) / SAMPLE_RATE;
        // Glottal-ish buzz: harmonics rolling off ~1/h, softened further when the lips close for "m".
        let src = 0;
        const roll = 1 + vowel.closed * 1.5;
        for (let h = 1; h <= HARMONICS; h++) src += Math.sin(h * ph) / Math.pow(h, roll);
        let y = 0;
        for (let k = 0; k < 3; k++) y += tick(filters[k] as Biquad, src) * (vowel.g[k] as number);
        // The hum keeps a little of the raw fundamental so "m" stays warm rather than thin.
        y = y * 3.2 + Math.sin(ph) * 0.35 * vowel.closed;
        out[i] = (out[i] as number) + y * env * v.amp * (1 - vowel.closed * 0.35);
      }
    }
    // Breath noise at the start of the loop, then a soft clip.
    const breath = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const bEnv = t > tEnd + 0.6 && t < dur ? Math.sin(((t - tEnd - 0.6) / (dur - tEnd - 0.6)) * Math.PI) * 0.05 : 0;
      lp += ((breath[i] as number) - lp) * 0.08;
      out[i] = Math.tanh(((out[i] as number) + lp * bEnv) * 0.9);
    }
    return normalize(loopCrossfade(out, 0.8), 0.6);
  }

  private droneLoop(dur: number, freqs: number[], amp: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      for (let k = 0; k < freqs.length; k++) {
        const f = freqs[k] as number;
        v += Math.sin(2 * Math.PI * f * t + Math.sin(t * 0.3 + k) * 0.6) * (1 / (k + 1));
        v += Math.sin(2 * Math.PI * f * 1.003 * t) * 0.4 * (1 / (k + 1));
      }
      out[i] = v * (0.7 + 0.3 * Math.sin(t * 0.5));
    }
    return normalize(loopCrossfade(out, 1.5), amp);
  }

  private tanpuraLoop(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const f0 = 130.81; // C3-ish sa
    const strings = [f0 * 1.5, f0 * 2, f0 * 2, f0]; // pa sa sa Sa (lower)
    const period = dur / 4;
    for (let s = 0; s < 4; s++) {
      const f = strings[s] as number;
      for (let rep = 0; rep < 2; rep++) {
        const start = Math.floor(((s + rep * 4) * period * 0.5) * SAMPLE_RATE);
        for (let i = 0; i < n - start; i++) {
          const t = i / SAMPLE_RATE;
          const env = Math.exp(-t * 0.55) * (1 - Math.exp(-i / 200));
          let v = 0;
          for (let h = 1; h <= 9; h++) v += Math.sin(2 * Math.PI * f * h * t + Math.sin(t * 2.1 * h) * 0.25) / (h * 1.2) * (0.6 + 0.4 * Math.sin(t * 3 + h));
          out[start + i] = (out[start + i] as number) + v * env * 0.35;
        }
      }
    }
    return normalize(loopCrossfade(out, 1.0), 0.35);
  }

  private grind(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    let rumble = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((src[i] as number) - lp) * 0.05;
      rumble += ((src[(i * 3) % n] as number) - rumble) * 0.006;
      const grit = (src[i] as number) * 0.15 * (0.5 + 0.5 * Math.sin(i * 0.004));
      const env = Math.min(1, t * 8) * (1 - Math.pow(t, 3));
      out[i] = (lp * 1.5 + rumble * 3 + grit) * env;
    }
    return normalize(out, 0.85);
  }

  private shimmer(dur: number, dir: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let k = 0; k < 14; k++) {
      const base = 300 + k * 137;
      const ph = this.rng.range(0, 6);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const f = base * (dir > 0 ? 1 + t * 1.2 : 2.2 - t * 1.2);
        const env = Math.sin(Math.PI * t) * (0.5 + 0.5 * Math.sin(t * 40 + ph));
        out[i] = (out[i] as number) + Math.sin(2 * Math.PI * f * (i / SAMPLE_RATE) + ph) * env / 14;
      }
    }
    return normalize(out, 0.6);
  }

  private crack(): Float32Array {
    const n = Math.floor(1.2 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * 0.12;
      const snap = (src[i] as number) * Math.exp(-t * 60);
      const thump = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 7);
      out[i] = snap * 1.2 + lp * Math.exp(-t * 14) * 0.9 + thump * 0.8;
    }
    return normalize(out, 1);
  }

  private impact(dur: number, f: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[i] = Math.sin(2 * Math.PI * f * t * (1 - t * 0.5)) * Math.exp(-t * 18) + (src[i] as number) * Math.exp(-t * 40) * 0.5;
    }
    return normalize(out, 0.9);
  }

  /** The Astra: a bright crack with a ringing tail — a weapon of light rather than powder. */
  /** Bowstring: a plucked string with a bright transient and the whip of the release. */
  private bowRelease(): Float32Array {
    const n = Math.floor(0.5 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * 0.2;
      const pluck = (Math.sin(2 * Math.PI * 196 * t) * 0.8 + Math.sin(2 * Math.PI * 392 * t) * 0.4 + Math.sin(2 * Math.PI * 588 * t) * 0.2) * Math.exp(-t * 18);
      const whip = lp * Math.exp(-t * 26) * (t < 0.02 ? t / 0.02 : 1) * 0.9;
      const snap = (src[i] as number) * Math.exp(-t * 200) * 0.6;
      out[i] = pluck + whip + snap;
    }
    return normalize(out, 0.85);
  }

  /** The disc leaves the hand: a whoosh with a metallic ring that keeps spinning. */
  private chakraThrow(): Float32Array {
    const n = Math.floor(0.7 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let bp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const f = 700 + t * 1800;
      bp += ((src[i] as number) - bp) * Math.min(0.9, f / SAMPLE_RATE * 4);
      const whoosh = bp * Math.sin(Math.PI * Math.min(1, t / 0.3)) * 0.7;
      const ring = (Math.sin(2 * Math.PI * 1320 * t) + Math.sin(2 * Math.PI * 1980 * t) * 0.6) * Math.exp(-t * 6) * 0.35 * (1 + 0.3 * Math.sin(2 * Math.PI * 28 * t));
      out[i] = whoosh + ring;
    }
    return normalize(out, 0.8);
  }

  /** Thunder burst: a heavy crack, a low thump and a crackling tail. */
  private vajraBurst(): Float32Array {
    const n = Math.floor(0.7 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * 0.25;
      const crack = (src[i] as number) * Math.exp(-t * 60) * 1.4;
      const body = lp * Math.exp(-t * 9) * 0.9;
      const thump = Math.sin(2 * Math.PI * 62 * t) * Math.exp(-t * 14) * 1.1;
      const crackle = (src[(i * 7) % n] as number) * Math.exp(-t * 5) * 0.25 * (Math.random() < 0.08 ? 1 : 0);
      out[i] = crack + body + thump + crackle;
    }
    return normalize(out, 0.98);
  }

  private shot(): Float32Array {
    const n = Math.floor(0.45 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * 0.35;
      const crack = (src[i] as number) * Math.exp(-t * 90) * 1.2 + lp * Math.exp(-t * 22) * 0.8;
      const ring = Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t * 14) * 0.25 + Math.sin(2 * Math.PI * 2640 * t) * Math.exp(-t * 20) * 0.15;
      const thump = Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t * 30) * 0.7;
      out[i] = crack + ring + thump;
    }
    return normalize(out, 0.95);
  }

  private reload(): Float32Array {
    const n = Math.floor(0.9 * SAMPLE_RATE);
    const out = new Float32Array(n);
    const clicks = [0.05, 0.32, 0.6];
    for (const c of clicks) {
      const start = Math.floor(c * SAMPLE_RATE);
      for (let i = 0; i < 900 && start + i < n; i++) {
        const t = i / SAMPLE_RATE;
        out[start + i] = (out[start + i] as number) + (Math.sin(2 * Math.PI * 900 * t) + Math.sin(2 * Math.PI * 1500 * t) * 0.5) * Math.exp(-t * 120) * 0.7 + (this.rng.next() - 0.5) * Math.exp(-t * 200) * 0.4;
      }
    }
    return normalize(out, 0.7);
  }

  /** Asura roar: layered low growl with a formant sweep. */
  private roar(dur: number, dying = false): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / dur / SAMPLE_RATE;
      const f0 = dying ? 70 - t * 30 : 55 + Math.sin(t * Math.PI) * 25;
      const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) * (dying ? 1 - t * 0.5 : 1);
      const growl = (Math.sin(2 * Math.PI * f0 * (i / SAMPLE_RATE)) + 0.6 * Math.sin(2 * Math.PI * f0 * 2.02 * (i / SAMPLE_RATE)) + 0.3 * Math.sin(2 * Math.PI * f0 * 3.1 * (i / SAMPLE_RATE))) * (0.7 + 0.3 * Math.sin(i * 0.002));
      lp += ((src[i] as number) - lp) * (0.05 + t * 0.1);
      out[i] = (growl * 0.8 + lp * 1.5) * env;
    }
    return normalize(out, 0.95);
  }

  private tick(): Float32Array {
    const n = Math.floor(0.05 * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * 1800 * (i / SAMPLE_RATE)) * Math.exp(-i / 60);
    return normalize(out, 0.5);
  }

  private tone(freqs: number[], dur: number, amp: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      let v = 0;
      freqs.forEach((f, k) => {
        const start = k * 0.12;
        if (t < start) return;
        v += Math.sin(2 * Math.PI * f * (t - start)) * Math.exp(-(t - start) * 3.5) * (1 - Math.exp(-(t - start) * 200));
      });
      out[i] = v;
    }
    return normalize(out, amp);
  }

  private waterLoop(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    let bp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      lp += ((src[i] as number) - lp) * 0.04;
      bp += (lp - bp) * 0.2;
      out[i] = (lp - bp) * 4 * (0.6 + 0.4 * Math.sin(t * 1.3) * Math.sin(t * 0.37));
    }
    return normalize(loopCrossfade(out, 0.6), 0.35);
  }

  private rumble(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((src[i] as number) - lp) * 0.01;
      out[i] = lp * 6 * Math.sin(Math.PI * t) + Math.sin(2 * Math.PI * 38 * (i / SAMPLE_RATE)) * 0.3 * Math.sin(Math.PI * t);
    }
    return normalize(out, 0.9);
  }

  private hiss(dur: number): Float32Array {
    const n = Math.floor(dur * SAMPLE_RATE);
    const out = new Float32Array(n);
    const src = this.noise(n);
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const s = src[i] as number;
      hp = 0.96 * (hp + s - prev);
      prev = s;
      out[i] = hp * Math.sin(Math.PI * Math.min(1, t * 1.3)) * (0.6 + 0.4 * Math.sin(t * 60));
    }
    return normalize(out, 0.5);
  }
}

const normalize = (data: Float32Array, peak: number): Float32Array => {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] as number));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] = ((data[i] as number) / max) * peak;
  return data;
};

/** Crossfades the last `seconds` into the head so a loop is seamless. */
const loopCrossfade = (data: Float32Array, seconds: number): Float32Array => {
  const f = Math.floor(seconds * SAMPLE_RATE);
  const n = data.length;
  if (f * 2 >= n) return data;
  const out = new Float32Array(n - f);
  for (let i = 0; i < n - f; i++) {
    if (i < f) {
      const t = i / f;
      out[i] = (data[i] as number) * t + (data[n - f + i] as number) * (1 - t);
    } else out[i] = data[i] as number;
  }
  return out;
};

export const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] as number));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return buffer;
};
