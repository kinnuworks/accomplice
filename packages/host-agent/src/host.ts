// The house host: a Strands agent that hosts Accomplice by calling the game's own MCP server.
// One agent per household, so the host remembers the conversation ("what did the butler say?").

import { Agent, McpClient, SlidingWindowConversationManager, type Model } from '@strands-agents/sdk';
import { AnthropicModel } from '@strands-agents/sdk/models/anthropic';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { CapturingTransport, type CapturedResult } from './capture.ts';
import { SYSTEM_PROMPT } from './prompt.ts';

export const DEFAULT_HOST_MODEL = 'claude-haiku-5-5';

export type HostEvent =
  | { type: 'start'; household: string; model: string; agent: 'strands' }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'toolResult'; id: string; name: string; input: Record<string, unknown>; ok: boolean; view?: string; speech?: string; structuredContent?: Record<string, unknown>; meta?: Record<string, unknown>; ms: number }
  | { type: 'done'; text: string; firstTextMs: number | null; firstToolMs: number | null; totalMs: number; toolCalls: number }
  | { type: 'error'; message: string };

export interface HostAgentOptions {
  /** The game's MCP endpoint, e.g. http://127.0.0.1:8787/mcp */
  mcpUrl: string;
  /** A Strands model. Default: Anthropic Messages API with ANTHROPIC_API_KEY and HOST_MODEL (claude-haiku-5-5). */
  model?: Model | (() => Model);
  modelId?: string;
  apiKey?: string;
  /** Forget a household's conversation after this long without a turn. Default 45 minutes. */
  idleMs?: number;
  /** Turns kept in the conversation window. Default 24 messages. */
  windowSize?: number;
}

/** The address the device reached the server on, so links in results work for it. */
export interface PublicOrigin { host?: string; proto?: string }

interface Session {
  agent: Agent;
  mcp: McpClient;
  transport: CapturingTransport;
  chain: Promise<unknown>;
  lastUsed: number;
}

