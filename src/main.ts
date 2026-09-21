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
import { initNativeShell } from '@/platform/native';

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
  const mod = await engine.loadScene(entry);
  setBoot(1, 'Ready');
  engine.start();

  const bootEl = $('boot');
  const cont = $<HTMLButtonElement>('boot-continue');
  const newBtn = $<HTMLButtonElement>('boot-new');
  const dismiss = (mode: 'new' | 'continue'): void => {
    void initNativeShell();
    mod.start?.(mode);
    bootEl.classList.add('hidden');
    bootEl.addEventListener('transitionend', () => bootEl.remove(), { once: true });
    canvas.focus();
    window.removeEventListener('keydown', onKey);
  };
  const canContinue = mod.canContinue?.() === true;
  const onKey = (e: KeyboardEvent): void => {
    if (document.querySelector('.leaderboard:not([hidden])')) return;
    if (e.code === 'Escape' || e.repeat) return;
    dismiss(canContinue ? 'continue' : 'new');
  };
  if (params.has('autostart')) {
    dismiss(params.has('continue') ? 'continue' : 'new');
  } else {
    $('boot-status').hidden = true;
    cont.hidden = false;
    cont.textContent = canContinue ? 'Continue' : 'Enter';
    if (mod.showLeaderboard) {
      const board = $<HTMLButtonElement>('boot-board');
      board.hidden = false;
      board.addEventListener('click', (e) => {
        e.stopPropagation();
        // Lift the UI layer above the title card while the board is open; the title stays until Enter.
        uiRoot.style.zIndex = '60';
        mod.showLeaderboard?.(() => {
          uiRoot.style.zIndex = '';
        });
      });
    }
    cont.addEventListener('click', () => dismiss(canContinue ? 'continue' : 'new'));
    if (canContinue) {
      newBtn.hidden = false;
      newBtn.addEventListener('click', () => dismiss('new'));
    }
    window.addEventListener('keydown', onKey);
  }
}

boot().catch((err: unknown) => {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = `The temple could not wake: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
