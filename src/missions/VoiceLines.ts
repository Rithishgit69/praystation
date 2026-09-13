import { MISSIONS } from './MissionData';

/**
 * Every spoken line in mission mode, keyed by a stable id. The clips are pre-rendered by
 * `tools/gen-voice.mjs` (neural text-to-speech, one MP3 per line per narrator) into `public/voice/`,
 * so the game needs no speech API, key or network at runtime.
 */
export interface NarratorVoice {
  key: string;
  /** Text-to-speech voice name (Microsoft neural voice, rendered offline by the tool). */
  ttsVoice: string;
  rate: string;
  pitch: string;
  label: string;
}

export const NARRATORS: Record<'neerja' | 'ava', NarratorVoice> = {
  neerja: { key: 'neerja', ttsVoice: 'en-IN-NeerjaExpressiveNeural', rate: '-8%', pitch: '-3Hz', label: 'Neerja (Indian English)' },
  ava: { key: 'ava', ttsVoice: 'en-US-AvaMultilingualNeural', rate: '-8%', pitch: '-4Hz', label: 'Ava (American English)' },
};

/** Lines spoken by the narrator outside the villain cards. */
export const SYSTEM_LINES: Record<string, string> = {
  'astra-granted': 'The Astra is in your hands. Aim with the crosshair, and fire. Begin.',
  'heart-lost': 'You have fallen. A heart is lost. Rise, and return to the fight.',
  'last-heart': 'One heart remains. Keep moving, and do not let the asura reach you.',
  'task-failed': 'Your hearts are spent, and the asura holds the arena. Choose your path.',
  'task-complete': 'It is done. The asura is broken, and the temple breathes again.',
  'all-broken': 'All eight are broken. Envy, pride, delusion, greed, anger, desire, attachment and ego. None of them holds the temple now.',
};

export const missionLineId = (missionId: string, index: number): string => `${missionId}-${index}`;

/** Every line with its id: the villain introductions in order, then the system lines. */
export const allVoiceLines = (): Array<{ id: string; text: string }> => {
  const out: Array<{ id: string; text: string }> = [];
  for (const m of MISSIONS) m.intro.forEach((text, i) => out.push({ id: missionLineId(m.id, i), text }));
  for (const [id, text] of Object.entries(SYSTEM_LINES)) out.push({ id, text });
  return out;
};
