import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(`${base}/?scene=game`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
await wait(500);
await page.click('#boot-continue');
await page.waitForSelector('.howto:not([hidden])', { timeout: 10000 });
await page.screenshot({ path: 'test-results/input/01-howto.png' });
await page.click('.howto-begin');
await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
await wait(1500);
await page.screenshot({ path: 'test-results/input/02-narration.png' });
console.log('after begin', JSON.stringify(await ev(() => ({ lock: document.pointerLockElement?.id ?? null, avail: window.__eka.engine.input.mouse.lockAvailable, req: window.__eka.engine.input.mouse.lockRequests }))));
// Dismiss the narration with real clicks on the card.
for (let i = 0; i < 12; i++) {
  const m = await ev(() => window.__eka.mission());
  if (!m.narrating) break;
  await page.mouse.click(640, 360);
  await wait(250);
}
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 });
await wait(300);
console.log('battle', JSON.stringify(await ev(() => ({ lock: document.pointerLockElement?.id ?? null, avail: window.__eka.engine.input.mouse.lockAvailable, req: window.__eka.engine.input.mouse.lockRequests, hint: document.querySelector('.mhud-lock-hint')?.textContent }))));
// Mouse look with real mouse movement (unlocked or locked).
const yaw0 = await ev(() => window.__eka.engine.camera.rotation.y);
await page.mouse.move(640, 360);
for (let i = 1; i <= 20; i++) { await page.mouse.move(640 + i * 12, 360); await wait(16); }
await wait(200);
const yaw1 = await ev(() => window.__eka.engine.camera.rotation.y);
console.log('camera yaw before/after mouse move', yaw0.toFixed(3), yaw1.toFixed(3));
// Click on the canvas: should request pointer lock and fire.
const ammo0 = await ev(() => window.__eka.engine.systems?.length);
const g0 = await ev(() => { const s = document.querySelector('.mhud-ammo-text'); return s.textContent; });
await page.mouse.down();
await wait(600);
await page.mouse.up();
await wait(200);
const g1 = await ev(() => document.querySelector('.mhud-ammo-text').textContent);
console.log('ammo before/after real click-hold', g0, '->', g1, 'lock:', JSON.stringify(await ev(() => ({ lock: document.pointerLockElement?.id ?? null, avail: window.__eka.engine.input.mouse.lockAvailable, req: window.__eka.engine.input.mouse.lockRequests, locked: window.__eka.engine.input.mouse.locked }))));
await page.screenshot({ path: 'test-results/input/03-battle.png' });
// Right button = aim
await page.mouse.down({ button: 'right' });
await wait(300);
console.log('aiming', await ev(() => window.__eka.engine.camera.fov));
await page.mouse.up({ button: 'right' });
// Shift run
await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
await wait(1500);
console.log('run state', JSON.stringify(await ev(() => { const s = window.__eka.playerState(); return { state: s.state, speed: Math.hypot(s.vx, s.vz).toFixed(2), stamina: s.stamina }; })));
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
