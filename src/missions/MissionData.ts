import type { ZoneId } from '@/world/WorldTypes';

export type AttackKind = 'bolt' | 'volley' | 'charge' | 'slam' | 'summon' | 'illusion' | 'teleport' | 'pull' | 'shield';

export interface BossStats {
  /** Hit points; each rifle shot deals `shotDamage` (see Gun). */
  hp: number;
  /** Move speed m/s while closing distance. */
  speed: number;
  /** Damage of a melee reach (within 2.2 m). */
  meleeDamage: number;
  /** Damage of one bolt. */
  boltDamage: number;
  /** Bolt flight speed m/s. */
  boltSpeed: number;
  /** Seconds between attacks at full health; shrinks as health drops. */
  attackInterval: number;
  /** Visual scale of the asura. */
  scale: number;
  /** Attack patterns unlocked for this asura, chosen from by weight. */
  patterns: AttackKind[];
  /** Below this fraction of health the asura enrages: faster, shorter intervals. */
  enrageAt: number;
  /** Core / aura colour. */
  color: number;
  /** Number of shots the shield absorbs when the 'shield' pattern is active. */
  shieldHits: number;
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
      'He is slow, but he is patient, and his envy-bolts follow the heart. Keep moving. Never let him close the distance.',
      'The temple grants you the Astra: a gun of remembered light. Aim true. Show him what cannot be stolen.',
    ],
    arena: 'courtyard',
    playerSpawn: [1.6, 1.0, 2.6, 0],
    bossSpawn: [3.0, 0.0, -22],
    arenaCenter: [2, 0, -8],
    arenaRadius: 26,
    boss: { hp: 220, speed: 2.8, meleeDamage: 18, boltDamage: 14, boltSpeed: 10, attackInterval: 2.6, scale: 1.0, patterns: ['bolt', 'bolt', 'charge'], enrageAt: 0.3, color: 0x3aa870, shieldHits: 0 },
    objective: 'Task 1: Defeat Matsarasura, the Envier',
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
      'He does not throw. He comes. Every charge ends in a blow that splits the floor, and the shock of it rolls out in rings across the Hall of Memories.',
      'Leap the rings. Sidestep the charge. Fire while he recovers — his pride is his opening, and it is brief.',
      'He is twice the Envier, and he knows it.',
    ],
    arena: 'hall',
    playerSpawn: [4.5, 2.0, -62, 0],
    bossSpawn: [4.5, 1.92, -84],
    arenaCenter: [4.5, 1.92, -90],
    arenaRadius: 30,
    boss: { hp: 340, speed: 3.6, meleeDamage: 22, boltDamage: 15, boltSpeed: 11, attackInterval: 2.3, scale: 1.15, patterns: ['charge', 'slam', 'charge', 'bolt'], enrageAt: 0.35, color: 0xd85a2a, shieldHits: 0 },
    objective: 'Task 2: Defeat Madasura, the Arrogant',
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
      'Three of him will stand before you. Two are nothing but confusion. Only the true one bleeds — and he moves the moment you doubt your eyes.',
      'Shoot the copies to burst them. Find the one that flinches. He is faster than the Arrogant and far more cruel.',
    ],
    arena: 'moon',
    playerSpawn: [110, -1.9, -160, 0],
    bossSpawn: [110, -2, -184],
    arenaCenter: [110, -2, -190],
    arenaRadius: 36,
    boss: { hp: 460, speed: 3.9, meleeDamage: 24, boltDamage: 16, boltSpeed: 12, attackInterval: 2.1, scale: 1.1, patterns: ['illusion', 'bolt', 'teleport', 'volley'], enrageAt: 0.4, color: 0x8a5ad8, shieldHits: 0 },
    objective: 'Task 3: Defeat Mohasura, the Deluder',
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
      'He does not fight alone. Shades answer him — the hungry, the taking — and while they crowd you he gathers a shield of everything he has hoarded.',
      'Break the shades first. When the shield cracks, he is naked to your fire. He will summon again. Be faster than his greed.',
    ],
    arena: 'tunnels',
    playerSpawn: [-46, -13.9, -226, 0],
    bossSpawn: [-46, -14, -252],
    arenaCenter: [-46, -14, -240],
    arenaRadius: 18,
    boss: { hp: 580, speed: 3.4, meleeDamage: 26, boltDamage: 17, boltSpeed: 12, attackInterval: 2.2, scale: 1.2, patterns: ['summon', 'shield', 'bolt', 'volley', 'charge'], enrageAt: 0.35, color: 0xd8a83a, shieldHits: 6 },
    objective: 'Task 4: Defeat Lobhasura, the Grasping',
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
      'His bolts come in storms. Wound him and the storm doubles; wound him again and the library itself will seem to burn.',
      'There is no safe distance from anger. Dodge through the volleys, breathe between them, and never stop firing.',
    ],
    arena: 'library',
    playerSpawn: [-110, -9.9, -80, 0],
    bossSpawn: [-110, -10, -104],
    arenaCenter: [-110, -10, -100],
    arenaRadius: 30,
    boss: { hp: 700, speed: 4.1, meleeDamage: 28, boltDamage: 16, boltSpeed: 14, attackInterval: 1.8, scale: 1.2, patterns: ['volley', 'volley', 'bolt', 'charge', 'slam'], enrageAt: 0.5, color: 0xe83a3a, shieldHits: 0 },
    objective: 'Task 5: Defeat Krodhasura, the Wrathful',
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
      'Kamasura — the Desirer. He does not chase. He draws. Everything he wants comes to him, and in the deep shrine he wants you.',
      'Feel the pull and fight it: he drags you into his rings and his reach. Plant your feet. Fire into the draw.',
      'He shields himself in wanting. Break it, and he will pull harder. He is the strongest asura you have yet faced.',
    ],
    arena: 'shrine',
    playerSpawn: [0, -19.9, -284, 0],
    bossSpawn: [0, -20, -306],
    arenaCenter: [0, -20, -308],
    arenaRadius: 26,
    boss: { hp: 840, speed: 3.8, meleeDamage: 30, boltDamage: 17, boltSpeed: 13, attackInterval: 1.9, scale: 1.3, patterns: ['pull', 'slam', 'bolt', 'shield', 'volley', 'charge'], enrageAt: 0.4, color: 0xe86ab8, shieldHits: 8 },
    objective: 'Task 6: Defeat Kamasura, the Desirer',
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
      'He binds shades to himself and the moon to darkness. He teleports behind you. He charges, slams, and shields, and he learns the rhythm of your fire.',
      'Only the sanctum stands between him and the deepest memory. Hold it.',
    ],
    arena: 'sanctum',
    playerSpawn: [0, -25.9, -372, 0],
    bossSpawn: [0, -26, -396],
    arenaCenter: [0, -26, -396],
    arenaRadius: 34,
    boss: { hp: 980, speed: 4.3, meleeDamage: 32, boltDamage: 18, boltSpeed: 14, attackInterval: 1.7, scale: 1.35, patterns: ['summon', 'teleport', 'charge', 'slam', 'shield', 'volley', 'bolt'], enrageAt: 0.45, color: 0x5ad8d0, shieldHits: 10 },
    objective: 'Task 7: Defeat Mamasura, the Possessor',
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
      'He has every trick: the storm, the charge, the copies, the pull, the shield, the shades. And he has time. He will not tire.',
      'At the mountain gateway where the first memory was made, end this. Remember everything you have learned. Then aim.',
    ],
    arena: 'memory-tusk',
    playerSpawn: [2000, 0.2, 22, 0],
    bossSpawn: [2000, 0, -12],
    arenaCenter: [2000, 0, 0],
    arenaRadius: 30,
    boss: { hp: 1200, speed: 4.5, meleeDamage: 34, boltDamage: 19, boltSpeed: 15, attackInterval: 1.5, scale: 1.5, patterns: ['volley', 'charge', 'illusion', 'pull', 'shield', 'summon', 'slam', 'teleport', 'bolt'], enrageAt: 0.5, color: 0xf0f0ff, shieldHits: 12 },
    objective: 'Task 8: Defeat Ahamkarasura, the Ego',
  },
];

export const missionByTask = (task: number): MissionDef | undefined => MISSIONS.find((m) => m.task === task);
