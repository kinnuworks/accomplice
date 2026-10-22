// A household's detective career, kept between sessions: cases solved, streak, favourite suspect,
// and the case they left unfinished last night. Stored in DynamoDB when configured, else a JSON file.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Tone } from './types.ts';

export interface LastCase {
  caseId: string;
  title: string;
  tone: Tone;
  roomCode?: string;
  seed?: number;
  round?: number;
  startedAt: number;
  updatedAt: number;
  finished: boolean;
  questionsAsked: number;
  suspectsQuestioned: string[];   // names, in the order first questioned
  hintsUsed: number;
}

export interface DetectiveRecord {
  household: string;
  casesStarted: number;
  solved: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  hintsUsed: number;
  questionsAsked: number;
  suspectCounts: Record<string, number>;   // suspect name -> times questioned
  lastCase: LastCase | null;
  history: { caseId: string; title: string; correct: boolean; at: number }[]; // newest first, max 10
  caseOfTheWeek: { week: string; solved: boolean } | null;
  /** The one-step hint limit: the last nudge given, and how many investigative moves happened since. */
  hint: { caseId: string; text: string; clueId?: string; movesSince: number } | null;
  createdAt: number;
  updatedAt: number;
}

export function emptyRecord(household: string, now = Date.now()): DetectiveRecord {
  return {
    household, casesStarted: 0, solved: 0, wrong: 0, streak: 0, bestStreak: 0, hintsUsed: 0, questionsAsked: 0,
    suspectCounts: {}, lastCase: null, history: [], caseOfTheWeek: null, hint: null, createdAt: now, updatedAt: now,
  };
}

export function favouriteSuspect(r: DetectiveRecord): { name: string; times: number } | null {
  let best: { name: string; times: number } | null = null;
  for (const [name, times] of Object.entries(r.suspectCounts)) if (!best || times > best.times) best = { name, times };
  return best;
}

/** ISO week label, e.g. "2026-W43". The case of the week is the same case for every household that week. */
export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}
export function weekSeed(week = isoWeek()): number {
  let h = 2166136261;
  for (const ch of `accomplice:${week}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}

export interface RecordStore {
  readonly kind: string;
  get(household: string): Promise<DetectiveRecord>;
  put(record: DetectiveRecord): Promise<void>;
}

/** Read, change and save one household's record. Changes for the same household are applied in order. */
export function recordUpdater(store: RecordStore) {
  const chains = new Map<string, Promise<unknown>>();
  return async function update(household: string, fn: (r: DetectiveRecord) => void): Promise<DetectiveRecord> {
    const prev = chains.get(household) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
      const r = await store.get(household);
      fn(r);
      r.updatedAt = Date.now();
      await store.put(r);
      return r;
    });
    chains.set(household, next);
    try { return await next; } finally { if (chains.get(household) === next) chains.delete(household); }
  };
}

export class MemoryRecordStore implements RecordStore {
  readonly kind = 'memory';
  private data = new Map<string, DetectiveRecord>();
  async get(h: string) { return structuredClone(this.data.get(h) ?? emptyRecord(h)); }
  async put(r: DetectiveRecord) { this.data.set(r.household, structuredClone(r)); }
}

/** One JSON file for every household. Fine for a home server or a demo; writes are atomic. */
export class JsonFileRecordStore implements RecordStore {
  readonly kind = 'file';
  readonly path: string;
  private cache: Record<string, DetectiveRecord> | null = null;
  private writing: Promise<void> = Promise.resolve();
  constructor(path: string) { this.path = resolve(path); }

  private async load(): Promise<Record<string, DetectiveRecord>> {
    if (this.cache) return this.cache;
    try { this.cache = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, DetectiveRecord>; }
    catch { this.cache = {}; }
    return this.cache;
  }
  async get(h: string) {
    const all = await this.load();
    return structuredClone(all[h] ? { ...emptyRecord(h), ...all[h] } : emptyRecord(h));
  }
  async put(r: DetectiveRecord) {
    const all = await this.load();
    all[r.household] = structuredClone(r);
    const body = JSON.stringify(all, null, 1);
    this.writing = this.writing.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, body);
      await rename(tmp, this.path);
    });
    await this.writing;
  }
}

/** DynamoDB table with partition key "household" (string). The record is kept as one JSON attribute. */
export class DynamoRecordStore implements RecordStore {
  readonly kind = 'dynamodb';
  readonly table: string;
  private region?: string;
  private client: Promise<{ send(cmd: unknown): Promise<any> }> | null = null;
  private mod: Promise<typeof import('@aws-sdk/client-dynamodb')> | null = null;
  constructor(table: string, region?: string) { this.table = table; this.region = region; }

  private sdk() {
    this.mod ??= import('@aws-sdk/client-dynamodb');
    this.client ??= this.mod.then((m) => new m.DynamoDBClient(this.region ? { region: this.region } : {}));
    return Promise.all([this.mod, this.client]);
  }
  async get(h: string) {
    const [m, c] = await this.sdk();
    const out = await c.send(new m.GetItemCommand({ TableName: this.table, Key: { household: { S: h } }, ConsistentRead: true }));
    const raw = out.Item?.record?.S;
    return raw ? { ...emptyRecord(h), ...(JSON.parse(raw) as DetectiveRecord) } : emptyRecord(h);
  }
  async put(r: DetectiveRecord) {
    const [m, c] = await this.sdk();
    await c.send(new m.PutItemCommand({
      TableName: this.table,
      Item: { household: { S: r.household }, record: { S: JSON.stringify(r) }, updatedAt: { N: String(r.updatedAt) } },
    }));
  }
}

/**
 * Pick the store from the environment:
 *  ACCOMPLICE_RECORDS=dynamodb with ACCOMPLICE_RECORDS_TABLE (and AWS_REGION) uses DynamoDB,
 *  ACCOMPLICE_RECORDS=memory keeps records only while the server runs,
 *  otherwise a JSON file at ACCOMPLICE_RECORDS_FILE (default .data/detective-records.json).
 */
export function recordStoreFromEnv(env: Record<string, string | undefined> = process.env): RecordStore {
  const kind = (env.ACCOMPLICE_RECORDS ?? '').toLowerCase();
  if (kind === 'dynamodb' || (kind === '' && env.ACCOMPLICE_RECORDS_TABLE)) {
    if (env.ACCOMPLICE_RECORDS_TABLE) return new DynamoRecordStore(env.ACCOMPLICE_RECORDS_TABLE, env.AWS_REGION);
  }
  if (kind === 'memory') return new MemoryRecordStore();
  return new JsonFileRecordStore(env.ACCOMPLICE_RECORDS_FILE ?? '.data/detective-records.json');
}
