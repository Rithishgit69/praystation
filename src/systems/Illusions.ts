import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { PlayerController } from '@/player/PlayerController';
import type { WorldStreamer } from '@/world/WorldStreamer';
import { gameStore } from '@/state/store';
import type { Subtitles } from '@/ui/Subtitles';
import { Perlin } from '@/util/noise';

const EXPOSE_RADIUS = 5.5;

/**
 * Chapter II illusions: false copies of objects (anchors flagged real:false) turn translucent and waver
 * when the traveller's lit lantern comes near — light exposes what envies the real. Once every false
 * object in the passage has been exposed, the true altar can be touched.
 */
export class IllusionSystem implements System {
  readonly name = 'illusions';
  private readonly noise = new Perlin(23);
  private readonly prepared = new Set<THREE.Object3D>();
  private readonly base = new Map<THREE.Object3D, THREE.Vector3>();

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly player: PlayerController,
    private readonly audio: AudioSystem,
    private readonly subtitles: Subtitles,
  ) {}

  private prepare(o: THREE.Object3D): void {
    if (this.prepared.has(o)) return;
    this.prepared.add(o);
    this.base.set(o, o.position.clone());
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.depthWrite = true;
    });
  }

  update(dt: number, elapsed: number): void {
    const s = gameStore.getState();
    const lantern = s.flags['lantern:lit'] !== false;
    const p = this.player.position;
    let total = 0;
    let exposed = 0;
    for (const a of this.streamer.anchors.values()) {
      if (a.data?.real !== false || !a.object) continue;
      total++;
      this.prepare(a.object);
      const d = Math.hypot(a.position.x - p.x, a.position.z - p.z);
      const near = lantern ? THREE.MathUtils.clamp((EXPOSE_RADIUS - d) / 3, 0, 1) : 0;
      const target = 1 - near * 0.92;
      const flag = `illusion-exposed:${a.id}`;
      const was = s.flags[flag] === true;
      if (!was && near > 0.6) {
        s.setFlag(flag, true);
        this.audio.play('shimmer', { position: a.position, volume: 0.6, rate: 0.75 });
      }
      if (s.flags[flag] === true) exposed++;
      const base = this.base.get(a.object);
      if (base) {
        const w = (1 - target) * 0.08;
        a.object.position.set(base.x + this.noise.noise2(elapsed * 3, a.position.x) * w, base.y + this.noise.noise2(elapsed * 2.2, a.position.z) * w * 0.5, base.z + this.noise.noise2(elapsed * 2.7, 7) * w);
      }
      a.object.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.opacity += (target - mat.opacity) * (1 - Math.exp(-dt * 5));
      });
    }
    if (total > 0 && exposed === total && s.flags['puzzle:passage-illusion'] !== true) {
      s.setFlag('puzzle:passage-illusion', true);
      this.audio.play('symbol-chime', { volume: 0.8 });
      this.subtitles.say('ch2-light');
    }
    void this.engine;
  }
}
