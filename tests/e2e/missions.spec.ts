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
      playerState: (() => Record<string, unknown>) | null;
      missionVoice: (() => Record<string, unknown>) | null;
      heroVariant: (() => string) | null;
      engine: { camera: { rotation: { y: number }; fov: number } };
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

/** Title → your traveller (name + hero) → how-to-play card → Begin. */
const enter = async (page: Page, name = 'Arjun', hero: 'male' | 'female' = 'male'): Promise<void> => {
  await page.click('#boot-continue');
  await page.waitForSelector('.traveller:not([hidden])', { timeout: 10_000 });
  await page.fill('.traveller-name input', name);
  await page.click(`.traveller-hero[data-hero="${hero}"]`);
  await page.click('.traveller-go');
  await page.waitForSelector('.howto:not([hidden])', { timeout: 10_000 });
  await page.click('.howto-begin');
};

test('the traveller card names the hero and picks the female traveller; the name reaches the HUD', async ({ page }) => {
  const problems = await boot(page);
  await enter(page, 'Meera', 'female');
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  expect(await page.locator('.mhud-name').textContent()).toBe('Meera');
  expect(await page.evaluate(() => window.__eka?.heroVariant?.())).toBe('female');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('eka:profile') ?? '{}'))).toMatchObject({ name: 'Meera', hero: 'female' });
  expect(problems).toEqual([]);
});

test('the how-to-play card explains every control before the first task', async ({ page }) => {
  const problems = await boot(page);
  await page.click('#boot-continue');
  await page.waitForSelector('.traveller:not([hidden])', { timeout: 10_000 });
  await page.click('.traveller-go');
  await page.waitForSelector('.howto:not([hidden])', { timeout: 10_000 });
  const text = (await page.locator('.howto').textContent()) ?? '';
  for (const needle of ['W A S D', 'Shift (hold)', 'Run', 'Left mouse', 'Fire the Astra', 'Right mouse (hold)', 'Reload', 'three hearts', 'Left stick', 'FIRE']) expect(text).toContain(needle);
  expect(await mission(page)).toMatchObject({ phase: 'idle' });
  await page.click('.howto-begin');
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  expect(await page.locator('.howto').isHidden()).toBe(true);
  expect(problems).toEqual([]);
});

test('real mouse input looks around and fires the Astra; Shift runs', async ({ page }) => {
  const problems = await boot(page);
  await enter(page);
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  await page.evaluate(() => window.__eka?.missionSkipNarration?.());
  await page.waitForFunction(() => window.__eka?.mission?.()?.phase === 'battle', null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  // Look: the camera follows real mouse movement whether or not the pointer is locked.
  const yaw0 = await page.evaluate(() => window.__eka?.engine.camera.rotation.y ?? 0);
  await page.mouse.move(640, 360);
  for (let i = 1; i <= 20; i++) await page.mouse.move(640 + i * 12, 360);
  await page.waitForTimeout(200);
  const yaw1 = await page.evaluate(() => window.__eka?.engine.camera.rotation.y ?? 0);
  expect(Math.abs(yaw1 - yaw0)).toBeGreaterThan(0.1);
  // Fire: a real left-button hold on the game view spends ammo.
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const ammo = (await page.locator('.mhud-ammo-text').textContent()) ?? '';
  expect(Number(ammo.split('/')[0])).toBeLessThan(12);
  // Aim narrows the field of view; Shift sprints.
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__eka?.engine.camera.fov ?? 58)).toBeLessThan(50);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1200);
  const st = await page.evaluate(() => window.__eka?.playerState?.() ?? {});
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  expect(st.state).toBe('sprint');
  expect(problems).toEqual([]);
});

test('new game opens on the Task 1 card and arms the player after the narration', async ({ page }) => {
  const problems = await boot(page);
  await enter(page);
  await page.waitForFunction(() => window.__eka?.mission?.()?.narrating === true, null, { timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('.narration-text')?.textContent ?? '').startsWith('You are entering into Task 1'), null, { timeout: 15_000 });
  expect(await page.locator('.narration-title').textContent()).toBe('Matsarasura');
  // The narrator's pre-rendered clip for the line loaded and paced the typewriter.
  await page.waitForFunction(() => (window.__eka?.missionVoice?.()?.lineDuration as number) > 3.5, null, { timeout: 10_000 });
  expect(await page.evaluate(() => window.__eka?.missionVoice?.())).toMatchObject({ hasClip: true, ended: false });
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
  await enter(page);
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
