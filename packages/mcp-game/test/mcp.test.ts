// End to end: the real SDK client talks to createMcpHandler over real Streamable HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema, CallToolResultSchema, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createMcpHandler, createFakeGameApi, BOARD_URI, MCP_APP_MIME } from '../src/index.ts';
import type { GameApi } from '../src/index.ts';

const games = new Map<string, ReturnType<typeof createFakeGameApi>>();
const gameFor = (hh: string) => {
  let g = games.get(hh);
  if (!g) { g = createFakeGameApi({ stepMs: 15 }); games.set(hh, g); }
  return g;
};
const mcp = createMcpHandler((hh): GameApi => gameFor(hh));
let http: Server;
let url: URL;

before(async () => {
  http = createServer((req, res) => void mcp(req, res));
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = new URL(`http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`);
});
after(async () => {
  await mcp.close();
  http.closeAllConnections();
  await new Promise((r) => http.close(r));
});

type Elicit = (msg: string) => { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> };

async function connect(household: string, opts: { elicit?: Elicit } = {}) {
  const client = new Client({ name: 'test-client', version: '1.0.0' }, {
    capabilities: opts.elicit ? { elicitation: { form: {} } } : {},
  });
  const prompts: string[] = [];
  if (opts.elicit) {
    const fn = opts.elicit;
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      return fn(req.params.message);
    });
  }
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-household-id': household } } });
  await client.connect(transport);
  return { client, transport, prompts };
}

const sc = (r: unknown) => (r as { structuredContent: Record<string, any> }).structuredContent;
const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]!.text);

test('negotiates the 2025-11-25 protocol and lists the game tools with icons and UI links', async () => {
  const { client, transport } = await connect('hh-list');
  assert.equal(LATEST_PROTOCOL_VERSION, '2025-11-25');
  assert.equal(transport.protocolVersion, '2025-11-25');
  assert.equal(client.getServerVersion()?.name, 'accomplice');
  assert.ok(client.getServerCapabilities()?.tasks, 'advertises tasks');
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['accuse', 'case_summary', 'examine_clue', 'get_hint', 'list_suspects', 'next_round', 'question_suspect', 'start_case']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 30, `${t.name} has a description`);
    assert.ok(t.icons?.[0]?.src.startsWith('data:image/svg+xml'), `${t.name} has an icon`);
    assert.equal((t._meta as any)?.ui?.resourceUri, BOARD_URI);
  }
  assert.equal(tools.find((t) => t.name === 'start_case')?.execution?.taskSupport, 'optional');
  assert.equal(tools.find((t) => t.name === 'accuse')?.annotations?.destructiveHint, true);
  await client.close();
});

test('serves the evidence board as an MCP Apps resource', async () => {
  const { client } = await connect('hh-res');
  const { resources } = await client.listResources();
  assert.ok(resources.some((r) => r.uri === BOARD_URI && r.mimeType === MCP_APP_MIME));
  const read = await client.readResource({ uri: BOARD_URI });
  const c = read.contents[0] as { mimeType: string; text: string };
  assert.equal(c.mimeType, MCP_APP_MIME);
  assert.match(c.text, /ui\/initialize/);
  assert.match(c.text, /ui\/notifications\/tool-result/);
  await client.close();
});

test('tools answer kindly before a case exists', async () => {
  const { client } = await connect('hh-empty');
  const r = await client.callTool({ name: 'list_suspects', arguments: {} });
  assert.equal(sc(r).view, 'empty');
  assert.match(text(r), /start a new case/i);
  await client.close();
});

test('start_case as a plain call streams progress and returns the case', async () => {
  const { client } = await connect('hh-plain');
  const progress: string[] = [];
  const r = await client.callTool({ name: 'start_case', arguments: { tone: 'cozy' } }, CallToolResultSchema, {
    onprogress: (p) => { if (p.message) progress.push(p.message); },
  });
  assert.equal(sc(r).view, 'case');
  assert.equal(sc(r).case.tone, 'cozy');
  assert.equal((r._meta as any)?.ui?.resourceUri, BOARD_URI);
  assert.ok(progress.includes('Checking there is exactly one answer'), `progress: ${progress.join(' | ')}`);
  await client.close();
});

