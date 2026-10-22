// Generates N cases per tone, verifies each with Z3, and prints the numbers we publish.
// Usage: pnpm --filter @accomplice/fairplay stats [N] [difficulty]
import type { Tone } from '@accomplice/protocol';
import { generateCase, generateVerifiedCase, shutdownSolver, verifyCase } from '../src/index.js';

const N = Number(process.argv[2] ?? 100);
const difficulty = Number(process.argv[3] ?? 2) as 1 | 2 | 3;
const median = (xs: number[]) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : 0; };
const pct = (x: number, n: number) => `${((100 * x) / n).toFixed(1)}%`;

for (const tone of ['classic', 'cozy'] as Tone[]) {
  let pass = 0; const ms: number[] = []; const genMs: number[] = []; const rounds: Record<string, number> = {}; const keys: number[] = []; const fails: Record<string, number> = {};
  for (let seed = 1; seed <= N; seed++) {
    const g0 = performance.now();
    const c = generateCase({ seed, tone, difficulty });
    genMs.push(performance.now() - g0);
    const rep = await verifyCase(c);
    if (seed > 1) ms.push(rep.ms); // first call includes solver start-up
    if (rep.ok) pass++; else for (const n of rep.notes) fails[n.replace(/\(.*\)/, '').replace(/:.*/, '')] = (fails[n.replace(/\(.*\)/, '').replace(/:.*/, '')] ?? 0) + 1;
    rounds[String(rep.solvableByRound)] = (rounds[String(rep.solvableByRound)] ?? 0) + 1;
    keys.push(rep.keyClues.length);
  }
  const tries: number[] = [];
  for (let seed = 1; seed <= Math.min(N, 50); seed++) tries.push((await generateVerifiedCase({ seed: seed * 1000, tone, difficulty })).tries);
  console.log(`\n${tone} (difficulty ${difficulty}, ${N} seeds)`);
  console.log(`  verified first time : ${pass}/${N} (${pct(pass, N)})`);
  console.log(`  median generate ms  : ${median(genMs).toFixed(1)}`);
  console.log(`  median verify ms    : ${median(ms)}`);
  console.log(`  solvable by round   : ${JSON.stringify(rounds)}`);
  console.log(`  median key clues    : ${median(keys)}`);
  console.log(`  generateVerifiedCase tries: median ${median(tries)}, max ${Math.max(...tries)} (over ${tries.length} runs)`);
  if (Object.keys(fails).length) console.log(`  failure reasons     : ${JSON.stringify(fails)}`);
}
await shutdownSolver();
