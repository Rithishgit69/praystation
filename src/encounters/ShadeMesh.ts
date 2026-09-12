import * as THREE from 'three';
import type { MaterialLibrary } from '@/world/Materials';
import { Perlin } from '@/util/noise';

const shadeVert = /* glsl */ `
uniform float time;
uniform float turbulence;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vec3 p = position;
  float w = sin(p.y * 3.0 + time * 2.2) * 0.06 + cos(p.x * 4.0 - time * 1.7) * 0.05;
  p.xz += normal.xz * w * turbulence;
  vNormal = normalize(normalMatrix * normal);
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const shadeFrag = /* glsl */ `
uniform float time;
uniform vec3 core;
uniform float opacity;
uniform sampler2D noiseTex;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
  float n = texture2D(noiseTex, vec2(vPos.x * 0.3 + time * 0.05, vPos.y * 0.25 - time * 0.08)).r;
  vec3 col = mix(vec3(0.02, 0.0, 0.05), core, fres * (0.6 + n * 0.6));
  float a = opacity * (0.55 + fres * 0.45) * (0.7 + n * 0.3);
  gl_FragColor = vec4(col, a);
}`;

/**
 * A shade: the fictional corruption's form. A tall wavering silhouette of dark distortion with a
 * violet-teal core and two ember eyes; a supernatural presence, never a creature. Used for the false
 * copies in Chapter II and the Forgetting's shapes in Chapter VI.
 */
export class ShadeMesh {
  readonly root = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  private readonly eyes: THREE.Sprite[] = [];
  private readonly aura: THREE.Points;
  private readonly auraGeo: THREE.BufferGeometry;
  private readonly auraMat: THREE.PointsMaterial;
  private readonly noise = new Perlin(19);
  private readonly seed = Math.random() * 20;
  /** 0..1 how solid the shade looks (false copies fade near light). */
  solidity = 1;

  constructor(lib: MaterialLibrary, height = 2.6) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, turbulence: { value: 1 }, core: { value: new THREE.Color(0x6a3aa8) }, opacity: { value: 0.85 }, noiseTex: { value: lib.noiseTexture } },
      vertexShader: shadeVert,
      fragmentShader: shadeFrag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, height - 0.9, 8, 20), this.material);
    body.position.y = height / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), this.material);
    head.position.y = height + 0.1;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), this.material);
    shoulders.position.y = height * 0.72;
    shoulders.scale.set(1.4, 0.5, 0.9);
    this.root.add(body, head, shoulders);
    const eyeMat = new THREE.SpriteMaterial({ map: lib.glowTexture, color: 0xff9a4c, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const x of [-0.11, 0.11]) {
      const e = new THREE.Sprite(eyeMat);
      e.scale.set(0.18, 0.18, 1);
      e.position.set(x, height + 0.14, 0.28);
      this.eyes.push(e);
      this.root.add(e);
    }
    const n = 60;
    this.auraGeo = new THREE.BufferGeometry();
    this.auraGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.auraMat = new THREE.PointsMaterial({ map: lib.glowTexture, color: 0x9a6ad8, size: 0.14, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    this.aura = new THREE.Points(this.auraGeo, this.auraMat);
    this.aura.frustumCulled = false;
    this.root.add(this.aura);
  }

  setCore(color: number): void {
    (this.material.uniforms.core as THREE.IUniform<THREE.Color>).value.set(color);
    this.auraMat.color.set(color);
  }

  update(dt: number, elapsed: number): void {
    const t = elapsed + this.seed;
    (this.material.uniforms.time as THREE.IUniform<number>).value = t;
    (this.material.uniforms.opacity as THREE.IUniform<number>).value = 0.85 * this.solidity;
    (this.material.uniforms.turbulence as THREE.IUniform<number>).value = 1 + (1 - this.solidity) * 3;
    for (const e of this.eyes) e.material.opacity = 0.95 * this.solidity;
    this.auraMat.opacity = 0.6 * this.solidity;
    const pos = this.auraGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const a = i * 0.7 + t * 0.6;
      const r = 0.5 + this.noise.noise2(i, t * 0.5) * 0.4;
      pos.setXYZ(i, Math.cos(a) * r, ((i / pos.count + t * 0.12) % 1) * 3.2, Math.sin(a) * r);
    }
    pos.needsUpdate = true;
    void dt;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.material.dispose();
    this.auraGeo.dispose();
    this.auraMat.dispose();
    const eye = this.eyes[0];
    if (eye) eye.material.dispose();
  }
}
