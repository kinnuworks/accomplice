// Independent verification with the Z3 SMT solver.
// The generator builds cases with the small reasoner in logic.ts; this file re-encodes the same
// model for Z3 and checks the claims that make a case fair. If the two disagree, the case fails.
import type { Case, Clue, Fact, VerifyReport } from '@accomplice/protocol';
import { init, killThreads } from 'z3-solver';
import { analyse, toIFact, worldOf } from './logic.js';
import { MIN_SEATS } from './generate.js';
import { safeLiesForAccomplice, slipFact } from './proof.js';

type Api = Awaited<ReturnType<typeof init>>;
let apiP: Promise<{ api: Api; ctx: any }> | null = null;
let ctxCount = 0;

async function z3() {
  if (!apiP) apiP = init().then((api) => ({ api, ctx: api.Context(`fairplay${ctxCount++}` as 'main') }));
  return apiP;
}

/** Stop Z3's worker threads so a Node process can exit. Safe to call more than once. */
export async function shutdownSolver(): Promise<void> {
  if (!apiP) return;
  const { api } = await apiP;
  apiP = null;
  await killThreads(api.em);
}

/** Clues every table sees: the board plus private clues for seats 0..2. */
export const inMinTable = (cl: Clue) => cl.visibility === 'board' || (cl.holderPlayerSlot ?? 99) < MIN_SEATS;

export interface Encoding {
  solver: any;
  ctx: any;
  culprit: any;
  means: any;
  factExpr: (f: Fact) => any;
  lit: (name: string, f: Fact) => any;
  truthExpr: () => any;
  release: () => void;
}

export async function encode(c: Case): Promise<Encoding> {
  const { ctx: Z } = await z3();
  const rIdx = new Map(c.rooms.map((r, i) => [r.id, i]));
  const sIdx = new Map(c.suspects.map((s, i) => [s.id, i]));
  const iIdx = new Map(c.items.map((s, i) => [s.id, i]));
  const R = c.rooms.length, T = c.slots.length, n = c.suspects.length, I = c.items.length;
  const solver = new Z.Solver('QF_BV');
  const BV = (name: string) => Z.BitVec.const(name, 4);
  const v = (x: number) => Z.BitVec.val(x, 4);
  const pos = c.suspects.map((_, s) => c.slots.map((_, t) => BV(`pos_${s}_${t}`)));
  const loc = c.items.map((_, i) => c.slots.map((_, t) => BV(`loc_${i}_${t}`)));
  const held = c.items.map((_, i) => c.slots.map((_, t) => Z.Bool.const(`held_${i}_${t}`)));
  const culprit = BV('culprit');
  const means = BV('means');
  const crimeRoom = rIdx.get(c.crime.room)!, cs = c.crime.slot;

  solver.add(culprit.ult(n), means.ult(I));
  // Movement: stay put or step through a door.
  for (let s = 0; s < n; s++) {
    for (let t = 0; t < T; t++) solver.add(pos[s][t].ult(R));
    for (let t = 0; t + 1 < T; t++) {
      for (let a = 0; a < R; a++) {
        const next = [a, ...c.rooms[a].adjacent.map((x) => rIdx.get(x)!)];
        solver.add(Z.Implies(pos[s][t].eq(v(a)), Z.Or(...next.map((b) => pos[s][t + 1].eq(v(b))))));
      }
    }
  }
  // The culprit is in the crime room at the crime slot.
  for (let k = 0; k < n; k++) solver.add(Z.Implies(culprit.eq(v(k)), pos[k][cs].eq(v(crimeRoom))));
  // Items.
  for (let i = 0; i < I; i++) {
    const home = rIdx.get(c.items[i].homeRoom)!;
    solver.add(loc[i][0].eq(v(home)));
    for (let t = 0; t < T; t++) {
      solver.add(loc[i][t].ult(R));
      solver.add(Z.Implies(means.neq(v(i)), Z.And(loc[i][t].eq(v(home)), Z.Not(held[i][t]))));
      for (let k = 0; k < n; k++) solver.add(Z.Implies(Z.And(held[i][t], culprit.eq(v(k))), loc[i][t].eq(pos[k][t])));
      if (t > 0) {
        solver.add(Z.Implies(Z.Not(held[i][t]), loc[i][t].eq(loc[i][t - 1])));
        solver.add(Z.Implies(Z.And(held[i][t], Z.Not(held[i][t - 1])), loc[i][t].eq(loc[i][t - 1])));
      }
    }
    solver.add(Z.Implies(means.eq(v(i)), held[i][cs]));
  }

  const factExpr = (f: Fact): any => {
    switch (f.k) {
      case 'at': return pos[sIdx.get(f.s)!][f.slot].eq(v(rIdx.get(f.room)!));
      case 'notAt': return pos[sIdx.get(f.s)!][f.slot].neq(v(rIdx.get(f.room)!));
      case 'saw': return Z.And(pos[sIdx.get(f.a)!][f.slot].eq(v(rIdx.get(f.room)!)), pos[sIdx.get(f.b)!][f.slot].eq(v(rIdx.get(f.room)!)));
      case 'had': return Z.And(culprit.eq(v(sIdx.get(f.s)!)), held[iIdx.get(f.item)!][f.slot]);
      case 'itemIn': return loc[iIdx.get(f.item)!][f.slot].eq(v(rIdx.get(f.room)!));
    }
  };
  let litN = 0;
  const lit = (name: string, f: Fact) => {
    const b = Z.Bool.const(`lit_${litN++}_${name}`);
    solver.add(Z.Implies(b, factExpr(f)));
    return b;
  };
  const truthExpr = () => {
    const parts: any[] = [culprit.eq(v(sIdx.get(c.truth.culprit)!)), means.eq(v(iIdx.get(c.crime.item)!))];
    for (const s of c.suspects) for (let t = 0; t < T; t++) parts.push(pos[sIdx.get(s.id)!][t].eq(v(rIdx.get(c.truth.position[s.id][t])!)));
    const mi = iIdx.get(c.crime.item)!;
    for (let t = 0; t < T; t++) parts.push(c.truth.holder[t] ? held[mi][t] : Z.Not(held[mi][t]));
    return Z.And(...parts);
  };
  return { solver, ctx: Z, culprit, means, factExpr, lit, truthExpr, release: () => { try { solver.release?.(); } catch { /* ignore */ } } };
}

