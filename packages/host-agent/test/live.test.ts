// One live smoke test against the real model. Runs only with LIVE=1 (it costs a few cents):
//   LIVE=1 node --test --experimental-strip-types test/live.test.ts
// The key comes from ANTHROPIC_API_KEY or apps/server/.env, and is never printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMcpHandler, createFakeGameApi, MemoryRecordStore } from '@accomplice/mcp-game';
import { HostAgents, type HostEvent } from '../src/index.ts';

function key(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const line = readFileSync(new URL('../../../apps/server/.env', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
    return line?.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^"|"$/g, '') || undefined;
  } catch { return undefined; }
}

test('live: the house host plays a few turns with the real model', { skip: process.env.LIVE !== '1' || !key() ? 'set LIVE=1 with a key' : false, timeout: 120_000 }, async () => {
  const game = createFakeGameApi({ stepMs: 150 });
  const mcp = createMcpHandler(() => game, { records: new MemoryRecordStore() });
  const srv = createServer((req, res) => void mcp(req, res));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const host = new HostAgents({ mcpUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp`, apiKey: key() });
  const turns: [string, (evs: HostEvent[]) => void][] = [
    ['Start a new classic case, please.', (evs) => assert.ok(evs.some((e) => e.type === 'tool' && e.name === 'start_case'))],
    ['Who was near the kitchen around nine?', (evs) => assert.ok(evs.some((e) => e.type === 'tool' && /question_suspect|examine_clue|list_suspects|case_summary/.test(e.name)))],
    ['Remind me what the cook said.', () => {}],
    ['I think it was the gardener with the candlestick. Are we sure?', () => assert.equal(game.accusations, 0, 'never commits without a clear yes')],
  ];
  for (const [said, check] of turns) {
    const evs: HostEvent[] = [];
    for await (const e of host.turn('live-smoke', said)) evs.push(e);
    const done = evs.find((e) => e.type === 'done') as Extract<HostEvent, { type: 'done' }> | undefined;
    assert.ok(done, JSON.stringify(evs.filter((e) => e.type === 'error')));
    const tools = evs.filter((e) => e.type === 'tool').map((e) => (e as { name: string }).name);
    console.log(`  "${said}" -> [${tools.join(', ')}] first word ${done!.firstTextMs} ms, total ${done!.totalMs} ms: ${done!.text}`);
    assert.ok(done!.text.length > 0 && done!.text.length < 400);
    assert.doesNotMatch(done!.text, /[*#]|—/);
    check(evs);
  }
  await host.close(); await mcp.close(); srv.closeAllConnections(); srv.close();
});
