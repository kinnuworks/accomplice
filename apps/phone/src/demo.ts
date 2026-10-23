// A pretend server so the phone can be played, tested and screenshotted alone.
// Open /p/?demo=1. Jump to a screen with &at=lobby|role|investigate|board|vote|accuse|reveal|results
// and try the other side with &as=accomplice. Add &footer=1 for the "Skip ahead" bar.
//
// It plays the SAME case as the TV demo when packages/protocol/fixtures/demo-case.json exists,
// and falls back to a built-in case until then.

import type {
  AccompliceLie,
  ClientToServer,
  Player,
  ProofStep,
  RoomState,
  ServerToClient,
  Tone,
  Utterance,
  YouState,
} from '@accomplice/protocol';
import type { Transport, TransportHandlers } from './net';
import { shortName, type CaseX, type ClueX, type SuspectX } from './types';

interface DemoProposal { id: string; by: string; byName: string; culprit: string; item?: string; agree: string[]; notYet: string[]; needed: number }

export type DemoAt =
  | 'join'
  | 'lobby'
  | 'role'
  | 'role-peek'
  | 'investigate'
  | 'listening'
  | 'review'
  | 'typed'
  | 'clues'
  | 'earbud'
  | 'notes'
  | 'board'
  | 'theory'
  | 'vote'
  | 'tutorial'
  | 'emergency'
  | 'free-question'
  | 'sabotage'
  | 'hunch'
  | 'audience'
  | 'heartbeat'
  | 'audience-lobby'
  | 'accuse'
  | 'accuse-confirm'
  | 'accuse-locked'
  | 'reveal'
  | 'results';

export interface DemoData {
  pub: CaseX;
  privateClues: ClueX[]; // one per round, in order
  boardClues: ClueX[];
  culprit: string;
  item: string;
  safeLies: AccompliceLie[];
  replies: Record<string, string[]>;
  steps: ProofStep[];
}

// ---------- Built-in fallback case ----------

const fallbackSuspects: SuspectX[] = [
  { id: 'finch', name: 'Dorothy Finch', shortName: 'Mrs Finch', role: 'the cook', traits: ['brisk', 'proud'], voiceId: 'Amy', portrait: 'portraits/cook.webp', motive: 'Lord Pell was about to sell the house, and her kitchen with it.', claimedAlibi: { 0: 'kitchen', 1: 'kitchen', 2: 'kitchen', 3: 'kitchen', 4: 'hall' } },
  { id: 'hale', name: 'Colonel Reggie Hale', shortName: 'the Colonel', role: 'the old soldier', traits: ['booming', 'vague'], voiceId: 'Brian', portrait: 'portraits/colonel.webp', motive: 'Owed Lord Pell a small fortune from cards.', claimedAlibi: { 0: 'hall', 1: 'library', 2: 'conservatory', 3: 'conservatory', 4: 'hall' } },
  { id: 'marchetti', name: 'Ivy Marchetti', shortName: 'Ivy', role: 'the painter', traits: ['dramatic'], voiceId: 'Emma', portrait: 'portraits/artist.webp', motive: 'Was written out of the will last Tuesday.', claimedAlibi: { 0: 'hall', 1: 'hall', 2: 'hall', 3: 'conservatory', 4: 'conservatory' } },
  { id: 'orme', name: 'Dr Felix Orme', shortName: 'Dr Orme', role: 'the family doctor', traits: ['careful'], voiceId: 'Arthur', portrait: 'portraits/doctor.webp', motive: 'Lord Pell knew about the missing prescriptions.', claimedAlibi: { 0: 'study', 1: 'hall', 2: 'hall', 3: 'hall', 4: 'study' } },
];

