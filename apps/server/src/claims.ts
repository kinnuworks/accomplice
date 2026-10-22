// Deterministic claim extraction: no model call, runs in well under a millisecond per sentence.
// Turns a spoken line into location claims (who, which room, which time) using the case's own names,
// so the engine's checkReply can vet every sentence before it is voiced.
// It deliberately errs towards finding claims: a false alarm costs a retry, a miss could leak a secret.
import type { Claim, PublicCase } from '@accomplice/protocol';

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const GENERIC_ROOM_WORDS = new Set(['the', 'room', 'great', 'old', 'main', 'small', 'little', 'upper', 'lower', 'east', 'west', 'north', 'south', 'front', 'back', 'of', 'and', 'car']);
const TITLE_WORDS = new Set(['mr', 'mrs', 'miss', 'ms', 'dr', 'the', 'lady', 'lord', 'sir', 'colonel', 'auntie', 'uncle', 'cousin', 'great', 'magnificent', 'old']);
const NEGATION = /\b(not|never|nowhere|nobody|no one|neither|nor|nothing|none|no sign|no idea)\b|n't\b/i;
const PREP = '(?:at|around|about|by|till|until|since|from|before|after|near|nearly|past|towards|toward|to|gone|just after|just before|roughly)';

interface Matcher { re: RegExp; id: string | number; len: number }

export interface ExtractContext {
  pub: PublicCase;
  speakerId: string;
  /** Time slots mentioned in the question; a reply without its own time is read against them. */
  questionSlots?: number[];
}

interface Prepared { rooms: Matcher[]; people: Matcher[]; slots: Matcher[]; phrases: Matcher[] }
const cache = new WeakMap<PublicCase, Prepared>();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function prepare(pub: PublicCase): Prepared {
  const hit = cache.get(pub);
  if (hit) return hit;
  const rooms: Matcher[] = [];
  for (const r of pub.rooms) {
    const full = r.name.replace(/^the\s+/i, '');
    rooms.push({ re: new RegExp(`\\b${esc(full)}\\b`, 'i'), id: r.id, len: full.length });
    const words = full.split(/\s+/).filter((w) => w.length > 2 && !GENERIC_ROOM_WORDS.has(w.toLowerCase()));
    for (const w of words) if (words.length > 1 || w.toLowerCase() !== full.toLowerCase()) rooms.push({ re: new RegExp(`\\b${esc(w)}\\b`, 'i'), id: r.id, len: w.length });
  }
  const people: Matcher[] = [];
  for (const s of pub.suspects) {
    const parts = s.name.replace(/\./g, '').split(/\s+/).filter((p) => p.length > 2 && !TITLE_WORDS.has(p.toLowerCase()));
    people.push({ re: new RegExp(`\\b${esc(s.name.replace(/\./g, '\\.?'))}\\b`, 'i'), id: s.id, len: s.name.length });
    for (const p of parts) people.push({ re: new RegExp(`\\b${esc(p)}\\b`, 'i'), id: s.id, len: p.length });
    const role = s.role.replace(/^the\s+/i, '');
    if (role) people.push({ re: new RegExp(`\\bthe ${esc(role)}\\b`, 'i'), id: s.id, len: role.length + 4 });
  }
  // Titles alone ("the Colonel", "the doctor") when only one suspect carries them.
  for (const t of ['colonel', 'doctor', 'dr', 'lady', 'lord', 'miss', 'mrs', 'mr']) {
    const owners = pub.suspects.filter((s) => new RegExp(`^(the )?${t}\\b`, 'i').test(s.name) || (t === 'doctor' && /^dr\b/i.test(s.name)));
    if (owners.length === 1 && t.length > 3) people.push({ re: new RegExp(`\\bthe ${t}\\b`, 'i'), id: owners[0].id, len: t.length + 4 });
  }
  const slots: Matcher[] = [];
  for (const sl of pub.slots) {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(sl.label);
    if (!m) { slots.push({ re: new RegExp(`\\b${esc(sl.label)}\\b`, 'i'), id: sl.id, len: sl.label.length }); continue; }
    const h = Number(m[1]); const min = Number(m[2] ?? 0); const w = HOUR_WORDS[h % 12 || 12] ?? String(h);
    const next = HOUR_WORDS[(h % 12) + 1] ?? String(h + 1);
    const alts: string[] = [`${h}[:.]${String(min).padStart(2, '0')}`];
    if (min === 0) {
      alts.push(`${h}\\s*(?:o'?clock|pm|p\\.m\\.|am)`, `${w}\\s*o'?clock`, `${PREP}\\s+${h}(?![:.\\d])(?!\\s*(?:thirty|fifteen|forty|o'))`, `${PREP}\\s+${w}(?!\\s*(?:thirty|fifteen|forty))(?![:.]\\d)`);
    } else if (min === 30) {
      alts.push(`half\\s+past\\s+(?:${h}|${w})`, `${w}[\\s-]+thirty`, `half\\s+${w}`, `${h}\\s*thirty`);
      void next;
    } else if (min === 15) {
      alts.push(`quarter\\s+past\\s+(?:${h}|${w})`, `${w}[\\s-]+fifteen`);
    } else if (min === 45) {
      alts.push(`quarter\\s+to\\s+(?:${h + 1}|${next})`, `${w}[\\s-]+forty[\\s-]*five`);
    }
    slots.push({ re: new RegExp(`\\b(?:${alts.join('|')})\\b`, 'i'), id: sl.id, len: 4 });
  }
  // Loose evening phrases, mapped onto the case's own timeline.
  const last = pub.slots[pub.slots.length - 1]?.id ?? 0;
  const first = pub.slots[0]?.id ?? 0;
  const phrases: Matcher[] = [
    { re: /\b(before dinner|early (?:in the )?evening|start of the evening|when (?:we|the guests) arrived)\b/i, id: first, len: 1 },
    { re: /\b(after dinner|after the soup|over coffee|during dessert)\b/i, id: pub.slots[1]?.id ?? first, len: 1 },
    { re: /\b(end of the evening|late(?:r)? (?:that|in the) (?:night|evening)|last thing)\b/i, id: last, len: 1 },
  ];
  const p = { rooms, people, slots, phrases };
  cache.set(pub, p);
  return p;
}