interface Answer { sat: boolean; culprit: number | null; means: number | null; unique: boolean; uniqueCulprit: boolean }

let blockN = 0;
async function solveUnique(e: Encoding, lits: any[]): Promise<Answer> {
  const Z = e.ctx;
  const v = (x: number) => Z.BitVec.val(x, 4);
  if ((await e.solver.check(...lits)) !== 'sat') return { sat: false, culprit: null, means: null, unique: false, uniqueCulprit: false };
  const m = e.solver.model();
  const k0 = Number(m.eval(e.culprit, true).value());
  const m0 = Number(m.eval(e.means, true).value());
  // Block this answer and ask for any other.
  const blockPair = Z.Bool.const(`block_${blockN++}`);
  e.solver.add(Z.Implies(blockPair, Z.Or(e.culprit.neq(v(k0)), e.means.neq(v(m0)))));
  const unique = (await e.solver.check(...lits, blockPair)) === 'unsat';
  let uniqueCulprit = unique;
  if (!unique) {
    const blockC = Z.Bool.const(`block_${blockN++}`);
    e.solver.add(Z.Implies(blockC, e.culprit.neq(v(k0))));
    uniqueCulprit = (await e.solver.check(...lits, blockC)) === 'unsat';
  }
  return { sat: true, culprit: k0, means: m0, unique, uniqueCulprit };
}