const fallback: DemoData = {
  pub: {
    id: 'demo-ashby-hall',
    tone: 'classic',
    title: 'The Last Toast at Ashby Hall',
    place: 'Ashby Hall',
    dateLine: 'A stormy Saturday, 1931',
    scene: 'scenes/ashby-hall.webp',
    intro:
      'Lord Ambrose Pell raised his glass to an old friend at eight. By ten he was found slumped in the study, and the brass candlestick was nowhere to be seen.',
    briefing: [
      'Ashby Hall, 1931. A storm, a dinner party, and a host with too many secrets.',
      'Lord Ambrose Pell was struck down in the Study at 9:30 pm.',
      'Four guests had reasons to want him quiet.',
      'Question them, compare your clues, and name who did it and with what.',
    ],
    victim: { name: 'Lord Ambrose Pell', description: 'Host, collector, and keeper of other people’s secrets.' },
    crime: { room: 'study', slot: 3, what: 'was struck down' },
    rooms: [
      { id: 'library', name: 'Library', x: 0, y: 0, w: 2, h: 2, adjacent: ['study', 'hall'] },
      { id: 'study', name: 'Study', x: 2, y: 0, w: 2, h: 2, adjacent: ['library', 'hall'] },
      { id: 'hall', name: 'Great Hall', x: 0, y: 2, w: 4, h: 1, adjacent: ['library', 'study', 'kitchen', 'conservatory'] },
      { id: 'kitchen', name: 'Kitchen', x: 0, y: 3, w: 2, h: 2, adjacent: ['hall'] },
      { id: 'conservatory', name: 'Conservatory', x: 2, y: 3, w: 2, h: 2, adjacent: ['hall'] },
    ],
    slots: [
      { id: 0, label: '8:00 pm' },
      { id: 1, label: '8:30 pm' },
      { id: 2, label: '9:00 pm' },
      { id: 3, label: '9:30 pm' },
      { id: 4, label: '10:00 pm' },
    ],
    suspects: fallbackSuspects as CaseX['suspects'],
    items: [
      { id: 'candlestick', name: 'brass candlestick', homeRoom: 'library' },
      { id: 'scarf', name: 'silk scarf', homeRoom: 'conservatory' },
      { id: 'draught', name: 'sleeping draught', homeRoom: 'kitchen' },
    ],
  },
  privateClues: [
    { id: 'p1', kind: 'document', title: 'A torn dance card', short: 'Ivy’s card stops at 9:30', text: 'Ivy’s dance card has every slot filled until 9:30. Then nothing at all.', visibility: 'private', round: 1, fact: { k: 'notAt', s: 'marchetti', room: 'hall', slot: 3 } },
    { id: 'p2', kind: 'physical', title: 'Flour on the stair rail', short: 'Floury hand in the library at 9', text: 'A floury handprint on the library stair rail, still fresh at nine. Someone came straight from the kitchen.', visibility: 'private', round: 2, fact: { k: 'at', s: 'finch', room: 'library', slot: 2 } },
    { id: 'p3', kind: 'testimony', title: 'The gardener remembers', short: 'Colonel asleep at 9:30', text: 'The gardener saw the Colonel asleep in the conservatory at half past nine, snoring like a foghorn.', visibility: 'private', round: 3, fact: { k: 'at', s: 'hale', room: 'conservatory', slot: 3 } },
  ],
  boardClues: [
    { id: 'b1', kind: 'physical', title: 'The empty candlestick hook', short: 'Candlestick gone from the library', text: 'The library hook where the brass candlestick hangs is empty. Dust says it went missing tonight.', visibility: 'board', round: 1, fact: { k: 'itemIn', item: 'candlestick', room: 'library', slot: 0 } },
    { id: 'b2', kind: 'document', title: 'The doctor’s visiting book', short: 'Dr Orme in the hall 8:30 to 9:30', text: 'Dr Orme signed the hall visiting book at 8:30 and again at 9:30, both times with the butler watching.', visibility: 'board', round: 2, fact: { k: 'at', s: 'orme', room: 'hall', slot: 3 } },
    { id: 'b3', kind: 'testimony', title: 'A scream at half past nine', short: 'A cry from the study at 9:30', text: 'Three guests heard a cry from the study at exactly half past nine, just as the clock struck.', visibility: 'board', round: 3, fact: { k: 'at', s: 'finch', room: 'study', slot: 3 } },
  ],
  culprit: 'finch',
  item: 'candlestick',
  safeLies: [
    { text: 'Say you saw Dr Orme leave the study just before ten.', fact: { k: 'at', s: 'orme', room: 'study', slot: 4 } },
    { text: 'Say the candlestick was already gone from the library at eight.', fact: { k: 'itemIn', item: 'candlestick', room: 'kitchen', slot: 0 } },
  ],
  replies: {
    finch: ['I was in my kitchen, where I always am, minding a soufflé that minded nobody.', 'The library? I only went in to fetch his lordship’s cocoa tray. Twice.'],
    hale: ['Half past nine? Asleep, old chap. The conservatory chairs are wickedly comfortable.', 'I owed him money, not malice. There’s a difference.'],
    marchetti: ['Darling, I was painting the moon from the terrace. Everyone saw me. Everyone always sees me.', 'My dance card? I simply tired of the Colonel’s feet.'],
    orme: ['I was in the Great Hall checking on Mrs Finch’s burn. Doctor’s duty.', 'Prescriptions go missing in every big house. It means nothing.'],
  },
  steps: [
    { clueId: 'p2', says: 'Flour on the library stair rail at nine.', therefore: 'Mrs Finch left her kitchen and went to the library, where the candlestick lived.', eliminates: [] },
    { clueId: 'p3', says: 'The Colonel was asleep in the conservatory at half past nine.', therefore: 'The Colonel could not be in the study.', eliminates: ['hale'] },
    { clueId: 'b2', says: 'Dr Orme signed the visiting book in the hall at 9:30.', therefore: 'The doctor was not in the study either.', eliminates: ['orme'] },
  ],
};

