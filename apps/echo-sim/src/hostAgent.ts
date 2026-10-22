// Client for the house host (POST /api/host): a Strands agent on the game server that calls the same MCP tools.
// Used for anything the instant router does not understand. Streams Server-Sent Events.

export type HostEvent =
  | { type: 'start'; model: string; agent: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'toolResult'; id: string; name: string; input: Record<string, unknown>; ok: boolean; view?: string; speech?: string; structuredContent?: Record<string, unknown>; meta?: Record<string, unknown>; ms: number }
  | { type: 'done'; text: string; firstTextMs: number | null; firstToolMs: number | null; totalMs: number; toolCalls: number }
  | { type: 'error'; message: string };

export async function* askHost(utterance: string, household: string, signal?: AbortSignal): AsyncGenerator<HostEvent> {
  const res = await fetch(new URL('/api/host', location.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-household-id': household },
    body: JSON.stringify({ utterance, household }),
    signal,
  });
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error(`The house host is not available (${res.status}).`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split('\n').find((l) => l.startsWith('data: '));
      if (data) yield JSON.parse(data.slice(6)) as HostEvent;
    }
  }
}

/** Split streamed text into sentences as soon as each one is complete, so the device can start talking early. */
export class SentenceSplitter {
  private buf = '';
  push(t: string): string[] {
    this.buf += t;
    const out: string[] = [];
    const re = /^(.*?[.!?](?:["”')\]]*)?)(\s+|$)/s;
    for (;;) {
      const m = this.buf.match(/^([\s\S]*?[.!?]["”')\]]*)\s+/);
      if (!m) break;
      out.push(m[1]!.trim());
      this.buf = this.buf.slice(m[0].length);
    }
    return out.filter(Boolean);
  }
  flush(): string[] { const t = this.buf.trim(); this.buf = ''; return t ? [t] : []; }
}
