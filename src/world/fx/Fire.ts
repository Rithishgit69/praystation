import * as THREE from 'three';
import { Perlin } from '@/util/noise';
import type { MaterialLibrary } from '../Materials';

const flameVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const flameFrag = /* glsl */ `
uniform sampler2D noiseTex;
uniform float time;
uniform float intensity;
uniform vec3 colorCore;
uniform vec3 colorMid;
uniform vec3 colorTip;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  float n1 = texture2D(noiseTex, vec2(uv.x * 0.9, uv.y * 0.6 - time * 0.55)).r;
  float n2 = texture2D(noiseTex, vec2(uv.x * 1.9 + 0.31, uv.y * 1.2 - time * 0.95)).g;
  float n = n1 * 0.6 + n2 * 0.4;
  float xc = (uv.x - 0.5) * 2.0;
  float width = mix(0.8, 0.08, uv.y);
  float wobble = (n - 0.5) * 1.1 * uv.y;
  float shape = 1.0 - smoothstep(width * 0.35, width, abs(xc + wobble));
  float top = 1.0 - smoothstep(0.35, 1.0, uv.y + (n - 0.5) * 0.7);
  float bottom = smoothstep(0.0, 0.1, uv.y);
  float body = shape * top * bottom;
  float heat = clamp(body * (0.55 + n * 0.9), 0.0, 1.0);
  vec3 col = mix(colorTip, colorMid, smoothstep(0.05, 0.5, heat));
  col = mix(col, colorCore, smoothstep(0.55, 1.0, heat));
  gl_FragColor = vec4(col * heat * intensity, heat);
}`;

