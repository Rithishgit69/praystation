import * as THREE from 'three';
import { hash2 } from '@/util/math';

/**
 * Procedural, tileable texture generation on canvas/ImageData. Everything in the shipped world is
 * textured from here (no external assets), so all functions are deterministic.
 */

export interface PBRMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Tileable value noise on an integer lattice with period `period` (in lattice cells). */
export const valueNoise = (x: number, y: number, period: number, seed: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const p = period;
  const h = (ix: number, iy: number): number => hash2((((ix % p) + p) % p) + seed * 17.13, (((iy % p) + p) % p) + seed * 3.71);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

/** Tileable fBm in [0,1]. `u,v` in [0,1). */
export const fbmTile = (u: number, v: number, baseCells: number, octaves: number, seed: number, gain = 0.5): number => {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * cells, v * cells, cells, seed + o * 101);
    norm += amp;
    amp *= gain;
    cells *= 2;
  }
  return sum / norm;
};

export const makeDataTexture = (size: number, data: Uint8ClampedArray, srgb: boolean, repeat = 1): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
};

/** Sobel-style normal map from a height field in [0,1]; `strength` in texels. */
export const normalFromHeight = (size: number, height: Float32Array, strength: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number): number => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)] as number;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      out[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len) * 0.5 * 255 + 127;
      out[o + 3] = 255;
    }
  return out;
};

const packRGB = (out: Uint8ClampedArray, o: number, r: number, g: number, b: number): void => {
  out[o] = r * 255;
  out[o + 1] = g * 255;
  out[o + 2] = b * 255;
  out[o + 3] = 255;
};

interface StoneCell {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tone: number;
  hue: number;
}

/** Irregular flagstone grid: `n` rows; columns vary per row. Returns cells covering the unit square. */
const flagstoneCells = (n: number, seed: number): StoneCell[] => {
  const cells: StoneCell[] = [];
  const rowH = 1 / n;
  for (let r = 0; r < n; r++) {
    const cols = 3 + Math.floor(hash2(r + seed, 1.7) * 3);
    let x = 0;
    for (let c = 0; c < cols; c++) {
      const w = c === cols - 1 ? 1 - x : (1 / cols) * (0.7 + hash2(r * 13 + c + seed, 5.5) * 0.6);
      cells.push({ x0: x, y0: r * rowH, x1: Math.min(1, x + w), y1: (r + 1) * rowH, tone: hash2(r * 7 + c * 3 + seed, 9.1), hue: hash2(r + c * 11 + seed, 2.3) });
      x += w;
      if (x >= 1) break;
    }
  }
  return cells;
};

/** Wet temple flagstones: sandstone greys with moss in the joints, bevelled edges, puddle roughness. */
export const flagstoneTextures = (size = 1024, seed = 3): PBRMaps => {
  const cells = flagstoneCells(6, seed);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const grout = 0.0035;
  const findCell = (u: number, v: number): StoneCell | null => {
    for (const c of cells) if (u >= c.x0 && u < c.x1 && v >= c.y0 && v < c.y1) return c;
    return null;
  };
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const cell = findCell(u, v);
      const o = (y * size + x) * 4;
      const grain = fbmTile(u, v, 24, 3, seed + 7);
      const macro = fbmTile(u, v, 3, 2, seed + 21);
      const puddle = fbmTile(u, v, 2, 3, seed + 33);
      if (!cell) {
        packRGB(albedo, o, 0.045, 0.05, 0.045);
        height[y * size + x] = 0;
        rough[o] = rough[o + 1] = rough[o + 2] = 200;
        rough[o + 3] = 255;
        continue;
      }
      const edge = Math.min(u - cell.x0, cell.x1 - u, v - cell.y0, cell.y1 - v);
      const bevel = Math.min(1, Math.max(0, (edge - grout) / 0.009));
      const chip = fbmTile(u * 1.7, v * 1.3, 40, 2, seed + 9);
      const h = 0.35 + bevel * (0.4 + grain * 0.25) * (chip > 0.86 ? 0.7 : 1);
      height[y * size + x] = h;
      const mossy = (1 - bevel) * 0.55 + (macro < 0.34 ? (0.34 - macro) * 1.6 : 0);
      let r = 0.3 + cell.tone * 0.17 + grain * 0.1 - macro * 0.09;
      let g = 0.29 + cell.tone * 0.16 + grain * 0.1 - macro * 0.08 + cell.hue * 0.02;
      let b = 0.27 + cell.tone * 0.14 + grain * 0.09 - macro * 0.07;
      const m = Math.min(1, mossy);
      r = r * (1 - m) + 0.16 * m;
      g = g * (1 - m) + 0.22 * m;
      b = b * (1 - m) + 0.1 * m;
      const dirt = 1 - (1 - bevel) * 0.45;
      packRGB(albedo, o, r * dirt, g * dirt, b * dirt);
      const wet = puddle < 0.42 ? 1 - Math.max(0, (puddle - 0.3) / 0.12) : 0;
      const rv = (0.62 - wet * 0.45 + grain * 0.15) * bevel + (1 - bevel) * 0.85;
      rough[o] = rough[o + 1] = rough[o + 2] = Math.max(0, Math.min(255, rv * 255));
      rough[o + 3] = 255;
    }
  }
  return {
    map: makeDataTexture(size, albedo, true),
    normalMap: makeDataTexture(size, normalFromHeight(size, height, 1.8), false),
    roughnessMap: makeDataTexture(size, rough, false),
  };
};

