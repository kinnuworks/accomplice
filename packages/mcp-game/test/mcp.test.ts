// End to end: the real SDK client talks to createMcpHandler over real Streamable HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema, CallToolResultSchema, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { createMcpHandler, createFakeGameApi, BOARD_URI, MCP_APP_MIME, MemoryRecordStore, JsonFileRecordStore } from '../src/index.ts';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameApi } from '../src/index.ts';

const games = new Map<string, ReturnType<typeof createFakeGameApi>>();
const gameFor = (hh: string) => {
  let g = games.get(hh);
  if (!g) { g = createFakeGameApi({ stepMs: 15 }); games.set(hh, g); }
  return g;
};
const mcp = createMcpHandler((hh): GameApi => gameFor(hh), { records: new MemoryRecordStore(), narrate: (t) => ({ audioUrl: `/audio/narrator-${t.length}.mp3` }) });
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
  assert.deepEqual(names, ['accuse', 'case_summary', 'examine_clue', 'get_hint', 'list_suspects', 'my_detective_record', 'next_round', 'question_suspect', 'resume_case', 'send_to_tv', 'start_case']);
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
  const { Script } = await import('node:vm');
  const js = c.text.slice(c.text.indexOf('<script>') + 8, c.text.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Script(js), 'the board script parses');
  for (const v of ['case', 'suspects', 'reply', 'clue', 'clues', 'hint', 'confirm', 'verdict', 'record', 'handoff']) assert.match(js, new RegExp(`\\b${v}: \\(d\\)`), `board renders ${v}`);
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
  const handler = createMcpHandler(roomApi, { records: new MemoryRecordStore() });
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

// ---------- context across sessions, hints, handoff, narration ----------

async function serve(handler: ReturnType<typeof createMcpHandler>) {
  const srv = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const u = new URL(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/mcp`);
  const client = async (household: string) => {
    const c = new Client({ name: 't', version: '1' }, { capabilities: { elicitation: { form: {} } } });
    c.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'accept', content: { confirm: true } }));
    await c.connect(new StreamableHTTPClientTransport(u, { requestInit: { headers: { 'x-household-id': household } } }));
    return c;
  };
  const stop = async () => { await handler.close(); srv.closeAllConnections(); await new Promise((r) => srv.close(r)); };
  return { client, stop };
}

test('the detective record and an unfinished case survive a server restart', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'accomplice-')), 'records.json');

  // night one: solve a case, start another, ask two questions, then everyone goes to bed
  const night1 = await serve(createMcpHandler(() => night1Game, { records: new JsonFileRecordStore(file) }));
  const night1Game = createFakeGameApi({ stepMs: 5 });
  let c = await night1.client('the-smiths');
  await c.callTool({ name: 'start_case', arguments: {} });
  await c.callTool({ name: 'question_suspect', arguments: { suspect: 'cook', question: 'Where were you?' } });
  await c.callTool({ name: 'accuse', arguments: { culprit: 'gardener', item: 'candlestick' } });
  await c.callTool({ name: 'start_case', arguments: { tone: 'cozy' } });
  await c.callTool({ name: 'question_suspect', arguments: { suspect: 'Pip', question: 'Where were you at three?' } });
  await c.callTool({ name: 'question_suspect', arguments: { suspect: 'Pip', question: 'Did you see anything?' } });
  await c.close();
  await night1.stop();

  // night two: a new server process, a new game engine with no memory, the same records file
  const night2Game = createFakeGameApi({ stepMs: 5 });
  const night2 = await serve(createMcpHandler(() => night2Game, { records: new JsonFileRecordStore(file) }));
  c = await night2.client('the-smiths');
  const rec = await c.callTool({ name: 'my_detective_record', arguments: {} });
  assert.equal(sc(rec).view, 'record');
  assert.equal(sc(rec).record.solved, 1);
  assert.equal(sc(rec).record.casesStarted, 2);
  assert.equal(sc(rec).record.favouriteSuspect.name, 'Pip Hollow');
  assert.match(sc(rec).speech, /Vanishing Birthday Cake is still open/);

  const resumed = await c.callTool({ name: 'resume_case', arguments: {} });
  assert.equal(sc(resumed).view, 'case');
  assert.equal(sc(resumed).resumed, true);
  assert.match(sc(resumed).case.title, /Birthday Cake/);
  assert.match(sc(resumed).speech, /You had asked 2 questions, mostly of Pip Hollow/);

  // another household sees none of it
  const other = await night2.client('the-joneses');
  const empty = await other.callTool({ name: 'my_detective_record', arguments: {} });
  assert.match(sc(empty).speech, /No cases on your record yet/);
  await c.close(); await other.close();
  await night2.stop();
});

test('hints give one deduction step and wait until the players act on it', async () => {
  const game = createFakeGameApi({ stepMs: 5 });
  const s = await serve(createMcpHandler(() => game, { records: new MemoryRecordStore() }));
  const c = await s.client('hints');
  await c.callTool({ name: 'start_case', arguments: {} });
  const h1 = await c.callTool({ name: 'get_hint', arguments: {} });
  const h2 = await c.callTool({ name: 'get_hint', arguments: {} });
  assert.equal(sc(h1).limited, false);
  assert.equal(sc(h2).limited, true, 'a second hint with no move in between repeats the first');
  assert.equal(sc(h2).hint.text, sc(h1).hint.text);
  assert.match(sc(h2).speech, /^One step at a time/);
  await c.callTool({ name: 'question_suspect', arguments: { suspect: 'cook', question: 'Where were you at nine?' } });
  const h3 = await c.callTool({ name: 'get_hint', arguments: {} });
  assert.equal(sc(h3).limited, false);
  assert.notEqual(sc(h3).hint.text, sc(h1).hint.text);
  for (const h of [h1, h3]) assert.ok(sc(h).hint.text.split(/[.?!]\s/).length <= 2, 'one short step');
  await c.close();
  await s.stop();
});

test('send_to_tv hands the case to the Fire TV, and the narrator voice rides along', async () => {
  const { client } = await connect('hh-tv');
  await client.callTool({ name: 'start_case', arguments: {} });
  const r = await client.callTool({ name: 'send_to_tv', arguments: {} });
  assert.equal(sc(r).view, 'handoff');
  assert.equal(sc(r).roomCode, 'MRLW');
  assert.match(sc(r).tvUrl, /^http:\/\/127\.0\.0\.1:\d+\/tv\/\?room=MRLW$/);
  assert.match(sc(r).speech, /enter the code M R L W/);
  assert.match(sc(r).narrationUrl, /\/audio\/narrator-\d+\.mp3$/, 'narrator audio for spoken lines');
  const ask = await client.callTool({ name: 'question_suspect', arguments: { suspect: 'cook', question: 'Where were you?' } });
  assert.equal(sc(ask).narrationUrl, undefined, 'suspects speak in their own voice, not the narrator');
  await client.close();
});

test('the case of the week uses the same seed for every household', async () => {
  const { weekSeed, isoWeek } = await import('../src/records.ts');
  assert.match(isoWeek(new Date(2026, 9, 23)), /^2026-W43$/);
  assert.equal(weekSeed('2026-W43'), weekSeed('2026-W43'));
  assert.notEqual(weekSeed('2026-W43'), weekSeed('2026-W44'));
  const { client } = await connect('hh-weekly');
  const r = await client.callTool({ name: 'start_case', arguments: { weekly: true } });
  assert.match(sc(r).speech, /^The case of the week/);
  const rec = await client.callTool({ name: 'my_detective_record', arguments: {} });
  assert.equal(sc(rec).record.caseOfTheWeek.week, isoWeek());
  await client.close();
});

test('ships an open-format SKILL.md that covers every tool and the safety rules', async () => {
  const { readFile } = await import('node:fs/promises');
  const md = await readFile(new URL('../skill/accomplice/SKILL.md', import.meta.url), 'utf8');
  const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'has YAML frontmatter');
  assert.match(fm![1]!, /^name: accomplice$/m, 'name matches the folder');
  assert.match(fm![1]!, /^description: .{40,1024}$/m);
  const { client } = await connect('hh-skill');
  const { tools } = await client.listTools();
  for (const t of tools) assert.ok(md.includes(`\`${t.name}\``), `SKILL.md explains ${t.name}`);
  assert.match(md, /Never reveal the solution/);
  assert.match(md, /Always confirm an accusation/);
  assert.doesNotMatch(md, /\u2014/, 'no em dashes');
  const res = await client.readResource({ uri: 'accomplice://skill/SKILL.md' });
  assert.equal((res.contents[0] as { text: string }).text, md, 'served as an MCP resource too');
  await client.close();
});

