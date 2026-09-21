// Screenshots every villain mid-attack: starts each task, skips the narration, forces each attack of the
// kit in turn and captures it. usage: node tools/attack-gallery.mjs [baseUrl] [outDir] [task,task,...]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/attacks';
const only = (process.argv[4] ?? '1,2,3,4,5').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const KITS = {
  1: ['sword-combo', 'blade-throw', 'charge'],
  2: ['leap-slam', 'mace-flurry', 'slam', 'charge'],
  3: ['charge', 'fissure', 'bellow', 'summon', 'slam'],
  4: ['shard-fan', 'illusion', 'radial-burst', 'teleport', 'spiral', 'shield'],
  5: ['flame-breath', 'fire-charge', 'envy-orb', 'radial-burst', 'summon', 'mirror-shield', 'slam'],
};
const DELAY = { 'leap-slam': 1700, bellow: 1000, 'flame-breath': 1600, 'fire-charge': 1500, charge: 1300, 'sword-combo': 900, 'blade-throw': 1100, 'chain-hook': 900, 'coin-mines': 1700, fissure: 1600, 'mace-flurry': 900, 'arrow-fan': 1000, 'arrow-rain': 1500, 'petal-ring': 1800, 'root-trap': 1600, tether: 1400, 'radial-burst': 1100, spiral: 1800, 'mirror-shield': 1300, slam: 1200, shard: 800, 'shard-fan': 900, 'envy-orb': 1300, summon: 1500, shield: 1200, illusion: 1200, teleport: 900 };
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
for (const task of only) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[t${task} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[t${task} pageerror] ${e.message}`));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(`${base}/?scene=game&help=0&task=${task}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
  await page.click('#boot-continue');
  await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
  await wait(600);
  await page.screenshot({ path: `${out}/t${task}-0-intro.png` });
  await ev(() => window.__eka.missionSkipNarration());
  await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 });
  await wait(400);
  // Aim the camera at the boss so the attack is in frame.
  const aim = async () => {
    const m = await ev(() => window.__eka.mission());
    const p = await ev(() => window.__eka.playerPosition());
    const cam = await ev(() => window.__eka.cameraPosition());
    if (!m.bossPos) return;
    const yaw = Math.atan2(-(m.bossPos[0] - p.x), -(m.bossPos[2] - p.z));
    const pitch = -Math.atan2(m.bossPos[1] + 1.6 - cam.y, Math.hypot(m.bossPos[0] - cam.x, m.bossPos[2] - cam.z));
    await ev(([y, pc]) => window.__eka.setCamera(y, pc), [yaw, pitch]);
  };
  for (const kind of KITS[task]) {
    // Wait until idle, stand 9 m from the asura, then force the attack.
    await page.waitForFunction(() => ['idle', 'stagger'].includes(window.__eka.mission().bossState), null, { timeout: 20000 }).catch(() => {});
    await ev(() => window.__eka.missionHurtPlayer(-1000)); // keep the hero healthy (heals; clamped to 100)
    const near = await ev(() => window.__eka.mission());
    const pp = await ev(() => window.__eka.playerPosition());
    if (near.bossPos) {
      const dx = pp.x - near.bossPos[0]; const dz = pp.z - near.bossPos[2]; const d = Math.hypot(dx, dz) || 1;
      await ev(([x, y, z]) => window.__eka.teleport(x, y, z), [near.bossPos[0] + (dx / d) * 9, near.bossPos[1] + 0.3, near.bossPos[2] + (dz / d) * 9]);
      await wait(250);
    }
    await aim();
    await ev((k) => window.__eka.missionAttack(k), kind);
    await wait(DELAY[kind] ?? 1000);
    await aim();
    await wait(60);
    const st = await ev(() => window.__eka.mission());
    console.log(`t${task} ${kind}: attack=${st.attack} stage=${st.stage} proj=${st.projectiles} hp=${st.health} bossY=${st.bossPos?.[1]?.toFixed(2)} grounded=${st.grounded}`);
    await page.screenshot({ path: `${out}/t${task}-${kind}.png` });
    await wait(1500);
  }
  await page.close();
}
console.log('errors:', errors.length ? errors.slice(0, 12).join('\n') : 'none');
await browser.close();
