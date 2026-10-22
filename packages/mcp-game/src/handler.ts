// Streamable HTTP endpoint for the Accomplice add-on (MCP spec 2025-11-25).
//
// Two ways in, both on the same URL:
//  * Session mode: an `initialize` POST gets an Mcp-Session-Id. Later requests with that header reuse
//    the connection, which is what lets the server ask follow-up questions (elicitation) mid call.
//  * Stateless mode: any other request without a session header is served by a one-shot server.
//    Voice hosts that keep their own conversation context (and never send Mcp-Session-Id) land here.
// Game state never lives in the session. It is keyed by household, so either mode sees the same game.

import { randomUUID, createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildServer } from './server.ts';
import type { GameApiSource } from './types.ts';
import { fromRoomApi, isRoomGameApi, type RoomGameApi } from './room-adapter.ts';
import { recordStoreFromEnv, recordUpdater, type RecordStore } from './records.ts';

export interface McpHandlerOptions {
  /** Household used when the request names none. Default "living-room". */
  defaultHousehold?: string;
  /** Pick the household from the request. Default: X-Household-Id header, else a hash of the bearer token. */
  householdFromRequest?: (req: IncomingMessage) => string | undefined;
  /** Public origin for absolute portrait and audio URLs, e.g. "https://accomplice.example". Default: from the Host header. */
  publicBaseUrl?: string;
  /** Close idle sessions after this many ms. Default 30 minutes. */
  sessionIdleMs?: number;
  /** Add permissive CORS headers so browser based MCP clients can connect. Default true. */
  cors?: boolean;
  /** Where detective records live. Default: from the environment (DynamoDB, else a JSON file). */
  records?: RecordStore;
  /** Narrator voice for spoken lines, used when the game itself has no narrate(). */
  narrate?: (text: string) => Promise<{ audioUrl?: string }> | { audioUrl?: string };
}

export type McpHttpHandler = ((req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>) & {
  /** Close every open session. */
  close(): Promise<void>;
  /** Number of live sessions, handy for health checks. */
  readonly sessionCount: number;
  /** Where detective records are kept: "dynamodb", "file" or "memory". */
  readonly recordStore: string;
};

interface Session { transport: StreamableHTTPServerTransport; server: McpServer; lastSeen: number }

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function householdFromHeaders(req: IncomingMessage): string | undefined {
  const explicit = header(req, 'x-household-id');
  if (explicit && /^[\w.:-]{1,80}$/.test(explicit)) return explicit;
  const auth = header(req, 'authorization');
  const m = auth?.match(/^Bearer\s+(.+)$/i);
  if (m) return 'hh_' + createHash('sha256').update(m[1]!).digest('hex').slice(0, 16);
  return undefined;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 4 * 1024 * 1024) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : undefined;
}

function sendJsonError(res: ServerResponse, status: number, code: number, message: string) {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
}

/**
 * Create the /mcp request handler.
 *
 * Plain Node:   http.createServer((req, res) => req.url?.startsWith('/mcp') ? mcp(req, res) : ...)
 * Fastify:      app.all('/mcp', (request, reply) => { reply.hijack(); return mcp(request.raw, reply.raw, request.body); })
 * Express:      app.all('/mcp', express.json(), (req, res) => mcp(req, res, req.body))
 */
export function createMcpHandler(game: GameApiSource | RoomGameApi, options: McpHandlerOptions = {}): McpHttpHandler {
  // The game server's room based API is adapted automatically; anything else is used as is.
  const gameApi: GameApiSource = isRoomGameApi(game) ? fromRoomApi(game) : game;
  const sessions = new Map<string, Session>();
  const taskStore = new InMemoryTaskStore();
  const records = options.records ?? recordStoreFromEnv();
  const updateRecord = recordUpdater(records);
  const idleMs = options.sessionIdleMs ?? 30 * 60_000;
  const cors = options.cors ?? true;

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastSeen > idleMs) {
        sessions.delete(id);
        void s.transport.close().catch(() => {});
      }
    }
  }, Math.min(idleMs, 60_000));
  sweep.unref?.();

  const householdOf = (req: IncomingMessage) =>
    options.householdFromRequest?.(req) ?? householdFromHeaders(req) ?? options.defaultHousehold ?? 'living-room';

  const baseUrlOf = (req: IncomingMessage) => {
    if (options.publicBaseUrl) return options.publicBaseUrl;
    const host = header(req, 'x-forwarded-host') ?? header(req, 'host');
    if (!host) return undefined;
    const proto = header(req, 'x-forwarded-proto') ?? ((req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
    return `${proto}://${host}`;
  };

  const handler = (async (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => {
    if (cors) {
      res.setHeader('access-control-allow-origin', header(req, 'origin') ?? '*');
      res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id, x-household-id');
      res.setHeader('access-control-expose-headers', 'mcp-session-id, mcp-protocol-version');
      res.setHeader('vary', 'origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    try {
      let body = parsedBody;
      if (req.method === 'POST' && body === undefined) body = await readJson(req);

      const sid = header(req, 'mcp-session-id');
      if (sid) {
        const s = sessions.get(sid);
        if (!s) return sendJsonError(res, 404, -32001, 'Session not found. Please initialize again.');
        s.lastSeen = Date.now();
        await s.transport.handleRequest(req, res, body);
        return;
      }

      const household = householdOf(req);
      const publicBaseUrl = baseUrlOf(req);

      if (req.method === 'POST' && isInitializeRequest(body)) {
        const server = buildServer({ source: gameApi, household, taskStore, publicBaseUrl, records, updateRecord, narrate: options.narrate });
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          // Plain JSON replies instead of SSE when a proxy cannot stream (Cloudflare quick tunnels).
          enableJsonResponse: !!process.env.TUNNEL || process.env.MCP_JSON_RESPONSE === 'on',
          onsessioninitialized: (id) => { sessions.set(id, { transport, server, lastSeen: Date.now() }); },
          onsessionclosed: (id) => { sessions.delete(id); },
        });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST, OPTIONS' }).end();
        return;
      }

      // Stateless: one server for this one request.
      const server = buildServer({ source: gameApi, household, taskStore, publicBaseUrl, records, updateRecord, narrate: options.narrate });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close().catch(() => {}); void server.close().catch(() => {}); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      const message = err instanceof SyntaxError ? 'Parse error' : 'Internal error';
      sendJsonError(res, err instanceof SyntaxError ? 400 : 500, err instanceof SyntaxError ? -32700 : -32603, message);
    }
  }) as McpHttpHandler;

  handler.close = async () => {
    clearInterval(sweep);
    const all = [...sessions.values()];
    sessions.clear();
    await Promise.all(all.map((s) => s.transport.close().catch(() => {})));
    taskStore.cleanup();
  };
  Object.defineProperty(handler, 'sessionCount', { get: () => sessions.size });
  Object.defineProperty(handler, 'recordStore', { get: () => records.kind });
  return handler;
}
