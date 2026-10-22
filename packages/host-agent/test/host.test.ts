// The house host with a scripted model: real Strands agent loop, real MCP over HTTP, real game tools.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Model, type Message } from '@strands-agents/sdk';
import { createMcpHandler, createFakeGameApi, MemoryRecordStore } from '@accomplice/mcp-game';
import { createHostHandler, SYSTEM_PROMPT, speakable, type HostEvent } from '../src/index.ts';

type Step = { tool: string; input: Record<string, unknown> } | { text: string };
/** A model that follows a script: each turn is a list of steps, one per model call. */
class ScriptedModel extends Model<{ modelId?: string }> {
  seen: Message[][] = [];
  private turns: Map<string, (msgs: Message[]) => Step[]>;
  private n = 0;
  constructor(turns: Record<string, (msgs: Message[]) => Step[]>) { super(); this.turns = new Map(Object.entries(turns)); }
  updateConfig() {}
  getConfig() { return { modelId: 'scripted' }; }
  async *stream(messages: Message[]): AsyncIterable<any> {
    this.seen.push(structuredClone(messages));
    const lastUser = [...messages].reverse().find((m) => m.role === 'user' && m.content.some((c: any) => 'text' in c));
    const said = (lastUser?.content.find((c: any) => 'text' in c) as any)?.text as string;
    const steps = this.turns.get(said)?.(messages) ?? [{ text: 'Pardon?' }];
    // which step are we on: count tool results since that user message
    const idx = messages.length - 1 - messages.lastIndexOf(lastUser!);
    const step = steps[Math.min(Math.floor(idx / 2), steps.length - 1)]!;
    this.n++;
    yield { type: 'modelMessageStartEvent', role: 'assistant' };
    if ('tool' in step) {
      yield { type: 'modelContentBlockStartEvent', start: { type: 'toolUseStart', name: step.tool, toolUseId: `t${this.n}` } };
      yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'toolUseInputDelta', input: JSON.stringify(step.input) } };
      yield { type: 'modelContentBlockStopEvent' };
      yield { type: 'modelMessageStopEvent', stopReason: 'toolUse' };
    } else {
      yield { type: 'modelContentBlockStartEvent' };
      for (const w of step.text.match(/\S+\s*/g) ?? []) yield { type: 'modelContentBlockDeltaEvent', delta: { type: 'textDelta', text: w } };
      yield { type: 'modelContentBlockStopEvent' };
      yield { type: 'modelMessageStopEvent', stopReason: 'endTurn' };
    }
  }
}

const allText = (msgs: Message[]) => JSON.stringify(msgs);
const model = new ScriptedModel({
  'start a case': () => [{ tool: 'start_case', input: { tone: 'classic' } }, { text: 'A storm, a manor, and a body. Four suspects await.' }],
  'who was near the kitchen around nine?': () => [{ tool: 'question_suspect', input: { suspect: 'the cook', question: 'Where were you at nine?' } }, { text: 'The cook says she was in her kitchen when the pie timer rang.' }],
  'remind me what the cook said': (msgs) => [{ text: allText(msgs).includes('pie timer rang at nine') ? 'Mrs. Pike said she was in her kitchen at nine.' : 'I do not recall.' }],
  'I think it was the gardener with the candlestick, are we sure?': () => [{ tool: 'accuse', input: { culprit: 'the gardener', item: 'candlestick' } }, { text: 'Accuse Tom Bramble with the brass candlestick? This ends the case.' }],
  'yes, accuse': () => [{ tool: 'accuse', input: { culprit: 'the gardener', item: 'candlestick', confirmed: true } }, { text: 'Case closed. Well reasoned.' }],
});

const game = createFakeGameApi({ stepMs: 5 });
const mcp = createMcpHandler(() => game, { records: new MemoryRecordStore() });
const host = createHostHandler({ model: () => model });
const srv = createServer((req, res) => {
  if (req.url?.startsWith('/mcp')) return void mcp(req, res);
  if (req.url === '/api/host') return void host(req, res);
  res.writeHead(404).end();
});
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
after(async () => { await host.close(); await mcp.close(); srv.closeAllConnections(); await new Promise((r) => srv.close(r)); });

async function say(utterance: string, household = 'den'): Promise<HostEvent[]> {
  const res = await fetch(`${base}/api/host`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utterance, household }) });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const raw = await res.text();
  return raw.split('\n\n').filter(Boolean).map((block) => JSON.parse(block.split('\n').find((l) => l.startsWith('data: '))!.slice(6)));
}
const of = <T extends HostEvent['type']>(evs: HostEvent[], t: T) => evs.filter((e) => e.type === t) as Extract<HostEvent, { type: T }>[];

test('the agent starts a case through the MCP start_case tool and streams speech', async () => {
  const evs = await say('start a case');
  assert.equal(evs[0]!.type, 'start');
  const [tool] = of(evs, 'tool');
  assert.equal(tool!.name, 'start_case');
  const [res] = of(evs, 'toolResult');
  assert.equal(res!.view, 'case', 'structured content for the board comes through');
  assert.match(String((res!.structuredContent as any).case.title), /Marlow House/);
  const done = of(evs, 'done')[0]!;
  assert.equal(done.text, 'A storm, a manor, and a body. Four suspects await.');
  assert.equal(done.toolCalls, 1);
  assert.ok(typeof done.firstTextMs === 'number');
});

test('free-form questions become question_suspect calls, and the host remembers answers', async () => {
  const evs = await say('who was near the kitchen around nine?');
  const [res] = of(evs, 'toolResult');
  assert.equal(res!.name, 'question_suspect');
  assert.deepEqual(res!.input, { suspect: 'the cook', question: 'Where were you at nine?' });
  assert.equal((res!.structuredContent as any).suspect.id, 'cook');
  assert.ok((res!.structuredContent as any).suspect.portraitUrl, 'portraits ride along');
  const memory = await say('remind me what the cook said');
  assert.equal(of(memory, 'tool').length, 0, 'answered from conversation memory, no tool call');
  assert.equal(of(memory, 'done')[0]!.text, 'Mrs. Pike said she was in her kitchen at nine.');
});

test('accusations go through the confirmation step before anything is committed', async () => {
  const ask = await say('I think it was the gardener with the candlestick, are we sure?');
  assert.equal(of(ask, 'toolResult')[0]!.view, 'confirm', 'the host has no elicitation, so the game asks for a spoken yes');
  assert.equal(game.accusations, 0);
  const yes = await say('yes, accuse');
  assert.equal(of(yes, 'toolResult')[0]!.view, 'verdict');
  assert.equal(game.accusations, 1);
});

test('each household gets its own conversation', async () => {
  const before = model.seen.length;
  await say('remind me what the cook said', 'another-home');
  const fresh = model.seen.at(-1)!;
  assert.equal(model.seen.length, before + 1);
  assert.equal(fresh.length, 1, 'a new household starts with an empty conversation');
});

test('bad requests are refused and the persona keeps speech clean', async () => {
  const res = await fetch(`${base}/api/host`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ utterance: '' }) });
  assert.equal(res.status, 400);
  assert.match(SYSTEM_PROMPT, /house host/);
  assert.match(SYSTEM_PROMPT, /Never reveal the solution/, 'the SKILL.md rules are in the prompt');
  assert.doesNotMatch(SYSTEM_PROMPT.slice(0, 3000), /—/);
  assert.equal(speakable('**Case closed** — well done'), 'Case closed, well done');
});
