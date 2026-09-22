import { MISSIONS } from './MissionData';

/**
 * Every spoken line in mission mode, keyed by a stable id. The clips are pre-rendered by
 * `tools/gen-voice.mjs` (neural text-to-speech, one MP3 per line per narrator) into `public/voice/`,
 * so the game needs no speech API, key or network at runtime.
 */
export interface NarratorVoice {
  key: string;
  /**
   * Rendering engine. `kokoro` is Kokoro-82M (Apache-2.0: output free to use and ship) — the voices
   * in the game. `edge` is Microsoft's neural voices via edge-tts, whose output is NOT licensed for
   * redistribution; it stays available for private experiments only and its clips are never committed.
   */
  engine: 'kokoro' | 'edge';
  /** Voice id for the engine (Kokoro: af_heart, bf_emma …; edge: en-IN-NeerjaNeural …). */
  voice: string;
  /** Kokoro language code ('a' American, 'b' British); ignored by edge. */
  lang: string;
  /** Prosody: Kokoro `speed=0.92`; edge `rate=-8%;pitch=-3Hz`. Part of the clip hash. */
  tuning: string;
  label: string;
}

export type NarratorKey = 'heart' | 'emma';

export const NARRATORS: Record<NarratorKey, NarratorVoice> = {
  heart: { key: 'heart', engine: 'kokoro', voice: 'af_heart', lang: 'a', tuning: 'speed=0.9;loudnorm=-18', label: 'Heart (American English)' },
  emma: { key: 'emma', engine: 'kokoro', voice: 'bf_emma', lang: 'b', tuning: 'speed=0.9;loudnorm=-18', label: 'Emma (British English)' },
};

export const DEFAULT_NARRATOR: NarratorKey = 'heart';

/** Lines spoken by the narrator outside the villain cards. */
export const SYSTEM_LINES: Record<string, string> = {
  'astra-granted': 'The Astra is in your hands. Aim with the crosshair, and fire. Begin.',
  'weapon-astra': 'The temple grants you the Astra, the rifle of remembered light. Hold to fire. Aim, and the spread tightens.',
  'weapon-dhanush': 'A second gift. The Dhanush, the bow of light. Hold to draw, release to loose. A full draw pierces, and strikes the core hardest.',
  'weapon-chakra': 'A third gift. The Chakra, the returning disc. It cuts on the way out and on the way back, then flies home to your hand.',
  'weapon-vajra': 'A fourth gift. The Vajra, the thunder burst. Devastating up close, nothing at range. Four charges, then it recharges.',
  'heart-lost': 'You have fallen. A heart is lost. Rise, and return to the fight.',
  'last-heart': 'One heart remains. Keep moving, and do not let the asura reach you.',
  'task-failed': 'Your hearts are spent, and the asura holds the arena. Choose your path.',
  'task-complete': 'It is done. The asura is broken, and the temple breathes again.',
  'all-broken': 'All five are broken. Pride, anger, greed, delusion and ego. None of them holds the temple now.',
  climax: 'The shadows are gone, and the temple remembers whose house it is. Where the first memory was made, Ekadanta rises: the one-tusked, the remover of obstacles, patient as stone. Bow, traveller. The night is over.',
};

export const missionLineId = (missionId: string, index: number): string => `${missionId}-${index}`;

/** Every line with its id: the villain introductions in order, then the system lines. */
export const allVoiceLines = (): Array<{ id: string; text: string }> => {
  const out: Array<{ id: string; text: string }> = [];
  for (const m of MISSIONS) m.intro.forEach((text, i) => out.push({ id: missionLineId(m.id, i), text }));
  for (const [id, text] of Object.entries(SYSTEM_LINES)) out.push({ id, text });
  return out;
};
