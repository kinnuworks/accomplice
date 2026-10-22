import { describe, expect, it } from 'vitest';
import type { Case, Fact } from '@accomplice/protocol';
import { generateCase } from '../src/index.js';
import { ARCHETYPES, SETTINGS } from '../src/content.js';

const tones = ['classic', 'cozy'] as const;
const seeds = Array.from({ length: 40 }, (_, i) => i + 1);

function factTrue(c: Case, f: Fact): boolean {
  const P = c.truth.position;
  const means = c.crime.item;
  const holderSlots = Object.keys(c.truth.holder).map(Number).filter((t) => c.truth.holder[t]);
  const itemRoom = (item: string, t: number) => {
    const home = c.items.find((i) => i.id === item)!.homeRoom;
    if (item !== means) return home;
    const h = c.truth.holder[t];
    if (h) return P[h][t];
    return t < Math.min(...holderSlots) ? home : c.crime.room;
  };
  switch (f.k) {
    case 'at': return P[f.s][f.slot] === f.room;
    case 'notAt': return P[f.s][f.slot] !== f.room;
    case 'saw': return P[f.a][f.slot] === f.room && P[f.b][f.slot] === f.room;
    case 'had': return f.item === means && c.truth.holder[f.slot] === f.s;
    case 'itemIn': return itemRoom(f.item, f.slot) === f.room;
  }
}

function allText(c: Case): string[] {
  return [c.title, c.intro, c.place, c.dateLine, c.victim.name, c.victim.description, c.crime.what,
    ...c.suspects.flatMap((s) => [s.name, s.role, s.motive, ...s.traits]),
    ...c.clues.flatMap((cl) => [cl.title, cl.text, cl.short ?? '']), ...(c.briefing ?? []), ...(c.confession ?? []), c.headline?.title ?? '', (c.headline?.sub ?? '').replace('{DETECTIVE}', 'Sam'), ...c.suspects.map((s) => s.shortName ?? ''), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name)];
}

describe('content banks', () => {
  it('floor plans fit a 16x9 grid, do not overlap, and doors join touching rooms', () => {
    for (const s of SETTINGS) {
      expect(s.rooms.length).toBeGreaterThanOrEqual(5);
      expect(s.rooms.length).toBeLessThanOrEqual(7);
      const cells = new Set<string>();
      for (const r of s.rooms) {
        expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 16 && r.y + r.h <= 9).toBe(true);
        for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
          expect(cells.has(`${x},${y}`), `${s.id}/${r.id} overlaps`).toBe(false);
          cells.add(`${x},${y}`);
        }
      }
      for (const [a, b] of s.doors) {
        const A = s.rooms.find((r) => r.id === a)!, B = s.rooms.find((r) => r.id === b)!;
        const vertical = (A.x + A.w === B.x || B.x + B.w === A.x) && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) >= 1;
        const horizontal = (A.y + A.h === B.y || B.y + B.h === A.y) && Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) >= 1;
        expect(vertical || horizontal, `${s.id}: ${a}-${b} do not share a wall`).toBe(true);
      }
    }
  });

  it('has the ten portrait archetypes and the three named settings', () => {
    expect(ARCHETYPES.map((a) => a.portrait).sort()).toEqual(['artist', 'butler', 'colonel', 'cook', 'doctor', 'gardener', 'heiress', 'journalist', 'magician', 'nephew'].map((x) => `portraits/${x}.webp`));
    expect(SETTINGS.map((s) => s.name)).toEqual(expect.arrayContaining(['Ashby Hall', 'The Sapphire Express', 'Marigold Manor']));
  });
});

