import * as THREE from 'three';

export type CanvasPainter = (ctx: CanvasRenderingContext2D, size: number) => void;

/** Paints a square canvas and wraps it as a repeating sRGB texture. */
export const makeCanvasTexture = (size: number, paint: CanvasPainter, opts: { srgb?: boolean; repeat?: number; anisotropy?: number } = {}): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  const r = opts.repeat ?? 1;
  tex.repeat.set(r, r);
  tex.anisotropy = opts.anisotropy ?? 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
};

/** Grey-box grid used only in traversal test scenes (never in the shipped world). */
export const gridTexture = (size = 512): THREE.CanvasTexture =>
  makeCanvasTexture(size, (ctx, s) => {
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#5a6272';
    ctx.lineWidth = 2;
    const cells = 4;
    for (let i = 0; i <= cells; i++) {
      const p = (i / cells) * s;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8c95a8';
    ctx.lineWidth = 4;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  });
