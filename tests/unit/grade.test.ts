import { describe, expect, it } from 'vitest';
import { GRADES, LUT_SIZE, bakeLUT } from '@/engine/Grade';

describe('grade LUTs', () => {
  it('bake to full-range, in-bounds RGBA data', () => {
    for (const key of Object.keys(GRADES) as Array<keyof typeof GRADES>) {
      const lut = bakeLUT(GRADES[key]);
      expect(lut.length).toBe(LUT_SIZE ** 3 * 4);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < lut.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = lut[i + c] as number;
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
        expect(lut[i + 3]).toBe(1);
      }
      expect(min).toBeLessThan(0.1);
      expect(max).toBeGreaterThan(0.9);
    }
  });
  it('memory grade is warmer than present', () => {
    const p = bakeLUT(GRADES.present);
    const m = bakeLUT(GRADES.memory);
    // Sample mid grey.
    const mid = Math.floor(LUT_SIZE / 2);
    const o = ((mid * LUT_SIZE + mid) * LUT_SIZE + mid) * 4;
    const warmth = (a: Float32Array): number => (a[o] as number) - (a[o + 2] as number);
    expect(warmth(m)).toBeGreaterThan(warmth(p));
  });
});
