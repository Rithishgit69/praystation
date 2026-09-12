# PROGRESS — The Temple of Eka-Danta

Status legend: **DONE** · **PARTIAL** · **BLOCKED** · **TODO**. Every GDD section and every brief
requirement is listed; nothing is marked DONE that has not been run and seen working.

## Build phases (brief §9)

| # | Phase | Status | Note |
|---|---|---|---|
| 1 | Foundation (Vite/TS/Three/Rapier, loop, profiler, input, dev menu) | DONE | `?scene=` + dev menu (F1) list every test scene; profiler F3. |
| 2 | Camera & controller on grey box | DONE | `?scene=greybox`. Spec numbers implemented literally; traversal verified headless (step 0.45 ok, 0.6 blocked, 45° ok). |
| 3 | Reference-frame recreation | PARTIAL | `?scene=courtyard`. Composition, palette logic, HUD and braziers match; see "Reference frame deltas" below. |
| 4 | World streaming + 1.2 km world, 8 zones | PARTIAL | `?scene=game` (+`&start=<zone>`). 64 m cells, cooperative async builds (≤3 ms/frame budget), radius from quality tier with +1 hysteresis, camera-direction priority, portal visibility sets, per-zone fog/ambient. All 11 zones block-built with real materials and colliders; interiors still need set dressing. Impostors beyond the load radius not yet built. |
| 5 | Core systems | TODO | |
| 6 | MVP vertical slice | TODO | |
| 7 | Chapters II–VI + Finale | TODO | |
| 8 | Moonlight dual-state across the world | TODO | |
| 9 | Audio / grade / particle / animation polish | TODO | |
| 10 | Performance + mobile + Capacitor + store package | TODO | Native signing is BLOCKED on this machine: no JDK, Android SDK, Xcode or CocoaPods installed. |
| 11 | QA sweep, release candidate | TODO | |

## Reference frame deltas (Phase 3)

- Camera framing follows the §2 numbers (character ≈ 22 % of frame). The reference frame is framed closer
  (~45 %) and lower; with the spec pitch the moonlit canopies top-left are above the frame. Documented in
  ARCHITECTURE.md; not changed because the numbers are explicit.
- Stone/floor detail is procedural (no sculpted carvings yet). Carved reliefs are planned for the art pass.
- Rain streaks not yet added (wet-stone specular is in).

## Non-negotiable quality bar (brief §1)

| Requirement | Status | Note |
|---|---|---|
| Zero console errors/warnings in production build | PARTIAL | Dev build is clean of errors; PCFSoftShadowMap warning fixed; verified per capture. Production build check pending. |
| No placeholder geometry visible in shipped world | PARTIAL | Courtyard fully textured; other zones TODO. Grey-box scene is a dev scene only. |
| No frame-time spikes > 25 ms in traversal/transitions | PARTIAL | Shader precompile on scene load; courtyard steady 2–4 ms on M-series. Streaming transitions TODO. |
| Debug/test scene per system | PARTIAL | greybox, courtyard. Others added with their systems. |
| Deterministic save/load | TODO | |
| Gamepad + KB/M + touch parity | PARTIAL | All three devices implemented in input layer; touch layout verified only in code, not on device. |

## GDD compliance

| § | Topic | Status | Note |
|---|---|---|---|
| 1–3 | Premise, two-layer structure, core fantasy | TODO | |
| 4 | Worldbuilding (original temple, moonlight trigger, night) | PARTIAL | Night, moonlight and fictional-temple framing in place; title card disclaimer shown. |
| 5 | Experience beats | TODO | |
| 6 | Core loop as a state machine | TODO | |
| 7 | Chapter structure (Prologue, I–VI, Finale) | TODO | |
| 8 | Ch I Broken Tusk | TODO | |
| 9 | Ch II Vakratunda & Matsarasura | TODO | |
| 10 | Ch III Curse of the Moon (dual-state) | TODO | |
| 11 | Ch IV Serpent Below | TODO | |
| 12 | Ch V Great Scribe | TODO | |
| 13 | Finale Sealed Sanctum | TODO | |
| 14 | Moment → feeling → method | TODO | |
| 15 | Exploration rules | TODO | |
| 16 | Eight puzzle types | TODO | |
| 17 | Combat philosophy | TODO | |
| 18 | Art direction (three grade LUTs, warm vs cool, particles) | PARTIAL | LUTs baked and blendable; fire, mist, fireflies, wet stone in; shafts/particles pass TODO. |
| 19 | Audio direction | TODO | |
| 20 | UI/UX (minimal, prompt-only, no markers, journal) | PARTIAL | HUD with auto-fade + Cinematic Mode flag in settings; journal TODO. |
| 21 | Knowledge-based progression | TODO | |
| 22 | First 20 minutes | TODO | |
| 23 | MVP vertical slice | TODO | |
| 24 | Technical systems / Memory Portal | TODO | |
| 25 | Ethical & cultural guidelines | PARTIAL | Title-card disclaimer; per-chapter Inspirations notes TODO. |
| 26–27 | Pitch & vision | — | Store copy TODO. |

## Performance (last measured, desktop Apple M-series, 1280×720, headless Chromium)

| Scene | Draw calls | Triangles | Frame ms | Render scale |
|---|---|---|---|---|
| courtyard (standalone) | 236 | 509 k | 2.5–4 | 1.0 |
| game, forest spawn | 395 | 298 k | 7–9 | 1.0 |
| game, courtyard | 485 | 1.05 M | 13 | 0.75 |
| game, hall | 430 | 838 k | 12 | 0.9 |
