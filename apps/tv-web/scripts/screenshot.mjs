// Captures every screen in demo mode at 1920x1080 into ./screenshots for design reviews.
// Usage: pnpm --filter @accomplice/tv-web screenshot  [--only=lobby,reveal]  [--reduced]
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const reduced = process.argv.includes('--reduced');

const SHOTS = [
  { name: '01-title', scene: 'title', wait: 3200 },
  { name: '02-lobby', scene: 'lobby', wait: 2600 },
  { name: '03-briefing-title', scene: 'briefing', step: 'title', wait: 3600 },
  { name: '04-briefing-victim', scene: 'briefing', step: 'victim', wait: 2800 },
  { name: '05-briefing-floorplan', scene: 'briefing', step: 'plan', wait: 4200 },
  { name: '06-briefing-suspect', scene: 'briefing', step: 'suspect-2', wait: 2400 },
  { name: '07-briefing-lineup', scene: 'briefing', step: 'ready', wait: 2600 },
  { name: '08-investigate-board', scene: 'investigate', wait: 2200 },
  { name: '09-investigate-speaking', scene: 'speaking', wait: 3600 },
  { name: '10-investigate-red-string', scene: 'link', wait: 2000 },
  { name: '11-prove-it', scene: 'prove', wait: 1500 },
  { name: '12-verdict-stamp', scene: 'verdict', wait: 2200 },
  { name: '13-accuse', scene: 'accuse', wait: 2400 },
  { name: '14-reveal-proof-chain', scene: 'reveal', step: 'step-3', wait: 4200 },
  { name: '15-reveal-culprit', scene: 'reveal', step: 'culprit', wait: 4200 },
  { name: '16-reveal-accomplice', scene: 'reveal', step: 'accomplice', wait: 3800 },
  { name: '17-results', scene: 'results', wait: 3200 },
  { name: '18-leave-confirm', scene: 'investigate', wait: 1200, keys: ['Escape'], after: 800 },
  { name: '19-suspect-file', scene: 'investigate', wait: 1200, keys: ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter'], after: 900 },
];

await mkdir(outDir, { recursive: true });
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
let failed = 0;
for (const s of SHOTS) {
  if (only && !only.some((o) => s.name.includes(o))) continue;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error(`  [${s.name}] page error:`, e.message); failed++; });
  const q = new URLSearchParams({ demo: '1', scene: s.scene, still: '1', mute: '1' });
  if (s.step) q.set('step', s.step);
  await page.goto(`${base}?${q}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(s.wait);
  for (const k of s.keys ?? []) { await page.keyboard.press(k); await page.waitForTimeout(250); }
  if (s.after) await page.waitForTimeout(s.after);
  const file = path.join(outDir, `${s.name}${reduced ? '-reduced' : ''}.png`);
  await page.screenshot({ path: file });
  console.log('  saved', path.relative(process.cwd(), file));
  await page.close();
}
await browser.close();
await server.close();
if (failed) { console.error(`${failed} page error(s)`); process.exit(1); }
