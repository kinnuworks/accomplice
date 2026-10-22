// Records the scripted 60 to 90 second demo for the video, driven only by the keyboard (the right arrow).
// Needs the simulator running with an add-on behind /mcp.
//   node screenshots/demo.mjs [baseUrl]      -> screenshots/out/demo.webm
// For a take with real voices, open <baseUrl>?script=1 in a browser and press the right arrow yourself.
import { chromium } from 'playwright';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? process.env.ECHO_URL ?? 'http://localhost:5175/echo/';
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
const tmpDir = `${outDir}video-tmp/`;
await mkdir(tmpDir, { recursive: true });

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: tmpDir, size: { width: 1600, height: 1000 } } });
const page = await context.newPage();
const household = `demo-${Date.now().toString(36)}`;
await page.goto(`${base}?script=1&mute=1&household=${household}`);
await page.getByText(/add-on connected/).waitFor({ timeout: 15_000 });
await page.waitForTimeout(2500);

// how long each beat stays on screen after the device settles (ms); roughly the time the line takes to say
const dwell = [5500, 4500, 6000, 6000, 5500, 4500, 5500, 3500, 6500, 5500, 7000];
const t0 = Date.now();
for (let i = 0; i < dwell.length; i++) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1800);
  // settled: idle, or waiting on the household (the accusation question)
  await page.waitForFunction(() => {
    const bar = document.querySelector('.lightbar');
    return !!document.querySelector('[role="dialog"]') || (bar && !/thinking/.test(bar.className));
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(dwell[i]);
}
const seconds = Math.round((Date.now() - t0) / 1000 + 2.5);
await context.close();
await browser.close();
const [file] = (await readdir(tmpDir)).filter((f) => f.endsWith('.webm'));
await rename(`${tmpDir}${file}`, `${outDir}demo.webm`);
console.log(`saved demo.webm (${seconds} s)`);