test('start_case as an MCP task reports status and delivers the result', async () => {
  const { client } = await connect('hh-task');
  const seen: string[] = [];
  let result: any;
  for await (const m of client.experimental.tasks.callToolStream({ name: 'start_case', arguments: { tone: 'classic' } }, CallToolResultSchema, { task: { ttl: 60_000 } })) {
    seen.push(m.type);
    if (m.type === 'result') result = m.result;
    if (m.type === 'error') throw m.error;
  }
  assert.equal(seen[0], 'taskCreated');
  assert.ok(seen.includes('result'));
  assert.equal(result.structuredContent.view, 'case');
  assert.match(result.structuredContent.case.title, /Marlow House/);
  await client.close();
});

test('a full game: question, examine, hint, then accuse with an elicited confirmation', async () => {
  const { client, prompts } = await connect('hh-game', { elicit: () => ({ action: 'accept', content: { confirm: true } }) });
  await client.callTool({ name: 'start_case', arguments: { tone: 'classic' } });

  const sus = await client.callTool({ name: 'list_suspects', arguments: {} });
  assert.equal(sc(sus).suspects.length, 4);

  const ask = await client.callTool({ name: 'question_suspect', arguments: { suspect: 'the cook', question: 'Where were you at nine?' } });
  assert.equal(sc(ask).view, 'reply');
  assert.equal(sc(ask).suspect.id, 'cook');
  assert.match(sc(ask).answer, /kitchen/i);

  const unknown = await client.callTool({ name: 'question_suspect', arguments: { suspect: 'the chauffeur', question: 'Hello?' } });
  assert.equal(sc(unknown).view, 'suspects');

  const clues = await client.callTool({ name: 'examine_clue', arguments: {} });
  assert.equal(sc(clues).view, 'clues');
  const boots = await client.callTool({ name: 'examine_clue', arguments: { clue: 'boot prints' } });
  assert.equal(sc(boots).clue.id, 'boots');

  assert.equal(sc(clues).clues.length, 2, 'round one pins two clues');
  const round2 = await client.callTool({ name: 'next_round', arguments: {} });
  assert.equal(sc(round2).round, 2);
  assert.deepEqual(sc(round2).newClueIds, ['timer', 'phone']);

  const hint = await client.callTool({ name: 'get_hint', arguments: {} });
  assert.equal(sc(hint).view, 'hint');
  assert.ok(sc(hint).clue, 'hint points at one clue');
  assert.doesNotMatch(sc(hint).hint.text, /Bramble|gardener did/i, 'hint never names the culprit');

  const verdict = await client.callTool({ name: 'accuse', arguments: { culprit: 'Tom', item: 'candlestick' } });
  assert.deepEqual(prompts, ['Accuse Tom Bramble with the brass candlestick? This ends the case.']);
  assert.equal(sc(verdict).view, 'verdict');
  assert.equal(sc(verdict).result.correct, true);
  assert.equal(gameFor('hh-game').accusations, 1);

  const again = await client.callTool({ name: 'accuse', arguments: { culprit: 'cook' } });
  assert.equal(sc(again).view, 'notice', 'a closed case cannot be accused twice');
  await client.close();
});

test('declining the confirmation does not accuse anyone', async () => {
  const { client } = await connect('hh-decline', { elicit: () => ({ action: 'decline' }) });
  await client.callTool({ name: 'start_case', arguments: {} });
  const r = await client.callTool({ name: 'accuse', arguments: { culprit: 'the butler' } });
  assert.equal(sc(r).view, 'notice');
  assert.equal(gameFor('hh-decline').accusations, 0);
  await client.close();
});

test('clients without elicitation get a spoken confirmation step instead', async () => {
  const { client } = await connect('hh-noelicit');
  await client.callTool({ name: 'start_case', arguments: {} });
  const ask = await client.callTool({ name: 'accuse', arguments: { culprit: 'Clara' } });
  assert.equal(sc(ask).view, 'confirm');
  assert.match(text(ask), /yes, accuse/i);
  assert.equal(gameFor('hh-noelicit').accusations, 0);
  const done = await client.callTool({ name: 'accuse', arguments: { culprit: 'Clara', confirmed: true } });
  assert.equal(sc(done).view, 'verdict');
  assert.equal(sc(done).result.correct, false);
  await client.close();
});

test('stateless requests without a session share the household game', async () => {
  const { client } = await connect('hh-shared');
  await client.callTool({ name: 'start_case', arguments: { tone: 'cozy' } });
  await client.close();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-household-id': 'hh-shared', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'case_summary', arguments: {} } }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('mcp-session-id'), null);
  const body = await res.json() as any;
  assert.match(body.result.structuredContent.case.title, /Birthday Cake/);

  const other = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-household-id': 'hh-someone-else' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'case_summary', arguments: { household: 'hh-shared' } } }),
  });
  const ob = await other.json() as any;
  assert.match(ob.result.structuredContent.case.title, /Birthday Cake/, 'household argument overrides the header');
});

