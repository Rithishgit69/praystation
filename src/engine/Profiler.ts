import type * as THREE from 'three';
import type { FrameStats } from './types';

interface PerfMemory {
  usedJSHeapSize: number;
}

/** In-build performance overlay + rolling frame statistics. Toggle with F3 or the dev menu. */
export class Profiler {
  readonly stats: FrameStats = {
    fps: 0,
    frameMs: 0,
    frameMsMax: 0,
    physicsMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    heapMb: 0,
    renderScale: 1,
    spikes25ms: 0,
    chunksLoaded: 0,
    streamStepMaxMs: 0,
    streamAttachMaxMs: 0,
    streamWorstStep: '',
  };
  /** Exponential moving average of frame time used by the dynamic resolution scaler. */
  frameMsEma = 16.7;
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly graph: HTMLCanvasElement;
  private readonly graphCtx: CanvasRenderingContext2D;
  private readonly history = new Float32Array(160);
  private historyHead = 0;
  private windowStart = performance.now();
  private readonly startTime = performance.now();
  private windowFrames = 0;
  private windowMax = 0;
  private windowSum = 0;
  private frameStart = 0;
  private visible = false;
  private tierLabel = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'profiler';
    this.root.hidden = true;
    this.text = document.createElement('pre');
    this.graph = document.createElement('canvas');
    this.graph.width = 160;
    this.graph.height = 36;
    const ctx = this.graph.getContext('2d');
    if (!ctx) throw new Error('Profiler: 2D context unavailable');
    this.graphCtx = ctx;
    this.root.append(this.text, this.graph);
    parent.appendChild(this.root);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.hidden = !v;
  }
  toggle(): void {
    this.setVisible(!this.visible);
  }
  get isVisible(): boolean {
    return this.visible;
  }
  setTierLabel(label: string): void {
    this.tierLabel = label;
  }

  beginFrame(now: number): void {
    this.frameStart = now;
  }

  endFrame(renderer: THREE.WebGLRenderer, physicsMs: number, renderMs: number, renderScale: number): void {
    const now = performance.now();
    const frameMs = now - this.frameStart;
    this.frameMsEma += (frameMs - this.frameMsEma) * 0.1;
    this.history[this.historyHead] = frameMs;
    this.historyHead = (this.historyHead + 1) % this.history.length;
    this.windowFrames++;
    this.windowSum += frameMs;
    if (frameMs > this.windowMax) this.windowMax = frameMs;
    if (frameMs > 25 && now - this.startTime > 3000) this.stats.spikes25ms++;

    const s = this.stats;
    s.physicsMs = physicsMs;
    s.renderMs = renderMs;
    s.renderScale = renderScale;
    const info = renderer.info;
    s.drawCalls = info.render.calls;
    s.triangles = info.render.triangles;
    s.geometries = info.memory.geometries;
    s.textures = info.memory.textures;
    s.programs = info.programs?.length ?? 0;

    if (now - this.windowStart >= 250) {
      const dtWindow = (now - this.windowStart) / 1000;
      s.fps = Math.round(this.windowFrames / dtWindow);
      s.frameMs = this.windowSum / this.windowFrames;
      s.frameMsMax = this.windowMax;
      const mem = (performance as unknown as { memory?: PerfMemory }).memory;
      s.heapMb = mem ? mem.usedJSHeapSize / 1048576 : 0;
      this.windowStart = now;
      this.windowFrames = 0;
      this.windowMax = 0;
      this.windowSum = 0;
      if (this.visible) this.draw();
    }
  }

  private draw(): void {
    const s = this.stats;
    this.text.textContent =
      `${s.fps} fps  ${s.frameMs.toFixed(1)} ms (max ${s.frameMsMax.toFixed(1)})\n` +
      `phys ${s.physicsMs.toFixed(2)}  gpu-submit ${s.renderMs.toFixed(2)}  scale ${s.renderScale.toFixed(2)}\n` +
      `draw ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k  geo ${s.geometries}  tex ${s.textures}  prog ${s.programs}\n` +
      `heap ${s.heapMb.toFixed(0)} MB  chunks ${s.chunksLoaded}  spikes>25ms ${s.spikes25ms}  ${this.tierLabel}\n` +
      `stream step max ${s.streamStepMaxMs.toFixed(1)} (${s.streamWorstStep})  attach max ${s.streamAttachMaxMs.toFixed(1)}`;
    const ctx = this.graphCtx;
    const w = this.graph.width;
    const h = this.graph.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(11,18,32,0.7)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(217,179,112,0.35)';
    ctx.beginPath();
    const y16 = h - (16.7 / 40) * h;
    ctx.moveTo(0, y16);
    ctx.lineTo(w, y16);
    ctx.stroke();
    for (let i = 0; i < this.history.length; i++) {
      const v = this.history[(this.historyHead + i) % this.history.length] as number;
      const bh = Math.min(h, (v / 40) * h);
      ctx.fillStyle = v > 25 ? '#ff5a3c' : v > 16.9 ? '#ffc46b' : '#8fb4e8';
      ctx.fillRect(i, h - bh, 1, bh);
    }
  }
}
