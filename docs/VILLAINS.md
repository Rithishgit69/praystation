# The five asuras — villain list, reference mapping and avatar hand-off

The campaign is five fights, each against one asura of the Vinayaka (Mudgala) Purana tradition — each
the embodiment of a vice, each subdued in tradition by a form of Ganesha (never shown fighting). The
avatars are built in code (`src/missions/AsuraDesigns.ts`) from the five reference paintings the team
supplied, in task order; a modelled `.glb` dropped into `public/models/asuras/` replaces any of them
with no code change.

Difficulty rises task by task: more health, faster attacks, more patterns, later enrage thresholds,
and shields that must be shot down. The bot with perfect aim (`tools/play-missions.mjs`) finishes
Tasks 1–2 without losing a heart, drops hearts in Tasks 3–4 and is pushed to its last heart in Task 5.

| Task | Id | Villain | Vice | Subdued by (tradition) | Arena | Design | Health · speed · interval | Kit |
|---|---|---|---|---|---|---|---|---|
| 1 | `madasura` | Madasura, the Arrogant | pride | Ekadanta | Courtyard | `blade-warrior` | 260 · 3.4 m/s · 2.6 s | **Curved blade.** A straight lunge the length of the stones followed by two sweeps; a thrown blade that flies out, turns and returns to his hand (passes you twice); a charge. Enrages at 30 %. |
| 2 | `krodhasura` | Krodhasura, the Wrathful | anger | Lambodara | Hall of Memories | `wrestler` | 440 · 3.3 m/s · 2.3 s | **Bare hands.** The *leap-slam*: a circle is drawn where he will land, he jumps the arc and the floor cracks in shock rings; charges; a three-palm flurry up close; floor slams. Never throws. Enrages at 35 %. |
| 3 | `lobhasura` | Lobhasura, the Grasping | greed | Gajanana | Ancient Library, east hall | `buffalo` | 680 · 4.2 m/s · 2.0 s | **Horns.** Long charges; every horn strike tears **two** fissures of fire that run in straight lines; the *bellow* — a wall of air that shoves you back (damage only within 6 m); shock-ring stamps; summons hungry shades. Enrages at 45 %. |
| 4 | `mohasura` | Mohasura, the Deluder | delusion | Mahodara | Moon Chamber | `three-faced` | 900 · 4.0 m/s · 1.8 s · 8-hit shield | **Six arms.** Floats at 9 m; fans of shards; two illusion copies (only the true one bleeds — shoot the copies to burst them); rings of shards bursting outward; a three-second spiral; teleports and follows up with a fan; a shield of wanting. Enrages at 45 %. |
| 5 | `ahamkarasura` | Ahamkarasura, the Ego | ego | Dhumravarna | Mountain gateway (memory arena) | `fire-king` | 1350 · 4.4 m/s · 1.6 s · 10-hit shield | **Fire and claws.** A flame-breath cone that sweeps as he turns (slower than you); charges that leave a burning road; a fire orb lobbed onto marked ground; rings of embers; shades; a mirror that throws frontal shots back (shoot him from behind); slams. Enrages at 50 % and burns twice as hot. |

Every projectile flies straight from where it is thrown toward where the player stood at the throw
(Tasks 3–5 lead the aim by 30 % of the flight); every area effect is drawn on the floor before it hurts.
The asuras walk (or, for Mohasura, float) with a character controller: stairs, ledges, around pillars
and block stacks.

## Looks — how each avatar follows its reference painting

The reference images are the team's own generated concept art (task order). The procedural avatars
reproduce the silhouette, palette and ornaments; `tools/villain-gallery.mjs` renders a portrait sheet
of all five for comparison.

- **Madasura** (ref 1, comic-style warrior) — athletic bare-chested build; black top-knot with a gold
  ornament; white tilak with a red centre; red glowing eyes; layered gold necklaces; a gold pauldron on
  the right shoulder; red sash over a white dhoti; gold armlets and anklets; barefoot; a curved talwar in
  the right hand.
- **Krodhasura** (ref 2, sumo brute) — huge belly and chest; full black beard and top-knot; a thick
  braided straw rope worn as a necklace and belt with hanging tassels (shimenawa-style); spiral tattoos
  on the shoulders and arms; black studded bracers; dark-blue pleated hakama with red panels; sandals.
- **Lobhasura** (ref 3, buffalo demon) — massive grey hide; a buffalo head with long curling horns;
  red glowing eyes and a red tilak pattern; pointed ears; an open fanged mouth; a shaggy dark mane;
  bead necklaces; carved stone shoulder ornaments; hugely muscled arms.
- **Mohasura** (ref 4, floating ascetic) — slender; three faces (one forward, two in profile) and six
  arms; a great mass of wild white hair streaming upward; red eyes; a jade bead necklace; a gold sash over
  patterned dark trousers; long golden scarves that ripple around him; hovers above the floor.
- **Ahamkarasura** (ref 5, rakshasa king) — broad, brown-orange skin; a tall spired gold crown between
  two great curved horns; long dark curling hair; heavy moustache; fangs; gold necklaces, armlets and
  bracelets; a red dhoti with a gold belt-plate; clawed hands; fire around him.

These are traditional antagonists, never sacred figures: no deity iconography on the asuras.

## Dropping in a model

1. Export a **glTF binary (`.glb`)**, Y up, **facing +Z**, in metres, pivot at the feet on the floor. Any
   height works — the game scales the model to the asura's height (3.2 m × the task's scale) and centres it.
2. Put it in `public/models/asuras/` and map it in `public/models/asuras/index.json`:

   ```json
   { "models": { "madasura": "madasura.glb", "krodhasura": "krodhasura.glb" } }
   ```

3. Test with `npm run dev` and open `http://127.0.0.1:5173/?task=3` (any task number) — the card, the
   weapons and the battle start straight away.

Optional but recommended:

- **Animation clips** (names matched case-insensitively by substring): `idle`, `walk` (or `run`),
  `attack` (used for casts/throws/sweeps), `raise` or `summon`, `charge` or `dash`, `slam`, `jump` or `leap`,
  `hit`/`stagger`, `block`/`shield`, `death`. Missing clips fall back to the nearest one; a model with no
  clips stands still while the projectiles, hazards and hit reactions still play.
- **Named nodes** `RightHand` / `LeftHand` (or `hand_r`, `hand.R`) and `Head`: projectiles leave the
  right hand, the flame breath the head. Without them the game uses fixed offsets.
- **Materials**: PBR (glTF metal/rough). An emissive patch for the "vice burning in the chest" reads well.
  Budget: ≤ 30 k triangles, textures ≤ 2048², file ≤ 8 MB (loaded once per task, cached).
- The shield bubble, the ego's mirror hemisphere, the enrage tint and the white hit-flash are added by
  the game on top of any model.

## Other kits in the code

`Asura.ts` also implements single shards, the hook-chain pull, coin mines, arrow fans, arrow rain, the
petal ring, root traps and the binding vine (from the earlier eight-villain campaign). They are not in
the five-task campaign but any `patterns` list in `MissionData.ts` may use them.