test('unknown sessions get a 404 so clients re-initialize', async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': 'nope' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(res.status, 404);
});

test('the game server room API is adapted automatically, one room per household', async () => {
  const { fromRoomApi, isRoomGameApi } = await import('../src/index.ts');
  const rooms: { code: string; phase: string; players: number }[] = [];
  const pub = {
    id: 'c1', tone: 'classic' as const, title: 'Test Case', place: 'A house', dateLine: 'Tonight', intro: 'Intro.',
    victim: { name: 'Victim', description: '' }, crime: { room: 'lib', slot: 2, what: 'was struck down' },
    rooms: [{ id: 'lib', name: 'Library' }, { id: 'kit', name: 'Kitchen' }], slots: [0, 1, 2].map((id) => ({ id, label: `${8 + id}:00 pm` })),
    suspects: [{ id: 'cook', name: 'Ada Pike', role: 'the cook', motive: 'm' }, { id: 'maid', name: 'Bea Lane', role: 'the maid', motive: 'm' }],
    items: [{ id: 'pin', name: 'rolling pin' }],
  };
  const roomApi = {
    createRoom: () => { const code = `R${rooms.length}`; rooms.push({ code, phase: 'lobby', players: 0 }); return { code, joinUrl: '' }; },
    listRooms: () => rooms,
    startCase: async (code: string) => { rooms.find((r) => r.code === code)!.phase = 'investigate'; return pub; },
    listSuspects: () => [{ id: 'cook', name: 'Ada Pike', role: 'the cook', motive: 'm', claimedAlibi: { 2: 'kit' } }, { id: 'maid', name: 'Bea Lane', role: 'the maid', motive: 'm', claimedAlibi: { 2: 'lib' } }],
    ask: async (_c: string, s: string, q: string) => ({ text: `You asked ${q}`, speaker: s, speakerName: 'Ada Pike', audioUrl: '/audio/x.mp3' }),
    examineClue: (_c: string, id: string) => ({ id, kind: 'physical' as const, title: 'Flour', text: 'Flour on the stair', round: 1 }),
    board: () => ({ clues: [{ id: 'flour', kind: 'physical' as const, title: 'Flour on the stair', text: 'Flour', round: 1, key: true }], round: 1, phase: 'investigate' }),
    accuse: async () => ({ correct: true, culprit: { id: 'cook', name: 'Ada Pike' }, item: 'rolling pin', steps: [] }),
    state: (code: string) => ({ phase: rooms.find((r) => r.code === code)?.phase ?? 'lobby', round: 1, case: rooms.find((r) => r.code === code)?.phase === 'investigate' ? pub : null }),
  };
  assert.ok(isRoomGameApi(roomApi));
  const handler = createMcpHandler(roomApi);
  const srv = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const u = new URL(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp`);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(u, { requestInit: { headers: { 'x-household-id': 'den' } } }));
  const started = await client.callTool({ name: 'start_case', arguments: {} });
  assert.equal(sc(started).case.crime.room, 'the library');
  assert.equal(sc(started).case.crime.time, '10:00 pm');
  const sus = await client.callTool({ name: 'list_suspects', arguments: {} });
  assert.equal(sc(sus).suspects[0].claimedAlibi, 'Says they were in the kitchen at 10:00 pm.');
  const ask = await client.callTool({ name: 'question_suspect', arguments: { suspect: 'the cook', question: 'Where were you?' } });
  assert.match(sc(ask).audioUrl, /^http:\/\/127\.0\.0\.1:\d+\/audio\/x\.mp3$/, 'audio urls become absolute');
  const hint = await client.callTool({ name: 'get_hint', arguments: {} });
  assert.match(sc(hint).hint.text, /Flour on the stair/);
  const verdict = await client.callTool({ name: 'accuse', arguments: { culprit: 'Ada', confirmed: true } });
  assert.equal(sc(verdict).result.correct, true);
  assert.equal(rooms.length, 1);
  // a second household with no room of its own joins the running one
  const res = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-household-id': 'kitchen-display' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'case_summary', arguments: {} } }) });
  assert.equal(((await res.json()) as any).result.structuredContent.case.title, 'Test Case');
  await client.close();
  await handler.close();
  srv.closeAllConnections();
  await new Promise((r) => srv.close(r));
});
