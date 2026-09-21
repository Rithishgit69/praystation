# PrayStation
   - The Temple of Eka-Danta

A cinematic mythological adventure: an abandoned moonlit temple, a traveller with the temple's gun of
remembered light, and eight tasks against the eight asuras of the Vinayaka (Mudgala) Purana tradition —
envy, pride, delusion, greed, anger, desire, attachment and ego. Each task opens with a narrated villain
card, arms you with the Astra, and ends with the next villain. Three hearts, a villain health bar,
escalating difficulty, and a choice to replay or continue from the same stage when you fall.

*Inspired by traditional stories; all events, characters and the temple in this game are fictional.
Sacred figures are portrayed with respect and are never fought.*

Repository: **github.com/Rithishgit69/praystation** · web build deploys to Vercel from `main`
(`vercel.json`) · CI runs typecheck, lint, unit tests and the build on every push.

## How to play (in one breath)

Move `WASD`, look with the mouse (click the view to capture it), run `Shift`, jump `Space`, dodge `Q`,
fire `left mouse`, aim `right mouse`, reload `R`, pause `Esc`. Eight tasks, eight asuras: each card
tells you how the villain fights, the Astra tells you how to beat it, the bar at the top is its
health, the three hearts are yours. Everything flies straight and every floor effect is marked first —
sidestep, jump, dodge. Play at **https://rithishgit69.github.io/praystation/**; `SUBMISSION.md` has the
contest sheet and `docs/CODE_WALKTHROUGH.md` the five-minute tour of the code.

## Run, build, deploy

```bash
npm install && npm run dev        # http://127.0.0.1:5173  (F1 dev menu · F3 profiler)
```

```bash
npm run build && npm run preview  # production build in dist/ + preview at http://127.0.0.1:4173
```

The game is a static web app: `dist/` is everything. It is configured for **Vercel** out of the box
(`vercel.json`: framework Vite, `npm run build`, output `dist/`, cache headers):

```bash
npx vercel --prod                 # (= npm run deploy) or import the repo at vercel.com/new — no settings needed
```

Any static host works the same way (Netlify: build `npm run build`, publish `dist`; GitHub Pages / Cloudflare
Pages: upload `dist/`). The build uses relative asset paths, so it also runs from a sub-folder.
The Capacitor Android/iOS projects remain in the repository (`npm run mobile:android`, see
`docs/PUBLISHING.md`) but the web build is the primary target.

### Narration voices

The villain cards and mission messages are spoken by pre-rendered neural voice lines in `public/voice/`
(Neerja, Indian English, by default; Ava, American English, selectable in the pause menu). They are
generated once with the free `edge-tts` tool through `uvx` (Python `uv` must be installed); no key or
network is needed at run time:

```bash
node tools/gen-voice.mjs          # renders only lines whose text or voice changed; --force redoes all
```

Edit the lines in `src/missions/MissionData.ts` / `src/missions/VoiceLines.ts` and rerun the tool.

## Controls

A new game opens on **Your traveller** (name the hero, choose the male or female traveller) and then a
**How to play** card (also in the pause menu under *Controls / how to play*). Both the name and the
traveller can be changed later from the pause menu.

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move / run | WASD, hold Shift (or toggle, see options) | Left stick, LB / L3 or push past the rim | Left floating stick, push past the rim |
| Look | Mouse — follows the pointer at once; click the view to capture it, Esc releases | Right stick | Swipe right half |
| Fire / aim | Left mouse / right mouse (hold) | RT / LT | FIRE button / — |
| Reload | R | X | ↻ button |
| Dodge / jump | Q / Space | B / Y | ◇ / ▲ buttons |
| Interact | E | A | contextual button |
| Map / journal / pause | M / J / Esc | Back / D-pad up / Start | tap compass / pause menu / ❚❚ |
| Recentre camera | V | R3 | — |

An Om chant loops under play at −10 dB (music & chant volume in the pause menu); it dips while the
narrator speaks.

## The villains

Eight asuras, eight signature kits — every projectile flies straight and every floor effect is marked
before it hurts, so sidestepping, jumping and dodging always work. `docs/VILLAINS.md` lists them with
their looks, and explains how to drop in modelled avatars (`public/models/asuras/*.glb`).

## Modes and URLs

- Default: **mission mode** (`/`): Task 1 begins after the title card.
- `?task=N`: start a new game at task N (testing). `?hero=female&name=Meera` presets the traveller.
- `?mode=story`: the exploration story mode (memories, puzzles, Memory Portal) built alongside it.
- `?scene=greybox` / `?scene=courtyard`: traversal and reference-frame test scenes. `?profiler=1` shows
  the frame-time overlay; `?quality=low|medium|high|ultra` forces a tier; `?start=<zone>` spawns in a zone.

## Layout

```
src/engine      loop, renderer, post chain (GTAO, bloom, LUT grade, SMAA), physics, quality scaler
src/input       keyboard/mouse, gamepad, touch → one InputFrame
src/player      kinematic controller, camera rig, character mesh
src/world       terrain, streaming, zones, procedural props/textures/murals
src/missions    tasks, asura AI, the Astra, mission HUD, narration, director   ← the game
src/systems     story/exploration systems (portal, puzzles, doors, save, lighting states)
src/encounters  memory encounters (story mode)
src/audio       synthesised sound bank + spatial audio
data/           chapters, puzzles, dialogue, lore (JSON)
tools/          headless screenshot / playthrough harnesses, icon + screenshot generators
tests/          vitest unit tests, Playwright smoke/perf/mission tests
android/ ios/   Capacitor 8 projects · store/ listing assets · docs/ architecture, progress, publishing
```

## Tests

```bash
npm test                 # unit (vitest)
npm run test:e2e         # Playwright: boot, traversal budget, save/continue, interaction, missions
node tools/play-missions.mjs out/ http://127.0.0.1:5173 8   # plays all eight tasks headlessly
```
