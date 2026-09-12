import * as THREE from 'three';
import { Terrain } from './Terrain';
import type { ZoneDef, ZoneId } from './WorldTypes';
import { CELL_SIZE } from './WorldStreamer';
import { buildCourtyard } from './zones/Courtyard';
import { buildGate } from './zones/Gate';
import { buildHall } from './zones/Hall';
import { buildPassage } from './zones/Passage';
import { buildMoonChamber } from './zones/MoonChamber';
import { buildTunnels } from './zones/Tunnels';
import { buildLibrary } from './zones/Library';
import { buildShrine } from './zones/Shrine';
import { buildSanctum } from './zones/Sanctum';
import { buildSideChamber } from './zones/SideChamber';

export interface Landmark {
  id: string;
  kind: 'shrine' | 'lore' | 'trigger';
  position: THREE.Vector3;
  yaw: number;
  radius: number;
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/**
 * The 1.2 km world: zone bounds (north is -Z), portal visibility, the forest approach path, terrain
 * flats and the authored forest landmarks. Underground zones are separated from the surface by Y.
 */
export class WorldMap {
  readonly terrain = new Terrain();
  readonly zones: ZoneDef[];
  readonly landmarks: Landmark[] = [];
  readonly spawn = { position: v(0, 0, 470), yaw: 0 };

  constructor() {
    const t = this.terrain;
    // Temple plateau: slightly below the built floors so stone always sits above earth.
    t.flats.push({ min: new THREE.Vector2(-175, -470), max: new THREE.Vector2(175, 100), height: -0.35, margin: 40 });
    // Open-roofed moon chamber cuts into the plateau.
    t.flats.push({ min: new THREE.Vector2(62, -238), max: new THREE.Vector2(158, -142), height: -3.2, margin: 2 });
    const path = t.addPath([v(0, 0, 482), v(-30, 0, 425), v(24, 0, 355), v(-34, 0, 285), v(18, 0, 212), v(-14, 0, 152), v(6, 0, 112), v(0, 0, 90), v(0, 0, 60)], 2.6);
    const at = (tt: number): THREE.Vector3 => path.pointAt(tt);
    const yawAt = (tt: number): number => {
      const d = path.tangentAt(tt);
      return Math.atan2(-d.x, -d.z);
    };
    this.landmarks.push(
      { id: 'bell-first', kind: 'trigger', position: at(0.12), yaw: 0, radius: 8 },
      { id: 'milestone', kind: 'lore', position: at(0.4).add(new THREE.Vector3(3.2, 0, 0)), yaw: yawAt(0.4) + Math.PI / 2, radius: 2.2 },
      { id: 'forest', kind: 'shrine', position: at(0.66).add(new THREE.Vector3(-3.6, 0, 0)), yaw: yawAt(0.66), radius: 2.4 },
      { id: 'gate-sight', kind: 'trigger', position: at(0.86), yaw: 0, radius: 10 },
    );
    this.zones = [
      { id: 'gate', title: 'Temple Gate', min: v(-40, -6, 44), max: v(40, 60, 96), interior: false, visibleFrom: ['forest', 'courtyard'], build: buildGate },
      { id: 'courtyard', title: 'Outer Courtyard', min: v(-42, -6, -52), max: v(42, 60, 44), interior: false, visibleFrom: ['forest', 'gate', 'hall', 'side-east', 'side-west'], build: buildCourtyard },
      { id: 'side-west', title: 'West Lore Chamber', min: v(-72, -6, -32), max: v(-42, 30, 0), interior: true, visibleFrom: ['courtyard', 'forest'], fog: { color: 0x0a1220, density: 0.05 }, ambient: { color: 0x34507a, intensity: 1.4 }, build: (ctx) => buildSideChamber(ctx, 'side-west') },
      { id: 'side-east', title: 'East Lore Chamber', min: v(42, -6, -32), max: v(72, 30, 0), interior: true, visibleFrom: ['courtyard', 'forest'], fog: { color: 0x0a1220, density: 0.05 }, ambient: { color: 0x34507a, intensity: 1.4 }, build: (ctx) => buildSideChamber(ctx, 'side-east') },
      { id: 'hall', title: 'Hall of Memories', min: v(-34, -6, -134), max: v(44, 60, -52), interior: true, visibleFrom: ['courtyard', 'passage', 'forest'], fog: { color: 0x0b1424, density: 0.034 }, ambient: { color: 0x34507a, intensity: 1.5 }, build: buildHall },
      { id: 'passage', title: 'Corrupted Passage', min: v(44, -8, -142), max: v(152, 40, -60), interior: true, visibleFrom: ['hall', 'moon'], fog: { color: 0x090d16, density: 0.06 }, ambient: { color: 0x2a2a44, intensity: 1.3 }, build: buildPassage },
      { id: 'moon', title: 'Moon Chamber', min: v(60, -8, -244), max: v(160, 60, -140), interior: true, visibleFrom: ['passage', 'tunnels', 'forest'], fog: { color: 0x0f2038, density: 0.03 }, ambient: { color: 0x34507a, intensity: 0.8 }, build: buildMoonChamber },
      { id: 'tunnels', title: 'Serpent Tunnels', min: v(-150, -22, -284), max: v(160, -4, -150), interior: true, visibleFrom: ['moon', 'library'], fog: { color: 0x05090f, density: 0.07 }, ambient: { color: 0x22303c, intensity: 1.4 }, build: buildTunnels },
      { id: 'library', title: 'Ancient Library', min: v(-165, -18, -160), max: v(-58, -3, -46), interior: true, visibleFrom: ['tunnels', 'shrine'], fog: { color: 0x0a0c10, density: 0.05 }, ambient: { color: 0x3a3226, intensity: 1.4 }, build: buildLibrary },
      { id: 'shrine', title: 'Underground Shrine', min: v(-70, -28, -356), max: v(50, -6, -150), interior: true, visibleFrom: ['library', 'sanctum'], fog: { color: 0x07060c, density: 0.055 }, ambient: { color: 0x2c2238, intensity: 1.4 }, build: buildShrine },
      { id: 'sanctum', title: 'Sealed Sanctum', min: v(-58, -34, -456), max: v(58, -10, -352), interior: true, visibleFrom: ['shrine'], fog: { color: 0x0b1020, density: 0.028 }, ambient: { color: 0x34507a, intensity: 1.5 }, build: buildSanctum },
    ];
  }

