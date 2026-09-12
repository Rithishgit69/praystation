import { describe, expect, it } from 'vitest';
import { angleDelta, clamp, damp, dampAngle, inverseLerp, smoothstep } from '@/util/math';
import { SeededRandom, hashString } from '@/util/random';
import { Perlin } from '@/util/noise';

describe('math', () => {
  it('clamps and lerps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2, 6);
    expect(dampAngle(0, Math.PI / 2, 1000, 1)).toBeCloseTo(Math.PI / 2, 4);
  });
  it('damp is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 3, 1 / 60);
    const b = damp(0, 1, 3, 1);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('deterministic random', () => {
  it('reproduces the same sequence for the same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('forks independently', () => {
    const a = new SeededRandom(7).fork(1);
    const b = new SeededRandom(7).fork(2);
    expect(a.next()).not.toBe(b.next());
  });
  it('hashes strings stably', () => {
    expect(hashString('c:1,2')).toBe(hashString('c:1,2'));
    expect(hashString('c:1,2')).not.toBe(hashString('c:2,1'));
  });
});

describe('perlin', () => {
  it('is bounded and deterministic', () => {
    const p = new Perlin(3);
    const q = new Perlin(3);
    let max = 0;
    for (let i = 0; i < 500; i++) {
      const v = p.fbm2(i * 0.37, i * 0.11);
      expect(v).toBe(q.fbm2(i * 0.37, i * 0.11));
      max = Math.max(max, Math.abs(v));
    }
    expect(max).toBeLessThanOrEqual(1);
  });
});
