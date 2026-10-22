// Captures every screen in demo mode at 1920x1080 into ./screenshots for design reviews.
// Usage: pnpm --filter @accomplice/tv-web screenshot  [--only=lobby,reveal]  [--reduced]  [--720]
// Also checks every shot for cut-off text (ellipsis, overflow, clamped lines) and fails if it finds any.
import { mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots', process.argv.includes('--720') ? '720p' : '');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const reduced = process.argv.includes('--reduced');
const small = process.argv.includes('--720');
const VIEW = small ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };

// Fails the run if any visible text is cut off: horizontal overflow, ellipsis, clamped lines, or a clue card that spills.
function findTruncation() {
  const bad = [];
  const describe = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent || '').trim().slice(0, 40)}"`;
  for (const el of document.querySelectorAll('.stage *')) {
    if (!(el instanceof HTMLElement) || el.closest('.sr-only, .typed-ghost')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.getClientRects().length === 0) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText) continue;
    if (cs.textOverflow === 'ellipsis') bad.push(`ellipsis: ${describe(el)}`);
    else if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') bad.push(`cut off: ${describe(el)}`);
    const clamp = cs.webkitLineClamp;
    if (clamp && clamp !== 'none' && el.scrollHeight > el.clientHeight + 1) bad.push(`clamped: ${describe(el)}`);
  }
  for (const el of document.querySelectorAll('.clue-inner')) {
    if (el.scrollHeight > el.clientHeight + 2) bad.push(`card spills: ${(el.textContent || '').trim().slice(0, 40)}`);
  }
  return bad;
}

const SHOTS = [
  { name: '01-title', scene: 'title', wait: 3200 },
  { name: '02-lobby', scene: 'lobby', wait: 2600 },
  { name: '03-lobby-waiting', scene: 'lobby-empty', wait: 2200 },
  { name: '04-briefing-cold-open', scene: 'briefing', step: 'title', wait: 3000 },
  { name: '05-briefing-victim', scene: 'briefing', step: 'victim', wait: 2400 },
  { name: '06-briefing-house', scene: 'briefing', step: 'house', wait: 3800 },
  { name: '07-briefing-suspects', scene: 'briefing', step: 'suspects', wait: 2200 },
  { name: '08-briefing-lineup', scene: 'briefing', step: 'ready', wait: 2400 },
  { name: '09-practice-round', scene: 'tutorial', step: 'speaking', wait: 2600 },
  { name: '10-investigate-board', scene: 'investigate', wait: 2200 },
  { name: '10b-long-clue-text', scene: 'long', wait: 2400 },
  { name: '11-clue-detail', scene: 'investigate', wait: 1500, keys: ['ArrowRight'], after: 700 },
  { name: '12-interrogation', scene: 'speaking', wait: 3400 },
  { name: '13-question-asked', scene: 'asking', wait: 1800 },
  { name: '14-objection', scene: 'objection', wait: 1700 },
  { name: '15-red-string', scene: 'link', wait: 2000 },
  { name: '16-prove-it', scene: 'prove', wait: 1500 },
  { name: '17-verdict-possible', scene: 'verdict', wait: 2200 },
  { name: '18-verdict-proven', scene: 'verdict-proven', wait: 2200 },
  { name: '19-verdict-ruled-out', scene: 'verdict-out', wait: 2200 },
  { name: '20-theory-vote', scene: 'proposal', wait: 1600 },
  { name: '21-lights-out', scene: 'blackout', wait: 1800 },
  { name: '22-emergency-vote', scene: 'emergency', wait: 4500 },
  { name: '23-smudged-and-hunch', scene: 'hunch', wait: 2600 },
  { name: '24-clock-chime', scene: 'chime', wait: 2600 },
  { name: '25-accuse', scene: 'accuse', wait: 2400 },
  { name: '26-reveal-proof-chain', scene: 'reveal', step: 'step-3', wait: 3800 },
  { name: '27-reveal-sabotage', scene: 'reveal', step: 'sabotage', wait: 2400 },
  { name: '28-reveal-culprit', scene: 'reveal', step: 'culprit', wait: 4600 },
  { name: '29-reveal-confession', scene: 'reveal', step: 'confession', wait: 2600 },
  { name: '30-reveal-accomplice', scene: 'reveal', step: 'accomplice', wait: 5600 },
  { name: '31-front-page', scene: 'reveal', step: 'newspaper', wait: 2800 },
  { name: '32-awards', scene: 'results', step: 'awards', wait: 2600 },
  { name: '33-ledger', scene: 'results', step: 'ledger', wait: 3200 },
  { name: '33a-everyone-asked', scene: 'all-asked', wait: 2000 },
  { name: '33b-round-cta', scene: 'investigate', wait: 1200, keys: ['Escape', 'ArrowDown', 'Enter'], after: 800 },
  { name: '34-pause-menu', scene: 'investigate', wait: 1200, keys: ['Escape'], after: 700 },
  { name: '35-settings', scene: 'investigate', wait: 1200, keys: ['Escape', 'ArrowDown', 'ArrowDown', 'Enter'], after: 800 },
  { name: '36-suspect-file', scene: 'investigate', wait: 1200, keys: ['ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter'], after: 900 },
];

await mkdir(outDir, { recursive: true });
if (!only) for (const f of await readdir(outDir)) if (f.endsWith('.png')) await rm(path.join(outDir, f));
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
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
  const cut = await page.evaluate(findTruncation);
  if (cut.length) { failed += cut.length; console.error(`  [${s.name}] truncated text:\n    ${[...new Set(cut)].join('\n    ')}`); }
  const file = path.join(outDir, `${s.name}${reduced ? '-reduced' : ''}.png`);
  await page.screenshot({ path: file });
  console.log('  saved', path.relative(process.cwd(), file));
  await page.close();
}
await browser.close();
await server.close();
if (failed) { console.error(`${failed} problem(s): page errors or truncated text`); process.exit(1); }
