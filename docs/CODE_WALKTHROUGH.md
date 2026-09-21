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
walk/jog/sprint speeds, acceleration and friction, jump with coyote time and an input buffer, crouch,
dodge with invulnerability frames, stamina. It reads the merged input frame and writes a position;
`src/player/PlayerVisual.ts` + `CharacterMesh.ts` draw and animate the procedural traveller (male or
female outfit on the same rig) at that position. `src/player/CameraRig.ts` is the third-person spring
arm: yaw/pitch from the mouse, a collision probe so walls never hide the hero, and auto-realign.

## 3. The world

`src/world/WorldStreamer.ts` streams the 1.2 km temple in 64 m cells around the player; each zone is a
generator (`src/world/zones/*.ts`) that yields between build steps so streaming never stalls a frame.
All geometry, textures, murals and glyphs are generated in code (`src/world/props`, `MuralArt.ts`,
`TextureGen.ts`) — there are no art files in the repository.

## 4. A task, start to finish

`src/missions/MissionDirector.ts` is the state machine: `travel → narration → arming → battle →
victory | failed → next task`. It shows the villain card (`Narration.ts`, typewriter paced to the
pre-rendered voice clip), hands over the Astra (`Gun.ts`: hitscan from the crosshair with spread, light
aim assist, magazine and reload), tracks hearts and health, saves progress, and on defeat opens the
choice menu (`TaskMenu.ts`). Per-task stats feed the rank card at the end.

## 5. A villain

`src/missions/Asura.ts` is one boss: it walks the floor with its own character controller
(`AsuraBody.ts`), keeps its preferred distance, and picks attacks from its kit on a timer that shortens
as it is wounded. Attacks are built from two toolkits — `Projectiles.ts` (straight-line flight, world
collision, sphere test against the player; nothing homes) and `Hazards.ts` (telegraph circles, shock
rings, burning ground, coin mines, fissures, root traps, arrow rain, the petal ring, the flame cone).
Each asura's kit, stats and narration live in `src/missions/MissionData.ts`; the procedural avatar with
its weapon is `AsuraMesh.ts`, and a modelled `.glb` can replace it through `AsuraModel.ts`.

## 6. Sound and voice

`src/audio/SoundBank.ts` synthesises every sound effect and the Om chant at start-up (no audio files);
`AudioSystem.ts` routes them through Howler with per-room reverb and occlusion. Narration is
pre-rendered speech (`public/voice/`, produced by `tools/gen-voice.mjs` with the Apache-licensed
Kokoro model) played back by `src/audio/Voice.ts`.

## 7. State and saving

`src/state/store.ts` (Zustand) holds flags, quest, settings and the player's profile;
`src/systems/SaveSystem.ts` snapshots it to `localStorage` every 30 s and on task boundaries. Nothing
leaves the device.

## 8. Tests

`npm test` — unit tests (maths, store, data integrity, colour grading, terrain, voice manifest).
`npm run test:e2e` — Playwright: boots the world with zero console errors, real mouse look/fire, the
traveller and how-to-play cards, a full task with victory and defeat paths.
`tools/play-missions.mjs` plays all eight tasks with real input; `tools/attack-gallery.mjs` screenshots
every attack.
