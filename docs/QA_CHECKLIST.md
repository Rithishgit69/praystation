# QA checklist

Run against `npm run preview` (production build). Automated items are covered by `npm run test:e2e`
and `node tools/play-missions.mjs`; manual items need a person.

## Boot & title
- [x] Title card shows the disclaimer; Enter / Continue / New game work; keyboard dismisses.
- [x] Zero console errors/warnings in the production build (asserted by tests).

## Mission flow
- [x] New game → "Your traveller" (name, male/female) → "How to play" card → Begin; the name shows in the HUD.
- [x] Every projectile flies straight and can be sidestepped; floor effects are marked before they hurt; the
      adjacent melee blow winds up first. Asuras climb stairs and walk around block stacks (no clipping).
- [x] "You are entering into Task 1." card → villain name, epithet, threat stars.
- [x] Narration reveals lines one by one, paced to the narrator's voice clip; any key/tap advances;
      Backspace or the Skip button skips the introduction.
- [x] After the narration the task's weapon is granted (banner + spoken line); crosshair, ammo, weapon
      strip and villain bar appear; BEGIN.
- [x] Shooting damages the villain; its bar falls; shield phases absorb shots and show SHIELDED. All
      four weapons hit a held villain (`tools/weapon-check.mjs`); switching with 1–4, wheel, X/Z.
- [x] Villain attacks, one style each: blade combo + returning blade; leap-slam + flurry; horn fissures +
      bellow + shades; shard fans + illusions + spirals + teleports; flame breath + fire charge + orb + mirror.
- [x] Player health bar drops; at 0 a heart is lost, HEART LOST banner, respawn at the arena entrance,
      the villain keeps its wounds, brief invulnerability.
- [x] Losing the third heart shows *Task N failed* with: Continue from the same stage · Play Task N−1 again ·
      Restart Task N · Choose a task.
- [x] Defeating the villain: TASK COMPLETE card → next task starts automatically with its own narration.
- [x] Task 5 victory shows the final card, the results table, "Recorded: #N on this device" and the
      ending menu (Leaderboard · Play any task again · New game · Return to title).
- [x] Difficulty escalates: health 260 → 1350, attack interval 2.6 → 1.6 s, more patterns, later enrage,
      shields on Tasks 4–5; the perfect-aim bot fails Task 5 before finishing it from the same stage.
- [x] Leaderboard opens from the title (`Leaderboard`), the pause menu and the ending; "This device" lists
      runs; "Everyone" appears only when `public/leaderboard.json` names a backend.
- [x] Save/continue resumes the current task, hearts and the villain's remaining health.
- [x] Narrator clips load and play (asserted); Om chant loops under play at −10 dB and dips under narration.
- [ ] Manual: narrator choice (Heart / Emma) and narration volume in the pause menu on Chrome, Safari, Firefox.
- [ ] Manual: shared leaderboard against a real Supabase project (insert + top-25 fetch).

## Controls
- [x] Keyboard/mouse with real browser events: mouse look follows the pointer before capture, a click on the
      view captures it (hint shown until then), LMB fires, RMB aims, Shift runs (hold or toggle option),
      Space jump, Q dodge (a roll: moves > 1.8 m, i-frames), R reload, Esc pause, B shows the controls
      card and sets timeScale 0 until it closes. C / F / M / J / V / E do nothing in mission mode.
      Right-click does not open the context menu.
- [x] Every arena floor is clear: the bot's five-task run crosses each with no clipping, and
      `tools/arena-gallery.mjs` shows the rim dressing only.
- [ ] Manual: pointer lock in Chrome, Safari and Firefox; Esc releases, click recaptures.
- [ ] Manual: gamepad (standard mapping) RT fire / LT aim / X reload / B dodge / Start pause.
- [ ] Manual: touch on a 6.1" phone — floating stick, swipe look, FIRE, reload, ◇ dodge, pause, tap compass for map.

## World
- [x] 64 m cell streaming with no >25 ms build step on the critical path (profiler `stream step max`).
- [x] All zones connect on foot (gate → courtyard → hall → passage → moon → tunnels → library → shrine → sanctum).
- [x] Story mode (`?mode=story`) still completes Prologue → Finale headlessly.

## Performance
- [x] Desktop: ≤ 900 draw calls, ≤ 1.4 M tris, 60 fps at 1280×720 on Apple M-series (profiler numbers in PROGRESS.md).
- [x] No shader recompiles mid-fight (program count stable through a full fight); max frame 20 ms at DPR 2.
- [ ] Manual: mid-range 2022 Android phone at `?quality=low`/`medium` ≥ 30 fps; thermal step-down after 10 min.

## Mobile shells
- [ ] Manual: Android AAB installs; landscape-locked; immersive; back button opens pause; audio resumes after a call.
- [ ] Manual: iOS build via Xcode; status bar hidden; landscape only; wake lock.
