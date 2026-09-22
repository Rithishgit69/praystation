// Records the contest demo video (about two minutes): title → your traveller → how to play → Task 1
// (card, narration, the Astra, the battle with the returning blade, TASK COMPLETE) → the Dhanush, the
// Chakra and the Vajra in Tasks 2–4, each villain forced into its signature attack → the fire king's
// flame breath → the ending with the rank card and the leaderboard.
//
// Video: Playwright's per-context recording (silent). Audio: rebuilt from the same timeline — the
// narrator's clips at the moments the cards showed them, weapon and hit sounds at the moments they
// fired (polled from the game), the Om chant underneath — mixed by tools/mix-audio.mjs, then muxed.
//   usage: node tools/demo-video.mjs [baseUrl] [out.mp4]
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const out = process.argv[3] ?? 'demo/demo.mp4';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eka-demo-'));
const sfxDir = path.join(work, 'sfx');
fs.mkdirSync(sfxDir, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')}… failed: ${r.stderr.toString().slice(-800)}`);
  return r.stdout.toString();
};
// Render the sound effects the audio track needs.
for (const s of ['astra-shot', 'bow-release', 'chakra-throw', 'vajra-burst', 'asura-hit', 'task-complete', 'heart-lost', 'asura-death', 'weapon-granted', 'task-begin', 'asura-roar', 'om-chant-loop', 'diya-light', 'ui-tick', 'dodge', 'shimmer', 'bell-near']) run('node', ['tools/render-sound.mjs', s, path.join(sfxDir, `${s}.wav`)]);

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const segments = [];

