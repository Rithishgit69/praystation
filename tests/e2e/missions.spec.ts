import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __eka?: {
      ready: boolean;
      mission: (() => Record<string, unknown>) | null;
      missionSkipNarration: (() => void) | null;
      missionDamageBoss: ((n: number) => void) | null;
      missionHurtPlayer: ((n: number) => void) | null;
      missionMenuChoose: ((i: number) => void) | null;
    };
  }
}

const boot = async (page: Page): Promise<string[]> => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto('/?scene=game', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90_000 });
  await page.waitForTimeout(800);
  return problems;
};

const mission = (page: Page): Promise<Record<string, unknown>> => page.evaluate(() => window.__eka?.mission?.() ?? {});

test('new game opens on the Task 1 card and arms the player after the narration', async ({ page }) => {
  const problems = await boot(page);
  await page.click('#boot-continue');
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('.narration-text')?.textContent ?? '').startsWith('You are entering into Task 1'), null, { timeout: 15_000 });
  expect(await page.locator('.narration-title').textContent()).toBe('Matsarasura');
  await page.evaluate(() => window.__eka?.missionSkipNarration?.());
  await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'battle', null, { timeout: 30_000 });
  const m = await mission(page);
  expect(m.task).toBe(1);
  expect(m.hearts).toBe(3);
  expect(m.bossMax).toBe(220);
  expect(await page.locator('.mhud-boss').isHidden()).toBe(false);
  expect(await page.locator('.mhud-ammo').isHidden()).toBe(false);
  expect(problems).toEqual([]);
});

test('defeating a villain advances to the next task; losing every heart shows the choice menu', async ({ page }) => {
  await boot(page);
  await page.click('#boot-continue');
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__eka?.missionSkipNarration?.());
  await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'battle', null, { timeout: 30_000 });
  await page.evaluate(() => window.__eka?.missionDamageBoss?.(10_000));
  await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'victory', null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__eka?.mission?.()?.task === 2 && window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  expect(await page.locator('.narration-title').textContent()).toBe('Madasura');
  await page.evaluate(() => window.__eka?.missionSkipNarration?.());
  await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'battle', null, { timeout: 30_000 });
  for (let i = 0; i < 3; i++) {
    await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'battle', null, { timeout: 15_000 });
    await page.waitForTimeout(1800); // post-respawn invulnerability
    await page.evaluate(() => window.__eka?.missionHurtPlayer?.(500));
    await page.waitForTimeout(600);
    expect((await mission(page)).hearts).toBe(2 - i);
  }
  const failed = await mission(page);
  expect(failed.phase).toBe('failed');
  expect(failed.hearts).toBe(0);
  const labels = await page.locator('.taskmenu-btn span').allTextContents();
  expect(labels[0]).toContain('Continue Task 2 from the same stage');
  expect(labels[1]).toContain('Play Task 1 again');
  await page.evaluate(() => window.__eka?.missionMenuChoose?.(1));
  await page.waitForFunction(() => window.__eka?.mission?.()?.task === 1 && window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
});
