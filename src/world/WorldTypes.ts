import type * as THREE from 'three';
import type { QualitySettings } from '@/engine/Quality';
import type { SeededRandom } from '@/util/random';
import type { MapRect } from '@/ui/HUD';
import type { MaterialLibrary } from './Materials';
import type { FireEffect } from './fx/Fire';
import type { ColliderSpec } from './props/types';
import type { Terrain } from './Terrain';
import type { WorldMap } from './WorldMap';

export type ZoneId = 'forest' | 'gate' | 'courtyard' | 'hall' | 'passage' | 'moon' | 'tunnels' | 'library' | 'shrine' | 'sanctum' | 'side-east' | 'side-west';

export type AnchorKind = 'mural' | 'statue' | 'brazier' | 'door' | 'mechanism' | 'lore' | 'shrine' | 'trigger' | 'spawn' | 'roof-hole';

/** A gameplay-relevant point in the world that systems look up by id (murals, doors, shrines, triggers). */
export interface Anchor {
  id: string;
  kind: AnchorKind;
  zone: ZoneId;
  position: THREE.Vector3;
  yaw: number;
  radius: number;
  /** Optional object to animate (door leaf, statue) — owned by the unit that created it. */
  object?: THREE.Object3D;
  data?: Record<string, string | number | boolean>;
}

export type UpdateFn = (dt: number, elapsed: number, camera: THREE.Camera) => void;

/** Everything a streamed unit (forest cell or authored zone) produced. */
export interface UnitBuild {
  group: THREE.Group;
  colliders: ColliderSpec[];
  updates: UpdateFn[];
  disposables: Array<() => void>;
  mapRects: MapRect[];
  fires: FireEffect[];
  anchors: Anchor[];
  /** Optional low-detail shell shown beyond the LOD distance. */
  shell?: THREE.Object3D;
}

export interface ZoneBuildContext {
  lib: MaterialLibrary;
  quality: QualitySettings;
  rng: SeededRandom;
  terrain: Terrain;
  world: WorldMap;
  /** Persistent flags (doors opened, braziers lit) so units build in their saved state. */
  flags: Readonly<Record<string, boolean | number | string>>;
}

/** Cooperative builder: yields between expensive steps so the streamer can budget per frame. */
export type UnitBuilder = (ctx: ZoneBuildContext) => Generator<void, UnitBuild, void>;

export interface ZoneDef {
  id: ZoneId;
  title: string;
  min: THREE.Vector3;
  max: THREE.Vector3;
  /** Interiors enable portal visibility sets and their own fog. */
  interior: boolean;
  /** Zones that stay visible while the player is inside this one. */
  visibleFrom: ZoneId[];
  fog?: { color: number; density: number };
  /** Fill light for interiors (no sky above); exteriors leave it unset. */
  ambient?: { color: number; intensity: number };
  build: UnitBuilder;
}

/** Run a cooperative builder to completion synchronously (test scenes, initial load). */
export const runToCompletion = <T>(gen: Generator<void, T, void>): T => {
  let r = gen.next();
  while (!r.done) r = gen.next();
  return r.value;
};
