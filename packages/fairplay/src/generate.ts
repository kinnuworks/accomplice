// Procedural case generator. Deterministic from (seed, tone, difficulty, suspectCount).
import type { Case, Clue, Fact, Item, Lie, Room, Slot, Suspect, Tone } from '@accomplice/protocol';
import { ARCHETYPES, CONFESSION_CLOSER, CONFESSION_METHOD, HEADLINES, HEADLINE_SUBS, SETTINGS, type SettingDef } from './content.js';
import { alternative, analyse, dist, factKey, isUnique, makeWorld, type IFact, type World } from './logic.js';
import { hashString, int, makeRng, pick, shuffle, weighted, type Rng } from './rng.js';
import { alibiBreakerClue, embarrassmentClue, phraseClue, type Truthy } from './text.js';

export interface GenerateOptions { seed: number; tone: Tone; difficulty: 1 | 2 | 3; suspectCount?: 4 | 5 }

/** Player seats that always exist (a game needs at least 3 players). Key clues only go here or on the board. */
export const MIN_SEATS = 3;
export const MAX_SEATS = 6;
export const ROUNDS = [1, 2, 3] as const;

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

interface Story {
  w: World;
  pos: number[][];           // [suspect][slot] -> room index
  culprit: number;
  means: number;
  pickup: number;
  itemLoc: number[][];       // [item][slot]
  holder: (number | null)[];
}

/** Random walk through the floor plan that hits required rooms and avoids forbidden ones. */
function walk(r: Rng, w: World, D: number[][], need: Map<number, number>, avoid: Map<number, number>): number[] {
  const out: number[] = [];
  for (let t = 0; t < w.T; t++) {
    const options = t === 0 ? [...Array(w.R).keys()] : [out[t - 1], ...w.adj[out[t - 1]]];
    const ok = options.filter((room) => {
      if (need.has(t) && need.get(t) !== room) return false;
      if (avoid.get(t) === room) return false;
      for (const [t2, r2] of need) if (t2 > t && D[room][r2] > t2 - t) return false;
      return true;
    });
    if (!ok.length) throw new Error('walk: no legal move (generator bug)');
    // Gently prefer moving, so people circulate.
    out.push(weighted(r, ok, (room) => (t > 0 && room === out[t - 1] ? 1 : 2)));
  }
  return out;
}

function buildRooms(s: SettingDef): Room[] {
  return s.rooms.map((rd) => ({
    id: rd.id, name: rd.name, x: rd.x, y: rd.y, w: rd.w, h: rd.h,
    adjacent: s.doors.filter(([a, b]) => a === rd.id || b === rd.id).map(([a, b]) => (a === rd.id ? b : a)),
  }));
}

function assignVoices(r: Rng, prefs: string[][]): string[] {
  // Backtracking so every suspect gets a distinct voice from their own list where possible.
  const res: string[] = [];
  const used = new Set<string>();
  const rec = (i: number): boolean => {
    if (i === prefs.length) return true;
    for (const v of shuffle(r, prefs[i])) {
      if (used.has(v)) continue;
      used.add(v); res[i] = v;
      if (rec(i + 1)) return true;
      used.delete(v);
    }
    return false;
  };
  if (rec(0)) return res;
  const all = ['Ruth', 'Matthew', 'Stephen', 'Danielle', 'Gregory', 'Joanna', 'Amy', 'Brian', 'Arthur', 'Olivia', 'Kajal'];
  return prefs.map((_, i) => all[i]);
}

