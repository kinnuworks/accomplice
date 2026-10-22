// Fields the phone reads that are newer than (or not yet in) packages/protocol.
// All optional, so older servers and fixtures still work.

import type { Clue, PublicCase, TheoryVerdict } from '@accomplice/protocol';

export type ClueX = Clue & { short?: string };
export type SuspectX = PublicCase['suspects'][number] & { shortName?: string; claimedAlibi?: Record<number, string> };
export type CaseX = PublicCase;

/** "Test a theory": a player proposes, the table votes, the engine rules. */
export interface Proposal {
  id: string;
  by: string; // player id
  byName?: string;
  culprit: string;
  item?: string;
  agree?: number;
  needed?: number;
  myVote?: boolean | null;
  status?: 'open' | 'testing' | 'passed' | 'failed' | 'done';
  verdict?: TheoryVerdict;
  explanation?: string;
  closesAt?: number;
}

/** Short name for buttons: "Dr Orme", "Ivy". Uses the case's shortName when it has one. */
export function shortName(s: { name: string; shortName?: string } | null | undefined) {
  if (!s) return '';
  if (s.shortName) return s.shortName;
  const parts = s.name.split(/\s+/);
  const title = /^(Dr|Mr|Mrs|Ms|Miss|Lady|Lord|Captain|Colonel|Sir|Madame|Professor)\.?$/i;
  if (parts.length > 2 && title.test(parts[0])) return `${parts[0]} ${parts[parts.length - 1]}`;
  if (parts.length === 2 && title.test(parts[0])) return s.name;
  return parts[0];
}

export function clueShort(c: ClueX) {
  return c.short ?? c.title;
}
