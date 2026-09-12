import './styles.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/noto-serif-devanagari/500.css';
import { Engine } from '@/engine/Engine';
import { findScene, SCENES } from '@/scenes/registry';
import { installDebugApi } from '@/debug/DebugApi';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const setBoot = (pct: number, status: string): void => {
  $('boot-bar').style.width = `${Math.round(pct * 100)}%`;
  $('boot-status').textContent = status;
};

async function boot(): Promise<void> {
  const canvas = $<HTMLCanvasElement>('game');
  const uiRoot = $('ui');
  setBoot(0.05, 'Waking the temple…');
  const engine = await Engine.create(canvas, uiRoot);
  installDebugApi(engine);
  setBoot(0.25, 'Laying the stones…');
  const params = new URLSearchParams(location.search);
  const sceneId = params.get('scene') ?? 'game';
  const entry = findScene(sceneId) ?? SCENES[0];
  if (!entry) throw new Error('No scenes registered');
  await engine.loadScene(entry);
  setBoot(1, 'Ready');
  engine.start();

  const bootEl = $('boot');
  const cont = $<HTMLButtonElement>('boot-continue');
  const dismiss = (): void => {
    bootEl.classList.add('hidden');
    bootEl.addEventListener('transitionend', () => bootEl.remove(), { once: true });
    canvas.focus();
    window.removeEventListener('keydown', dismiss);
  };
  if (params.has('autostart')) {
    dismiss();
  } else {
    cont.hidden = false;
    $('boot-status').hidden = true;
    cont.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
  }
}

boot().catch((err: unknown) => {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = `The temple could not wake: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
