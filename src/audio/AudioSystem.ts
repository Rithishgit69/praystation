import { Howl, Howler } from 'howler';
import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { SurfaceMaterial } from '@/engine/Physics';
import type { System } from '@/engine/types';
import { gameStore } from '@/state/store';
import type { ZoneId } from '@/world/WorldTypes';
import { SoundBank, type SoundId } from './SoundBank';

export type RoomType = 'exterior' | 'courtyard' | 'hall' | 'corridor' | 'tunnel' | 'cavern' | 'memory';

interface AmbienceLayer {
  sound: SoundId;
  volume: number;
}

const ZONE_ROOM: Record<ZoneId, RoomType> = {
  forest: 'exterior',
  gate: 'exterior',
  courtyard: 'courtyard',
  'side-west': 'corridor',
  'side-east': 'corridor',
  hall: 'hall',
  passage: 'corridor',
  moon: 'courtyard',
  tunnels: 'tunnel',
  library: 'hall',
  shrine: 'cavern',
  sanctum: 'cavern',
  'memory-tusk': 'memory',
};

const ROOM_AMBIENCE: Record<RoomType, AmbienceLayer[]> = {
  exterior: [
    { sound: 'wind-loop', volume: 0.5 },
    { sound: 'crickets-loop', volume: 0.45 },
  ],
  courtyard: [
    { sound: 'wind-loop', volume: 0.32 },
    { sound: 'crickets-loop', volume: 0.22 },
  ],
  hall: [
    { sound: 'wind-corridor-loop', volume: 0.35 },
    { sound: 'crickets-loop', volume: 0.06 },
  ],
  corridor: [{ sound: 'wind-corridor-loop', volume: 0.45 }],
  tunnel: [
    { sound: 'wind-corridor-loop', volume: 0.2 },
    { sound: 'drone-loop', volume: 0.18 },
    { sound: 'water-loop', volume: 0.25 },
  ],
  cavern: [
    { sound: 'drone-loop', volume: 0.28 },
    { sound: 'wind-corridor-loop', volume: 0.15 },
  ],
  memory: [{ sound: 'tanpura-loop', volume: 0.3 }],
};

/** Reverb wet level and decay per room type. */
const ROOM_REVERB: Record<RoomType, { wet: number; decay: number }> = {
  exterior: { wet: 0.05, decay: 0.8 },
  courtyard: { wet: 0.14, decay: 1.4 },
  hall: { wet: 0.32, decay: 2.6 },
  corridor: { wet: 0.25, decay: 1.6 },
  tunnel: { wet: 0.42, decay: 2.2 },
  cavern: { wet: 0.5, decay: 3.6 },
  memory: { wet: 0.3, decay: 2.8 },
};

/**
 * Audio: Howler for spatial one-shots, a synthesised sound bank, per-room ambience crossfades,
 * convolution reverb per room type, exterior occlusion when indoors, and a duck-to-silence bus for the
 * quietest supernatural moments (GDD §19).
 */
