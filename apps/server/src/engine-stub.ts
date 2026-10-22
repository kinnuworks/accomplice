// Stand-in for @accomplice/fairplay while the real engine is being built.
// Same API as docs/ARCHITECTURE.md, no Z3: cases are built so the answer is unique by construction.
// Delete this file once packages/fairplay is published in the workspace (src/engine.ts prefers the real one).
import type {
  AccompliceLie, Case, Claim, ClaimCheck, Clue, Fact, Item, Lie, ProofStep, PublicCase, Room, Slot,
  Suspect, SuspectSlice, Theory, TheoryVerdict, Tone, VerifyReport,
} from '@accomplice/protocol';

export interface GenerateOptions { seed: number; tone: Tone; difficulty: 1 | 2 | 3; suspectCount?: 4 | 5 }

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOTS: Slot[] = ['8:00 pm', '8:30 pm', '9:00 pm', '9:30 pm', '10:00 pm'].map((label, id) => ({ id, label }));

interface Theme {
  title: string; place: string; dateLine: string; intro: string;
  victim: { name: string; description: string }; what: string;
  rooms: Room[]; items: Item[];
  suspects: Omit<Suspect, 'alibi'>[];
}

const room = (id: string, name: string, x: number, y: number, w: number, h: number, adjacent: string[]): Room => ({ id, name, x, y, w, h, adjacent });

