// Plays Chapters II → Finale headlessly on top of a completed Chapter I, screenshotting each beat.
// usage: node tools/play-all.mjs <outDir> [baseUrl]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'test-results/all';
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
const tp = async (x, y, z, yaw = 0, pitch = 0.45) => { await ev(([x, y, z]) => window.__eka.teleport(x, y, z), [x, y, z]); await ev(([yaw, pitch]) => window.__eka.setCamera(yaw, pitch), [yaw, pitch]); await wait(700); };
const interact = async () => { const id = await ev(() => window.__eka.interact()); log('  interact →', id); await wait(350); return id; };
const flag = (k) => ev((k) => window.__eka.flags()[k], k);
const tap = (code, ms = 80) => ev(([code, ms]) => { window.__eka.key(code, true); setTimeout(() => window.__eka.key(code, false), ms); }, [code, ms]);
const encounter = () => ev(() => window.__eka.encounter?.() ?? null);

await page.goto(`${base}/?scene=game&mode=story&autostart=1&start=hall&profiler=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90000 });
await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 20000 });
await wait(1500);
// Chapter I is complete (verified by play-ch1.mjs): set its flags.
await ev(() => { for (const f of ['beat:arrived', 'beat:gate-sight', 'beat:gate-enter', 'beat:hall-enter', 'beat:hall-dais', 'diyas:hall', 'beat:inscription-read', 'puzzle:hall-symbols', 'memory:broken-tusk', 'door:hall-east']) window.__eka.setFlag(f, true); window.__eka.setFlag('lantern:lit', false); });
await wait(500);

// ---- Chapter II
log('Ch II: relight lantern');
await tp(-7.5, 2.0, -108);
await interact();
log('  lantern:relit', await flag('lantern:relit'));
await tp(36.2, 2.0, -100, -Math.PI / 2);
await shot('20-passage-door');
await tp(58, 2.0, -100, -Math.PI / 2);
await wait(2500);
await shot('21-passage-illusion');
await tp(86.5, 2.0, -98.5, -Math.PI / 2);
await wait(2500);
await tp(60, 2.0, -89, 0, 0.3);
await wait(2500);
log('  illusion puzzle', await flag('puzzle:passage-illusion'));
await tp(76, 2.0, -112.4, Math.PI, 0.35);
await shot('22-true-altar');
await interact();
await page.waitForFunction(() => window.__eka.portal?.inMemory() && window.__eka.encounter !== null, null, { timeout: 30000 });
await wait(3500);
await shot('23-vakratunda-illusion');
// Illusion: touch the real shade.
let st = await encounter();
log('  vakratunda', JSON.stringify(st));
await tp(st.real[0] + 1.2, 0.2, st.real[2] + 1.2, 0, 0.3);
await wait(400);
await tap('KeyE');
await wait(2500);
st = await encounter();
log('  after touch', JSON.stringify(st));
// Envy: relight the four braziers.
for (const [dx, dz] of [[-12, -8], [12, -8], [-20, 10], [20, 10]]) {
  await tp(2000 + dx + 1.5, 0.2, 0 + dz + 1.5, 0, 0.3);
  await tap('KeyE');
  await wait(500);
}
await shot('24-vakratunda-rage');
// Rage: keep dodging until resolution.
const rageDeadline = Date.now() + 60000;
while (Date.now() < rageDeadline) {
  st = await encounter();
  if (!st || st.phase !== 'rage') break;
  await tap('KeyQ');
  await tap('Space');
  await wait(450);
}
st = await encounter();
log('  vakratunda', JSON.stringify(st));
await wait(3000);
await tp(st.real[0] + 1.4, 0.2, st.real[2] + 1.4, 0, 0.3);
await tap('KeyE');
await shot('25-vakratunda-release');
await page.waitForFunction(() => window.__eka.portal?.inMemory() === false, null, { timeout: 40000 });
await wait(6000);
log('  memory:vakratunda', await flag('memory:vakratunda'), 'door:passage-moon', await flag('door:passage-moon'));
await shot('26-passage-return');

// ---- Chapter III
log('Ch III: moon chamber');
await tp(110, -1.9, -150, 0, 0.35);
await wait(2500);
await shot('30-moon-chamber');
const turns = [2, 5, 2, 7];
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const mx = 110 + Math.cos(a) * 20;
  const mz = -190 + Math.sin(a) * 20;
  await tp(mx + Math.cos(a) * 2.2, -1.9, mz + Math.sin(a) * 2.2, a + Math.PI / 2, 0.3);
  for (let k = 0; k < turns[i]; k++) { await interact(); await wait(950); }
}
log('  alignment', await flag('puzzle:moon-alignment'), JSON.stringify(await ev(() => window.__eka.probe())));
await tp(110, -1.9, -186, 0, 0.5);
await wait(1200);
await shot('31-moon-beams');
await tp(147.5, -1.9, -178, -Math.PI / 2, 0.2);
await interact(); // close the roof → shadow
await wait(5000);
await shot('32-moon-shadow');
await tp(95 + 1.0, -1.9, -149.8 - 1.0, Math.PI, 0.2);
await wait(600);
log('  probe', JSON.stringify(await ev(() => window.__eka.probe())));
log('  focused (shadow mark)', await interact());
log('  moon-shadow', await flag('puzzle:moon-shadow'), 'door', await flag('door:moon-tunnels'));

// ---- Chapter IV
log('Ch IV: serpent');
await tp(-46, -13.9, -237.4, Math.PI, 0.3);
await wait(2500);
await shot('40-serpent-shrine');
await interact();
await wait(4500);
await shot('41-serpent-awake');
for (const [x, y, z] of [[-46, -13.9, -266], [-46, -13.9, -282], [-46, -13.9, -296], [-60, -15.1, -299], [-96, -15.1, -299], [-112, -15.1, -292], [-112, -13.9, -270], [-112, -13.9, -262]]) {
  await tp(x, y, z, 0, 0.4);
  await wait(900);
}
await wait(1200);
await shot('42-serpent-stop');
st = await encounter();
log('  serpent', JSON.stringify(st), 'escaped', await flag('beat:serpent-escaped'));
await tp(-115, -13.9, -262, Math.PI / 2, 0.2);
await interact();
log('  evidence', await flag('beat:evidence'));
await wait(8000);

// ---- Chapter V
log('Ch V: library');
await tp(-110, -9.9, -100, 0, 0.4);
await wait(2500);
await shot('50-library');
await tp(-110 + 24 + 1.2, -9.9, -100 + 24 + 1.2, 0, 0.3);
await interact();
// The scribe's dais sits east of the north door: plinths at x = -96 - 8 + i*4.
await tp(-88, -9.2, -121.5, Math.PI, 0.3);
await interact(); // place
await wait(500);
const fragTurns = [3, 1, 2, 3, 1];
for (let i = 0; i < 5; i++) {
  await tp(-96 - 8 + i * 4, -9.2, -121.5, Math.PI, 0.3);
  for (let k = 0; k < fragTurns[i]; k++) { await interact(); await wait(950); }
}
log('  scribe', await flag('puzzle:scribe-fragments'), 'door', await flag('door:library-shrine'));
await shot('51-library-solved');

// ---- Chapter VI
log('Ch VI: the Forgetting');
await tp(0, -19.9, -292, 0, 0.35);
await wait(2500);
await shot('60-shrine');
await tp(0, -19.9, -302, 0, 0.35);
await wait(5500);
await shot('61-forgetting-named');
for (const [sx, sz] of [[-10.39, -302], [0, -320], [10.39, -302]]) {
  await tp(sx + 1.2, -19.9, sz + 1.2, 0, 0.3);
  await tap('KeyE');
  await wait(300);
  await tap('KeyQ');
  await wait(600);
}
await wait(4000);
await shot('62-forgetting-rage');
const rageDeadline2 = Date.now() + 90000;
while (Date.now() < rageDeadline2) {
  st = await encounter();
  if (!st || st.phase !== 'rage') break;
  await tap('KeyQ');
  await tap('Space');
  await wait(450);
}
st = await encounter();
log('  forgetting', JSON.stringify(st));
await wait(3000);
await tp(0, -18.9, -305, 0, 0.3);
await wait(500);
await tap('KeyE');
await wait(6000);
await shot('63-cleansed');
log('  cleansed', await flag('shrine:cleansed'), 'door', await flag('door:shrine-sanctum'));

// ---- Finale
log('Finale');
await tp(0, -25.9, -380, 0, 0.35);
await wait(2500);
await shot('70-sanctum');
for (let i = 0; i < 6; i++) {
  const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
  await tp(Math.cos(a) * 9.5 + 1.2, -25.9, -396 + Math.sin(a) * 9.5 + 1.2, 0, 0.3);
  await interact();
}
log('  seal', await flag('puzzle:sanctum-seal'));
await wait(6000);
await shot('71-finale-moonlight');
await wait(14000);
await shot('72-finale-sunrise');
await wait(7000);
await shot('73-ending');
log('  restored', await flag('sanctum:restored'), 'ending-seen', await flag('beat:ending-seen'));
const stats = await ev(() => window.__eka.stats());
log('stats', JSON.stringify(stats));
log('slow steps', JSON.stringify((await ev(() => window.__eka.slowSteps())).sort((a, b) => b.ms - a.ms).slice(0, 12)));
console.log('console errors/warnings:', errors.length ? errors.slice(0, 20).join('\n') : 'none');
await browser.close();