test('the room adapter uses the server hint and narrator when they exist', async () => {
  const { fromRoomApi } = await import('../src/index.ts');
  const pub = { id: 'c', tone: 'classic' as const, title: 'T', place: 'P', dateLine: 'D', intro: 'I', victim: { name: 'V', description: '' },
    crime: { room: 'lib', slot: 0, what: 'was struck down' }, rooms: [{ id: 'lib', name: 'Library' }], slots: [{ id: 0, label: '9:00 pm' }],
    suspects: [{ id: 'cook', name: 'Ada', role: 'the cook', motive: 'm' }], items: [] };
  const calls: string[] = [];
  const roomApi = {
    createRoom: () => ({ code: 'ABCD', joinUrl: '' }), listRooms: () => [{ code: 'ABCD', phase: 'investigate', players: 0 }],
    startCase: async () => pub, listSuspects: () => [], ask: async () => ({ text: '', speaker: '', speakerName: '' }),
    examineClue: () => ({ id: 'x', kind: 'physical' as const, title: 'X', text: '', round: 1 }),
    board: () => ({ clues: [{ id: 'x', kind: 'physical' as const, title: 'X', text: '', round: 1 }], round: 1, phase: 'investigate' }),
    accuse: async () => ({ correct: true, culprit: { id: 'cook', name: 'Ada' }, item: 'pin', steps: [] }),
    state: () => ({ phase: 'investigate', round: 1, case: pub }),
    hint: (code: string) => { calls.push(code); return { text: 'Check who was seen in the hall at nine.', clueId: 'x', hintsLeft: 2 }; },
    narrate: async (t: string) => ({ audioUrl: `/audio/n-${t.length}.mp3`, captionChunks: [] }),
  };
  const g = fromRoomApi(roomApi)('den');
  const h = await g.hint();
  assert.deepEqual(calls, ['ABCD']);
  assert.equal(h.text, 'Check who was seen in the hall at nine.');
  assert.equal(h.hintsLeft, 2);
  assert.deepEqual(await g.narrate!('hello'), { audioUrl: '/audio/n-5.mp3' });
});
