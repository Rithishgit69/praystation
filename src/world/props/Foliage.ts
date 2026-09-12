import * as THREE from 'three';
import type { SeededRandom } from '@/util/random';
import type { MaterialLibrary } from '../Materials';
import { cylinderCollider, type ColliderSpec } from './types';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();

/** Accumulates ivy leaf instances for a zone and bakes them into one InstancedMesh. */
export class IvyBuilder {
  private readonly items: Array<{ p: THREE.Vector3; e: THREE.Euler; s: number; uvIndex: number }> = [];
  constructor(private readonly rng: SeededRandom) {}

  /** Cover a vertical face with clumped ivy: `origin` bottom-centre of the face, `normal` facing out. */
  coverFace(origin: THREE.Vector3, normal: THREE.Vector3, width: number, height: number, density = 1, climb = 0.65): void {
    const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const clumps = Math.max(1, Math.round(width * height * 0.9 * density));
    for (let c = 0; c < clumps; c++) {
      const cu = this.rng.range(-0.5, 0.5) * width;
      const cv = Math.pow(this.rng.next(), 1 / Math.max(0.2, climb)) * height;
      const leaves = this.rng.int(10, 26);
      for (let i = 0; i < leaves; i++) {
        const u = cu + this.rng.gaussian() * 0.22;
        const v = cv + this.rng.gaussian() * 0.3 - Math.abs(this.rng.gaussian()) * 0.25;
        if (v < 0 || v > height || Math.abs(u) > width / 2) continue;
        const p = origin.clone().addScaledVector(tangent, u).addScaledVector(normal, 0.03 + this.rng.range(0, 0.07));
        p.y += v;
        const yaw = Math.atan2(normal.x, normal.z) + this.rng.range(-0.7, 0.7);
        const e = new THREE.Euler(this.rng.range(-0.5, 0.2), yaw, this.rng.range(-0.4, 0.4));
        this.items.push({ p, e, s: this.rng.range(0.09, 0.17), uvIndex: this.rng.int(0, 3) });
      }
    }
  }

  /** Hanging strand of leaves from a point downward. */
  strand(top: THREE.Vector3, length: number, normal: THREE.Vector3): void {
    const n = Math.floor(length * 9);
    for (let i = 0; i < n; i++) {
      const y = -(i / n) * length;
      const p = top.clone().add(new THREE.Vector3(this.rng.range(-0.05, 0.05), y, this.rng.range(-0.05, 0.05))).addScaledVector(normal, 0.05);
      const e = new THREE.Euler(this.rng.range(-0.3, 0.3), Math.atan2(normal.x, normal.z) + this.rng.range(-0.8, 0.8), this.rng.range(-0.3, 0.3));
      this.items.push({ p, e, s: this.rng.range(0.08, 0.15), uvIndex: this.rng.int(0, 3) });
    }
  }

  /** Ground cover patch. */
  patch(center: THREE.Vector3, radius: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * radius;
      const p = new THREE.Vector3(center.x + Math.cos(a) * d, center.y + 0.05, center.z + Math.sin(a) * d);
      const e = new THREE.Euler(-Math.PI / 2 + this.rng.range(-0.5, 0.5), this.rng.range(0, Math.PI * 2), 0);
      this.items.push({ p, e, s: this.rng.range(0.1, 0.2), uvIndex: this.rng.int(0, 3) });
    }
  }

  build(lib: MaterialLibrary): THREE.InstancedMesh | null {
    if (this.items.length === 0) return null;
    const geo = new THREE.PlaneGeometry(1, 1);
    // Each instance samples one of the 4 leaves through a per-instance UV offset attribute.
    const uvOffset = new Float32Array(this.items.length * 2);
    const mesh = new THREE.InstancedMesh(geo, lib.ivy, this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i] as (typeof this.items)[number];
      tmpQ.setFromEuler(it.e);
      tmpS.set(it.s, it.s, it.s);
      tmpM.compose(it.p, tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      uvOffset[i * 2] = (it.uvIndex % 2) * 0.5;
      uvOffset[i * 2 + 1] = Math.floor(it.uvIndex / 2) * 0.5;
    }
    geo.setAttribute('aUvOffset', new THREE.InstancedBufferAttribute(uvOffset, 2));
    // Scale the plane UVs to a quarter of the atlas and add the per-instance offset.
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}

/** Patches the ivy material once so instanced leaves read their atlas quadrant. */
export const patchIvyMaterial = (mat: THREE.MeshStandardMaterial): void => {
  if (mat.userData.patched) return;
  mat.userData.patched = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUvOffset;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = uv * 1.0 + aUvOffset;\n#endif');
  };
  mat.needsUpdate = true;
};

interface TreeInstance {
  matrix: THREE.Matrix4;
}

/**
 * Forest batching: all trunks in one InstancedMesh and all canopy/bush cards in another.
 * A tree is a tapered trunk plus three crossed canopy cards and a top card; bushes are cards only.
 */
export class TreeBuilder {
  private readonly trunks: TreeInstance[] = [];
  private readonly cards: TreeInstance[] = [];
  readonly colliders: ColliderSpec[] = [];
  constructor(private readonly rng: SeededRandom) {}

  tree(x: number, z: number, height: number, yaw: number, canopyScale = 1, baseY = 0): void {
    const s = height / 9;
    this.trunks.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, baseY + height * 0.36, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, height * 0.72, s)) });
    const cs = canopyScale * height * 0.55;
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Euler(this.rng.range(-0.25, 0.25), yaw + (i / 3) * Math.PI + this.rng.range(-0.3, 0.3), 0);
      const p = new THREE.Vector3(x + this.rng.range(-0.3, 0.3), baseY + height * 0.78 + this.rng.range(-0.5, 0.5), z + this.rng.range(-0.3, 0.3));
      this.cards.push({ matrix: new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(cs, cs * 0.85, 1)) });
    }
    const top = new THREE.Euler(-Math.PI / 2 + this.rng.range(-0.3, 0.3), yaw, 0);
    this.cards.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, baseY + height * 0.9, z), new THREE.Quaternion().setFromEuler(top), new THREE.Vector3(cs * 0.9, cs * 0.9, 1)) });
    this.colliders.push(cylinderCollider(new THREE.Vector3(x, baseY + height * 0.36, z), height * 0.36, 0.3 * s, 'wood'));
  }

  bush(x: number, z: number, size: number, y = 0): void {
    for (let i = 0; i < 3; i++) {
      const e = new THREE.Euler(0, (i / 3) * Math.PI + this.rng.range(-0.2, 0.2), 0);
      this.cards.push({ matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y + size * 0.32, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(size, size * 0.8, 1)) });
    }
  }

  build(lib: MaterialLibrary): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    if (this.trunks.length > 0) {
      const geo = new THREE.CylinderGeometry(0.12, 0.32, 1, 6, 1);
      const m = new THREE.InstancedMesh(geo, lib.bark, this.trunks.length);
      this.trunks.forEach((t, i) => m.setMatrixAt(i, t.matrix));
      m.castShadow = true;
      m.receiveShadow = true;
      out.push(m);
    }
    if (this.cards.length > 0) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const m = new THREE.InstancedMesh(geo, lib.canopy, this.cards.length);
      this.cards.forEach((t, i) => m.setMatrixAt(i, t.matrix));
      m.castShadow = false;
      out.push(m);
    }
    return out;
  }
}
