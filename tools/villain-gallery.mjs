// Portrait of every villain at the start of its battle (camera in front, framed on the body).
//   usage: node tools/villain-gallery.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/villains';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
for (const task of [1, 2, 3, 4, 5]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[t${task}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[t${task} pageerror] ${e.message}`));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`${base}/?scene=game&help=0&task=${task}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
  await page.waitForTimeout(2800); // the asura has risen
  await ev(() => window.__eka.missionSkipNarration());
  await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
  await ev(() => window.__eka.missionHold(30));
  await page.waitForTimeout(4600); // banners gone
  await ev(() => window.__eka.gun && document.querySelector('.mhud-banner')?.setAttribute('hidden', ''));
  const m = await ev(() => window.__eka.mission());
  const c = m.bossCenter ?? [m.bossPos[0], m.bossPos[1] + 2, m.bossPos[2]];
  const scale = (m.bossRadius ?? 1.2) / 1.15;
  for (const [suffix, angle] of [['front', 0], ['side', 0.75]]) {
    // Stand in front of the villain (or three-quarters), look at its chest.
    const p = await ev(() => window.__eka.playerPosition());
    const dx0 = p.x - m.bossPos[0], dz0 = p.z - m.bossPos[2], d0 = Math.hypot(dx0, dz0) || 1;
    const a = Math.atan2(dx0 / d0, dz0 / d0) + angle;
    const dist = 5.2 * scale;
    await ev(([x, y, z]) => window.__eka.teleport(x, y, z), [m.bossPos[0] + Math.sin(a) * dist, m.bossPos[1] + 0.3, m.bossPos[2] + Math.cos(a) * dist]);
    await page.waitForTimeout(250);
    for (let i = 0; i < 2; i++) {
      const cam = await ev(() => window.__eka.cameraPosition());
      await ev(([y, pc]) => window.__eka.setCamera(y, pc), [Math.atan2(-(c[0] - cam.x), -(c[2] - cam.z)), -Math.atan2(c[1] - 0.2 - cam.y, Math.hypot(c[0] - cam.x, c[2] - cam.z))]);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/villain-${task}-${suffix}.png` });
  }
  console.log(`task ${task}: ${m.bossState} at ${m.bossPos.map((v) => v.toFixed(1)).join(',')}`);
  await page.close();
}
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n') : 'none');
await browser.close();
