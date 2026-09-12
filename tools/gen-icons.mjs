// Generates the app icons (PWA, Android adaptive, iOS) with pngjs: deep-blue ground, the game's mark
// (a gold circle broken on one side — the remembrance symbol) and a silver crescent moon inside it.
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function render(size, { maskable = false, transparentBg = false } = {}) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  const pad = maskable ? 0.8 : 1.0; // maskable: keep the mark inside the safe zone
  const R = size * 0.34 * pad;
  const thick = size * 0.052 * pad;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c;
    const d = Math.hypot(dx, dy);
    // Background: radial deep blue; rounded square unless maskable (full bleed).
    const t = Math.min(1, d / (size * 0.72));
    let r = mix(0.10, 0.043, t) * 255, g = mix(0.16, 0.07, t) * 255, b = mix(0.28, 0.125, t) * 255, a = 255;
    if (!maskable && !transparentBg) {
      const rad = size * 0.22;
      const qx = Math.abs(dx) - (c - rad), qy = Math.abs(dy) - (c - rad);
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
      a = 255 * (1 - smooth(-1, 1, sd));
    }
    if (transparentBg) a = 0;
    // Broken gold ring: gap between 25° and 70° (top-right), soft ends.
    const ang = (Math.atan2(-dy, dx) * 180) / Math.PI; // 0 = right, 90 = up
    const inGap = ang > 25 && ang < 70;
    const ringSd = Math.abs(d - R) - thick / 2;
    let ring = 1 - smooth(-1, 1, ringSd);
    if (inGap) ring = 0;
    else if (ang >= 70 && ang < 76) ring *= smooth(70, 76, ang);
    else if (ang <= 25 && ang > 19) ring *= smooth(25, 19, ang);
    // Crescent moon inside: disc minus offset disc.
    const mr = R * 0.5;
    const mSd = Math.hypot(dx + R * 0.06, dy) - mr;
    const cutSd = Math.hypot(dx + R * 0.2, dy - R * 0.08) - mr * 0.92;
    const moon = (1 - smooth(-1, 1, mSd)) * smooth(-1, 1, cutSd);
    // Glow around the ring.
    const glow = Math.exp(-Math.abs(d - R) / (size * 0.05)) * 0.35;
    const gold = [217, 179, 112], silver = [214, 224, 240];
    r = mix(r, gold[0], Math.min(1, glow)); g = mix(g, gold[1], Math.min(1, glow) * 0.8); b = mix(b, gold[2], Math.min(1, glow) * 0.6);
    r = mix(r, silver[0], moon); g = mix(g, silver[1], moon); b = mix(b, silver[2], moon);
    r = mix(r, gold[0], ring); g = mix(g, gold[1], ring); b = mix(b, gold[2], ring);
    const i = (y * size + x) * 4;
    const cover = Math.max(a / 255, ring, moon);
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = transparentBg ? 255 * Math.max(ring, moon) : 255 * cover;
  }
  return PNG.sync.write(png);
}

const out = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); console.log('wrote', file); };
out('public/icons/icon-192.png', render(192));
out('public/icons/icon-512.png', render(512));
out('public/icons/icon-512-maskable.png', render(512, { maskable: true }));
out('public/favicon.png', render(64));
// Store / native sizes.
out('store/icons/icon-1024.png', render(1024, { maskable: true }));
for (const s of [48, 72, 96, 144, 192]) out(`store/icons/android-${s}.png`, render(s, { maskable: true }));
out('store/icons/adaptive-foreground-432.png', render(432, { transparentBg: true }));
for (const s of [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]) out(`store/icons/ios-${s}.png`, render(s, { maskable: true }));

// Splash screens: full-bleed dark ground with the mark, used by both native launch screens.
const splash = render(1024, { maskable: true });
for (const d of ['drawable', 'drawable-land-hdpi', 'drawable-land-mdpi', 'drawable-land-xhdpi', 'drawable-land-xxhdpi', 'drawable-land-xxxhdpi', 'drawable-port-hdpi', 'drawable-port-mdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi']) {
  const f = `android/app/src/main/res/${d}/splash.png`;
  if (fs.existsSync(path.dirname(f))) out(f, splash);
}
const iosSplash = 'ios/App/App/Assets.xcassets/Splash.imageset';
if (fs.existsSync(iosSplash)) {
  const big = render(2732, { maskable: true });
  for (const f of fs.readdirSync(iosSplash)) if (f.endsWith('.png')) out(path.join(iosSplash, f), big);
}
out('store/splash-1024.png', splash);
