export type WeaponId = 'astra' | 'dhanush' | 'chakra' | 'vajra';

/**
 * How a weapon fires. `auto`: hold to fire hitscan rounds. `charge`: hold to draw, release to loose a
 * projectile whose power grows with the draw. `throw`: press to throw a returning disc. `burst`: press
 * for a close-range fan of pellets.
 */
export type FireMode = 'auto' | 'charge' | 'throw' | 'burst';

export interface WeaponDef {
  id: WeaponId;
  /** Display name and the archetype it is named after. */
  name: string;
  epithet: string;
  /** One-line instruction shown when the weapon is granted and on the how-to-play card. */
  howTo: string;
  /** The task in which the temple grants it. */
  unlockTask: number;
  mode: FireMode;
  /** Damage per round / pellet / full-draw arrow / disc pass. */
  damage: number;
  /** Rounds per second (auto, burst), throws per second (throw). */
  rate: number;
  /** Rounds per magazine (auto, burst), discs in hand (throw); Infinity for the bow. */
  mag: number;
  /** Seconds to reload (auto, burst) or for one disc to return on its own (throw). */
  reload: number;
  /** Spread half-angle in degrees from the hip and while aiming. */
  spreadHip: number;
  spreadAim: number;
  /** Extra spread added per shot (degrees) and how fast it settles (degrees per second). */
  bloom: number;
  bloomDecay: number;
  /** Camera kick per shot in degrees. */
  recoil: number;
  /** Field of view while aiming. */
  fovAim: number;
  /** Range in metres (hitscan) and, for the burst, where damage starts to fall off. */
  range: number;
  falloffStart?: number;
  /** Pellets per burst shot. */
  pellets?: number;
  /** Seconds to a full draw. */
  chargeTime?: number;
  /** Projectile flight for charge / throw modes. */
  projectile?: { speed: number; gravity: number; radius: number; pierce: boolean; returnRange?: number };
  /** Tint of tracers, glow and impacts. */
  color: number;
  /** Crosshair style. */
  reticle: 'dot' | 'chevron' | 'circle' | 'wide';
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'astra',
    name: 'Astra',
    epithet: 'the rifle of remembered light',
    howTo: 'Hold to fire · aim for a tighter spread · R reloads',
    unlockTask: 1,
    mode: 'auto',
    damage: 8,
    rate: 5,
    mag: 12,
    reload: 1.5,
    spreadHip: 1.6,
    spreadAim: 0.4,
    bloom: 0.45,
    bloomDecay: 3.2,
    recoil: 0.32,
    fovAim: 44,
    range: 90,
    color: 0xffd08a,
    reticle: 'dot',
  },
  {
    id: 'dhanush',
    name: 'Dhanush',
    epithet: 'the bow of light',
    howTo: 'Hold to draw, release to loose · a full draw pierces and hits the core hardest',
    unlockTask: 2,
    mode: 'charge',
    damage: 38,
    rate: 1,
    mag: Infinity,
    reload: 0,
    spreadHip: 0.9,
    spreadAim: 0.15,
    bloom: 0,
    bloomDecay: 4,
    recoil: 0.5,
    fovAim: 36,
    range: 120,
    chargeTime: 0.9,
    projectile: { speed: 62, gravity: 5.5, radius: 0.25, pierce: true },
    color: 0xa8e8ff,
    reticle: 'chevron',
  },
  {
    id: 'chakra',
    name: 'Chakra',
    epithet: 'the returning disc',
    howTo: 'Press to throw · it cuts on the way out and on the way back, then returns to your hand',
    unlockTask: 3,
    mode: 'throw',
    damage: 16,
    rate: 1.6,
    mag: 4,
    reload: 2.2,
    spreadHip: 0.6,
    spreadAim: 0.2,
    bloom: 0,
    bloomDecay: 4,
    recoil: 0.2,
    fovAim: 46,
    range: 60,
    projectile: { speed: 30, gravity: 0, radius: 0.55, pierce: true, returnRange: 18 },
    color: 0xffe36a,
    reticle: 'circle',
  },
  {
    id: 'vajra',
    name: 'Vajra',
    epithet: 'the thunder burst',
    howTo: 'Press for a burst of six · devastating up close, nothing at range · four charges, then it recharges',
    unlockTask: 4,
    mode: 'burst',
    damage: 7,
    rate: 0.9,
    mag: 4,
    reload: 2.4,
    spreadHip: 6,
    spreadAim: 4,
    bloom: 0,
    bloomDecay: 4,
    recoil: 1.3,
    fovAim: 50,
    range: 30,
    falloffStart: 12,
    pellets: 6,
    color: 0xc8d8ff,
    reticle: 'wide',
  },
];

export const weaponById = (id: WeaponId): WeaponDef => WEAPONS.find((w) => w.id === id) as WeaponDef;
