import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/missions/MissionData';
import { NARRATORS, SYSTEM_LINES, allVoiceLines, missionLineId } from '@/missions/VoiceLines';

const manifest = JSON.parse(readFileSync('public/voice/manifest.json', 'utf8')) as { narrators: Record<string, unknown>; lines: Record<string, string> };
const hashOf = (n: { ttsVoice: string; rate: string; pitch: string }, text: string): string =>
  createHash('sha1').update(`${n.ttsVoice}|${n.rate}|${n.pitch}|${text}`).digest('hex').slice(0, 12);

describe('narration voice lines', () => {
  it('lists every villain introduction line and the system lines', () => {
    const lines = allVoiceLines();
    const introCount = MISSIONS.reduce((n, m) => n + m.intro.length, 0);
    expect(lines.length).toBe(introCount + Object.keys(SYSTEM_LINES).length);
    expect(lines[0]).toEqual({ id: missionLineId('matsarasura', 0), text: 'You are entering into Task 1.' });
    for (const m of MISSIONS) expect(m.intro[0]?.startsWith(`You are entering into Task ${m.task}.`)).toBe(true);
  });

  it('has a rendered clip for every line and narrator, matching the current text (rerun tools/gen-voice.mjs otherwise)', () => {
    for (const n of Object.values(NARRATORS)) {
      expect(manifest.narrators[n.key]).toBeDefined();
      for (const { id, text } of allVoiceLines()) {
        const key = `${n.key}/${id}`;
        expect(existsSync(`public/voice/${key}.mp3`), `${key}.mp3 missing`).toBe(true);
        expect(manifest.lines[key], `${key} text changed since it was rendered`).toBe(hashOf(n, text));
      }
    }
  });
});
