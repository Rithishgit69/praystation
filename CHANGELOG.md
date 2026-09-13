# Changelog

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
