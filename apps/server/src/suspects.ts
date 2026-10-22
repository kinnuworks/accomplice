// AI suspect replies. The prompt is built ONLY from the engine's sliceFor(); the full case never reaches the model.
// Pipeline (streaming): each sentence is checked the moment it is complete (deterministic claim extraction +
// engine.checkReply) and only then handed on to be voiced. A bad first sentence gets one retry, then a safe
// deflection; a bad later sentence is dropped. A model-based extractor re-audits finished replies in the
// background and logs to audit.jsonl without holding up playback.
import type { Case, Claim, PublicCase, Suspect, SuspectSlice } from '@accomplice/protocol';
import type { Engine } from './engine.js';
import { getModel, type TextModel } from './models.js';
import { audit, type AuditEntry } from './audit.js';
import { extractClaims as extractDeterministic, slotsIn, confesses } from './claims.js';
import { cfg } from './config.js';
import { log } from './log.js';

export interface ReplyResult {
  text: string;
  sentences: string[];
  final: 'first' | 'retry' | 'deflected';
  attempts: number;
  dropped: number;
  violations: string[];
  /** Location claims made in the sentences that were spoken (used to score hunch votes). */
  claims: Claim[];
  ms: { total: number; firstSentence: number; gen: number[]; extract: number[] };
}

export interface HistoryTurn { q: string; a: string }

const DEFLECTIONS = [
  'I have said all I intend to say on that, and I said it beautifully.',
  'Ask me something kinder, detective, and perhaps I will answer it.',
  'My memory is a delicate thing, and you are stepping on it.',
  'That is a question for someone with less dignity than me.',
  'I would rather keep that between me and my conscience, thank you.',
];

const hashStr = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Two deflection lines per suspect, fixed so they can be voiced ahead of time. */
export function deflectionsFor(suspectId: string): string[] {
  const h = hashStr(suspectId);
  return [DEFLECTIONS[h % DEFLECTIONS.length], DEFLECTIONS[(h + 2) % DEFLECTIONS.length]];
}

/** Short in-character sounds that cover the thinking pause. Pre-voiced at case start. */
export function fillersFor(s: Pick<Suspect, 'traits' | 'role' | 'id'>): string[] {
  const t = `${s.traits.join(' ')} ${s.role}`.toLowerCase();
  if (/boom|war|soldier|colonel|bluster|huff/.test(t)) return ['Hah!', 'Now then.', 'Hmm, hmm.'];
  if (/breezy|flirt|singer|glam|charm|dramatic|actress/.test(t)) return ['Darling, honestly.', 'Oh, sweetie.', 'Mm, well.'];
  if (/nervous|precise|anxious|doctor|over.?expl/.test(t)) return ['Ah. Well.', 'Let me think.', 'Hmm, yes.'];
  if (/sulk|sarcas|bored|teen|young/.test(t)) return ['Ugh.', 'Seriously?', 'Fine.'];
  if (/dry|proper|clipped|stern|house|butler/.test(t)) return ['Hmm.', 'Well.', 'If you insist.'];
  if (/cheer|scatter|sweet|gossip|chatty/.test(t)) return ['Ooh.', 'Oh my.', 'Well now.'];
  return ['Hmm.', 'Well...', 'Let me think.'];
}

