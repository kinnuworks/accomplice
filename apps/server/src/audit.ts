// Every claim check is logged so we can publish real numbers on how often a suspect nearly spilled a secret.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cfg } from './config.js';
import { onAudit } from './aws/index.js';

export interface AuditEntry {
  at: number; room: string; caseId: string; suspect: string; provider: string; engine: string;
  question: string; attempts: { text: string; claims: unknown[]; ok: boolean; violations: string[] }[];
  final: 'first' | 'retry' | 'deflected'; dropped?: number;
  ms: { total: number; gen: number[]; extract: number[]; firstSentence?: number };
  /** Background model-based re-check of the finished reply. */
  secondPass?: { claims: unknown[]; ok: boolean; violations: string[] };
}

export interface AuditStats {
  replies: number; checks: number; claimsChecked: number; firstPassOk: number; caughtViolations: number;
  fixedOnRetry: number; deflected: number; droppedSentences: number; secondPassChecked: number; leakedToPlayers: number;
  byProvider: Record<string, number>;
}

const mem: AuditStats = { replies: 0, checks: 0, claimsChecked: 0, firstPassOk: 0, caughtViolations: 0, fixedOnRetry: 0, deflected: 0, droppedSentences: 0, secondPassChecked: 0, leakedToPlayers: 0, byProvider: {} };

function tally(s: AuditStats, e: AuditEntry) {
  s.replies++;
  s.checks += e.attempts.length;
  s.claimsChecked += e.attempts.reduce((n, a) => n + a.claims.length, 0);
  if (e.attempts[0]?.ok) s.firstPassOk++;
  s.caughtViolations += e.attempts.filter((a) => !a.ok).length;
  if (e.final === 'retry') s.fixedOnRetry++;
  if (e.final === 'deflected') s.deflected++;
  s.droppedSentences += e.dropped ?? 0;
  if (e.secondPass) { s.secondPassChecked++; if (!e.secondPass.ok) s.leakedToPlayers++; }
  s.byProvider[e.provider] = (s.byProvider[e.provider] ?? 0) + 1;
}

export async function audit(e: AuditEntry) {
  tally(mem, e);
  onAudit(e); // no-op unless the AWS env flags are set
  try {
    await mkdir(path.dirname(cfg.auditFile), { recursive: true });
    await appendFile(cfg.auditFile, JSON.stringify(e) + '\n');
  } catch { /* never block the game on logging */ }
}

export function sessionStats(): AuditStats { return JSON.parse(JSON.stringify(mem)); }

/** Totals across every game ever logged on this machine. */
export async function allTimeStats(): Promise<AuditStats> {
  const s: AuditStats = { replies: 0, checks: 0, claimsChecked: 0, firstPassOk: 0, caughtViolations: 0, fixedOnRetry: 0, deflected: 0, droppedSentences: 0, secondPassChecked: 0, leakedToPlayers: 0, byProvider: {} };
  try {
    const txt = await readFile(cfg.auditFile, 'utf8');
    for (const line of txt.split('\n')) { if (line.trim()) { try { tally(s, JSON.parse(line)); } catch { /* skip */ } } }
  } catch { /* no file yet */ }
  return s;
}
