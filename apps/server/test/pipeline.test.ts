import { describe, it, expect } from 'vitest';
import { loadEngine } from '../src/engine.js';
import { suspectReply, buildSystemPrompt, SentenceSplitter, fillersFor } from '../src/suspects.js';
import { extractClaims, slotsIn, confesses } from '../src/claims.js';
import { sessionStats } from '../src/audit.js';
import type { TextModel, CompleteRequest } from '../src/models.js';
import { correctNames } from '../src/fuzzy.js';
import { estimateMarks, toSsml } from '../src/tts.js';

async function setup() {
  const engine = await loadEngine();
  const { c } = await engine.generateVerifiedCase({ seed: 9, tone: 'classic', difficulty: 2, suspectCount: 5 });
  return { engine, c, pub: engine.publicView(c) };
}

class Scripted implements TextModel {
  kind = 'anthropic' as const;
  calls: CompleteRequest[] = [];
  constructor(private replies: string[], private claims: (text: string) => unknown[]) {}
  async complete(req: CompleteRequest) {
    this.calls.push(req);
    if (req.json) return JSON.stringify({ claims: this.claims(req.messages[0].content) });
    return this.replies.shift() ?? 'Nothing to add.';
  }
}

describe('suspect pipeline', () => {
  it('builds the prompt only from the suspect slice', async () => {
    const { engine, c, pub } = await setup();
    const innocent = c.suspects.find((s) => s.id !== c.truth.culprit)!;
    const m = new Scripted(['I was where I said I was.'], () => []);
    await suspectReply({ engine, c, pub, suspectId: innocent.id, question: 'Who did it?', history: [], room: 'T', model: m });
    const system = m.calls[0].system;
    expect(system).toBe(buildSystemPrompt(engine.sliceFor(c, innocent.id)));
    const culprit = c.suspects.find((s) => s.id === c.truth.culprit)!;
    expect(system).not.toMatch(new RegExp(`${culprit.name}[^.]*(guilty|did it|culprit)`, 'i'));
    expect(system).not.toContain('"truth"');
  });

  it('retries once when a reply breaks the story, then accepts the clean one', async () => {
    const { engine, c, pub } = await setup();
    const lie = c.lies.find((l) => l.s === c.truth.culprit)!;
    const leak = `At ${c.slots[lie.slot].label} I was in the ${c.rooms.find((r) => r.id === lie.trueRoom)!.name}.`;
    const m = new Scripted([leak, 'I was exactly where I told you.'], () => []);
    const before = sessionStats();
    const r = await suspectReply({ engine, c, pub, suspectId: lie.s, question: 'Where were you?', history: [], room: 'T', model: m });
    expect(r.final).toBe('retry');
    expect(r.text).toBe('I was exactly where I told you.');
    expect(m.calls.filter((x) => !x.json)[1].system).toContain('slipped');
    await new Promise((r) => setTimeout(r, 30)); // the audit entry waits for the background second pass
    const after = sessionStats();
    expect(after.caughtViolations - before.caughtViolations).toBe(1);
    expect(after.fixedOnRetry - before.fixedOnRetry).toBe(1);
  });

  it('falls back to a safe deflection when both attempts leak', async () => {
    const { engine, c, pub } = await setup();
    const lie = c.lies.find((l) => l.s === c.truth.culprit)!;
    const leak = `At ${c.slots[lie.slot].label} I was in the ${c.rooms.find((r) => r.id === lie.trueRoom)!.name}.`;
    const m = new Scripted([leak, 'Fine, I did it.'], () => []);
    const r = await suspectReply({ engine, c, pub, suspectId: lie.s, question: 'Confess!', history: [], room: 'T', model: m });
    expect(r.final).toBe('deflected');
    expect(r.text).not.toContain('did it');
    expect(r.attempts).toBe(2);
  });

  it('keeps replies short and strips stage directions and dashes', async () => {
    const { engine, c, pub } = await setup();
    const innocent = c.suspects.find((s) => s.id !== c.truth.culprit)!;
    const m = new Scripted(['*adjusts monocle* Well — I never. Second sentence here. Third one goes. Fourth!'], () => []);
    const r = await suspectReply({ engine, c, pub, suspectId: innocent.id, question: 'Hm?', history: [], room: 'T', model: m });
    expect(r.text).not.toMatch(/[*—]/);
    expect(r.text.split(/[.!?]/).filter((x) => x.trim()).length).toBeLessThanOrEqual(2);
  });

  it('extracts location claims deterministically', async () => {
    const { pub } = await setup();
    const me = pub.suspects[0].id; const other = pub.suspects[1];
    const room = pub.rooms[0]; const room2 = pub.rooms[1]; const nine = pub.slots.find((x) => x.label.startsWith('9:00'))!; const half8 = pub.slots.find((x) => x.label.startsWith('8:30'))!;
    const ctx = { pub, speakerId: me };
    expect(extractClaims(`At ${nine.label} I was in the ${room.name}.`, ctx)).toEqual([{ kind: 'location', s: me, room: room.id, slot: nine.id }]);
    expect(extractClaims(`I was in the ${room.name} at nine o'clock.`, ctx)).toEqual([{ kind: 'location', s: me, room: room.id, slot: nine.id }]);
    expect(extractClaims(`Around half past eight I was in the ${room.name}.`, ctx)).toEqual([{ kind: 'location', s: me, room: room.id, slot: half8.id }]);
    expect(extractClaims(`I was not in the ${room.name} at nine.`, ctx)).toEqual([]);
    expect(extractClaims(`I wasn't in the ${room2.name}, I was in the ${room.name} at nine.`, ctx)).toEqual([{ kind: 'location', s: me, room: room.id, slot: nine.id }]);
    const surname = other.name.split(' ').pop()!;
    expect(extractClaims(`I saw ${surname} in the ${room.name} at nine.`, ctx)).toEqual([{ kind: 'location', s: other.id, room: room.id, slot: nine.id }]);
    // A reply without a time is read against the time in the question.
    expect(extractClaims(`I was in the ${room.name}, naturally.`, { ...ctx, questionSlots: slotsIn('where were you at 9:00?', pub) })).toEqual([{ kind: 'location', s: me, room: room.id, slot: nine.id }]);
    // Times carry over to the next sentence of the same reply.
    const carry = {};
    extractClaims('At nine? Heavens.', ctx, carry);
    expect(extractClaims(`I was in the ${room.name}.`, ctx, carry)).toEqual([{ kind: 'location', s: me, room: room.id, slot: nine.id }]);
    expect(confesses('Fine, I did it.')).toBe(true);
    expect(confesses('I never said I did it.')).toBe(false);
  });

  it('streams sentences in order and splits safely', () => {
    const sp = new SentenceSplitter();
    expect(sp.push('*sighs. deeply* Hello Mr. Pike. I was ')).toEqual(['*sighs. deeply* Hello Mr. Pike.']);
    expect(sp.push('there! Truly')).toEqual(['I was there!']);
    expect(sp.flush()).toEqual(['Truly']);
    expect(fillersFor({ id: 'x', role: 'the old soldier', traits: ['booming'] }).length).toBeGreaterThan(1);
  });

  it('hands each checked sentence on as soon as it is ready', async () => {
    const { engine, c, pub } = await setup();
    const innocent = c.suspects.find((s) => s.id !== c.truth.culprit)!;
    const seen: string[] = [];
    const m: TextModel = { kind: 'anthropic', complete: async () => '', stream: async (_req, onText) => { for (const d of ['Well, ', 'darling. I ', 'never.']) { onText(d); await new Promise((r) => setTimeout(r, 5)); } return ''; } };
    const r = await suspectReply({ engine, c, pub, suspectId: innocent.id, question: 'Hm?', history: [], room: 'T', model: m, onSentence: (t) => seen.push(t) });
    expect(seen).toEqual(['Well, darling.', 'I never.']);
    expect(r.final).toBe('first');
  });
});