export function buildSystemPrompt(slice: SuspectSlice): string {
  const s = slice.suspect;
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (nothing)');
  return [
    `You are ${s.name}, ${s.role}, a suspect in "${slice.setting.title}" at ${slice.setting.place}. ${slice.setting.dateLine}. ${slice.setting.victim}.`,
    `You are being questioned out loud in a party game; a voice actor speaks your words, so write only what you say aloud.`,
    `Personality: ${s.traits.join(', ')}. Your motive, which you would rather not discuss: ${s.motive}.`,
    '',
    'Rules:',
    '- Reply in 1 or 2 short sentences, under 35 words. Make the first sentence short. Spoken style. No stage directions, asterisks, emoji, lists or dashes.',
    '- Stay in your period and setting. You have never heard of anything modern, and you do not understand questions about machines or games; react in character.',
    '- Be witty and full of personality, and actually answer when you can. Use your own facts below; you may mention the time and room plainly.',
    '- Only state facts from WHAT YOU KNOW or YOUR STORY. If you do not know, say so in character. Never invent where anyone else was.',
    '- Keep YOUR STORY exactly, even under pressure. Never confess. Never reveal anything listed under NEVER REVEAL.',
    '',
    'WHAT YOU KNOW (true):',
    list(slice.knows),
    '',
    'YOUR STORY (what you insist on):',
    list(slice.mustLie),
    '',
    'NEVER REVEAL:',
    list(slice.mayNotReveal),
    '',
    'OTHER GUESTS:',
    list(slice.otherSuspects.map((o) => `${o.name}, ${o.role}`)),
  ].join('\n');
}

/** Clean one spoken sentence: strip stage directions, brackets, speaker labels and dashes. */
export function cleanSentence(text: string): string {
  return text.replace(/\*[^*]*\*?/g, '').replace(/\([^)]*\)?/g, '').replace(/[\u2014\u2013]/g, ', ')
    .replace(/^\s*["']|["']\s*$/g, '').replace(/^[A-Z][\w .']{0,30}:\s+/, '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/^[,\s]+/, '').trim();
}

