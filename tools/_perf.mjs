// Frame-time probe at a chosen device pixel ratio and quality, in a Task 2 battle (fire hazards).
import { chromium } from '@playwright/test';
const [dpr = '2', quality = 'high', task = '2'] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(dpr) });
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(`http://127.0.0.1:4173/?scene=game&help=0&task=${task}&quality=${quality}&profiler=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__eka?.ready === true, null, { timeout: 120000 });
await page.click('#boot-continue');
await page.waitForFunction(() => window.__eka.mission().narrating === true, null, { timeout: 30000 });
await ev(() => window.__eka.missionSkipNarration());
await page.waitForFunction(() => window.__eka.mission().phase === 'battle', null, { timeout: 30000 });
await wait(1500);
const samples = [];
await page.mouse.move(720, 450); await page.mouse.down();
for (let i = 0; i < 12; i++) {
  await wait(1000);
  const s = await ev(() => { const st = window.__eka.stats(); return { fps: st.fps, ms: st.frameMs, max: st.frameMsMax, draw: st.drawCalls, tris: st.triangles, prog: st.programs, scale: st.renderScale, spikes: st.spikes25ms }; });
  samples.push(s);
}
await page.mouse.up();
const avg = (k) => (samples.reduce((a, s) => a + s[k], 0) / samples.length).toFixed(1);
console.log(`dpr ${dpr} quality ${quality} task ${task}: fps ${avg('fps')} frame ${avg('ms')} ms (max ${Math.max(...samples.map((s) => s.max)).toFixed(1)}) draws ${avg('draw')} tris ${avg('tris')} programs ${samples.at(-1).prog} scale ${samples.at(-1).scale} spikes ${samples.at(-1).spikes}`);
await browser.close();
