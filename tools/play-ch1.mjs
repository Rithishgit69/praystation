// Plays the Prologue → Chapter I vertical slice end-to-end headlessly, screenshotting each beat.
// usage: node tools/play-ch1.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'test-results/ch1';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const shot = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await page.goto(`${base}/?scene=game&autostart=1&start=hall&profiler=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 20000 });
await wait(2500);
log('hall spawn', JSON.stringify(await ev(() => window.__eka.playerPosition())));
await shot('01-hall-spawn');

// Walk to the dais trigger.
await ev(() => window.__eka.teleport(4.5, 2.0, -100));
await wait(1500);
await ev(() => window.__eka.key('KeyW', true));
await wait(3200);
await ev(() => window.__eka.key('KeyW', false));
await wait(1500);
log('after walk', JSON.stringify(await ev(() => window.__eka.playerPosition())), 'flags', JSON.stringify(await ev(() => window.__eka.flags())));
await shot('02-dais');
await wait(9000); // lantern out, diyas light
await shot('03-diyas');
log('flags after diyas', JSON.stringify(await ev(() => window.__eka.flags())));

// Read the inscription.
await ev(() => window.__eka.teleport(-22.5, 2.0, -86));
await ev(() => window.__eka.setCamera(Math.PI / 2, 0.3));
await wait(1200);
await shot('04-inscription');
log('focused', await ev(() => window.__eka.interact()));
await wait(1500);

// Symbol sequence: [2, 0, 3, 1] at x = cx - 6 + i*4 (cx = 4.5), z = -119 on the dais.
for (const i of [2, 0, 3, 1]) {
  await ev((i) => window.__eka.teleport(4.5 - 6 + i * 4, 2.9, -117.5), i);
  await ev(() => window.__eka.setCamera(0, 0.5));
  await wait(700);
  const id = await ev(() => window.__eka.interact());
  log('pressed', id);
  await wait(400);
}
await shot('05-symbols');
log('flags after puzzle', JSON.stringify(await ev(() => window.__eka.flags())));

// Touch the mural.
await ev(() => window.__eka.teleport(4.5, 2.9, -124.5));
await ev(() => window.__eka.setCamera(0, 0.35));
await wait(900);
await shot('06-mural');
log('touch', await ev(() => window.__eka.interact()));
await wait(1800);
await shot('07-veil-rising');
await page.waitForFunction(() => window.__eka.portal?.inMemory() && window.__eka.encounter !== null, null, { timeout: 20000 });
await wait(2800);
await shot('08-memory-arrive');
log('memory pos', JSON.stringify(await ev(() => window.__eka.playerPosition())));

// Survive the pattern: dodge overheads, block sweeps and charges.
const deadline = Date.now() + 120000;
let lastStage = '';
while (Date.now() < deadline) {
  const st = await ev(() => window.__eka.encounter?.());
  if (!st) break;
  const key = `${st.phase}:${st.attackIndex}:${st.stage}`;
  if (key !== lastStage) { log('encounter', JSON.stringify(st)); lastStage = key; }
  if (st.phase === 'final' || st.phase === 'break' || st.phase === 'ended') break;
  if (st.phase === 'pattern' && st.stage === 'telegraph' && st.timer > 0.55) {
    if (st.kind === 'overhead') {
      // Dodge just before the strike lands.
      await wait(Math.max(0, (1.0 - st.timer) * 1000));
      await ev(() => { window.__eka.key('KeyQ', true); setTimeout(() => window.__eka.key('KeyQ', false), 80); });
      await wait(600);
    } else {
      await ev(() => window.__eka.key('KeyF', true));
      await wait(1400);
      await ev(() => window.__eka.key('KeyF', false));
    }
  }
  await wait(60);
}
await shot('09-encounter');
log('final phase', JSON.stringify(await ev(() => window.__eka.encounter?.())));
// Hold: no input through the final blow.
await page.waitForFunction(() => { const s = window.__eka.encounter?.(); return !s || s.phase === 'break' || s.phase === 'ended'; }, null, { timeout: 40000 });
await wait(400);
await shot('10-tusk-break');
await wait(1800);
await shot('11-tusk-fall');
await page.waitForFunction(() => window.__eka.portal?.inMemory() === false, null, { timeout: 40000 });
await wait(1500);
await shot('12-return');
await wait(3500);
await shot('13-passage-opened');
log('flags at end', JSON.stringify(await ev(() => window.__eka.flags())));
log('saved', await ev(() => window.__eka.save()));
const stats = await ev(() => window.__eka.stats());
log('stats', JSON.stringify(stats));
console.log('console errors/warnings:', errors.length ? errors.join('\n') : 'none');
await browser.close();