/** Splits streamed text into sentences, never inside *actions* or (asides). */
export class SentenceSplitter {
  private buf = '';
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    for (;;) {
      let depthStar = 0; let depthParen = 0; let cut = -1;
      for (let i = 0; i < this.buf.length; i++) {
        const ch = this.buf[i];
        if (ch === '*') depthStar ^= 1;
        else if (ch === '(') depthParen++;
        else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
        else if (/[.!?]/.test(ch) && !depthStar && !depthParen) {
          let j = i + 1;
          while (j < this.buf.length && /[.!?"'\u201d)]/.test(this.buf[j])) j++;
          if (j < this.buf.length && /\s/.test(this.buf[j])) {
            // "Mr." / "Dr." / "Mrs." are not sentence ends.
            if (/\b(Mr|Mrs|Ms|Dr|St|Lt|Col)\.$/.test(this.buf.slice(0, j))) continue;
            cut = j; break;
          }
        }
      }
      if (cut < 0) break;
      out.push(this.buf.slice(0, cut));
      this.buf = this.buf.slice(cut).replace(/^\s+/, '');
    }
    return out;
  }
  flush(): string[] { const rest = this.buf.trim(); this.buf = ''; return rest ? [rest] : []; }
}

/** Turns a model call into an async stream of raw sentences. */
async function* sentencesFrom(model: TextModel, req: Parameters<TextModel['complete']>[0], signal: AbortSignal): AsyncGenerator<string> {
  const split = new SentenceSplitter();
  const ready: string[] = []; let finished = false; let failure: unknown = null; let wake: (() => void) | null = null;
  const poke = () => { const w = wake; wake = null; w?.(); };
  const run = model.stream
    ? model.stream(req, (d) => { ready.push(...split.push(d)); poke(); }, signal)
    : model.complete(req).then((t) => { ready.push(...split.push(t)); return t; });
  run.then(() => { ready.push(...split.flush()); }, (e) => { failure = e; }).finally(() => { finished = true; poke(); });
  for (;;) {
    if (ready.length) { yield ready.shift()!; continue; }
    if (finished) { if (failure && !signal.aborted) throw failure; return; }
    await new Promise<void>((r) => { wake = r; });
  }
}

// ---------- second pass audit (model based, off the critical path) ----------

async function modelClaims(model: TextModel, text: string, speakerId: string, pub: PublicCase): Promise<Claim[] | null> {
  const system = [
    'You extract location claims from one line of dialogue in a mystery game. Reply with JSON only.',
    `Speaker id: ${speakerId}. "I" and "me" mean the speaker.`,
    `People: ${pub.suspects.map((s) => `${s.id} = ${s.name}`).join('; ')}`,
    `Rooms: ${pub.rooms.map((r) => `${r.id} = ${r.name}`).join('; ')}`,
    `Times: ${pub.slots.map((s) => `${s.id} = ${s.label}`).join('; ')}`,
    'List every statement that places a person in a room at a time (approximate times map to the closest time). Skip negative statements.',
    'Format: {"claims":[{"s":"<person id>","room":"<room id>","slot":<time id number>}]}.',
  ].join('\n');
  try {
    const raw = await model.complete({ system, messages: [{ role: 'user', content: text }], json: true, tier: 'fast', maxTokens: 200 });
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const ids = new Set(pub.suspects.map((s) => s.id)); const rooms = new Set(pub.rooms.map((r) => r.id));
    return (Array.isArray(j.claims) ? j.claims : [])
      .filter((c: any) => ids.has(c.s) && rooms.has(c.room) && Number.isInteger(Number(c.slot)))
      .map((c: any) => ({ kind: 'location', s: c.s, room: c.room, slot: Number(c.slot) }));
  } catch (e) {
    log.warn('second pass audit failed', (e as Error)?.message);
    return null;
  }
}

// ---------- offline replies ----------

function firstPerson(fact: string): string {
  return fact.replace(/\bYou were\b/g, 'I was').replace(/\byou were\b/g, 'I was').replace(/\byou saw\b/g, 'I saw').replace(/\bYou saw\b/g, 'I saw').replace(/\byou\b/g, 'I');
}

export function mockReply(slice: SuspectSlice, question: string, pub: PublicCase, n: number): string {
  const traits = slice.suspect.traits.join(' ');
  const opener = /dry|proper|clipped/.test(traits) ? 'If you must know.' : /boom|war/.test(traits) ? 'Now see here!' : /breezy|flirt|cheer/.test(traits) ? 'Oh, darling.' : /nervous|precise/.test(traits) ? 'Ha, well, technically.' : /sulk|sarcas|dramatic/.test(traits) ? 'Wow, great question.' : 'Well now.';
  const qs = slotsIn(question, pub);
  const slot = pub.slots.find((s) => qs.includes(s.id));
  if (slot) {
    const lie = slice.mustLie.find((l) => l.includes(slot.label));
    if (lie) {
      // The first room named in a story line is the one to insist on.
      const claimed = pub.rooms.map((r) => ({ r, i: lie.indexOf(r.name) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
      if (claimed) return `${opener} At ${slot.label} I was in the ${claimed.r.name}, and I resent the implication.`;
      return `${opener} At ${slot.label}? I was exactly where I said I was.`;
    }
    const k = slice.knows.find((f) => f.includes(slot.label) && /\byou were\b|\bI was\b/i.test(f)) ?? slice.knows.find((f) => f.includes(slot.label));
    if (k) return `${opener} ${firstPerson(k)}`;
  }
  const facts = slice.knows.filter((f) => pub.slots.some((sl) => f.includes(sl.label)));
  if (facts.length && /where|when|see|saw|who/i.test(question)) return `${opener} ${firstPerson(facts[n % facts.length])}`;
  const quips = [
    'I am an open book, detective, just one with a few pages glued together.',
    'I was minding my own business, which is more than I can say for this household.',
    'Ask me about the evening and I shall tell you, ask me about my feelings and I shall leave.',
  ];
  return `${opener} ${quips[n % quips.length]}`;
}

// ---------- pipeline ----------

let mockCounter = 0;

export async function suspectReply(args: {
  engine: Engine; c: Case; pub: PublicCase; suspectId: string; question: string; history: HistoryTurn[]; room: string; model?: TextModel;
  /** Called with each sentence as soon as it has passed the check, in order. */
  onSentence?: (text: string, index: number) => void;
  /** Question in English without the asker prefix, used to read times the reply leaves implicit. */
  rawQuestion?: string;
}): Promise<ReplyResult> {
  const { engine, c, pub, suspectId, question, history, room } = args;
  const model = args.model ?? getModel();
  const t0 = Date.now();
  const slice = engine.sliceFor(c, suspectId);
  const system = buildSystemPrompt(slice);
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const h of history.slice(-6)) { messages.push({ role: 'user', content: h.q }, { role: 'assistant', content: h.a }); }
  const ms: ReplyResult['ms'] = { total: 0, firstSentence: 0, gen: [], extract: [] };
  const attempts: AuditEntry['attempts'] = [];
  const accepted: string[] = [];
  const spokenClaims: Claim[] = [];
  const questionSlots = slotsIn(args.rawQuestion ?? question, pub);
  let final: ReplyResult['final'] = 'deflected';
  let dropped = 0;
  const emit = (text: string) => {
    if (!accepted.length) ms.firstSentence = Date.now() - t0;
    accepted.push(text);
    args.onSentence?.(text, accepted.length - 1);
  };

  for (let attempt = 0; attempt < 2 && !accepted.length; attempt++) {
    const g0 = Date.now();
    const ctrl = new AbortController();
    const extra = attempt === 0 ? '' : `\n\nYour last answer slipped: it did not match your facts or story (${attempts.filter((a) => !a.ok).flatMap((a) => a.violations).join('; ')}). Answer again, sticking strictly to WHAT YOU KNOW and YOUR STORY, or deflect with charm.`;
    const req = { system: system + extra, messages: [...messages, { role: 'user' as const, content: question }], maxTokens: 160 };
    const src: AsyncGenerator<string> = model.kind === 'mock'
      ? (async function* () { const sp = new SentenceSplitter(); yield* [...sp.push(mockReply(slice, args.rawQuestion ?? question, pub, mockCounter++)), ...sp.flush()]; })()
      : sentencesFrom(model, req, ctrl.signal);
    const carry: { lastOther?: string; lastSlots?: number[] } = {};
    let firstFailed = false;
    try {
      for await (const raw of src) {
        const said = cleanSentence(raw);
        if (!said || !/[\p{L}\p{N}]/u.test(said)) continue;
        const e0 = Date.now();
        const claims = extractDeterministic(said, { pub, speakerId: suspectId, questionSlots }, carry);
        const check = engine.checkReply(c, suspectId, claims);
        const violations = [...check.violations, ...(confesses(said) ? ['confession'] : [])];
        ms.extract.push(Date.now() - e0);
        attempts.push({ text: said, claims, ok: violations.length === 0, violations });
        if (violations.length) {
          if (!accepted.length) firstFailed = true; else dropped++;
          break;
        }
        spokenClaims.push(...claims);
        emit(said);
        if (accepted.length >= 2) break;
      }
    } catch (e) {
      log.warn(`model call failed for ${suspectId}: ${(e as Error)?.message}`);
    } finally {
      ctrl.abort();
      ms.gen.push(Date.now() - g0);
    }
    if (accepted.length) final = attempt === 0 ? 'first' : 'retry';
    if (!firstFailed) break; // nothing to retry: a model error or an empty answer
  }
  if (!accepted.length) {
    const lines = deflectionsFor(suspectId);
    emit(lines[Math.floor(Math.random() * lines.length)]);
    final = 'deflected';
  }
  ms.total = Date.now() - t0;
  const text = accepted.join(' ');
  const entry: AuditEntry = { at: Date.now(), room, caseId: c.id, suspect: suspectId, provider: model.kind, engine: engine.source, question, attempts, final, dropped, ms: { total: ms.total, gen: ms.gen, extract: ms.extract, firstSentence: ms.firstSentence } };
  // Background second opinion: a model extractor reads the finished reply. It never blocks playback; if it finds a
  // claim the engine rejects, that is a real leak and is counted as one.
  if (cfg.secondPassAudit && model.kind !== 'mock' && final !== 'deflected') {
    void modelClaims(model, text, suspectId, pub).then((claims) => {
      if (claims) { const chk = engine.checkReply(c, suspectId, claims); entry.secondPass = { claims, ok: chk.ok, violations: chk.violations }; }
      return audit(entry);
    });
  } else void audit(entry);
  return { text, sentences: accepted, final, attempts: attempts.length, dropped, violations: attempts.flatMap((a) => a.violations), claims: spokenClaims, ms };
}
