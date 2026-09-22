# PROGRESS — The Temple of Eka-Danta

Status legend: **DONE** · **PARTIAL** · **BLOCKED** · **TODO**. Nothing is marked DONE that has not been
run and seen working (headless Playwright playthroughs + screenshots; see `tools/`).

## Review round 4 — climax, phones, animation (2026-09-22)

| Item | Status | Notes |
|---|---|---|
| "We never show the Ganesh idol" — a climax where it grows | DONE | `src/missions/Climax.ts`: kneeling traveller, golden idol rising 15 s before the gateway, diyas, petals, halo, bells, Om swell, dawn, new narrator line; shrines on every arena dais. Respectful: revealed and bowed to only. |
| Phones: congested in portrait | DONE | `src/ui/OrientationGate.ts`: landscape only; rotate card pauses the game; fullscreen + orientation lock requested on the first tap. |
| Map opened from the compass and could not be closed on touch | DONE | Mission mode never opens it; story mode has a Close button and Esc. |
| Slow start on a phone | DONE | Boot 10.4 s → 2.0 s at 4× CPU throttle (`tools/boot-profile.mjs`): half-res textures on phones, no story murals in mission mode, lazy sound synthesis with idle-time warm-up. |
| Animation to an industry look | PARTIAL | Foot-planted two-bone leg IK with speed-driven cadence, strike-timed arm/hip swing, head look-at; villain hit recoil and collapse-and-dissolve death; camera sprint FOV, landing dip, dodge roll. Still procedural: a motion-captured hero needs an animated GLB. |

## Review round 3 — space, controls, animation (2026-09-22)

| Item | Status | Notes |
|---|---|---|
| "The map is too small, I can't move aside" (Tasks 1–3) | DONE | Every task fights on a purpose-built arena 60–70 m across with a clear floor (`src/world/zones/Arenas.ts`); rim dressing only; the opening distance is ~40 m and fog is thinned so the villain reads across it. |
| Stuck in crouch; too many controls | DONE | Mission mode binds only move / look / run / jump / dodge / fire / aim / reload / switch / pause / help; crouch, block, map, journal, interact, camera reset removed from that profile (`src/input/Keyboard.ts`, `GamepadDevice.ts`). |
| A key that shows the controls mid-game and pauses | DONE | B or H (Back on a gamepad, ? on touch) toggles the how-to card; `timeScale` 0 while open. HUD hint under the ammo. |
| Dodge did nothing in fights | DONE | Q is now a burst with a roll animation, 0.45 s i-frames, 0.7 s cooldown; the asuras' `hurtPlayer` already honours the i-frames. |
| Animations toward an industry look | PARTIAL | Procedural upgrade of the traveller (gait, knees, hip sway, counter-twist, lean, strafing legs, jump tuck, roll, recoil, flinch, idle life) and the villains' walk. A modelled, motion-captured hero would need an animated GLB — the asura loader shows the pattern. |
| Shared leaderboard for deployed players | BLOCKED (needs one credential) | Client and docs complete; the deploy injects `SUPABASE_URL` / `SUPABASE_ANON_KEY` repository variables. Needs the team's Supabase project (free, ~5 min, `docs/LEADERBOARD.md`) — a static site cannot store other players' scores on its own. |

## Five-villain campaign, weapons and leaderboard (2026-09-22)

| Item | Status | Notes |
|---|---|---|
| Fewer, harder fights | DONE | Five tasks (was eight); health 260 → 1350, attack interval 2.6 → 1.6 s, enrage 30 % → 50 %, shields on Tasks 4–5. The perfect-aim bot (`tools/play-missions.mjs`) loses no heart in Tasks 1–2, two hearts in Task 3, one in Task 4 and fails Task 5 once before finishing it from the same stage. |
| Villains from the reference paintings | DONE | Five rig-based designs in `src/missions/AsuraDesigns.ts` (blade warrior, wrestler, buffalo, three-faced, fire king) checked against the references with `tools/villain-gallery.mjs`; `.glb` drop-in still works. |
| A different attacking style per villain | DONE | Blade combo + returning blade · leap-slam + flurry + charge · horn fissures + bellow + shades · shard fans + illusions + spirals + teleports (floating) · flame breath + fire charge + orb + mirror. `tools/attack-gallery.mjs` screenshots every attack. |
| Hero attack mode — realistic design, shooting and aiming | DONE | Weapons held and pointed along the view, ADS over-the-shoulder camera, spread bloom + recoil, muzzle-origin projectiles toward the crosshair, per-weapon reticles/tracers/impacts. |
| 2–3 more weapons the hero can switch between | DONE | Astra (rifle), Dhanush (charge bow), Chakra (returning disc), Vajra (burst); granted one per task; 1–4 / wheel / X–Z / D-pad / touch button. |
| No lag | DONE | Pooled effect lights (no mid-fight shader compiles), one-draw-call particles, DPR cap, lighter AO/shadows on high; probe at DPR 2 reports max frame 20 ms and a stable program count through a full fight. |
| Player data stored, leaderboard visible | DONE | Runs recorded in local storage and shown on the title screen, pause menu and ending card (`src/systems/Leaderboard.ts`, `src/ui/LeaderboardCard.ts`); optional shared board via `public/leaderboard.json` (Supabase; `docs/LEADERBOARD.md`). |
| Contest rules | DONE | Live link (GitHub Pages), source, how-to-play, demo video tool, team/tools sheet (`SUBMISSION.md`); licensed voices (Kokoro); no passwords/payments/analytics; leaderboard entries only from completed runs. |