// ---------- Shared fixture ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function genericReplies(pub: any): Record<string, string[]> {
  const crimeRoom = pub.rooms?.find((r: any) => r.id === pub.crime?.room)?.name ?? 'that room';
  const out: Record<string, string[]> = {};
  for (const s of pub.suspects ?? []) {
    out[s.id] = [
      `The ${crimeRoom}? I was nowhere near it, and I resent the question.`,
      `${s.motive ?? 'Motives are for novels.'} That hardly makes me a killer.`,
      'Ask the others where they were. I have nothing to hide.',
    ];
  }
  return out;
}

function fromFixture(raw: any): DemoData | null {
  try {
    // Shape written by the case engine: { publicCase, boardClues, privateCluesBySeat, culprit, item, safeLies, proofChain }
    if (raw?.publicCase) {
      const pub = raw.publicCase;
      const seat0: ClueX[] = raw.privateCluesBySeat?.['0'] ?? raw.privateCluesBySeat?.[0] ?? [];
      return {
        pub,
        privateClues: [...seat0].sort((a, b) => a.round - b.round),
        boardClues: [...(raw.boardClues ?? [])].sort((a: ClueX, b: ClueX) => a.round - b.round),
        culprit: raw.culprit,
        item: raw.item,
        safeLies: raw.safeLies?.length ? raw.safeLies : fallback.safeLies,
        replies: genericReplies(pub),
        steps: raw.proofChain ?? [],
      };
    }
    // A full Case, as a fallback shape.
    const c = raw?.case ?? raw;
    if (!c?.suspects?.length || !c?.slots?.length) return null;
    const suspects: SuspectX[] = c.suspects.map((s: any) => {
      const { alibi, ...rest } = s;
      return { ...rest, claimedAlibi: s.claimedAlibi ?? alibi };
    });
    const clues: ClueX[] = c.clues ?? [];
    const byRound = (a: ClueX, b: ClueX) => a.round - b.round;
    const priv = clues.filter((x) => x.visibility === 'private').sort(byRound);
    const privateClues = [1, 2, 3]
      .map((r) => priv.find((x) => x.round === r && (x.holderPlayerSlot ?? 0) === 0) ?? priv.find((x) => x.round === r))
      .filter(Boolean) as ClueX[];
    const { truth: _t, clues: _c, lies: _l, seed: _s, difficulty: _d, ...rest } = c;
    void _t; void _c; void _l; void _s; void _d;
    const pub = { ...rest, crime: { room: c.crime.room, slot: c.crime.slot, what: c.crime.what }, suspects };
    return {
      pub,
      privateClues: privateClues.length ? privateClues : fallback.privateClues,
      boardClues: clues.filter((x) => x.visibility === 'board').sort(byRound),
      culprit: c.truth?.culprit ?? suspects[0].id,
      item: c.crime?.item ?? c.items?.[0]?.id,
      safeLies: fallback.safeLies,
      replies: genericReplies(pub),
      steps: [],
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Lazy: the fixture only loads in demo mode, and the build still works before the file exists.
const fixtureLoaders = import.meta.glob('../../../packages/protocol/fixtures/demo-case.json', { import: 'default' });

export async function loadDemoData(): Promise<DemoData> {
  const load = Object.values(fixtureLoaders)[0];
  if (!load) return fallback;
  try {
    return fromFixture(await load()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** The TV demo's table and ledger (apps/tv-web/src/net/demoCase.ts), so every screenshot shows the same evening. */
const DEMO_TABLE: Pick<Player, 'id' | 'name' | 'avatar'>[] = [
  { id: 'p-priya', name: 'Priya', avatar: 'fox' },
  { id: 'p-marcus', name: 'Marcus', avatar: 'owl' },
  { id: 'p-ana', name: 'Ana', avatar: 'cat' },
  { id: 'p-theo', name: 'Theo', avatar: 'hare' },
  { id: 'p-june', name: 'June', avatar: 'badger' },
];
const DEMO_SCORES: Record<string, number> = { Priya: 1250, Ana: 980, Marcus: 820, June: 610, Theo: 450 };

/** Who this phone is in the demo: Priya, or June (the TV demo's Accomplice) when showing the Accomplice's side. */
export function demoMe(as: 'detective' | 'accomplice' = demoParams().as): { name: string; avatar: string } {
  const p = DEMO_TABLE.find((x) => x.name === (as === 'accomplice' ? 'June' : 'Priya'))!;
  return { name: p.name, avatar: p.avatar };
}

/** The same front page the TV demo prints (apps/tv-web/src/screens/Reveal.tsx, defaultPaper). */
function tvFrontPage(D: DemoData, culprit: SuspectX | undefined) {
  const pub = D.pub as CaseX & { place: string; tone?: string; victim: { name: string }; crime: { what: string } };
  const town = pub.place.split(',')[0].replace(/^(The)\s+/i, '');
  const name = culprit ? shortName(culprit) : 'Culprit';
  return {
    paperName: `The ${town} Evening Post`,
    title: pub.tone === 'cozy' ? `${name} Caught With Cake` : `${name} Unmasked`,
    sub: `${pub.victim.name} ${pub.crime.what}. Amateur detectives crack the case in a single evening.`,
    date: pub.dateLine,
    players: [],
  };
}

export function demoParams() {
  const q = new URLSearchParams(location.search);
  return {
    at: (q.get('at') ?? 'join') as DemoAt,
    as: q.get('as') === 'accomplice' ? ('accomplice' as const) : ('detective' as const),
    footer: q.get('footer') === '1',
  };
}

// ---------- The pretend server ----------

export function createDemo(h: TransportHandlers): Transport {
  const { at, as } = demoParams();
  const ME = 'p-you';
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  let D: DemoData = fallback;

  // The same table as the TV demo (apps/tv-web/src/net/demoCase.ts): Priya, Marcus, Ana, Theo and June,
  // with June as the Accomplice. This phone is Priya, or June when showing the Accomplice's side.
  const me = demoMe(as);
  const bots: Player[] = DEMO_TABLE.filter((p) => p.name !== me.name).map((p, i) => ({ ...p, seat: i + 1, connected: true, questionsLeft: 2 }));
  const botId = (name: string) => bots.find((b) => b.name === name)?.id ?? ME;
  const ACCOMPLICE = as === 'accomplice' ? ME : botId('June');

  const room: RoomState = {
    code: new URLSearchParams(location.search).get('room')?.toUpperCase() || 'MOTH',
    phase: 'lobby',
    round: 0,
    tone: 'classic',
    players: [],
    hostId: null,
    case: null,
    board: { revealed: [], pinned: [], links: [], cards: [] },
    transcript: [],
    speaking: null,
    queue: [],
    votes: { count: 0, needed: 4 },
  };
  const you: YouState = { playerId: ME, role: null, privateClues: [], notes: '' };
  let proposal: DemoProposal | null = null;

  const emit = (m: ServerToClient) => later(0, () => h.onMessage(m));
  const pushRoom = () => emit({ t: 'room:state', state: structuredClone(room) });
  const pushYou = () => emit({ t: 'you:state', you: structuredClone(you) });
  const announce = (text: string) => emit({ t: 'announce', text });
  const sus = (id: string) => (D.pub.suspects as SuspectX[]).find((x) => x.id === id);
  const itemName = (id?: string) => D.pub.items.find((x) => x.id === id)?.name;
  const say = (speaker: string, text: string, extra: Partial<Utterance> = {}) => {
    const u: Utterance = { id: `u${Date.now()}${Math.random()}`, speaker, speakerName: sus(speaker)?.name ?? 'Narrator', text, at: Date.now(), ...extra };
    room.transcript = [...room.transcript, u].slice(-50);
    emit({ t: 'utterance', u });
  };

  const setMe = (name: string, avatar: string) => {
    const me: Player = { id: ME, name, seat: 0, connected: true, avatar, questionsLeft: 2 };
    room.players = [me, ...room.players.filter((p) => p.id !== ME)];
    room.hostId = ME;
  };

  const giveRole = () => {
    you.role = as;
    if (as === 'accomplice') {
      you.knowsCulprit = D.culprit;
      you.safeLies = D.safeLies;
    }
  };

  const revealBoard = (round: number) => {
    const shown = D.boardClues.filter((c) => c.round <= round);
    room.board.revealed = shown.map((c) => c.id);
    room.board.cards = shown;
    if (round >= 2 && shown.length >= 2) {
      room.board.pinned = shown.slice(0, 2).map((c) => c.id);
      room.board.lastVerdict = { theory: { culprit: D.pub.suspects[2]?.id ?? D.pub.suspects[0].id, item: D.item }, verdict: 'contradicted', at: Date.now() };
    }
  };

  const goto = (phase: RoomState['phase'], round: RoomState['round'] = room.round) => {
    room.phase = phase;
    room.round = round;
    if (phase !== 'lobby') {
      room.case = D.pub;
      if (!you.role) giveRole();
    }
    if (phase === 'investigate') {
      room.players = room.players.map((p) => ({ ...p, questionsLeft: 2 }));
      you.privateClues = D.privateClues.slice(0, round);
      revealBoard(round);
    }
    if (phase === 'accuse') {
      revealBoard(3);
      room.players = room.players.map((p) => ({ ...p, questionsLeft: 0 }));
      room.votes = { count: 2, needed: room.players.length };
    }
    if (phase === 'reveal' || phase === 'results') {
      room.reveal = {
        culprit: D.culprit,
        accomplice: ACCOMPLICE,
        item: D.item,
        steps: D.steps,
        // the TV demo's ledger, by name
        scores: Object.fromEntries(room.players.map((p) => [p.id, DEMO_SCORES[p.name] ?? 0])),
        accompliceCaught: true,
        newspaper: tvFrontPage(D, (D.pub.suspects as SuspectX[]).find((x) => x.id === D.culprit)),
      };
      if (!you.vote) you.vote = { culprit: D.culprit, item: D.item, accomplice: ACCOMPLICE };
    }
    pushRoom();
    pushYou();
  };

  const startRound = (round: 1 | 2 | 3) => {
    goto('investigate', round);
    later(300, () => {
      announce(`Round ${round} of 3. A new private clue is on your phone.`);
      emit({ t: 'sfx', name: 'cardFlip' });
    });
    if (round === 2) later(15000, () => room.phase === 'investigate' && !proposal && botProposes());
  };

  const sendProposal = () => {
    if (!proposal) return;
    const p = proposal;
    emit({ t: 'proposal', id: p.id, by: p.by, byName: p.byName, culprit: p.culprit, item: p.item, votes: { agree: [...p.agree], notYet: [...p.notYet] }, needed: p.needed, closesAt: Date.now() + 30000 });
  };
  const sendVotes = () => proposal && emit({ t: 'proposal:votes', id: proposal.id, agree: [...proposal.agree], notYet: [...proposal.notYet], needed: proposal.needed });

  const rule = (p: DemoProposal) => {
    const right = p.culprit === D.culprit && (!p.item || p.item === D.item);
    const verdict = right ? (room.round >= 3 ? 'follows' : 'possible') : 'contradicted';
    const s = sus(p.culprit);
    const explanation = right
      ? verdict === 'follows'
        ? `The clues on the board point to ${s?.name}. It follows.`
        : `Nothing on the board rules out ${s?.name}${p.item ? ` with the ${itemName(p.item)}` : ''}. Possible, but not proven yet.`
      : `That cannot be right. ${s?.name} could not have been in the ${D.pub.rooms.find((r) => r.id === D.pub.crime.room)?.name.toLowerCase()} at the time.`;
    room.board.lastVerdict = { theory: { culprit: p.culprit, item: p.item }, verdict, at: Date.now() };
    emit({ t: 'verdict', theory: { culprit: p.culprit, item: p.item }, verdict, explanation, proposalId: p.id });
    pushRoom();
    proposal = null;
  };

  const botProposes = () => {
    const other = D.pub.suspects.find((x) => x.id !== D.culprit) ?? D.pub.suspects[0];
    proposal = { id: `pr${Date.now()}`, by: botId('Marcus'), byName: 'Marcus', culprit: other.id, item: D.pub.items[1]?.id, agree: [botId('Marcus')], notYet: [], needed: 3 };
    sendProposal();
  };

  const house = { id: 'house' as const, name: 'Hobbs', role: 'the butler', portrait: 'portraits/butler.webp' };

  // Jump straight to a scene
  const jump = (name: string, avatar: string) => {
    setMe(name, avatar);
    room.players = [...room.players.slice(0, 1), ...bots];
    const firstSuspect = D.pub.suspects[2]?.id ?? D.pub.suspects[0].id;
    switch (at) {
      case 'join':
      case 'lobby':
        room.players = room.players.slice(0, 3);
        goto('lobby');
        later(1800, () => {
          room.players = [...room.players, bots[2]];
          pushRoom();
          announce(`${bots[2].name} joined the party.`);
        });
        break;
      case 'role':
      case 'role-peek':
        goto('briefing');
        break;
      case 'tutorial':
        room.case = D.pub;
        giveRole();
        room.house = house;
        goto('tutorial', 0);
        break;
      case 'audience-lobby':
        you.audience = true;
        room.audience = [{ id: ME, name, connected: true }];
        room.players = room.players.filter((p) => p.id !== ME);
        room.hostId = botId('Marcus');
        goto('lobby');
        break;
      case 'audience':
        you.audience = true;
        room.audience = [{ id: ME, name, connected: true }];
        room.players = room.players.filter((p) => p.id !== ME);
        goto('investigate', 2);
        later(50, () => {
          const last = room.transcript[room.transcript.length - 1];
          const sid = D.pub.suspects[1].id;
          say(sid, D.replies[sid]?.[0] ?? 'I was elsewhere.', { askedBy: botId('Theo'), question: 'Where were you at half past nine?' });
          room.hunch = { utteranceId: room.transcript[room.transcript.length - 1]?.id ?? last?.id ?? 'u', lying: 1, truth: 0, closesAt: Date.now() + 20000 };
          pushRoom();
        });
        break;
      case 'accuse':
      case 'accuse-confirm':
        goto('accuse', 3);
        break;
      case 'accuse-locked':
        you.vote = { culprit: D.culprit, item: D.item, accomplice: ACCOMPLICE };
        goto('accuse', 3);
        room.votes = { count: 3, needed: 4 };
        pushRoom();
        break;
      case 'reveal':
        goto('reveal', 3);
        break;
      case 'results':
        goto('results', 3);
        break;
      default: {
        // investigate and its sub-screens
        you.notes = at === 'notes' ? 'Cook says pantry all night. Who was near the kitchen at 9:30?\nColonel and the doctor: together at ten. Check the earlier times.' : '';
        say(firstSuspect, D.replies[firstSuspect]?.[0] ?? 'I was elsewhere.', { askedBy: botId('Marcus'), question: 'Where were you at nine?' });
        goto('investigate', 2);
        if (at === 'investigate') room.speaking = firstSuspect;
        room.players = room.players.map((p) => (p.id === ME ? { ...p, questionsLeft: 1 } : p));
        pushRoom();
        pushYou();
        if (at === 'vote') later(200, botProposes);
        later(150, () => emit({ t: 'event', kind: 'chime', text: "Ten o'clock. Round 2.", hour: 22 }));
        if (at === 'heartbeat') later(400, () => emit({ t: 'haptic', pattern: 'heartbeat' }));
        if (at === 'emergency' || at === 'free-question') {
          room.emergency = { stage: 'vote', closesAt: Date.now() + 30000, votes: { [D.pub.suspects[1].id]: 1 }, voters: [botId('Marcus')] };
          if (at === 'free-question') room.emergency = { ...room.emergency, stage: 'ask', suspectId: D.pub.suspects[1].id, askedBy: ME };
          pushRoom();
        }
        if (at === 'sabotage') {
          you.sabotage = { available: true, options: D.boardClues.filter((c) => c.round <= 2).map((c) => c.id) };
          pushYou();
        }
        if (at === 'hunch') {
          room.players = room.players.map((p) => (p.id === ME ? { ...p, questionsLeft: 0 } : p));
          const last = room.transcript[room.transcript.length - 1];
          room.hunch = { utteranceId: last.id, lying: 0, truth: 0, closesAt: Date.now() + 20000 };
          pushRoom();
        }
      }
    }
  };

  let joined = false;
  let asked = 0;

  const handle = (msg: ClientToServer | { t: 'demo:next' } | { t: 'phone:propose'; culprit: string; item?: string } | { t: 'phone:voteProposal'; proposalId: string; agree: boolean }) => {
    switch (msg.t) {
      case 'phone:join': {
        const avatar = msg.avatar ?? 'owl';
        if (!joined) {
          joined = true;
          jump(msg.name, avatar);
        } else {
          setMe(msg.name, avatar);
          pushRoom();
          pushYou();
        }
        break;
      }
      case 'phone:setTone':
        room.tone = msg.tone as Tone;
        pushRoom();
        break;
      case 'phone:start':
        emit({ t: 'sfx', name: 'start' });
        goto('briefing', 0);
        later(200, () => announce('The lights dim. Check your phone for your secret role.'));
        break;
      case 'phone:ask': {
        if (msg.suspectId === 'house') {
          you.tutorialQuestionUsed = true;
          pushYou();
          later(900, () => {
            room.speaking = 'house';
            const u: Utterance = { id: `u${Date.now()}`, speaker: 'house', speakerName: house.name, text: 'Very good, sir or madam. That is exactly how you ask. Now try it on the suspects.', at: Date.now(), askedBy: ME, question: msg.text };
            room.transcript = [...room.transcript, u];
            emit({ t: 'utterance', u });
            pushRoom();
          });
          later(3500, () => {
            room.speaking = null;
            pushRoom();
          });
          return;
        }
        if (room.emergency?.stage === 'ask' && room.emergency.askedBy === ME) {
          room.emergency = { ...room.emergency, stage: 'done' };
          later(900, () => {
            room.speaking = msg.suspectId;
            say(msg.suspectId, D.replies[msg.suspectId]?.[1] ?? 'Fine. One more answer, and then I want a lawyer.', { askedBy: ME, question: msg.text });
            pushRoom();
          });
          later(4000, () => {
            room.speaking = null;
            room.emergency = undefined;
            pushRoom();
          });
          pushRoom();
          return;
        }
        const me = room.players.find((p) => p.id === ME);
        if (!me || me.questionsLeft <= 0) {
          emit({ t: 'error', message: 'You have no questions left this round.' });
          return;
        }
        me.questionsLeft--;
        room.queue = [{ playerId: ME, suspectId: msg.suspectId }];
        pushRoom();
        const lines = D.replies[msg.suspectId] ?? ['I have nothing to say.'];
        const line = lines[asked++ % lines.length];
        later(900, () => {
          room.queue = [];
          room.speaking = msg.suspectId;
          say(msg.suspectId, line, { askedBy: ME, question: msg.text });
          pushRoom();
        });
        later(4200, () => {
          room.speaking = null;
          pushRoom();
          if (me.questionsLeft === 0) {
            later(1500, () => {
              if (room.round < 3) startRound((room.round + 1) as 2 | 3);
              else {
                goto('accuse');
                announce('Time to accuse. Make your choice on your phone.');
              }
            });
          }
        });
        break;
      }
      case 'phone:propose': {
        proposal = { id: `pr${Date.now()}`, by: ME, byName: room.players[0]?.name ?? 'You', culprit: msg.culprit, item: msg.item, agree: [ME], notYet: [], needed: 3 };
        sendProposal();
        later(1400, () => {
          if (!proposal) return;
          proposal.agree.push(botId('Marcus'), botId('Theo'));
          sendVotes();
          later(1400, () => proposal && rule(proposal));
        });
        break;
      }
      case 'phone:voteProposal': {
        if (!proposal || proposal.id !== msg.proposalId) return;
        (msg.agree ? proposal.agree : proposal.notYet).push(ME);
        sendVotes();
        later(1200, () => {
          if (!proposal) return;
          if (msg.agree) {
            proposal.agree.push(botId('Theo'));
            sendVotes();
            later(1400, () => proposal && rule(proposal));
          } else {
            announce('Not enough votes. The theory waits for now.');
            proposal = null;
          }
        });
        break;
      }
      case 'phone:emergencyVote': {
        if (!room.emergency) return;
        room.emergency.votes[msg.suspectId] = (room.emergency.votes[msg.suspectId] ?? 0) + 1;
        room.emergency.voters.push(ME);
        pushRoom();
        later(1500, () => {
          if (!room.emergency) return;
          room.emergency = { ...room.emergency, stage: 'ask', suspectId: msg.suspectId, askedBy: ME };
          pushRoom();
        });
        break;
      }
      case 'phone:sabotage': {
        room.board.smudged = [...(room.board.smudged ?? []), msg.clueId];
        you.sabotage = { available: false, options: [] };
        pushRoom();
        pushYou();
        emit({ t: 'event', kind: 'smudge', text: 'Someone has smudged a clue on the board. The ink has run.', clueId: msg.clueId });
        break;
      }
      case 'phone:objection': {
        you.objectionUsed = true;
        pushYou();
        const last = room.transcript.find((u) => u.id === msg.utteranceId);
        const name = last ? sus(last.speaker)?.name : 'The suspect';
        emit({ t: 'event', kind: 'objection', text: `Objection! ${name} goes pale. "Very well, I may have been mistaken about the time."`, by: ME, byName: room.players[0]?.name });
        break;
      }
      case 'phone:hunch': {
        const hn = room.hunch;
        if (!hn) return;
        if (msg.lying) hn.lying++;
        else hn.truth++;
        emit({ t: 'hunch', utteranceId: hn.utteranceId, lying: hn.lying + 1, truth: hn.truth });
        pushRoom();
        break;
      }
      case 'phone:moreTime':
        room.deadlineAt = (room.deadlineAt ?? Date.now()) + 120000;
        pushRoom();
        announce('Two more minutes on the clock.');
        break;
      case 'phone:notes':
        you.notes = msg.text;
        break;
      case 'phone:vote':
        you.vote = { culprit: msg.culprit, item: msg.item, accomplice: msg.accomplice };
        room.votes = { ...room.votes, count: Math.min(room.votes.needed, room.votes.count + 1) };
        pushYou();
        pushRoom();
        later(2500, () => {
          room.votes = { ...room.votes, count: room.votes.needed };
          goto('reveal');
          announce('All votes are in. Eyes on the TV.');
          later(7000, () => goto('results'));
        });
        break;
      case 'phone:readClues':
        // No narrator audio in demo, so the phone falls back to its own voice.
        break;
      case 'demo:next': {
        const p = room.phase;
        if (p === 'lobby') goto('briefing', 0);
        else if (p === 'briefing') {
          room.house = house;
          goto('tutorial', 0);
        } else if (p === 'tutorial') startRound(1);
        else if (p === 'investigate') room.round < 3 ? startRound((room.round + 1) as 2 | 3) : goto('accuse');
        else if (p === 'accuse') goto('reveal');
        else if (p === 'reveal') goto('results');
        break;
      }
      case 'ping':
        emit({ t: 'pong' });
        break;
    }
  };

  void loadDemoData().then((data) => {
    D = data;
    later(10, () => {
      h.onStatus('open');
      h.onOpen();
    });
  });

  return {
    demo: true,
    send: (m) => later(60, () => handle(m as ClientToServer)),
    close: () => timers.forEach((t) => window.clearTimeout(t)),
  };
}
