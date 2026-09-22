// Boot timeline: when each loading step lands, with optional CPU throttling to approximate a phone.
//   usage: node tools/boot-profile.mjs [baseUrl] [cpuThrottle=4]
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const throttle = Number(process.argv[3] ?? '4');
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.addInitScript(() => {
  window.__bootLog = [];
  const t0 = performance.now();
  const obs = new MutationObserver(() => {
    const el = document.getElementById('boot-status');
    if (el) window.__bootLog.push([Math.round(performance.now() - t0), el.textContent]);
  });
  document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { subtree: true, childList: true, characterData: true }));
  performance.mark('boot-start');
});
const t0 = Date.now();
await page.goto(`${base}/?scene=game`, { waitUntil: 'load' });
const loadAt = Date.now() - t0;
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 240000 });
const readyAt = Date.now() - t0;
const log = await page.evaluate(() => window.__bootLog);
const seen = new Set();
console.log(`cpu ×${throttle}: page load ${loadAt} ms · ready ${readyAt} ms`);
for (const [t, label] of log) { if (!seen.has(label)) { seen.add(label); console.log(`  ${String(t).padStart(6)} ms  ${label}`); } }
const marks = await page.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('eka:')).map((m) => `${m.name.slice(4)}@${Math.round(m.startTime)}`));
console.log('  (mobile flag)', await page.evaluate(() => window.__eka?.engine?.mobile));
console.log('  marks:', marks.join(' '));
const res = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.transferSize > 50000).map((r) => `${(r.transferSize / 1024).toFixed(0)} KB ${r.name.split('/').slice(-1)[0]} (${Math.round(r.duration)} ms)`));
console.log('  big resources:', res.join(' | '));
await browser.close();
