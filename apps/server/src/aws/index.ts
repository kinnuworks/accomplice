// Optional AWS integrations for the hosted deployment. Each piece is off unless its env var is set:
//   ACCOMPLICE_TABLE  DynamoDB room snapshots, fair play audit rows, results, all-time counters (store.ts)
//   AUDIO_BUCKET      S3 copy of the voice cache, restored on start, served by CloudFront (audio-sync.ts)
//   EMF_METRICS=on    CloudWatch metrics from structured log lines (metrics.ts)
//   PUBLIC_URL_PARAM  SSM parameter that receives the public URL on start (the tunnel URL changes per start)
// With none set (local play) this module does nothing.
import type { FastifyInstance } from 'fastify';
import type { Hub } from '../hub.js';
import type { AuditEntry } from '../audit.js';
import { cfg } from '../config.js';
import { log } from '../log.js';
import { emit, emfEnabled } from './metrics.js';
import { storeEnabled, putSnapshot, putAudit, putResult, addStats, getStats } from './store.js';
import { startAudioSync, stopAudioSync } from './audio-sync.js';

export const awsEnabled = () => storeEnabled() || emfEnabled() || !!process.env.AUDIO_BUCKET || !!process.env.PUBLIC_URL_PARAM;

/** Called for every fair play audit entry (one per suspect reply). Never throws, never awaited by the game. */
export function onAudit(e: AuditEntry) {
  if (!awsEnabled()) return;
  try {
    const caught = e.attempts.filter((a) => !a.ok).length;
    emit({
      Replies: { value: 1, unit: 'Count' },
      ReplyMs: { value: e.ms.total, unit: 'Milliseconds' },
      ...(e.ms.firstSentence !== undefined ? { FirstSentenceMs: { value: e.ms.firstSentence, unit: 'Milliseconds' } } : {}),
      CaughtViolations: { value: caught, unit: 'Count' },
      Deflected: { value: e.final === 'deflected' ? 1 : 0, unit: 'Count' },
    }, { room: e.room, provider: e.provider });
    void putAudit(e.at, e.room, e);
    void addStats({
      replies: 1, claimsChecked: e.attempts.reduce((n, a) => n + a.claims.length, 0), caughtViolations: caught,
      firstPassOk: e.attempts[0]?.ok ? 1 : 0, fixedOnRetry: e.final === 'retry' ? 1 : 0, deflected: e.final === 'deflected' ? 1 : 0,
      leakedToPlayers: e.secondPass && !e.secondPass.ok ? 1 : 0,
    });
  } catch { /* never block the game */ }
}

/** Wire the optional integrations into a built server. Safe to call when nothing is configured. */
export async function initAws(app: FastifyInstance, hub: Hub) {
  if (!awsEnabled()) return;
  log.info(`aws: table=${storeEnabled() ? 'on' : 'off'} audioBucket=${process.env.AUDIO_BUCKET ? 'on' : 'off'} emf=${emfEnabled() ? 'on' : 'off'}`);

  void publishUrl();
  await startAudioSync(cfg.audioDir).catch((e) => log.warn(`audio sync off: ${(e as Error).message}`));

  // Real numbers for the stats page, summed across every game played on this deployment.
  app.get('/api/stats/all-time', async (_req, reply) => {
    const s = storeEnabled() ? await getStats() : undefined;
    return reply.header('cache-control', 'public, max-age=30').send({ source: s ? 'dynamodb' : 'none', stats: s ?? {} });
  });

  const lastSnap = new Map<string, string>();
  const lastPhase = new Map<string, string>();
  const seenTimings = new WeakSet<object>();
  const startedAt = new Map<string, number>();

  const tick = async () => {
    let clients = 0; let playing = 0;
    for (const [code, room] of hub.rooms) {
      clients += room.clients.size;
      if (room.phase !== 'lobby') playing++;

      // Stage timings recorded by the room (answer latency, case generation, narration).
      for (const t of room.timings) {
        if (seenTimings.has(t)) continue;
        seenTimings.add(t);
        if (t.kind === 'answer') emit({ Questions: { value: 1, unit: 'Count' }, AnswerLatencyMs: { value: t.ms, unit: 'Milliseconds' } }, { room: code });
        else if (t.kind === 'caseGen') emit({ CaseGenMs: { value: t.ms, unit: 'Milliseconds' } }, { room: code });
        else if (t.kind === 'narration') emit({ NarrationMs: { value: t.ms, unit: 'Milliseconds' } }, { room: code });
      }

      // Phase changes: games started and finished.
      const prev = lastPhase.get(code);
      if (prev !== room.phase) {
        lastPhase.set(code, room.phase);
        if (prev === 'lobby' && room.phase !== 'lobby') {
          startedAt.set(code, Date.now());
          emit({ GamesStarted: { value: 1, unit: 'Count' } }, { room: code, players: room.players.length });
          void addStats({ gamesStarted: 1, players: room.players.length });
        }
        if (room.phase === 'reveal' && room.reveal) {
          const { newspaper: _n, ...reveal } = room.reveal as Record<string, unknown>;
          const t0 = startedAt.get(code);
          const durationMs = t0 ? Date.now() - t0 : undefined;
          emit({ GamesFinished: { value: 1, unit: 'Count' }, ...(durationMs ? { GameDurationMs: { value: durationMs, unit: 'Milliseconds' } } : {}) }, { room: code });
          void putResult(Date.now(), code, { caseId: room.case?.id, tone: room.tone, players: room.players.length, durationMs, reveal });
          void addStats({ gamesFinished: 1, accomplicesCaught: (reveal as { accompliceCaught?: boolean }).accompliceCaught ? 1 : 0 });
        }
      }

      // Snapshot the public state whenever it changed, so a game can be inspected or restored after a restart.
      if (storeEnabled()) {
        // Full snapshot (public state plus what Room.restore needs); compare without the timestamp.
        const snap = room.snapshot();
        const json = JSON.stringify({ ...snap, restore: { ...snap.restore, savedAt: 0 } });
        if (lastSnap.get(code) !== json) { lastSnap.set(code, json); void putSnapshot(code, room.phase, room.players.length, snap); }
      }
    }
    for (const code of [...lastPhase.keys()]) if (!hub.rooms.has(code)) { lastPhase.delete(code); lastSnap.delete(code); startedAt.delete(code); }
    emit({ ActiveRooms: { value: hub.rooms.size, unit: 'Count' }, RoomsInGame: { value: playing, unit: 'Count' }, ConnectedClients: { value: clients, unit: 'Count' } });
  };

  const every = Math.max(5, Number(process.env.AWS_TICK_SECONDS ?? 15)) * 1000;
  const timer = setInterval(() => { void tick().catch((e) => log.warn(`aws tick: ${(e as Error).message}`)); }, every);
  timer.unref?.();
  app.addHook('onClose', async () => { clearInterval(timer); stopAudioSync(); await tick().catch(() => {}); });
}

/** Log the public URL and store it in SSM so scripts and teammates can find the current address. */
async function publishUrl() {
  const name = process.env.PUBLIC_URL_PARAM;
  const url = cfg.publicUrl;
  if (!url) return;
  log.info(`public url: ${url}`);
  if (!name) return;
  try {
    const m = await import('@aws-sdk/client-ssm');
    const c = new m.SSMClient({ region: process.env.AWS_REGION });
    await c.send(new m.PutParameterCommand({ Name: name, Value: url, Type: 'String', Overwrite: true }));
    log.info(`public url stored in SSM ${name}`);
  } catch (e) { log.warn(`ssm put ${name} failed: ${(e as Error)?.name ?? e}`); }
}
