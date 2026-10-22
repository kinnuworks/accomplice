// Captures every phone screen in demo mode at iPhone 15 size and runs axe-core on each.
// Usage: pnpm --filter @accomplice/phone screenshot
// Writes PNGs to apps/phone/screenshots/ and prints accessibility violations.
// Exits non-zero if axe finds violations or a screen scrolls sideways.

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'screenshots');
await mkdir(outDir, { recursive: true });

const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port ?? 5199;
const base = `http://localhost:${server.httpServer.address().port ?? port}/p/`;

const shots = [
  ['01-join', 'at=join&room=MOTH'],
  ['02-lobby-host', 'at=lobby'],
  ['03-role-sealed', 'at=role'],
  ['04-role-detective', 'at=role-peek'],
  ['05-role-accomplice', 'at=role-peek&as=accomplice'],
  ['06-investigate', 'at=investigate'],
  ['07-listening', 'at=listening'],
  ['08-review-transcript', 'at=review'],
  ['09-typed-fallback', 'at=typed'],
  ['10-my-clues', 'at=clues'],
  ['11-earbud-check', 'at=earbud'],
  ['12-board', 'at=board'],
  ['13-test-a-theory', 'at=theory'],
  ['14-vote-on-theory', 'at=vote', { wait: 900 }],
  ['15-notes', 'at=notes'],
  ['25-tutorial', 'at=tutorial'],
  ['26-blackout-vote', 'at=emergency'],
  ['27-free-question', 'at=free-question'],
  ['28-smudge-a-clue', 'at=sabotage&as=accomplice'],
  ['29-hunch', 'at=hunch'],
  ['30-audience', 'at=audience'],
  ['31-heartbeat', 'at=heartbeat&as=accomplice', { wait: 900 }],
  ['16-accuse', 'at=accuse'],
  ['17-accuse-confirm', 'at=accuse-confirm'],
  ['18-accuse-locked', 'at=accuse-locked'],
  ['19-reveal', 'at=reveal'],
  ['20-results', 'at=results'],
  ['21-results-accomplice', 'at=results&as=accomplice'],
  ['22-investigate-text-200', 'at=review', { zoom: true }],
  ['23-accuse-text-200', 'at=accuse', { zoom: true }],
  ['24-board-text-200', 'at=board', { zoom: true }],
];

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Playwright's own browser is not downloaded. Fall back to installed Chrome.
    try {
      return await chromium.launch({ channel: 'chrome' });
    } catch {
      console.error('No browser found. Run: pnpm --filter @accomplice/phone exec playwright install chromium');
      process.exit(2);
    }
  }
}
const browser = await launch();
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  reducedMotion: 'reduce',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});

let totalViolations = 0;
let overflowProblems = 0;
const summary = [];

for (const [name, query, opts = {}] of shots) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?demo=1&${query}`);
  if (opts.zoom) {
    // Simulates 200% text size: every rem doubles.
    await page.addStyleTag({ content: 'html{font-size:200% !important}' });
  }
  await page.waitForSelector('h1');
  await page.waitForTimeout(opts.wait ?? 700);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) overflowProblems++;

  // Screens with the talk dock: show what the thumb sees, scrolled to the dock.
  // Everything else: the whole page.
  const dialogOpen = (await page.locator('dialog[open]').count()) > 0;
  const hasDock = ((await page.locator('.dock:visible').count()) > 0 && !opts.zoom) || dialogOpen;
  if (dialogOpen) await page.evaluate(() => window.scrollTo(0, 0));
  else if (hasDock) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: !hasDock });

  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  totalViolations += result.violations.length;
  summary.push({ screen: name, violations: result.violations.length, incomplete: result.incomplete.length, overflowPx: Math.max(0, overflow) });

  if (result.violations.length) {
    console.log(`\n${name}: ${result.violations.length} violation(s)`);
    for (const v of result.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
      for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
    }
  }
  if (errors.length) console.log(`  page errors on ${name}:`, errors);
  await page.close();
}

// A quick end-to-end run: join, start, peek, ask by voice (demo engine), read the answer.
const flow = await context.newPage();
const flowErrors = [];
flow.on('pageerror', (e) => flowErrors.push(e.message));
try {
  await flow.goto(`${base}?demo=1&footer=1&room=MOTH`);
  await flow.getByLabel('Your name').fill('Ada');
  await flow.getByRole('radio', { name: 'Calling card: Owl' }).check();
  await flow.getByRole('button', { name: 'Step inside' }).click();
  await flow.getByRole('heading', { level: 1, name: 'The guests are arriving' }).waitFor();
  await flow.getByRole('button', { name: 'Start the mystery' }).click();
  await flow.getByRole('heading', { level: 1, name: 'Your secret role' }).waitFor();
  await flow.getByRole('button', { name: /peek at my role/i }).press('Enter'); // keyboard and screen reader path
  await flow.getByRole('heading', { level: 2, name: /Detective|Accomplice/ }).waitFor();
  await flow.getByRole('button', { name: 'Hide', exact: true }).click();
  await flow.getByRole('button', { name: /skip ahead/i }).click();
  await flow.getByRole('heading', { level: 1, name: 'Practice question' }).waitFor();
  await flow.getByRole('button', { name: /skip ahead/i }).click();
  await flow.getByRole('heading', { level: 1, name: 'Question the suspects' }).waitFor();
  await flow.locator('input[name="suspect"]').first().check();
  const talk = flow.getByRole('button', { name: /^Hold to ask/ });
  const box = await talk.boundingBox();
  await flow.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await flow.mouse.down();
  await flow.waitForTimeout(1600);
  await flow.mouse.up();
  await flow.getByLabel(/^Your question for/).waitFor();
  await flow.getByRole('button', { name: /^Ask / }).click();
  await flow.locator('.reply__text').filter({ hasText: /nowhere near|hardly makes me|nothing to hide/ }).waitFor({ timeout: 6000 });
  // Test a theory from the Board tab
  await flow.getByRole('tab', { name: /Board/ }).click();
  await flow.getByRole('button', { name: 'Test a theory' }).click();
  await flow.locator('input[name="theory-culprit"]').first().check();
  await flow.getByRole('button', { name: 'Put it to the table' }).click();
  await flow.getByRole('heading', { name: /^Verdict:/ }).waitFor({ timeout: 6000 });
  console.log('\nFlow: join -> lobby -> role -> investigate -> hold to talk -> answer -> test a theory -> verdict: OK');
} catch (e) {
  console.log('\nFlow FAILED:', e.message);
  totalViolations++;
}
if (flowErrors.length) console.log('Flow page errors:', flowErrors);

await browser.close();
await server.close();

console.log('\nScreen                       axe  needs-review  sideways-scroll');
for (const s of summary) {
  console.log(`${s.screen.padEnd(28)} ${String(s.violations).padStart(4)}  ${String(s.incomplete).padStart(12)}  ${s.overflowPx ? s.overflowPx + 'px' : 'none'}`);
}
console.log(`\nScreenshots: ${outDir}`);
console.log(totalViolations === 0 && overflowProblems === 0 ? 'All clear.' : `Problems: ${totalViolations} axe, ${overflowProblems} overflow.`);
process.exit(totalViolations === 0 && overflowProblems === 0 ? 0 : 1);
