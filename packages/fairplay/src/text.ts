// Turning facts into words: plain descriptions for the UI, and flavoured clue cards.
import type { Case, Clue, Fact, Tone } from '@accomplice/protocol';
import { BICKER_TOPICS, EMPTY_ROOM_SIGNS } from './content.js';
import { pick, type Rng } from './rng.js';

export interface Names {
  suspect: (id: string) => string;
  /** short name for tight spaces: "Dr Sen", "Freddie" */
  short: (id: string) => string;
  room: (id: string) => string;
  item: (id: string) => string;
  slot: (n: number) => string;
}

export function namesOf(c: Pick<Case, 'suspects' | 'rooms' | 'items' | 'slots'>): Names {
  const s = new Map(c.suspects.map((x) => [x.id, x.name]));
  const sh = new Map(c.suspects.map((x) => [x.id, x.shortName ?? x.name]));
  const r = new Map(c.rooms.map((x) => [x.id, x.name]));
  const i = new Map(c.items.map((x) => [x.id, x.name]));
  return {
    suspect: (id) => s.get(id) ?? id,
    short: (id) => sh.get(id) ?? s.get(id) ?? id,
    room: (id) => r.get(id) ?? id,
    item: (id) => i.get(id) ?? id,
    slot: (n) => c.slots[n]?.label ?? `slot ${n}`,
  };
}

/** One plain sentence for a fact, for captions, the board, and screen readers. */
export function describeFact(c: Pick<Case, 'suspects' | 'rooms' | 'items' | 'slots'>, f: Fact): string {
  const N = namesOf(c);
  switch (f.k) {
    case 'at': return `${N.suspect(f.s)} was in the ${N.room(f.room)} at ${N.slot(f.slot)}.`;
    case 'notAt': return `${N.suspect(f.s)} was not in the ${N.room(f.room)} at ${N.slot(f.slot)}.`;
    case 'saw': return `${N.suspect(f.a)} and ${N.suspect(f.b)} were together in the ${N.room(f.room)} at ${N.slot(f.slot)}.`;
    case 'had': return `${N.suspect(f.s)} had the ${N.item(f.item)} at ${N.slot(f.slot)}.`;
    case 'itemIn': return `The ${N.item(f.item)} was in the ${N.room(f.room)} at ${N.slot(f.slot)}.`;
  }
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? `{${k}}`);

export interface Truthy {
  /** who else was in a room at a slot (true story), used to pick witnesses */
  occupants: (room: string, slot: number) => string[];
  /** true when nobody at all was in the room at that slot */
  empty: (room: string, slot: number) => boolean;
}

type Card = Pick<Clue, 'kind' | 'title' | 'text' | 'short'>;

export const wordCount = (x: string) => x.trim().split(/\s+/).filter(Boolean).length;

