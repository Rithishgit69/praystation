import { Howl } from 'howler';
import { gameStore } from '@/state/store';

export interface VoiceHandle {
  /** Resolves with the clip length in seconds once it is loaded, or null if the clip is unavailable. */
  readonly loaded: Promise<number | null>;
  /** True once the clip finished, failed, or was stopped. */
  readonly ended: boolean;
  stop(): void;
}

/**
 * Narrator playback: pre-rendered voice lines (public/voice/<narrator>/<id>.mp3, see
 * tools/gen-voice.mjs) streamed through HTML5 audio so they bypass the room reverb and occlusion the
 * effects go through. One line plays at a time; starting a new one stops the previous.
 */
export class Voice {
  private readonly cache = new Map<string, Howl>();
  private current: { howl: Howl; id: number; handle: { ended: boolean } } | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly base = './voice') {
    this.unsubscribe = gameStore.subscribe(() => {
      const v = gameStore.getState().settings.voiceVolume;
      if (this.current) this.current.howl.volume(v, this.current.id);
    });
  }

  private howlFor(lineId: string): Howl {
    const narrator = gameStore.getState().settings.narrator;
    const key = `${narrator}/${lineId}`;
    let h = this.cache.get(key);
    if (!h) {
      h = new Howl({ src: [`${this.base}/${key}.mp3`], html5: true, preload: true, volume: gameStore.getState().settings.voiceVolume });
      this.cache.set(key, h);
    }
    return h;
  }

  /** Warm the cache for lines that will be needed soon. */
  preload(lineIds: string[]): void {
    for (const id of lineIds) this.howlFor(id);
  }

  get speaking(): boolean {
    return this.current !== null && !this.current.handle.ended;
  }

  speak(lineId: string, onEnd?: () => void): VoiceHandle {
    this.stop();
    const howl = this.howlFor(lineId);
    const state = { ended: false };
    let finish: (() => void) | null = () => {
      finish = null;
      state.ended = true;
      onEnd?.();
    };
    const loaded = new Promise<number | null>((resolve) => {
      const fail = (): void => {
        resolve(null);
        finish?.();
      };
      if (howl.state() === 'loaded') resolve(howl.duration());
      else {
        howl.once('load', () => resolve(howl.duration()));
        howl.once('loaderror', fail);
      }
      howl.once('playerror', fail);
    });
    const id = howl.play();
    howl.volume(gameStore.getState().settings.voiceVolume, id);
    howl.once('end', () => finish?.(), id);
    howl.once('stop', () => finish?.(), id);
    const handle: VoiceHandle = {
      loaded,
      get ended() {
        return state.ended;
      },
      stop: () => {
        if (!state.ended) howl.stop(id);
        finish?.();
      },
    };
    this.current = { howl, id, handle: state };
    return handle;
  }

  stop(): void {
    if (!this.current) return;
    const c = this.current;
    this.current = null;
    if (!c.handle.ended) c.howl.stop(c.id);
  }

  dispose(): void {
    this.stop();
    this.unsubscribe();
    for (const h of this.cache.values()) h.unload();
    this.cache.clear();
  }
}
