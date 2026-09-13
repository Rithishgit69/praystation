# Changelog

## 1.2.0 — 2026-09-14

- Combat rework: nothing homes any more. Every projectile flies straight from where it is thrown to
  where the player stood; every area effect is drawn on the floor before it hurts; the adjacent melee
  blow has a visible wind-up. Sidestepping, jumping and dodging now work against everything.
- Eight signature kits, one per asura: envy shards and the smothering orb; fire breath and burning
  charges; the curved sword's lunge-and-sweep and the returning blade; the hook-chain and coin mines;
  mace fissures and the three-blow flurry; arrow fans, arrow rain and the petal ring; root traps and the
  binding vine (shoot the knot); shard rings, spirals and the mirror that reflects frontal shots.
  Narration rewritten to describe each style (voice lines re-rendered); a fighting tip appears with
  the Astra.
- Asuras and shades now walk the floor with a character controller: stairs, ledges and floors of
  different heights, sliding around pillars and block stacks instead of through them. The Task 1 asura
  no longer fights half-buried in the colonnade floor; a stalled asura steps through the air to the
  player instead of pacing behind an obstacle.
- Library geometry fixed: the tunnels' climb corridor used to run straight through the library; it now
  ends at a new north door, the scribe's dais moved east of it, and Task 5 fights in the open east hall.
- Modelled villains: drop a `.glb` into `public/models/asuras/` and list it in `index.json` to replace
  any procedural stand-in (auto-fit, clip matching, hand/head nodes) — see `docs/VILLAINS.md`, which also
  lists the eight villains with looks briefs.
- "Your traveller" card before a new game: name the hero and choose the male or female traveller (two
  distinct outfits, live previews); the name shows in the HUD and messages; both can be changed in the
  pause menu. Profile is remembered between games and stored in saves.
- `?task=N` starts a new game at a task (testing); `tools/attack-gallery.mjs` screenshots every attack.

## 1.1.0 — 2026-09-13

- Fixed: clicks never reached the game view (a blanket `pointer-events` rule on HUD overlays swallowed
  them), so the mouse could not capture, look or fire, and touch sticks did not respond. Overlays are
  now click-through unless they are real UI.
- Mouse look works immediately (follows the pointer over the view); a click captures the pointer, with a
  HUD hint when the browser refuses pointer lock. Right-click no longer opens the context menu.
- "How to play" card before the first task and in the pause menu: objective, hearts / villain bar /
  magazine legend, and every keyboard+mouse, gamepad and touch control.
- Run: hold Shift (default) or toggle it (pause-menu option); gamepad Y jumps, D-pad up opens the
  journal; touch gains a jump button.
- Narration is now a humanised neural voice (Neerja, Indian English; Ava selectable), pre-rendered to
  MP3 by `tools/gen-voice.mjs` and streamed at run time — the Web Speech robot voice is gone. The
  typewriter paces itself to each clip; heart lost, task failed, task complete and the ending are spoken.
- A synthesised Om chant loops under play at −10 dB, ducked while the narrator speaks.
- Web-first delivery: `vercel.json` (Vite, `dist/`, cache headers), `.vercelignore`, narration clips
  cached by the service worker for offline replays.

## 1.0.0 — 2026-09-12

- Mission mode: eight tasks against the eight asuras of the Vinayaka Purana tradition, narrated villain
  cards, the Astra gun, three hearts, villain health bars, escalating difficulty, auto-advance and a
  failure menu with continue-from-stage / replay / restart / task select.
- Story mode (`?mode=story`): Prologue, Chapters I–VI and the Finale of the original design document,
  with the Memory Portal, eight puzzle types, the moonlight dual-state and the sunrise ending.
- 1.2 km streamed open world: forest approach, gate, courtyard (reference frame), Hall of Memories,
  Corrupted Passage, Moon Chamber, Serpent Tunnels, Ancient Library, Underground Shrine, Sealed Sanctum.
- Keyboard/mouse, gamepad and touch; PWA; Capacitor 8 Android (signed AAB) and iOS projects.
