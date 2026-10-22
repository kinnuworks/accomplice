// A pretend server so the phone can be played, tested and screenshotted alone.
// Open /p/?demo=1. Jump to a screen with &at=lobby|role|investigate|accuse|reveal|results
// and try the other side with &as=accomplice.

import type {
  ClientToServer,
  Clue,
  Player,
  PublicCase,
  RoomState,
  ServerToClient,
  Tone,
  Utterance,
  YouState,
} from '@accomplice/protocol';
import type { Transport, TransportHandlers } from './net';

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
  | 'notes'
  | 'accuse'
  | 'accuse-confirm'
  | 'accuse-locked'
  | 'reveal'
  | 'results';

const suspects = [
  { id: 'finch', name: 'Dorothy Finch', role: 'the cook', traits: ['brisk', 'proud'], voiceId: 'Amy', portrait: 'portraits/cook.webp', motive: 'Lord Pell was about to sell the house, and her kitchen with it.' },
  { id: 'hale', name: 'Colonel Reggie Hale', role: 'the old soldier', traits: ['booming', 'vague'], voiceId: 'Brian', portrait: 'portraits/colonel.webp', motive: 'Owed Lord Pell a small fortune from cards.' },
  { id: 'marchetti', name: 'Ivy Marchetti', role: 'the painter', traits: ['dramatic'], voiceId: 'Emma', portrait: 'portraits/artist.webp', motive: 'Was written out of the will last Tuesday.' },
  { id: 'orme', name: 'Dr Felix Orme', role: 'the family doctor', traits: ['careful'], voiceId: 'Arthur', portrait: 'portraits/doctor.webp', motive: 'Lord Pell knew about the missing prescriptions.' },
];

const demoCase: PublicCase = {
  id: 'demo-ashby-hall',
  tone: 'classic',
  title: 'The Last Toast at Ashby Hall',
  place: 'Ashby Hall',
  dateLine: 'A stormy Saturday, 1931',
  intro:
    'Lord Ambrose Pell raised his glass to an old friend at eight. By ten he was found slumped in the study, and the brass candlestick was nowhere to be seen.',
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
  suspects,
  items: [
    { id: 'candlestick', name: 'brass candlestick', homeRoom: 'library' },
    { id: 'scarf', name: 'silk scarf', homeRoom: 'conservatory' },
    { id: 'draught', name: 'sleeping draught', homeRoom: 'kitchen' },
  ],
};

const privateClueBank: Clue[] = [
  { id: 'p1', kind: 'document', title: 'A torn dance card', text: 'Ivy’s dance card has every slot filled until 9:30. Then nothing at all.', visibility: 'private', round: 1, fact: { k: 'notAt', s: 'marchetti', room: 'hall', slot: 3 } },
  { id: 'p2', kind: 'physical', title: 'Flour on the stair rail', text: 'A floury handprint on the library stair rail. Someone came straight from the kitchen.', visibility: 'private', round: 2, fact: { k: 'at', s: 'finch', room: 'library', slot: 2 } },
  { id: 'p3', kind: 'testimony', title: 'The gardener remembers', text: 'The gardener saw the Colonel asleep in the conservatory at half past nine, snoring like a foghorn.', visibility: 'private', round: 3, fact: { k: 'at', s: 'hale', room: 'conservatory', slot: 3 } },
];

const replies: Record<string, string[]> = {
  finch: ['I was in my kitchen, where I always am, minding a soufflé that minded nobody.', 'The library? I only went in to fetch his lordship’s cocoa tray. Twice.'],
  hale: ['Half past nine? Asleep, old chap. The conservatory chairs are wickedly comfortable.', 'I owed him money, not malice. There’s a difference, at sea at least.'],
  marchetti: ['Darling, I was painting the moon from the terrace. Everyone saw me. Everyone always sees me.', 'My dance card? I simply tired of the Colonel’s feet.'],
  orme: ['I was in the Great Hall checking on Mrs Finch’s burn. Doctor’s duty.', 'Prescriptions go missing in every big house. It means nothing.'],
};

export function demoParams() {
  const q = new URLSearchParams(location.search);
  return {
    at: (q.get('at') ?? 'join') as DemoAt,
    as: q.get('as') === 'accomplice' ? ('accomplice' as const) : ('detective' as const),
  };
}

