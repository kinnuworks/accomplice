// POST /api/host: one spoken turn for the house host, streamed back as Server-Sent Events.
//   request:  { "utterance": "who was near the kitchen around nine?", "household": "living-room" }
//   events:   start, text (deltas), tool, toolResult, done, error
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HostAgents, type HostAgentOptions } from './host.ts';

export interface HostHandlerOptions extends Omit<HostAgentOptions, 'mcpUrl'> {
  /** The game's MCP endpoint. Default: this same server's /mcp on loopback. */
  mcpUrl?: string;
}

export type HostHttpHandler = ((req: IncomingMessage, res: ServerResponse, body?: unknown) => Promise<void>) & {
  close(): Promise<void>;
  readonly agents: HostAgents | null;
};

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function createHostHandler(options: HostHandlerOptions = {}): HostHttpHandler {
  let agents: HostAgents | null = null;
  const handler = (async (req: IncomingMessage, res: ServerResponse, parsed?: unknown) => {
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }).end(); return; }
    let body: { utterance?: unknown; household?: unknown };
    try { body = (parsed ?? (await readJson(req))) as typeof body; } catch { res.writeHead(400).end('{"error":"bad json"}'); return; }
    const utterance = typeof body.utterance === 'string' ? body.utterance.trim().slice(0, 500) : '';
    const hdr = req.headers['x-household-id'];
    const household = (typeof body.household === 'string' && body.household) || (Array.isArray(hdr) ? hdr[0] : hdr) || 'living-room';
    if (!utterance || !/^[\w.:-]{1,80}$/.test(household)) { res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"utterance and a valid household are required"}'); return; }

    agents ??= new HostAgents({ ...options, mcpUrl: options.mcpUrl ?? `http://127.0.0.1:${req.socket.localPort}/mcp` });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    let open = true;
    res.on('close', () => { open = false; });
    const send = (type: string, data: unknown) => { if (open) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
    const origin = { host: one(req.headers['x-forwarded-host']) ?? one(req.headers.host), proto: one(req.headers['x-forwarded-proto']) ?? 'http' };
    for await (const ev of agents.turn(household, utterance, origin)) send(ev.type, ev);
    if (open) res.end();
  }) as HostHttpHandler;
  handler.close = async () => { await agents?.close(); };
  Object.defineProperty(handler, 'agents', { get: () => agents });
  return handler;
}
