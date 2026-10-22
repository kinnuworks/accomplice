// fairplay: procedural mystery cases with a machine-checked fair answer.
import type { Case, VerifyReport } from '@accomplice/protocol';
import { generateCase, type GenerateOptions } from './generate.js';
import { verifyCase } from './verify.js';

export type { GenerateOptions } from './generate.js';
export { generateCase } from './generate.js';
export { verifyCase, shutdownSolver } from './verify.js';
export { sliceFor, checkReply, publicView } from './slice.js';
export { evaluateTheory, proofChain, safeLiesForAccomplice } from './proof.js';
export { describeFact } from './text.js';

/** Generate cases from consecutive seeds until one passes verification. */
export async function generateVerifiedCase(opts: GenerateOptions, maxTries = 25): Promise<{ c: Case; report: VerifyReport; tries: number }> {
  let last: { c: Case; report: VerifyReport; tries: number } | null = null;
  for (let i = 0; i < maxTries; i++) {
    const c = generateCase({ ...opts, seed: opts.seed + i });
    const report = await verifyCase(c);
    last = { c, report, tries: i + 1 };
    if (report.ok) return last;
  }
  return last!;
}
