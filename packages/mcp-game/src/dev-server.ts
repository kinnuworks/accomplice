// Run the add-on alone, backed by the fake game, for working on the Echo simulator
// without the full game server:  pnpm --filter @accomplice/mcp-game dev
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createMcpHandler } from './handler.ts';
import { createFakeGameApi } from './fake.ts';
import type { GameApi } from './types.ts';

const games = new Map<string, GameApi>();
const mcp = createMcpHandler((household) => {
  let g = games.get(household);
  if (!g) { g = createFakeGameApi({ stepMs: 700 }); games.set(household, g); }
  return g;
});

// the Strands house host, when a model key is around (node --env-file=../../apps/server/.env ...)
let host: ((req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>) | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const h = await import(new URL('../../host-agent/src/index.ts', import.meta.url).href);
    host = h.createHostHandler();
  } catch (e) { console.warn('House host not available:', (e as Error).message); }
}

const port = Number(process.env.PORT ?? 8787);
createServer((req, res) => {
  if (req.url?.startsWith('/mcp')) return void mcp(req, res);
  if (req.url === '/api/host' && host) return void host(req, res);
  // portraits, the way the game server serves them from the TV app
  const art = req.url?.match(/^\/tv\/art\/(portraits\/[a-z0-9-]+\.webp)$/);
  if (art) {
    readFile(new URL(`../../../apps/tv-web/public/art/${art[1]}`, import.meta.url))
      .then((buf) => { res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'max-age=3600' }); res.end(buf); })
      .catch(() => { res.writeHead(404).end(); });
    return;
  }
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
  res.writeHead(404).end();
}).listen(port, () => {
  console.log(`Accomplice add-on (fake game) listening on http://localhost:${port}/mcp${host ? ', house host on /api/host' : ''}`);
});