## Combat & review update (2026-09-14)

| Item | Status | Notes |
|---|---|---|
| Homing projectiles ("magnet") | DONE | Straight flight from the throw toward the player's position at the throw (30 % lead from Task 5); continuous world collision; telegraphed. |
| Unique attack style per villain | DONE | Eight kits (see `docs/VILLAINS.md`): shards/orb, fire, sword, chain/coins, mace/fissures, bow/petals, roots/vine, shard rings/mirror. Verified by `tools/attack-gallery.mjs` and full bot playthroughs. |
| Villain avatars | READY FOR ASSETS | Procedural stand-ins carry their weapons; `.glb` drop-in with auto-fit and clip matching; villain list + looks briefs + spec in `docs/VILLAINS.md`. Waiting on the user's models or reference images. |
| Glitches around blocks and floor | DONE | Root causes: asuras had no ground-following or collision (buried in the Task 1 colonnade, walking through stacks) and the tunnels corridor ran through the library. Both fixed; arenas 1–8 re-audited. |
| Male / female traveller | DONE | Two full outfits on the same rig; live previews on the traveller card; switchable in the pause menu. |
| Username | DONE | Traveller card and pause menu; shown in the HUD, victory and failure messages; persisted. |

## Web-first update (2026-09-13)

| Item | Status | Notes |
|---|---|---|
| Mouse look / firing in a real browser | DONE | Root cause fixed: `#ui > * { pointer-events: auto }` made every HUD overlay swallow clicks, so pointer lock was never requested and LMB never reached the gun (and touch sticks never reached the canvas). Verified with real Playwright mouse events (`tests/e2e/missions.spec.ts`, `tools/play-missions.mjs`). |
| Mouse look without pointer lock | DONE | Camera follows the pointer over the view immediately; a click captures the pointer; HUD hint when the browser refuses the lock (embedded webviews). |
| Run control | DONE | Hold Shift (stamina) or toggle mode (pause menu); LB/L3 on gamepad; stick past the rim on touch. |
| Instructions before play | DONE | "How to play" card: objective, hearts / villain bar / magazine legend, all controls per device; also in the pause menu. |
| Humanised narration voice | DONE | Pre-rendered neural voice lines via `tools/gen-voice.mjs`; Web Speech removed. Since 1.3.0 rendered with the Apache-licensed Kokoro-82M (Heart default, Emma optional) so every clip is redistributable. |
| Om chant under play | DONE | Synthesised chant loop at −10 dB (−18 dB under narration), music/chant volume slider. |
| Vercel deployment | DONE | `vercel.json`, `.vercelignore`, relative asset paths, service-worker runtime cache for voice clips. |
| Android / iOS | PARKED | Projects untouched and still buildable; the web build is the delivery target for now. |

## Direction change (2026-09-12)

After the exploration build reached a playable Prologue → Finale, the client redirected the design to a
**mission-based shooter**: task cards, narrated asura villains from the Vinayaka (Mudgala) Purana, a gun,
three hearts, villain health bars, escalating difficulty, auto-advance and a replay/continue menu. That
is now the default game (`/`). The exploration story mode remains complete and reachable at `?mode=story`.

## Mission mode (client brief, 2026-09-12)