const THEMES: Record<Tone, Theme> = {
  classic: {
    title: 'The Last Toast at Wrenfield Hall',
    place: 'Wrenfield Hall, a draughty country house',
    dateLine: 'A stormy Saturday night, 1926',
    intro: 'Lord Edmund Wrenfield raised his glass at eight, promised a scandalous announcement at ten, and never lived to make it. The storm has cut the roads. Five guests remain, and one of them knows exactly what happened. Ask your questions, mind the clues, and trust no one too quickly.',
    victim: { name: 'Lord Edmund Wrenfield', description: 'The host, rich, sharp tongued, and rewriting his will' },
    what: 'was struck down',
    rooms: [
      room('library', 'Library', 0, 0, 3, 2, ['hall', 'study']),
      room('study', 'Study', 3, 0, 2, 2, ['library', 'hall']),
      room('hall', 'Great Hall', 1, 2, 3, 2, ['library', 'study', 'dining', 'conservatory']),
      room('dining', 'Dining Room', 4, 2, 2, 2, ['hall', 'kitchen']),
      room('kitchen', 'Kitchen', 4, 4, 2, 2, ['dining', 'conservatory']),
      room('conservatory', 'Conservatory', 0, 4, 4, 2, ['hall', 'kitchen']),
    ],
    items: [
      { id: 'candlestick', name: 'brass candlestick', homeRoom: 'dining' },
      { id: 'poker', name: 'fireplace poker', homeRoom: 'library' },
      { id: 'decanter', name: 'crystal decanter', homeRoom: 'study' },
    ],
    suspects: [
      { id: 'pell', name: 'Mrs Agatha Pell', role: 'the housekeeper', traits: ['clipped', 'proper', 'bone dry wit'], voiceId: 'Amy', portrait: 'portraits/pell.webp', motive: 'Forty years of service, and not a penny in the will' },
      { id: 'hask', name: 'Colonel Rupert Hask', role: 'the old soldier', traits: ['booming', 'tells war stories', 'easily offended'], voiceId: 'Brian', portrait: 'portraits/hask.webp', motive: 'Owes the victim a ruinous gambling debt' },
      { id: 'lark', name: 'Miss Ivy Lark', role: 'the jazz singer', traits: ['breezy', 'flirtatious', 'quick comebacks'], voiceId: 'Olivia', portrait: 'portraits/lark.webp', motive: 'Secretly engaged to the victim, or so she says' },
      { id: 'moreau', name: 'Dr Felix Moreau', role: 'the family doctor', traits: ['precise', 'nervous laugh', 'over explains'], voiceId: 'Matthew', portrait: 'portraits/moreau.webp', motive: 'The victim knew about his forged prescriptions' },
      { id: 'blackwood', name: 'Theo Blackwood', role: 'the nephew', traits: ['sulky', 'sarcastic', 'young and bored'], voiceId: 'Stephen', portrait: 'portraits/blackwood.webp', motive: 'Cut from the will last Tuesday' },
    ],
  },
  cozy: {
    title: 'The Great Birthday Cake Caper',
    place: 'Willowmere Cottage, at Granny Rose\'s eightieth',
    dateLine: 'A warm summer evening',
    intro: 'Granny Rose\'s three tier lemon cake sat proudly in the kitchen at eight. By ten, there was nothing left but crumbs and a very guilty silence. Five guests had the chance. One of them had the appetite. Find out who, before the candles melt from embarrassment.',
    victim: { name: 'The birthday cake', description: 'Three tiers of lemon sponge, baked with love' },
    what: 'vanished',
    rooms: [
      room('kitchen', 'Kitchen', 0, 0, 3, 2, ['parlour', 'pantry']),
      room('pantry', 'Pantry', 3, 0, 2, 2, ['kitchen', 'hallway']),
      room('parlour', 'Parlour', 0, 2, 3, 2, ['kitchen', 'hallway', 'sunroom']),
      room('hallway', 'Hallway', 3, 2, 2, 2, ['pantry', 'parlour', 'garden']),
      room('sunroom', 'Sunroom', 0, 4, 3, 2, ['parlour', 'garden']),
      room('garden', 'Garden', 3, 4, 3, 2, ['hallway', 'sunroom']),
    ],
    items: [
      { id: 'server', name: 'silver cake server', homeRoom: 'kitchen' },
      { id: 'basket', name: 'wicker picnic basket', homeRoom: 'pantry' },
      { id: 'tray', name: 'tea tray', homeRoom: 'parlour' },
    ],
    suspects: [
      { id: 'bea', name: 'Auntie Bea', role: 'the rival baker', traits: ['sweet as syrup', 'competitive', 'backhanded compliments'], voiceId: 'Joanna', portrait: 'portraits/bea.webp', motive: 'Her own cake came second at the village fete' },
      { id: 'mort', name: 'Uncle Mort', role: 'the gardener', traits: ['slow talker', 'grumbles', 'loves his roses'], voiceId: 'Matthew', portrait: 'portraits/mort.webp', motive: 'Was told he could not have a slice until after the speeches' },
      { id: 'pip', name: 'Cousin Pip', role: 'the teenager', traits: ['dramatic', 'says literally a lot', 'always hungry'], voiceId: 'Kevin', portrait: 'portraits/pip.webp', motive: 'Skipped lunch for a dance rehearsal' },
      { id: 'fennick', name: 'Mr Fennick', role: 'the nosy neighbour', traits: ['gossipy', 'fussy', 'remembers everything'], voiceId: 'Stephen', portrait: 'portraits/fennick.webp', motive: 'Still sore about not being invited last year' },
      { id: 'rosie', name: 'Rosie Quill', role: 'the dog walker', traits: ['cheerful', 'scatterbrained', 'talks about dogs'], voiceId: 'Ruth', portrait: 'portraits/rosie.webp', motive: 'Her terrier Biscuit adores lemon sponge' },
    ],
  },
};

const slotLabel = (s: number) => SLOTS[s]?.label ?? `slot ${s}`;

