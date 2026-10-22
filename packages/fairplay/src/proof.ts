// Reasoning helpers built on the plain reasoner: theories, the reveal's proof chain, accomplice lies.
import type { AccompliceLie, Case, Claim, Clue, Fact, ObjectionResult, ProofStep, Theory, TheoryVerdict } from '@accomplice/protocol';
import { RETORTS } from './content.js';
import { analyse, dist, isUnique, toIFact, worldOf } from './logic.js';
import { MIN_SEATS } from './generate.js';
import { hashString, makeRng, shuffle } from './rng.js';
import { describeFact, namesOf } from './text.js';

const minTable = (c: Case) => c.clues.filter((cl) => cl.visibility === 'board' || (cl.holderPlayerSlot ?? 99) < MIN_SEATS);

/** Does the theory follow from the pinned clues (plus what everyone knows about the crime)? */
export async function evaluateTheory(c: Case, pinnedClueIds: string[], theory: Theory): Promise<TheoryVerdict> {
  const m = worldOf(c);
  const facts = c.clues.filter((cl) => pinnedClueIds.includes(cl.id)).map((cl) => toIFact(cl.fact, m));
  const a = analyse(m.w, facts);
  const k = m.sIdx.get(theory.culprit);
  const it = theory.item !== undefined ? m.iIdx.get(theory.item) : undefined;
  if (k === undefined || (theory.item !== undefined && it === undefined)) return 'contradicted';
  const matches = (p: [number, number]) => p[0] === k && (it === undefined || p[1] === it);
  if (!a.consistent || !a.pairs.some(matches)) return 'contradicted';
  return a.pairs.every(matches) ? 'follows' : 'possible';
}

