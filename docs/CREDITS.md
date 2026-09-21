# Credits & licences

Everything in the shipped build is generated at runtime by the code in this repository (textures,
murals, glyphs, icons, sounds, the Om chant, meshes) or rendered at build time by the tools below
from openly licensed models, or comes from the open-source packages listed. No paid, scraped or
unlicensed assets are used; nothing was taken from another game.

| Package / asset | Licence | Use |
|---|---|---|
| three (r186) | MIT | rendering, post-processing addons, GLTF loading |
| @dimforge/rapier3d-compat | Apache-2.0 | physics, character controllers (hero and asuras) |
| howler | MIT | spatial audio, narration playback |
| zustand | MIT | game state |
| gsap | Standard "no charge" licence (GreenSock/Webflow) | timelines, tweens |
| vite, vite-plugin-pwa, workbox | MIT | build, PWA |
| @capacitor/* , @capacitor-community/keep-awake | MIT | native shells (parked) |
| @fontsource/eb-garamond, cormorant-garamond | OFL-1.1 | body text |
| @fontsource/cinzel | OFL-1.1 | display text |
| @fontsource/noto-serif-devanagari | OFL-1.1 | the ॐ glyph |
| Kokoro-82M (hexgrad) via the `kokoro` package | Apache-2.0 (model and weights; output free to use) | narration clips in `public/voice/`, rendered by `tools/gen-voice.mjs` |
| espeak-ng (phonemiser used by Kokoro's G2P at build time) | GPL-3.0 (tool only; nothing of it ships) | build-time only |
| esbuild, pngjs, @playwright/test, vitest, eslint, typescript | MIT/Apache-2.0 | tooling only |

Not used in the shipped build: Microsoft neural voices (edge-tts). The tool keeps an `edge` engine
for private experiments, but that output is not licensed for redistribution and is never committed.

## Development tools

The code was written with the help of an AI coding assistant (Claude Code by Anthropic) working from
the team's design brief, reviews and play-test feedback; the team owns, understands and can walk
through every part of it (see `docs/CODE_WALKTHROUGH.md`).

## Story and cultural sources

Story inspirations: traditional narratives associated with Ganesha (the broken tusk, Vakratunda and
Matsarasura, the Moon, Ganesha as Vyasa's scribe) and the asuras of the Mudgala Purana tradition
(five of the eight are fought in the campaign). Versions differ across regions and sources; the in-game *Inspirations* journal entries name
the versions drawn on. The temple, the Forgetting, the serpent chapter and all game events are fictional.
Sacred figures are portrayed with respect and are never fought or controlled; the villains are the
tradition's asuras — embodiments of pride, anger, greed, delusion and ego. The five villain designs
follow concept paintings made by the team for this game.
