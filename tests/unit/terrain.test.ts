import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Terrain } from '@/world/Terrain';

describe('terrain', () => {
  it('is deterministic and flattens the temple plateau', () => {
    const a = new Terrain();
    const b = new Terrain();
    a.flats.push({ min: new THREE.Vector2(-100, -100), max: new THREE.Vector2(100, 100), height: -0.35, margin: 20 });
    b.flats.push({ min: new THREE.Vector2(-100, -100), max: new THREE.Vector2(100, 100), height: -0.35, margin: 20 });
    expect(a.heightAt(0, 0)).toBeCloseTo(-0.35, 5);
    expect(a.heightAt(300, 250)).toBe(b.heightAt(300, 250));
  });
  it('drops into the ravine ring at the world boundary', () => {
    const t = new Terrain();
    const inside = t.heightAt(t.ravineRadius - 30, 0);
    const outside = t.heightAt(t.ravineRadius + 40, 0);
    expect(outside).toBeLessThan(inside - 10);
  });
  it('paths become gravel and flatten to their own height', () => {
    const t = new Terrain();
    const p = t.addPath([new THREE.Vector3(0, 0, 100), new THREE.Vector3(10, 0, 50), new THREE.Vector3(0, 0, 0)], 2.5);
    const pt = p.pointAt(0.5);
    expect(t.surfaceAt(pt.x, pt.z)).toBe('gravel');
    expect(Math.abs(t.heightAt(pt.x, pt.z) - pt.y)).toBeLessThan(0.75);
  });
});
