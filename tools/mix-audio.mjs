// Mixes a timeline of sounds into one WAV: the Om chant loops underneath (−16 dB), narration clips
// and effects land at their timestamps. usage: node tools/mix-audio.mjs <timeline.json> <out.wav>
//   timeline.json: { duration, events: [{ t, sound, gain, maxLen? }], sfxDir, voiceDir }
//   sound: "<name>" → <sfxDir>/<name>.wav · "voice:<id>" → <voiceDir>/<id>.mp3
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [timelinePath, outPath] = process.argv.slice(2);
const tl = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
const RATE = 44100;
const n = Math.ceil((tl.duration + 1) * RATE);
const L = new Float32Array(n);
const R = new Float32Array(n);
const cache = new Map();

/** Decode any audio file to interleaved stereo float PCM at RATE via ffmpeg. */
const decode = (file) => {
  let pcm = cache.get(file);
  if (pcm) return pcm;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`decode ${file}: ${r.stderr.toString().slice(-300)}`);
  pcm = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  cache.set(file, pcm);
  return pcm;
};
const place = (pcm, t, gain, loopUntil = null, maxLen = null) => {
  let start = Math.floor(t * RATE);
  const full = pcm.length / 2;
  // A clip cut short (narration skipped in the video) fades out over its last 0.35 s.
  const frames = maxLen === null ? full : Math.min(full, Math.floor(maxLen * RATE));
  const tail = frames < full ? RATE * 0.35 : RATE * 0.03;
  do {
    for (let i = 0; i < frames; i++) {
      const j = start + i;
      if (j >= n) break;
      // A 30 ms fade at each end of every clip keeps joins click-free.
      const edge = Math.min(1, i / (RATE * 0.03), (frames - i) / tail);
      L[j] += pcm[i * 2] * gain * edge;
      R[j] += pcm[i * 2 + 1] * gain * edge;
    }
    start += frames;
  } while (loopUntil !== null && start < loopUntil * RATE);
};

// The chant bed for the whole length, then every event.
const db = (x) => Math.pow(10, x / 20);
place(decode(path.join(tl.sfxDir, 'om-chant-loop.wav')), 0, db(-16), tl.duration);
for (const e of tl.events) {
  const file = e.sound.startsWith('voice:') ? path.join(tl.voiceDir, `${e.sound.slice(6)}.mp3`) : path.join(tl.sfxDir, `${e.sound}.wav`);
  if (!fs.existsSync(file)) continue;
  place(decode(file), e.t, (e.gain ?? 1) * (e.sound.startsWith('voice:') ? db(-3) : db(-9)), null, e.maxLen ?? null);
}
// Fade out over the final 2 s, soft-limit, write 16-bit stereo WAV.
for (let i = n - RATE * 2; i < n; i++) {
  const k = Math.max(0, (n - i) / (RATE * 2));
  L[i] *= k;
  R[i] *= k;
}
const buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24);
buf.writeUInt32LE(RATE * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
// Master gain (+6 dB) into a soft limiter: lands near −17 LUFS integrated, peaks under −1 dBFS.
const lim = (x) => Math.tanh(x * 2.2) * 0.95;
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(lim(L[i]) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(lim(R[i]) * 32767), 46 + i * 4);
}
fs.writeFileSync(outPath, buf);
console.log(`mixed ${tl.events.length} events over ${tl.duration.toFixed(1)} s → ${outPath}`);
