// A complete scripted case for demo mode, so every screen can be seen without the server.
import type { Player, ProofStep } from '@accomplice/protocol';
import type { BoardClue, TvCase } from './types';

export const DEMO_CASE: TvCase = {
  id: 'ashby-hall',
  scene: 'scenes/ashby-hall.webp',
  tone: 'classic',
  title: 'The Last Move at Ashby Hall',
  place: 'Ashby Hall, a draughty manor on the moor',
  dateLine: 'A stormy Saturday in October, 1928',
  intro:
    'The rain had not stopped for three days, and neither had the arguments. Sir Bartholomew Crane invited five guests to Ashby Hall to announce a new will. At nine o\'clock he went to the study for his nightly game of chess. He never made his last move. Somebody in this house knows why, and they are hoping you are not paying attention.',
  victim: { name: 'Sir Bartholomew Crane', description: 'Collector of clocks, grudges and other people\'s secrets.' },
  crime: { room: 'study', slot: 2, what: 'was found slumped over the chessboard' },
  rooms: [
    { id: 'library', name: 'Library', x: 0, y: 0, w: 4, h: 3, adjacent: ['study', 'hall'] },
    { id: 'study', name: 'Study', x: 4, y: 0, w: 3, h: 3, adjacent: ['library', 'conservatory', 'ballroom'] },
    { id: 'conservatory', name: 'Conservatory', x: 7, y: 0, w: 4, h: 3, adjacent: ['study', 'kitchen'] },
    { id: 'hall', name: 'Great Hall', x: 0, y: 3, w: 3, h: 3, adjacent: ['library', 'ballroom'] },
    { id: 'ballroom', name: 'Ballroom', x: 3, y: 3, w: 5, h: 3, adjacent: ['hall', 'study', 'kitchen'] },
    { id: 'kitchen', name: 'Kitchen', x: 8, y: 3, w: 3, h: 3, adjacent: ['ballroom', 'conservatory'] },
  ],
  slots: [
    { id: 0, label: '8:00 pm' }, { id: 1, label: '8:30 pm' }, { id: 2, label: '9:00 pm' }, { id: 3, label: '9:30 pm' }, { id: 4, label: '10:00 pm' },
  ],
  suspects: [
    { id: 'colonel', name: 'Colonel Rupert Ashby', role: 'the colonel', traits: ['booming', 'gruff'], voiceId: 'Brian', portrait: 'portraits/colonel.webp', motive: 'Lost the family silver to the victim at cards. Twice.', claimedAlibi: { 0: 'ballroom', 1: 'conservatory', 2: 'conservatory', 3: 'kitchen', 4: 'hall' } },
    { id: 'heiress', name: 'Lady Clementine Vane', role: 'the heiress', traits: ['airy', 'amused'], voiceId: 'Amy', portrait: 'portraits/heiress.webp', motive: 'Engaged to the victim. Briefly, and with regret.', claimedAlibi: { 0: 'hall', 1: 'ballroom', 2: 'ballroom', 3: 'ballroom', 4: 'library' } },
    { id: 'doctor', name: 'Dr Felix Amari', role: 'the doctor', traits: ['precise', 'dry'], voiceId: 'Arthur', portrait: 'portraits/doctor.webp', motive: 'Knew the will was changing on Monday.', claimedAlibi: { 0: 'library', 1: 'library', 2: 'library', 3: 'hall', 4: 'hall' } },
    { id: 'cook', name: 'Mrs Odile Pemberton', role: 'the cook', traits: ['brisk', 'warm'], voiceId: 'Emma', portrait: 'portraits/cook.webp', motive: 'Thirty years of souffles and not one thank you.', claimedAlibi: { 0: 'kitchen', 1: 'kitchen', 2: 'kitchen', 3: 'kitchen', 4: 'ballroom' } },
    { id: 'nephew', name: 'Toby Ashby', role: 'the nephew', traits: ['nervous', 'chatty'], voiceId: 'Joey', portrait: 'portraits/nephew.webp', motive: 'Inherits the hall, the debts and the draughts.', claimedAlibi: { 0: 'ballroom', 1: 'hall', 2: 'hall', 3: 'library', 4: 'library' } },
  ] as TvCase['suspects'],
  items: [
    { id: 'draught', name: 'the sleeping draught', homeRoom: 'library' },
    { id: 'candlestick', name: 'the brass candlestick', homeRoom: 'hall' },
    { id: 'opener', name: 'the letter opener', homeRoom: 'study' },
  ],
  clues: [
    { id: 'c1', kind: 'physical', round: 1, title: 'Muddy boot prints', text: 'Size eleven, fresh from the rain, crossing from the conservatory to the kitchen door around nine.' },
    { id: 'c2', kind: 'document', round: 1, title: 'A dance card', text: 'Lady Clementine danced every waltz from half past eight to half past nine. Her partners will not stop mentioning it.' },
    { id: 'c3', kind: 'testimony', round: 2, title: 'The scullery maid', text: 'Swears Mrs Pemberton never left the kitchen while the pudding set. Not even to gossip.' },
    { id: 'c4', kind: 'physical', round: 2, title: 'An empty vial', text: 'Found under the chess table. The label says one drop only, in a doctor\'s tidy hand.', key: true },
    { id: 'c5', kind: 'document', round: 3, title: 'The hall clock log', text: 'Toby wound the great clock at nine sharp, as he does every night, and grumbled about it, as he does every night.' },
    { id: 'c6', kind: 'physical', round: 3, title: 'A library chair', text: 'Still warm at ten, though nobody admits to sitting in it after half past eight.' },
  ],
};