/** Record one segment in a fresh context; `fn` drives it and marks audio events. */
async function segment(name, url, fn) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: work, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const start = Date.now();
  const events = [];
  const now = () => (Date.now() - start) / 1000;
  const mark = (sound, gain = 1) => events.push({ t: now(), sound, gain });
  const ev = (f, arg) => page.evaluate(f, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const mission = () => ev(() => window.__eka.mission());
  await page.goto(`${base}${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 120000 });
  const readyAt = now();
  const s = { page, ev, wait, mark, now, events, mission, trimStart: readyAt, cutEnd: null, speedRanges: [] };
  // Aim the camera at the villain (two passes for the boom's new position).
  s.aim = async () => {
    for (let i = 0; i < 2; i++) {
      const m = await mission();
      if (!m.bossCenter && !m.bossPos) return;
      const c = m.bossCenter ?? [m.bossPos[0], m.bossPos[1] + 2, m.bossPos[2]];
      const cam = await ev(() => window.__eka.cameraPosition());
      await ev(([y, pc]) => window.__eka.setCamera(y, pc), [Math.atan2(-(c[0] - cam.x), -(c[2] - cam.z)), -Math.atan2(c[1] - cam.y, Math.hypot(c[0] - cam.x, c[2] - cam.z))]);
      await wait(50);
    }
  };
  /** Poll the gun and the villain to mark shot/hit/roar sounds while the fight runs. */
  s.pollFight = async (ms, extra) => {
    const until = Date.now() + ms;
    let fired = (await ev(() => window.__eka.gun())).fired;
    let hits = (await ev(() => window.__eka.gun())).hits;
    let hearts = (await mission()).hearts;
    while (Date.now() < until) {
      await wait(90);
      const g = await ev(() => window.__eka.gun());
      const m = await mission();
      const sound = g.weapon === 'dhanush' ? 'bow-release' : g.weapon === 'chakra' ? 'chakra-throw' : g.weapon === 'vajra' ? 'vajra-burst' : 'astra-shot';
      for (let k = fired; k < g.fired && k < fired + 3; k++) mark(sound, 0.7);
      if (g.hits > hits) mark('asura-hit', 0.5);
      if (m.hearts < hearts) mark('heart-lost', 0.8);
      fired = g.fired;
      hits = g.hits;
      hearts = m.hearts;
      if (extra && (await extra(m, g)) === false) break;
      if (m.phase === 'victory' || m.phase === 'failed') break;
    }
  };
  await fn(s);
  const video = page.video();
  s.cutEnd ??= now();
  await ctx.close();
  const file = await video.path();
  segments.push({ name, file, events, trimStart: s.trimStart, cutEnd: s.cutEnd });
  log(`segment ${name}: ${(s.cutEnd - s.trimStart).toFixed(1)} s, ${events.length} audio events`);
}

/**
 * The narration card: let `lines` voiced lines play, marking each clip, then skip the rest. A line
 * longer than `cap` seconds is skipped at that point and its clip cut to match in the audio mix.
 */
async function narrate(s, missionId, lines, cap = Infinity) {
  await s.page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
  for (let i = 0; i < lines; i++) {
    await s.page.waitForFunction((n) => window.__eka.missionVoice()?.line === n, i, { timeout: 30000 });
    const event = { t: s.now(), sound: `voice:${missionId}-${i}`, gain: 1 };
    s.events.push(event);
    const started = Date.now();
    const ended = await s.page
      .waitForFunction((n) => (window.__eka.missionVoice()?.line ?? 0) > n || window.__eka.mission().narrating === false, i, { timeout: Math.min(40000, cap * 1000) })
      .then(() => true, () => false);
    if (!ended) {
      event.maxLen = (Date.now() - started) / 1000 + 0.35;
      break;
    }
  }
  if (await s.ev(() => window.__eka.mission().narrating)) await s.ev(() => window.__eka.missionSkipNarration());
}

/** Fight with one weapon for `seconds`; `signature` is the villain's own attack, forced a moment in. */
async function fightUntil(s, seconds, weaponKey, weaponDriver, signature = null, extras = []) {
  await s.page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
  await s.page.keyboard.press(weaponKey);
  await s.wait(150);
  await s.page.mouse.move(640, 360);
  await s.page.mouse.click(640, 360);
  const start = Date.now();
  const until = start + seconds * 1000;
  let forced = false;
  const pending = extras.map((e) => ({ ...e, done: false }));
  await s.pollFight(seconds * 1000, async (m) => {
    if (m.phase !== 'battle') return false;
    if (signature && !forced && Date.now() - start > 1500 && ['idle', 'stagger'].includes(m.bossState)) {
      forced = true;
      await s.ev((k) => window.__eka.missionAttack(k), signature);
      s.mark('asura-roar', 0.6);
    }
    for (const e of pending) {
      if (!e.done && Date.now() - start > e.at * 1000) {
        e.done = true;
        await e.run(s);
      }
    }
    await weaponDriver(s, m);
    return Date.now() < until;
  });
}

/** Marks the climax's sounds at the moments the game plays them (Climax.ts), then the banner's line. */
async function climaxSounds(s) {
  s.mark('shimmer', 0.6);
  const t0 = Date.now();
  const at = async (sec, sound, gain) => {
    const wait = t0 + sec * 1000 - Date.now();
    if (wait > 0) await s.wait(wait);
    s.mark(sound, gain);
  };
  await at(1.2, 'voice:climax', 1);
  for (let i = 0; i < 5; i++) await at(2.0 + i * 3 * 0.42, 'diya-light', 0.35);
  await at(5.5, 'bell-near', 0.45);
  await at(10.5, 'bell-near', 0.5);
  await at(14.6, 'weapon-granted', 0.7);
  await at(15.2, 'voice:all-broken', 1);
}

/** Q: the dodge roll. */
const dodge = async (s) => {
  await s.page.keyboard.press('KeyQ');
  s.mark('dodge', 0.7);
};
/** B: the controls card opens over the paused fight, then B again returns to it. */
const helpCard = async (s) => {
  await s.page.keyboard.press('KeyB');
  s.mark('ui-tick', 0.5);
  await s.wait(1700);
  await s.page.keyboard.press('KeyB');
  s.mark('ui-tick', 0.5);
};

/** End the fight if the hero has not already: wait out a respawn, then break the villain. */
async function finishFight(s) {
  await s.page.waitForFunction(() => ['battle', 'victory'].includes(window.__eka.mission().phase), null, { timeout: 20000 });
  if ((await s.mission()).phase === 'battle') await s.ev(() => window.__eka.missionDamageBoss(10000));
  await s.page.waitForFunction(() => window.__eka.mission().phase === 'victory', null, { timeout: 15000 });
}

// Weapon drivers: how the demo hero uses each weapon.
const rifle = async (s, m) => {
  await s.aim();
  const p = await s.ev(() => window.__eka.playerPosition());
  const d = Math.hypot(m.bossPos[0] - p.x, m.bossPos[2] - p.z);
  await s.ev(([b]) => { window.__eka.key('KeyS', b); window.__eka.key('KeyD', !b && Math.random() < 0.6); }, [d < 6]);
  if (d < 3.5) await s.ev(() => { window.__eka.key('KeyQ', true); setTimeout(() => window.__eka.key('KeyQ', false), 60); });
  const g = await s.ev(() => window.__eka.gun());
  if (g.ammo > 0) {
    if (!s.mouseDown) { await s.page.mouse.down(); s.mouseDown = true; }
  } else if (s.mouseDown) { await s.page.mouse.up(); s.mouseDown = false; }
};
const bow = async (s) => {
  await s.aim();
  if (!s.drawing) { await s.page.mouse.down(); s.drawing = Date.now(); }
  else if (Date.now() - s.drawing > 1000) { await s.aim(); await s.page.mouse.up(); s.drawing = null; await s.wait(250); }
};
const disc = async (s) => {
  await s.aim();
  const g = await s.ev(() => window.__eka.gun());
  if (g.ammo > 0 && (!s.lastThrow || Date.now() - s.lastThrow > 700)) { await s.page.mouse.click(640, 360); s.lastThrow = Date.now(); }
};
const burst = async (s, m) => {
  const p = await s.ev(() => window.__eka.playerPosition());
  const d = Math.hypot(m.bossPos[0] - p.x, m.bossPos[2] - p.z);
  await s.ev(([b]) => window.__eka.key('KeyW', b), [d > 5.5]);
  await s.aim();
  if (d < 8 && (!s.lastBurst || Date.now() - s.lastBurst > 1200)) { await s.page.mouse.click(640, 360); s.lastBurst = Date.now(); }
};
const releaseKeys = (s) => s.ev(() => { for (const k of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ']) window.__eka.key(k, false); });

// ---- Segment 1: title → traveller → how to play → Task 1 ----------------------------------------
await segment('start', '/?scene=game', async (s) => {
  s.trimStart = Math.max(0, s.now() - 0.3);
  await s.wait(1200);
  await s.page.click('#boot-continue');
  s.mark('ui-tick', 0.6);
  await s.page.waitForSelector('.traveller:not([hidden])');
  await s.wait(400);
  await s.page.click('.traveller-name input');
  await s.page.keyboard.type('Arjun', { delay: 70 });
  await s.wait(300);
  await s.page.click('.traveller-hero[data-hero="female"]');
  await s.wait(700);
  await s.page.click('.traveller-hero[data-hero="male"]');
  await s.wait(400);
  await s.page.click('.traveller-go');
  s.mark('ui-tick', 0.6);
  await s.page.waitForSelector('.howto:not([hidden])');
  await s.wait(1500);
  await s.page.mouse.wheel(0, 600);
  await s.wait(600);
  await s.page.click('.howto-begin');
  s.mark('task-begin', 0.6);
  await narrate(s, 'madasura', 2, 5);
  await s.page.waitForFunction(() => window.__eka.mission().phase === 'arming', null, { timeout: 20000 });
  s.mark('weapon-granted', 0.7);
  s.mark('voice:weapon-astra', 1);
  await s.wait(2200);
  // The blade warrior throws his returning blade; the hero rolls out of the way, and B shows the controls.
  await fightUntil(s, 9.5, 'Digit1', rifle, 'blade-throw', [{ at: 2.6, run: dodge }, { at: 5.0, run: helpCard }]);
  if (s.mouseDown) { await s.page.mouse.up(); s.mouseDown = false; }
  await releaseKeys(s);
  await finishFight(s);
  s.mark('asura-death', 0.9);
  await s.wait(2400);
  s.mark('task-complete', 0.8);
  s.mark('voice:task-complete', 1);
  await s.wait(1800);
});

// ---- Segments 2–4: each new Astra ----------------------------------------------------------------
const weaponSegment = async (task, id, key, driver, seconds, lines, signature) => {
  await segment(`weapon-${id}`, `/?scene=game&help=0&task=${task}&name=Arjun&hero=male`, async (s) => {
    await s.page.click('#boot-continue');
    await s.page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
    s.trimStart = s.now() - 0.3;
    await narrate(s, id === 'dhanush' ? 'krodhasura' : id === 'chakra' ? 'lobhasura' : 'mohasura', lines, 1.7);
    await s.page.waitForFunction(() => window.__eka.mission().phase === 'arming', null, { timeout: 20000 });
    s.mark('weapon-granted', 0.7);
    s.mark(`voice:weapon-${id}`, 1);
    await s.wait(2000);
    await fightUntil(s, seconds, key, driver, signature);
    if (s.drawing) { await s.page.mouse.up(); s.drawing = null; }
    await releaseKeys(s);
    await finishFight(s);
    s.mark('asura-death', 0.9);
    await s.wait(800);
  });
};
await weaponSegment(2, 'dhanush', 'Digit2', bow, 4.5, 1, 'leap-slam');
await weaponSegment(3, 'chakra', 'Digit3', disc, 4.2, 1, 'fissure');
await weaponSegment(4, 'vajra', 'Digit4', burst, 4.2, 1, 'radial-burst');

// ---- Segment 5: the last villain's flame breath ------------------------------------------------
const MONTAGE = [[5, 'flame-breath', 1300]];
for (const [task, attack, hold] of MONTAGE) {
  await segment(`montage-${task}`, `/?scene=game&help=0&task=${task}&name=Arjun&hero=male`, async (s) => {
    await s.page.click('#boot-continue');
    await s.page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
    await s.wait(1200);
    s.trimStart = s.now() - 1.0;
    s.mark(`voice:${['', 'madasura', 'krodhasura', 'lobhasura', 'mohasura', 'ahamkarasura'][task]}-0`, 1);
    await s.wait(1600);
    await s.ev(() => window.__eka.missionSkipNarration());
    await s.page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
    await s.page.keyboard.press('Digit1');
    await s.page.mouse.move(640, 360);
    await s.page.mouse.click(640, 360);
    await s.wait(300);
    await s.page.waitForFunction(() => ['idle', 'stagger'].includes(window.__eka.mission().bossState), null, { timeout: 20000 }).catch(() => {});
    const m = await s.mission();
    const p = await s.ev(() => window.__eka.playerPosition());
    const dx = p.x - m.bossPos[0], dz = p.z - m.bossPos[2], d = Math.hypot(dx, dz) || 1;
    await s.ev(([x, y, z]) => window.__eka.teleport(x, y, z), [m.bossPos[0] + (dx / d) * 10, m.bossPos[1] + 0.3, m.bossPos[2] + (dz / d) * 10]);
    await s.wait(200);
    await s.aim();
    await s.ev((k) => window.__eka.missionAttack(k), attack);
    s.mark('asura-roar', 0.6);
    await s.page.mouse.down();
    await s.pollFight(hold + 1100, async () => { await s.aim(); return true; });
    await s.page.mouse.up();
  });
}

// ---- Segment 6: the ending ------------------------------------------------------------------------
await segment('ending', '/?scene=game&help=0&task=5&name=Arjun&hero=male', async (s) => {
  await s.page.click('#boot-continue');
  await s.page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
  await s.ev(() => window.__eka.missionSkipNarration());
  await s.page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 40000 });
  await s.page.keyboard.press('Digit1');
  await s.page.mouse.move(640, 360);
  await s.page.mouse.click(640, 360);
  await s.wait(400);
  await s.aim();
  s.trimStart = s.now();
  await s.page.mouse.down();
  await s.pollFight(1500, async () => { await s.aim(); return true; });
  await s.page.mouse.up();
  await finishFight(s);
  s.mark('asura-death', 0.9);
  await s.wait(2600);
  s.mark('task-complete', 0.8);
  // The climax: the idol rises before the gateway while the traveller kneels (see Climax.ts timings).
  await s.page.waitForFunction(() => window.__eka.mission().climax === true, null, { timeout: 30000 });
  await climaxSounds(s);
  await s.page.waitForFunction(() => window.__eka.mission().menu === true, null, { timeout: 60000 });
  await s.wait(2400);
  await s.page.click('.taskmenu-btn'); // Leaderboard
  await s.page.waitForSelector('.leaderboard:not([hidden])', { timeout: 10000 });
  await s.wait(2400);
  await s.wait(400);
  s.cutEnd = s.now();
  await s.page.click('.leaderboard-close');
});
await browser.close();

// ---- Assemble -----------------------------------------------------------------------------------
log('assembling video');
const parts = [];
let cursor = 0;
const timeline = [];
for (const seg of segments) {
  const cut = path.join(work, `${seg.name}.mp4`);
  const dur = seg.cutEnd - seg.trimStart;
  run('ffmpeg', ['-y', '-v', 'error', '-ss', seg.trimStart.toFixed(3), '-i', seg.file, '-t', dur.toFixed(3), '-vf', 'fps=30,scale=1280:720', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-an', cut]);
  const actual = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', cut]).trim());
  parts.push(cut);
  for (const e of seg.events) if (e.t >= seg.trimStart && e.t <= seg.cutEnd) timeline.push({ t: cursor + (e.t - seg.trimStart), sound: e.sound, gain: e.gain });
  cursor += actual;
}
fs.writeFileSync(path.join(work, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
const silent = path.join(work, 'silent.mp4');
run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', silent]);
fs.writeFileSync(path.join(work, 'timeline.json'), JSON.stringify({ duration: cursor, events: timeline, sfxDir, voiceDir: path.resolve('public/voice/heart') }));
run('node', ['tools/mix-audio.mjs', path.join(work, 'timeline.json'), path.join(work, 'audio.wav')]);
fs.mkdirSync(path.dirname(out), { recursive: true });
run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', path.join(work, 'audio.wav'), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out]);
log(`done → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${cursor.toFixed(0)} s)`);
fs.rmSync(work, { recursive: true, force: true });
