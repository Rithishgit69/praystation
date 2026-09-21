import type { ZoneId } from '@/world/WorldTypes';

/**
 * Every attack an asura can perform. Projectiles fly straight from where they are thrown toward where
 * the player stood at the throw: nothing homes, everything is telegraphed, everything can be sidestepped.
 */
export type AttackKind =
  // shared
  | 'charge'
  | 'slam'
  | 'summon'
  | 'illusion'
  | 'teleport'
  | 'shield'
  // Task 1 · Madasura, the blade warrior: the lunge-and-sweep combo and the returning blade
  | 'sword-combo'
  | 'blade-throw'
  // Task 2 · Krodhasura, the wrestler: the leap onto a marked circle and the three-palm flurry
  | 'leap-slam'
  | 'mace-flurry'
  // Task 3 · Lobhasura, the buffalo: horn fissures (in pairs) and the bellow that shoves you back
  | 'fissure'
  | 'bellow'
  // Task 4 · Mohasura, three-faced: shard fans, shard rings and the spiral
  | 'shard-fan'
  | 'radial-burst'
  | 'spiral'
  // Task 5 · Ahamkarasura, the fire king: flame breath, the burning charge, the fire orb, the mirror
  | 'flame-breath'
  | 'fire-charge'
  | 'envy-orb'
  | 'mirror-shield'
  // Implemented but not in the five-task campaign (usable in custom kits): single shards, the
  // hook-chain and coin mines, arrow fans / arrow rain / the petal ring, root traps and the binding vine
  | 'shard'
  | 'chain-hook'
  | 'coin-mines'
  | 'arrow-fan'
  | 'arrow-rain'
  | 'petal-ring'
  | 'root-trap'
  | 'tether';

/** What the asura carries; drives the procedural avatar's weapon and attack poses. */
export type WeaponKind = 'claws' | 'flame' | 'sword' | 'chain' | 'mace' | 'bow' | 'roots' | 'scepter' | 'fists' | 'horns' | 'six-arms';

/** Which procedural avatar design to build (see AsuraDesigns.ts; each follows a reference painting). */
export type DesignId = 'blade-warrior' | 'wrestler' | 'buffalo' | 'three-faced' | 'fire-king';

export interface BossStats {
  /** Hit points; each rifle shot deals `shotDamage` (see Gun). */
  hp: number;
  /** Move speed m/s while closing distance. */
  speed: number;
  /** Damage of a melee strike. */
  meleeDamage: number;
  /** Damage of one projectile or hazard. */
  rangedDamage: number;
  /** Projectile flight speed m/s. */
  projectileSpeed: number;
  /** Seconds between attacks at full health; shrinks as health drops. */
  attackInterval: number;
  /** Visual scale of the asura. */
  scale: number;
  /** Weapon carried (procedural avatar). */
  weapon: WeaponKind;
  /** Avatar design. */
  design: DesignId;
  /** Attack patterns for this asura, chosen from by weight (repeat an entry to make it likelier). */
  patterns: AttackKind[];
  /** Attack performed right after a teleport (kits with 'teleport'). */
  teleportFollowUp?: AttackKind;
  /** Below this fraction of health the asura enrages: faster, shorter intervals. */
  enrageAt: number;
  /** Core / aura colour. */
  color: number;
  /** Number of shots the shield absorbs when the 'shield' pattern is active. */
  shieldHits: number;
  /** Preferred fighting distance (m): ranged kits keep away, melee kits close in. */
  keepDistance: number;
}

export interface MissionDef {
  /** 1-based task number. */
  task: number;
  id: string;
  villain: string;
  epithet: string;
  /** Vice the asura embodies (from the Mudgala Purana tradition). */
  vice: string;
  /** The avatar of Ganesha who, in tradition, subdued this asura; shown in the journal, never fought. */
  subduedBy: string;
  /** Dramatic narration lines, spoken and shown one after another. */
  intro: string[];
  /** Danger rating 1–5 shown on the card. */
  threat: number;
  arena: ZoneId;
  /** Player spawn [x, y, z, yaw] and boss spawn [x, y, z]. */
  playerSpawn: [number, number, number, number];
  bossSpawn: [number, number, number];
  /** Arena centre and radius the asura keeps the fight inside. */
  arenaCenter: [number, number, number];
  arenaRadius: number;
  boss: BossStats;
  /** Objective shown in the tracker. */
  objective: string;
  /** One-line fighting tip shown when the Astra is granted. */
  hint: string;
  /** The look the villain should have (brief for a modelled avatar; see docs/VILLAINS.md). */
  look: string;
}

/**
 * Five tasks, five asuras — five of the eight demons of the Vinayaka (Mudgala) Purana tradition, each
 * the embodiment of a vice, each in tradition subdued by a form of Ganesha, ordered so every fight is
 * harder than the last. The asuras are traditional antagonists, never sacred figures; their forms,
 * words and powers here are the game's fiction; their looks follow the team's reference paintings.
 */
