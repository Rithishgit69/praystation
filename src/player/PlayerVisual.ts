import type { Engine } from '@/engine/Engine';
import type { System } from '@/engine/types';
import { CharacterMesh } from './CharacterMesh';
import type { PlayerController } from './PlayerController';

/** Binds the physics controller to the animated character mesh. */
export class PlayerVisual implements System {
  readonly name = 'player-visual';
  readonly mesh: CharacterMesh;
  constructor(
    private readonly engine: Engine,
    private readonly controller: PlayerController,
  ) {
    this.mesh = new CharacterMesh();
    engine.scene.add(this.mesh.root);
  }
  update(dt: number, elapsed: number): void {
    const c = this.controller;
    this.mesh.root.position.copy(c.renderPosition);
    this.mesh.root.rotation.y = c.facingYaw;
    this.mesh.animate(dt, c.state, c.horizontalSpeed, c.tuning.sprintSpeed, elapsed);
  }
  dispose(): void {
    this.engine.scene.remove(this.mesh.root);
    this.mesh.dispose();
  }
}
