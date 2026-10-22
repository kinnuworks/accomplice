// HTTP + WebSocket server: static apps, audio cache, QR codes, health, game sockets, speech input, MCP.
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { cfg, REPO_ROOT, hasEnv } from './config.js';
import { Hub } from './hub.js';
import { handleStt } from './stt.js';
import { createGameApi, type GameApi } from './game-api.js';
import { sessionStats, allTimeStats } from './audit.js';
import { ttsStatus } from './tts.js';
import { getModel } from './models.js';
import { renderFrontPage } from './newspaper.js';
import { log } from './log.js';
import { initAws } from './aws/index.js';

export function lanAddress(): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

export interface Built { app: FastifyInstance; hub: Hub; api: GameApi; mcp: string }

export async function buildServer(opts: { logger?: boolean } = {}): Promise<Built> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000 });
  const hub = await new Hub().init();
  const api = createGameApi(hub);

  // Phones need an address they can reach: PUBLIC_URL, else this machine's LAN address. Never localhost.
  const base = () => (cfg.publicUrl || `http://${lanAddress() ?? os.hostname()}:${cfg.port}`).replace(/\/$/, '');
  hub.joinUrlFor = (code) => `${base()}/p?room=${code}`;

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket, { options: { maxPayload: 1 << 20 } });

  // ---- static apps ----
  mkdirSync(cfg.audioDir, { recursive: true });
  await app.register(fastifyStatic, { root: cfg.audioDir, prefix: '/audio/', decorateReply: true, maxAge: '365d', immutable: true });
  const apps: [string, string][] = [['/tv/', 'apps/tv-web/dist'], ['/p/', 'apps/phone/dist'], ['/echo/', 'apps/echo-sim/dist']];
  const mounted: string[] = [];
  for (const [prefix, rel] of apps) {
    const root = path.join(REPO_ROOT, rel);
    if (!existsSync(root)) continue;
    await app.register(fastifyStatic, { root, prefix, decorateReply: false, wildcard: true, index: ['index.html'] });
    app.get(prefix.slice(0, -1), (req, reply) => {
      const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      reply.redirect(prefix + q);
    });
    mounted.push(prefix);
  }
  const assets = path.join(REPO_ROOT, 'assets');
  if (existsSync(assets)) await app.register(fastifyStatic, { root: assets, prefix: '/assets/', decorateReply: false, maxAge: '1h' });

  // SPA fallback for client side routes under the mounted apps.
  app.setNotFoundHandler(async (req, reply) => {
    const hit = mounted.find((p) => req.url.startsWith(p));
    if (hit && req.method === 'GET') {
      const root = path.join(REPO_ROOT, apps.find(([p]) => p === hit)![1]);
      try { return reply.type('text/html').send(await readFile(path.join(root, 'index.html'))); } catch { /* fall through */ }
    }
    return reply.code(404).send({ error: 'not found' });
  });

  app.get('/', (_req, reply) => (mounted.includes('/tv/') ? reply.redirect('/tv/') : reply.send({ name: 'Accomplice game server', tv: '/tv', phone: '/p', health: '/api/health' })));

  // ---- api ----
  app.get('/api/health', async () => ({
    ok: true,
    engine: hub.engine.source,
    model: { provider: getModel().kind, model: cfg.modelProvider === 'bedrock' ? cfg.bedrockModel : cfg.modelProvider === 'anthropic' ? cfg.anthropicModel : 'mock', keySet: hasEnv('ANTHROPIC_API_KEY') },
    tts: ttsStatus(),
    stt: cfg.sttProvider,
    translate: cfg.translate,
    region: cfg.awsRegion,
    rooms: hub.rooms.size,
    apps: mounted,
    mcp: mcpStatus,
    joinBase: base(),
  }));

  app.get('/api/qr', async (req, reply) => {
    const text = String((req.query as any)?.text ?? '');
    if (!text || text.length > 512) return reply.code(400).send({ error: 'text is required (max 512 chars)' });
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    return reply.type('image/svg+xml').header('cache-control', 'public, max-age=3600').send(svg);
  });

  app.get('/api/audit', async () => ({ session: sessionStats(), allTime: await allTimeStats() }));

  app.post('/api/rooms', async (req) => {
    const body = (req.body ?? {}) as { tone?: 'classic' | 'cozy' };
    return api.createRoom({ tone: body.tone });
  });

  app.get('/api/rooms/:code', async (req, reply) => {
    const r = hub.get((req.params as any).code);
    if (!r) return reply.code(404).send({ error: 'no such room' });
    return r.publicState();
  });

  app.get('/api/rooms/:code/front-page.png', async (req, reply) => {
    const r = hub.get((req.params as any).code);
    const n = r?.reveal?.newspaper;
    if (!r || !n || !r.case) return reply.code(404).send({ error: 'no front page yet' });
    const png = await renderFrontPage(`${r.code}:${r.case.id}:${JSON.stringify(n.players.map((p) => p.score))}`, n);
    if (!png) return reply.code(500).send({ error: 'could not render the front page' });
    return reply.type('image/png').header('cache-control', 'public, max-age=300').header('content-disposition', `inline; filename="accomplice-${r.code}.png"`).send(png);
  });

  app.get('/api/rooms/:code/timings', async (req, reply) => {
    const r = hub.get((req.params as any).code);
    if (!r) return reply.code(404).send({ error: 'no such room' });
    return r.timings;
  });

  // ---- sockets ----
  app.get('/ws', { websocket: true }, (socket, req) => {
    hub.connect(socket as any, req.query as any);
  });
  app.get('/stt', { websocket: true }, (socket, req) => {
    handleStt(socket as any, req.query as any, hub);
  });

  // ---- MCP (optional package) ----
  let mcpStatus = 'not installed';
  try {
    const spec = '@accomplice/mcp-game';
    const m: any = await import(/* @vite-ignore */ spec).catch(async () => {
      const local = path.join(REPO_ROOT, 'packages/mcp-game/src/index.ts');
      return existsSync(local) ? import(/* @vite-ignore */ 'file://' + local) : null;
    });
    if (m) {
      if (typeof m.mountMcp === 'function') { await m.mountMcp(app, { api, path: '/mcp' }); mcpStatus = 'mounted'; }
      else if (typeof m.registerMcp === 'function') { await m.registerMcp(app, { api, path: '/mcp' }); mcpStatus = 'mounted'; }
      else if (typeof m.createMcpHandler === 'function') {
        const handler = await m.createMcpHandler(api, cfg.publicUrl ? { publicBaseUrl: cfg.publicUrl } : {});
        app.all('/mcp', async (req, reply) => { reply.hijack(); await handler(req.raw, reply.raw, req.body); });
        app.addHook('onClose', async () => { await handler.close?.(); });
        mcpStatus = 'mounted';
      } else mcpStatus = 'package found, no mountMcp/createMcpHandler export';
    }
  } catch (e) {
    mcpStatus = `failed: ${(e as Error).message}`;
    log.warn('MCP mount failed', (e as Error).message);
  }

  await initAws(app, hub); // no-op unless ACCOMPLICE_TABLE, AUDIO_BUCKET or EMF_METRICS is set
  app.addHook('onClose', async () => hub.close());
  return { app, hub, api, mcp: mcpStatus };
}