export function generateCase(opts: GenerateOptions): Case {
  const r = rng(opts.seed);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const theme = THEMES[opts.tone];
  const rooms = theme.rooms;
  const roomName = (id: string) => rooms.find((x) => x.id === id)!.name;
  const count = opts.suspectCount ?? 5;
  const suspects0 = theme.suspects.slice(0, count);
  const culprit = pick(suspects0).id;
  const crimeSlot = 2 + Math.floor(r() * 2); // 9:00 or 9:30
  const crimeRoom = pick(rooms.filter((x) => x.adjacent.length <= 3)).id;
  const item = pick(theme.items);

  const walk = (fixedSlot: number | null, fixedRoom: string | null, avoid: { slot: number; room: string } | null) => {
    for (let tries = 0; tries < 200; tries++) {
      const pos: Record<number, string> = {};
      const start = fixedSlot ?? 0;
      pos[start] = fixedRoom ?? pick(rooms).id;
      for (let s = start + 1; s < SLOTS.length; s++) {
        const prev = rooms.find((x) => x.id === pos[s - 1])!;
        pos[s] = r() < 0.45 ? prev.id : pick(prev.adjacent);
      }
      for (let s = start - 1; s >= 0; s--) {
        const next = rooms.find((x) => x.id === pos[s + 1])!;
        pos[s] = r() < 0.45 ? next.id : pick(next.adjacent);
      }
      if (avoid && pos[avoid.slot] === avoid.room) continue;
      return pos;
    }
    throw new Error('walk failed');
  };

  const position: Record<string, Record<number, string>> = {};
  for (const s of suspects0) {
    position[s.id] = s.id === culprit ? walk(crimeSlot, crimeRoom, null) : walk(null, null, { slot: crimeSlot, room: crimeRoom });
  }

  const lies: Lie[] = [];
  const culpritClaim = pick(rooms.filter((x) => x.id !== crimeRoom)).id;
  lies.push({ s: culprit, slot: crimeSlot, claimedRoom: culpritClaim, trueRoom: crimeRoom, reason: 'guilt' });
  const innocents = suspects0.filter((s) => s.id !== culprit);
  const herring = pick(innocents);
  const herringSlot = crimeSlot === 2 ? 4 : 1;
  const herringTrue = position[herring.id][herringSlot];
  const herringClaim = pick(rooms.filter((x) => x.id !== herringTrue && x.id !== crimeRoom)).id;
  lies.push({ s: herring.id, slot: herringSlot, claimedRoom: herringClaim, trueRoom: herringTrue, reason: 'embarrassment' });

  const suspects: Suspect[] = suspects0.map((s) => {
    const alibi: Record<number, string> = { ...position[s.id] };
    for (const l of lies) if (l.s === s.id) alibi[l.slot] = l.claimedRoom;
    return { ...s, alibi };
  });
  const name = (id: string) => suspects.find((s) => s.id === id)!.name;

  const holder: Record<number, string | null> = {};
  for (const sl of SLOTS) holder[sl.id] = sl.id === crimeSlot ? culprit : null;

  const clues: Clue[] = [];
  let n = 0;
  const add = (c: Omit<Clue, 'id'>) => clues.push({ id: `c${++n}`, ...c });
  const T = slotLabel(crimeSlot);

  add({ kind: 'physical', title: `The ${item.name}`, text: `The ${item.name} turned up in the ${roomName(crimeRoom)}, far from its usual spot in the ${roomName(item.homeRoom)}. It was used at ${T}.`, visibility: 'board', round: 1, fact: { k: 'itemIn', item: item.id, room: crimeRoom, slot: crimeSlot }, key: true });

  const elimTemplates: Array<(nm: string, rm: string) => { kind: Clue['kind']; title: string; text: string }> = [
    (nm, rm) => ({ kind: 'document', title: 'A dance card', text: `A dance card, signed and timed: ${nm} was in the ${rm} at ${T}.` }),
    (nm, rm) => ({ kind: 'testimony', title: 'The maid remembers', text: `The maid served ${nm} a drink in the ${rm} at exactly ${T}. She is very sure.` }),
    (nm, rm) => ({ kind: 'physical', title: 'Muddy footprints', text: `Fresh prints with ${nm}'s distinctive heel lead into the ${rm}, made at ${T} when the rain began.` }),
    (nm, rm) => ({ kind: 'document', title: 'A phone log', text: `The exchange logged a call taken by ${nm} on the ${rm} line at ${T}.` }),
  ];
  innocents.forEach((s, i) => {
    const t = elimTemplates[i % elimTemplates.length](s.name, roomName(position[s.id][crimeSlot]));
    const round = (1 + (i % 3)) as 1 | 2 | 3;
    add({ ...t, visibility: i % 2 === 0 ? 'board' : 'private', round, holderPlayerSlot: i % 2 === 0 ? undefined : i % 6, fact: { k: 'at', s: s.id, room: position[s.id][crimeSlot], slot: crimeSlot }, key: true });
  });
  add({ kind: 'testimony', title: 'An empty room', text: `${name(culprit)} says they were in the ${roomName(culpritClaim)} at ${T}. A guest who sat there all evening never saw them.`, visibility: 'board', round: 3, fact: { k: 'notAt', s: culprit, room: culpritClaim, slot: crimeSlot } });
  add({ kind: 'physical', title: 'A telling smudge', text: `There is a smudge on ${name(culprit)}'s sleeve that matches the ${item.name}.`, visibility: 'private', round: 3, holderPlayerSlot: 0, fact: { k: 'had', s: culprit, item: item.id, slot: crimeSlot } });
  add({ kind: 'testimony', title: 'A blush and a stammer', text: `${herring.name} was not in the ${roomName(herringClaim)} at ${slotLabel(herringSlot)}, whatever they claim. Someone saw them sneaking into the ${roomName(herringTrue)}.`, visibility: 'board', round: 2, fact: { k: 'at', s: herring.id, room: herringTrue, slot: herringSlot } });

  // Harmless private true facts so every seat gets one private card per round.
  for (const round of [1, 2, 3] as const) {
    for (let seat = 0; seat < 6; seat++) {
      if (clues.some((c) => c.round === round && c.visibility === 'private' && c.holderPlayerSlot === seat)) continue;
      const s = pick(suspects);
      const sl = pick(SLOTS.filter((x) => x.id !== crimeSlot && !(s.id === herring.id && x.id === herringSlot))).id;
      add({ kind: 'testimony', title: 'Something you noticed', text: `You remember seeing ${s.name} in the ${roomName(position[s.id][sl])} at ${slotLabel(sl)}.`, visibility: 'private', round, holderPlayerSlot: seat, fact: { k: 'at', s: s.id, room: position[s.id][sl], slot: sl } });
    }
  }

  return {
    id: `case-${opts.tone}-${opts.seed}`, seed: opts.seed, tone: opts.tone, difficulty: opts.difficulty,
    title: theme.title, place: theme.place, scene: opts.tone === 'cozy' ? 'scenes/willowmere-cottage.webp' : 'scenes/wrenfield-hall.webp', dateLine: theme.dateLine, intro: theme.intro, victim: theme.victim,
    crime: { room: crimeRoom, slot: crimeSlot, item: item.id, what: theme.what },
    rooms, slots: SLOTS, suspects, items: theme.items,
    truth: { position, culprit, holder }, clues, lies,
    confession: [
      `You want to know why? Because nobody in this house ever listened to me.`,
      `The ${item.name} was right there, and it was over in a moment.`,
      `Enjoy your little victory. I would do it all again.`,
    ],
    headline: { title: `${name(culprit).toUpperCase()} UNMASKED`, sub: '{DETECTIVE} cracks the case by candlelight' },
    paperName: opts.tone === 'cozy' ? 'The Willowmere Crier' : 'The Wrenfield Courier',
    clockChimes: [8, 9, 10],
  };
}