export function createDemo(h: TransportHandlers): Transport {
  const { at, as } = demoParams();
  const ME = 'p-you';
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

  const bots: Player[] = [
    { id: 'p-marta', name: 'Marta', seat: 1, connected: true, avatar: '🌹', questionsLeft: 2 },
    { id: 'p-theo', name: 'Theo', seat: 2, connected: true, avatar: '🎩', questionsLeft: 2 },
    { id: 'p-priya', name: 'Priya', seat: 3, connected: false, avatar: '🔑', questionsLeft: 2 },
  ];

  let room: RoomState = {
    code: new URLSearchParams(location.search).get('room')?.toUpperCase() || 'MOTH',
    phase: 'lobby',
    round: 0,
    tone: 'classic',
    players: [],
    hostId: null,
    case: null,
    board: { revealed: [], pinned: [], links: [] },
    transcript: [],
    speaking: null,
    queue: [],
    votes: { count: 0, needed: 4 },
  };
  let you: YouState = { playerId: ME, role: null, privateClues: [], notes: '' };

  const emit = (m: ServerToClient) => later(0, () => h.onMessage(m));
  const pushRoom = () => emit({ t: 'room:state', state: structuredClone(room) });
  const pushYou = () => emit({ t: 'you:state', you: structuredClone(you) });
  const announce = (text: string) => emit({ t: 'announce', text });
  const say = (speaker: string, text: string, extra: Partial<Utterance> = {}) => {
    const s = suspects.find((x) => x.id === speaker);
    const u: Utterance = { id: `u${Date.now()}${Math.random()}`, speaker, speakerName: s?.name ?? 'Narrator', text, at: Date.now(), ...extra };
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
      you.knowsCulprit = 'finch';
      you.safeLies = [
        { text: 'Say you saw Dr Orme leave the study just before ten.', fact: { k: 'at', s: 'orme', room: 'study', slot: 4 } },
        { text: 'Say the candlestick was already gone from the library at eight.', fact: { k: 'itemIn', item: 'candlestick', room: 'kitchen', slot: 0 } },
      ];
    }
  };

  const goto = (phase: RoomState['phase'], round: RoomState['round'] = room.round) => {
    room.phase = phase;
    room.round = round;
    if (phase !== 'lobby') {
      room.case = demoCase;
      if (!you.role) giveRole();
    }
    if (phase === 'briefing') {
      room.case = demoCase;
      giveRole();
    }
    if (phase === 'investigate') {
      room.case = demoCase;
      if (!you.role) giveRole();
      room.players = room.players.map((p) => ({ ...p, questionsLeft: 2 }));
      const clue = privateClueBank[round - 1];
      if (clue && !you.privateClues.some((c) => c.id === clue.id)) you.privateClues = [...you.privateClues, clue];
      room.board.revealed = privateClueBank.slice(0, round).map((c) => `b${c.id}`);
    }
    if (phase === 'accuse') {
      room.players = room.players.map((p) => ({ ...p, questionsLeft: 0 }));
      room.votes = { count: 2, needed: room.players.length };
    }
    if (phase === 'reveal' || phase === 'results') {
      room.reveal = {
        culprit: 'finch',
        accomplice: 'p-theo',
        item: 'candlestick',
        steps: [
          { clueId: 'p2', says: 'Flour on the library stair rail at nine.', therefore: 'Mrs Finch left her kitchen and went to the library, where the candlestick lived.', eliminates: [] },
          { clueId: 'p3', says: 'The Colonel was asleep in the conservatory at half past nine.', therefore: 'The Colonel could not be in the study.', eliminates: ['hale'] },
          { clueId: 'p1', says: 'Ivy’s dance card ends at 9:30.', therefore: 'She left the hall, but the terrace lamp shows she was painting all along.', eliminates: ['marchetti'] },
        ],
        scores: { [ME]: as === 'accomplice' ? 4 : 7, 'p-marta': 5, 'p-theo': 3, 'p-priya': 2 },
      };
      if (!you.vote) you.vote = { culprit: 'finch', item: 'candlestick', accomplice: 'p-theo' };
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
  };

  // Jump straight to a scene
  const jump = (name: string, avatar: string) => {
    setMe(name, avatar);
    room.players = [...room.players.slice(0, 1), ...bots];
    switch (at) {
      case 'join':
      case 'lobby':
        room.players = room.players.slice(0, 3);
        goto('lobby');
        later(1800, () => {
          room.players = [...room.players, bots[2]];
          pushRoom();
          announce('Priya joined the party.');
        });
        break;
      case 'role':
      case 'role-peek':
        goto('briefing');
        break;
      case 'investigate':
      case 'listening':
      case 'review':
      case 'typed':
      case 'clues':
      case 'notes':
        you.privateClues = privateClueBank.slice(0, 1);
        you.notes = at === 'notes' ? 'Finch says kitchen all night. Flour on the library rail says otherwise.\nColonel: asleep? Check the conservatory.' : '';
        say('marchetti', replies.marchetti[0], { askedBy: 'p-marta', question: 'Where were you at nine?' });
        goto('investigate', 2);
        you.privateClues = privateClueBank.slice(0, 2);
        if (at === 'investigate') room.speaking = 'marchetti';
        room.players = room.players.map((p) => (p.id === ME ? { ...p, questionsLeft: 1 } : p));
        pushRoom();
        pushYou();
        break;
      case 'accuse':
      case 'accuse-confirm':
        goto('accuse', 3);
        break;
      case 'accuse-locked':
        you.vote = { culprit: 'finch', item: 'candlestick', accomplice: 'p-theo' };
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
    }
  };

  let joined = false;
  let asked = 0;

  const handle = (msg: ClientToServer | { t: 'demo:next' }) => {
    switch (msg.t) {
      case 'phone:join': {
        const avatar = (msg as { avatar?: string }).avatar ?? '🕯️';
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
        const me = room.players.find((p) => p.id === ME);
        if (!me || me.questionsLeft <= 0) {
          emit({ t: 'error', message: 'You have no questions left this round.' });
          return;
        }
        me.questionsLeft--;
        room.queue = [{ playerId: ME, suspectId: msg.suspectId }];
        pushRoom();
        const lines = replies[msg.suspectId] ?? ['I have nothing to say.'];
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
        else if (p === 'briefing') startRound(1);
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

  later(30, () => {
    h.onStatus('open');
    h.onOpen();
  });

  return {
    demo: true,
    send: (m) => later(60, () => handle(m as ClientToServer)),
    close: () => timers.forEach((t) => window.clearTimeout(t)),
  };
}