export const DEMO_PLAYERS: Player[] = [
  { id: 'p1', name: 'Priya', seat: 0, connected: true, avatar: 'fox', questionsLeft: 2 },
  { id: 'p2', name: 'Marcus', seat: 1, connected: true, avatar: 'owl', questionsLeft: 2 },
  { id: 'p3', name: 'Ana', seat: 2, connected: true, avatar: 'cat', questionsLeft: 2 },
  { id: 'p4', name: 'Theo', seat: 3, connected: true, avatar: 'hare', questionsLeft: 2 },
  { id: 'p5', name: 'June', seat: 4, connected: true, avatar: 'badger', questionsLeft: 2 },
];

export const DEMO_STEPS: ProofStep[] = [
  { clueId: 'c2', says: 'Lady Clementine danced every waltz from 8:30 to 9:30.', therefore: 'Forty guests watched her in the Ballroom at nine. She was never in the study.', eliminates: ['heiress'] },
  { clueId: 'c3', says: 'Mrs Pemberton never left the kitchen while the pudding set.', therefore: 'The cook was in the Kitchen at nine.', eliminates: ['cook'] },
  { clueId: 'c5', says: 'Toby wound the great clock at nine sharp.', therefore: 'The nephew was in the Great Hall, two rooms away.', eliminates: ['nephew'] },
  { clueId: 'c1', says: 'Muddy boots crossed from the conservatory to the kitchen at nine.', therefore: 'The colonel was out in the rain, not at the chessboard.', eliminates: ['colonel'] },
  { clueId: 'c4', says: 'The empty vial came from a doctor\'s bag.', therefore: 'Only Dr Amari had the sleeping draught and no witness at nine. His library alibi was a chair nobody saw him in.' },
];

export const DEMO_SCORES: Record<string, number> = { p1: 1250, p3: 980, p2: 820, p5: 610, p4: 450 };

/** Questions and answers, two per round. */
export const DEMO_LINES: { round: 1 | 2 | 3; asker: string; suspect: string; q: string; a: string }[] = [
  { round: 1, asker: 'p1', suspect: 'colonel', q: 'Where were you at nine o\'clock?', a: 'Out in the conservatory with my pipe, thinking about how much I dislike this family. The rain was a mercy.' },
  { round: 1, asker: 'p2', suspect: 'heiress', q: 'Did you love him?', a: 'Darling, I danced every waltz tonight. My feet have a better alibi than most people in this house.' },
  { round: 2, asker: 'p3', suspect: 'doctor', q: 'Did you bring your medical bag tonight?', a: 'I always bring my bag. A doctor without a bag is just a man with opinions. I was reading in the library all evening.' },
  { round: 2, asker: 'p4', suspect: 'cook', q: 'Did anyone come into the kitchen?', a: 'Only the colonel, dripping all over my clean floor at nine. I have not forgiven him, and I never will.' },
  { round: 3, asker: 'p5', suspect: 'nephew', q: 'Did you like your uncle?', a: 'Like is a strong word. I liked his clock. I wound it at nine, like always, and he shouted at me, like always.' },
  { round: 3, asker: 'p1', suspect: 'doctor', q: 'Who saw you in the library?', a: 'The books, mostly. They are excellent listeners and very poor witnesses.' },
];

export const DEMO_BRIEFING_LINES = [
  'The rain had not stopped for three days, and neither had the arguments.',
  'Sir Bartholomew Crane invited five guests to Ashby Hall to announce a new will.',
  'At nine o\'clock he went to the study for his nightly game of chess. He never made his last move.',
  'Here is the house. Every door, every corridor, every place to hide.',
  'And here are the people who were in it.',
];

export const DEMO_CLUES_BY_ROUND: Record<1 | 2 | 3, BoardClue['id'][]> = { 1: ['c1', 'c2'], 2: ['c3', 'c4'], 3: ['c5', 'c6'] };
