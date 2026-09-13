// Renders one synthesised SoundBank sound to a WAV file for listening outside the game.
//   usage: node tools/render-sound.mjs <soundId> <out.wav>
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id = 'om-chant-loop', out = `test-results/${id}.wav`] = process.argv.slice(2);
const tmp = path.join(os.tmpdir(), `eka-soundbank-${process.pid}.mjs`);
await build({ entryPoints: [path.join(root, 'src/audio/SoundBank.ts')], bundle: true, format: 'esm', platform: 'node', outfile: tmp, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
const { SoundBank, SAMPLE_RATE } = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });
const bank = new SoundBank();
const data = bank.buffers.get(id);
if (!data) throw new Error(`unknown sound ${id}`);
const buf = Buffer.alloc(44 + data.length * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(data.length * 2, 40);
for (let i = 0; i < data.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767))), 44 + i * 2);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`${id}: ${(data.length / SAMPLE_RATE).toFixed(2)} s → ${out}`);
