// The simulator's MCP client: the real SDK client over Streamable HTTP, with every message logged
// so the developer drawer can show the raw traffic.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema, ElicitRequestSchema,
  type CallToolResult, type ElicitRequest, type ElicitResult, type JSONRPCMessage, type ReadResourceResult, type Tool,
} from '@modelcontextprotocol/sdk/types.js';

export type Lane = 'mcp' | 'app' | 'agent';
export interface TrafficEntry {
  n: number;
  at: number;
  lane: Lane;
  dir: 'out' | 'in';
  method: string;
  kind: 'request' | 'response' | 'notification' | 'error';
  message: JSONRPCMessage;
  summary?: string;
}

type Listener = (e: TrafficEntry) => void;

export class TrafficLog {
  entries: TrafficEntry[] = [];
  private listeners = new Set<Listener>();
  private methods = new Map<string, string>();
  private n = 0;

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  /** A note that is not a JSON-RPC message, for example what the Strands agent did. */
  note(lane: Lane, dir: 'out' | 'in', method: string, kind: TrafficEntry['kind'], data: Record<string, unknown>, summary?: string) {
    const entry: TrafficEntry = { n: ++this.n, at: Date.now(), lane, dir, method, kind, message: data as unknown as JSONRPCMessage, summary };
    this.entries = [...this.entries.slice(-299), entry];
    for (const l of this.listeners) l(entry);
  }

  record(lane: Lane, dir: 'out' | 'in', message: JSONRPCMessage) {
    const m = message as { id?: string | number; method?: string; error?: unknown };
    let method = m.method ?? '';
    let kind: TrafficEntry['kind'] = 'notification';
    const key = `${lane}:${dir === 'out' ? 'o' : 'i'}:${m.id}`;
    if (m.method && m.id !== undefined) { kind = 'request'; this.methods.set(key, m.method); }
    else if (!m.method) {
      kind = m.error ? 'error' : 'response';
      const reqKey = `${lane}:${dir === 'out' ? 'i' : 'o'}:${m.id}`;
      method = this.methods.get(reqKey) ?? 'response';
      this.methods.delete(reqKey);
    }
    const entry: TrafficEntry = { n: ++this.n, at: Date.now(), lane, dir, method, kind, message };
    this.entries = [...this.entries.slice(-299), entry];
    for (const l of this.listeners) l(entry);
  }
}

/** Wraps any Transport and records what goes in and out. */
export class LoggingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];
  private inner: Transport;
  private log: TrafficLog;
  private lane: Lane;

  constructor(inner: Transport, log: TrafficLog, lane: Lane) {
    this.inner = inner;
    this.log = log;
    this.lane = lane;
  }
  get sessionId() { return this.inner.sessionId; }
  setProtocolVersion(v: string) { this.inner.setProtocolVersion?.(v); }
  async start() {
    this.inner.onmessage = (msg, extra) => { this.log.record(this.lane, 'in', msg); this.onmessage?.(msg, extra); };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (e) => this.onerror?.(e);
    await this.inner.start();
  }
  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    this.log.record(this.lane, 'out', message);
    await this.inner.send(message, options);
  }
  async close() { await this.inner.close(); }
}

export interface ElicitPrompt { message: string; request: ElicitRequest['params'] }

export interface ConnectionInfo {
  serverName: string;
  serverTitle?: string;
  protocolVersion?: string;
  sessionId?: string;
  household: string;
  tools: Tool[];
  capabilities: Record<string, unknown>;
}

export class GameConnection {
  readonly log = new TrafficLog();
  client: Client | null = null;
  transport: StreamableHTTPClientTransport | null = null;
  info: ConnectionInfo | null = null;
  private resources = new Map<string, ReadResourceResult>();
  /** Set by the UI: shows the question on screen and resolves with the household's answer. */
  onElicit: (p: ElicitPrompt) => Promise<ElicitResult> = async () => ({ action: 'decline' });
  private url: URL;
  private household: string;

  constructor(url: URL, household: string) {
    this.url = url;
    this.household = household;
  }

  async connect(): Promise<ConnectionInfo> {
    const client = new Client(
      { name: 'accomplice-echo-sim', title: 'Simulated Alexa+ (Echo Show)', version: '0.1.0' },
      {
        capabilities: {
          elicitation: { form: {} },
          // MCP Apps support, advertised the way the extension asks for it
          extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
        } as Record<string, unknown>,
      },
    );
    client.setRequestHandler(ElicitRequestSchema, async (req) => this.onElicit({ message: req.params.message, request: req.params }));
    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: { headers: { 'x-household-id': this.household } },
    });
    await client.connect(new LoggingTransport(transport, this.log, 'mcp'));
    const { tools } = await client.listTools();
    this.client = client;
    this.transport = transport;
    this.resources.clear();
    const v = client.getServerVersion();
    this.info = {
      serverName: v?.name ?? 'unknown',
      serverTitle: v?.title,
      protocolVersion: transport.protocolVersion,
      sessionId: transport.sessionId,
      household: this.household,
      tools,
      capabilities: (client.getServerCapabilities() ?? {}) as Record<string, unknown>,
    };
    return this.info;
  }

  tool(name: string): Tool | undefined {
    return this.info?.tools.find((t) => t.name === name);
  }

  private async withReconnect<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    if (!this.client) await this.connect();
    try {
      return await fn(this.client!);
    } catch (e) {
      // The server restarted or dropped our session: start a fresh one and try once more.
      if (e instanceof StreamableHTTPError && e.code === 404) {
        await this.connect();
        return await fn(this.client!);
      }
      throw e;
    }
  }

  async callTool(name: string, args: Record<string, unknown>, onStatus?: (s: string) => void): Promise<CallToolResult> {
    const t = this.tool(name);
    const asTask = t?.execution?.taskSupport === 'optional' || t?.execution?.taskSupport === 'required';
    return this.withReconnect(async (client) => {
      if (!asTask) return (await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout: 120_000 })) as CallToolResult;
      // Long running tools run as MCP tasks; status messages show on screen while we wait.
      let result: CallToolResult | null = null;
      for await (const m of client.experimental.tasks.callToolStream({ name, arguments: args }, CallToolResultSchema, { task: { ttl: 120_000 }, timeout: 120_000 })) {
        if (m.type === 'taskStatus' && m.task.statusMessage) onStatus?.(m.task.statusMessage);
        if (m.type === 'result') result = m.result as CallToolResult;
        if (m.type === 'error') throw m.error;
      }
      if (!result) throw new Error('The task ended without a result.');
      return result;
    });
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const cached = this.resources.get(uri);
    if (cached) return cached;
    const r = await this.withReconnect((c) => c.readResource({ uri }));
    this.resources.set(uri, r);
    return r;
  }
}
