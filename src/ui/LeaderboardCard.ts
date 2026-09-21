import type { Engine } from '@/engine/Engine';
import type { Leaderboard, RunResult } from '@/systems/Leaderboard';

const fmtTime = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * The leaderboard card: runs recorded on this device and, when a shared board is configured, the
 * global top runs. Opened from the title screen, the pause menu and the ending card.
 */
export class LeaderboardCard {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLElement;
  private readonly tabs: HTMLElement;
  private tab: 'local' | 'global' = 'local';
  private highlight: RunResult | null = null;
  private onClose: (() => void) | null = null;
  private wasBlocked = false;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' || e.code === 'Enter') {
      e.preventDefault();
      this.hide();
    }
  };

  constructor(
    private readonly engine: Engine,
    private readonly board: Leaderboard,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'leaderboard';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="leaderboard-inner">
        <h1 class="boot-title">Leaderboard</h1>
        <div class="leaderboard-tabs"><button type="button" data-tab="local" class="active">This device</button><button type="button" data-tab="global">Everyone</button></div>
        <div class="leaderboard-body"></div>
        <p class="leaderboard-note">Rank first, then hearts kept, accuracy and time. Only the traveller's name is recorded.</p>
        <button class="boot-continue leaderboard-close">Back</button>
      </div>`;
    engine.uiRoot.appendChild(this.root);
    this.body = this.root.querySelector('.leaderboard-body') as HTMLElement;
    this.tabs = this.root.querySelector('.leaderboard-tabs') as HTMLElement;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => void this.setTab(b.dataset.tab as 'local' | 'global'));
    (this.root.querySelector('.leaderboard-close') as HTMLButtonElement).addEventListener('click', () => this.hide());
  }

  get isVisible(): boolean {
    return !this.root.hidden;
  }

  async show(highlight: RunResult | null = null, onClose?: () => void): Promise<void> {
    this.highlight = highlight;
    this.onClose = onClose ?? null;
    this.root.hidden = false;
    this.wasBlocked = this.engine.input.gameplayBlocked;
    this.engine.uiBlocking = true;
    this.engine.input.gameplayBlocked = true;
    this.engine.input.mouse.lockOnClick = false;
    this.engine.input.mouse.unlock();
    window.addEventListener('keydown', this.onKey);
    await this.board.ready();
    (this.tabs.querySelector('[data-tab="global"]') as HTMLElement).hidden = !this.board.hasRemote;
    await this.setTab(this.board.hasRemote && highlight ? 'global' : 'local');
  }

  private async setTab(tab: 'local' | 'global'): Promise<void> {
    this.tab = tab;
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('active', b.dataset.tab === tab);
    if (tab === 'local') this.render(this.board.local(), 'No runs on this device yet — finish the five tasks to be listed.');
    else {
      this.body.innerHTML = '<p class="leaderboard-empty">Fetching…</p>';
      const rows = await this.board.fetchRemote(25);
      if (this.tab !== 'global') return;
      if (!rows) this.render([], 'The shared board could not be reached.');
      else this.render(rows, 'No runs recorded yet — be the first.');
    }
  }

  private render(rows: RunResult[], empty: string): void {
    if (rows.length === 0) {
      this.body.innerHTML = `<p class="leaderboard-empty">${empty}</p>`;
      return;
    }
    const table = document.createElement('table');
    table.className = 'results leaderboard-table';
    table.innerHTML = '<thead><tr><th>#</th><th>Traveller</th><th>Rank</th><th>Time</th><th>Accuracy</th><th>Hearts lost</th><th>When</th></tr></thead>';
    const tbody = document.createElement('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      const mine = this.highlight && r.name === this.highlight.name && r.score === this.highlight.score && Math.round(r.seconds) === Math.round(this.highlight.seconds);
      if (mine) tr.className = 'mine';
      tr.innerHTML = `<td>${i + 1}</td><td>${r.name.replace(/[<>&]/g, '')}</td><td><strong class="results-rank">${r.rank}</strong></td><td>${fmtTime(r.seconds)}</td><td>${Math.round(r.accuracy)} %</td><td>${r.heartsLost}</td><td>${fmtDate(r.date)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    this.body.innerHTML = '';
    this.body.appendChild(table);
  }

  hide(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
    this.engine.uiBlocking = false;
    this.engine.input.gameplayBlocked = this.wasBlocked || this.engine.devMenu.isVisible;
    this.engine.input.mouse.lockOnClick = true;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  dispose(): void {
    this.hide();
    this.root.remove();
  }
}
