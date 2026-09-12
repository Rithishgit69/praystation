import type { SceneModule } from '@/engine/types';

export interface SceneEntry {
  id: string;
  title: string;
  group: 'game' | 'traversal' | 'world' | 'systems' | 'encounters';
  load: () => Promise<SceneModule>;
}

/** Every system gets a dedicated debug/test scene here; the dev menu lists them and `?scene=` loads them. */
export const SCENES: readonly SceneEntry[] = [
  { id: 'courtyard', title: 'Reference frame: temple courtyard', group: 'world', load: async () => new (await import('./CourtyardScene')).CourtyardScene() },
  { id: 'greybox', title: 'Grey-box traversal (camera + controller)', group: 'traversal', load: async () => new (await import('./GreyBoxScene')).GreyBoxScene() },
];

export const findScene = (id: string): SceneEntry | undefined => SCENES.find((s) => s.id === id);
