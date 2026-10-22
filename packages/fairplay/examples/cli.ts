// Generate a verified mystery and print it. Add --solve to see the answer and the proof.
// Usage: npx tsx examples/cli.ts [seed] [classic|cozy] [--solve]
import { generateVerifiedCase, proofChain, shutdownSolver } from '../src/index.js';
import type { Tone } from '../src/index.js';

const [seedArg, toneArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const solve = process.argv.includes('--solve');
const { c, report, tries } = await generateVerifiedCase({ seed: Number(seedArg ?? Date.now() % 100000), tone: (toneArg as Tone) ?? 'classic', difficulty: 2 });
const room = (id: string) => c.rooms.find((r) => r.id === id)!.name;
const who = (id: string) => c.suspects.find((s) => s.id === id)!.name;

console.log(`\n${c.title.toUpperCase()}\n${c.place}. ${c.dateLine}.\n\n${c.intro}\n`);
console.log('THE SUSPECTS');
for (const s of c.suspects) console.log(`  ${s.name}, ${s.role}. ${s.motive}`);
console.log(`\nTHE MEANS: one of ${c.items.map((i) => `the ${i.name} (${room(i.homeRoom)})`).join(', ')}`);
console.log(`\nTHE FLOOR PLAN\n${c.rooms.map((r) => `  ${r.name}: doors to ${r.adjacent.map(room).join(', ')}`).join('\n')}`);

for (const round of [1, 2, 3]) {
  console.log(`\nROUND ${round}`);
  for (const cl of c.clues.filter((x) => x.round === round)) {
    const where = cl.visibility === 'board' ? 'board ' : `seat ${cl.holderPlayerSlot}`;
    console.log(`  [${where}] ${cl.title}: ${cl.text}`);
  }
}

console.log(`\nChecked by Z3 in ${report.ms} ms (seed ${c.seed}, ${tries} ${tries === 1 ? 'try' : 'tries'}): one answer, ${report.keyClues.length} key clue${report.keyClues.length === 1 ? "" : "s"}, solvable by round ${report.solvableByRound}.`);
if (solve) {
  console.log(`\nSOLUTION: ${who(c.truth.culprit)}, with the ${c.items.find((i) => i.id === c.crime.item)!.name}.`);
  for (const [i, step] of proofChain(c).entries()) console.log(`  ${i + 1}. ${step.says} ${step.therefore}`);
  for (const line of c.confession ?? []) console.log(`  "${line}"`);
} else {
  console.log('\nRun again with --solve for the answer.');
}
await shutdownSolver();
