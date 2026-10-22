// DynamoDB game store: room snapshots, fair play audit records, game results and all-time counters.
// Enabled when ACCOMPLICE_TABLE is set. Every call fails soft: the game never waits on or breaks because of it.
//
// Single table, on-demand billing. Keys:
//   pk=ROOM#<code>        sk=SNAPSHOT                  latest public room state (gzip), expires after 7 days
//   pk=AUDIT#<yyyy-mm-dd> sk=<at>#<room>#<rand>        one fair play check per suspect reply
//   pk=RESULT#<yyyy-mm>   sk=<at>#<room>               one row per finished game
//   pk=STATS              sk=ALLTIME                   atomic counters for the public stats page
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { log } from '../log.js';

type Sdk = typeof import('@aws-sdk/client-dynamodb');
let sdk: Promise<[Sdk, InstanceType<Sdk['DynamoDBClient']>]> | null = null;
let failures = 0;

export const tableName = () => process.env.ACCOMPLICE_TABLE || '';
export const storeEnabled = () => !!tableName();

function client() {
  sdk ??= import('@aws-sdk/client-dynamodb').then((m) => [m, new m.DynamoDBClient({ region: process.env.AWS_REGION })] as [Sdk, InstanceType<Sdk['DynamoDBClient']>]);
  return sdk;
}

async function safe<T>(what: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (!storeEnabled()) return undefined;
  try { return await fn(); } catch (e) {
    if (failures++ < 20) log.warn(`dynamodb ${what} failed: ${(e as Error)?.name ?? e}`);
    return undefined;
  }
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const month = (t: number) => new Date(t).toISOString().slice(0, 7);
const ttl = (days: number) => String(Math.floor(Date.now() / 1000) + days * 86400);

export async function putSnapshot(code: string, phase: string, players: number, state: unknown) {
  const body = gzipSync(JSON.stringify(state));
  if (body.length > 350_000) return; // DynamoDB items max out at 400 KB
  await safe('snapshot', async () => {
    const [m, c] = await client();
    await c.send(new m.PutItemCommand({
      TableName: tableName(),
      Item: {
        pk: { S: `ROOM#${code}` }, sk: { S: 'SNAPSHOT' },
        phase: { S: phase }, players: { N: String(players) },
        state: { B: body }, updatedAt: { N: String(Date.now()) }, expiresAt: { N: ttl(7) },
      },
    }));
  });
}

/** Latest snapshot for a room code, or undefined. A future Room.restore() can rebuild a room from it. */
export async function getSnapshot(code: string): Promise<{ phase: string; state: unknown; updatedAt: number } | undefined> {
  return safe('get snapshot', async () => {
    const [m, c] = await client();
    const out = await c.send(new m.GetItemCommand({ TableName: tableName(), Key: { pk: { S: `ROOM#${code}` }, sk: { S: 'SNAPSHOT' } } }));
    const it = out.Item;
    if (!it?.state?.B) return undefined;
    return { phase: it.phase?.S ?? '', state: JSON.parse(gunzipSync(it.state.B).toString('utf8')), updatedAt: Number(it.updatedAt?.N ?? 0) };
  });
}

export async function putAudit(at: number, room: string, entry: unknown) {
  await safe('audit', async () => {
    const [m, c] = await client();
    await c.send(new m.PutItemCommand({
      TableName: tableName(),
      Item: { pk: { S: `AUDIT#${day(at)}` }, sk: { S: `${at}#${room}#${randomBytes(3).toString('hex')}` }, room: { S: room }, entry: { S: JSON.stringify(entry).slice(0, 300_000) } },
    }));
  });
}

export async function putResult(at: number, room: string, result: unknown) {
  await safe('result', async () => {
    const [m, c] = await client();
    await c.send(new m.PutItemCommand({
      TableName: tableName(),
      Item: { pk: { S: `RESULT#${month(at)}` }, sk: { S: `${at}#${room}` }, room: { S: room }, result: { S: JSON.stringify(result).slice(0, 300_000) } },
    }));
  });
}

/** Atomically add to the all-time counters. */
export async function addStats(delta: Record<string, number>) {
  const keys = Object.keys(delta).filter((k) => /^[A-Za-z]+$/.test(k) && delta[k] !== 0);
  if (!keys.length) return;
  await safe('stats', async () => {
    const [m, c] = await client();
    await c.send(new m.UpdateItemCommand({
      TableName: tableName(),
      Key: { pk: { S: 'STATS' }, sk: { S: 'ALLTIME' } },
      UpdateExpression: 'ADD ' + keys.map((k) => `#${k} :${k}`).join(', ') + ' SET updatedAt = :now',
      ExpressionAttributeNames: Object.fromEntries(keys.map((k) => [`#${k}`, k])),
      ExpressionAttributeValues: { ...Object.fromEntries(keys.map((k) => [`:${k}`, { N: String(delta[k]) }])), ':now': { N: String(Date.now()) } },
    }));
  });
}

export async function getStats(): Promise<Record<string, number> | undefined> {
  return safe('get stats', async () => {
    const [m, c] = await client();
    const out = await c.send(new m.GetItemCommand({ TableName: tableName(), Key: { pk: { S: 'STATS' }, sk: { S: 'ALLTIME' } } }));
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(out.Item ?? {})) if (v.N !== undefined) res[k] = Number(v.N);
    return res;
  });
}
