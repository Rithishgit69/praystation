import { SeededRandom } from './random';

/** Classic improved Perlin noise (2D/3D) with a seeded permutation table. */
export class Perlin {
  private readonly perm = new Uint8Array(512);

  constructor(seed = 1337) {
    const rng = new SeededRandom(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i] as number;
      p[i] = p[j] as number;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255] as number;
  }

  private static fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private static grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise3(x: number, y: number, z: number): number {
    const P = this.perm;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Perlin.fade(x);
    const v = Perlin.fade(y);
    const w = Perlin.fade(z);
    const A = (P[X] as number) + Y;
    const AA = (P[A] as number) + Z;
    const AB = (P[A + 1] as number) + Z;
    const B = (P[X + 1] as number) + Y;
    const BA = (P[B] as number) + Z;
    const BB = (P[B + 1] as number) + Z;
    const l = (a: number, b: number, t: number): number => a + t * (b - a);
    return l(
      l(
        l(Perlin.grad(P[AA] as number, x, y, z), Perlin.grad(P[BA] as number, x - 1, y, z), u),
        l(Perlin.grad(P[AB] as number, x, y - 1, z), Perlin.grad(P[BB] as number, x - 1, y - 1, z), u),
        v,
      ),
      l(
        l(Perlin.grad(P[AA + 1] as number, x, y, z - 1), Perlin.grad(P[BA + 1] as number, x - 1, y, z - 1), u),
        l(Perlin.grad(P[AB + 1] as number, x, y - 1, z - 1), Perlin.grad(P[BB + 1] as number, x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  noise2(x: number, y: number): number {
    return this.noise3(x, y, 0.5);
  }

  /** Fractal Brownian motion in [-1, 1]. */
  fbm2(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