/** Sandstone ashlar: sediment banding, pitting, weathering; used on pillars, blocks and walls. */
export const sandstoneTextures = (size = 512, seed = 11, tint: [number, number, number] = [0.41, 0.39, 0.35]): PBRMaps => {
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const o = (y * size + x) * 4;
      const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 6 + fbmTile(u, v, 4, 2, seed) * 4);
      const grain = fbmTile(u, v, 32, 3, seed + 3);
      const pits = fbmTile(u, v, 64, 2, seed + 5);
      const weather = fbmTile(u, v, 2, 3, seed + 8);
      const pit = pits > 0.8 ? (pits - 0.8) * 5 : 0;
      height[y * size + x] = 0.5 + grain * 0.35 - pit * 0.6 + band * 0.05;
      const dark = 1 - weather * 0.32 - pit * 0.35;
      const r = (tint[0] + band * 0.08 + grain * 0.14) * dark;
      const g = (tint[1] + band * 0.06 + grain * 0.12) * dark;
      const b = (tint[2] + band * 0.04 + grain * 0.1) * dark;
      packRGB(albedo, o, r, g, b);
      const rv = 0.72 + grain * 0.2 - weather * 0.1;
      rough[o] = rough[o + 1] = rough[o + 2] = rv * 255;
      rough[o + 3] = 255;
    }
  }
  return {
    map: makeDataTexture(size, albedo, true),
    normalMap: makeDataTexture(size, normalFromHeight(size, height, 3), false),
    roughnessMap: makeDataTexture(size, rough, false),
  };
};

/** Moss / lichen mask used to blend onto stone via vertex or world-space projection. */
export const mossTexture = (size = 256, seed = 17): THREE.Texture => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbmTile(u, v, 6, 4, seed);
      const o = (y * size + x) * 4;
      const m = Math.max(0, (n - 0.45) * 2.2);
      packRGB(data, o, 0.14 + m * 0.08, 0.2 + m * 0.16, 0.08 + m * 0.05);
      data[o + 3] = Math.min(255, m * 255);
    }
  return makeDataTexture(size, data, true);
};