export async function verifyCase(c: Case): Promise<VerifyReport> {
  const t0 = performance.now();
  const notes: string[] = [];
  const e = await encode(c);
  try {
    const lits = new Map(c.clues.map((cl) => [cl.id, e.lit(cl.id, cl.fact)]));
    const minTable = c.clues.filter(inMinTable);
    const L = (cls: Clue[]) => cls.map((cl) => lits.get(cl.id)!);
    const culpritIdx = c.suspects.findIndex((s) => s.id === c.truth.culprit);
    const meansIdx = c.items.findIndex((i) => i.id === c.crime.item);
    const js = worldOf(c);
    const jsUnique = (cls: Clue[]) => {
      const a = analyse(js.w, cls.map((cl) => toIFact(cl.fact, js)));
      return a.consistent && a.pairs.length === 1;
    };

    // (0) The true story satisfies the model and every clue.
    const truthLit = e.ctx.Bool.const('truth');
    e.solver.add(e.ctx.Implies(truthLit, e.truthExpr()));
    const truthOk = (await e.solver.check(...L(c.clues), truthLit)) === 'sat';
    // (Facts are switched on per query with push/pop below.)
    if (!truthOk) notes.push('The true story contradicts a clue or the movement rules.');

    // (1) Exactly one culprit (and one means) with the clues every table sees, and with all clues.
    const main = await solveUnique(e, L(minTable));
    const full = await solveUnique(e, L(c.clues));
    const uniqueCulprit = main.sat && main.uniqueCulprit && main.culprit === culpritIdx;
    if (!main.sat) notes.push('Clues are contradictory.');
    if (!main.uniqueCulprit) notes.push('More than one culprit fits the clues every table sees.');
    if (main.uniqueCulprit && main.culprit !== culpritIdx) notes.push('Z3 found a different culprit from the intended one.');
    if (!main.unique) notes.push('The means is not uniquely determined.');
    if (!full.unique) notes.push('With every seat\'s clues the answer is not unique.');
    if (jsUnique(minTable) !== main.unique) notes.push('Z3 and the built-in reasoner disagree on uniqueness.');

    // (2) Key clue necessity: remove each clue, is uniqueness lost?
    const keyClues: string[] = [];
    if (main.unique) {
      for (const cl of minTable) {
        const rest = minTable.filter((x) => x !== cl);
        const a = await solveUnique(e, L(rest));
        if (!a.unique) keyClues.push(cl.id);
      }
    }
    const flagged = c.clues.filter((cl) => cl.key).map((cl) => cl.id).sort();
    const keyAgree = JSON.stringify(flagged) === JSON.stringify(keyClues.slice().sort());
    if (!keyAgree) notes.push(`Key clue flags disagree with Z3 (flagged ${flagged.join(',')}; Z3 ${keyClues.join(',')}).`);
    if (!keyClues.length) notes.push('No single clue is necessary (the case is very redundant).');

    // (3) Earliest round at which the case can be solved.
    let solvableByRound: 1 | 2 | 3 | null = null;
    for (const rd of [1, 2, 3] as const) {
      const a = await solveUnique(e, L(minTable.filter((cl) => cl.round <= rd)));
      if (a.unique) { solvableByRound = rd; break; }
    }
    const fullR1 = await solveUnique(e, L(c.clues.filter((cl) => cl.round === 1)));
    if (fullR1.unique) notes.push('A full table could solve it in round 1.');
    if (solvableByRound === 1) notes.push('Solvable in round 1: too easy.');

    // (4) Accomplice lies keep exactly one answer.
    const lies = safeLiesForAccomplice(c);
    let safe = 0;
    for (const lie of lies) {
      const a = await solveUnique(e, [...L(c.clues), e.lit('lie', lie.fact)]);
      if (a.sat && a.unique && a.culprit === culpritIdx) safe++;
      else notes.push(`Accomplice lie is not safe: ${lie.text}`);
    }

    // (5) Objection slips: revealing any one of them in round 1 must not crack the case early.
    let slipsOk = true;
    for (const s of c.suspects) {
      const sf = slipFact(c, s.id);
      if (!sf) continue;
      const a = await solveUnique(e, [...L(c.clues.filter((cl) => cl.round === 1)), e.lit('slip', sf.fact)]);
      if (a.unique) { slipsOk = false; notes.push(`Objection slip for ${s.id} would solve the case in round 1.`); }
    }

    const ok = truthOk && uniqueCulprit && main.unique && full.unique && keyAgree && keyClues.length > 0
      && (solvableByRound === 2 || solvableByRound === 3) && !fullR1.unique && slipsOk && safe === lies.length && lies.length > 0;
    return {
      ok,
      uniqueCulprit,
      culprit: main.uniqueCulprit && main.culprit !== null ? c.suspects[main.culprit].id : null,
      keyClues,
      solvableByRound,
      safeAccompliceLies: safe,
      ms: Math.round(performance.now() - t0),
      notes,
    };
  } finally {
    e.release();
  }
}
