import * as THREE from 'three';
import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import type { PlayerController } from '@/player/PlayerController';
import type { HUD } from '@/ui/HUD';
import type { WorldStreamer } from '@/world/WorldStreamer';
import type { Anchor } from '@/world/WorldTypes';

export interface InteractionHandler {
  /** Prompt verb, e.g. "Touch the mural". Return null to hide the prompt for this anchor. */
  label(anchor: Anchor): string | null;
  onInteract(anchor: Anchor): void;
}

const REACH = 2.2;

/**
 * Contextual interaction: the nearest handled anchor inside a 2.2 m reach with line-of-sight gets the
 * prompt; `interact` dispatches to the handler registered for its id or kind. Triggers fire on entry.
 */
export class InteractionSystem implements System {
  readonly name = 'interaction';
  private readonly byId = new Map<string, InteractionHandler>();
  private readonly byKind = new Map<string, InteractionHandler>();
  private readonly triggers = new Map<string, (anchor: Anchor) => void>();
  private readonly inside = new Set<string>();
  private current: Anchor | null = null;
  private readonly eye = new THREE.Vector3();
  private readonly toAnchor = new THREE.Vector3();
  /** Suppresses prompts (cinematics, memory sequences). */
  suppressed = false;

  constructor(
    private readonly engine: Engine,
    private readonly streamer: WorldStreamer,
    private readonly player: PlayerController,
    private readonly hud: HUD,
  ) {}

  register(id: string, handler: InteractionHandler): void {
    this.byId.set(id, handler);
  }
  registerKind(kind: Anchor['kind'], handler: InteractionHandler): void {
    this.byKind.set(kind, handler);
  }
  /** Volume trigger by anchor id (fires once per entry). */
  onTrigger(id: string, fn: (anchor: Anchor) => void): void {
    this.triggers.set(id, fn);
  }
  get focused(): Anchor | null {
    return this.current;
  }

  private handlerFor(a: Anchor): InteractionHandler | undefined {
    return this.byId.get(a.id) ?? this.byKind.get(a.kind);
  }

  private hasLineOfSight(a: Anchor): boolean {
    this.eye.copy(this.player.position);
    this.eye.y += 1.4;
    this.toAnchor.copy(a.position).sub(this.eye);
    const dist = this.toAnchor.length();
    if (dist < 0.3) return true;
    this.toAnchor.divideScalar(dist);
    const hit = this.engine.physics.raycast(this.eye, this.toAnchor, dist - 0.35, this.player.collider);
    return hit === null;
  }

  update(): void {
    const p = this.player.position;
    let best: Anchor | null = null;
    let bestD = Infinity;
    for (const a of this.streamer.anchors.values()) {
      const dx = a.position.x - p.x;
      const dz = a.position.z - p.z;
      const dy = a.position.y - (p.y + 0.9);
      const d = Math.hypot(dx, dz);
      if (a.kind === 'trigger') {
        const within = d < a.radius && Math.abs(dy) < 6;
        const was = this.inside.has(a.id);
        if (within && !was) {
          this.inside.add(a.id);
          this.triggers.get(a.id)?.(a);
        } else if (!within && was) this.inside.delete(a.id);
        continue;
      }
      if (this.suppressed) continue;
      const reach = Math.max(REACH, a.radius);
      if (d > reach || Math.abs(dy) > 2.6) continue;
      const h = this.handlerFor(a);
      if (!h || h.label(a) === null) continue;
      if (d < bestD && this.hasLineOfSight(a)) {
        best = a;
        bestD = d;
      }
    }
    if (best !== this.current) {
      this.current = best;
      const h = best ? this.handlerFor(best) : undefined;
      this.hud.setPrompt(best && h ? h.label(best) : null);
    } else if (best) {
      const h = this.handlerFor(best);
      if (h) this.hud.setPrompt(h.label(best));
    }
    if (best && !this.suppressed && this.engine.input.pressed('interact')) {
      this.handlerFor(best)?.onInteract(best);
    }
  }

  dispose(): void {
    this.hud.setPrompt(null);
  }
}
