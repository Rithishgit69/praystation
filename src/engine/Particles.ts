import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 color;
varying float vAlpha;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(color * t.rgb, t.a * vAlpha);
}`;

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Age and lifetime in seconds. */
  age: number;
  life: number;
  /** World size in metres at birth; grows by `grow` × per second. */
  size: number;
  grow: number;
  /** Alpha at birth (fades linearly to 0). */
  alpha: number;
  /** Per-second velocity damping and vertical acceleration. */
  drag: number;
  lift: number;
}

/**
 * One draw call for up to `capacity` additive glow particles of one colour (flames, sparks, dust).
 * Replaces the per-sprite approach that cost a draw call per flame and hundreds of overdraw layers.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly live: Particle[] = [];
  private readonly pool: Particle[] = [];

  constructor(map: THREE.Texture, color: number, readonly capacity = 256) {
    this.positions = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, color: { value: new THREE.Color(color) }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  /** Point-size scale: roughly the viewport height in pixels × 0.5 keeps `size` in metres. */
  setViewportHeight(px: number): void {
    this.mat.uniforms.uScale!.value = px * 0.55;
  }

  get count(): number {
    return this.live.length;
  }

  emit(p: Omit<Particle, 'age'>): void {
    if (this.live.length >= this.capacity) return;
    const q = this.pool.pop() ?? ({} as Particle);
    Object.assign(q, p);
    q.age = 0;
    this.live.push(q);
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i] as Particle;
      p.age += dt;
      if (p.age >= p.life) {
        this.pool.push(p);
        this.live.splice(i, 1);
        continue;
      }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of this.live) {
      const k = p.age / p.life;
      this.positions[n * 3] = p.x;
      this.positions[n * 3 + 1] = p.y;
      this.positions[n * 3 + 2] = p.z;
      this.sizes[n] = p.size * (1 + p.grow * p.age);
      this.alphas[n] = p.alpha * (1 - k);
      n++;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }

  clear(): void {
    this.pool.push(...this.live);
    this.live.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