/** Strip anything that should not be read aloud. */
export function speakable(s: string): string {
  return s.replace(/[*_#`>]+/g, '').replace(/\s*—\s*/g, ', ').replace(/\s{2,}/g, ' ');
}

export class HostAgents {
  private sessions = new Map<string, Session>();
  private opts: HostAgentOptions;
  private sweep: ReturnType<typeof setInterval>;
  readonly modelId: string;

  constructor(opts: HostAgentOptions) {
    this.opts = opts;
    this.modelId = opts.modelId ?? process.env.HOST_MODEL ?? DEFAULT_HOST_MODEL;
    const idle = opts.idleMs ?? 45 * 60_000;
    this.sweep = setInterval(() => {
      for (const [hh, s] of this.sessions) if (Date.now() - s.lastUsed > idle) { this.sessions.delete(hh); void s.mcp.disconnect().catch(() => {}); }
    }, 60_000);
    this.sweep.unref?.();
  }

  private makeModel(): Model {
    if (this.opts.model) return typeof this.opts.model === 'function' ? this.opts.model() : this.opts.model;
    const apiKey = this.opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('The house host needs ANTHROPIC_API_KEY.');
    return new AnthropicModel({ apiKey, modelId: this.modelId, maxTokens: 400 });
  }

  private session(household: string, origin?: PublicOrigin): Session {
    const key = `${household}@${origin?.host ?? ''}`;
    let s = this.sessions.get(key);
    if (s) return s;
    // portraits and audio links in tool results should point at the address the device used, not loopback
    const headers: Record<string, string> = { 'x-household-id': household };
    if (origin?.host) { headers['x-forwarded-host'] = origin.host; headers['x-forwarded-proto'] = origin.proto ?? 'http'; }
    const transport = new CapturingTransport(
      new StreamableHTTPClientTransport(new URL(this.opts.mcpUrl), { requestInit: { headers } }),
    );
    const mcp = new McpClient({ transport, applicationName: 'accomplice-house-host', applicationVersion: '0.1.0', disableMcpInstrumentation: true });
    const agent = new Agent({
      model: this.makeModel(),
      tools: [mcp],
      systemPrompt: SYSTEM_PROMPT,
      printer: false,
      conversationManager: new SlidingWindowConversationManager({ windowSize: this.opts.windowSize ?? 24 }),
    });
    s = { agent, mcp, transport, chain: Promise.resolve(), lastUsed: Date.now() };
    this.sessions.set(key, s);
    return s;
  }

  /** One spoken turn. Yields text as it streams, every tool the agent calls, and timings. */
  async *turn(household: string, utterance: string, origin?: PublicOrigin): AsyncGenerator<HostEvent> {
    const s = this.session(household, origin);
    s.lastUsed = Date.now();
    // one turn at a time per household, in order
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    const before = s.chain;
    s.chain = before.then(() => mine);
    await before.catch(() => {});

    const t0 = Date.now();
    let firstText: number | null = null;
    let firstTool: number | null = null;
    let text = '';
    let calls = 0;
    const captured: CapturedResult[] = [];
    const uses = new Map<string, { name: string; input: Record<string, unknown> }>();
    s.transport.sink = { result: (r) => captured.push(r) };
    yield { type: 'start', household, model: this.modelId, agent: 'strands' };
    try {
      for await (const ev of s.agent.stream(utterance)) {
        const e = ev as { type: string; [k: string]: any };
        if (e.type === 'modelStreamUpdateEvent' && e.event?.type === 'modelContentBlockDeltaEvent' && e.event.delta?.type === 'textDelta') {
          const t = e.event.delta.text as string;
          if (!t) continue;
          if (firstText === null) firstText = Date.now() - t0;
          text += t;
          yield { type: 'text', text: t };
        } else if (e.type === 'beforeToolCallEvent') {
          const u = e.toolUse as { name: string; toolUseId: string; input: Record<string, unknown> };
          if (firstTool === null) firstTool = Date.now() - t0;
          uses.set(u.toolUseId, { name: u.name, input: u.input ?? {} });
          calls++;
          // a gap between sentences spoken before and after a tool call
          if (text && !/\s$/.test(text)) { text += ' '; yield { type: 'text', text: ' ' }; }
          yield { type: 'tool', id: u.toolUseId, name: u.name, input: u.input ?? {} };
        } else if (e.type === 'afterToolCallEvent') {
          const r = (e.result?.toolResult ?? e.result) as { toolUseId: string; status: string } | undefined;
          if (!r?.toolUseId) continue;
          const use = uses.get(r.toolUseId);
          const name = use?.name ?? 'tool';
          const i = captured.findIndex((c) => c.name === name);
          const c = i >= 0 ? captured.splice(i, 1)[0] : undefined;
          const sc = c?.structuredContent;
          yield {
            type: 'toolResult', id: r.toolUseId, name, input: use?.input ?? {}, ok: r.status === 'success' && !c?.isError,
            view: sc?.view as string | undefined, speech: sc?.speech as string | undefined, structuredContent: sc, meta: c?.meta, ms: c?.ms ?? 0,
          };
        }
      }
      yield { type: 'done', text: speakable(text).trim(), firstTextMs: firstText, firstToolMs: firstTool, totalMs: Date.now() - t0, toolCalls: calls };
    } catch (err) {
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
    } finally {
      s.transport.sink = {};
      s.lastUsed = Date.now();
      release();
    }
  }

  /** Forget one household's conversation (for "start over"). */
  async reset(household: string) {
    for (const [key, s] of this.sessions) {
      if (key.startsWith(`${household}@`)) { this.sessions.delete(key); await s.mcp.disconnect().catch(() => {}); }
    }
  }

  async close() {
    clearInterval(this.sweep);
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(all.map((s) => s.mcp.disconnect().catch(() => {})));
  }
}
