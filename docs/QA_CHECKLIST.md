# QA checklist

Run against `npm run preview` (production build). Automated items are covered by `npm run test:e2e`
and `node tools/play-missions.mjs`; manual items need a person.

## Boot & title
- [x] Title card shows the disclaimer; Enter / Continue / New game work; keyboard dismisses.
- [x] Zero console errors/warnings in the production build (asserted by tests).

## Mission flow
- [x] New game → "You are entering into Task 1." card → villain name, epithet, threat stars.
- [x] Narration reveals lines one by one; any key/tap advances; deep voice speaks (browsers with TTS voices).
- [x] After the narration the Astra appears in the hands; crosshair, ammo and villain bar appear; BEGIN.
- [x] Shooting damages the villain; its bar falls; shield phases absorb shots and show SHIELDED.
- [x] Villain attacks: bolts, volleys, charges, slams (rings), summons, illusions, teleports, pulls.
- [x] Player health bar drops; at 0 a heart is lost, HEART LOST banner, respawn at the arena entrance,
      the villain keeps its wounds, brief invulnerability.
- [x] Losing the third heart shows *Task N failed* with: Continue from the same stage · Play Task N−1 again ·
      Restart Task N · Choose a task.
- [x] Defeating the villain: TASK COMPLETE card → next task starts automatically with its own narration.
- [x] Task 8 victory shows the final card and the ending menu.
- [x] Difficulty escalates: health 220 → 1200, faster attacks, more patterns, enrage thresholds.
- [x] Save/continue resumes the current task, hearts and the villain's remaining health.
- [ ] Manual: TTS voice quality on Chrome/Safari/Android WebView; mute works via Options.

## Controls
- [x] Keyboard/mouse: WASD, Shift sprint, Space jump, Q dodge, LMB fire, RMB aim, R reload, Esc pause.
- [ ] Manual: gamepad (standard mapping) RT fire / LT aim / X reload / B dodge / Start pause.
- [ ] Manual: touch on a 6.1" phone — floating stick, swipe look, FIRE, reload, ◇ dodge, pause, tap compass for map.

## World
- [x] 64 m cell streaming with no >25 ms build step on the critical path (profiler `stream step max`).
- [x] All zones connect on foot (gate → courtyard → hall → passage → moon → tunnels → library → shrine → sanctum).
- [x] Story mode (`?mode=story`) still completes Prologue → Finale headlessly.

## Performance
- [x] Desktop: ≤ 900 draw calls, ≤ 1.4 M tris, 60 fps at 1280×720 on Apple M-series (profiler numbers in PROGRESS.md).
- [ ] Manual: mid-range 2022 Android phone at `?quality=low`/`medium` ≥ 30 fps; thermal step-down after 10 min.

## Mobile shells
- [ ] Manual: Android AAB installs; landscape-locked; immersive; back button opens pause; audio resumes after a call.
- [ ] Manual: iOS build via Xcode; status bar hidden; landscape only; wake lock.
