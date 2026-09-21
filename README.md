# PrayStation — The Temple of Eka-Danta

A cinematic mythological adventure: an abandoned moonlit temple, a traveller armed by the temple with
four weapons of remembered light, and five tasks against five asuras of the Vinayaka (Mudgala) Purana
tradition — pride, anger, greed, delusion and ego. Each task opens with a narrated villain card, grants
a weapon, and ends with the next villain. Three hearts, a villain health bar, difficulty that climbs
task by task to a last fight that demands everything, a choice to replay or continue from the same stage
when you fall, and a leaderboard of finished runs.

*Inspired by traditional stories; all events, characters and the temple in this game are fictional.
Sacred figures are portrayed with respect and are never fought.*

Repository: **github.com/Rithishgit69/praystation** · live at **https://rithishgit69.github.io/praystation/**
(GitHub Pages, deployed from `main` by `.github/workflows/deploy-pages.yml`; `vercel.json` for Vercel) · CI runs
typecheck, lint, unit tests and the build on every push.

## How to play (in one breath)

Move `WASD`, look with the mouse (click the view to capture it), run `Shift`, jump `Space`, dodge `Q`
(a quick roll the way you are moving), fire `left mouse`, aim `right mouse`, reload `R`, switch weapon
`1–4` / mouse wheel, `B` shows the controls (and pauses), `Esc` pauses. That is the whole set. Five
tasks, five asuras, each in a wide open arena: each card tells you how the villain fights, the tip on
the weapon tells you how to beat it, the bar at the top is its health, the three hearts are yours.
Everything flies straight and every floor effect is marked first — sidestep, jump, dodge. Finish all
five and your run goes on the leaderboard. `SUBMISSION.md` has the contest sheet and
`docs/CODE_WALKTHROUGH.md` the five-minute tour of the code.

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
(*Heart*, American English, by default; *Emma*, British English, selectable in the pause menu). They
are rendered once with the open-source **Kokoro-82M** model (Apache-2.0) through Python `uv`
(`tools/kokoro_tts.py`, loudness-normalised with ffmpeg); no key or network is needed at run time:

```bash
node tools/gen-voice.mjs          # (= npm run voice) renders only lines whose text or voice changed; --force redoes all
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
| Jump / dodge | Space / Q | A or Y / B | ▲ / ◇ |
| Fire / aim | Left mouse / right mouse (hold) | RT / LT | FIRE button / — |
| Switch weapon | 1 2 3 4, or the mouse wheel (X / Z cycle) | D-pad left / right | ⟳ button |
| Reload | R | X | ↻ button |
| Controls card | B (or H) — pauses the game while it is open | Back | ? button |
| Pause | Esc | Start | ❚❚ |

Mission mode deliberately has no other keys: nothing crouches, blocks or opens a map, so there is no
stance to get stuck in. (Story mode, `?mode=story`, keeps E interact, C crouch, M map, J journal, V
camera reset.)

An Om chant loops under play at −10 dB (music & chant volume in the pause menu); it dips while the
narrator speaks.

## The weapons

The temple grants one weapon per task; all of them stay with you and switch with `1–4` or the wheel:

| Task | Weapon | How it fires |
|---|---|---|
| 1 | **Astra**, the rifle of remembered light | hold to fire hitscan rounds; aim for a tight spread; 12-round magazine, `R` reloads |
| 2 | **Dhanush**, the bow of light | hold to draw, release to loose; a full draw pierces and hits the villain's core hardest |
| 3 | **Chakra**, the returning disc | press to throw; it cuts on the way out and on the way back, then returns to your hand |
| 4 | **Vajra**, the thunder burst | a fan of six pellets — devastating up close, nothing at range; staggers the villain |

Hip fire blooms, aiming (`right mouse`) tightens it and pulls the camera over the shoulder, and every
projectile leaves the muzzle toward the crosshair.

## The arenas

Every task is fought on a purpose-built floor sixty to seventy metres across with nothing on it — the
pillars, braziers, shelves and mirror stands stand at the rim — dressed after the temple room the
villain belongs to: the Courtyard of the Arrogant under the moon, the Hall of the Wrathful with its
roof open in five places, the Library of the Grasping with the shelf stacks at its walls, the Moon
Chamber of the Deluder, and the mountain gateway for the last fight (`src/world/zones/Arenas.ts`).

## The villains

Five asuras built from the team's reference paintings, five signature kits — a duelling blade, bare
fists and a leaping slam, buffalo horns that tear fissures and a bellow that shoves, six arms of shard
fans and illusions, and fire breath with a mirror. Every projectile flies straight and every floor
effect is marked before it hurts, so sidestepping, jumping and dodging always work. `docs/VILLAINS.md`
lists them with their looks and kits, and explains how to drop in modelled avatars
(`public/models/asuras/*.glb`).

## Leaderboard

Every finished run is recorded on the device (name, rank, time, accuracy, hearts lost) and listed under
*Leaderboard* on the title screen, in the pause menu and on the ending card. A shared board for
everyone takes a free Supabase project and two lines in `public/leaderboard.json` — see
`docs/LEADERBOARD.md`. Nothing else is collected.

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
src/missions    tasks, asura AI + designs, the four weapons, mission HUD, narration, director   ← the game
src/systems     leaderboard, save, story/exploration systems (portal, puzzles, doors, lighting states)
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
node tools/play-missions.mjs out/ http://127.0.0.1:5173 5   # plays all five tasks headlessly (= npm run play:missions)
node tools/attack-gallery.mjs out/ http://127.0.0.1:4173     # screenshots every villain attack
node tools/villain-gallery.mjs out/ http://127.0.0.1:4173    # portrait sheet of the five villains
node tools/arena-gallery.mjs out/ http://127.0.0.1:4173      # every arena from the spawn and the side
node tools/demo-video.mjs http://127.0.0.1:4173 demo/demo.mp4 # records the demo video (needs ffmpeg)
```
