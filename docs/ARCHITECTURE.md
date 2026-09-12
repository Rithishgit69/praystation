# Architecture — The Temple of Eka-Danta

This document records the shape of the codebase and every decision that was made without asking,
with the reasoning. The GDD (`reference/GDD.pdf`, text in `reference/GDD.txt`) is the contract; the
reference frame (`reference/reference-frame.jpg`) is the visual target.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Language / build | TypeScript 5.9 strict, Vite 7 | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, no `any`. |
| Rendering | Three.js r186, `WebGLRenderer` (WebGL2 only in r186) | Post chain in `src/engine/PostFX.ts`. WebGPU path is behind `?webgpu=1` (see below). |
| Physics | `@dimforge/rapier3d-compat` 0.20 | The `-compat` build inlines the WASM as base64 so there is no separate `.wasm` fetch, which keeps Capacitor WebViews and the offline PWA simple. |
| Audio | Howler.js (positional one-shots) + Web Audio graph (procedural ambience) | Howler owns the AudioContext; ambience beds are synthesised nodes on the same context. |
| State | Zustand vanilla store (`src/state/store.ts`) | Everything the save system persists lives in the store snapshot. |
| Cinematics | GSAP timelines | Chapter transitions, memory entry/exit. |
| Mobile | Capacitor 8 | See *Deviations*. |
| Tests | Vitest (systems), Playwright (smoke/perf, headless Chromium with Metal ANGLE) | `tools/shot.mjs` is the screenshot + scripted-input harness used for visual verification. |

## Deviations from the brief (decided, not asked)

- **Capacitor 8 instead of Capacitor 6.** The brief also requires "target SDK current" and 16 KB page-size
  compatibility; Google Play requires targetSdk 35 and 16 KB page-size support for new submissions in
  2026, and Capacitor 6 cannot satisfy either. Capacitor 8 is the current major with the same API surface
  used here (`@capacitor/core`, `android`, `ios`, `app`, `screen-orientation`, `status-bar`).
- **SMAA instead of temporal AA on the WebGL2 path.** Three's WebGL2 addons have no motion-vector TAA
  (`TAARenderPass` only accumulates when the camera is static). SMAA is used; the WebGPU node path has
  TRAA and is where true temporal AA lives.
- **No point-light shadows.** A shadow-casting point light is six extra scene passes. The moon is the
  single shadow caster; braziers are unshadowed point lights (nearest few) or baked glow cards + floor
  cookies (far torches), exactly as the brief's §6 asks.
- **Camera numbers win over the reference framing.** §2 gives literal rig numbers (4.8 m boom, 2.35 m
  pivot, 38° pitch, 58° FOV) and also says the character occupies ~22 % of screen height. Those numbers
  produce a ~20–22 % character; the reference image itself was framed much closer (~45 %). The rig uses
  the numbers; the moonlit tree canopies visible top-left in the reference are above the top of frame at
  that pitch and are only visible when the player looks up.
- **Procedural assets at runtime.** All textures are generated on load (`src/world/TextureGen.ts`),
  deterministic and tileable, instead of shipping PNG/KTX2 files. This keeps the install tiny and every
  asset licence-clean. KTX2/Basis transcoding is therefore not part of the pipeline; see PROGRESS.md.

## Engine loop (`src/engine/Engine.ts`)

```
requestAnimationFrame
  input.update(dt)                    merge KB+M / gamepad / touch → InputFrame, edge detection, 150 ms buffer
  accumulate dt; while ≥ 1/60:        systems.fixedUpdate(step) → physics.step()      (max 4 steps/frame)
  systems.update(dt)                  gameplay, effects, animation
  systems.lateUpdate(dt)              camera rig (reads final player transform)
  quality.tick(frameMsEma)            dynamic resolution 0.6–1.0, thermal step-down
  postfx.render()                     RenderPass → GTAO → Bloom → Output(ACES+sRGB) → LUT grade → SMAA
  profiler.endFrame()
```

Systems are plain objects implementing `System` (`src/engine/types.ts`); a `SceneModule` registers the
systems it needs and disposes them. Every debug/test scene is a `SceneModule` listed in
`src/scenes/registry.ts`, reachable from the dev menu (F1 / ` / Select+Start / triple-tap) or `?scene=id`.

## Post-processing and colour

- The three grade LUTs (present = cool blue/silver, memory = warm gold, corruption = dark high-contrast)
  are baked at startup from parametric grades (`src/engine/Grade.ts`) into 32³ float LUTs. A working LUT
  is blended between any two on the CPU (131 KB) and re-uploaded only when the mix changes, so chapter
  state transitions are a single GSAP tween of `mix`.
- The LUT is applied **after** tone mapping. Applying a display-referred contrast curve to linear HDR
  values crushed a night scene's darks by ~4×; the probe in the Phase 3 log records this.
- `FilteredGTAOPass` hides sprites, points, transparent, additive and alpha-tested objects during the
  GTAO normal/depth pre-pass. Without it, additive glow cards are written as opaque quads into the AO
  depth and render as black rectangles.

## Rendering budget strategy

- Rigid stone per zone is merged into one mesh per material (`mergeStaticChildren`), with vertex colours
  carrying moss/dirt weathering. Ivy leaves, tree trunks and canopy cards are `InstancedMesh`.
- Torches use a cylindrical-billboard flame shader, two additive glow sprites, ember points and — only
  for the nearest few — an unshadowed point light. Far torches get additive floor/wall cookies.
- The renderer's `info.autoReset` is off and reset once per frame so the profiler counts every pass.

## Player (`src/player`)

- `PlayerController` is a Rapier kinematic capsule (0.4 × 1.8) driven through `KinematicCharacterController`
  with autostep 0.45 m, slope limit 48°, snap-to-ground, coyote 120 ms, buffered jump 150 ms, walk/jog/sprint
  2.2/4.4/6.6 m/s, acceleration 12, friction 14, air control 0.25, stamina. Render position is interpolated
  between fixed steps.
- `CameraRig` implements §2 literally: sphere-cast probe (0.35 m) that pulls in immediately and eases back
  over 0.25 s, auto-realign after 1.2 s of forward travel (lerp 6), ±0.4° Perlin handheld noise while idle,
  never cuts.
- `CharacterMesh` is a procedural, code-animated traveller (messy dark hair tufts, crimson scarf with
  CPU-simulated tails, grey-brown coat, backpack with straps). Static parts are merged per bone.

## Debug / test surface

`window.__eka` (`src/debug/DebugApi.ts`) exposes readiness, frame stats, player position, camera control
and synthetic key events for Playwright. `tools/shot.mjs <url> <out.png> "<steps>"` drives it headlessly.
