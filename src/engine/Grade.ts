import * as THREE from 'three';
import { clamp, lerp } from '@/util/math';

/** Colour-grade description, baked into a 3D LUT. */
export interface GradeParams {
  /** Multiplied into shadows (lift), midtones (gamma) and highlights (gain). */
  lift: [number, number, number];
  gamma: [number, number, number];
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  /** Colour tint mixed into the darkest tones. */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  tintStrength: number;
}

export const GRADES: Record<'present' | 'memory' | 'corruption', GradeParams> = {
  // Cool blue/silver present-day temple.
  present: {
    lift: [0.0, 0.012, 0.04],
    gamma: [0.99, 1.0, 1.03],
    gain: [0.95, 1.0, 1.06],
    saturation: 0.9,
    contrast: 1.1,
    shadowTint: [0.01, 0.05, 0.1],
    highlightTint: [1.0, 0.98, 0.94],
    tintStrength: 0.4,
  },
  // Warm gold divine memory.
  memory: {
    lift: [0.03, 0.02, 0.0],
    gamma: [1.08, 1.02, 0.9],
    gain: [1.12, 1.02, 0.82],
    saturation: 1.08,
    contrast: 1.0,
    shadowTint: [0.12, 0.07, 0.02],
    highlightTint: [1.0, 0.9, 0.7],
    tintStrength: 0.45,
  },
  // Darker, high-contrast, desaturated corruption with a sickly teal-magenta split.
  corruption: {
    lift: [-0.02, -0.03, -0.02],
    gamma: [0.92, 0.9, 0.95],
    gain: [0.95, 0.9, 0.98],
    saturation: 0.62,
    contrast: 1.32,
    shadowTint: [0.06, 0.0, 0.08],
    highlightTint: [0.8, 1.0, 0.95],
    tintStrength: 0.5,
  },
};

export const LUT_SIZE = 32;

const luma = (r: number, g: number, b: number): number => r * 0.2126 + g * 0.7152 + b * 0.0722;

const applyGrade = (p: GradeParams, r: number, g: number, b: number, out: Float32Array, o: number): void => {
  const ch = (v: number, i: number): number => {
    const lift = p.lift[i] as number;
    const gamma = p.gamma[i] as number;
    const gain = p.gain[i] as number;
    let x = clamp(v * gain + lift * (1 - v), 0, 1);
    x = Math.pow(x, 1 / gamma);
    return x;
  };
  let R = ch(r, 0);
  let G = ch(g, 1);
  let B = ch(b, 2);
  const l = luma(R, G, B);
  R = lerp(l, R, p.saturation);
  G = lerp(l, G, p.saturation);
  B = lerp(l, B, p.saturation);
  const c = p.contrast;
  R = clamp((R - 0.5) * c + 0.5, 0, 1);
  G = clamp((G - 0.5) * c + 0.5, 0, 1);
  B = clamp((B - 0.5) * c + 0.5, 0, 1);
  const l2 = luma(R, G, B);
  const sw = (1 - l2) * (1 - l2) * p.tintStrength;
  const hw = l2 * l2 * p.tintStrength;
  R = clamp(R + p.shadowTint[0] * sw + (p.highlightTint[0] - 1) * hw * R, 0, 1);
  G = clamp(G + p.shadowTint[1] * sw + (p.highlightTint[1] - 1) * hw * G, 0, 1);
  B = clamp(B + p.shadowTint[2] * sw + (p.highlightTint[2] - 1) * hw * B, 0, 1);
  out[o] = R;
  out[o + 1] = G;
  out[o + 2] = B;
  out[o + 3] = 1;
};

/** Bakes a grade into an RGBA float LUT of LUT_SIZE³ texels (r fastest). */
export const bakeLUT = (p: GradeParams): Float32Array => {
  const n = LUT_SIZE;
  const data = new Float32Array(n * n * n * 4);
  let o = 0;
  for (let bi = 0; bi < n; bi++)
    for (let gi = 0; gi < n; gi++)
      for (let ri = 0; ri < n; ri++) {
        applyGrade(p, ri / (n - 1), gi / (n - 1), bi / (n - 1), data, o);
        o += 4;
      }
  return data;
};

/** Holds the three baked grades and a working texture blended between any two of them. */
export class GradeBlender {
  readonly texture: THREE.Data3DTexture;
  private readonly baked: Record<keyof typeof GRADES, Float32Array> = {
    present: bakeLUT(GRADES.present),
    memory: bakeLUT(GRADES.memory),
    corruption: bakeLUT(GRADES.corruption),
  };
  private readonly working: Float32Array;
  private from: keyof typeof GRADES = 'present';
  private to: keyof typeof GRADES = 'present';
  private mix = 0;

  constructor() {
    const n = LUT_SIZE;
    this.working = new Float32Array(this.baked.present);
    this.texture = new THREE.Data3DTexture(this.working, n, n, n);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.FloatType;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.wrapR = THREE.ClampToEdgeWrapping;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
  }

  /** Set the blend endpoints and mix in [0,1]; re-uploads the LUT only when values change. */
  set(from: keyof typeof GRADES, to: keyof typeof GRADES, mix: number): void {
    mix = clamp(mix, 0, 1);
    if (from === this.from && to === this.to && mix === this.mix) return;
    this.from = from;
    this.to = to;
    this.mix = mix;
    const a = this.baked[from];
    const b = this.baked[to];
    const w = this.working;
    if (mix <= 0) w.set(a);
    else if (mix >= 1) w.set(b);
    else for (let i = 0; i < w.length; i++) w[i] = (a[i] as number) + ((b[i] as number) - (a[i] as number)) * mix;
    this.texture.needsUpdate = true;
  }

  get current(): { from: keyof typeof GRADES; to: keyof typeof GRADES; mix: number } {
    return { from: this.from, to: this.to, mix: this.mix };
  }
}
