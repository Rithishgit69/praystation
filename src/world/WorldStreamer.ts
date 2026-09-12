import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { RAPIER } from '@/engine/Physics';
import type { System } from '@/engine/types';
import type { MapRect } from '@/ui/HUD';
import { SeededRandom, hashString } from '@/util/random';
import { gameStore } from '@/state/store';
import type { MaterialLibrary } from './Materials';
import type { Terrain } from './Terrain';
import type { WorldMap } from './WorldMap';
import type { Anchor, UnitBuild, ZoneBuildContext, ZoneDef, ZoneId } from './WorldTypes';
import { buildForestCell } from './zones/Forest';

export const CELL_SIZE = 64;
const BUILD_BUDGET_MS = 3.0;
const LOD_SHELL_DISTANCE = 120;

type UnitKey = string;

interface LoadedUnit {
  key: UnitKey;
  zone: ZoneId;
  build: UnitBuild;
  colliders: RAPIER.Collider[];
  /** Cell coordinates for forest cells; zone bounds centre for zones. */
  center: THREE.Vector3;
  /** Shaders compiled off the critical path; hidden until then to avoid a compile spike. */
  compiled: boolean;
}

interface BuildJob {
  key: UnitKey;
  zone: ZoneId;
  gen: Generator<void, UnitBuild, void>;
  center: THREE.Vector3;
  startedAt: number;
  step: number;
}

export interface StreamFocus {
  position: THREE.Vector3;
  forward: THREE.Vector3;
}

const cellKey = (ix: number, iz: number): UnitKey => `c:${ix},${iz}`;
const zoneKey = (id: ZoneId): UnitKey => `z:${id}`;

/**
 * Chunked world streaming: 64 m grid, async cooperative builds budgeted per frame, load radius from the
 * quality tier with +1 cell unload hysteresis, priority by camera direction, portal visibility sets for
 * interiors, and a distance LOD swap between a unit's full build and its low-detail shell.
 */
export class WorldStreamer implements System {
  readonly name = 'world-streamer';
  readonly anchors = new Map<string, Anchor>();
  readonly mapRects: MapRect[] = [];
  private readonly loaded = new Map<UnitKey, LoadedUnit>();
  private readonly queue: Array<{ key: UnitKey; priority: number; zone: ZoneId; ix: number; iz: number }> = [];
  private current: BuildJob | null = null;
  private readonly root = new THREE.Group();
  private readonly engine: Engine;
  private readonly lib: MaterialLibrary;
  private readonly terrain: Terrain;
  private readonly world: WorldMap;
  private readonly focus: () => StreamFocus;
  private currentZone: ZoneId = 'forest';
  private readonly tmp = new THREE.Vector3();
  private lastFocusCell = { ix: NaN, iz: NaN };
  onZoneChange: ((zone: ZoneId) => void) | null = null;

  constructor(engine: Engine, lib: MaterialLibrary, terrain: Terrain, world: WorldMap, focus: () => StreamFocus) {
    this.engine = engine;
    this.lib = lib;
    this.terrain = terrain;
    this.world = world;
    this.focus = focus;
    this.root.name = 'world';
    engine.scene.add(this.root);
  }

  get radiusCells(): number {
    return this.engine.quality.settings.streamRadiusCells;
  }
  get loadedCount(): number {
    return this.loaded.size;
  }
  get zone(): ZoneId {
    return this.currentZone;
  }

  private context(seed: number): ZoneBuildContext {
    return { lib: this.lib, quality: this.engine.quality.settings, rng: new SeededRandom(seed), terrain: this.terrain, world: this.world, flags: gameStore.getState().flags };
  }

