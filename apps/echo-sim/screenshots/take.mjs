// Walk through a whole case in the simulator and save screenshots.
// Needs the simulator running (pnpm --filter @accomplice/echo-sim dev) with an add-on behind /mcp.
// It plays Ashby Hall, the case the TV and phone demos play: run the add-on with FAKE_CASE=demo
// (FAKE_CASE=demo pnpm --filter @accomplice/mcp-game dev), so all three sets of screenshots tell one story.
//   node screenshots/take.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? process.env.ECHO_URL ?? 'http://localhost:5175/echo/';
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(outDir, { recursive: true });

const household = `shots-${Date.now().toString(36)}`;
// Uses the bundled Chromium when installed (npx playwright install chromium), else the local Chrome.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));

const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${outDir}${name}.png` });
  console.log('saved', `${name}.png`);
};
const board = () => page.frameLocator('iframe.app-frame');
const sayIt = async (text) => {
  await page.getByLabel('Type what you would say').fill(text);
  await page.getByLabel('Type what you would say').press('Enter');
};
const boardShows = (text) => board().getByText(text, { exact: false }).first().waitFor({ timeout: 15_000 });

await page.goto(`${base}?mute=1&household=${household}`);
await page.getByText(/add-on connected/).waitFor({ timeout: 15_000 });
await shot('01-home');

await sayIt('start a new case');
await boardShows('Working on it');
await page.waitForTimeout(800);
await shot('02-starting-task');
await boardShows('Ashby Hall');
await shot('03-case-file');

await sayIt('who are the suspects');
await boardShows('Who will you question?');
await shot('04-suspects');

await sayIt('ask the cook where she was at half past nine');
await boardShows('cheese board');
await shot('05-suspect-reply');

// the same card in light mode
await page.getByRole('button', { name: /Switch the display to light mode/ }).click();
await shot('05c-reply-light');
await page.getByRole('button', { name: /Switch the display to dark mode/ }).click();

// touch works too: the board calls tools through the host bridge
await board().getByRole('button', { name: 'Ask someone else' }).click();
await boardShows('Who will you question?');
await board().getByRole('button', { name: /Question Algernon Pike/ }).click();
await boardShows('coins out of my ear');
await shot('05b-touch-question');

await sayIt('examine the croquet mallet');
await boardShows('exactly where it always is');
await shot('06-clue');

await sayIt('next round');
await boardShows('round 2');
await shot('06b-next-round');

await sayIt('give me a hint');
await boardShows('A gentle nudge');
await shot('07-hint');

await sayIt('I accuse the cook with the decanter of port');
await page.getByRole('dialog').waitFor({ timeout: 15_000 });
await shot('08-elicitation');
await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
await boardShows('Continue on your Fire TV');
await page.waitForTimeout(600); // let the stamp land
await shot('09-verdict-stamp');
await page.getByRole('button', { name: /Switch the display to light mode/ }).click();
await shot('09b-verdict-light');
await page.getByRole('button', { name: /Switch the display to dark mode/ }).click();

await sayIt('how are we doing?');
await boardShows('Detective record');
await shot('10-detective-record');

await sayIt('continue on the TV');
await boardShows('enter this code');
await shot('11-continue-on-tv');

// open the elicitation in the developer drawer
await page.locator('.t.request .t-method', { hasText: 'elicitation/create' }).first().click();
await shot('12-drawer-elicitation');

// context across sessions: start the case again, ask a question, close the page, come back later
await sayIt('start a new case');
await boardShows('Ashby Hall');
await sayIt('ask the colonel where he was at eight');
await boardShows('inspecting the umbrellas');
await page.setViewportSize({ width: 1600, height: 1000 });
await page.goto(`${base}?mute=1&drawer=0&household=${household}`);
await page.getByText(/add-on connected/).waitFor({ timeout: 15_000 });
await sayIt("let's finish last night's case");
await boardShows('Welcome back');
await shot('13-resume-next-day');

await browser.close();
