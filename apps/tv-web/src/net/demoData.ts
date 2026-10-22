// The demo game data. Prefers the shared fixture (packages/protocol/fixtures/demo-case.json) so the TV and
// phone demos tell the same story; falls back to the built-in Ashby Hall case until that file exists.
import type { Player, ProofStep } from '@accomplice/protocol';
import * as local from './demoCase';
import type { BoardClue, TvCase } from './types';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const found = import.meta.glob('../../../../packages/protocol/fixtures/demo-case.json', { eager: true, import: 'default' }) as Record<string, Any>;
const fx: Any | null = Object.values(found)[0] ?? null;

export interface DemoLine { round: 1 | 2 | 3; asker: string; suspect: string; q: string; a: string }
export interface DemoData {
  source: 'fixture' | 'builtin';
  case: TvCase;
  players: Player[];
  steps: ProofStep[];
  culprit: string;
  item: string;
  accomplice: string | null;
  accompliceLine: string;
  scores: Record<string, number>;
  lines: DemoLine[];
  cluesByRound: Record<1 | 2 | 3, string[]>;
}

function builtin(): DemoData {
  return {
    source: 'builtin', case: local.DEMO_CASE, players: local.DEMO_PLAYERS, steps: local.DEMO_STEPS,
    culprit: 'doctor', item: 'draught', accomplice: 'p4', accompliceLine: local.DEMO_ACCOMPLICE_LINE,
    scores: local.DEMO_SCORES, lines: local.DEMO_LINES, cluesByRound: local.DEMO_CLUES_BY_ROUND,
  };
}

// Lines for the shared fixture's suspects (the fixture carries the case, not a script).
const FIXTURE_LINES: Record<string, { q: string; a: string }[]> = {
  cook: [{ q: 'Where were you at half past nine?', a: 'In my kitchen, where I always am. Ask the soup. The soup knows everything.' },
    { q: 'Did you like Lady Constance?', a: 'I liked her the way you like a burnt souffle. Politely, and from a distance.' }],
  nephew: [{ q: 'Why were you cut from the will?', a: 'A small misunderstanding about a racehorse. And a car. And another racehorse.' }],
  doctor: [{ q: 'Did you see anyone near the kitchen?', a: 'I was in the study with the Colonel, arguing about toast. Medically, he was wrong.' }],
  colonel: [{ q: 'What were you doing at eight?', a: 'Rearranging place cards. A tactical manoeuvre. Nothing romantic about it whatsoever.' }],
  magician: [{ q: 'Where were you at half past nine?', a: 'A magician never reveals his whereabouts. But if pressed, the Great Hall. Ta da.' }],
};

function fromFixture(f: Any): DemoData {
  const b = builtin();
  const c: Any = f.publicCase ?? f.case ?? f;
  const toClue = (x: Any): BoardClue => ({ id: x.id, kind: x.kind, title: x.title, text: x.text, short: x.short, round: x.round ?? 1, key: x.key });
  const boardClues: BoardClue[] = (f.boardClues ?? c.clues ?? []).map(toClue);
  const privateClues: BoardClue[] = Object.values((f.privateCluesBySeat ?? {}) as Record<string, Any[]>).flat().map(toClue);
  const suspects = (c.suspects ?? []).map((s: Any) => ({ ...s, claimedAlibi: s.claimedAlibi ?? s.alibi }));
  const tvCase: TvCase = {
    id: c.id, tone: c.tone ?? f.tone ?? 'classic', title: c.title, place: c.place, dateLine: c.dateLine, intro: c.intro ?? '',
    scene: c.scene, victim: c.victim, crime: { room: c.crime.room, slot: c.crime.slot, what: c.crime.what },
    rooms: c.rooms, slots: c.slots, suspects, items: c.items ?? [],
    // private clues ride along so the reveal can show them; only revealed ids go on the board
    clues: [...boardClues, ...privateClues.filter((p) => !boardClues.some((x) => x.id === p.id))],
    briefing: c.briefing ?? f.briefing,
  };
  const players: Player[] = f.players ?? b.players;
  const culprit = f.culprit ?? f.reveal?.culprit ?? c.truth?.culprit ?? suspects[0].id;
  const steps: ProofStep[] = f.proofChain ?? f.reveal?.steps ?? f.steps
    ?? boardClues.filter((x) => x.key).map((x) => ({ clueId: x.id, says: x.text, therefore: x.short ?? x.title }));
  const cluesByRound = { 1: [] as string[], 2: [] as string[], 3: [] as string[] };
  boardClues.forEach((x) => cluesByRound[(x.round ?? 1) as 1 | 2 | 3].push(x.id));
  let lines: DemoLine[] = f.lines ?? f.demoLines;
  if (!lines) {
    const pool = suspects.flatMap((s: Any) => (FIXTURE_LINES[s.id] ?? [{ q: 'Where were you when it happened?', a: 'Minding my own business, which is more than I can say for some people here.' }]).map((l) => ({ ...l, suspect: s.id })));
    lines = pool.slice(0, 6).map((l: Any, i: number) => ({ round: (Math.floor(i / 2) + 1) as 1 | 2 | 3, asker: players[i % players.length].id, suspect: l.suspect, q: l.q, a: l.a }));
  }
  const accSeat = f.accomplicePlayerSeat;
  const accomplice = f.reveal?.accomplice ?? f.accomplice ?? (typeof accSeat === 'number' ? players.find((p) => p.seat === accSeat)?.id ?? null : null);
  return {
    source: 'fixture', case: tvCase, players, steps, culprit, item: f.item ?? f.reveal?.item ?? c.crime?.item ?? tvCase.items[0]?.id ?? '',
    accomplice, accompliceLine: f.reveal?.accompliceLine ?? f.accompliceLine ?? f.safeLies?.[0]?.text ?? b.accompliceLine,
    scores: f.reveal?.scores ?? f.scores ?? b.scores, lines, cluesByRound,
  };
}

let data: DemoData;
try { data = fx ? fromFixture(fx) : builtin(); } catch (e) { console.warn('Demo fixture could not be read, using the built-in case', e); data = builtin(); }
export const DEMO = data;