  /** Synchronously load everything within `radius` cells of the focus (initial load, teleports). */
  loadImmediate(radius: number): void {
    const f = this.focus();
    const ix = Math.floor(f.position.x / CELL_SIZE);
    const iz = Math.floor(f.position.z / CELL_SIZE);
    this.refreshQueue(f, ix, iz);
    const wanted = new Set<UnitKey>();
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) if (this.world.hasForestAt(ix + dx, iz + dz)) wanted.add(cellKey(ix + dx, iz + dz));
    for (const z of this.world.zonesTouching(ix - radius, iz - radius, ix + radius, iz + radius)) wanted.add(zoneKey(z.id));
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i] as (typeof this.queue)[number];
      if (!wanted.has(q.key)) continue;
      this.queue.splice(i, 1);
      const job = this.startJob(q);
      if (!job) continue;
      let r = job.gen.next();
      while (!r.done) r = job.gen.next();
      this.attach(job, r.value);
      const unit = this.loaded.get(job.key);
      if (unit) {
        this.engine.renderer.compile(unit.build.group, this.engine.camera, this.engine.scene);
        unit.compiled = true;
      }
    }
    this.updateZoneAndVisibility(f);
  }

  private zoneOf(id: ZoneId): ZoneDef | undefined {
    return this.world.zones.find((z) => z.id === id);
  }

  private startJob(q: { key: UnitKey; zone: ZoneId; ix: number; iz: number }): BuildJob | null {
    if (q.zone === 'forest') {
      const cx = (q.ix + 0.5) * CELL_SIZE;
      const cz = (q.iz + 0.5) * CELL_SIZE;
      const ctx = this.context(hashString(q.key));
      return { key: q.key, zone: 'forest', gen: buildForestCell(ctx, cx, cz, CELL_SIZE), center: new THREE.Vector3(cx, 0, cz), startedAt: performance.now(), step: 0 };
    }
    const def = this.zoneOf(q.zone);
    if (!def) return null;
    const center = def.min.clone().add(def.max).multiplyScalar(0.5);
    return { key: q.key, zone: def.id, gen: def.build(this.context(hashString(q.key))), center, startedAt: performance.now(), step: 0 };
  }

  private attach(job: BuildJob, build: UnitBuild): void {
    this.root.add(build.group);
    if (build.shell) {
      build.shell.visible = false;
      this.root.add(build.shell);
    }
    const colliders = build.colliders.map((c) => {
      if (c.kind === 'box') return this.engine.physics.addStaticBox(c.center, c.half, c.quaternion, c.surface);
      if (c.kind === 'cylinder') return this.engine.physics.addStaticCylinder(c.center, c.halfHeight, c.radius, c.surface);
      return this.engine.physics.addStaticTrimesh(c.geometry, c.matrix, c.surface);
    });
    for (const a of build.anchors) this.anchors.set(a.id, a);
    this.mapRects.push(...build.mapRects);
    const unit: LoadedUnit = { key: job.key, zone: job.zone, build, colliders, center: job.center, compiled: false };
    build.group.visible = false;
    this.loaded.set(job.key, unit);
    void this.engine.renderer.compileAsync(build.group, this.engine.camera, this.engine.scene).then(() => {
      unit.compiled = true;
    });
  }

  private unload(unit: LoadedUnit): void {
    this.root.remove(unit.build.group);
    if (unit.build.shell) this.root.remove(unit.build.shell);
    for (const c of unit.colliders) this.engine.physics.remove(c);
    for (const d of unit.build.disposables) d();
    for (const a of unit.build.anchors) this.anchors.delete(a.id);
    for (const r of unit.build.mapRects) {
      const i = this.mapRects.indexOf(r);
      if (i >= 0) this.mapRects.splice(i, 1);
    }
    unit.build.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
      if ((m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
    });
    this.loaded.delete(unit.key);
  }

  private refreshQueue(f: StreamFocus, ix: number, iz: number): void {
    const R = this.radiusCells;
    this.queue.length = 0;
    const consider = (key: UnitKey, zone: ZoneId, cx: number, cz: number, qix: number, qiz: number): void => {
      if (this.loaded.has(key) || this.current?.key === key) return;
      this.tmp.set(cx - f.position.x, 0, cz - f.position.z);
      const dist = this.tmp.length();
      const dir = dist > 1 ? this.tmp.divideScalar(dist).dot(f.forward) : 1;
      // Nearer and more in-front-of-the-camera loads first.
      this.queue.push({ key, zone, ix: qix, iz: qiz, priority: dist * (1.25 - dir * 0.5) });
    };
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        const qx = ix + dx;
        const qz = iz + dz;
        if (!this.world.hasForestAt(qx, qz)) continue;
        consider(cellKey(qx, qz), 'forest', (qx + 0.5) * CELL_SIZE, (qz + 0.5) * CELL_SIZE, qx, qz);
      }
    for (const z of this.world.zonesTouching(ix - R, iz - R, ix + R, iz + R)) {
      const c = z.min.clone().add(z.max).multiplyScalar(0.5);
      consider(zoneKey(z.id), z.id, c.x, c.z, 0, 0);
    }
    this.queue.sort((a, b) => a.priority - b.priority);
  }

  private unloadFar(ix: number, iz: number): void {
    const R = this.radiusCells + 1; // hysteresis
    for (const unit of Array.from(this.loaded.values())) {
      if (unit.zone === 'forest') {
        const [ux, uz] = unit.key.slice(2).split(',').map(Number) as [number, number];
        if (Math.max(Math.abs(ux - ix), Math.abs(uz - iz)) > R) this.unload(unit);
      } else {
        const def = this.zoneOf(unit.zone);
        if (!def) continue;
        const touching = this.world.zonesTouching(ix - R, iz - R, ix + R, iz + R).some((z) => z.id === unit.zone);
        if (!touching) this.unload(unit);
      }
    }
    if (this.current) {
      const c = this.current.center;
      const cx = Math.floor(c.x / CELL_SIZE);
      const cz = Math.floor(c.z / CELL_SIZE);
      if (this.current.zone === 'forest' && Math.max(Math.abs(cx - ix), Math.abs(cz - iz)) > R) this.current = null;
    }
  }

  private updateZoneAndVisibility(f: StreamFocus): void {
    const zone = this.world.zoneAt(f.position) ?? 'forest';
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.onZoneChange?.(zone);
    }
    const def = this.zoneOf(zone);
    const insideInterior = def?.interior === true;
    const visible = new Set<ZoneId>(def ? [def.id, ...def.visibleFrom] : ['forest']);
    for (const unit of this.loaded.values()) {
      const isVisible = insideInterior ? visible.has(unit.zone) : !this.zoneOf(unit.zone)?.interior || visible.has(unit.zone);
      // Exterior view: interiors stay hidden unless adjacent through a portal.
      const show = insideInterior ? isVisible : (this.zoneOf(unit.zone)?.interior ? visible.has(unit.zone) || this.world.portalsInto(zone).includes(unit.zone) : true);
      const d = unit.center.distanceTo(f.position);
      const useShell = unit.build.shell !== undefined && d > LOD_SHELL_DISTANCE;
      unit.build.group.visible = show && !useShell && unit.compiled;
      if (unit.build.shell) unit.build.shell.visible = show && useShell;
    }
  }

  update(dt: number, elapsed: number): void {
    const f = this.focus();
    const ix = Math.floor(f.position.x / CELL_SIZE);
    const iz = Math.floor(f.position.z / CELL_SIZE);
    if (ix !== this.lastFocusCell.ix || iz !== this.lastFocusCell.iz) {
      this.lastFocusCell = { ix, iz };
      this.unloadFar(ix, iz);
      this.refreshQueue(f, ix, iz);
    }
    // Cooperative building within the frame budget.
    const t0 = performance.now();
    while (performance.now() - t0 < BUILD_BUDGET_MS) {
      if (!this.current) {
        const next = this.queue.shift();
        if (!next) break;
        this.current = this.startJob(next);
        if (!this.current) continue;
      }
      const s0 = performance.now();
      const r = this.current.gen.next();
      const stepMs = performance.now() - s0;
      const stats = this.engine.profiler.stats;
      if (stepMs > stats.streamStepMaxMs) {
        stats.streamStepMaxMs = stepMs;
        stats.streamWorstStep = `${this.current.key}#${this.current.step}`;
      }
      this.current.step++;
      if (r.done) {
        const a0 = performance.now();
        this.attach(this.current, r.value);
        stats.streamAttachMaxMs = Math.max(stats.streamAttachMaxMs, performance.now() - a0);
        this.current = null;
      }
    }
    this.updateZoneAndVisibility(f);
    const cam = this.engine.camera;
    for (const unit of this.loaded.values()) {
      if (!unit.build.group.visible) continue;
      for (const u of unit.build.updates) u(dt, elapsed, cam);
    }
    this.engine.profiler.stats.chunksLoaded = this.loaded.size;
  }

  dispose(): void {
    for (const unit of Array.from(this.loaded.values())) this.unload(unit);
    this.engine.scene.remove(this.root);
  }
}