const emberVert = /* glsl */ `
attribute float aSize;
attribute float aLife;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (180.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const emberFrag = /* glsl */ `
uniform sampler2D glowTex;
varying float vLife;
void main() {
  vec4 t = texture2D(glowTex, gl_PointCoord);
  float a = t.a * (1.0 - vLife) * 0.9;
  gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * 2.2 * a, a);
}`;

export interface FireOptions {
  scale?: number;
  light?: boolean;
  lightIntensity?: number;
  lightDistance?: number;
  shadow?: boolean;
  embers?: number;
}

/**
 * Brazier / torch fire: cylindrical-billboard shader flame, two additive glow sprites, ember points and
 * an optional flickering point light. Far torches use `light: false` and rely on glow cards + cookies.
 */
export class FireEffect {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight | null;
  private readonly flame: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly flame2: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly glowInner: THREE.Sprite;
  private readonly glowOuter: THREE.Sprite;
  private readonly embers: THREE.Points | null;
  private readonly emberState: Float32Array;
  private readonly noise = new Perlin(11);
  private readonly seed = Math.random() * 100;
  private readonly baseIntensity: number;
  private readonly scale: number;
  private readonly worldPos = new THREE.Vector3();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly uTime: THREE.IUniform<number>;
  private readonly uTime2: THREE.IUniform<number>;
  private readonly uIntensity: THREE.IUniform<number>;

  constructor(lib: MaterialLibrary, o: FireOptions = {}) {
    this.scale = o.scale ?? 1;
    const s = this.scale;
    const flameMat = new THREE.ShaderMaterial({
      uniforms: {
        noiseTex: { value: lib.noiseTexture },
        time: { value: 0 },
        intensity: { value: 1.0 },
        colorCore: { value: new THREE.Color(1.0, 0.96, 0.8) },
        colorMid: { value: new THREE.Color(1.0, 0.5, 0.12) },
        colorTip: { value: new THREE.Color(0.7, 0.12, 0.02) },
      },
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.disposables.push(flameMat);
    const flameGeo = new THREE.PlaneGeometry(0.58 * s, 0.95 * s, 1, 1);
    flameGeo.translate(0, 0.5 * s, 0);
    this.disposables.push(flameGeo);
    this.flame = new THREE.Mesh(flameGeo, flameMat);
    this.flame2 = new THREE.Mesh(flameGeo, flameMat.clone());
    const u2 = THREE.UniformsUtils.clone(flameMat.uniforms) as Record<string, THREE.IUniform>;
    this.flame2.material.uniforms = u2;
    const noiseU = u2.noiseTex;
    if (noiseU) noiseU.value = lib.noiseTexture;
    this.uTime = flameMat.uniforms.time as THREE.IUniform<number>;
    this.uIntensity = flameMat.uniforms.intensity as THREE.IUniform<number>;
    this.uTime2 = u2.time as THREE.IUniform<number>;
    this.flame2.scale.set(0.7, 0.8, 1);
    this.flame2.rotation.y = Math.PI / 2;
    this.disposables.push(this.flame2.material);
    this.group.add(this.flame, this.flame2);

    const glowMat = (color: number, opacity: number): THREE.SpriteMaterial => {
      const m = new THREE.SpriteMaterial({ map: lib.glowTexture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      this.disposables.push(m);
      return m;
    };
    this.glowInner = new THREE.Sprite(glowMat(0xff9a4c, 0.22));
    this.glowInner.scale.set(1.1 * s, 1.1 * s, 1);
    this.glowInner.position.y = 0.45 * s;
    this.glowOuter = new THREE.Sprite(glowMat(0xff7a2a, 0.08));
    this.glowOuter.scale.set(4.5 * s, 4.5 * s, 1);
    this.glowOuter.position.y = 0.6 * s;
    this.group.add(this.glowInner, this.glowOuter);

    const emberCount = o.embers ?? 28;
    this.emberState = new Float32Array(emberCount * 4);
    if (emberCount > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(emberCount * 3), 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(emberCount), 1));
      geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(emberCount), 1));
      const mat = new THREE.ShaderMaterial({ uniforms: { glowTex: { value: lib.glowTexture } }, vertexShader: emberVert, fragmentShader: emberFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.disposables.push(geo, mat);
      this.embers = new THREE.Points(geo, mat);
      this.embers.frustumCulled = false;
      this.group.add(this.embers);
      for (let i = 0; i < emberCount; i++) this.resetEmber(i, Math.random());
    } else this.embers = null;

    this.baseIntensity = o.lightIntensity ?? 26;
    if (o.light !== false) {
      this.light = new THREE.PointLight(0xff9040, this.baseIntensity, o.lightDistance ?? 16, 2);
      this.light.position.y = 0.55 * s;
      if (o.shadow) {
        this.light.castShadow = true;
        this.light.shadow.mapSize.set(512, 512);
        this.light.shadow.bias = -0.002;
        this.light.shadow.camera.near = 0.3;
      }
      this.group.add(this.light);
    } else this.light = null;
  }

  private resetEmber(i: number, life = 0): void {
    const s = this.scale;
    this.emberState[i * 4] = (Math.random() - 0.5) * 0.3 * s;
    this.emberState[i * 4 + 1] = Math.random() * 0.2 * s;
    this.emberState[i * 4 + 2] = (Math.random() - 0.5) * 0.3 * s;
    this.emberState[i * 4 + 3] = life;
  }

  update(dt: number, elapsed: number, camera: THREE.Camera): void {
    const t = elapsed + this.seed;
    this.uTime.value = t;
    this.uTime2.value = t * 1.13 + 3.7;
    // Cylindrical billboard toward the camera.
    this.group.getWorldPosition(this.worldPos);
    const yaw = Math.atan2(camera.position.x - this.worldPos.x, camera.position.z - this.worldPos.z);
    this.flame.rotation.y = yaw;
    this.flame2.rotation.y = yaw + Math.PI / 2;
    const flicker = 0.78 + this.noise.noise2(t * 3.1, 0.3) * 0.22 + this.noise.noise2(t * 11.0, 7.1) * 0.08;
    this.uIntensity.value = 0.85 * flicker + 0.25;
    this.glowInner.material.opacity = 0.2 * flicker;
    this.glowOuter.material.opacity = 0.075 * flicker;
    if (this.light) this.light.intensity = this.baseIntensity * (0.85 + flicker * 0.3);
    if (this.embers) {
      const pos = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
      const size = this.embers.geometry.getAttribute('aSize') as THREE.BufferAttribute;
      const life = this.embers.geometry.getAttribute('aLife') as THREE.BufferAttribute;
      const n = pos.count;
      for (let i = 0; i < n; i++) {
        let l = this.emberState[i * 4 + 3] as number;
        l += dt * (0.35 + (i % 5) * 0.08);
        if (l >= 1) {
          this.resetEmber(i);
          l = 0;
        }
        const x = (this.emberState[i * 4] as number) + this.noise.noise2(t * 0.8 + i, 1.3) * 0.25 * l;
        const y = (this.emberState[i * 4 + 1] as number) + l * l * 1.9 * this.scale + l * 0.6;
        const z = (this.emberState[i * 4 + 2] as number) + this.noise.noise2(t * 0.8, i * 0.7) * 0.25 * l;
        this.emberState[i * 4 + 3] = l;
        pos.setXYZ(i, x, y, z);
        size.setX(i, (0.05 + ((i * 7) % 4) * 0.012) * this.scale);
        life.setX(i, l);
      }
      pos.needsUpdate = true;
      size.needsUpdate = true;
      life.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
