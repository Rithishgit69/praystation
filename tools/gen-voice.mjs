// Pre-renders every narration line to MP3 with a neural text-to-speech voice, once per narrator, into
// public/voice/<narrator>/<line-id>.mp3, plus public/voice/manifest.json. Uses Microsoft's neural voices
// through the free `edge-tts` tool (run via `uvx`, so nothing is installed globally). Lines whose text and
// voice settings are unchanged since the last run are skipped.
//   usage: node tools/gen-voice.mjs [--force] [--narrator neerja|ava] [--concurrency 4]
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
const concurrency = Number(args.includes('--concurrency') ? args[args.indexOf('--concurrency') + 1] : 4);

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
const hashOf = (n, text) => createHash('sha1').update(`${n.ttsVoice}|${n.rate}|${n.pitch}|${text}`).digest('hex').slice(0, 12);

const run = (cmd, argv) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${argv.join(' ')} failed (${code}): ${err.trim()}`))));
  });

const jobs = [];
for (const n of narrators) {
  fs.mkdirSync(path.join(outRoot, n.key), { recursive: true });
  manifest.narrators[n.key] = { ttsVoice: n.ttsVoice, rate: n.rate, pitch: n.pitch, label: n.label };
  for (const { id, text } of lines) {
    const file = path.join(outRoot, n.key, `${id}.mp3`);
    const h = hashOf(n, text);
    const key = `${n.key}/${id}`;
    if (!force && manifest.lines[key] === h && fs.existsSync(file)) continue;
    jobs.push(async () => {
      // A few retries: the service occasionally drops a connection.
      for (let attempt = 1; ; attempt++) {
        try {
          await run('uvx', ['edge-tts', '--voice', n.ttsVoice, `--rate=${n.rate}`, `--pitch=${n.pitch}`, '--text', text, '--write-media', file]);
          break;
        } catch (e) {
          if (attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      manifest.lines[key] = h;
      console.log(`  ${key}  (${Math.round(fs.statSync(file).size / 1024)} KB)`);
    });
  }
}
console.log(`${lines.length} lines × ${narrators.length} narrator(s); ${jobs.length} clip(s) to render`);
let next = 0;
const worker = async () => {
  while (next < jobs.length) await jobs[next++]();
};
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
// Drop manifest entries for lines that no longer exist.
const valid = new Set(narrators.flatMap((n) => lines.map((l) => `${n.key}/${l.id}`)));
for (const k of Object.keys(manifest.lines)) if (k.split('/')[0] in manifest.narrators && !valid.has(k) && narrators.some((n) => n.key === k.split('/')[0])) delete manifest.lines[k];
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`done → ${path.relative(root, outRoot)}`);
