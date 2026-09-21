// Exercises every weapon with real input in a fresh Task 4 (all four unlocked): fires, aims, switches,
// draws the bow, throws the disc and bursts the Vajra; reports ammo, hits and boss health.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/weapons';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const gun = () => ev(() => window.__eka.gun());
const boss = () => ev(() => window.__eka.mission().bossHp);
await page.goto(`${base}/?scene=game&help=0&task=4`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
await page.click('#boot-continue');
await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
await ev(() => window.__eka.missionSkipNarration());
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 });
await wait(800);
console.log('granted', JSON.stringify(await gun()));
// Aim the camera at the hit-sphere centre; two passes so the boom's new position is accounted for.
const aim = async () => {
  for (let i = 0; i < 2; i++) {
    const m = await ev(() => window.__eka.mission());
    const c = m.bossCenter ?? [m.bossPos[0], m.bossPos[1] + 2, m.bossPos[2]];
    const cam = await ev(() => window.__eka.cameraPosition());
    const yaw = Math.atan2(-(c[0] - cam.x), -(c[2] - cam.z));
    const pitch = -Math.atan2(c[1] - cam.y, Math.hypot(c[0] - cam.x, c[2] - cam.z));
    await ev(([y, pc]) => window.__eka.setCamera(y, pc), [yaw, pitch]);
    await wait(60);
  }
};
await page.mouse.move(640, 360);
await page.mouse.click(640, 360); // capture
// 1. Astra: hold fire 1 s, aim with RMB.
await page.keyboard.press('Digit1'); await wait(300); await aim();
let hp0 = await boss();
await page.mouse.down({ button: 'right' }); await wait(300);
await page.mouse.down(); await wait(1000); await page.mouse.up();
await page.screenshot({ path: `${out}/1-astra-ads.png` });
await page.mouse.up({ button: 'right' });
await wait(200);
console.log('astra', JSON.stringify(await gun()), 'boss', hp0, '->', await boss());
// 2. Dhanush: draw 1 s and release.
await page.keyboard.press('Digit2'); await wait(300); await aim();
hp0 = await boss();
await page.mouse.down(); await wait(1000);
await page.screenshot({ path: `${out}/2-dhanush-draw.png` });
await page.mouse.up(); await wait(900); await aim();
console.log('dhanush', JSON.stringify(await gun()), 'boss', hp0, '->', await boss());
// 3. Chakra: throw twice, wait for the return.
await page.keyboard.press('Digit3'); await wait(300); await aim();
hp0 = await boss();
await page.mouse.click(640, 360); await wait(150);
await page.screenshot({ path: `${out}/3-chakra-throw.png` });
await page.mouse.click(640, 360); await wait(400);
const mid = await gun();
await wait(2800);
console.log('chakra', JSON.stringify(mid), '→ after return', JSON.stringify(await gun()), 'boss', hp0, '->', await boss());
// 4. Vajra: close in and burst twice.
await page.keyboard.press('Digit4'); await wait(300);
const m = await ev(() => window.__eka.mission()); const p = await ev(() => window.__eka.playerPosition());
const dx = p.x - m.bossPos[0], dz = p.z - m.bossPos[2], d = Math.hypot(dx, dz) || 1;
await ev(([x, y, z]) => window.__eka.teleport(x, y, z), [m.bossPos[0] + (dx / d) * 5, m.bossPos[1] + 0.3, m.bossPos[2] + (dz / d) * 5]);
await wait(300); await aim();
hp0 = await boss();
await page.mouse.click(640, 360); await wait(120);
await page.screenshot({ path: `${out}/4-vajra-burst.png` });
await wait(1200); await aim(); await page.mouse.click(640, 360); await wait(300);
console.log('vajra', JSON.stringify(await gun()), 'boss', hp0, '->', await boss(), 'bossState', (await ev(() => window.__eka.mission())).bossState);
// Wheel switching.
await page.mouse.wheel(0, 120); await wait(200);
console.log('after wheel', (await gun()).weapon);
console.log('errors', errors);
await browser.close();