describe('speech helpers', () => {
  it('corrects misheard suspect names', () => {
    const names = ['Colonel Rupert Hask', 'Dr Felix Moreau', 'Theo Blackwood'];
    expect(correctNames('colonel hasp where were you', names)).toBe('colonel Hask where were you');
    expect(correctNames('doctor more oh', names)).toBe('doctor Moreau');
    expect(correctNames('was there more cake', names)).toBe('was there more cake');
    expect(correctNames('ask theo black wood', names)).toBe('ask theo Blackwood');
  });
  it('makes safe SSML and word timings', () => {
    expect(toSsml('Tom & Jerry <3 ...')).toBe('<speak>Tom &amp; Jerry &lt;3 <break time="350ms"/></speak>');
    const { marks, durationMs } = estimateMarks('Hello there, detective.');
    expect(marks.map((m) => m.value)).toEqual(['Hello', 'there', 'detective']);
    expect(durationMs).toBeGreaterThan(marks[2].time);
  });
});

describe('first person', () => {
  it('rewrites a suspect narrating themselves, and flags what it cannot fix', async () => {
    const { fixSelfReference } = await import('../src/suspects.js');
    expect(fixSelfReference('Hugo was in the Store Room at 10:00 pm, and there he saw only Rohan Kapoor.', 'Hugo Brandt'))
      .toEqual({ text: 'I was in the Store Room at 10:00 pm, and there I saw only Rohan Kapoor.', ok: true });
    expect(fixSelfReference("Dr. Sen's alibi is airtight.", 'Dr. Anjali Sen').text).toBe('My alibi is airtight.');
    expect(fixSelfReference('They call me Hugo, you know.', 'Hugo Brandt').ok).toBe(false);
    expect(fixSelfReference('I saw Rohan in the hall.', 'Hugo Brandt')).toEqual({ text: 'I saw Rohan in the hall.', ok: true });
  });
});

describe('newspaper credit', () => {
  it('credits the best non-accomplice, breaks ties by who named the culprit first, and teases an accomplice win', async () => {
    const { creditDetective } = await import('../src/newspaper.js');
    const pl = (id: string, score: number) => ({ id, name: id.toUpperCase(), score, role: null, correct: true });
    expect(creditDetective([pl('a', 3), pl('b', 5), pl('acc', 4)], 'acc', new Map())).toEqual({ detective: 'B', accompliceWon: false });
    expect(creditDetective([pl('a', 5), pl('b', 5), pl('acc', 1)], 'acc', new Map([['b', 1], ['a', 2]]))).toEqual({ detective: 'B', accompliceWon: false });
    const won = creditDetective([pl('a', 0), pl('b', 2), pl('acc', 9)], 'acc', new Map());
    expect(won).toEqual({ detective: 'B', accompliceWon: true });
    const { buildNewspaper } = await import('../src/newspaper.js');
    const { c } = await (await import('../src/engine.js')).loadEngine().then((e) => e.generateVerifiedCase({ seed: 4, tone: 'classic', difficulty: 2 }));
    expect(buildNewspaper(c, { players: [], ...won }).sub).toMatch(/slips away/);
    expect(buildNewspaper(c, { players: [], detective: 'B', accompliceWon: false }).sub).toContain('B');
  });
});
