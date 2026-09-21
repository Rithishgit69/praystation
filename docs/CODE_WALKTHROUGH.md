# Code walkthrough (for a judges' Q&A)

Five minutes, top to bottom. File paths are clickable in the repository.

## 1. The frame

`src/engine/Engine.ts` owns one `requestAnimationFrame` loop. Each frame it (1) polls input into one
`InputFrame` (`src/input/InputManager.ts` merges keyboard+mouse, gamepad and touch), (2) runs physics
in fixed 60 Hz steps (`fixedUpdate` on every registered system, then a Rapier world step), (3) calls
`update` and `lateUpdate` on every system with the variable frame time, and (4) renders through the
post-processing chain in `src/engine/PostFX.ts` (render → ambient occlusion → bloom → tone mapping →
colour grade → anti-aliasing). Systems are plain objects with `update(dt)`; a scene registers the ones it
needs (`src/scenes/GameScene.ts`).

## 2. Moving the hero

`src/player/PlayerController.ts` is a kinematic capsule driven by Rapier's character controller:
walk/jog/sprint speeds, acceleration and friction, jump with coyote time and an input buffer, a dodge
burst with invulnerability frames and a cooldown, stamina (crouch exists but is unbound in mission
mode). Input bindings come in two profiles (`src/input/Keyboard.ts`, `GamepadDevice.ts`): the lean
mission set and the story set with the exploration verbs. It reads the merged input frame and writes a position;
`src/player/PlayerVisual.ts` + `CharacterMesh.ts` draw and animate the procedural traveller (male or
female outfit on the same rig) at that position: a distance-driven gait with knee flex, hip sway and
torso counter-twist, legs that turn toward the direction of travel while the body faces the aim, lean
into acceleration and turns, jump tuck, a roll around a mid-body pivot for the dodge, recoil and flinch. `src/player/CameraRig.ts` is the third-person spring
arm: yaw/pitch from the mouse, a collision probe so walls never hide the hero, and auto-realign.

## 3. The world

`src/world/WorldStreamer.ts` streams the 1.2 km temple in 64 m cells around the player; each zone is a
generator (`src/world/zones/*.ts`) that yields between build steps so streaming never stalls a frame.
All geometry, textures, murals and glyphs are generated in code (`src/world/props`, `MuralArt.ts`,
`TextureGen.ts`) — there are no art files in the repository. The five battle arenas
(`src/world/zones/Arenas.ts`) are zones like any other, placed far outside the terrain at x ≈ 2000 so
nothing streams under them: one clear floor each, with the room's dressing pushed to the rim.

## 4. A task, start to finish

`src/missions/MissionDirector.ts` is the state machine: `travel → narration → arming → battle →
victory | failed → next task`. It shows the villain card (`Narration.ts`, typewriter paced to the
pre-rendered voice clip), grants the task's weapon with a banner and a spoken instruction, tracks hearts
and health, saves progress, and on defeat opens the choice menu (`TaskMenu.ts`). Per-task stats
(time, shots, hits, hearts lost, retries) feed the rank card at the end and the leaderboard entry.

## 4b. The weapons

`src/missions/WeaponData.ts` is the data (four weapons: damage, rate, magazine, spread from the hip and
while aiming, bloom, recoil, projectile flight); `src/missions/Gun.ts` is the behaviour. The rifle is
hitscan from the crosshair; the bow is a charged projectile with gravity compensated at the draw; the
disc flies out and returns, cutting on both passes; the burst fires six pellets with distance falloff and
staggers the villain. Spread blooms per shot and settles, the camera kicks (`CameraRig.kick`), aiming
blends the camera over the shoulder (`CameraRig.aim`), and the weapon mesh is oriented along the view
every frame so projectiles leave the muzzle toward the crosshair. Weapons unlock by task and the wheel,
`1–4`, `X`/`Z`, the D-pad or the touch button switch them.

## 5. A villain

`src/missions/Asura.ts` is one boss: it walks the floor with its own character controller
(`AsuraBody.ts`), keeps its preferred distance, and picks attacks from its kit on a timer that shortens
as it is wounded. Attacks are built from two toolkits — `Projectiles.ts` (straight-line flight, world
collision, sphere test against the player; nothing homes) and `Hazards.ts` (telegraph circles, shock
rings, burning ground, coin mines, fissures, root traps, arrow rain, the petal ring, the flame cone).
Each asura's kit, stats and narration live in `src/missions/MissionData.ts`. The avatar is a rig
(`AsuraMesh.ts`: hips, torso, head, arms, legs, optional extra arms, scarves, hover) dressed by one of
five design functions in `AsuraDesigns.ts`, each written from a reference painting (blade warrior,
wrestler, buffalo, three-faced, fire king); poses and idle motion are procedural. A modelled `.glb` can
replace any of them through `AsuraModel.ts`. Two attacks are specific to the new villains: the
wrestler's `leap-slam` (a parabola onto a telegraphed circle) and the buffalo's `bellow` (a knockback
wall through the character controller's external push).

## 6. Sound and voice

`src/audio/SoundBank.ts` synthesises every sound effect and the Om chant at start-up (no audio files);
`AudioSystem.ts` routes them through Howler with per-room reverb and occlusion. Narration is
pre-rendered speech (`public/voice/`, produced by `tools/gen-voice.mjs` with the Apache-licensed
Kokoro model) played back by `src/audio/Voice.ts`.

## 7. State and saving

`src/state/store.ts` (Zustand) holds flags, quest, settings and the player's profile;
`src/systems/SaveSystem.ts` snapshots it to `localStorage` every 30 s and on task boundaries.
`src/systems/Leaderboard.ts` keeps the finished runs (name, rank, time, accuracy, hearts lost, one
score number) in `localStorage` and, only when `public/leaderboard.json` names a Supabase project,
posts each finished run once to its REST API and fetches the top 25; `src/ui/LeaderboardCard.ts` shows
both. Nothing else leaves the device.

## 8. Tests

`npm test` — unit tests (maths, store, data integrity, colour grading, terrain, voice manifest).
`npm run test:e2e` — Playwright: boots the world with zero console errors, real mouse look/fire, the
traveller and how-to-play cards, a full task with victory and defeat paths.
`tools/play-missions.mjs` plays all five tasks with real input (and the failure path);
`tools/attack-gallery.mjs` screenshots every attack; `tools/villain-gallery.mjs` renders the five
portraits; `tools/weapon-check.mjs` fires each weapon at a held villain; `tools/demo-video.mjs` records
the demo video.