/** Crimson temple banner with a gold ॐ; alpha frays the lower edge. Portrait 1:2. */
export const bannerTexture = (width = 512): { map: THREE.Texture; alphaMap: THREE.Texture } => {
  const height = width * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const weave = fbmTile(u * 2, v, 60, 2, 41) * 0.12;
      const folds = 0.5 + 0.5 * Math.sin(u * Math.PI * 7 + fbmTile(u, v, 2, 2, 43) * 3);
      const stain = fbmTile(u, v * 2, 3, 3, 47);
      const shade = 0.7 + folds * 0.3 - stain * 0.25;
      const o = (y * width + x) * 4;
      d[o] = (0.62 + weave) * shade * 255;
      d[o + 1] = (0.1 + weave * 0.3) * shade * 255;
      d[o + 2] = (0.1 + weave * 0.2) * shade * 255;
      d[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  // Gold border stripes and the glyph.
  ctx.fillStyle = 'rgba(217,179,112,0.55)';
  ctx.fillRect(width * 0.06, 0, width * 0.02, height);
  ctx.fillRect(width * 0.92, 0, width * 0.02, height);
  ctx.font = `600 ${Math.floor(width * 0.62)}px "Noto Serif Devanagari", "Devanagari MT", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = width * 0.02;
  ctx.fillStyle = '#e2b866';
  ctx.fillText('ॐ', width * 0.5, height * 0.22);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(120,70,20,0.35)';
  ctx.fillText('ॐ', width * 0.5 + width * 0.006, height * 0.22 + width * 0.006);
  ctx.fillStyle = '#e2b866';
  ctx.fillText('ॐ', width * 0.5, height * 0.22);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;

  const ac = document.createElement('canvas');
  ac.width = width;
  ac.height = height;
  const actx = ac.getContext('2d');
  if (!actx) throw new Error('2D context unavailable');
  const aimg = actx.createImageData(width, height);
  const ad = aimg.data;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const tear = fbmTile(u, 0.3, 9, 3, 53);
      const hem = 0.86 + tear * 0.12;
      const holes = fbmTile(u, v, 10, 3, 59);
      let a = v < hem ? 1 : 0;
      if (v > hem - 0.08 && holes > 0.68) a = 0;
      if (holes > 0.9 && v > 0.55) a = 0;
      const o = (y * width + x) * 4;
      ad[o] = ad[o + 1] = ad[o + 2] = a * 255;
      ad[o + 3] = 255;
    }
  actx.putImageData(aimg, 0, 0);
  const alphaMap = new THREE.CanvasTexture(ac);
  alphaMap.colorSpace = THREE.NoColorSpace;
  return { map, alphaMap };
};

/** Ivy leaf atlas: 2×2 leaves with alpha. */
export const ivyLeafTexture = (size = 256): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.clearRect(0, 0, size, size);
  const leaf = (cx: number, cy: number, r: number, rot: number, shade: number): void => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, `rgb(${56 * shade},${92 * shade},${46 * shade})`);
    g.addColorStop(1, `rgb(${30 * shade},${58 * shade},${32 * shade})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r * 0.9, -r * 0.7, r * 1.0, r * 0.3, 0, r);
    ctx.bezierCurveTo(-r * 1.0, r * 0.3, -r * 0.9, -r * 0.7, 0, -r);
    ctx.fill();
    ctx.strokeStyle = `rgba(${90 * shade},${120 * shade},${70 * shade},0.5)`;
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(0, r * 0.9);
    for (let i = 0; i < 4; i++) {
      const y = -r * 0.6 + i * r * 0.4;
      ctx.moveTo(0, y);
      ctx.lineTo(r * 0.5, y + r * 0.3);
      ctx.moveTo(0, y);
      ctx.lineTo(-r * 0.5, y + r * 0.3);
    }
    ctx.stroke();
    ctx.restore();
  };
  const q = size / 4;
  leaf(q, q, q * 0.85, 0.1, 1);
  leaf(q * 3, q, q * 0.8, -0.3, 0.85);
  leaf(q, q * 3, q * 0.9, 0.4, 0.95);
  leaf(q * 3, q * 3, q * 0.75, -0.1, 1.1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

/** Tree canopy cluster billboard: soft mass of dark leaves with alpha edges. */
export const canopyTexture = (size = 512, seed = 71): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size - 0.5;
      const v = y / size - 0.5;
      const r = Math.hypot(u, v) * 2;
      const n = fbmTile(x / size, y / size, 5, 4, seed);
      const edge = 1 - r + (n - 0.5) * 0.9;
      const a = Math.max(0, Math.min(1, edge * 3.5));
      const lit = fbmTile(x / size, y / size, 12, 3, seed + 2);
      const o = (y * size + x) * 4;
      d[o] = (34 + lit * 40) * (0.6 + n * 0.6);
      d[o + 1] = (62 + lit * 60) * (0.6 + n * 0.6);
      d[o + 2] = (46 + lit * 34) * (0.6 + n * 0.6);
      d[o + 3] = a * 255;
    }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** Bark. */