export class AudioSystem implements System {
  readonly name = 'audio';
  readonly bank = new SoundBank();
  private readonly howls = new Map<SoundId, Howl>();
  private readonly ambience = new Map<SoundId, { howl: Howl; id: number; target: number; current: number }>();
  private roomType: RoomType = 'exterior';
  private readonly ctx: AudioContext;
  private readonly duckGain: GainNode;
  private readonly dryGain: GainNode;
  private readonly reverbSend: GainNode;
  private readonly convolver: ConvolverNode;
  private readonly occlusionFilter: BiquadFilterNode;
  private readonly reverbBuffers = new Map<RoomType, AudioBuffer>();
  private readonly engine: Engine;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private lastStepVariant = 0;
  private duckTween: gsap.core.Tween | null = null;
  private listenerProvider: (() => THREE.Vector3) | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    Howler.autoUnlock = true;
    // Howler creates its AudioContext lazily on the first Howl; make one so the graph below can attach.
    this.howl('ui-tick');
    const ctx = Howler.ctx as AudioContext | null;
    if (!ctx) throw new Error('AudioSystem: Web Audio unavailable');
    this.ctx = ctx;
    // Re-route Howler's master through: master → occlusion filter (ambience only bypasses via send) → duck → destination,
    // with a parallel convolution reverb send.
    this.duckGain = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.reverbSend = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.occlusionFilter = ctx.createBiquadFilter();
    this.occlusionFilter.type = 'lowpass';
    this.occlusionFilter.frequency.value = 20000;
    Howler.masterGain.disconnect();
    Howler.masterGain.connect(this.occlusionFilter);
    this.occlusionFilter.connect(this.dryGain);
    this.occlusionFilter.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.duckGain);
    this.dryGain.connect(this.duckGain);
    this.duckGain.connect(ctx.destination);
    this.reverbSend.gain.value = ROOM_REVERB.exterior.wet;
    for (const rt of Object.keys(ROOM_REVERB) as RoomType[]) this.reverbBuffers.set(rt, this.makeImpulse(ROOM_REVERB[rt].decay));
    this.convolver.buffer = this.reverbBuffers.get('exterior') ?? null;
    this.applyVolumes();
    gameStore.subscribe(() => this.applyVolumes());
  }

  private makeImpulse(decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * decay);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.25;
        d[i] = lp * Math.pow(1 - t, 2.2) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  private applyVolumes(): void {
    const s = gameStore.getState().settings;
    Howler.volume(s.masterVolume);
    for (const [id, a] of this.ambience) {
      const isMusic = id === 'tanpura-loop';
      a.howl.volume(a.current * (isMusic ? s.musicVolume : s.sfxVolume), a.id);
    }
  }

  private howl(id: SoundId, loop = false): Howl {
    let h = this.howls.get(id);
    if (!h) {
      h = new Howl({ src: [this.bank.wavUrl(id)], format: ['wav'], loop, preload: true, volume: 1 });
      this.howls.set(id, h);
    }
    return h;
  }

  setListener(provider: () => THREE.Vector3): void {
    this.listenerProvider = provider;
  }

  /** Spatial one-shot. Returns the Howler sound id. */
  play(id: SoundId, opts: { position?: THREE.Vector3; volume?: number; rate?: number; refDistance?: number } = {}): number {
    const h = this.howl(id);
    const s = gameStore.getState().settings;
    const sid = h.play();
    h.volume((opts.volume ?? 1) * s.sfxVolume, sid);
    if (opts.rate) h.rate(opts.rate, sid);
    if (opts.position) {
      h.pannerAttr({ refDistance: opts.refDistance ?? 2.5, rolloffFactor: 1.4, distanceModel: 'inverse', maxDistance: 80, panningModel: 'HRTF' }, sid);
      h.pos(opts.position.x, opts.position.y, opts.position.z, sid);
    }
    return sid;
  }

  stop(id: SoundId, sid?: number): void {
    const h = this.howls.get(id);
    if (h) h.stop(sid);
  }

  /** Looping positional emitter (fire crackle, water). Returns a handle to update position/stop. */
  emitter(id: SoundId, position: THREE.Vector3, volume: number, refDistance = 2): { setPosition(p: THREE.Vector3): void; stop(): void } {
    const h = this.howl(id, true);
    const sid = h.play();
    h.volume(volume * gameStore.getState().settings.sfxVolume, sid);
    h.pannerAttr({ refDistance, rolloffFactor: 1.6, distanceModel: 'inverse', maxDistance: 40, panningModel: 'HRTF' }, sid);
    h.pos(position.x, position.y, position.z, sid);
    return { setPosition: (p) => h.pos(p.x, p.y, p.z, sid), stop: () => h.stop(sid) };
  }

  footstep(surface: SurfaceMaterial, position: THREE.Vector3, intensity: number): void {
    const id = `step-${surface}` as SoundId;
    this.lastStepVariant = (this.lastStepVariant + 1) % 3;
    this.play(id, { position, volume: 0.35 + intensity * 0.45, rate: 0.92 + this.lastStepVariant * 0.06 + (intensity - 0.5) * 0.1 });
  }

  land(hard: boolean, position: THREE.Vector3): void {
    this.play(hard ? 'land-hard' : 'land-soft', { position, volume: hard ? 0.9 : 0.5 });
  }

  /** Ambience for the room type of the zone the player is in; layers crossfade over ~2 s. */
  setZone(zone: ZoneId | 'memory'): void {
    const room = zone === 'memory' ? 'memory' : ZONE_ROOM[zone];
    if (room === this.roomType) return;
    this.roomType = room;
    const wanted = new Map<SoundId, number>();
    for (const l of ROOM_AMBIENCE[room]) wanted.set(l.sound, l.volume);
    for (const [id, a] of this.ambience) a.target = wanted.get(id) ?? 0;
    for (const [id, v] of wanted) {
      if (this.ambience.has(id)) continue;
      const h = this.howl(id, true);
      const sid = h.play();
      h.volume(0, sid);
      this.ambience.set(id, { howl: h, id: sid, target: v, current: 0 });
    }
    // Reverb and occlusion.
    const rv = ROOM_REVERB[room];
    this.convolver.buffer = this.reverbBuffers.get(room) ?? null;
    gsap.to(this.reverbSend.gain, { value: rv.wet, duration: 1.5 });
    const indoors = room === 'hall' || room === 'corridor' || room === 'tunnel' || room === 'cavern';
    gsap.to(this.occlusionFilter.frequency, { value: indoors ? 3200 : 20000, duration: 1.2 });
  }

  /** Duck everything to silence (the tusk break) and release later. */
  duckToSilence(seconds: number): void {
    this.duckTween?.kill();
    this.duckTween = gsap.to(this.duckGain.gain, { value: 0.0001, duration: seconds, ease: 'power2.in' });
  }
  release(seconds: number): void {
    this.duckTween?.kill();
    this.duckTween = gsap.to(this.duckGain.gain, { value: 1, duration: seconds, ease: 'power2.out' });
  }

  update(dt: number): void {
    const s = gameStore.getState().settings;
    for (const [id, a] of this.ambience) {
      const k = 1 - Math.exp(-dt * 0.9);
      a.current += (a.target - a.current) * k;
      const isMusic = id === 'tanpura-loop';
      a.howl.volume(a.current * (isMusic ? s.musicVolume : s.sfxVolume), a.id);
      if (a.target === 0 && a.current < 0.005) {
        a.howl.stop(a.id);
        this.ambience.delete(id);
      }
    }
    if (this.listenerProvider) {
      const p = this.listenerProvider();
      this.engine.camera.getWorldDirection(this.tmpDir);
      Howler.pos(p.x, p.y, p.z);
      Howler.orientation(this.tmpDir.x, this.tmpDir.y, this.tmpDir.z, 0, 1, 0);
      this.tmp.copy(p);
    }
  }

  dispose(): void {
    for (const a of this.ambience.values()) a.howl.stop(a.id);
    this.ambience.clear();
    for (const h of this.howls.values()) h.unload();
    this.howls.clear();
  }
}
