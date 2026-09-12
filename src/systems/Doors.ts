import * as THREE from 'three';
import gsap from 'gsap';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { AudioSystem } from '@/audio/AudioSystem';
import type { WorldStreamer } from '@/world/WorldStreamer';
import { gameStore } from '@/state/store';

const OPEN_LIFT = 4.7;

/**
 * Progression doors are stone slabs that rise into the lintel. State lives in flags (`door:<id>` = true);
 * units rebuild in their saved state, and live openings animate with grind + rumble.
 */
export class DoorSystem implements System {
  readonly name = 'doors';
  private readonly opening = new Set<string>();

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly audio: AudioSystem,
  ) {}

  isOpen(id: string): boolean {
    return gameStore.getState().flags[id] === true;
  }

  /** Opens a door by anchor id; safe to call when the unit is not loaded (flag persists, unit rebuilds open). */
  open(id: string, onDone?: () => void): void {
    if (this.isOpen(id) || this.opening.has(id)) return;
    gameStore.getState().setFlag(id, true);
    const a = this.streamer.anchors.get(id);
    if (!a?.object) {
      onDone?.();
      return;
    }
    this.opening.add(id);
    const slab = a.object;
    const startY = slab.position.y;
    this.audio.play('stone-grind', { position: a.position, volume: 0.9 });
    this.audio.play('rumble', { position: a.position, volume: 0.6 });
    gsap.to(slab.position, {
      y: startY + OPEN_LIFT,
      duration: 3.2,
      ease: 'power1.inOut',
      onUpdate: () => {
        // Slight shudder while the stone moves.
        slab.position.x += (Math.random() - 0.5) * 0.004;
      },
      onComplete: () => {
        this.opening.delete(id);
        this.removeCollider(a.position);
        onDone?.();
      },
    });
  }

  /** The slab's collider was registered as a box at the closed position; drop any static box there. */
  private removeCollider(at: THREE.Vector3): void {
    const world = this.engine.physics.world;
    const shape = new THREE.Vector3(1.6, 1.5, 1.6);
    const toRemove: number[] = [];
    world.forEachCollider((c) => {
      const t = c.translation();
      if (Math.abs(t.x - at.x) < shape.x && Math.abs(t.y - (at.y + 2.3)) < shape.y && Math.abs(t.z - at.z) < shape.z && c.parent()?.isFixed()) toRemove.push(c.handle);
    });
    for (const h of toRemove) {
      const c = world.getCollider(h);
      if (c) this.engine.physics.remove(c);
    }
  }
}