function eliminated(c: Case, clueIds?: string[]): Set<string> {
  const out = new Set<string>();
  for (const cl of c.clues) {
    if (clueIds && !clueIds.includes(cl.id)) continue;
    const f = cl.fact;
    if (f.k === 'at' && f.slot === c.crime.slot && f.room !== c.crime.room) out.add(f.s);
    if (f.k === 'notAt' && f.slot === c.crime.slot && f.room === c.crime.room) out.add(f.s);
  }
  return out;
}

export async function verifyCase(c: Case): Promise<VerifyReport> {
  const t0 = Date.now();
  const elim = eliminated(c);
  const left = c.suspects.filter((s) => !elim.has(s.id)).map((s) => s.id);
  let byRound: 1 | 2 | 3 | null = null;
  for (const r of [1, 2, 3] as const) {
    const ids = c.clues.filter((x) => x.round <= r).map((x) => x.id);
    const e = eliminated(c, ids);
    if (c.suspects.filter((s) => !e.has(s.id)).length === 1) { byRound = r; break; }
  }
  return {
    ok: left.length === 1 && left[0] === c.truth.culprit, uniqueCulprit: left.length === 1, culprit: left[0] ?? null,
    keyClues: c.clues.filter((x) => x.key).map((x) => x.id), solvableByRound: byRound,
    safeAccompliceLies: safeLiesForAccomplice(c).length, ms: Date.now() - t0, notes: ['stub engine, no solver'],
  };
}