/** Ordered steps from clues to the answer, for the reveal. */
export function proofChain(c: Case): ProofStep[] {
  const m = worldOf(c);
  const N = namesOf(c);
  const D = dist(m.w.adj);
  const culprit = m.sIdx.get(c.truth.culprit)!, means = m.iIdx.get(c.crime.item)!;
  const table = minTable(c);
  // A small sufficient set: key clues, then others by round until unique, then prune extras.
  let chosen: Clue[] = table.filter((cl) => cl.key);
  const facts = (cls: Clue[]) => cls.map((cl) => toIFact(cl.fact, m));
  for (const cl of table.filter((x) => !x.key).sort((a, b) => a.round - b.round)) {
    if (isUnique(m.w, facts(chosen), culprit, means)) break;
    chosen.push(cl);
  }
  for (const cl of chosen.filter((x) => !x.key).reverse()) {
    const rest = chosen.filter((x) => x !== cl);
    if (isUnique(m.w, facts(rest), culprit, means)) chosen = rest;
  }
  const breaker = c.clues.find((cl) => cl.fact.k === 'notAt' && cl.fact.s === c.truth.culprit && cl.fact.slot === c.crime.slot);
  const crimeRoom = N.room(c.crime.room), time = N.slot(c.crime.slot);

  const steps: ProofStep[] = [];
  let used: Clue[] = [];
  let a = analyse(m.w, []);
  let remaining = chosen.slice();
  while (remaining.length) {
    // Next: the clue that rules out the most, earliest round first on ties.
    let best = remaining[0], bestScore = -1, bestA = a;
    for (const cl of remaining) {
      const na = analyse(m.w, facts([...used, cl]));
      const score = (a.culprits.length - na.culprits.length) * 10 + (a.means.length - na.means.length) * 3 - cl.round * 0.1;
      if (score > bestScore) { best = cl; bestScore = score; bestA = na; }
    }
    const goneS = a.culprits.filter((x) => !bestA.culprits.includes(x));
    const goneI = a.means.filter((x) => !bestA.means.includes(x));
    steps.push({
      clueId: best.id,
      says: describeFact(c, best.fact),
      therefore: therefore(best.fact, goneS.map((s) => c.suspects[s].id), goneI.map((i) => c.items[i].id)),
      eliminates: goneS.length ? goneS.map((s) => c.suspects[s].id) : undefined,
    });
    used = [...used, best];
    remaining = remaining.filter((x) => x !== best);
    a = bestA;
  }
  const S = N.suspect(c.truth.culprit), item = N.item(c.crime.item);
  const home = N.room(c.items[means].homeRoom);
  const finale = `Everyone else is ruled out. ${S} took the ${item} from the ${home} and was in the ${crimeRoom} at ${time}.`;
  if (breaker) {
    steps.push({ clueId: breaker.id, says: describeFact(c, breaker.fact), therefore: `So ${S} lied about ${time}. ${finale}` });
  } else if (steps.length) {
    steps[steps.length - 1].therefore += ` ${finale}`;
  }
  return steps;

  function therefore(f: Fact, goneS: string[], goneI: string[]): string {
    const parts: string[] = [];
    if (goneS.length) {
      const names = list(goneS.map(N.suspect));
      const subj = 's' in f ? f.s : f.k === 'saw' ? (goneS.includes(f.a) ? f.a : f.b) : null;
      if (subj && goneS.length === 1 && goneS[0] === subj && f.k !== 'itemIn') {
        const room = 'room' in f ? f.room : '';
        if ((f.k === 'at' || f.k === 'saw') && f.slot !== c.crime.slot) {
          const steps = D[m.rIdx.get(room)!][m.rIdx.get(c.crime.room)!];
          const gap = Math.abs(f.slot - c.crime.slot);
          parts.push(steps > gap
            ? (f.slot < c.crime.slot
              ? `From the ${N.room(room)} at ${N.slot(f.slot)}, ${names} could not have reached the ${crimeRoom} by ${time}.`
              : `Nobody in the ${crimeRoom} at ${time} could have reached the ${N.room(room)} by ${N.slot(f.slot)}, so ${names} was not there.`)
            : `With that, ${names} has no way to fit the crime into the timeline.`);
        } else if ((f.k === 'at' || f.k === 'saw') && f.slot === c.crime.slot) {
          parts.push(`So ${names} was elsewhere at ${time}, and could not have done it.`);
        } else {
          parts.push(`So ${names} could not have done it.`);
        }
      } else {
        parts.push(`Put that together with what we know, and ${names} ${goneS.length > 1 ? 'are' : 'is'} in the clear.`);
      }
    }
    if (goneI.length) {
      parts.push(`So the ${list(goneI.map(N.item))} could not have been in the ${crimeRoom} at ${time}. ${goneI.length > 1 ? 'They were' : 'It was'} not used.`);
    }
    if (!parts.length) parts.push('On its own it proves nothing. Hold on to it.');
    return parts.join(' ');
  }
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** 1 to 3 false statements the accomplice may say aloud without breaking the case. */
export function safeLiesForAccomplice(c: Case): AccompliceLie[] {
  const m = worldOf(c);
  const N = namesOf(c);
  const r = makeRng(hashString(`lies|${c.id}|${c.seed}`));
  const culprit = m.sIdx.get(c.truth.culprit)!, means = m.iIdx.get(c.crime.item)!;
  const all = c.clues.map((cl) => toIFact(cl.fact, m));
  const out: AccompliceLie[] = [];
  const usedS = new Set<string>();
  const cands: Fact[] = [];
  for (const s of c.suspects) {
    for (const slot of c.slots) {
      if (s.id === c.truth.culprit && slot.id === c.crime.slot) continue;
      const truth = c.truth.position[s.id][slot.id];
      const prev = slot.id > 0 ? c.truth.position[s.id][slot.id - 1] : null;
      const next = slot.id < c.slots.length - 1 ? c.truth.position[s.id][slot.id + 1] : null;
      for (const room of c.rooms) {
        if (room.id === truth) continue;
        const near = (x: string | null) => x === null || x === room.id || room.adjacent.includes(x);
        if (near(prev) && near(next)) cands.push({ k: 'at', s: s.id, room: room.id, slot: slot.id });
      }
    }
  }
  // Prefer lies that point at innocents near the crime: they stir the pot the most.
  const score = (f: Fact) => (f.k === 'at' && f.s !== c.truth.culprit ? 2 : 0) + (f.k === 'at' && f.room === c.crime.room ? 1 : 0) + r();
  const ordered = shuffle(r, cands).sort((a, b) => score(b) - score(a));
  for (const f of ordered) {
    if (out.length >= 3) break;
    if (f.k !== 'at' || usedS.has(f.s)) continue;
    if (!isUnique(m.w, [...all, toIFact(f, m)], culprit, means)) continue;
    usedS.add(f.s);
    out.push({ text: `I'm almost certain I saw ${N.suspect(f.s)} in the ${N.room(f.room)} at ${N.slot(f.slot)}.`, fact: f });
  }
  return out;
}

/** Objection result: the protocol shape plus the coordinator's slip/retort names. */
export type Objection = ObjectionResult & ({ wasLying: true; slip: string; fact: Fact } | { wasLying: false; retort: string });

/** Would revealing this fact (on top of all round 1 clues) let a table solve the case in round 1? */
export function tooRevealing(c: Case, f: Fact): boolean {
  const m = worldOf(c);
  const r1 = c.clues.filter((cl) => cl.round === 1).map((cl) => toIFact(cl.fact, m));
  const a = analyse(m.w, [...r1, toIFact(f, m)]);
  return a.pairs.length <= 1;
}

/**
 * The true fact a suspect lets slip when a player objects, or null if they were not lying.
 * `said` is the claims extracted from their last answer (or the raw text). Without it, any lie
 * the suspect is keeping up counts.
 */
export function slipFact(c: Case, suspectId: string, said?: Claim[] | string): { fact: Fact; lieSlot: number; weak: boolean } | null {
  let lies = c.lies.filter((l) => l.s === suspectId);
  if (Array.isArray(said)) {
    // Only lies actually told in that answer.
    lies = lies.filter((l) => said.some((cl) => cl.kind === 'location' && cl.s === suspectId && cl.slot === l.slot && cl.room !== l.trueRoom));
  } else if (typeof said === 'string' && said.trim()) {
    const N = namesOf(c);
    const text = said.toLowerCase();
    const hit = lies.filter((l) => text.includes(N.room(l.claimedRoom).toLowerCase()) || text.includes(N.slot(l.slot).toLowerCase().replace(' pm', '')));
    if (hit.length) lies = hit;
  }
  if (!lies.length) return null;
  const lie = lies.find((l) => l.reason === 'embarrassment');
  if (lie) {
    const strong: Fact = { k: 'at', s: suspectId, room: lie.trueRoom, slot: lie.slot };
    if (!tooRevealing(c, strong)) return { fact: strong, lieSlot: lie.slot, weak: false };
    return { fact: { k: 'notAt', s: suspectId, room: lie.claimedRoom, slot: lie.slot }, lieSlot: lie.slot, weak: true };
  }
  // Only the crime alibi is in play. Never confess: admit a nearby true whereabouts instead.
  const cs = c.crime.slot;
  const slots = c.slots.map((s) => s.id).filter((t) => t !== cs).sort((a, b) => Math.abs(a - cs) - Math.abs(b - cs) || a - b);
  const cands = slots.map((t) => ({ k: 'at', s: suspectId, room: c.truth.position[suspectId][t], slot: t }) as Fact);
  const fact = cands.find((f) => !tooRevealing(c, f)) ?? cands[cands.length - 1];
  return { fact, lieSlot: cs, weak: true };
}

/** A player shouts "Objection!" at a suspect. Returns a flustered true admission, or an indignant retort. */
export function objectionSlip(c: Case, suspectId: string, said?: Claim[] | string): Objection {
  const N = namesOf(c);
  const r = makeRng(hashString(`objection|${c.id}|${suspectId}|${JSON.stringify(said ?? '')}`));
  const sf = slipFact(c, suspectId, said);
  if (!sf) {
    const retort = RETORTS[c.tone][Math.floor(r() * RETORTS[c.tone].length)];
    return { wasLying: false, line: retort, retort };
  }
  const f = sf.fact;
  let slip: string;
  if (f.k === 'at' && !sf.weak) {
    const lie = c.lies.find((l) => l.s === suspectId && l.slot === f.slot)!;
    const doing = lie.detail ? ` I was ${lie.detail}.` : '';
    slip = `Oh, very well. At ${N.slot(f.slot)} I was in the ${N.room(f.room)}, not the ${N.room(lie.claimedRoom)}.${doing} Happy now?`;
  } else if (f.k === 'notAt') {
    slip = `Fine! At ${N.slot(f.slot)} I was not exactly in the ${N.room(f.room)}. Can we leave it there?`;
  } else if (f.k === 'at') {
    slip = c.tone === 'classic'
      ? `All right, all right. I may have passed through the ${N.room(f.room)} at ${N.slot(f.slot)}. Passing through is not a crime.`
      : `Okay, okay! Maybe I was in the ${N.room(f.room)} at ${N.slot(f.slot)}. Just for a minute. That proves nothing!`;
  } else {
    slip = 'Oh, very well. I may have bent the truth a little.';
  }
  return { wasLying: true, line: slip, slip, fact: f, factText: describeFact(c, f) };
}
