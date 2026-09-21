# Leaderboard

Every finished run (all five tasks) is recorded **on the device** (browser local storage) with the
traveller's name, rank, time, accuracy and hearts lost, and listed under *Leaderboard* on the title
screen, in the pause menu and on the ending card. No account, no personal data.

## Shared board (everyone)

The game can also submit runs to a shared board and show the global top 25. It talks directly to a
**Supabase** project's REST API with the public *anon* key, so a static host (GitHub Pages, Vercel)
is enough. Ten minutes to set up:

1. Create a free project at supabase.com and run this in the SQL editor:

   ```sql
   create table public.scores (
     id bigint generated always as identity primary key,
     created_at timestamptz not null default now(),
     name text not null check (char_length(name) between 1 and 16),
     hero text not null check (hero in ('male', 'female')),
     rank text not null check (rank in ('S', 'A', 'B', 'C')),
     seconds integer not null check (seconds between 30 and 36000),
     hearts_lost integer not null check (hearts_lost between 0 and 99),
     accuracy integer not null check (accuracy between 0 and 100),
     tasks integer not null check (tasks between 1 and 5),
     score integer not null check (score between 0 and 1000000),
     version text
   );
   alter table public.scores enable row level security;
   create policy "anyone can read scores" on public.scores for select using (true);
   create policy "anyone can add a score" on public.scores for insert with check (true);
   ```

2. Put the project URL and anon key into `public/leaderboard.json`:

   ```json
   { "provider": "supabase", "url": "https://YOUR-PROJECT.supabase.co", "anonKey": "YOUR-ANON-KEY" }
   ```

   The anon key is designed to be public; the policies above only allow reading scores and adding new
   ones (no updates or deletes). Rebuild/redeploy and the *Everyone* tab appears.

3. Optional hardening in Supabase: rate limiting on the REST API, and a trigger that rejects rows
   whose `score` does not match the formula in `src/systems/Leaderboard.ts` (`scoreOf`).

## Scoring

`score = rankBase + tasks × 5000 − heartsLost × 1500 + accuracy × 20 + max(0, 60000 − seconds × 10)`
with rankBase S 400 000 · A 300 000 · B 200 000 · C 100 000. The rank itself comes from the run
(hearts lost, accuracy, retries; see `MissionDirector.ts`). Ties break on time.

Runs are submitted once, by the game, at the ending card. Faking scores, automating submissions or
manipulating the board is against the contest rules; the checks above keep obviously invalid rows out.