export async function generateVerifiedCase(opts: GenerateOptions, maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const c = generateCase({ ...opts, seed: opts.seed + i });
    const report = await verifyCase(c);
    if (report.ok) return { c, report, tries: i + 1 };
  }
  throw new Error('could not build a fair case');
}

export function sliceFor(c: Case, suspectId: string): SuspectSlice {
  const me = c.suspects.find((s) => s.id === suspectId);
  if (!me) throw new Error(`unknown suspect ${suspectId}`);
  const rn = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  const myLies = c.lies.filter((l) => l.s === suspectId);
  const knows: string[] = [];
  for (const sl of c.slots) {
    if (myLies.some((l) => l.slot === sl.id)) continue;
    const here = c.truth.position[suspectId][sl.id];
    knows.push(`At ${sl.label} you were in the ${rn(here)}.`);
    for (const o of c.suspects) {
      if (o.id === suspectId) continue;
      if (c.truth.position[o.id][sl.id] === here && !c.lies.some((l) => l.s === o.id && l.slot === sl.id)) knows.push(`At ${sl.label} you saw ${o.name} in the ${rn(here)} too.`);
    }
  }
  const item = c.items.find((i) => i.id === c.crime.item)!;
  for (const i of c.items) knows.push(`The ${i.name} usually lives in the ${rn(i.homeRoom)}.`);
  const mustLie = myLies.map((l) => `If asked about ${c.slots[l.slot].label}, insist you were in the ${rn(l.claimedRoom)}. Never admit you were in the ${rn(l.trueRoom)}.${l.reason === 'embarrassment' ? ' The truth is embarrassing but has nothing to do with the crime.' : ''}`);
  const mayNotReveal = suspectId === c.truth.culprit
    ? [`That you were in the ${rn(c.crime.room)} at ${c.slots[c.crime.slot].label}.`, `That you used the ${item.name}.`, 'That you are guilty. Never confess.']
    : ['Who did it. You honestly do not know.', 'Anything you did not see yourself. Do not invent sightings.'];
  return {
    suspect: me, knows, mustLie, mayNotReveal,
    otherSuspects: c.suspects.filter((s) => s.id !== suspectId).map(({ id, name, role }) => ({ id, name, role })),
    setting: { title: c.title, place: c.place, dateLine: c.dateLine, victim: `${c.victim.name} ${c.crime.what}` },
  };
}

