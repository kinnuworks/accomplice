// Screenshots of the Strands house host handling free-form speech (needs /api/host and a model key on the server).
//   node screenshots/agent.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? process.env.ECHO_URL ?? 'http://localhost:5175/echo/';
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const say = async (t) => { await page.getByLabel('Type what you would say').fill(t); await page.getByLabel('Type what you would say').press('Enter'); };
const turnDone = async (n) => page.getByText(/ms on the device/).nth(n - 1).waitFor({ timeout: 60_000 });

await page.goto(`${base}?mute=1&household=agent-${Date.now().toString(36)}`);
await page.getByText(/add-on connected/).waitFor({ timeout: 15_000 });
await say('start a new case');
await page.frameLocator('iframe.app-frame').getByText('Marlow House').first().waitFor({ timeout: 20_000 });

await say('who was near the kitchen around nine?');
await turnDone(1);
await page.getByRole('tab', { name: 'Strands agent' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}14-strands-agent.png` });

await say('remind me what the cook said');
await turnDone(2);
await page.waitForTimeout(600);
await page.screenshot({ path: `${outDir}15-strands-memory.png` });
const notes = await page.$$eval('.t-sum', (els) => els.map((e) => e.textContent).filter((t) => /first word|called/.test(t)));
console.log(notes.join('\n'));
await browser.close();
