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
  // Matsarasura — envy: crystal shards and a smothering orb
  | 'shard'
  | 'shard-fan'
  | 'envy-orb'
  // Madasura — pride: fire
  | 'flame-breath'
  | 'fire-charge'
  // Mohasura — delusion: the curved sword
  | 'sword-combo'
  | 'blade-throw'
  // Lobhasura — greed: hook-chain and coin mines
  | 'chain-hook'
  | 'coin-mines'
  // Krodhasura — wrath: the mace and fissures
  | 'fissure'
  | 'mace-flurry'
  // Kamasura — desire: the bow and the petal ring
  | 'arrow-fan'
  | 'arrow-rain'
  | 'petal-ring'
  // Mamasura — attachment: roots and tethers
  | 'root-trap'
  | 'tether'
  // Ahamkarasura — ego: shard rings, the spiral, the mirror
  | 'radial-burst'
  | 'spiral'
  | 'mirror-shield';

/** What the asura carries; drives the procedural avatar's weapon and attack poses. */
export type WeaponKind = 'claws' | 'flame' | 'sword' | 'chain' | 'mace' | 'bow' | 'roots' | 'scepter';

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
 * Eight tasks, eight asuras — the eight demons of the Vinayaka (Mudgala) Purana tradition, each the
 * embodiment of a vice, each in tradition subdued by a form of Ganesha. The asuras are traditional
 * antagonists, never sacred figures; their forms, words and powers here are the game's fiction.
 */
