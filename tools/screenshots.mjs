// Captures the store screenshot set (12 × 1920×1080) and the 1024×500 feature graphic from the real build.
// usage: node tools/screenshots.mjs [baseUrl]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
fs.mkdirSync('store/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

const capture = async (viewport, file, query, steps) => {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${base}/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelector('.profiler')?.remove(); });
  await page.waitForTimeout(3500);
  await page.evaluate(() => window.__eka.clearSubtitles?.());
  for (const s of steps) {
    if (s.tp) await page.evaluate((p) => window.__eka.teleport(p[0], p[1], p[2]), s.tp);
    if (s.cam) await page.evaluate((c) => window.__eka.setCamera(c[0], c[1]), s.cam);
    if (s.flags) await page.evaluate((f) => { for (const [k, v] of Object.entries(f)) window.__eka.setFlag(k, v); }, s.flags);
    if (s.shrines) await page.evaluate((ids) => { for (const id of ids) window.__eka.activateShrine(id); }, s.shrines);
    if (s.interact) await page.evaluate(() => window.__eka.interact());
    if (s.key) await page.evaluate((k) => { window.__eka.key(k, true); setTimeout(() => window.__eka.key(k, false), 120); }, s.key);
    if (s.wait) await page.waitForTimeout(s.wait);
  }
  await page.evaluate(() => window.__eka.clearSubtitles?.());
  await page.waitForTimeout(150);
  await page.screenshot({ path: file });
  console.log('wrote', file);
  await page.close();
};

const HD = { width: 1920, height: 1080 };
const only = process.argv[3] ? process.argv[3].split(',') : null;
const shots = [
  ['01-courtyard', 'scene=game&autostart=1&start=courtyard', [{ wait: 1500 }]],
  ['02-forest-approach', 'scene=game&autostart=1', [{ cam: [0.15, 0.1] }, { wait: 1200 }]],
  ['03-temple-gate', 'scene=game&autostart=1&start=gate', [{ tp: [0, 0, 96] }, { cam: [0, 0.05] }, { wait: 1500 }]],
  ['04-hall-of-memories', 'scene=game&autostart=1&start=hall', [{ tp: [4.5, 2.0, -100] }, { cam: [0, 0.2] }, { wait: 1500 }]],
  ['05-the-mural', 'scene=game&autostart=1&start=hall', [{ flags: { 'beat:hall-dais': true, 'diyas:hall': true } }, { tp: [4.5, 2.9, -119.5] }, { cam: [0, 0.02] }, { wait: 1500 }]],
  ['06-memory-gateway', 'scene=game&autostart=1&start=memory-tusk', [{ tp: [2000, 0.2, 14] }, { cam: [0, 0.05] }, { wait: 1800 }]],
  ['07-moon-chamber', 'scene=game&autostart=1&start=moon', [{ flags: { 'puzzle:moon-alignment': true } }, { tp: [110, -1.9, -178] }, { cam: [0, 0.3] }, { wait: 1800 }]],
  ['08-serpent-shrine', 'scene=game&autostart=1&start=tunnels', [{ flags: { 'beat:tunnels-enter': true } }, { tp: [-46, -13.9, -224] }, { cam: [0, 0.1] }, { wait: 1800 }]],
  ['09-library', 'scene=game&autostart=1&start=library', [{ flags: { 'beat:library-enter': true } }, { tp: [-110, -9.9, -114] }, { cam: [0, 0.12] }, { wait: 1800 }]],
  ['10-underground-shrine', 'scene=game&autostart=1&start=shrine', [{ tp: [0, -19.9, -284] }, { cam: [0, 0.12] }, { wait: 1800 }]],
  ['11-sanctum', 'scene=game&autostart=1&start=sanctum', [{ tp: [0, -25.9, -398] }, { cam: [0, 0.02] }, { wait: 1800 }]],
  ['12-map', 'scene=game&autostart=1&start=courtyard', [{ shrines: ['shrine:courtyard', 'shrine:gate', 'shrine:forest'] }, { key: 'KeyM' }, { wait: 1200 }]],
];
for (const [name, query, steps] of shots) if (!only || only.some((o) => name.startsWith(o))) await capture(HD, `store/screenshots/${name}.png`, query, steps);
if (!only) await capture({ width: 1024, height: 500 }, 'store/feature-graphic.png', 'scene=game&autostart=1&start=courtyard', [{ wait: 1500 }]);
await browser.close();