  /** Zones whose XZ bounds overlap the given cell rectangle (inclusive cell indices). */
  zonesTouching(ix0: number, iz0: number, ix1: number, iz1: number): ZoneDef[] {
    const x0 = ix0 * CELL_SIZE;
    const z0 = iz0 * CELL_SIZE;
    const x1 = (ix1 + 1) * CELL_SIZE;
    const z1 = (iz1 + 1) * CELL_SIZE;
    return this.zones.filter((z) => z.max.x >= x0 && z.min.x <= x1 && z.max.z >= z0 && z.min.z <= z1);
  }

  /** Innermost zone containing a point (interiors win over exteriors). */
  zoneAt(p: THREE.Vector3): ZoneId | null {
    let best: ZoneDef | null = null;
    for (const z of this.zones) {
      if (p.x < z.min.x || p.x > z.max.x || p.z < z.min.z || p.z > z.max.z || p.y < z.min.y || p.y > z.max.y) continue;
      if (!best || (z.interior && !best.interior)) best = z;
    }
    return best ? best.id : null;
  }

  /** Zones that list `zone` in their visibleFrom (i.e. have a portal onto it). */
  portalsInto(zone: ZoneId): ZoneId[] {
    return this.zones.filter((z) => z.visibleFrom.includes(zone)).map((z) => z.id);
  }

  /** True if a surface point is inside any surface zone footprint (used to exclude trees). */
  footprintAt(x: number, z: number, margin: number): boolean {
    for (const zn of this.zones) {
      if (zn.max.y < 0) continue; // underground
      if (x >= zn.min.x - margin && x <= zn.max.x + margin && z >= zn.min.z - margin && z <= zn.max.z + margin) return true;
    }
    return false;
  }
}