function findAll(text: string, ms: Matcher[]): { id: string | number; start: number; end: number }[] {
  const hits: { id: string | number; start: number; end: number }[] = [];
  for (const m of ms) {
    const re = new RegExp(m.re.source, 'gi');
    let r: RegExpExecArray | null;
    while ((r = re.exec(text))) { hits.push({ id: m.id, start: r.index, end: r.index + r[0].length }); if (!r[0].length) re.lastIndex++; }
  }
  // Longest match wins where matches overlap ("Dining Room" over "Dining").
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const kept: typeof hits = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));

/** Slots named in a piece of text (used for the question as well as replies), in order of mention. */
export function slotsIn(text: string, pub: PublicCase): number[] {
  const p = prepare(pub);
  const hits = [...findAll(text, p.slots), ...findAll(text, p.phrases)];
  // "at eight and the kitchen at half past": a bare "half past" means half past the last hour named.
  const bare = /\bhalf past\b(?!\s+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))/gi;
  let m: RegExpExecArray | null;
  while ((m = bare.exec(text))) {
    const before = hits.filter((h) => h.end <= m!.index).sort((a, b) => b.end - a.end)[0];
    const label = before ? pub.slots.find((sl) => sl.id === before.id)?.label : undefined;
    const hm = label ? /^(\d{1,2}):00/.exec(label) : null;
    const half = hm ? pub.slots.find((sl) => sl.label.startsWith(`${hm[1]}:30`)) : undefined;
    if (half) hits.push({ id: half.id, start: m.index, end: m.index + m[0].length });
  }
  return uniq(hits.sort((a, b) => a.start - b.start).map((h) => h.id as number));
}

/**
 * Location claims in one sentence. `carry` keeps the last named person and time across sentences of the same reply.
 */
export function extractClaims(sentence: string, ctx: ExtractContext, carry: { lastOther?: string; lastSlots?: number[] } = {}): Claim[] {
  const p = prepare(ctx.pub);
  const claims: Claim[] = [];
  const sentenceSlots = slotsIn(sentence, ctx.pub);
  const contextSlots = sentenceSlots.length ? sentenceSlots : carry.lastSlots?.length ? carry.lastSlots : ctx.questionSlots ?? [];
  const clauses = sentence.split(/[,;]|:\s|\s+but\s+|\s+whereas\s+|\s+while\s+/i).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const people = uniq(findAll(clause, p.people).map((h) => h.id as string)).filter((id) => id !== ctx.speakerId);
    if (people.length) carry.lastOther = people[people.length - 1];
    if (NEGATION.test(clause)) continue;
    const rooms = uniq(findAll(clause, p.rooms).map((h) => h.id as string));
    if (!rooms.length) continue;
    const own = slotsIn(clause, ctx.pub);
    const slots = own.length ? own : contextSlots;
    if (!slots.length) continue;
    // Who is placed there?
    const firstPerson = /\b(I|I'm|I'd|me|my|myself|we|us)\b/.test(clause);
    const pronoun = /\b(he|she|they|him|her|them|his)\b/i.test(clause);
    const sawVerb = /\b(saw|seen|spotted|noticed|watched|heard|glimpsed|caught)\b/i.test(clause);
    let who: string[] = [];
    if (people.length && sawVerb) who = people;
    else if (people.length && firstPerson) who = [ctx.speakerId, ...people];
    else if (people.length) who = people;
    else if (pronoun && !firstPerson && carry.lastOther) who = [carry.lastOther];
    else if (pronoun && firstPerson && carry.lastOther) who = [ctx.speakerId, carry.lastOther];
    else who = [ctx.speakerId];
    // Pair rooms and times in order when the counts match ("the study at eight, then the hall at nine").
    const pairs: [string, number][] = [];
    if (rooms.length > 1 && rooms.length === slots.length) rooms.forEach((r, i) => pairs.push([r, slots[i]]));
    else for (const r of rooms) for (const s of slots) pairs.push([r, s]);
    for (const s of who) for (const [room, slot] of pairs) claims.push({ kind: 'location', s, room, slot });
  }
  if (sentenceSlots.length) carry.lastSlots = sentenceSlots;
  return dedupe(claims);
}

function dedupe(cs: Claim[]): Claim[] {
  const seen = new Set<string>();
  return cs.filter((c) => { const k = `${c.s}|${c.room}|${c.slot}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Never confess, whatever the engine says about locations. */
export function confesses(sentence: string): boolean {
  const deed = '(?:did it|killed|murdered|poisoned|struck|stole|took (?:it|the)|ate (?:it|the))';
  return new RegExp(`\\b(I ${deed}|I confess(?: that)?,? I ${deed}|I confess(?: to (?:it|the (?:murder|theft|crime)))|it was me|I'm guilty|I am guilty|(?:I'm|I am) the one who ${deed})\\b`, 'i').test(sentence)
    && !/\b(not|never|didn't|did not|wasn't)\b/i.test(sentence);
}
