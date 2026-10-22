// Loads the case engine. Prefers the real @accomplice/fairplay package; falls back to the local stub.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AccompliceLie, Case, Claim, ClaimCheck, ObjectionResult, ProofStep, PublicCase, SuspectSlice, Theory, TheoryVerdict, Tone, VerifyReport } from '@accomplice/protocol';
import { cfg, REPO_ROOT } from './config.js';

export interface Engine {
  source: 'fairplay' | 'stub';
  generateVerifiedCase(opts: { seed: number; tone: Tone; difficulty: 1 | 2 | 3; suspectCount?: 4 | 5 }, maxTries?: number): Promise<{ c: Case; report: VerifyReport; tries: number }>;
  sliceFor(c: Case, suspectId: string): SuspectSlice;
  checkReply(c: Case, suspectId: string, claims: Claim[]): ClaimCheck;
  evaluateTheory(c: Case, pinnedClueIds: string[], theory: Theory): Promise<TheoryVerdict>;
  proofChain(c: Case): ProofStep[];
  safeLiesForAccomplice(c: Case): AccompliceLie[];
  publicView(c: Case): PublicCase;
  /** Optional: the solver, used to double-check sabotage keeps the case fair. */
  verifyCase?(c: Case): Promise<VerifyReport>;
  /** Optional: what a suspect blurts out when a player objects to an answer. */
  objectionSlip?(c: Case, suspectId: string, claims: Claim[]): ObjectionResult;
}

let cached: Promise<Engine> | null = null;

async function tryImport(spec: string): Promise<any | null> {
  try { return await import(/* @vite-ignore */ spec); } catch { return null; }
}

function valid(m: any): boolean {
  return m && ['generateVerifiedCase', 'sliceFor', 'checkReply', 'evaluateTheory', 'proofChain', 'safeLiesForAccomplice', 'publicView'].every((k) => typeof m[k] === 'function');
}

export function loadEngine(): Promise<Engine> {
  if (cached) return cached;
  cached = (async () => {
    if (cfg.engine !== 'stub') {
      const candidates = ['@accomplice/fairplay'];
      for (const rel of ['packages/fairplay/src/index.ts', 'packages/fairplay/dist/index.js']) {
        const p = path.join(REPO_ROOT, rel);
        if (existsSync(p)) candidates.push(pathToFileURL(p).href);
      }
      for (const spec of candidates) {
        const m = await tryImport(spec);
        if (valid(m)) return { source: 'fairplay', ...pick(m) } as Engine;
      }
      if (cfg.engine === 'fairplay') throw new Error('ENGINE=fairplay but @accomplice/fairplay could not be loaded');
    }
    const stub = await import('./engine-stub.js');
    return { source: 'stub', ...pick(stub) } as Engine;
  })();
  return cached;
}

function pick(m: any) {
  const { generateVerifiedCase, sliceFor, checkReply, evaluateTheory, proofChain, safeLiesForAccomplice, publicView, verifyCase, objectionSlip } = m;
  return { generateVerifiedCase, sliceFor, checkReply, evaluateTheory, proofChain, safeLiesForAccomplice, publicView, verifyCase, objectionSlip };
}