export const MISSIONS: MissionDef[] = [
  {
    task: 1,
    id: 'madasura',
    villain: 'Madasura',
    epithet: 'the Arrogant',
    vice: 'pride',
    subduedBy: 'Ekadanta',
    threat: 1,
    intro: [
      'You are entering into Task 1.',
      'Madasura — the Arrogant. Once a devotee who won a boon and mistook it for a throne. The tradition says he swelled until three worlds bowed to his shadow; now he walks the courtyard bare-chested in gold, a curved blade loose in his hand.',
      'He fights like a man who has never lost. He lunges the length of the stones and cuts twice, and when he throws the blade it comes back to his hand — so it passes you twice as well.',
      'Dodge sideways when he raises the sword; the lunge is straight. Watch for the blade returning. The temple grants you the Astra: a gun of remembered light. Aim true.',
    ],
    arena: 'arena-courtyard',
    playerSpawn: [2000, 0.2, -380, 0],
    bossSpawn: [2000, 0.1, -418],
    arenaCenter: [2000, 0, -400],
    arenaRadius: 32,
    boss: { hp: 260, speed: 3.4, meleeDamage: 18, rangedDamage: 14, projectileSpeed: 13, attackInterval: 2.6, scale: 1.0, weapon: 'sword', design: 'blade-warrior', patterns: ['sword-combo', 'blade-throw', 'sword-combo', 'charge', 'blade-throw'], enrageAt: 0.3, color: 0xe0503a, shieldHits: 0, keepDistance: 3 },
    objective: 'Task 1: Defeat Madasura, the Arrogant',
    hint: 'Sidestep the lunge — it is straight. The thrown blade returns: step aside twice.',
    look: 'Athletic warrior in a black top-knot with a gold ornament, white tilak with a red centre, red glowing eyes, gold necklaces and a gold pauldron on the right shoulder, red sash over white dhoti, gold armlets and anklets, barefoot, a curved blade in the right hand.',
  },
  {
    task: 2,
    id: 'krodhasura',
    villain: 'Krodhasura',
    epithet: 'the Wrathful',
    vice: 'anger',
    subduedBy: 'Lambodara',
    threat: 2,
    intro: [
      'You are entering into Task 2.',
      'Krodhasura — the Wrathful. The tradition names him the child of rage itself. He is a mountain of a man: a wrestler’s belly, a beard like a thundercloud, a rope of braided straw across his chest, and fists that have never needed a weapon.',
      'He does not throw. He comes. He leaps and lands where you stood, and the floor of the Hall of Memories cracks in rings around him. Up close his palms come three at a time.',
      'Leave the circle before he lands. Jump the rings. Back out of the flurry and fire while he heaves for breath — anger tires. He is twice the Arrogant, and he knows it.',
    ],
    arena: 'arena-hall',
    playerSpawn: [2000, 0.2, -778, 0],
    bossSpawn: [2000, 0.1, -818],
    arenaCenter: [2000, 0, -800],
    arenaRadius: 31,
    boss: { hp: 440, speed: 3.3, meleeDamage: 24, rangedDamage: 16, projectileSpeed: 11, attackInterval: 2.3, scale: 1.25, weapon: 'fists', design: 'wrestler', patterns: ['leap-slam', 'charge', 'mace-flurry', 'slam', 'leap-slam'], enrageAt: 0.35, color: 0xe8842a, shieldHits: 0, keepDistance: 3 },
    objective: 'Task 2: Defeat Krodhasura, the Wrathful',
    hint: 'A circle marks where he will land — leave it. Jump the rings. Back out of the three-palm flurry.',
    look: 'Huge sumo-built brute: bare chest and belly, full black beard and top-knot, thick braided straw rope worn as a necklace and belt with hanging tassels, spiral tattoos on the shoulder and arms, black studded bracers, dark blue pleated hakama with red panels, sandals.',
  },
  {
    task: 3,
    id: 'lobhasura',
    villain: 'Lobhasura',
    epithet: 'the Grasping',
    vice: 'greed',
    subduedBy: 'Gajanana',
    threat: 3,
    intro: [
      'You are entering into Task 3.',
      'Lobhasura — the Grasping. Greed made flesh, and the flesh is a buffalo’s: a great grey bull-demon with curling horns, red eyes, a mane like smoke, and ornaments of stone grown into the skin.',
      'He charges the length of the library and his horns tear the floor open — two fissures of fire run from every strike. When he bellows, the air itself shoves you back. When he stamps, the shock rolls out in rings. And the hungry shades answer him.',
      'Step out of the fissures’ lines. Plant your feet against the bellow. Break the shades, then keep the bull turning — he cannot charge what stands beside him.',
    ],
    arena: 'arena-library',
    playerSpawn: [2000, 0.2, -1178, 0],
    bossSpawn: [2000, 0.1, -1218],
    arenaCenter: [2000, 0, -1200],
    arenaRadius: 30,
    boss: { hp: 680, speed: 4.2, meleeDamage: 28, rangedDamage: 17, projectileSpeed: 13, attackInterval: 2.0, scale: 1.3, weapon: 'horns', design: 'buffalo', patterns: ['charge', 'fissure', 'bellow', 'summon', 'slam', 'charge', 'fissure'], enrageAt: 0.45, color: 0xc03030, shieldHits: 0, keepDistance: 4 },
    objective: 'Task 3: Defeat Lobhasura, the Grasping',
    hint: 'Two fissures run from every horn strike — step out of their lines. Brace for the bellow. Shades first.',
    look: 'Massive buffalo-headed demon: dark grey hide, long curling horns, red glowing eyes with a red tilak pattern, pointed ears, an open fanged mouth, a shaggy dark mane, bead necklaces and carved stone shoulder ornaments, hugely muscled arms.',
  },
  {
    task: 4,
    id: 'mohasura',
    villain: 'Mohasura',
    epithet: 'the Deluder',
    vice: 'delusion',
    subduedBy: 'Mahodara',
    threat: 4,
    intro: [
      'You are entering into Task 4.',
      'Mohasura — the Deluder. Where he walks, the world lies. He does not walk: he floats, three-faced and six-armed, his white hair streaming upward like smoke, jade beads at his throat, golden scarves circling him like thoughts.',
      'Three of him will stand before you, and only the true one bleeds. Six hands throw shards in fans and in spirals, and rings of them burst outward from where he hovers. He steps through the air to reappear behind you, and shields himself in wanting to be believed.',
      'Shoot the copies to burst them. Find the gaps in the rings. He is faster than the bull and far more cruel — nothing he throws will turn, so keep moving sideways.',
    ],
    arena: 'arena-moon',
    playerSpawn: [2000, 0.2, -1578, 0],
    bossSpawn: [2000, 0.1, -1622],
    arenaCenter: [2000, 0, -1600],
    arenaRadius: 34,
    boss: { hp: 900, speed: 4.0, meleeDamage: 26, rangedDamage: 17, projectileSpeed: 14, attackInterval: 1.8, scale: 1.15, weapon: 'six-arms', design: 'three-faced', patterns: ['shard-fan', 'illusion', 'radial-burst', 'teleport', 'spiral', 'shard-fan', 'shield', 'radial-burst'], teleportFollowUp: 'shard-fan', enrageAt: 0.45, color: 0x4ad8a0, shieldHits: 8, keepDistance: 9 },
    objective: 'Task 4: Defeat Mohasura, the Deluder',
    hint: 'Only the true one bleeds — burst the copies. Slip through the gaps in the shard rings; nothing homes.',
    look: 'Slender floating ascetic-demon with three faces (one forward, two in profile) and six arms, a great mass of wild white hair, red glowing eyes, jade bead necklace, gold sash over patterned dark trousers, long golden scarves coiling around him.',
  },
  {
    task: 5,
    id: 'ahamkarasura',
    villain: 'Ahamkarasura',
    epithet: 'the Ego',
    vice: 'ego',
    subduedBy: 'Dhumravarna',
    threat: 5,
    intro: [
      'You are entering into Task 5. The last.',
      'Ahamkarasura — the Ego. The root of the four you have broken; the old books say every other asura was only a shadow he cast. He wears a spired crown between two great horns, gold at his throat and arms, fangs behind a moustache, claws on his hands — and the fire behind him is his own.',
      'He breathes flame in a cone that sweeps wherever he turns. His charges leave a burning road. He hurls a fire orb that scorches the ground it marks, throws rings of embers, calls his shades, and raises a mirror that throws your shots back at you.',
      'And when he is wounded he does not weaken — he burns twice as hot. Run out of the fire. Circle the mirror. At the mountain gateway where the first memory was made, end this.',
    ],
    arena: 'memory-tusk',
    playerSpawn: [2000, 0.2, 22, 0],
    bossSpawn: [2000, 0, -12],
    arenaCenter: [2000, 0, 0],
    arenaRadius: 30,
    boss: { hp: 1350, speed: 4.4, meleeDamage: 34, rangedDamage: 19, projectileSpeed: 13, attackInterval: 1.6, scale: 1.45, weapon: 'claws', design: 'fire-king', patterns: ['flame-breath', 'fire-charge', 'envy-orb', 'radial-burst', 'summon', 'mirror-shield', 'slam', 'flame-breath', 'fire-charge'], enrageAt: 0.5, color: 0xff7a2a, shieldHits: 10, keepDistance: 5 },
    objective: 'Task 5: Defeat Ahamkarasura, the Ego',
    hint: 'Run sideways out of the flame cone. Leave the marked ground before the orb lands. Shoot him from behind while the mirror is up.',
    look: 'Broad horned rakshasa king: brown-orange skin, a tall spired gold crown between two great curved horns, long dark curling hair, heavy moustache, fangs, gold necklaces, armlets and bracelets, a red dhoti with a gold belt-plate, clawed hands, fire around him.',
  },
];

export const missionByTask = (task: number): MissionDef | undefined => MISSIONS.find((m) => m.task === task);
