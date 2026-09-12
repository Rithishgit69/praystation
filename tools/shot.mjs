// Headless screenshot + scripted-input harness.
// usage: node tools/shot.mjs <url> <out.png> [script]
//   script: semicolon list of steps: "down:KeyW", "up:KeyW", "wait:1500", "shot:name.png", "eval:<js>"
import { chromium } from '@playwright/test';
import path from 'node:path';

const [, , url, out, script = ''] = process.argv;
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [script]');
  process.exit(1);
}
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 60000 });
if (url.includes('autostart')) await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 20000 });
await page.waitForTimeout(800);
const outDir = path.dirname(out);
for (const step of script.split(';').map((s) => s.trim()).filter(Boolean)) {
  const [cmd, ...rest] = step.split(':');
  const arg = rest.join(':');
  if (cmd === 'down') await page.evaluate((c) => window.__eka.key(c, true), arg);
  else if (cmd === 'up') await page.evaluate((c) => window.__eka.key(c, false), arg);
  else if (cmd === 'wait') await page.waitForTimeout(Number(arg));
  else if (cmd === 'shot') await page.screenshot({ path: path.join(outDir, arg) });
  else if (cmd === 'eval') console.log(JSON.stringify(await page.evaluate(arg)));
  else if (cmd === 'pos') console.log('pos', JSON.stringify(await page.evaluate(() => window.__eka.playerPosition())));
}
await page.screenshot({ path: out });
const stats = await page.evaluate(() => ({ stats: window.__eka.stats(), ema: window.__eka.frameMsEma(), gl: (() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })() }));
console.log(JSON.stringify(stats));
console.log(logs.filter((l) => !l.startsWith('[debug]')).join('\n'));
await browser.close();