export const MISSIONS: MissionDef[] = [
  {
    task: 1,
    id: 'matsarasura',
    villain: 'Matsarasura',
    epithet: 'the Envier',
    vice: 'envy',
    subduedBy: 'Vakratunda',
    threat: 1,
    intro: [
      'You are entering into Task 1.',
      'Hear the first name. Matsarasura — the Envier. Born, the old books say, from a single sigh of jealousy, and grown fat on everything others hold dear.',
      'He cannot bear a light he does not own. He has snuffed the courtyard braziers one by one, and now he waits among the stones, hungry for yours.',
      'He throws shards of green crystal, straight and hard, and hurls a dark orb that smothers whatever ground it lands on. Step aside as he throws. Never stand still.',
      'The temple grants you the Astra: a gun of remembered light. Aim true. Show him what cannot be stolen.',
    ],
    arena: 'courtyard',
    playerSpawn: [1.6, 1.0, 2.6, 0],
    bossSpawn: [4.5, 1.92, -22],
    arenaCenter: [2, 0, -8],
    arenaRadius: 26,
    boss: { hp: 220, speed: 2.8, meleeDamage: 18, rangedDamage: 14, projectileSpeed: 11, attackInterval: 2.6, scale: 1.0, weapon: 'claws', patterns: ['shard', 'shard', 'shard-fan', 'envy-orb', 'charge'], enrageAt: 0.3, color: 0x3aa870, shieldHits: 0, keepDistance: 7 },
    objective: 'Task 1: Defeat Matsarasura, the Envier',
    hint: 'His shards fly straight — sidestep them, do not backpedal. Leave the circle where the orb will land.',
    look: 'Gaunt, long-limbed asura with green crystal growing from the shoulders and knuckles; hollow envious eyes; tattered robe; bone claws.',
  },
  {
    task: 2,
    id: 'madasura',
    villain: 'Madasura',
    epithet: 'the Arrogant',
    vice: 'pride',
    subduedBy: 'Ekadanta',
    threat: 2,
    intro: [
      'You are entering into Task 2.',
      'Madasura — the Arrogant. Once a devotee who won a boon and mistook it for a throne; the tradition says he swelled until three worlds bowed to his shadow.',
      'He breathes fire. A cone of flame sweeps the Hall of Memories wherever he turns, and every charge he makes leaves a burning road behind him.',
      'Run out of the flame — it turns slower than you. Leap the rings when he strikes the floor. Fire while he recovers; pride always pauses to admire itself.',
      'He is twice the Envier, and he knows it.',
    ],
    arena: 'hall',
    playerSpawn: [4.5, 2.0, -62, 0],
    bossSpawn: [4.5, 1.92, -84],
    arenaCenter: [4.5, 1.92, -90],
    arenaRadius: 30,
    boss: { hp: 340, speed: 3.6, meleeDamage: 22, rangedDamage: 8, projectileSpeed: 11, attackInterval: 2.3, scale: 1.15, weapon: 'flame', patterns: ['flame-breath', 'fire-charge', 'slam', 'flame-breath', 'charge'], enrageAt: 0.35, color: 0xd85a2a, shieldHits: 0, keepDistance: 5 },
    objective: 'Task 2: Defeat Madasura, the Arrogant',
    hint: 'Run sideways out of the fire cone; it turns slower than you. Jump the floor rings. Stay off the burning trail.',
    look: 'Broad, barrel-chested asura in gilded armour with a swollen proud bearing; fire behind the teeth; magma-cracked skin; a crown too large for him.',
  },
  {
    task: 3,
    id: 'mohasura',
    villain: 'Mohasura',
    epithet: 'the Deluder',
    vice: 'delusion',
    subduedBy: 'Mahodara',
    threat: 3,
    intro: [
      'You are entering into Task 3.',
      'Mohasura — the Deluder. Where he walks, the world lies. He wears the moon chamber like a mask and steps out of every mirror at once.',
      'He carries a curved sword. He lunges the length of the chamber and cuts twice, and when he throws the blade it comes back to his hand — so it passes you twice as well.',
      'Three of him will stand before you. Two are nothing but confusion. Only the true one bleeds. Shoot the copies to burst them, dodge the lunge, and watch for the blade returning.',
    ],
    arena: 'moon',
    playerSpawn: [110, -1.9, -160, 0],
    bossSpawn: [110, -2, -184],
    arenaCenter: [110, -2, -190],
    arenaRadius: 36,
    boss: { hp: 460, speed: 3.9, meleeDamage: 24, rangedDamage: 16, projectileSpeed: 14, attackInterval: 2.1, scale: 1.1, weapon: 'sword', patterns: ['sword-combo', 'blade-throw', 'illusion', 'teleport', 'sword-combo', 'blade-throw'], teleportFollowUp: 'sword-combo', enrageAt: 0.4, color: 0x8a5ad8, shieldHits: 0, keepDistance: 3 },
    objective: 'Task 3: Defeat Mohasura, the Deluder',
    hint: 'Dodge sideways when he raises the blade — the lunge is straight. The thrown sword returns: step aside twice.',
    look: 'Lean, veiled asura of shifting violet; face half-hidden by a mirrored mask; a great curved talwar; robes that ripple like water.',
  },
  {
    task: 4,
    id: 'lobhasura',
    villain: 'Lobhasura',
    epithet: 'the Grasping',
    vice: 'greed',
    subduedBy: 'Gajanana',
    threat: 3,
    intro: [
      'You are entering into Task 4.',
      'Lobhasura — the Grasping. Greed made flesh. In the old telling he was born of a glance at a beautiful thing, and he has never stopped reaching since.',
      'He fights with a hook on a chain. If it catches you, it drags you into his reach. He scatters gold that explodes where it lands, and shades answer him while he hides behind a shield of everything he has hoarded.',
      'Sidestep the hook — it flies straight. Stay out of the coins’ circles. Break the shades, then break the shield, and he is naked to your fire.',
    ],
    arena: 'tunnels',
    playerSpawn: [-46, -13.9, -226, 0],
    bossSpawn: [-46, -14, -252],
    arenaCenter: [-46, -14, -240],
    arenaRadius: 18,
    boss: { hp: 580, speed: 3.4, meleeDamage: 26, rangedDamage: 17, projectileSpeed: 16, attackInterval: 2.2, scale: 1.2, weapon: 'chain', patterns: ['chain-hook', 'coin-mines', 'summon', 'shield', 'chain-hook', 'charge'], enrageAt: 0.35, color: 0xd8a83a, shieldHits: 6, keepDistance: 8 },
    objective: 'Task 4: Defeat Lobhasura, the Grasping',
    hint: 'The hook flies straight: sidestep it. Leave the gold circles before they burst. Shades first, then the shield.',
    look: 'Bloated, jewel-encrusted asura dripping with stolen gold; too many rings; a hook on a heavy chain; sacks of coin strapped to the body.',
  },
  {
    task: 5,
    id: 'krodhasura',
    villain: 'Krodhasura',
    epithet: 'the Wrathful',
    vice: 'anger',
    subduedBy: 'Lambodara',
    threat: 4,
    intro: [
      'You are entering into Task 5.',
      'Krodhasura — the Wrathful. The tradition names him the child of rage itself. He does not plan. He erupts.',
      'He swings a great mace. When it strikes the floor a fissure of fire tears straight across the library toward you, and when he is close the blows come three at a time.',
      'Step out of the fissure’s line. Back away from the flurry. Wound him and the fissures come in pairs. There is no safe distance from anger — only timing.',
    ],
    arena: 'library',
    playerSpawn: [-82, -9.9, -76, 0],
    bossSpawn: [-82, -10, -112],
    arenaCenter: [-82, -10, -96],
    arenaRadius: 22,
    boss: { hp: 700, speed: 4.1, meleeDamage: 28, rangedDamage: 16, projectileSpeed: 14, attackInterval: 1.8, scale: 1.2, weapon: 'mace', patterns: ['fissure', 'mace-flurry', 'charge', 'slam', 'fissure', 'charge'], enrageAt: 0.5, color: 0xe83a3a, shieldHits: 0, keepDistance: 3 },
    objective: 'Task 5: Defeat Krodhasura, the Wrathful',
    hint: 'The fissure travels in a straight line from his mace: step to the side. Back out of the three-blow flurry.',
    look: 'Muscular red-skinned asura with a bull-like neck, cracked lava veins, a spiked iron mace; smoke from the nostrils; heavy tusks.',
  },
  {
    task: 6,
    id: 'kamasura',
    villain: 'Kamasura',
    epithet: 'the Desirer',
    vice: 'desire',
    subduedBy: 'Vikata',
    threat: 4,
    intro: [
      'You are entering into Task 6.',
      'Kamasura — the Desirer. He carries a bow of blossom-wood. His arrows come in fans, straight and fast, or fall from above onto the ground he has marked.',
      'A ring of petals circles him: come too close and it cuts. Slip between the arrows, leave the marked ground before the rain falls, and shoot from outside the petals.',
      'He shields himself in wanting. Break it, and he draws faster. He is the strongest asura you have yet faced.',
    ],
    arena: 'shrine',
    playerSpawn: [0, -19.9, -284, 0],
    bossSpawn: [0, -20, -306],
    arenaCenter: [0, -20, -308],
    arenaRadius: 26,
    boss: { hp: 840, speed: 3.8, meleeDamage: 30, rangedDamage: 17, projectileSpeed: 19, attackInterval: 1.9, scale: 1.3, weapon: 'bow', patterns: ['arrow-fan', 'arrow-rain', 'petal-ring', 'shield', 'arrow-fan', 'arrow-rain'], enrageAt: 0.4, color: 0xe86ab8, shieldHits: 8, keepDistance: 9 },
    objective: 'Task 6: Defeat Kamasura, the Desirer',
    hint: 'Slip between the arrows of the fan; leave the marked circles before the rain falls; keep outside the petal ring.',
    look: 'Beautiful, dangerous asura garlanded in blossoms; peacock-feather cloak; a long bow of flowering wood; a smile that promises everything.',
  },
  {
    task: 7,
    id: 'mamasura',
    villain: 'Mamasura',
    epithet: 'the Possessor',
    vice: 'attachment',
    subduedBy: 'Vighnaraja',
    threat: 5,
    intro: [
      'You are entering into Task 7.',
      'Mamasura — the Possessor. "Mine," he says of the sanctum, of the statue, of you. Attachment that cannot let go of anything, ever.',
      'Roots answer him. He marks the ground and they erupt through it. He throws a vine that binds you and bleeds you — shoot the glowing knot to cut it. Shades cling to him; he vanishes and reappears behind you.',
      'Leave the marked ground before the roots rise. Cut the vine at its knot. Only the sanctum stands between him and the deepest memory. Hold it.',
    ],
    arena: 'sanctum',
    playerSpawn: [0, -25.9, -372, 0],
    bossSpawn: [0, -26, -396],
    arenaCenter: [0, -26, -396],
    arenaRadius: 34,
    boss: { hp: 980, speed: 4.3, meleeDamage: 32, rangedDamage: 18, projectileSpeed: 15, attackInterval: 1.7, scale: 1.35, weapon: 'roots', patterns: ['root-trap', 'tether', 'summon', 'teleport', 'shield', 'root-trap', 'charge'], teleportFollowUp: 'root-trap', enrageAt: 0.45, color: 0x5ad8d0, shieldHits: 10, keepDistance: 7 },
    objective: 'Task 7: Defeat Mamasura, the Possessor',
    hint: 'Leave the marked circles before the roots rise. If the vine binds you, shoot its glowing knot.',
    look: 'Ancient asura grown into a banyan: bark skin, roots for a lower body, vines wrapped round the arms, small clinging shade-faces in the branches.',
  },
  {
    task: 8,
    id: 'ahamkarasura',
    villain: 'Ahamkarasura',
    epithet: 'the Ego',
    vice: 'ego',
    subduedBy: 'Dhumravarna',
    threat: 5,
    intro: [
      'You are entering into Task 8. The last.',
      'Ahamkarasura — the Ego. The root of all seven you have broken. The old books say every other asura was only a shadow he cast.',
      'He carries a mirror. Shots fired at his face come back at you; only from behind does he bleed. He rings himself with shards, spins them into spirals, splits into copies and steps through the air.',
      'Circle him. Find the gaps in the rings. At the mountain gateway where the first memory was made, end this. Remember everything you have learned. Then aim.',
    ],
    arena: 'memory-tusk',
    playerSpawn: [2000, 0.2, 22, 0],
    bossSpawn: [2000, 0, -12],
    arenaCenter: [2000, 0, 0],
    arenaRadius: 30,
    boss: { hp: 1200, speed: 4.5, meleeDamage: 34, rangedDamage: 19, projectileSpeed: 13, attackInterval: 1.5, scale: 1.5, weapon: 'scepter', patterns: ['radial-burst', 'spiral', 'mirror-shield', 'charge', 'illusion', 'teleport', 'slam', 'radial-burst'], teleportFollowUp: 'radial-burst', enrageAt: 0.5, color: 0xf0f0ff, shieldHits: 12, keepDistance: 6 },
    objective: 'Task 8: Defeat Ahamkarasura, the Ego',
    hint: 'While the mirror is up, shoot him from behind. Jump or dodge through the gaps in the shard rings.',
    look: 'Towering, luminous asura of white gold with a crown of many faces; a mirror-shield on one arm and a scepter in the other; his own reflection etched on every surface.',
  },
];

export const missionByTask = (task: number): MissionDef | undefined => MISSIONS.find((m) => m.task === task);
