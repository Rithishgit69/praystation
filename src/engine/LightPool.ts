import * as THREE from 'three';

/**
 * A fixed set of point lights that live in the scene for its whole life. Three.js rebuilds every
 * material's shader program whenever the number of lights changes, which turned each thrown shard,
 * burning patch and fissure burst into a 50–120 ms stall. Transient effects borrow a light from here
 * (intensity 0 while parked) and hand it back, so the light count never changes mid-fight.
 */
export class LightPool {
  private readonly lights: THREE.PointLight[] = [];
  private readonly free: THREE.PointLight[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    readonly size = 12,
  ) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      l.position.set(0, -1000, 0);
      l.name = `pooled-light-${i}`;
      this.lights.push(l);
      this.free.push(l);
      scene.add(l);
    }
  }

  /** Borrow a light, or null when all are in use (effects then simply glow without a light). */
  acquire(color: number, intensity: number, distance: number, decay = 2): THREE.PointLight | null {
    const l = this.free.pop();
    if (!l) return null;
    l.color.set(color);
    l.intensity = intensity;
    l.distance = distance;
    l.decay = decay;
    return l;
  }

  release(l: THREE.PointLight | null): void {
    if (!l || this.free.includes(l)) return;
    l.intensity = 0;
    l.position.set(0, -1000, 0);
    if (l.parent !== this.scene) this.scene.add(l);
    this.free.push(l);
  }

  /** Re-add every pooled light after the scene was cleared (scene change). */
  reattach(): void {
    for (const l of this.lights) if (l.parent !== this.scene) this.scene.add(l);
  }

  get inUse(): number {
    return this.lights.length - this.free.length;
  }
}
