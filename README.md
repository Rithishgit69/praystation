# The Temple of Eka-Danta

A cinematic mythological adventure: an abandoned moonlit temple, a traveller with the temple's gun of
remembered light, and eight tasks against the eight asuras of the Vinayaka (Mudgala) Purana tradition —
envy, pride, delusion, greed, anger, desire, attachment and ego. Each task opens with a narrated villain
card, arms you with the Astra, and ends with the next villain. Three hearts, a villain health bar,
escalating difficulty, and a choice to replay or continue from the same stage when you fall.

*Inspired by traditional stories; all events, characters and the temple in this game are fictional.
Sacred figures are portrayed with respect and are never fought.*

## Run, build, deploy — three commands

```bash
npm install && npm run dev        # http://127.0.0.1:5173  (F1 dev menu · F3 profiler)
```

```bash
npm run build && npm run preview  # production build + preview at http://127.0.0.1:4173
```

```bash
npm run mobile:android            # build → cap sync → signed AAB in dist/ (see docs/PUBLISHING.md)
```

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
|---|---|---|---|
| Move / sprint | WASD, Shift | Left stick, push past the rim | Left floating stick, push past the rim |
| Look | Mouse (click to capture) | Right stick | Swipe right half |
| Fire / aim | Left mouse / right mouse | RT / LT | FIRE button / — |
| Reload | R | X | ↻ button |
| Dodge / jump | Q / Space | B / — | ◇ button |
| Interact | E | A | contextual button |
| Map / journal / pause | M / J / Esc | Back / Y / Start | tap compass / pause menu / ❚❚ |
| Recentre camera | V | R3 | — |

## Modes and URLs

- Default: **mission mode** (`/`): Task 1 begins after the title card.
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
