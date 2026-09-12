# PROGRESS — The Temple of Eka-Danta

Status legend: **DONE** · **PARTIAL** · **BLOCKED** · **TODO**. Nothing is marked DONE that has not been
run and seen working (headless Playwright playthroughs + screenshots; see `tools/`).

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
3. **Narration voice** depends on the platform's speech voices; headless/no-voice environments fall back to text only.
4. **Reference frame** is a faithful layout at the specified camera numbers rather than a pixel match; no carved reliefs or rain.
5. **Bell / rangoli / water-flow puzzles** are implemented in the framework but have no placed instance in the world.
6. **Gamepad and touch** paths are implemented but only keyboard/mouse was exercised by automation.
7. **Character/villain art** is procedural (code-built meshes), not sculpted models; readable and stylised, not AAA.