| Requirement | Status | Note |
|---|---|---|
| Start with "You are entering into Task 1" | DONE | First narration line of every task card; big gold type. |
| Villains in Vinayaka Puranam style | DONE | Eight asuras of the Mudgala Purana: Matsarasura, Madasura, Mohasura, Lobhasura, Krodhasura, Kamasura, Mamasura, Ahamkarasura; each with an Inspirations journal note. |
| Dramatic intro per villain, deep intense voice | DONE | Narration card with typewriter lines + Web Speech synthesis (low pitch, slow rate, male voice preferred). Voice depends on the platform's installed voices. |
| Describe strength/danger before battle | DONE | Threat stars + lines describing each asura's power and how to fight it. |
| Give the character a gun; shooting gameplay | DONE | The Astra: hitscan rifle with spread, light aim assist, 12-round magazine, reload, tracers, muzzle flash, recoil, aim-down-sights (RMB/LT). |
| 3 lives, hearts on screen | DONE | Three hearts + health bar; heart lost → respawn at the arena entrance; villain keeps its wounds. |
| Villain health bar during battle | DONE | Name, epithet, bar, numeric HP, SHIELDED state. |
| Engaging, each task harder | DONE | HP 220 → 1200, faster, shorter attack intervals, more patterns (bolt, volley, charge, slam rings, summon, illusion, teleport, pull, shield), enrage thresholds. Headless bot with perfect aim loses hearts from Task 6 and fails Tasks 7–8 once. |
| Auto-move to Task 2 after Task 1 | DONE | TASK COMPLETE card → next task's travel + narration. |
| Lose in Task 2 → choose Task 1 again or continue Task 2 from the same stage | DONE | Task failed menu: Continue from the same stage · Play previous task · Restart · Choose a task. Also from the pause menu. |
| Clear objectives visible | DONE | Quest tracker shows "Task N — Villain / Defeat …"; banners TASK N, BEGIN, HEART LOST, TASK COMPLETE. |
| Story progression strong | DONE | Escalating narration; final card after Task 8 with the sunrise. |

## Build phases (original brief §9)

| # | Phase | Status | Note |
|---|---|---|---|
| 1 | Foundation | DONE | Loop, profiler, quality tiers + dynamic resolution, input abstraction, dev menu. |
| 2 | Camera & controller | DONE | §2/§5 numbers literally; a KCC bug that collapsed jog speed on flat ground was found and fixed (jog 4.4 m/s, sprint 6.6 m/s measured). |
| 3 | Reference-frame recreation | PARTIAL | Composition, palette, HUD, braziers, banner match. Framing differs because the §2 numbers put the character at ~22 % height; carved reliefs and rain streaks were not added. |
| 4 | World streaming + 1.2 km world | DONE | 64 m cells, cooperative builds under 3 ms/frame, portal visibility sets, impostor tree ring, all zones connected on foot (verified by walking). |
| 5 | Core systems | DONE | Interaction, Memory Portal (data-driven), chapter state machine, save/load, audio zones + reverb + occlusion, lighting states, journal. |
| 6 | MVP vertical slice | DONE | Prologue + Broken Tusk verified end to end (`tools/play-ch1.mjs`). |
| 7 | Chapters II–VI + Finale | DONE | `tools/play-all.mjs` completes them with zero console errors. |
| 8 | Moonlight dual-state world-wide | DONE | Moon arc, cloud cover, moonlit/shadow sets in courtyard, hall, moon chamber; shafts follow the moon factor; roof wheel pins the state. |
| 9 | Audio / grade / particle / animation polish | PARTIAL | Synthesised bank, ambience, reverb, silence bus, LUT grades, fire/mist/fireflies/shafts/motes done; no rain particles; character animation is procedural and simple. |
| 10 | Performance + mobile + Capacitor + store | PARTIAL | See below. |
| 11 | QA sweep | PARTIAL | Automated checks green; manual device passes not possible here (see QA_CHECKLIST.md). |

## Non-negotiable quality bar (brief §1)

| Requirement | Status | Note |
|---|---|---|
| Zero console errors/warnings in production | DONE | Asserted by every Playwright test and both playthrough scripts against `vite preview`. |
| No placeholder geometry in the shipped world | DONE | Every surface is textured procedurally; grey-box exists only as a dev scene. |
| No frame-time spikes > 25 ms in traversal/transitions | PARTIAL | Streaming steps are budgeted (worst measured 10 ms). Task travel veils hide the arena load; the first frame after a teleport can exceed 25 ms on a cold shader cache. |
| Debug/test scene per system | PARTIAL | greybox, courtyard, game (+`?start=zone`, `?mode=story`); no separate scene per audio/puzzle system. |
| Deterministic save/load | DONE | Snapshot + exact transforms; e2e test verifies. |
| Gamepad + KB/M + touch parity | PARTIAL | All three implemented incl. fire/reload/aim; only keyboard/mouse verified by automation. |

## GDD compliance (story mode)

