// Writes packages/protocol/fixtures/demo-case.json: one verified classic case at Ashby Hall,
// shared by the TV and phone demo modes so both show the same story.
// Usage: pnpm --filter @accomplice/fairplay demo-fixture [startSeed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCase, objectionSlip, proofChain, publicView, safeLiesForAccomplice, shutdownSolver, verifyCase } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../protocol/fixtures/demo-case.json');
let seed = Number(process.argv[2] ?? 1);

for (;; seed++) {
  const c = generateCase({ seed, tone: 'classic', difficulty: 2 });
  if (c.scene !== 'scenes/ashby-hall.webp' || c.suspects.length !== 5) continue;
  const report = await verifyCase(c);
  if (!report.ok) continue;
  const privateCluesBySeat: Record<number, typeof c.clues> = {};
  for (let seat = 0; seat < 6; seat++) privateCluesBySeat[seat] = c.clues.filter((cl) => cl.visibility === 'private' && cl.holderPlayerSlot === seat);
  const fixture = {
    generatedBy: '@accomplice/fairplay scripts/demo-fixture.ts',
    seed, tone: c.tone, difficulty: c.difficulty,
    report: { ok: report.ok, keyClues: report.keyClues, solvableByRound: report.solvableByRound },
    publicCase: publicView(c),
    boardClues: c.clues.filter((cl) => cl.visibility === 'board'),
    privateCluesBySeat,
    culprit: c.truth.culprit,
    item: c.crime.item,
    accomplicePlayerSeat: 4,
    safeLies: safeLiesForAccomplice(c),
    proofChain: proofChain(c),
    confession: c.confession,
    headline: c.headline,
    paperName: c.paperName,
    clockChimes: c.clockChimes,
    objections: Object.fromEntries(c.suspects.map((s) => [s.id, objectionSlip(c, s.id)])),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`Wrote ${out} from seed ${seed}: "${c.title}", culprit ${c.truth.culprit}, ${c.clues.length} clues.`);
  break;
}
await shutdownSolver();