export function generateCase(opts: GenerateOptions): Case {
  const { seed, tone, difficulty } = opts;
  const r = makeRng(hashString(`${seed}|${tone}|${difficulty}|${opts.suspectCount ?? ''}`));
  const setting = pick(r, SETTINGS);
  const td = setting.tones[tone];
  const rooms = buildRooms(setting);
  const rIdx = new Map(rooms.map((x, i) => [x.id, i]));
  const adj = rooms.map((x) => x.adjacent.map((a) => rIdx.get(a)!));
  const D = dist(adj);
  const T = 5;
  const n = opts.suspectCount ?? (difficulty === 1 ? 4 : 5);

  // ----- Suspects -----
  const arch = shuffle(r, ARCHETYPES).slice(0, n);
  const voices = assignVoices(r, arch.map((a) => a.voices));
  const crime = pick(r, td.crimes);

  // ----- Crime, means, pickup -----
  const crimeSlot = pick(r, [2, 3]);
  const itemDefs = td.items.map((it) => ({ ...it, h: rIdx.get(it.home)! }));
  let crimeRoom = -1, meansDef = itemDefs[0], dMeans = 1;
  for (let guard = 0; guard < 100; guard++) {
    const cr = int(r, rooms.length);
    const cands = itemDefs.filter((it) => it.h !== cr && D[it.h][cr] <= Math.min(2, crimeSlot));
    if (!cands.length || itemDefs.filter((it) => it.h !== cr).length < 3) continue;
    crimeRoom = cr;
    meansDef = pick(r, cands);
    dMeans = D[meansDef.h][cr];
    break;
  }
  if (crimeRoom < 0) throw new Error('could not place crime');
  const decoyCount = difficulty === 1 ? 2 : 3;
  const decoys = shuffle(r, itemDefs.filter((it) => it !== meansDef && it.h !== crimeRoom)).slice(0, decoyCount);
  const itemList = shuffle(r, [meansDef, ...decoys]);
  const items: Item[] = itemList.map((it) => ({ id: it.id, name: it.name, homeRoom: it.home }));
  const means = itemList.indexOf(meansDef);
  const latestPickup = crimeSlot - dMeans;
  const pickup = Math.max(0, latestPickup - (r() < 0.6 ? 0 : 1));

  const w = makeWorld(rooms.length, adj, T, n, itemList.map((it) => it.h), crimeRoom, crimeSlot);

  // ----- True movements -----
  const culprit = int(r, n);
  const pos: number[][] = [];
  for (let s = 0; s < n; s++) {
    if (s === culprit) pos.push(walk(r, w, D, new Map([[pickup, meansDef.h], [crimeSlot, crimeRoom]]), new Map()));
    else pos.push(walk(r, w, D, new Map(), new Map([[crimeSlot, crimeRoom]])));
  }
  const holder: (number | null)[] = Array.from({ length: T }, (_, t) => (t >= pickup && t <= crimeSlot ? culprit : null));
  const itemLoc = itemList.map((it, i) => Array.from({ length: T }, (_, t) => {
    if (i !== means) return it.h;
    if (t < pickup) return it.h;
    if (t <= crimeSlot) return pos[culprit][t];
    return crimeRoom;
  }));
  const story: Story = { w, pos, culprit, means, pickup, itemLoc, holder };

  const suspects: Suspect[] = arch.map((a, i) => ({
    id: a.id,
    ...(([name, shortName]) => ({ name, shortName }))(pick(r, a.names)),
    role: a.role,
    traits: pick(r, a.traits),
    voiceId: voices[i],
    portrait: a.portrait,
    motive: cap(pick(r, a.motive[tone]).replace('{V}', crime.short)),
    alibi: {},
  }));
  const sid = (i: number) => suspects[i].id;
  const rid = (i: number) => rooms[i].id;
  const occupantsIdx = (room: number, t: number) => pos.map((p, s) => (p[t] === room ? s : -1)).filter((s) => s >= 0);
  const plausible = (s: number, t: number) => {
    const before = t > 0 ? [pos[s][t - 1], ...adj[pos[s][t - 1]]] : [...Array(rooms.length).keys()];
    return before.filter((x) => x !== pos[s][t] && (t === T - 1 || x === pos[s][t + 1] || adj[x].includes(pos[s][t + 1])));
  };

  // ----- Lies -----
  const lies: Lie[] = [];
  let culpritClaim = plausible(culprit, crimeSlot).filter((x) => x !== crimeRoom);
  if (!culpritClaim.length) culpritClaim = adj[crimeRoom];
  const emptyClaims = culpritClaim.filter((x) => occupantsIdx(x, crimeSlot).length === 0);
  const claimRoom = pick(r, emptyClaims.length && r() < 0.6 ? emptyClaims : culpritClaim);
  lies.push({ s: sid(culprit), slot: crimeSlot, claimedRoom: rid(claimRoom), trueRoom: rid(crimeRoom), reason: 'guilt' });
  const innocents = [...Array(n).keys()].filter((s) => s !== culprit);
  const liarCount = Math.min(difficulty === 1 ? 1 : 2, innocents.length - 1);
  const embarrassments: { s: number; slot: number; claimed: number; activity: string }[] = [];
  for (const s of shuffle(r, innocents).slice(0, liarCount)) {
    const slots = shuffle(r, [...Array(T).keys()].filter((t) => t !== crimeSlot));
    for (const t of slots) {
      const opts = plausible(s, t);
      if (!opts.length) continue;
      const claimed = pick(r, opts);
      const activity = pick(r, setting.rooms[pos[s][t]].caught);
      embarrassments.push({ s, slot: t, claimed, activity });
      lies.push({ s: sid(s), slot: t, claimedRoom: rid(claimed), trueRoom: rid(pos[s][t]), reason: 'embarrassment', detail: activity });
      break;
    }
  }
  for (let s = 0; s < n; s++) {
    for (let t = 0; t < T; t++) {
      const lie = lies.find((l) => l.s === sid(s) && l.slot === t);
      suspects[s].alibi[t] = lie ? lie.claimedRoom : rid(pos[s][t]);
    }
  }

  // ----- Clue selection: counterexample guided -----
  const mandatory: { f: IFact; card: 'embarrass' | 'breaker'; e?: (typeof embarrassments)[number] }[] = [];
  for (const e of embarrassments) mandatory.push({ f: { k: 'at', s: e.s, room: pos[e.s][e.slot], slot: e.slot }, card: 'embarrass', e });
  mandatory.push({ f: { k: 'notAt', s: culprit, room: claimRoom, slot: crimeSlot }, card: 'breaker' });

  const directW = [3, 1, 0.25][difficulty - 1];
  const selected: IFact[] = [];
  const used = new Set(mandatory.map((m) => factKey(m.f)));
  const current = () => [...mandatory.map((m) => m.f), ...selected];
  for (let iter = 0; iter < 80; iter++) {
    const alt = alternative(w, current(), culprit, means, r);
    if (!alt) break;
    const k = alt.culprit;
    const cands: { f: IFact; wt: number }[] = [];
    for (let t = 0; t < T; t++) {
      if (alt.path[t] === pos[k][t]) continue;
      if (k === culprit && t === crimeSlot) continue;
      const base = t === crimeSlot ? directW : Math.abs(t - crimeSlot) === 1 ? 2 : 1;
      cands.push({ f: { k: 'at', s: k, room: pos[k][t], slot: t }, wt: base });
      cands.push({ f: { k: 'notAt', s: k, room: alt.path[t], slot: t }, wt: base * (alt.path[t] === crimeRoom && t === crimeSlot ? 0.5 : 0.7) });
      for (const j of occupantsIdx(pos[k][t], t)) if (j !== k) cands.push({ f: { k: 'saw', a: k, b: j, room: pos[k][t], slot: t }, wt: base * 1.3 });
    }
    const m = alt.means;
    for (let t = 0; t < T; t++) {
      if (alt.loc[t] === itemLoc[m][t]) continue;
      const direct = m === means && t >= pickup && t <= crimeSlot;
      cands.push({ f: { k: 'itemIn', item: m, room: itemLoc[m][t], slot: t }, wt: direct ? 0.3 : 2 });
    }
    const fresh = cands.filter((c) => !used.has(factKey(c.f)));
    if (!fresh.length) break;
    const choice = weighted(r, fresh, (c) => c.wt).f;
    used.add(factKey(choice));
    selected.push(choice);
  }
  // Drop anything the rest already implies, so every chosen clue matters.
  for (const f of shuffle(r, selected.slice())) {
    const without = current().filter((x) => x !== f);
    if (isUnique(w, without, culprit, means)) selected.splice(selected.indexOf(f), 1);
  }

  // ----- Rounds and seats -----
  type Placed = { f: IFact; round: 1 | 2 | 3; where: 'board' | number; card?: (typeof mandatory)[number] };
  const placed: Placed[] = [];
  const boardCount = (rd: number) => placed.filter((p) => p.round === rd && p.where === 'board').length;
  const seatFree = (rd: number, seat: number) => !placed.some((p) => p.round === rd && p.where === seat);
  const place = (f: IFact, want: 1 | 2 | 3, card?: Placed['card'], preferBoard = true): boolean => {
    for (let rd = want; rd <= 3; rd++) {
      const round = rd as 1 | 2 | 3;
      if (preferBoard && boardCount(rd) < 2) { placed.push({ f, round, where: 'board', card }); return true; }
      for (let seat = 0; seat < MIN_SEATS; seat++) if (seatFree(rd, seat)) { placed.push({ f, round, where: seat, card }); return true; }
      if (boardCount(rd) < 3) { placed.push({ f, round, where: 'board', card }); return true; }
    }
    return false;
  };
  mandatory.forEach((m, i) => {
    const want = m.card === 'breaker' ? 2 : ((1 + (i % 2)) as 1 | 2);
    place(m.f, want, m, true);
  });
  const keyOrder = shuffle(r, selected);
  const anchor = keyOrder[0]; // always dealt in round 3; fillers must never make it redundant
  keyOrder.forEach((f, i) => {
    const round = (3 - (i % 3)) as 1 | 2 | 3;
    place(f, round, undefined, r() < 0.4);
  });

  // ----- Fillers: true, flavourful, and never enough to crack the case before round 3 -----
  const pool: IFact[] = [];
  for (let s = 0; s < n; s++) for (let t = 0; t < T; t++) {
    if (s === culprit && t === crimeSlot) continue;
    pool.push({ k: 'at', s, room: pos[s][t], slot: t });
    for (const x of adj[pos[s][t]]) pool.push({ k: 'notAt', s, room: x, slot: t });
    for (let j = s + 1; j < n; j++) if (pos[j][t] === pos[s][t] && !(j === culprit && t === crimeSlot)) pool.push({ k: 'saw', a: s, b: j, room: pos[s][t], slot: t });
  }
  for (let i = 0; i < itemList.length; i++) for (let t = 0; t < T; t++) {
    if (i === means && t >= pickup && t <= crimeSlot) continue;
    pool.push({ k: 'itemIn', item: i, room: itemLoc[i][t], slot: t });
  }
  const fillerPool = shuffle(r, pool.filter((f) => !placed.some((p) => factKey(p.f) === factKey(f))));
  const early = () => placed.filter((p) => p.round <= 2).map((p) => p.f);
  const tableFacts = () => placed.filter((p) => p.where === 'board' || (p.where as number) < MIN_SEATS).map((p) => p.f);
  const takeFiller = (round: 1 | 2 | 3, board: boolean, everyTable = board): IFact | null => {
    for (let i = 0; i < fillerPool.length; i++) {
      const f = fillerPool[i];
      if (board && f.k === 'notAt' && r() < 0.5) continue; // boards favour objects and photos
      if (round <= 2) {
        const a = analyse(w, [...early(), f]);
        if (a.pairs.length <= 1) continue;
      }
      if (everyTable && anchor && isUnique(w, [...tableFacts().filter((x) => x !== anchor), f], culprit, means)) continue;
      fillerPool.splice(i, 1);
      return f;
    }
    return null;
  };
  for (const round of ROUNDS) {
    while (boardCount(round) < 2) { const f = takeFiller(round, true); if (!f) break; placed.push({ f, round, where: 'board' }); }
    for (let seat = 0; seat < MAX_SEATS; seat++) {
      if (!seatFree(round, seat)) continue;
      const f = takeFiller(round, false, seat < MIN_SEATS);
      if (f) placed.push({ f, round, where: seat });
    }
  }

  // ----- Key flags: necessary within the clues every table sees (board + seats 0..2) -----
  const minTable = placed.filter((p) => p.where === 'board' || (p.where as number) < MIN_SEATS);
  const keySet = new Set<Placed>();
  for (const p of minTable) {
    if (!isUnique(w, minTable.filter((q) => q !== p).map((q) => q.f), culprit, means)) keySet.add(p);
  }

  // ----- Build the case -----
  const slots: Slot[] = td.slots.map((label, id) => ({ id, label }));
  const truthPos: Record<string, Record<number, string>> = {};
  suspects.forEach((s, i) => { truthPos[s.id] = Object.fromEntries(pos[i].map((x, t) => [t, rid(x)])); });
  const victimName = crime.victim.charAt(0).toUpperCase() + crime.victim.slice(1);
  const crimeLine = crime.line.replace('{victim}', victimName).replace('{room}', rooms[crimeRoom].name).replace('{time}', slots[crimeSlot].label);
  const tail = tone === 'classic'
    ? `${cap(NUM_WORDS[n])} guests are still ${setting.aboard}. One of them did it, and every one of them has a story ready.`
    : `${cap(NUM_WORDS[n])} people had the chance. One of them did it, and all of them have crumbs on their conscience.`;

  // ----- Briefing slides: setting, crime, floor plan, then the cast in pairs -----
  const crimePrep = crime.what === 'vanished' ? 'from' : 'in';
  const briefing: string[] = [
    td.brief,
    `${victimName} ${crime.what} ${crimePrep} the ${rooms[crimeRoom].name} at ${slots[crimeSlot].label}.`,
    pick(r, [
      `${cap(NUM_WORDS[rooms.length])} rooms, a few doors. Nobody walks through walls, not even the guilty.`,
      `${cap(NUM_WORDS[rooms.length])} rooms. Doors only where you see them. Footsteps tell tales.`,
    ]),
  ];
  const quips = suspects.map((s, i) => `${s.shortName}: ${pick(r, arch[i].quip[tone])}.`);
  for (let i = 0; i < quips.length; i += 2) briefing.push(quips.slice(i, i + 2).join(' '));

  // ----- Reveal extras: confession, front page, clock -----
  const cArch = arch[culprit];
  const fillIn = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
  const vars = {
    V: crime.short, T: slots[crimeSlot].label, C: rooms[crimeRoom].name, I: itemList[means].name,
    H: rooms[meansDef.h].name, N: setting.headlineName, X: crime.short.replace(/^the /, '').toUpperCase(),
    R: cap(cArch.role.replace(/^the /, '')), RL: cArch.role, S: suspects[culprit].shortName ?? suspects[culprit].name,
  };
  const confession = [
    cap(fillIn(cArch.confess[tone], vars)),
    ((tpl) => {
      const full = fillIn(tpl, { ...vars, V: cap(crime.short) });
      return full.split(/\s+/).length <= 25 ? full : fillIn(tpl.replace(' from the {H}', ''), { ...vars, V: cap(crime.short) });
    })(pick(r, CONFESSION_METHOD[tone])),
    pick(r, CONFESSION_CLOSER[tone]),
  ];
  const headline = { title: fillIn(pick(r, HEADLINES[tone]), vars), sub: fillIn(pick(r, HEADLINE_SUBS), { ...vars, DETECTIVE: '{DETECTIVE}' }) };
  const firstHour = parseInt(td.slots[0], 10);
  const clockChimes = [1, 2, 3].map((k) => ((firstHour + k - 1) % 12) + 1);

  const c: Case = {
    id: `${setting.id}-${tone}-${seed}`,
    seed, tone, difficulty,
    title: pick(r, td.titles),
    place: setting.place,
    dateLine: td.dateLine,
    intro: `${td.opening} ${crimeLine} ${tail}`,
    scene: setting.scene,
    briefing,
    confession,
    headline,
    paperName: setting.paperName,
    clockChimes,
    victim: { name: victimName, description: crime.description },
    crime: { room: rid(crimeRoom), slot: crimeSlot, item: itemList[means].id, what: crime.what },
    rooms, slots, suspects, items,
    truth: { position: truthPos, culprit: sid(culprit), holder: Object.fromEntries(holder.map((h, t) => [t, h === null ? null : sid(h)])) },
    clues: [],
    lies,
  };

  const truthy: Truthy = {
    occupants: (room, t) => occupantsIdx(rIdx.get(room)!, t).filter((s) => !(s === culprit && t === crimeSlot)).map(sid),
    empty: (room, t) => occupantsIdx(rIdx.get(room)!, t).length === 0,
  };
  const order = (p: Placed) => p.round * 100 + (p.where === 'board' ? 0 : 10 + (p.where as number));
  placed.sort((a, b) => order(a) - order(b));
  let bi = 0, lastRound = 0;
  c.clues = placed.map((p): Clue => {
    if (p.round !== lastRound) { lastRound = p.round; bi = 0; }
    const id = p.where === 'board' ? `r${p.round}b${++bi}` : `r${p.round}s${p.where}`;
    const fact = toFact(p.f, sid, rid, (i) => itemList[i].id);
    let card;
    if (p.card?.card === 'embarrass' && p.card.e) {
      const e = p.card.e;
      card = embarrassmentClue(c, sid(e.s), rid(pos[e.s][e.slot]), rid(e.claimed), e.slot, e.activity, r);
    } else if (p.card?.card === 'breaker') {
      card = alibiBreakerClue(c, sid(culprit), rid(claimRoom), crimeSlot, truthy.occupants(rid(claimRoom), crimeSlot), r);
    } else {
      card = phraseClue(c, fact, r, tone, truthy, p.where === 'board');
    }
    const clue: Clue = { id, ...card, visibility: p.where === 'board' ? 'board' : 'private', round: p.round, fact };
    if (keySet.has(p)) clue.key = true;
    if (p.where !== 'board') clue.holderPlayerSlot = p.where as number;
    return clue;
  });
  void story;
  return c;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function toFact(f: IFact, sid: (i: number) => string, rid: (i: number) => string, iid: (i: number) => string): Fact {
  switch (f.k) {
    case 'at': return { k: 'at', s: sid(f.s), room: rid(f.room), slot: f.slot };
    case 'notAt': return { k: 'notAt', s: sid(f.s), room: rid(f.room), slot: f.slot };
    case 'saw': return { k: 'saw', a: sid(f.a), b: sid(f.b), room: rid(f.room), slot: f.slot };
    case 'itemIn': return { k: 'itemIn', item: iid(f.item), room: rid(f.room), slot: f.slot };
    case 'had': return { k: 'had', s: sid(f.s), item: iid(f.item), slot: f.slot };
  }
}