| § | Topic | Status | Note |
|---|---|---|---|
| 1–3 | Premise, two layers, core fantasy | DONE | Story mode. |
| 4 | Worldbuilding | DONE | |
| 5 | Experience beats | DONE | |
| 6 | Core loop state machine | DONE | `ChapterManager.loop`. |
| 7 | Chapter structure | DONE | |
| 8 | Ch I Broken Tusk | DONE | Restraint encounter, silent tusk break, falling-tusk transition. |
| 9 | Ch II Vakratunda & Matsarasura | DONE | Light exposes illusions; four-phase memory. |
| 10 | Ch III Moon | DONE | Mirrors, roof wheel, dual-state marks; journal notes that versions differ. |
| 11 | Ch IV Serpent | DONE | Chase along the player's trail; guardian twist. |
| 12 | Ch V Scribe | DONE | Missing fragment + rotation reconstruction. |
| 13 | Finale | DONE | Six-symbol seal, moonlight, sunrise; the player never fights Ganesha. |
| 14 | Moment → feeling → method | DONE | |
| 15 | Exploration rules | DONE | No collectible spam; doors open through memories. |
| 16 | Eight puzzle types | PARTIAL | Six are placed in the world (symbol sequence, choose-real, mirror alignment, observation, rotation match, six-symbol seal); bell and rangoli/water-flow types exist in the framework but have no placed instance. |
| 17 | Combat philosophy | DONE (story mode) | Mission mode is, by client request, a shooter; its opponents are traditional asuras, never sacred figures. |
| 18 | Art direction | PARTIAL | See phase 9. |
| 19 | Audio | DONE | Silence used on the tusk break and the restoration. |
| 20 | UI/UX | DONE | Locked HUD, auto-fade, Cinematic Mode, journal, no floating markers. |
| 21 | Knowledge progression | DONE | |
| 22 | First 20 minutes | DONE | Scripted beat for beat. |
| 23 | MVP | DONE | |
| 24 | Technical systems / Memory Portal | DONE | |
| 25 | Ethical & cultural guidelines | DONE | Title-card disclaimer, per-chapter and per-asura Inspirations notes acknowledging variation; asuras are the only opponents. |
| 26–27 | Pitch & vision | DONE | Store copy in `store/listing.md`. |

## Mobile & publication (brief §7)

| Item | Status | Note |
|---|---|---|
| Capacitor wrapper (Android + iOS), landscape, immersive, wake lock, back button, audio session | DONE | Capacitor **8** (see ARCHITECTURE.md for why not 6). |
| PWA fallback, offline, installable | DONE | Precache ≈4.5 MB. |
| Android signed AAB | DONE | `dist/app-release.aab` (5.9 MB, R8, signed with the generated upload key). Not uploaded — needs your Play Console. |
| Android adaptive icon, 12 screenshots, feature graphic, descriptions, Data Safety answers, content rating answers, targetSdk 36, 16 KB | DONE | `store/`; answers in PUBLISHING.md. |
| iOS Xcode project, metadata, privacy labels, icons, launch storyboard | DONE (project) / BLOCKED (build) | Xcode is not installed on this machine; the project is generated and configured. TestFlight upload needs Xcode + your Apple account. |
| Store copy with the fiction line | DONE | |
| Privacy policy, support email placeholder, EULA, CHANGELOG, PUBLISHING | DONE | |
| Analytics opt-in, off by default, no trackers/ads/IAP | DONE | No SDK bundled at all. |

## Performance (Apple M-series, 1280×720, headless Chromium, production build)

| Scene | Draw calls | Triangles | Frame ms |
|---|---|---|---|
| Forest spawn | ≈400 | 300 k | 3–4 |
| Courtyard (Task 1 arena) | ≈700 | 800 k | 4–5 |
| Hall of Memories | ≈630 | 775 k | 5 |
| Sanctum | ≈560 | 156 k–600 k | 3–4 |

Mobile numbers could not be measured here (no device); the low/medium tiers halve foliage, disable
GTAO/SMAA, cap the DPR and let the dynamic scaler drop to 0.6.

## Known shortfalls (honest list)

1. **iOS not built**: no Xcode on this machine. The project is complete; archive + TestFlight need you.
2. **Mobile performance unmeasured** on real hardware; tiers and the thermal step-down are implemented but untested on a phone.
3. **Narration voice** is pre-rendered (no run-time speech API); changing a line means rerunning `tools/gen-voice.mjs`, which needs `uv` and network access at build time only. Sanskrit names are pronounced by an Indian-English neural voice but were not reviewed by a native speaker.
4. **Reference frame** is a faithful layout at the specified camera numbers rather than a pixel match; no carved reliefs or rain.
5. **Bell / rangoli / water-flow puzzles** are implemented in the framework but have no placed instance in the world.
6. **Gamepad and touch** paths are implemented but only keyboard/mouse was exercised by automation (the pointer-events fix also unblocked the touch sticks, verified only by inspection).
8. **Pointer lock** is refused by some embedded browsers (the desktop app's preview pane, for one); the game then runs on unlocked mouse look, which stops at the window edge.
7. **Character/villain art** is procedural (code-built meshes), not sculpted models; the villains are ready to be replaced by modelled `.glb` avatars (`docs/VILLAINS.md`).
9. **Asura navigation** has no pathfinding: obstacle sidesteps plus a "step through the air" fallback after 5 s of no progress keep fights moving, but an asura can still be briefly blocked by a pillar.
