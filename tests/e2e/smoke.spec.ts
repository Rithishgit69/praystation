import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __eka?: {
      ready: boolean;
      stats(): { fps: number; frameMs: number; drawCalls: number; triangles: number; spikes25ms: number };
      frameMsEma(): number;
      playerPosition(): { x: number; y: number; z: number } | null;
      key(code: string, down: boolean): void;
      teleport: ((x: number, y: number, z: number) => void) | null;
      interact: (() => string | null) | null;
      flags: (() => Record<string, unknown>) | null;
      setFlag: ((k: string, v: boolean | number | string) => void) | null;
      save: (() => boolean) | null;
      setCamera(yaw: number, pitch: number): void;
      slowSteps: (() => Array<{ key: string; step: number; ms: number; mark: string }>) | null;
    };
  }
}

const boot = async (page: Page, query: string): Promise<string[]> => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(`/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => document.getElementById('boot') === null, null, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  return problems;
};

test('boots the world with no console errors or warnings', async ({ page }) => {
  const problems = await boot(page, 'scene=game&autostart=1');
  expect(problems).toEqual([]);
  const pos = await page.evaluate(() => window.__eka?.playerPosition());
  expect(pos).not.toBeNull();
});

test('traversal holds the frame budget and streams without spikes', async ({ page }) => {
  const problems = await boot(page, 'scene=game&autostart=1&mode=story');
  // Sprint down the forest path for 12 s: cells stream in and out.
  await page.evaluate(() => {
    window.__eka?.key('KeyW', true);
    window.__eka?.key('ShiftLeft', true);
  });
  await page.waitForTimeout(12_000);
  await page.evaluate(() => {
    window.__eka?.key('KeyW', false);
    window.__eka?.key('ShiftLeft', false);
  });
  const pos = await page.evaluate(() => window.__eka?.playerPosition());
  expect(pos && pos.z < 440).toBe(true); // actually moved north
  const stats = await page.evaluate(() => window.__eka?.stats());
  const slow = await page.evaluate(() => window.__eka?.slowSteps?.() ?? []);
  expect(stats?.frameMs ?? 99).toBeLessThan(16.7);
  expect(slow.filter((s) => s.ms > 25)).toEqual([]);
  expect(problems).toEqual([]);
});

test('save and continue restore the exact player transform and flags', async ({ page }) => {
  await boot(page, 'scene=game&autostart=1&start=hall&mode=story');
  await page.evaluate(() => {
    window.__eka?.teleport?.(-12.25, 2.0, -70.5);
    window.__eka?.setFlag?.('beat:hall-enter', true);
    window.__eka?.setFlag?.('door:hall-east', true);
  });
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => window.__eka?.playerPosition());
  expect(await page.evaluate(() => window.__eka?.save?.())).toBe(true);
  await boot(page, 'scene=game&autostart=1&continue=1&mode=story');
  const after = await page.evaluate(() => window.__eka?.playerPosition());
  const flags = await page.evaluate(() => window.__eka?.flags?.());
  expect(after && before && Math.abs(after.x - before.x) < 0.05 && Math.abs(after.z - before.z) < 0.05 && Math.abs(after.y - before.y) < 0.2).toBe(true);
  expect(flags?.['door:hall-east']).toBe(true);
});

test('interaction prompt appears within reach with line of sight only', async ({ page }) => {
  await boot(page, 'scene=game&autostart=1&start=hall&mode=story');
  await page.evaluate(() => window.__eka?.teleport?.(-22.5, 2.0, -86));
  await page.evaluate(() => window.__eka?.setCamera(Math.PI / 2, 0.3));
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__eka?.interact?.())).toBe('lore:inscription-first');
  await page.evaluate(() => window.__eka?.teleport?.(-12, 2.0, -86));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__eka?.interact?.())).toBeNull();
});
