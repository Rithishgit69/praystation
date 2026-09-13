// Plays the mission mode headlessly: title → Task 1 card → narration → Astra → battle (real aiming and
// firing) → victory → Task 2 … Also exercises hearts, failure and the task menu. Screenshots each beat.
// usage: node tools/play-missions.mjs <outDir> [baseUrl] [tasksToWin]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'test-results/missions';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
const tasksToWin = Number(process.argv[4] ?? 2);
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
const mission = () => ev(() => window.__eka.mission());
const key = (code, down) => ev(([c, d]) => window.__eka.key(c, d), [code, down]);

await page.goto(`${base}/?scene=game&profiler=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
await wait(800);
await shot('00-title');
await page.click('#boot-continue');
await page.waitForSelector('.howto:not([hidden])', { timeout: 10000 });
await shot('00b-how-to-play');
await page.click('.howto-begin');
await wait(2600);
await shot('01-task1-card');
log('after enter', JSON.stringify(await mission()));
await wait(3500);
await shot('02-narration');
await ev(() => window.__eka.missionSkipNarration());
await wait(1200);
await shot('03-armed');
log('armed', JSON.stringify(await mission()));

/** Aim the camera at the asura and hold fire until it dies or we run out of time; dodge on charges. */
async function fight(label, maxMs = 240000) {
  const t0 = Date.now();
  await key('KeyW', false);
  let lastLog = 0;
  while (Date.now() - t0 < maxMs) {
    const m = await mission();
    if (m.phase !== 'battle' && m.phase !== 'arming') {
      if (m.phase === 'respawn') { await wait(500); continue; }
      return m;
    }
    if (!m.bossPos) { await wait(200); continue; }
    const p = await ev(() => window.__eka.playerPosition());
    const cam = await ev(() => window.__eka.cameraPosition());
    const dx = m.bossPos[0] - p.x;
    const dz = m.bossPos[2] - p.z;
    const d = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz);
    const targetY = m.bossPos[1] + 2.0;
    const camDist = Math.hypot(m.bossPos[0] - cam.x, m.bossPos[2] - cam.z);
    const pitch = -Math.atan2(targetY - cam.y, camDist);
    await ev(([y, pch]) => window.__eka.setCamera(y, pch), [yaw, pitch]);
    // Keep distance: back away when the asura closes in, strafe a little otherwise.
    const back = d < 6;
    await ev(([b]) => { window.__eka.key('KeyS', b); window.__eka.key('KeyA', !b && Math.random() < 0.5); }, [back]);
    await ev(() => window.__eka.key('ShiftLeft', false));
    await key('ShiftLeft', false);
    await ev(() => { window.__eka.key('Space', true); setTimeout(() => window.__eka.key('Space', false), 60); });
    if (d < 3.5) await ev(() => { window.__eka.key('KeyQ', true); setTimeout(() => window.__eka.key('KeyQ', false), 60); });
    await ev(() => window.__eka.key('KeyE', false));
    // Fire: hold the real left mouse button on the game view (the same path a player uses).
    if (!mouseDown) { await page.mouse.move(640, 360); await page.mouse.down(); mouseDown = true; }
    await wait(180);
    if (Date.now() - lastLog > 5000) { lastLog = Date.now(); log(`  ${label} boss ${Math.ceil(m.bossHp)}/${m.bossMax} ${m.bossState} · hp ${m.health} hearts ${m.hearts} · dist ${d.toFixed(1)}`); }
  }
  if (mouseDown) { await page.mouse.up(); mouseDown = false; }
  return mission();
}
let mouseDown = false;

for (let t = 1; t <= tasksToWin; t++) {
  await page.waitForFunction(() => { const m = window.__eka.mission(); return m.phase === 'battle'; }, null, { timeout: 30000 });
  await wait(600);
  await shot(`10-task${t}-battle`);
  const r = await fight(`task ${t}`);
  if (mouseDown) { await page.mouse.up(); mouseDown = false; }
  await ev(() => { window.__eka.key('KeyS', false); window.__eka.key('KeyA', false); });
  log(`task ${t} result`, JSON.stringify(r));
  await wait(1500);
  await shot(`11-task${t}-result`);
  if (r.phase === 'failed') {
    await shot(`12-task${t}-failed-menu`);
    log('failed menu shown; choosing "continue from the same stage"');
    await ev(() => window.__eka.missionMenuChoose(0));
    await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
    await wait(800);
    await ev(() => window.__eka.missionSkipNarration());
    await wait(1500);
    t--; // retry
    continue;
  }
  if (t < tasksToWin) {
    await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
    await wait(1500);
    await shot(`13-task${t + 1}-card`);
    await ev(() => window.__eka.missionSkipNarration());
  }
}
// Failure path: drain the player three times to see the hearts and the menu.
log('testing hearts & failure on the current task');
await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 }).catch(() => {});
await wait(1500);
await ev(() => window.__eka.missionSkipNarration());
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 }).catch(() => {});
await wait(500);
for (let i = 0; i < 3; i++) {
  await ev(() => window.__eka.missionHurtPlayer(200));
  await wait(400);
  await shot(`20-heart-lost-${i + 1}`);
  await wait(3200);
}
log('after 3 hearts', JSON.stringify(await mission()));
await shot('21-failed-menu');
await ev(() => window.__eka.missionMenuChoose(1)); // play previous task again
await wait(3000);
log('after choosing previous task', JSON.stringify(await mission()));
await shot('22-previous-task');
console.log('console errors/warnings:', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