export function checkReply(c: Case, suspectId: string, claims: Claim[]): ClaimCheck {
  const violations: string[] = [];
  for (const cl of claims) {
    if (cl.kind !== 'location') continue;
    const truth = c.truth.position[cl.s]?.[cl.slot];
    if (truth === undefined) continue;
    if (cl.s === suspectId) {
      const lie = c.lies.find((l) => l.s === suspectId && l.slot === cl.slot);
      const allowed = lie ? lie.claimedRoom : truth;
      if (cl.room !== allowed) violations.push(lie && cl.room === lie.trueRoom ? `leaked own secret location at slot ${cl.slot}` : `contradicted own story at slot ${cl.slot}`);
    } else {
      if (cl.s === c.truth.culprit && cl.room === c.crime.room && cl.slot === c.crime.slot) violations.push('placed the culprit at the scene');
      else if (cl.room !== truth && cl.room !== c.suspects.find((s) => s.id === cl.s)?.alibi[cl.slot]) violations.push(`invented a sighting of ${cl.s} at slot ${cl.slot}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export async function evaluateTheory(c: Case, pinnedClueIds: string[], theory: Theory): Promise<TheoryVerdict> {
  const elim = eliminated(c, pinnedClueIds);
  if (elim.has(theory.culprit)) return 'contradicted';
  const pinned = c.clues.filter((x) => pinnedClueIds.includes(x.id));
  if (theory.item) {
    const itemFact = pinned.find((x) => x.fact.k === 'itemIn' && x.fact.slot === c.crime.slot);
    if (itemFact && (itemFact.fact as Extract<Fact, { k: 'itemIn' }>).item !== theory.item) return 'contradicted';
  }
  const left = c.suspects.filter((s) => !elim.has(s.id));
  if (left.length === 1 && left[0].id === theory.culprit) {
    if (theory.item && !pinned.some((x) => (x.fact.k === 'itemIn' || x.fact.k === 'had') && x.fact.item === theory.item)) return 'possible';
    return 'follows';
  }
  return 'possible';
}

export function proofChain(c: Case): ProofStep[] {
  const rn = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  const sn = (id: string) => c.suspects.find((s) => s.id === id)?.name ?? id;
  const steps: ProofStep[] = [];
  const item = c.items.find((i) => i.id === c.crime.item)!;
  const T = c.slots[c.crime.slot].label;
  const means = c.clues.find((x) => x.fact.k === 'itemIn');
  if (means) steps.push({ clueId: means.id, says: means.text, therefore: `Whoever did it was in the ${rn(c.crime.room)} at ${T}, with the ${item.name}.` });
  for (const cl of c.clues) {
    const f = cl.fact;
    if (f.k === 'at' && f.slot === c.crime.slot && f.room !== c.crime.room) {
      steps.push({ clueId: cl.id, says: cl.text, therefore: `${sn(f.s)} was in the ${rn(f.room)}, so they could not have done it.`, eliminates: [f.s] });
    }
  }
  const lieClue = c.clues.find((x) => x.fact.k === 'notAt' && x.fact.s === c.truth.culprit);
  if (lieClue) steps.push({ clueId: lieClue.id, says: lieClue.text, therefore: `${sn(c.truth.culprit)} lied about where they were. Only one person is left standing.` });
  const had = c.clues.find((x) => x.fact.k === 'had');
  if (had) steps.push({ clueId: had.id, says: had.text, therefore: `${sn(c.truth.culprit)} had the ${item.name}. Case closed.` });
  return steps;
}

export function safeLiesForAccomplice(c: Case): AccompliceLie[] {
  const rn = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  const innocents = c.suspects.filter((s) => s.id !== c.truth.culprit);
  const near = c.crime.slot - 1;
  return innocents.slice(0, 3).map((s) => ({
    text: `Hint that you spotted ${s.name} creeping around the ${rn(c.crime.room)} at ${c.slots[near].label}. Nobody can quite disprove it.`,
    fact: { k: 'at', s: s.id, room: c.crime.room, slot: near } as Fact,
  }));
}

export function publicView(c: Case): PublicCase {
  return {
    id: c.id, tone: c.tone, scene: c.scene, title: c.title, place: c.place, dateLine: c.dateLine, intro: c.intro,
    victim: c.victim, crime: { room: c.crime.room, slot: c.crime.slot, what: c.crime.what },
    rooms: c.rooms, slots: c.slots,
    suspects: c.suspects.map(({ alibi, ...rest }) => ({ ...rest, claimedAlibi: { ...alibi } })) as unknown as PublicCase['suspects'],
    items: c.items,
  };
}
