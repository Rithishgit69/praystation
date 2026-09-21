import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { WorldMap } from '@/world/WorldMap';
import type { WorldStreamer } from '@/world/WorldStreamer';
import { gameStore } from '@/state/store';

export interface MapPlayer {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Full-screen map (M / Tab / Back). Zone outlines, the forest path, activated shrines (fast travel on
 * click) and a placeable waypoint that drives the light-motes trail. Wheel/pinch zooms; drag pans.
 */
export class MapScreen implements System {
  readonly name = 'map';
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly legend: HTMLDivElement;
  private visible = false;
  private zoom = 1.6; // px per metre
  private center = { x: 0, z: 0 };
  private dragging = false;
  private dragMoved = false;
  private last = { x: 0, y: 0 };
  waypoint: THREE.Vector3 | null = null;
  private readonly onBack = (): void => {
    if (this.visible) this.setVisible(false);
  };

  constructor(
    private readonly engine: Engine,
    private readonly world: WorldMap,
    private readonly streamer: WorldStreamer,
    private readonly getPlayer: () => MapPlayer,
    private readonly travel: (shrineId: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mapscreen';
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('MapScreen: 2D context unavailable');
    this.ctx = ctx;
    this.legend = document.createElement('div');
    this.legend.className = 'map-legend';
    this.legend.innerHTML = '<span class="map-title">The Temple</span><span>Click to place a waypoint · click a lit shrine to travel · M to close</span>';
    this.root.append(this.canvas, this.legend);
    engine.uiRoot.appendChild(this.root);
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.last = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      if (Math.hypot(dx, dy) > 4) this.dragMoved = true;
      if (this.dragMoved) {
        this.center.x -= dx / this.zoom;
        this.center.z -= dy / this.zoom;
        this.last = { x: e.clientX, y: e.clientY };
        this.draw();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (!this.dragMoved) this.click(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.2, Math.min(6, this.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      this.draw();
    });
    window.addEventListener('eka:back', this.onBack);
  }

  private toScreen(x: number, z: number): [number, number] {
    return [this.canvas.width / 2 + (x - this.center.x) * this.zoom, this.canvas.height / 2 + (z - this.center.z) * this.zoom];
  }
  private toWorld(sx: number, sy: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const px = ((sx - r.left) / r.width) * this.canvas.width;
    const py = ((sy - r.top) / r.height) * this.canvas.height;
    return [this.center.x + (px - this.canvas.width / 2) / this.zoom, this.center.z + (py - this.canvas.height / 2) / this.zoom];
  }

  private click(sx: number, sy: number): void {
    const [wx, wz] = this.toWorld(sx, sy);
    const lit = gameStore.getState().activatedShrines;
    for (const sh of this.world.shrines) {
      if (!lit.includes(sh.id)) continue;
      if (Math.hypot(sh.arrive.x - wx, sh.arrive.z - wz) * this.zoom < 14) {
        this.setVisible(false);
        this.travel(sh.id);
        return;
      }
    }
    const p = this.getPlayer();
    if (this.waypoint && Math.hypot(this.waypoint.x - wx, this.waypoint.z - wz) * this.zoom < 12) this.waypoint = null;
    else this.waypoint = new THREE.Vector3(wx, 0, wz);
    void p;
    this.draw();
  }

  private draw(): void {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,13,24,0.94)';
    c.fillRect(0, 0, W, H);
    // Ravine ring (world boundary).
    const [ox, oz] = this.toScreen(0, 0);
    c.strokeStyle = 'rgba(143,180,232,0.25)';
    c.setLineDash([6, 8]);
    c.beginPath();
    c.arc(ox, oz, this.world.terrain.ravineRadius * this.zoom, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    // Path.
    c.strokeStyle = 'rgba(232,220,192,0.35)';
    c.lineWidth = 1.5;
    for (const p of this.world.terrain.paths) {
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const pt = p.pointAt(i / 60);
        const [sx, sy] = this.toScreen(pt.x, pt.z);
        if (i === 0) c.moveTo(sx, sy);
        else c.lineTo(sx, sy);
      }
      c.stroke();
    }
    // Zones.
    c.font = '13px "EB Garamond", serif';
    c.textAlign = 'center';
    for (const z of this.world.zones) {
      if (z.id === 'memory-tusk' || z.id.startsWith('arena-')) continue;
      const [x0, y0] = this.toScreen(z.min.x, z.min.z);
      const [x1, y1] = this.toScreen(z.max.x, z.max.z);
      const under = z.max.y < 0;
      c.strokeStyle = under ? 'rgba(143,180,232,0.35)' : 'rgba(217,179,112,0.6)';
      c.setLineDash(under ? [4, 6] : []);
      c.lineWidth = 1;
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      c.setLineDash([]);
      c.fillStyle = under ? 'rgba(143,180,232,0.7)' : 'rgba(232,220,192,0.85)';
      if (this.zoom > 0.35) c.fillText(z.title, (x0 + x1) / 2, y0 + 16);
    }
    // Loaded geometry (faint).
    c.strokeStyle = 'rgba(232,220,192,0.16)';
    c.lineWidth = 1;
    for (const r of this.streamer.mapRects) {
      const [sx, sy] = this.toScreen(r.x, r.z);
      c.save();
      c.translate(sx, sy);
      c.rotate(-r.rotY);
      c.strokeRect((-r.w / 2) * this.zoom, (-r.d / 2) * this.zoom, r.w * this.zoom, r.d * this.zoom);
      c.restore();
    }
    // Shrines.
    const lit = gameStore.getState().activatedShrines;
    for (const sh of this.world.shrines) {
      const [sx, sy] = this.toScreen(sh.arrive.x, sh.arrive.z);
      const on = lit.includes(sh.id);
      c.fillStyle = on ? '#ffc46b' : 'rgba(232,220,192,0.25)';
      c.beginPath();
      c.arc(sx, sy, on ? 6 : 4, 0, Math.PI * 2);
      c.fill();
      if (on) {
        c.strokeStyle = 'rgba(255,196,107,0.5)';
        c.beginPath();
        c.arc(sx, sy, 11, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = '#e8dcc0';
        c.fillText(sh.title, sx, sy - 14);
      }
    }
    // Waypoint.
    if (this.waypoint) {
      const [sx, sy] = this.toScreen(this.waypoint.x, this.waypoint.z);
      c.strokeStyle = '#8fb4e8';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(sx, sy - 9);
      c.lineTo(sx + 9, sy);
      c.lineTo(sx, sy + 9);
      c.lineTo(sx - 9, sy);
      c.closePath();
      c.stroke();
    }
    // Player.
    const p = this.getPlayer();
    const [px, py] = this.toScreen(p.x, p.z);
    c.save();
    c.translate(px, py);
    c.rotate(-p.yaw);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -10);
    c.lineTo(7, 8);
    c.lineTo(0, 4);
    c.lineTo(-7, 8);
    c.closePath();
    c.fill();
    c.restore();
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.hidden = !v;
    this.engine.uiBlocking = v;
    this.engine.input.gameplayBlocked = v || this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = !v;
    if (v) {
      this.engine.input.mouse.unlock();
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      const p = this.getPlayer();
      this.center = { x: p.x, z: p.z };
      this.draw();
    }
  }

  update(): void {
    if (this.engine.input.pressed('map')) this.setVisible(!this.visible);
    if (this.visible) this.draw();
  }

  dispose(): void {
    window.removeEventListener('eka:back', this.onBack);
    this.root.remove();
  }
}
