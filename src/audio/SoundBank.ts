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
  | 'symbol-chime';

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
    this.buffers.set('block-impact', this.impact(0.25, 180));
    this.buffers.set('barrier-raise', this.grind(1.2));
    this.buffers.set('ui-tick', this.tick());
    this.buffers.set('ui-open', this.tone([660, 880], 0.35, 0.25));
    this.buffers.set('mirror-turn', this.grind(1.6));
    this.buffers.set('water-loop', this.waterLoop(6));
    this.buffers.set('rumble', this.rumble(2.5));
    this.buffers.set('serpent-hiss', this.hiss(1.8));
    this.buffers.set('symbol-chime', this.tone([523.25, 659.25, 783.99], 1.6, 0.4));
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
