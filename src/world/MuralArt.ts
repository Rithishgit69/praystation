import * as THREE from 'three';
import { SeededRandom } from '@/util/random';
import { fbmTile } from './TextureGen';

export type MuralScene = 'broken-tusk' | 'scribe' | 'moon' | 'serpent' | 'remembrance';

export interface MuralMaps {
  map: THREE.Texture;
  emissiveMap: THREE.Texture;
}

const PIGMENT = { ground: '#8a5a3a', red: '#7a2418', ochre: '#c98a3c', gold: '#d9b370', dark: '#2a1a12', cream: '#e8dcc0' };

/**
 * Procedural temple murals: faded fresco pigments on plaster, a lotus-petal border, stylised figures drawn
 * as dignified silhouettes (never caricature), cracks and flaked patches. The emissive map holds only the
 * figures so a waking mural glows from within (GDD §14 "first mural = wonder").
 */
export const muralTextures = (scene: MuralScene, width = 1024, height = 512, seed = 5): MuralMaps => {
  const rng = new SeededRandom(seed);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  // Plaster ground with pigment mottling.
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const n = fbmTile(u, v, 5, 4, seed);
      const grain = fbmTile(u * 2, v * 2, 40, 2, seed + 3);
      const o = (y * width + x) * 4;
      d[o] = (0.46 + n * 0.16 + grain * 0.06) * 255;
      d[o + 1] = (0.32 + n * 0.12 + grain * 0.05) * 255;
      d[o + 2] = (0.2 + n * 0.08 + grain * 0.04) * 255;
      d[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);

  const figures = document.createElement('canvas');
  figures.width = width;
  figures.height = height;
  const fctx = figures.getContext('2d');
  if (!fctx) throw new Error('2D context unavailable');

  const drawBorder = (c: CanvasRenderingContext2D): void => {
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 10;
    c.strokeRect(28, 28, width - 56, height - 56);
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 3;
    c.strokeRect(44, 44, width - 88, height - 88);
    // Lotus petals along the top and bottom.
    c.fillStyle = PIGMENT.ochre;
    for (let x = 60; x < width - 60; x += 34) {
      for (const y of [12, height - 12]) {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 9, y - (y < 100 ? -14 : 14), x + 17, y);
        c.quadraticCurveTo(x + 9, y + (y < 100 ? -6 : 6), x, y);
        c.fill();
      }
    }
  };

  /** Seated elephant-headed figure in profile, facing +x, one tusk. Dignified, monumental. */
  const drawGanesha = (c: CanvasRenderingContext2D, cx: number, cy: number, s: number): void => {
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    c.fillStyle = PIGMENT.gold;
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 3;
    // Seat / lotus.
    c.beginPath();
    c.ellipse(0, 78, 76, 16, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Body (seated).
    c.beginPath();
    c.ellipse(0, 30, 58, 50, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Head.
    c.beginPath();
    c.ellipse(4, -46, 40, 36, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Ear (large, fan-like).
    c.beginPath();
    c.ellipse(-30, -44, 20, 30, -0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    // Trunk curving down and to the right.
    c.beginPath();
    c.moveTo(30, -36);
    c.quadraticCurveTo(70, -26, 62, 10);
    c.quadraticCurveTo(58, 34, 34, 30);
    c.quadraticCurveTo(50, 20, 48, 6);
    c.quadraticCurveTo(52, -16, 26, -18);
    c.closePath();
    c.fill();
    c.stroke();
    // The single tusk (left intact).
    c.fillStyle = PIGMENT.cream;
    c.beginPath();
    c.moveTo(22, -20);
    c.quadraticCurveTo(48, -12, 60, -30);
    c.quadraticCurveTo(44, -18, 22, -28);
    c.closePath();
    c.fill();
    c.stroke();
    // Crown ring and raised right palm.
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 5;
    c.beginPath();
    c.arc(4, -86, 22, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.fillStyle = PIGMENT.gold;
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(70, -6, 12, 16, 0.2, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  };

  /** Standing warrior with a raised axe, facing -x. */
  const drawWarrior = (c: CanvasRenderingContext2D, cx: number, cy: number, s: number): void => {
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    c.fillStyle = PIGMENT.red;
    c.strokeStyle = PIGMENT.dark;
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, 30, 26, 60, 0, 0, Math.PI * 2); // body
    c.fill();
    c.beginPath();
    c.arc(0, -50, 20, 0, Math.PI * 2); // head
    c.fill();
    c.beginPath();
    c.arc(4, -72, 9, 0, Math.PI * 2); // topknot
    c.fill();
    // Arm raised with axe.
    c.lineWidth = 12;
    c.strokeStyle = PIGMENT.red;
    c.beginPath();
    c.moveTo(-14, 0);
    c.lineTo(-52, -70);
    c.stroke();
    c.strokeStyle = PIGMENT.dark;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-52, -70);
    c.lineTo(-92, -128);
    c.stroke();
    c.fillStyle = PIGMENT.cream;
    c.beginPath(); // crescent axe head
    c.moveTo(-98, -134);
    c.quadraticCurveTo(-70, -150, -74, -108);
    c.quadraticCurveTo(-84, -118, -98, -134);
    c.fill();
    c.stroke();
    c.restore();
  };

  const drawGateway = (c: CanvasRenderingContext2D, cx: number, cy: number, s: number): void => {
    c.save();
    c.translate(cx, cy);
    c.scale(s, s);
    c.fillStyle = PIGMENT.ochre;
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 3;
    for (const x of [-70, 50]) {
      c.fillRect(x, -120, 22, 170);
      c.strokeRect(x, -120, 22, 170);
    }
    c.fillRect(-84, -138, 168, 22);
    c.strokeRect(-84, -138, 168, 22);
    // Mountain peaks behind.
    c.fillStyle = PIGMENT.dark;
    c.beginPath();
    c.moveTo(-160, 60);
    c.lineTo(-90, -60);
    c.lineTo(-30, 20);
    c.lineTo(30, -80);
    c.lineTo(100, 10);
    c.lineTo(160, 60);
    c.closePath();
    c.globalAlpha = 0.35;
    c.fill();
    c.globalAlpha = 1;
    c.restore();
  };

  const drawScribe = (c: CanvasRenderingContext2D): void => {
    drawGanesha(c, width * 0.36, height * 0.52, 1.3);
    // Palm-leaf manuscript and stylus.
    c.fillStyle = PIGMENT.cream;
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 3;
    c.fillRect(width * 0.46, height * 0.62, 150, 34);
    c.strokeRect(width * 0.46, height * 0.62, 150, 34);
    c.strokeStyle = PIGMENT.dark;
    c.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(width * 0.47, height * 0.62 + 8 + i * 7);
      c.lineTo(width * 0.46 + 140, height * 0.62 + 8 + i * 7);
      c.stroke();
    }
    // The sage seated at the right, dictating.
    c.fillStyle = PIGMENT.red;
    c.beginPath();
    c.ellipse(width * 0.74, height * 0.6, 40, 62, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(width * 0.74, height * 0.38, 24, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(width * 0.66 - i * 14, height * 0.42, 6 + i * 4, Math.PI * 0.2, Math.PI * 1.2);
      c.stroke();
    }
  };

  const drawMoon = (c: CanvasRenderingContext2D): void => {
    drawGanesha(c, width * 0.36, height * 0.56, 1.25);
    c.fillStyle = PIGMENT.cream;
    c.beginPath();
    c.arc(width * 0.74, height * 0.34, 70, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8a5a3a';
    c.beginPath();
    c.arc(width * 0.77, height * 0.31, 58, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(width * 0.74 + Math.cos(a) * 80, height * 0.34 + Math.sin(a) * 80);
      c.lineTo(width * 0.74 + Math.cos(a) * 96, height * 0.34 + Math.sin(a) * 96);
      c.stroke();
    }
  };

  const drawSerpent = (c: CanvasRenderingContext2D): void => {
    c.strokeStyle = PIGMENT.ochre;
    c.lineWidth = 26;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = width * 0.12 + t * width * 0.76;
      const y = height * 0.5 + Math.sin(t * Math.PI * 3) * height * 0.22;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
    c.strokeStyle = PIGMENT.red;
    c.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const x = width * 0.12 + t * width * 0.76;
      const y = height * 0.5 + Math.sin(t * Math.PI * 3) * height * 0.22;
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.stroke();
    }
    c.fillStyle = PIGMENT.ochre;
    c.beginPath();
    c.ellipse(width * 0.88, height * 0.5, 34, 22, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  };

  const drawRemembrance = (c: CanvasRenderingContext2D): void => {
    drawGanesha(c, width * 0.5, height * 0.56, 1.5);
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 6;
    c.beginPath();
    c.arc(width * 0.5, height * 0.5, 190, Math.PI * 0.15, Math.PI * 1.85);
    c.stroke();
  };

  drawBorder(ctx);
  const paint = (c: CanvasRenderingContext2D): void => {
    switch (scene) {
      case 'broken-tusk':
        drawGateway(c, width * 0.5, height * 0.62, 1.1);
        drawGanesha(c, width * 0.3, height * 0.56, 1.25);
        drawWarrior(c, width * 0.74, height * 0.56, 1.15);
        break;
      case 'scribe':
        drawScribe(c);
        break;
      case 'moon':
        drawMoon(c);
        break;
      case 'serpent':
        drawSerpent(c);
        break;
      case 'remembrance':
        drawRemembrance(c);
        break;
    }
  };
  paint(ctx);
  paint(fctx);
  // The hidden symbol (broken circle) shared by every chapter, small, in a corner.
  for (const c of [ctx, fctx]) {
    c.strokeStyle = PIGMENT.gold;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(width - 90, height - 84, 18, Math.PI * 0.25, Math.PI * 1.75);
    c.stroke();
  }
  // Damage: cracks and flaked plaster (only on the albedo; the emissive keeps the figures whole so they
  // "come alive" through the damage).
  ctx.strokeStyle = 'rgba(30,18,12,0.85)';
  for (let i = 0; i < 9; i++) {
    ctx.lineWidth = rng.range(1, 3);
    ctx.beginPath();
    let x = rng.range(0, width);
    let y = rng.range(0, height);
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += rng.range(-40, 40);
      y += rng.range(-30, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const flakes = scene === 'broken-tusk' ? 12 : 8;
  for (let i = 0; i < flakes; i++) {
    // Flakes cluster near the edges so the figures stay legible.
    const edge = rng.chance(0.5);
    const fx = edge ? rng.pick([rng.range(60, width * 0.2), rng.range(width * 0.8, width - 60)]) : rng.range(60, width - 60);
    const fy = edge ? rng.range(60, height - 60) : rng.pick([rng.range(60, height * 0.22), rng.range(height * 0.78, height - 60)]);
    const r = rng.range(16, 56);
    ctx.fillStyle = `rgba(${176 + rng.int(0, 24)},${150 + rng.int(0, 20)},${118 + rng.int(0, 20)},0.96)`;
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = r * (0.6 + rng.next() * 0.6);
      const px = fx + Math.cos(a) * rr;
      const py = fy + Math.sin(a) * rr * 0.7;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,36,24,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Overall fading and grime.
  const fade = ctx.createImageData(width, height);
  const src = ctx.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const g = fbmTile(x / width, y / height, 3, 3, seed + 11);
      const k = 0.62 + g * 0.42;
      fade.data[o] = (src.data[o] as number) * k;
      fade.data[o + 1] = (src.data[o + 1] as number) * k;
      fade.data[o + 2] = (src.data[o + 2] as number) * k;
      fade.data[o + 3] = 255;
    }
  ctx.putImageData(fade, 0, 0);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(figures);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
};

export type Glyph = 'tusk' | 'lamp' | 'moon' | 'axe' | 'broken-circle' | 'circle' | 'serpent' | 'scroll' | 'mirror' | 'corrupt' | 'lotus';

const glyphCache = new Map<Glyph, THREE.Texture>();

/** Carved-symbol decal (gold on transparent) used on symbol stones, seals and wall marks. */
export const glyphTexture = (glyph: Glyph, size = 128): THREE.Texture => {
  const cached = glyphCache.get(glyph);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D context unavailable');
  c.clearRect(0, 0, size, size);
  c.strokeStyle = '#ffd98a';
  c.fillStyle = '#ffd98a';
  c.lineWidth = size * 0.07;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const s = size;
  c.beginPath();
  switch (glyph) {
    case 'tusk':
      c.moveTo(s * 0.25, s * 0.7);
      c.quadraticCurveTo(s * 0.5, s * 0.75, s * 0.75, s * 0.3);
      c.quadraticCurveTo(s * 0.55, s * 0.5, s * 0.25, s * 0.7);
      c.closePath();
      c.fill();
      break;
    case 'lamp':
      c.moveTo(s * 0.25, s * 0.6);
      c.quadraticCurveTo(s * 0.5, s * 0.85, s * 0.75, s * 0.6);
      c.lineTo(s * 0.25, s * 0.6);
      c.closePath();
      c.fill();
      c.beginPath();
      c.ellipse(s * 0.5, s * 0.42, s * 0.07, s * 0.14, 0, 0, Math.PI * 2);
      c.fill();
      break;
    case 'moon':
      c.arc(s * 0.5, s * 0.5, s * 0.28, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.arc(s * 0.62, s * 0.44, s * 0.24, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'source-over';
      break;
    case 'axe':
      c.moveTo(s * 0.3, s * 0.78);
      c.lineTo(s * 0.62, s * 0.34);
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.56, s * 0.2);
      c.quadraticCurveTo(s * 0.85, s * 0.3, s * 0.72, s * 0.52);
      c.quadraticCurveTo(s * 0.64, s * 0.36, s * 0.56, s * 0.2);
      c.closePath();
      c.fill();
      break;
    case 'broken-circle':
      c.arc(s * 0.5, s * 0.5, s * 0.28, Math.PI * 0.2, Math.PI * 1.8);
      c.stroke();
      break;
    case 'circle':
      c.arc(s * 0.5, s * 0.5, s * 0.28, 0, Math.PI * 2);
      c.stroke();
      break;
    case 'serpent':
      c.moveTo(s * 0.2, s * 0.65);
      c.bezierCurveTo(s * 0.3, s * 0.2, s * 0.5, s * 0.9, s * 0.62, s * 0.4);
      c.bezierCurveTo(s * 0.7, s * 0.2, s * 0.8, s * 0.4, s * 0.8, s * 0.3);
      c.stroke();
      break;
    case 'scroll':
      c.rect(s * 0.28, s * 0.28, s * 0.44, s * 0.44);
      c.stroke();
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(s * 0.36, s * 0.4 + i * s * 0.1);
        c.lineTo(s * 0.64, s * 0.4 + i * s * 0.1);
        c.stroke();
      }
      break;
    case 'mirror':
      c.moveTo(s * 0.3, s * 0.3);
      c.lineTo(s * 0.7, s * 0.7);
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.5, s * 0.2);
      c.lineTo(s * 0.5, s * 0.8);
      c.stroke();
      break;
    case 'corrupt':
      c.strokeStyle = '#b06cff';
      c.arc(s * 0.5, s * 0.5, s * 0.28, Math.PI * 0.2, Math.PI * 1.8);
      c.stroke();
      c.beginPath();
      c.moveTo(s * 0.3, s * 0.3);
      c.lineTo(s * 0.7, s * 0.7);
      c.moveTo(s * 0.7, s * 0.3);
      c.lineTo(s * 0.3, s * 0.7);
      c.stroke();
      break;
    case 'lotus':
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        c.beginPath();
        c.moveTo(s * 0.5, s * 0.72);
        c.quadraticCurveTo(s * 0.5 + Math.cos(a - 0.3) * s * 0.3, s * 0.72 + Math.sin(a - 0.3) * s * 0.3, s * 0.5 + Math.cos(a) * s * 0.38, s * 0.72 + Math.sin(a) * s * 0.38);
        c.quadraticCurveTo(s * 0.5 + Math.cos(a + 0.3) * s * 0.3, s * 0.72 + Math.sin(a + 0.3) * s * 0.3, s * 0.5, s * 0.72);
        c.fill();
      }
      break;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  glyphCache.set(glyph, tex);
  return tex;
};

/** Emissive glyph decal mesh (unlit, additive) sized `size` metres; returns the mesh with its own material. */
export const glyphDecal = (glyph: Glyph, size: number, color = 0xffd98a, opacity = 0.9): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> => {
  const mat = new THREE.MeshBasicMaterial({ map: glyphTexture(glyph), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  return mesh;
};
