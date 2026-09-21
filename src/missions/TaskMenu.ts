import type { Engine } from '@/engine/Engine';

export interface TaskMenuButton {
  label: string;
  detail?: string;
  onSelect(): void;
  primary?: boolean;
}

/** Full-screen choice card: task failed / task select. */
export class TaskMenu {
  private readonly root: HTMLDivElement;
  private visible = false;

  constructor(private readonly engine: Engine) {
    this.root = document.createElement('div');
    this.root.className = 'taskmenu';
    this.root.hidden = true;
    engine.uiRoot.appendChild(this.root);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(title: string, subtitle: string, buttons: TaskMenuButton[], body?: HTMLElement): void {
    this.root.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'taskmenu-inner';
    const h = document.createElement('h1');
    h.className = 'boot-title';
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'taskmenu-sub';
    p.textContent = subtitle;
    inner.append(h, p);
    if (body) inner.appendChild(body);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `boot-continue${b.primary ? '' : ' boot-secondary'} taskmenu-btn`;
      btn.innerHTML = `<span>${b.label}</span>${b.detail ? `<small>${b.detail}</small>` : ''}`;
      btn.addEventListener('click', () => {
        this.hide();
        b.onSelect();
        // The click is a user gesture: capture the mouse for whatever the choice starts.
        if (this.engine.input.device === 'kbm' && this.engine.input.mouse.lockOnClick) this.engine.input.mouse.requestLock();
      });
      inner.appendChild(btn);
    }
    this.root.appendChild(inner);
    this.root.hidden = false;
    this.visible = true;
    this.engine.uiBlocking = true;
    this.engine.input.gameplayBlocked = true;
    this.engine.input.mouse.lockOnClick = false;
    this.engine.input.mouse.unlock();
    this.engine.timeScale = 0;
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.hidden = true;
    this.engine.uiBlocking = false;
    this.engine.input.gameplayBlocked = this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
    this.engine.timeScale = 1;
  }

  dispose(): void {
    this.hide();
    this.root.remove();
  }
}
