// Pre-renders every narration line to MP3, once per narrator, into public/voice/<narrator>/<line-id>.mp3
// plus public/voice/manifest.json. Lines whose text and voice settings are unchanged are skipped.
//
// Engines (per narrator, see src/missions/VoiceLines.ts):
//   kokoro — Kokoro-82M (Apache-2.0; output free to use and ship). Runs locally through `uv`
//            (https://docs.astral.sh/uv/) + ffmpeg; the first run downloads the model (~330 MB).
//   edge   — Microsoft neural voices via edge-tts. NOT licensed for redistribution: for private
//            experiments only; never commit its output.
//   usage: node tools/gen-voice.mjs [--force] [--narrator heart|emma]
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.includes('--narrator') ? args[args.indexOf('--narrator') + 1] : null;

// Load the TypeScript line list by bundling it to a temp ESM file (type-only imports are erased).
const tmp = path.join(os.tmpdir(), `eka-voice-lines-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(root, 'src/missions/VoiceLines.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: tmp,
  alias: { '@': path.join(root, 'src'), '@data': path.join(root, 'data') },
  logLevel: 'silent',
});
const mod = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });
const lines = mod.allVoiceLines();
const narrators = Object.values(mod.NARRATORS).filter((n) => !only || n.key === only);

const outRoot = path.join(root, 'public/voice');
const manifestPath = path.join(outRoot, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { narrators: {}, lines: {} };
if (!manifest.narrators) manifest.narrators = {};
if (!manifest.lines) manifest.lines = {};
const hashOf = (n, text) => createHash('sha1').update(`${n.engine}|${n.voice}|${n.tuning}|${text}`).digest('hex').slice(0, 12);
const tuningOf = (n) => Object.fromEntries(n.tuning.split(';').filter(Boolean).map((kv) => kv.split('=')));

const run = (cmd, argv, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let err = '';
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${argv.slice(0, 4).join(' ')} … failed (${code}): ${err.trim().slice(-600)}`))));
  });
// Loudness-normalised so both narrators sit at the same level under the chant (EBU R128, −18 LUFS).
const toMp3 = (wav, mp3) => run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-ac', '1', '-ar', '24000', '-b:a', '48k', mp3]);

let rendered = 0;
for (const n of narrators) {
  fs.mkdirSync(path.join(outRoot, n.key), { recursive: true });
  manifest.narrators[n.key] = { engine: n.engine, voice: n.voice, tuning: n.tuning, label: n.label };
  const pending = lines.filter(({ id, text }) => force || manifest.lines[`${n.key}/${id}`] !== hashOf(n, text) || !fs.existsSync(path.join(outRoot, n.key, `${id}.mp3`)));
  console.log(`${n.key} (${n.engine} ${n.voice}): ${pending.length} of ${lines.length} clip(s) to render`);
  if (pending.length === 0) continue;
  if (n.engine === 'kokoro') {
    const t = tuningOf(n);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eka-kokoro-'));
    const jobs = pending.map(({ id, text }) => ({ file: path.join(work, `${id}.wav`), text, voice: n.voice, lang: n.lang, speed: Number(t.speed ?? 1) }));
    const jobsFile = path.join(work, 'jobs.json');
    fs.writeFileSync(jobsFile, JSON.stringify(jobs));
    await run('uv', ['run', '--python', '3.12', '--with', 'kokoro', '--with', 'soundfile', '--with', 'numpy', path.join(root, 'tools/kokoro_tts.py'), jobsFile]);
    for (const { id, text } of pending) {
      const mp3 = path.join(outRoot, n.key, `${id}.mp3`);
      await toMp3(path.join(work, `${id}.wav`), mp3);
      manifest.lines[`${n.key}/${id}`] = hashOf(n, text);
      rendered++;
      console.log(`  ${n.key}/${id}  (${Math.round(fs.statSync(mp3).size / 1024)} KB)`);
    }
    fs.rmSync(work, { recursive: true, force: true });
  } else {
    const t = tuningOf(n);
    for (const { id, text } of pending) {
      const mp3 = path.join(outRoot, n.key, `${id}.mp3`);
      await run('uvx', ['edge-tts', '--voice', n.voice, `--rate=${t.rate ?? '+0%'}`, `--pitch=${t.pitch ?? '+0Hz'}`, '--text', text, '--write-media', mp3]);
      manifest.lines[`${n.key}/${id}`] = hashOf(n, text);
      rendered++;
      console.log(`  ${n.key}/${id}  (${Math.round(fs.statSync(mp3).size / 1024)} KB)`);
    }
  }
}
// Drop manifest entries and folders for narrators that no longer exist.
const keys = new Set(Object.values(mod.NARRATORS).map((n) => n.key));
for (const k of Object.keys(manifest.narrators)) if (!keys.has(k)) delete manifest.narrators[k];
for (const k of Object.keys(manifest.lines)) if (!keys.has(k.split('/')[0])) delete manifest.lines[k];
for (const dir of fs.readdirSync(outRoot, { withFileTypes: true })) if (dir.isDirectory() && !keys.has(dir.name)) fs.rmSync(path.join(outRoot, dir.name), { recursive: true, force: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`done: ${rendered} clip(s) rendered → ${path.relative(root, outRoot)}`);
