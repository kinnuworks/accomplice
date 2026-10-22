// S3 audio cache. Enabled when AUDIO_BUCKET is set.
// - Every new file the voice pipeline writes to the local audio cache (<hash>.mp3/.json/.dur) is copied to
//   s3://AUDIO_BUCKET/audio/ with a one year immutable cache header. CloudFront serves /audio/* from there.
// - On start the local cache is filled back from S3, so a fresh container does not pay Polly again for
//   lines it already rendered (narrator briefings, house lines, repeated suspect answers).
// File names are content hashes, so a file never changes once written.
import { watch, existsSync, type FSWatcher } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { log } from '../log.js';

type S3 = typeof import('@aws-sdk/client-s3');
const bucket = () => process.env.AUDIO_BUCKET || '';
const prefix = () => (process.env.AUDIO_PREFIX ?? 'audio/').replace(/^\/+/, '');
const TYPES: Record<string, string> = { '.mp3': 'audio/mpeg', '.json': 'application/json', '.dur': 'text/plain' };

let mod: Promise<[S3, InstanceType<S3['S3Client']>]> | null = null;
const s3 = () => (mod ??= import('@aws-sdk/client-s3').then((m) => [m, new m.S3Client({ region: process.env.AWS_REGION })] as [S3, InstanceType<S3['S3Client']>]));

const uploaded = new Set<string>();
const pending = new Map<string, NodeJS.Timeout>();
let watcher: FSWatcher | null = null;

async function upload(dir: string, name: string) {
  if (uploaded.has(name)) return;
  const file = path.join(dir, name);
  if (!existsSync(file)) return;
  try {
    const [m, c] = await s3();
    await c.send(new m.PutObjectCommand({
      Bucket: bucket(), Key: prefix() + name, Body: await readFile(file),
      ContentType: TYPES[path.extname(name)] ?? 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    uploaded.add(name);
  } catch (e) { log.warn(`s3 upload ${name} failed: ${(e as Error)?.name ?? e}`); }
}

/** Pull up to `max` cached files from S3 that are missing locally. */
async function hydrate(dir: string, max = 3000) {
  const [m, c] = await s3();
  const local = new Set(await readdir(dir).catch(() => [] as string[]));
  let token: string | undefined; let fetched = 0;
  do {
    const page = await c.send(new m.ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix(), ContinuationToken: token }));
    for (const o of page.Contents ?? []) {
      const name = o.Key!.slice(prefix().length);
      if (!name || name.includes('/') || !TYPES[path.extname(name)]) continue;
      uploaded.add(name);
      if (local.has(name)) continue;
      if (fetched >= max) return fetched;
      const obj = await c.send(new m.GetObjectCommand({ Bucket: bucket(), Key: o.Key! }));
      await writeFile(path.join(dir, name), await obj.Body!.transformToByteArray());
      fetched++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return fetched;
}

export async function startAudioSync(dir: string) {
  if (!bucket() || watcher) return;
  await mkdir(dir, { recursive: true });
  // Hydrate first (background), then upload anything local that S3 does not have yet.
  void hydrate(dir)
    .then(async (n) => {
      if (n) log.info(`audio cache: restored ${n} files from s3://${bucket()}/${prefix()}`);
      for (const name of await readdir(dir)) if (TYPES[path.extname(name)]) await upload(dir, name);
    })
    .catch((e) => log.warn(`audio cache hydrate failed: ${(e as Error)?.name ?? e}`));
  watcher = watch(dir, (_ev, name) => {
    if (!name || !TYPES[path.extname(String(name))]) return;
    const n = String(name);
    clearTimeout(pending.get(n));
    // Small delay so the writer has finished the file before we read it.
    pending.set(n, setTimeout(() => { pending.delete(n); void upload(dir, n); }, 400));
  });
  watcher.unref?.();
  log.info(`audio cache: syncing ${dir} to s3://${bucket()}/${prefix()}`);
}

export function stopAudioSync() { watcher?.close(); watcher = null; for (const t of pending.values()) clearTimeout(t); pending.clear(); }