describe('generateCase', () => {
  it('is deterministic for a given seed', () => {
    for (const tone of tones) {
      const a = generateCase({ seed: 42, tone, difficulty: 2 });
      const b = generateCase({ seed: 42, tone, difficulty: 2 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(generateCase({ seed: 43, tone, difficulty: 2 }))).not.toBe(JSON.stringify(a));
    }
  });

  for (const tone of tones) {
    it(`builds consistent ${tone} stories`, () => {
      for (const seed of seeds) {
        const difficulty = ((seed % 3) + 1) as 1 | 2 | 3;
        const c = generateCase({ seed, tone, difficulty });
        expect(c.slots).toHaveLength(5);
        expect(c.suspects.length).toBe(difficulty === 1 ? 4 : 5);
        expect(new Set(c.suspects.map((s) => s.voiceId)).size).toBe(c.suspects.length);
        expect(c.scene).toMatch(/^scenes\/.+\.webp$/);
        const adj = new Map(c.rooms.map((r) => [r.id, r.adjacent]));
        for (const r of c.rooms) for (const a of r.adjacent) expect(adj.get(a)).toContain(r.id);
        // Movement obeys the floor plan.
        for (const s of c.suspects) for (let t = 1; t < 5; t++) {
          const a = c.truth.position[s.id][t - 1], b = c.truth.position[s.id][t];
          expect(a === b || adj.get(a)!.includes(b)).toBe(true);
        }
        // Crime: culprit there holding the means; nobody else there.
        expect(c.truth.position[c.truth.culprit][c.crime.slot]).toBe(c.crime.room);
        expect(c.truth.holder[c.crime.slot]).toBe(c.truth.culprit);
        for (const s of c.suspects) if (s.id !== c.truth.culprit) expect(c.truth.position[s.id][c.crime.slot]).not.toBe(c.crime.room);
        // Lies.
        const guilt = c.lies.filter((l) => l.reason === 'guilt');
        expect(guilt).toHaveLength(1);
        expect(guilt[0]).toMatchObject({ s: c.truth.culprit, slot: c.crime.slot, trueRoom: c.crime.room });
        const shame = c.lies.filter((l) => l.reason === 'embarrassment');
        expect(shame.length).toBeGreaterThanOrEqual(1);
        expect(shame.length).toBeLessThanOrEqual(2);
        for (const l of shame) {
          expect(l.s).not.toBe(c.truth.culprit);
          // Resolvable: some clue tells the truth about it.
          expect(c.clues.some((cl) => cl.fact.k === 'at' && cl.fact.s === l.s && cl.fact.slot === l.slot && cl.fact.room === l.trueRoom)).toBe(true);
        }
        for (const s of c.suspects) for (let t = 0; t < 5; t++) {
          const lie = c.lies.find((l) => l.s === s.id && l.slot === t);
          expect(s.alibi[t]).toBe(lie ? lie.claimedRoom : c.truth.position[s.id][t]);
        }
        // Clues: all true, laid out per round, keys only where every table sees them.
        for (const cl of c.clues) expect(factTrue(c, cl.fact), `${c.id} ${cl.id}`).toBe(true);
        for (const round of [1, 2, 3]) {
          const board = c.clues.filter((cl) => cl.round === round && cl.visibility === 'board');
          expect(board.length).toBeGreaterThanOrEqual(1);
          expect(board.length).toBeLessThanOrEqual(3);
          const seats = c.clues.filter((cl) => cl.round === round && cl.visibility === 'private').map((cl) => cl.holderPlayerSlot);
          expect(new Set(seats).size).toBe(seats.length);
          for (const seat of [0, 1, 2]) expect(seats).toContain(seat);
        }
        for (const cl of c.clues.filter((x) => x.key)) expect(cl.visibility === 'board' || cl.holderPlayerSlot! < 3).toBe(true);
        expect(new Set(c.clues.map((cl) => cl.id)).size).toBe(c.clues.length);
        // Card faces and briefing slides stay short enough to read across a room.
        for (const cl of c.clues) {
          expect(cl.short, cl.id).toBeTruthy();
          expect(cl.short!.split(/\s+/).length, cl.short).toBeLessThanOrEqual(12);
        }
        for (const s of c.suspects) expect(s.shortName).toBeTruthy();
        expect(c.briefing!.length).toBeGreaterThanOrEqual(4);
        expect(c.briefing!.length).toBeLessThanOrEqual(6);
        for (const line of c.briefing!) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(20);
        for (const cl of c.clues) expect(cl.text, cl.text).not.toMatch(/\bthey\b|\bthem\b/i);
        // Reveal extras.
        expect(c.confession).toHaveLength(3);
        for (const line of c.confession!) expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(25);
        expect(c.headline!.title).toBe(c.headline!.title.toUpperCase());
        expect(c.headline!.sub).toContain('{DETECTIVE}');
        expect(c.paperName).toBeTruthy();
        expect(c.clockChimes).toHaveLength(3);
        for (const text of allText(c)) {
          expect(text).not.toMatch(/\u2014/);
          expect(text).not.toMatch(/\{\w+\}/);
          expect(text).not.toMatch(/undefined|NaN/);
        }
      }
    });
  }

  it('keeps cozy cases free of death', () => {
    for (const seed of seeds) {
      const c = generateCase({ seed, tone: 'cozy', difficulty: 2 });
      expect(allText(c).join(' ')).not.toMatch(/\b(dead|death|murder|kill|blood|poison)/i);
    }
  });
});
