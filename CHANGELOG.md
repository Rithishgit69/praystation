# Changelog

## 1.5.0 — 2026-09-22

- **The climax.** When the fifth asura falls, the temple's lord is revealed: before the mountain
  gateway the traveller kneels with joined hands and a small golden Ganesha idol rises to its full
  height while the diyas light one by one, marigold petals fall, the halo blazes, the Om swells, two
  bells toll and dawn comes up behind the gate (`src/missions/Climax.ts`, the ornate idol in
  `src/world/props/Statue.ts`); a new narrator line introduces Ekadanta. Then the results and the
  leaderboard. The figure is only revealed and honoured — never fought, handled or damaged.
- A small sandstone Ganesha shrine with two diyas now stands on the north dais of every arena, so the
  temple reads as his from Task 1.
- **Phones.** The game plays in landscape only: held upright it stands still behind a "turn your
  phone" card; the first tap asks the browser for fullscreen and a landscape lock. The temple map no
  longer opens from the compass in mission mode (it could not be closed by touch), and story mode's
  map gained a Close button and Esc.
- **Faster start.** Booting is about five times quicker on a phone: procedural textures bake at half
  resolution there, mission mode skips the story murals, and the sound bank now synthesises each
  sound on first use (fight sounds warmed in idle time behind the title card) instead of all fifty at
  once.
- **Animation.** The traveller's legs are now solved with two-bone IK from planted feet: each foot
  stays put through its stance and swings forward in an arc, knees bend and lock like real knees,
  the stride and cadence follow the speed, arm and hip swing are timed to the foot strikes, and the
  head turns toward the villain while no weapon is out. Villains recoil when hit and, when broken,
  reel back, collapse and dissolve as the vice burns out of them (no more shrinking away). The
  camera widens a little at a sprint, dips on landing and rolls a few degrees through a dodge.

## 1.4.0 — 2026-09-22

- **Room to fight.** Every task now takes place on its own purpose-built arena — a clear floor 60–70 m
  across with everything that could block a sidestep (pillars, braziers, shelves, mirror stands) at
  the rim — dressed after the temple room the villain belongs to: the Courtyard of the Arrogant under
  the moon, the Hall of the Wrathful with its roof open to the sky, the Library of the Grasping, the
  Moon Chamber of the Deluder; the last fight keeps the mountain gateway. The temple itself is
  untouched (story mode still walks it).
- **A real dodge.** Q (gamepad B, touch ◇) is a quick roll in the direction you are moving — straight
  back when standing still — with invulnerability while it lasts and a short cooldown. It was
  advertised before but did nothing in the fights.
- **Fewer controls, and a key that shows them.** Mission mode keeps eleven things: move, look, run,
  jump, dodge, fire, aim, reload, switch weapon, pause, and **B** (Back on a gamepad, ? on touch), which
  opens the controls card at any time and pauses the fight until it closes. Crouch, block, map,
  journal, interact and camera-reset keys are gone from mission mode — nothing to get stuck in. (Story
  mode keeps them.)
- **Animation.** The traveller walks and runs with knees that flex through the swing and land
  straight, hips that sway and roll, a torso that counter-twists and leans into acceleration and
  turns, a level head, arms that pump at a sprint; the legs turn toward the direction of travel while
  the body faces the aim; jumps tuck; the dodge is a full roll around the body; shots kick the arms and
  hits flinch; standing still, the weight shifts and the head glances around. The villains' walk gained
  hip yaw, torso counter-twist, arm swing and a weight shift while idle.
- Shared leaderboard: the Pages deploy reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` repository variables
  and writes `public/leaderboard.json` itself, so the shared board can be switched on from GitHub's
  settings without editing a file (`docs/LEADERBOARD.md`).
- Tools: `tools/arena-gallery.mjs` screenshots every arena.

## 1.3.0 — 2026-09-22

- **Five-task campaign.** The eight tasks are now five fights that climb steadily to a last one that
  demands everything: Madasura (blade), Krodhasura (bare hands), Lobhasura (horns), Mohasura (six arms),
  Ahamkarasura (fire) — health 260 → 1350, attack intervals 2.6 → 1.6 s, later enrage thresholds,
  shields on the last two. The narration was rewritten for the new order and re-rendered.
- **Villains built from the team's reference paintings** (`src/missions/AsuraDesigns.ts`): the comic-style
  blade warrior with the top-knot and gold pauldron; the sumo brute with the braided straw rope, tattoos
  and hakama; the buffalo-headed demon with curling horns and a mane; the floating three-faced, six-armed
  ascetic with white hair and golden scarves; the horned rakshasa king with the spired crown. Each has its
  own stance, walk, attack poses and idle life (breathing, scarf ripple, hover bob). Portrait sheet:
  `tools/villain-gallery.mjs`.
- **Every villain fights differently.** New attacks: the wrestler's *leap-slam* (a circle marks the
  landing, shock rings on impact) and the buffalo's *bellow* (a wall of air that shoves you back); horn
  strikes tear two fissures; the three-faced one floats and follows every teleport with a shard fan.
- **Four weapons, realistic handling.** The temple grants the Astra rifle (Task 1), the Dhanush bow
  (Task 2, hold to draw, full draw pierces and hits the core hardest), the Chakra returning disc (Task 3,
  cuts out and back) and the Vajra thunder burst (Task 4, six pellets with falloff, staggers). Switch with
  1–4, the wheel, X/Z, D-pad or the touch weapon button. Spread bloom and recoil, aim-down-sights that
  pulls the camera over the shoulder and tightens the spread, weapons held and pointed along the view,
  projectiles that leave the muzzle toward the crosshair, per-weapon reticles and tracers, and a granted
  banner with its spoken instruction.
- **Leaderboard.** Every finished run (name, hero, rank, time, accuracy, hearts lost, score) is recorded
  on the device and listed under *Leaderboard* on the title screen, in the pause menu and on the ending
  card; the ending card says where the run placed. An optional shared board for everyone reads two
  lines in `public/leaderboard.json` (Supabase REST, anon key; `docs/LEADERBOARD.md` has the SQL and
  policies). Partial runs (`?task=N` starts) rank C and are labelled.
- **Smoothness.** Effect lights come from a pool (no shader recompiles mid-fight), flames and sparks are
  one particle draw call, the device-pixel ratio is capped (1.5 high, 1.75 ultra), ambient occlusion and
  shadows are lighter on the high tier, and the canvas no longer preserves its drawing buffer. Frame-time
  probe at DPR 2: max 20 ms in a full fight.
- Fixed: a villain stayed lit pure white from the first hit onward (the hit flash never restored the
  design materials' own emissive), which also swamped the fight in bloom; the flash is now a short,
  restrained brightening. The rifle reloads on its own when the magazine empties (R still reloads early).
- Fixed: switching tabs on the title screen wrote a save, so the next visit offered *Continue* and
  skipped the traveller card; nothing is saved until a game has begun.
- Contest compliance: narration re-rendered with the Apache-licensed Kokoro-82M voices (Heart, Emma);
  analytics toggle removed; `public/privacy.html`, `docs/CREDITS.md`, `SUBMISSION.md`, `docs/CODE_WALKTHROUGH.md`;
  GitHub Pages deployment (`.github/workflows/deploy-pages.yml`) with the live link in the submission sheet.

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
