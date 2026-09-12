import * as THREE from 'three';
import type { MaterialLibrary } from '../Materials';
import { Perlin } from '@/util/noise';
import type { SeededRandom } from '@/util/random';

const mistVert = /* glsl */ `
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = clamp((-mv.z - 4.0) / 18.0, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const mistFrag = /* glsl */ `
uniform sampler2D noiseTex;
uniform float time;
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
varying float vFade;
void main() {
  float n1 = texture2D(noiseTex, vUv * 1.3 + vec2(time * 0.012, time * 0.004)).b;
  float n2 = texture2D(noiseTex, vUv * 2.7 - vec2(time * 0.02, 0.0)).r;
  float n = n1 * 0.65 + n2 * 0.35;
  vec2 c = vUv - 0.5;
  float edge = 1.0 - smoothstep(0.25, 0.5, length(c));
  float a = smoothstep(0.35, 0.75, n) * edge * opacity * vFade;
  gl_FragColor = vec4(color * a, a);
}`;

/** Drifting ground mist cards (additive, fade with distance). */
export class GroundMist {
  readonly group = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly geo: THREE.PlaneGeometry;

  constructor(lib: MaterialLibrary, rng: SeededRandom, placements: Array<{ x: number; y: number; z: number; size: number; opacity?: number }>, color = 0x3f5f8f) {
    this.geo = new THREE.PlaneGeometry(1, 1);
    for (const p of placements) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { noiseTex: { value: lib.noiseTexture }, time: { value: rng.range(0, 100) }, color: { value: new THREE.Color(color) }, opacity: { value: p.opacity ?? 0.22 } },
        vertexShader: mistVert,
        fragmentShader: mistFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rng.range(0, Math.PI * 2);
      mesh.scale.set(p.size, p.size, 1);
      this.mats.push(mat);
      this.group.add(mesh);
    }
  }

  update(dt: number): void {
    for (const m of this.mats) {
      const u = m.uniforms.time;
      if (u) u.value += dt;
    }
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.geo.dispose();
  }
}

const fireflyVert = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float time;
varying float vBlink;
void main() {
  vec3 p = position;
  p.x += sin(time * 0.7 + aPhase * 6.28) * 0.4;
  p.y += sin(time * 0.9 + aPhase * 12.5) * 0.25;
  p.z += cos(time * 0.6 + aPhase * 4.1) * 0.4;
  vBlink = smoothstep(0.55, 1.0, sin(time * 1.7 + aPhase * 40.0) * 0.5 + 0.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (160.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const fireflyFrag = /* glsl */ `
uniform sampler2D glowTex;
varying float vBlink;
void main() {
  float a = texture2D(glowTex, gl_PointCoord).a * vBlink;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.45) * 1.8 * a, a);
}`;

/** Distant firefly-like point lights in the trees. */
export class Fireflies {
  readonly points: THREE.Points;
  private readonly mat: THREE.ShaderMaterial;
  private readonly geo: THREE.BufferGeometry;

  constructor(lib: MaterialLibrary, rng: SeededRandom, count: number, area: { min: THREE.Vector3; max: THREE.Vector3 }) {
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(area.min.x, area.max.x);
      pos[i * 3 + 1] = rng.range(area.min.y, area.max.y);
      pos[i * 3 + 2] = rng.range(area.min.z, area.max.z);
      phase[i] = rng.next();
      size[i] = rng.range(0.05, 0.12);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { glowTex: { value: lib.glowTexture }, time: { value: 0 } }, vertexShader: fireflyVert, fragmentShader: fireflyFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  update(elapsed: number): void {
    const u = this.mat.uniforms.time;
    if (u) u.value = elapsed;
  }

  dispose(): void {
    this.mat.dispose();
    this.geo.dispose();
  }
}

/** Moon + sky fill. The moon is a real directional light whose position is driven by the moon system. */
export class MoonLight {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly noise = new Perlin(5);

  constructor(shadowMapSize: number) {
    this.sun = new THREE.DirectionalLight(0x9ac2f4, 1.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.setShadowExtent(45);
    this.hemi = new THREE.HemisphereLight(0x3a5c90, 0x141a24, 1.1);
  }

  setShadowExtent(e: number): void {
    const c = this.sun.shadow.camera;
    c.left = -e;
    c.right = e;
    c.top = e;
    c.bottom = -e;
    c.updateProjectionMatrix();
  }

  /** Aim the moon: azimuth/elevation in radians, following a focus point so the shadow frustum stays tight. */
  place(azimuth: number, elevation: number, focus: THREE.Vector3, elapsed: number): void {
    const d = 90;
    const dir = new THREE.Vector3(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
    this.sun.position.copy(focus).addScaledVector(dir, d);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    // Slow cloud-drift in moonlight intensity.
    this.sun.intensity = 1.7 + this.noise.noise2(elapsed * 0.05, 2.2) * 0.25;
  }
}

const shaftVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const shaftFrag = /* glsl */ `
uniform sampler2D noiseTex;
uniform float time;
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
varying vec3 vPos;
void main() {
  float n = texture2D(noiseTex, vec2(vUv.x * 2.0 + time * 0.01, vUv.y * 0.6 - time * 0.02)).r;
  float dust = texture2D(noiseTex, vec2(vUv.x * 6.0 - time * 0.03, vUv.y * 3.0 + time * 0.05)).g;
  float vertical = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float a = vertical * (0.55 + n * 0.45) * (0.8 + dust * 0.4) * opacity;
  gl_FragColor = vec4(color * a, a);
}`;

/**
 * Moonlight shaft through a roof opening: an unshadowed spot light, a soft additive volume and a
 * floor pool. Interiors read as "deep shadow cut by moonbeams" (GDD §18).
 */
export class MoonShaft {
  readonly group = new THREE.Group();
  readonly light: THREE.SpotLight;
  private readonly volume: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly seed = Math.random() * 50;

  constructor(lib: MaterialLibrary, x: number, topY: number, floorY: number, z: number, w: number, d: number, dirX = 0.25, dirZ = -0.2) {
    const h = topY - floorY;
    const r = Math.max(w, d) * 0.5;
    this.light = new THREE.SpotLight(0x9ac2f4, 220, h * 1.8, Math.atan((r + 1.5) / h) + 0.12, 0.7, 1.2);
    this.light.position.set(x - dirX * h * 0.5, topY + 1, z - dirZ * h * 0.5);
    this.light.target.position.set(x + dirX * h * 0.5, floorY, z + dirZ * h * 0.5);
    this.group.add(this.light, this.light.target);
    const geo = new THREE.CylinderGeometry(r * 1.35, r * 0.9, h, 18, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { noiseTex: { value: lib.noiseTexture }, time: { value: 0 }, color: { value: new THREE.Color(0x6f95d0) }, opacity: { value: 0.16 } },
      vertexShader: shaftVert,
      fragmentShader: shaftFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.volume = new THREE.Mesh(geo, mat);
    this.volume.position.set(x, floorY + h / 2, z);
    this.volume.rotation.z = -dirX * 0.35;
    this.volume.rotation.x = dirZ * 0.35;
    this.group.add(this.volume);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: lib.glowTexture, color: 0x5f86c4, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + dirX * h * 0.5, floorY + 0.03, z + dirZ * h * 0.5);
    pool.scale.setScalar(r * 3.2);
    this.group.add(pool);
  }

  update(elapsed: number): void {
    const u = this.volume.material.uniforms.time;
    if (u) u.value = elapsed + this.seed;
  }

  dispose(): void {
    this.volume.material.dispose();
    this.volume.geometry.dispose();
  }
}