/** First candidate with 12 words or fewer; otherwise a compact fallback. */
function shortLine(cands: string[], fallback: string): string {
  const ok = cands.find((x) => wordCount(x) <= 12) ?? fallback;
  const words = ok.trim().split(/\s+/);
  const line = words.length <= 12 ? ok : words.slice(0, 12).join(' ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Flavoured clue card for a fact. Witnesses are chosen only from people who were really there. */
export function phraseClue(c: Case, f: Fact, r: Rng, tone: Tone, truth: Truthy, forBoard: boolean): Card {
  const N = namesOf(c);
  const T = (n: number) => N.slot(n);
  switch (f.k) {
    case 'at': {
      const S = N.suspect(f.s), s = N.short(f.s), R = N.room(f.room), time = T(f.slot);
      const compact = `${s}: ${R}, ${time}`;
      const witnesses = truth.occupants(f.room, f.slot).filter((x) => x !== f.s);
      if (witnesses.length && !forBoard) {
        const wid = pick(r, witnesses);
        const W = N.suspect(wid), w = N.short(wid);
        const tpl = pick(r, [
          '"{S}? In the {R} at {T}, with me. Talked my ear off the whole time," says {W}.',
          '{W} remembers sharing the {R} with {S} at {T}, and would rather not discuss the conversation.',
          '{W} says {S} spent {T} in the {R}, humming the same four notes over and over.',
        ]);
        return { kind: 'testimony', title: `${W}'s account`, text: fill(tpl, { S, R, T: time, W }),
          short: shortLine([`${w} puts ${s} in the ${R} at ${time}`, `${w}: ${s} in the ${R}, ${time}`], compact) };
      }
      const opts: [Clue['kind'], string, string, string][] = [
        ['document', 'A photograph', 'A photograph taken in the {R} at {T} shows {S}, caught mid sneeze.', 'Photo: {s} mid sneeze in the {R}, {T}'],
        ['document', 'The visitors\' book', 'The {R} visitors\' book, in a loopy hand: "{S}, {T}. Lovely room. Bit draughty."', '{s} signed the {R} visitors\' book at {T}'],
        ['document', 'The dusting rota', 'The {R} was dusted at {T}. The maid\'s note reads: "{S} sat in the way the entire time."', 'Maid\'s note: {s} in the way in the {R}, {T}'],
        ['document', 'A scribbled note', 'A note in {S}\'s handwriting: "In the {R} at {T}. Do not disturb unless there is cake."', '{s}\'s own note: in the {R} at {T}'],
      ];
      const [kind, title, tpl, sh] = pick(r, opts);
      const v = { S, s, R, T: time };
      return { kind, title, text: fill(tpl, v), short: shortLine([fill(sh, v)], compact) };
    }
    case 'notAt': {
      const S = N.suspect(f.s), s = N.short(f.s), R = N.room(f.room), time = T(f.slot);
      const compact = `No ${s} in the ${R} at ${time}`;
      const witnesses = truth.occupants(f.room, f.slot).filter((x) => x !== f.s);
      if (witnesses.length) {
        const wid = pick(r, witnesses);
        const W = N.suspect(wid), w = N.short(wid);
        return { kind: 'testimony', title: `${W} keeps watch`, text: fill(pick(r, [
          '{W} was in the {R} all through {T} and swears {S} never set foot in it.',
          '"The {R} at {T}? I was there. {S} was not. I would have noticed," says {W}.',
        ]), { S, R, T: time, W }), short: shortLine([`${w} swears: no ${s} in the ${R} at ${time}`], compact) };
      }
      if (!truth.empty(f.room, f.slot)) {
        return { kind: 'physical', title: 'Footprints', text: fill('The {R} carpet was freshly brushed just before {T}. Whoever walked on it at {T} left prints, and not one print is {S}\'s.', { S, R, T: time }),
          short: shortLine([`Fresh prints in the ${R} at ${time}. None are ${s}'s`, `No ${s} prints in the ${R}, ${time}`], compact) };
      }
      return { kind: 'physical', title: 'An empty room', text: fill(pick(r, [
        'Nobody was in the {R} at {T}: {E}. So {S} was not there either.',
        'At {T} the {R} stood empty: {E}. Wherever {S} was, it was not there.',
      ]), { S, R, T: time, E: pick(r, EMPTY_ROOM_SIGNS) }), short: shortLine([`The ${R} stood empty at ${time}. No ${s}`], compact) };
    }
    case 'saw': {
      const A = N.suspect(f.a), B = N.suspect(f.b), a = N.short(f.a), b = N.short(f.b), R = N.room(f.room), time = T(f.slot);
      const topic = pick(r, BICKER_TOPICS[tone]);
      const opts: [Clue['kind'], string, string, string][] = [
        ['testimony', 'Overheard', '{A} and {B} were heard in the {R} at {T}, arguing about {X}.', '{a} and {b} bickering in the {R}, {T}'],
        ['document', 'A photograph', 'A photograph from {T}: {A} and {B} in the {R}, both pretending not to notice the camera.', 'Photo: {a} and {b} in the {R}, {T}'],
        ['testimony', 'A pair of alibis', 'At {T}, {A} and {B} were in the {R} together, debating {X}. Neither will admit who won.', '{a} and {b}, together in the {R} at {T}'],
      ];
      const [kind, title, tpl, sh] = pick(r, opts);
      const v = { A, B, a, b, R, T: time, X: topic };
      return { kind, title, text: fill(tpl, v), short: shortLine([fill(sh, v)], `${a} and ${b}: ${R}, ${time}`) };
    }
    case 'itemIn': {
      const I = N.item(f.item), R = N.room(f.room), time = T(f.slot);
      const home = c.items.find((x) => x.id === f.item)?.homeRoom === f.room;
      const compact = `${I}: ${R}, ${time}`;
      if (home) {
        return { kind: 'physical', title: `The ${I}`, text: fill(pick(r, [
          'At {T} the {I} was right where it belongs, in the {R}. Someone remembers dusting round it.',
          'A photograph of the {R} taken at {T} shows the {I} in its usual spot, minding its own business.',
          'The {R} was tidied at {T}. The {I} was there, exactly where it always is.',
        ]), { I, R, T: time }), short: shortLine([`The ${I}, still in the ${R} at ${time}`], compact) };
      }
      return { kind: 'physical', title: `The ${I} wanders`, text: fill(pick(r, [
        'At {T} the {I} turned up in the {R}, where it has no business being.',
        'Someone spotted the {I} in the {R} at {T}. It does not usually travel.',
      ]), { I, R, T: time }), short: shortLine([`The ${I} turns up in the ${R}, ${time}`], compact) };
    }
    case 'had': {
      const S = N.suspect(f.s), s = N.short(f.s), I = N.item(f.item), time = T(f.slot);
      return { kind: 'testimony', title: 'Caught holding it', text: `${S} was seen holding the ${I} at ${time}.`,
        short: shortLine([`${s} seen holding the ${I} at ${time}`], `${s}: ${I}, ${time}`) };
    }
  }
}

export function embarrassmentClue(c: Case, sid: string, trueRoom: string, claimed: string, slot: number, activity: string, r: Rng): Card {
  const N = namesOf(c);
  const S = N.suspect(sid), s = N.short(sid);
  const v = { S, s, C: N.room(claimed), R: N.room(trueRoom), T: N.slot(slot), A: activity };
  const tpl = pick(r, [
    '{S} claims to have been in the {C} at {T}. Not so: {s} was in the {R}, caught {A}. Mortifying, yes. Criminal, no.',
    'At {T}, {S} was in the {R}, {A}. Which explains all that insisting on the {C}.',
    'Fresh evidence: at {T} {S} was in the {R}, {A}. Not the {C}, whatever {s} may say.',
  ]);
  return { kind: 'testimony', title: `${s}'s little secret`, text: fill(tpl, v),
    short: shortLine([fill('{s} fibbed about {T}: really in the {R}', v)], fill('{s}: {R}, {T}', v)) };
}

export function alibiBreakerClue(c: Case, sid: string, claimed: string, slot: number, witnesses: string[], r: Rng): Card {
  const N = namesOf(c);
  const S = N.suspect(sid), s = N.short(sid), R = N.room(claimed), time = N.slot(slot);
  const short = shortLine([`${s} claims the ${R} at ${time}. Nobody saw ${s}`, `No sign of ${s} in the ${R} at ${time}`], `No ${s} in the ${R}, ${time}`);
  if (witnesses.length) {
    const W = N.suspect(pick(r, witnesses));
    return { kind: 'testimony', title: 'An alibi wobbles', text: `${S} claims to have been in the ${R} at ${time}. ${W} was in the ${R} the whole time and never saw ${s}.`, short };
  }
  return { kind: 'physical', title: 'An alibi wobbles', text: `${S} claims to have spent ${time} in the ${R}. But at ${time} nobody was in the ${R}: ${pick(r, EMPTY_ROOM_SIGNS)}.`, short };
}
