// Auto-walks the whole critical path with real movement input (no teleports) to prove that every
// zone connects on foot. usage: node tools/walk-routes.mjs [baseUrl] [route]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const only = process.argv[3] ?? null;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pos = () => page.evaluate(() => window.__eka.playerPosition());
let failures = 0;

async function boot(query) {
  await page.goto(`${base}/?scene=game&autostart=1&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
}

/** Steer toward (x, z) by pointing the camera and holding W (+Shift when stamina allows). */
async function walkTo(x, z, timeoutMs = 60000, reach = 1.6) {
  const t0 = Date.now();
  let lastProgress = Date.now();
  let best = Infinity;
  await page.evaluate(() => window.__eka.key('KeyW', true));
  while (Date.now() - t0 < timeoutMs) {
    const p = await pos();
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < reach) break;
    if (d < best - 0.3) {
      best = d;
      lastProgress = Date.now();
    }
    if (Date.now() - lastProgress > 6000) {
      log(`  STUCK ${d.toFixed(1)} m from (${x}, ${z}) at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
      failures++;
      break;
    }
    const yaw = Math.atan2(-dx, -dz);
    const st = await page.evaluate(() => window.__eka.playerState());
    await page.evaluate(([y, sprint]) => {
      window.__eka.setCamera(y, 0.45);
      window.__eka.key('ShiftLeft', sprint);
    }, [yaw, st.stamina > 25 || st.state === 'sprint']);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => { window.__eka.key('KeyW', false); window.__eka.key('ShiftLeft', false); });
  const p = await pos();
  return p;
}

async function route(name, query, waypoints) {
  if (only && !name.startsWith(only)) return;
  log(`ROUTE ${name}`);
  await boot(query);
  const start = await pos();
  log(`  start (${start.x.toFixed(1)}, ${start.y.toFixed(1)}, ${start.z.toFixed(1)})`);
  for (const [x, z, label] of waypoints) {
    const before = failures;
    const p = await walkTo(x, z);
    if (failures === before) log(`  ok  ${label ?? ''} → (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) zone=${(await page.evaluate(() => window.__eka.probe())).zone}`);
    else {
      await page.screenshot({ path: `test-results/stuck-${name}-${label ?? x + '_' + z}.png` });
      break;
    }
  }
}

await route('1-forest-to-hall', '', [
  [-30, 425, 'path 1'], [24, 355, 'path 2'], [-34, 285, 'path 3'], [18, 212, 'path 4'], [-14, 152, 'path 5'], [6, 112, 'path 6'], [0, 90, 'gate approach'],
  [0, 68, 'gate'], [1.5, 30, 'courtyard south'], [1.5, 9, 'terrace foot'], [1.5, 3, 'terrace'], [3.2, -3.5, 'terrace north stair'], [4.5, -7.5, 'steps foot'], [4.5, -13.5, 'steps top'], [4.5, -40, 'colonnade'], [4.5, -62, 'hall'],
]);
await route('2-hall-to-moon', 'start=hall&flags=door:hall-east,door:passage-moon', [
  [4.5, -80, 'hall centre'], [30, -100, 'east door approach'], [40, -100, 'passage'], [99, -100, 'passage east'], [103, -100, 'stair landing'], [103, -112, 'stair foot'], [103, -140, 'corridor north'], [103, -152, 'moon chamber'], [110, -190, 'moon centre'],
]);
await route('3-moon-to-serpent', 'start=moon&flags=door:moon-tunnels', [
  [110, -225, 'north door'], [110, -246, 'stairwell'], [110, -254, 'stair foot'], [104, -254, 'west door'], [60, -254, 'tunnel'], [38, -254, 'flooded gallery'], [20, -254, 'gallery west'], [-20, -254, 'corridor'], [-30, -254, 'serpent door'], [-46, -240, 'serpent shrine'],
]);
await route('4-serpent-to-sanctum', 'start=tunnels&flags=door:serpent-chamber,door:library-shrine,door:shrine-sanctum', [
  [104, -254, 'west door'], [60, -254, 'tunnel'], [-30, -254, 'serpent door'], [-46, -246, 'serpent room'], [-46, -262, 'north door'], [-46, -296, 'corridor A'], [-52, -299, 'junction'], [-78, -299, 'water passage'], [-108, -299, 'west end'], [-112, -290, 'corridor C'], [-112, -262, 'evidence chamber'], [-112, -251, 'stair foot'], [-112, -240, 'landing'], [-112, -200, 'gallery'], [-112, -156, 'mid hall'], [-110, -140, 'gallery 2'], [-110, -72, 'library door'], [-110, -100, 'library'], [-75, -88, 'east door'], [-60, -88, 'shrine corridor'], [-46, -88, 'stair landing'], [-44, -98, 'stair top'], [-44, -125, 'stair foot'], [-44, -200, 'deep corridor'], [-44, -306, 'corridor end'], [-37, -308, 'jog'], [-28, -308, 'hall west door'], [-10, -308, 'shrine hall'], [0, -336, 'north door'], [0, -345, 'sanctum stair'], [0, -360, 'stair foot'], [0, -380, 'sanctum'],
]);
log(failures === 0 ? 'ALL ROUTES OK' : `FAILURES: ${failures}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
