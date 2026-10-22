import { describe, expect, it } from 'vitest';
import { checkReply, describeFact, objectionSlip, evaluateTheory, generateCase, proofChain, publicView, safeLiesForAccomplice, sliceFor } from '../src/index.js';
import { inMinTable } from '../src/verify.js';

const c = generateCase({ seed: 3, tone: 'classic', difficulty: 2 });
const culprit = c.truth.culprit;
const innocent = c.suspects.find((s) => s.id !== culprit && !c.lies.some((l) => l.s === s.id))!.id;
const N = (id: string) => c.suspects.find((s) => s.id === id)!.name;

describe('sliceFor', () => {
  it('gives the culprit their lie and forbids a confession', () => {
    const s = sliceFor(c, culprit);
    const crimeTime = c.slots[c.crime.slot].label;
    expect(s.mustLie.join(' ')).toContain(crimeTime);
    expect(s.knows.join(' ')).not.toContain(`At ${crimeTime} you were in`);
    expect(s.mayNotReveal.join(' ')).toMatch(/Never confess/);
    expect(s.otherSuspects).toHaveLength(c.suspects.length - 1);
  });

  it('tells innocents only true things and never the culprit', () => {
    const s = sliceFor(c, innocent);
    expect(s.mustLie).toHaveLength(0);
    const room = c.rooms.find((r) => r.id === c.truth.position[innocent][0])!.name;
    expect(s.knows).toContain(`At ${c.slots[0].label} you were in the ${room}.`);
    expect(s.mayNotReveal.join(' ')).toMatch(/do not know who did it/);
    expect(JSON.stringify(s)).not.toMatch(/culprit"/);
  });

  it('gives embarrassed innocents a resolvable lie', () => {
    const lie = c.lies.find((l) => l.reason === 'embarrassment')!;
    const s = sliceFor(c, lie.s);
    expect(s.mustLie[0]).toMatch(/proof/);
  });
});

describe('checkReply', () => {
  const crime = { kind: 'location' as const, s: culprit, room: c.crime.room, slot: c.crime.slot };
  const guilt = c.lies.find((l) => l.reason === 'guilt')!;

  it('allows the culprit their own lie', () => {
    expect(checkReply(c, culprit, [{ kind: 'location', s: culprit, room: guilt.claimedRoom, slot: guilt.slot }]).ok).toBe(true);
  });
  it('flags a confession and a give-away', () => {
    expect(checkReply(c, culprit, [crime]).ok).toBe(false);
    expect(checkReply(c, innocent, [crime]).ok).toBe(false);
  });
  it('flags unapproved falsehoods', () => {
    const truth = c.truth.position[innocent][0];
    const wrong = c.rooms.find((r) => r.id !== truth)!.id;
    const res = checkReply(c, innocent, [{ kind: 'location', s: innocent, room: wrong, slot: 0 }]);
    expect(res.ok).toBe(false);
    expect(res.violations[0]).toContain(N(innocent));
  });
  it('accepts the truth, and flags things the speaker could not have seen', () => {
    expect(checkReply(c, innocent, [{ kind: 'location', s: innocent, room: c.truth.position[innocent][1], slot: 1 }]).ok).toBe(true);
    const other = c.suspects.find((s) => s.id !== innocent && c.truth.position[s.id][0] !== c.truth.position[innocent][0]);
    if (other) expect(checkReply(c, innocent, [{ kind: 'location', s: other.id, room: c.truth.position[other.id][0], slot: 0 }]).ok).toBe(false);
  });
});

describe('evaluateTheory', () => {
  const all = c.clues.filter(inMinTable).map((cl) => cl.id);
  it('follows with every clue, contradicted for the wrong person', async () => {
    expect(await evaluateTheory(c, all, { culprit })).toBe('follows');
    expect(await evaluateTheory(c, all, { culprit, item: c.crime.item })).toBe('follows');
    expect(await evaluateTheory(c, all, { culprit: innocent })).toBe('contradicted');
    const decoy = c.items.find((i) => i.id !== c.crime.item)!.id;
    expect(await evaluateTheory(c, all, { culprit, item: decoy })).toBe('contradicted');
  });
  it('is only possible with nothing pinned', async () => {
    expect(await evaluateTheory(c, [], { culprit })).toBe('possible');
    expect(await evaluateTheory(c, [], { culprit: innocent })).toBe('possible');
  });
});

describe('proofChain', () => {
  it('walks from clues to the culprit, eliminating everyone else', () => {
    const steps = proofChain(c);
    expect(steps.length).toBeGreaterThan(1);
    for (const s of steps) expect(c.clues.some((cl) => cl.id === s.clueId)).toBe(true);
    const out = new Set(steps.flatMap((s) => s.eliminates ?? []));
    for (const s of c.suspects) expect(out.has(s.id)).toBe(s.id !== culprit);
    expect(steps[steps.length - 1].therefore).toContain(N(culprit));
  });
});

describe('safeLiesForAccomplice', () => {
  it('returns 1 to 3 false statements', () => {
    const lies = safeLiesForAccomplice(c);
    expect(lies.length).toBeGreaterThanOrEqual(1);
    expect(lies.length).toBeLessThanOrEqual(3);
    for (const l of lies) {
      expect(l.fact.k).toBe('at');
      if (l.fact.k === 'at') expect(c.truth.position[l.fact.s][l.fact.slot]).not.toBe(l.fact.room);
    }
  });
});

describe('publicView and describeFact', () => {
  it('strips the solution', () => {
    const p = publicView(c);
    const json = JSON.stringify(p);
    expect(json).not.toContain('truth');
    expect(json).not.toContain('"lies"');
    expect(json).not.toContain('alibi');
    expect(json).not.toContain('"clues"');
    expect((p.crime as Record<string, unknown>).item).toBeUndefined();
  });
  it('describes facts plainly', () => {
    expect(describeFact(c, { k: 'at', s: culprit, room: c.crime.room, slot: 0 })).toBe(`${N(culprit)} was in the ${c.rooms.find((r) => r.id === c.crime.room)!.name} at ${c.slots[0].label}.`);
  });
});

describe('objectionSlip', () => {
  it('makes liars slip a true fact, and the culprit never confesses', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const k = generateCase({ seed, tone: seed % 2 ? 'classic' : 'cozy', difficulty: 2 });
      for (const s of k.suspects) {
        const o = objectionSlip(k, s.id);
        const lies = k.lies.some((l) => l.s === s.id);
        expect(o.wasLying).toBe(lies);
        if (o.wasLying && 'slip' in o) {
          const f = o.fact;
          if (f.k === 'at') {
            expect(k.truth.position[f.s][f.slot]).toBe(f.room);
            expect(f.s === k.truth.culprit && f.slot === k.crime.slot).toBe(false);
          }
          if (f.k === 'notAt') expect(k.truth.position[f.s][f.slot]).not.toBe(f.room);
          expect(o.slip).not.toMatch(/\u2014/);
        } else if ('retort' in o) {
          expect(o.retort.length).toBeGreaterThan(5);
        }
      }
    }
  });
});

describe('objectionSlip with claims', () => {
  it('slips only when that answer contained a lie', () => {
    const guilt = c.lies.find((l) => l.reason === 'guilt')!;
    const lied = objectionSlip(c, culprit, [{ kind: 'location', s: culprit, room: guilt.claimedRoom, slot: guilt.slot }]);
    expect(lied.wasLying).toBe(true);
    expect(lied.fact && lied.fact.k === 'at' && lied.fact.slot !== c.crime.slot).toBe(true);
    const honest = objectionSlip(c, culprit, [{ kind: 'location', s: culprit, room: c.truth.position[culprit][0], slot: 0 }]);
    expect(honest.wasLying).toBe(false);
    expect(honest.line.length).toBeGreaterThan(5);
  });
});
