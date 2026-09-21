/**
 * Leaderboard: every finished run is kept on this device; when `public/leaderboard.json` names a
 * backend (Supabase's REST API with an anon key — see docs/LEADERBOARD.md) the run is also submitted
 * to a shared board and the top runs are fetched from it. No accounts, no personal data beyond the
 * name the player typed for their traveller.
 */
export interface RunResult {
  name: string;
  hero: 'male' | 'female';
  rank: 'S' | 'A' | 'B' | 'C';
  /** Battle time over the whole run (s). */
  seconds: number;
  heartsLost: number;
  /** 0–100. */
  accuracy: number;
  /** Tasks completed (5 for a full run). */
  tasks: number;
  /** ISO date. */
  date: string;
  score: number;
}

interface RemoteConfig {
  provider: 'supabase';
  url: string;
  anonKey: string;
  table?: string;
}

const LOCAL_KEY = 'eka:leaderboard';
const LOCAL_MAX = 50;
const RANK_BASE: Record<RunResult['rank'], number> = { S: 400000, A: 300000, B: 200000, C: 100000 };

/** One number to sort by: rank first, then fewer hearts lost, better accuracy and a faster time. */
export const scoreOf = (r: Omit<RunResult, 'score' | 'date'>): number =>
  RANK_BASE[r.rank] + r.tasks * 5000 - r.heartsLost * 1500 + Math.round(r.accuracy) * 20 + Math.max(0, 60000 - Math.round(r.seconds) * 10);

export class Leaderboard {
  private remote: RemoteConfig | null = null;
  private remoteLoaded: Promise<void>;

  constructor() {
    type Cfg = Partial<Omit<RemoteConfig, 'provider'>> & { provider?: string };
    this.remoteLoaded = fetch('./leaderboard.json')
      .then((r): Promise<Cfg> => (r.ok ? (r.json() as Promise<Cfg>) : Promise.resolve({})))
      .then((cfg) => {
        if (cfg.provider === 'supabase' && typeof cfg.url === 'string' && typeof cfg.anonKey === 'string' && cfg.url && cfg.anonKey) this.remote = { provider: 'supabase', url: cfg.url.replace(/\/$/, ''), anonKey: cfg.anonKey, ...(cfg.table ? { table: cfg.table } : {}) };
      })
      .catch(() => undefined);
  }

  get hasRemote(): boolean {
    return this.remote !== null;
  }

  /** Wait for the config file (resolves immediately after the first load). */
  ready(): Promise<void> {
    return this.remoteLoaded;
  }

  local(): RunResult[] {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const list = raw ? (JSON.parse(raw) as RunResult[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  /** Store a run on this device; returns its 1-based position. */
  recordLocal(run: RunResult): number {
    const list = this.local();
    list.push(run);
    list.sort((a, b) => b.score - a.score || a.seconds - b.seconds);
    const position = list.indexOf(run) + 1;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, LOCAL_MAX)));
    } catch {
      /* storage unavailable */
    }
    return position;
  }

  private headers(): Record<string, string> {
    const r = this.remote as RemoteConfig;
    return { apikey: r.anonKey, Authorization: `Bearer ${r.anonKey}`, 'Content-Type': 'application/json' };
  }

  /** Submit to the shared board; resolves with the run's global position, or null when unavailable. */
  async submitRemote(run: RunResult): Promise<number | null> {
    await this.remoteLoaded;
    const r = this.remote;
    if (!r) return null;
    try {
      const res = await fetch(`${r.url}/rest/v1/${r.table ?? 'scores'}`, {
        method: 'POST',
        headers: { ...this.headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ name: run.name, hero: run.hero, rank: run.rank, seconds: Math.round(run.seconds), hearts_lost: run.heartsLost, accuracy: Math.round(run.accuracy), tasks: run.tasks, score: run.score, version: '1.4.0' }),
      });
      if (!res.ok) return null;
      const above = await fetch(`${r.url}/rest/v1/${r.table ?? 'scores'}?select=id&score=gt.${run.score}`, { headers: { ...this.headers(), Prefer: 'count=exact', Range: '0-0' } });
      const range = above.headers.get('content-range');
      const total = range ? Number(range.split('/')[1]) : NaN;
      return Number.isFinite(total) ? total + 1 : null;
    } catch {
      return null;
    }
  }

  /** Top runs from the shared board (newest first among equal scores). */
  async fetchRemote(limit = 25): Promise<RunResult[] | null> {
    await this.remoteLoaded;
    const r = this.remote;
    if (!r) return null;
    try {
      const res = await fetch(`${r.url}/rest/v1/${r.table ?? 'scores'}?select=name,hero,rank,seconds,hearts_lost,accuracy,tasks,score,created_at&order=score.desc,seconds.asc&limit=${limit}`, { headers: this.headers() });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      return rows.map((x) => ({
        name: String(x.name ?? '?').slice(0, 16),
        hero: x.hero === 'female' ? 'female' : 'male',
        rank: (['S', 'A', 'B', 'C'].includes(String(x.rank)) ? String(x.rank) : 'C') as RunResult['rank'],
        seconds: Number(x.seconds ?? 0),
        heartsLost: Number(x.hearts_lost ?? 0),
        accuracy: Number(x.accuracy ?? 0),
        tasks: Number(x.tasks ?? 0),
        score: Number(x.score ?? 0),
        date: String(x.created_at ?? ''),
      }));
    } catch {
      return null;
    }
  }
}
