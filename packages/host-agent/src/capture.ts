// Wraps the MCP transport the Strands agent uses, so we can see what the game server actually returned.
// Strands hands the model only the text of a tool result; the Echo board also needs structuredContent
// (the view, portraits, the stamp). We pick it up here, on the wire, without changing the agent loop.

import type { JSONRPCMessage, Transport, TransportSendOptions } from '@modelcontextprotocol/client';

export interface CapturedResult {
  name: string;
  args: Record<string, unknown>;
  structuredContent?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isError?: boolean;
  ms: number;
}

export interface WireEntry { dir: 'out' | 'in'; method: string; at: number; message: JSONRPCMessage }

export class CapturingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];
  /** Set per turn: receives every tool result with its structured data, and the raw traffic. */
  sink: { result?: (r: CapturedResult) => void; wire?: (w: WireEntry) => void } = {};
  private inner: Transport;
  private pending = new Map<string | number, { method: string; name?: string; args?: Record<string, unknown>; taskId?: string; at: number }>();
  private taskNames = new Map<string, { name: string; args: Record<string, unknown>; at: number }>();

  constructor(inner: Transport) { this.inner = inner; }
  get sessionId() { return this.inner.sessionId; }
  setProtocolVersion(v: string) { (this.inner as { setProtocolVersion?: (v: string) => void }).setProtocolVersion?.(v); }

  async start() {
    this.inner.onmessage = (msg, extra) => { this.inbound(msg); this.onmessage?.(msg, extra as never); };
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (e) => this.onerror?.(e);
    await this.inner.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    const m = message as { id?: string | number; method?: string; params?: Record<string, any> };
    if (m.method && m.id !== undefined) {
      this.pending.set(m.id, {
        method: m.method,
        name: m.method === 'tools/call' ? m.params?.name : undefined,
        args: m.method === 'tools/call' ? (m.params?.arguments ?? {}) : undefined,
        taskId: m.params?.taskId,
        at: Date.now(),
      });
    }
    if (m.method) this.sink.wire?.({ dir: 'out', method: m.method, at: Date.now(), message });
    await this.inner.send(message, options);
  }

  async close() { await this.inner.close(); }

  private inbound(msg: JSONRPCMessage) {
    const m = msg as { id?: string | number; method?: string; result?: Record<string, any>; error?: unknown };
    const p = m.id !== undefined && !m.method ? this.pending.get(m.id) : undefined;
    if (p) this.pending.delete(m.id!);
    this.sink.wire?.({ dir: 'in', method: m.method ?? p?.method ?? 'response', at: Date.now(), message: msg });
    if (!p || !m.result) return;
    // a long tool (start_case) answers with a task first; remember which tool it belongs to
    const taskId = m.result.task?.taskId as string | undefined;
    if (taskId && p.name) this.taskNames.set(taskId, { name: p.name, args: p.args ?? {}, at: p.at });
    if (!m.result.structuredContent && !Array.isArray(m.result.content)) return;
    const owner = p.name ? { name: p.name, args: p.args ?? {}, at: p.at } : p.taskId ? this.taskNames.get(p.taskId) : undefined;
    if (!owner) return;
    this.sink.result?.({
      name: owner.name,
      args: owner.args,
      structuredContent: m.result.structuredContent,
      meta: m.result._meta,
      isError: m.result.isError,
      ms: Date.now() - owner.at,
    });
  }
}