export const barkTextures = (size = 256, seed = 83): PBRMaps => {
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const ridges = fbmTile(u * 3, v * 0.5, 12, 3, seed);
      const fine = fbmTile(u, v, 48, 2, seed + 1);
      const o = (y * size + x) * 4;
      height[y * size + x] = ridges * 0.8 + fine * 0.2;
      const sh = 0.35 + ridges * 0.5;
      packRGB(albedo, o, 0.22 * sh + fine * 0.05, 0.18 * sh + fine * 0.04, 0.14 * sh + fine * 0.03);
      rough[o] = rough[o + 1] = rough[o + 2] = 235;
      rough[o + 3] = 255;
    }
  return { map: makeDataTexture(size, albedo, true), normalMap: makeDataTexture(size, normalFromHeight(size, height, 4), false), roughnessMap: makeDataTexture(size, rough, false) };
};

/** Radial glow sprite (additive). */
export const glowSprite = (size = 128, inner = 0.0): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const g = ctx.createRadialGradient(size / 2, size / 2, inner * size, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

/** Tileable RGB noise used by the flame and fog shaders. */
export const noiseTexture = (size = 256, seed = 97): THREE.Texture => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const o = (y * size + x) * 4;
      data[o] = fbmTile(u, v, 8, 4, seed) * 255;
      data[o + 1] = fbmTile(u, v, 16, 3, seed + 5) * 255;
      data[o + 2] = fbmTile(u, v, 4, 4, seed + 9) * 255;
      data[o + 3] = 255;
    }
  const tex = makeDataTexture(size, data, false);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};

/** Scattered dead leaves / debris decal sheet with alpha. */
export const debrisTexture = (size = 512, seed = 131): THREE.Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = hash2(i, seed) * size;
    const y = hash2(i * 3, seed + 1) * size;
    const r = 4 + hash2(i * 7, seed + 2) * 9;
    const rot = hash2(i * 11, seed + 3) * Math.PI;
    const t = hash2(i * 13, seed + 4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = t < 0.5 ? `rgba(${70 + t * 60},${52 + t * 30},${22},0.9)` : `rgba(${40},${58 + t * 20},${28},0.85)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

/** Forest floor: dark earth, leaf litter and grass tufts; vertex colours tint grass/earth/path. */
export const forestFloorTextures = (size = 512, seed = 151): PBRMaps => {
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const o = (y * size + x) * 4;
      const clumps = fbmTile(u, v, 6, 4, seed);
      const blades = fbmTile(u * 3, v * 3, 40, 2, seed + 4);
      const litter = fbmTile(u, v, 24, 3, seed + 9);
      const grass = smoothstepLocal(0.42, 0.62, clumps) * (0.5 + blades * 0.5);
      const leaf = litter > 0.78 ? (litter - 0.78) * 4 : 0;
      height[y * size + x] = 0.4 + grass * 0.35 + leaf * 0.3;
      let r = 0.2 + clumps * 0.1;
      let g = 0.16 + clumps * 0.09;
      let b = 0.11 + clumps * 0.05;
      r = r * (1 - grass) + (0.24 + blades * 0.16) * grass;
      g = g * (1 - grass) + (0.34 + blades * 0.2) * grass;
      b = b * (1 - grass) + (0.14 + blades * 0.08) * grass;
      r = r * (1 - leaf) + 0.38 * leaf;
      g = g * (1 - leaf) + 0.26 * leaf;
      b = b * (1 - leaf) + 0.12 * leaf;
      packRGB(albedo, o, r, g, b);
      rough[o] = rough[o + 1] = rough[o + 2] = (0.85 + blades * 0.1) * 255;
      rough[o + 3] = 255;
    }
  return { map: makeDataTexture(size, albedo, true), normalMap: makeDataTexture(size, normalFromHeight(size, height, 2.5), false), roughnessMap: makeDataTexture(size, rough, false) };
};

const smoothstepLocal = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
