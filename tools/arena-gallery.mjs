// Screenshots of every battle arena at the start of its fight: the traveller's view toward the
// villain, and a wide view from the rim. usage: node tools/arena-gallery.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/arenas';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
for (const task of [1, 2, 3, 4, 5]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[t${task}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[t${task}] ${e.message}`));
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(`${base}/?scene=game&help=0&task=${task}&name=Arjun&hero=male`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 120000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
  await ev(() => window.__eka.missionSkipNarration());
  await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
  await ev(() => window.__eka.missionHold(true));
  await page.waitForTimeout(600);
  const m = await ev(() => window.__eka.mission());
  const c = m.bossCenter ?? [m.bossPos[0], m.bossPos[1] + 2, m.bossPos[2]];
  const aimAt = async (target) => {
    for (let i = 0; i < 2; i++) {
      const cam = await ev(() => window.__eka.cameraPosition());
      await ev(([y, pc]) => window.__eka.setCamera(y, pc), [Math.atan2(-(target[0] - cam.x), -(target[2] - cam.z)), -Math.atan2(target[1] - cam.y, Math.hypot(target[0] - cam.x, target[2] - cam.z))]);
      await page.waitForTimeout(60);
    }
  };
  await aimAt(c);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/arena-${task}-spawn.png` });
  // Wide view: from the east side of the floor, looking across at the villain and the far rim.
  const p = await ev(() => window.__eka.playerPosition());
  const mid = [(p.x + c[0]) / 2, p.y, (p.z + c[2]) / 2];
  await ev(([x, y, z]) => window.__eka.teleport(x, y, z), [mid[0] + 24, p.y, mid[2] + 6]);
  await page.waitForTimeout(150);
  await aimAt([c[0] - 6, c[1] + 1, c[2]]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/arena-${task}-wide.png` });
  console.log(`task ${task}: player ${p.x.toFixed(0)},${p.z.toFixed(0)} boss ${c[0].toFixed(0)},${c[2].toFixed(0)} hp ${m.bossHp}`);
  await page.close();
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
