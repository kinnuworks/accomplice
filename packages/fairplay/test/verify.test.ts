import { afterAll, describe, expect, it } from 'vitest';
import { generateCase, generateVerifiedCase, shutdownSolver, verifyCase } from '../src/index.js';
import { analyse, toIFact, worldOf } from '../src/logic.js';
import { inMinTable } from '../src/verify.js';

const BULK = Number(process.env.FAIRPLAY_SEEDS ?? 200);
const median = (xs: number[]) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };

afterAll(async () => { await shutdownSolver(); });

describe('verifyCase (Z3)', () => {
  for (const tone of ['classic', 'cozy'] as const) {
    it(`verifies ${BULK} ${tone} seeds`, async () => {
      let pass = 0;
      const ms: number[] = [];
      const failures: string[] = [];
      for (let seed = 1; seed <= BULK; seed++) {
        const c = generateCase({ seed, tone, difficulty: ((seed % 3) + 1) as 1 | 2 | 3 });
        const rep = await verifyCase(c);
        ms.push(rep.ms);
        if (rep.ok) {
          pass++;
          expect(rep.culprit).toBe(c.truth.culprit);
          expect(rep.solvableByRound).not.toBe(1);
        } else failures.push(`${c.id}: ${rep.notes.join(' ')}`);
      }
      console.log(`[fairplay] ${tone}: ${pass}/${BULK} verified (${((100 * pass) / BULK).toFixed(1)}%), median verify ${median(ms)} ms`);
      if (failures.length) console.log(failures.slice(0, 5).join('\n'));
      expect(pass / BULK).toBeGreaterThanOrEqual(0.95);
    }, 900_000);
  }

  it('finds exactly one culprit, and every key clue is necessary', async () => {
    const { c, report } = await generateVerifiedCase({ seed: 7, tone: 'classic', difficulty: 3 });
    expect(report.ok).toBe(true);
    expect(report.uniqueCulprit).toBe(true);
    const m = worldOf(c);
    const table = c.clues.filter(inMinTable);
    const all = analyse(m.w, table.map((cl) => toIFact(cl.fact, m)));
    expect(all.culprits).toEqual([m.sIdx.get(c.truth.culprit)]);
    expect(report.keyClues.length).toBeGreaterThan(0);
    for (const id of report.keyClues) {
      const a = analyse(m.w, table.filter((cl) => cl.id !== id).map((cl) => toIFact(cl.fact, m)));
      expect(a.pairs.length, `removing ${id}`).toBeGreaterThan(1);
    }
    // With no clues at all, anyone could have done it.
    expect(analyse(m.w, []).culprits.length).toBe(c.suspects.length);
  });

  it('rejects a broken case', async () => {
    const c = generateCase({ seed: 11, tone: 'cozy', difficulty: 2 });
    const broken = { ...c, clues: c.clues.filter((cl) => !cl.key) };
    const rep = await verifyCase(broken);
    expect(rep.ok).toBe(false);
    expect(rep.uniqueCulprit).toBe(false);
  });

  it('generateVerifiedCase returns tries', async () => {
    const r = await generateVerifiedCase({ seed: 100, tone: 'cozy', difficulty: 2 });
    expect(r.report.ok).toBe(true);
    expect(r.tries).toBeGreaterThanOrEqual(1);
    expect(r.c.seed).toBe(100 + r.tries - 1);
  });
});
