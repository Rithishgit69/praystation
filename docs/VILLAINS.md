# The eight asuras — villain list and avatar hand-off

The eight tasks fight the eight asuras of the Vinayaka (Mudgala) Purana tradition, each the embodiment
of a vice, each subdued in tradition by a form of Ganesha (never shown fighting). The in-game avatars are
procedural stand-ins built in code; drop a modelled `.glb` for any of them into `public/models/asuras/`
and it replaces the stand-in with no code change.

| Task | Id | Villain | Vice | Subdued by (tradition) | Arena | Weapon / signature | Colour | Height |
|---|---|---|---|---|---|---|---|---|
| 1 | `matsarasura` | Matsarasura, the Envier | envy | Vakratunda | Courtyard | Bone claws; green crystal shards (single, fan of 3), a smothering envy orb lobbed onto marked ground, a charge | `#3aa870` green | 3.2 m |
| 2 | `madasura` | Madasura, the Arrogant | pride | Ekadanta | Hall of Memories | Flame gauntlets; a fire-breath cone that turns slower than you, a fire charge that leaves a burning trail, floor slams with shock rings | `#d85a2a` ember | 3.7 m |
| 3 | `mohasura` | Mohasura, the Deluder | delusion | Mahodara | Moon Chamber | Great curved talwar; lunge + two sweeps, a thrown blade that returns to his hand, two illusion copies, teleports behind you into a sword combo | `#8a5ad8` violet | 3.5 m |
| 4 | `lobhasura` | Lobhasura, the Grasping | greed | Gajanana | Serpent Tunnels (evidence chamber) | Hook on a heavy chain (a hit yanks you in for a blow), gold coins that land as mines, summoned shades, a hoard shield | `#d8a83a` gold | 3.8 m |
| 5 | `krodhasura` | Krodhasura, the Wrathful | anger | Lambodara | Ancient Library (east hall) | Spiked iron mace; a fissure of fire that runs in a straight line from the strike (pairs when enraged), a three-blow flurry up close, charges, slams | `#e83a3a` red | 3.8 m |
| 6 | `kamasura` | Kamasura, the Desirer | desire | Vikata | Underground Shrine | Bow of blossom-wood; fans of 5–7 straight arrows, arrows that fall on marked circles, a ring of cutting petals around him, a shield of wanting | `#e86ab8` rose | 4.2 m |
| 7 | `mamasura` | Mamasura, the Possessor | attachment | Vighnaraja | Sealed Sanctum | Roots and vines; marked ground erupts into roots (damage + slow), a thrown vine that binds you until its glowing knot is shot, shades, teleports, a shield | `#5ad8d0` teal | 4.3 m |
| 8 | `ahamkarasura` | Ahamkarasura, the Ego | ego | Dhumravarna | Mountain gateway (memory arena) | Scepter and mirror; rings of 12–16 shards, a 3-second spiral of shards, a mirror that throws frontal shots back (shoot him from behind), copies, teleports, charges, slams | `#f0f0ff` white-gold | 4.8 m |

Every projectile flies straight from where it is thrown toward where the player stood at the throw
(tasks 5–8 lead the aim by 30 % of the flight); every area effect is drawn on the floor before it hurts.
The asuras walk the floor with a character controller (stairs, ledges, around pillars and block stacks).

## Looks (brief for modelled avatars)

- **Matsarasura** — gaunt, long-limbed; green crystal growing from the shoulders and knuckles; hollow envious eyes; tattered robe; bone claws.
- **Madasura** — broad, barrel-chested, in gilded armour with a swollen proud bearing; fire behind the teeth; magma-cracked skin; a crown too large for him.
- **Mohasura** — lean and veiled, shifting violet; face half-hidden by a mirrored mask; a great curved talwar; robes that ripple like water.
- **Lobhasura** — bloated and jewel-encrusted, dripping with stolen gold; too many rings; a hook on a heavy chain; sacks of coin strapped to the body.
- **Krodhasura** — muscular, red-skinned, bull-necked; cracked lava veins; a spiked iron mace; smoke from the nostrils; heavy tusks.
- **Kamasura** — beautiful and dangerous, garlanded in blossoms; peacock-feather cloak; a long bow of flowering wood; a smile that promises everything.
- **Mamasura** — ancient, grown into a banyan: bark skin, roots for a lower body, vines round the arms, small clinging shade-faces in the branches.
- **Ahamkarasura** — towering and luminous, white-gold; a crown of many faces; a mirror-shield on one arm and a scepter in the other; his own reflection etched on every surface.

These are traditional antagonists, never sacred figures: no deity iconography on the asuras.

## Dropping in a model

1. Export a **glTF binary (`.glb`)**, Y up, **facing +Z**, in metres, pivot at the feet on the floor. Any
   height works — the game scales the model to the asura's height (3.2 m × the task's scale) and centres it.
2. Put it in `public/models/asuras/` and map it in `public/models/asuras/index.json`:

   ```json
   { "models": { "matsarasura": "matsarasura.glb", "madasura": "madasura.glb" } }
   ```

3. Test with `npm run dev` and open `http://127.0.0.1:5173/?task=3` (any task number) — the card, the
   Astra and the battle start straight away.

Optional but recommended:

- **Animation clips** (names matched case-insensitively by substring): `idle`, `walk` (or `run`),
  `attack` (used for casts/throws/sweeps), `raise` or `summon`, `charge` or `dash`, `slam`,
  `hit`/`stagger`, `block`/`shield`, `death`. Missing clips fall back to the nearest one; a model with no
  clips stands still while the projectiles, hazards and hit reactions still play.
- **Named nodes** `RightHand` / `LeftHand` (or `hand_r`, `hand.R`) and `Head`: projectiles leave the
  right hand, the bow's arrows the left, the flame breath the head. Without them the game uses fixed offsets.
- **Materials**: PBR (glTF metal/rough). An emissive patch for the "vice burning in the chest" reads well.
  Budget: ≤ 30 k triangles, textures ≤ 2048², file ≤ 8 MB (loaded once per task, cached).
- The shield bubble, the ego's mirror hemisphere, the enrage tint and the white hit-flash are added by
  the game on top of any model.

Reference images are just as useful: send them and the procedural stand-ins can be reshaped to match
while the models are being made.
