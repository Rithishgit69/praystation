// Records only the ending: the last blow on Ahamkarasura, the climax (the idol rising) and the results
// card, with the narrator and effects mixed in. usage: node tools/climax-preview.mjs [baseUrl] [out.mp4]
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'test-results/climax-preview.mp4';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eka-climax-'));
const sfxDir = path.join(work, 'sfx');
fs.mkdirSync(sfxDir, { recursive: true });
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.toString().slice(-600)}`);
  return r.stdout.toString();
};
for (const s of ['astra-shot', 'asura-hit', 'task-complete', 'asura-death', 'weapon-granted', 'om-chant-loop', 'diya-light', 'shimmer', 'bell-near', 'ui-tick']) run('node', ['tools/render-sound.mjs', s, path.join(sfxDir, `${s}.wav`)]);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: work, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const start = Date.now();
const events = [];
const now = () => (Date.now() - start) / 1000;
const mark = (sound, gain = 1) => events.push({ t: now(), sound, gain });
const ev = (f, a) => page.evaluate(f, a);
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(`${base}/?scene=game&help=0&task=5&name=Arjun&hero=male`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 120000 });
await page.click('#boot-continue');
await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
await ev(() => window.__eka.missionSkipNarration());
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
await page.keyboard.press('Digit1');
await page.mouse.move(640, 360);
await page.mouse.click(640, 360);
await wait(300);
// Aim at the villain and fire for a moment, then finish him.
for (let i = 0; i < 2; i++) {
  const m = await ev(() => window.__eka.mission());
  const c = m.bossCenter ?? [m.bossPos[0], m.bossPos[1] + 2, m.bossPos[2]];
  const cam = await ev(() => window.__eka.cameraPosition());
  await ev(([y, pc]) => window.__eka.setCamera(y, pc), [Math.atan2(-(c[0] - cam.x), -(c[2] - cam.z)), -Math.atan2(c[1] - cam.y, Math.hypot(c[0] - cam.x, c[2] - cam.z))]);
  await wait(60);
}
const trimStart = now();
await page.mouse.down();
for (let i = 0; i < 8; i++) { mark('astra-shot', 0.7); mark('asura-hit', 0.5); await wait(200); }
await page.mouse.up();
await ev(() => window.__eka.missionDamageBoss(10000));
await page.waitForFunction(() => window.__eka.mission().phase === 'victory', null, { timeout: 15000 });
mark('asura-death', 0.9);
await wait(2600);
mark('task-complete', 0.8);
await page.waitForFunction(() => window.__eka.mission().climax === true, null, { timeout: 30000 });
mark('shimmer', 0.6);
const t0 = Date.now();
const at = async (sec, sound, gain) => { const w = t0 + sec * 1000 - Date.now(); if (w > 0) await wait(w); mark(sound, gain); };
await at(1.2, 'voice:climax', 1);
for (let i = 0; i < 5; i++) await at(2.0 + i * 3 * 0.42, 'diya-light', 0.35);
await at(5.5, 'bell-near', 0.45);
await at(10.5, 'bell-near', 0.5);
await at(14.6, 'weapon-granted', 0.7);
await at(15.2, 'voice:all-broken', 1);
await page.waitForFunction(() => window.__eka.mission().menu === true, null, { timeout: 60000 });
await wait(3500);
const cutEnd = now();
await ctx.close();
const file = await page.video().path();
const cut = path.join(work, 'cut.mp4');
run('ffmpeg', ['-y', '-v', 'error', '-ss', trimStart.toFixed(3), '-i', file, '-t', (cutEnd - trimStart).toFixed(3), '-vf', 'fps=30,scale=1280:720', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', cut]);
const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', cut]).trim());
fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ duration: dur, events: events.filter((e) => e.t >= trimStart).map((e) => ({ ...e, t: e.t - trimStart })), sfxDir, voiceDir: path.resolve('public/voice/heart') }));
run('node', ['tools/mix-audio.mjs', path.join(work, 'timeline.json'), path.join(work, 'audio.wav')]);
run('ffmpeg', ['-y', '-v', 'error', '-i', cut, '-i', path.join(work, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
console.log(`done → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${dur.toFixed(0)} s)`);
await browser.close();
fs.rmSync(work, { recursive: true, force: true });
