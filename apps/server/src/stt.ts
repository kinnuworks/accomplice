// /stt?room=CODE&pid=<playerId>: stream 16 kHz PCM16 mono from the phone into Amazon Transcribe,
// stream partial and final transcripts back, with suspect names corrected.
import type { Lang, SttClientMsg, SttServerMsg } from '@accomplice/protocol';
import { cfg } from './config.js';
import { correctNames } from './fuzzy.js';
import type { Hub, SocketLike } from './hub.js';
import { GameError } from './room.js';
import { log } from './log.js';

const LANG_CODES: Record<Lang, string> = { en: 'en-US', hi: 'hi-IN' };
let mod: any = null; let client: any = null;

async function transcribe() {
  if (!client) {
    mod = await import('@aws-sdk/client-transcribe-streaming');
    client = new mod.TranscribeStreamingClient({ region: cfg.awsRegion });
  }
  return client;
}

/** Simple async queue that the Transcribe SDK pulls audio from. */
class ChunkQueue {
  private items: Uint8Array[] = []; private waiting: ((v: IteratorResult<Uint8Array>) => void) | null = null; private ended = false;
  push(b: Uint8Array) {
    if (this.ended) return;
    if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: b, done: false }); } else this.items.push(b);
  }
  end() { this.ended = true; if (this.waiting) { const w = this.waiting; this.waiting = null; w({ value: undefined as any, done: true }); } }
  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length) { yield this.items.shift()!; continue; }
      if (this.ended) return;
      const r = await new Promise<IteratorResult<Uint8Array>>((res) => { this.waiting = res; });
      if (r.done) return;
      yield r.value;
    }
  }
}

export function handleStt(ws: SocketLike, query: { room?: string; pid?: string }, hub: Hub) {
  const send = (m: SttServerMsg) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const room = hub.get(query.room);
  const pid = query.pid;
  if (!room || !pid || !room.player(pid)) { send({ t: 'error', message: 'Join the room before using the microphone.' }); ws.close(); return; }
  if (cfg.sttProvider !== 'transcribe') { send({ t: 'error', message: 'Server speech recognition is off. Use the phone microphone or type.' }); ws.close(); return; }

  let session: { q: ChunkQueue; done: Promise<string>; opts: Extract<SttClientMsg, { t: 'start' }> } | null = null;

  const names = () => {
    const c = room.case;
    return c ? [...c.suspects.map((s) => s.name), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name)] : [];
  };

  const start = (opts: Extract<SttClientMsg, { t: 'start' }>) => {
    if (session) session.q.end();
    const q = new ChunkQueue();
    const lang: Lang = opts.lang ?? room.priv.get(pid)?.lang ?? 'en';
    let finals: string[] = [];
    const done = (async () => {
      const c = await transcribe();
      const audio = (async function* () { for await (const chunk of q) { for (let i = 0; i < chunk.length; i += 8192) yield { AudioEvent: { AudioChunk: chunk.subarray(i, i + 8192) } }; } })();
      const res = await c.send(new mod.StartStreamTranscriptionCommand({
        LanguageCode: LANG_CODES[lang] ?? 'en-US', MediaEncoding: 'pcm', MediaSampleRateHertz: opts.sampleRate ?? 16000,
        AudioStream: audio, EnablePartialResultsStabilization: true, PartialResultsStability: 'medium',
      }));
      for await (const ev of res.TranscriptResultStream ?? []) {
        const results = ev.TranscriptEvent?.Transcript?.Results ?? [];
        for (const r of results) {
          const text = r.Alternatives?.[0]?.Transcript ?? '';
          if (!text) continue;
          if (r.IsPartial) send({ t: 'partial', text: lang === 'en' ? correctNames([...finals, text].join(' '), names()) : [...finals, text].join(' ') });
          else finals = [...finals, text];
        }
      }
      return finals.join(' ').trim();
    })();
    done.catch(() => {}); // surfaced in stop()
    session = { q, done, opts };
    // Tell the phone we are listening even before the first transcript arrives.
    setTimeout(() => send({ t: 'ready' }), 0);
    return session;
  };

  const stop = async () => {
    const s = session; session = null;
    if (!s) return;
    s.q.end();
    try {
      const raw = await s.done;
      const lang = s.opts.lang ?? room.priv.get(pid)?.lang ?? 'en';
      const text = lang === 'en' ? correctNames(raw, names()) : raw;
      send({ t: 'final', text, final: text, raw });
      if (s.opts.autoAsk && s.opts.suspectId && text) {
        try {
          room.ask(pid, s.opts.suspectId, text, 'voice').catch(() => {});
          send({ t: 'asked', suspectId: s.opts.suspectId, text });
        } catch (e) { send({ t: 'error', message: e instanceof GameError ? e.message : 'Could not ask that.' }); }
      }
    } catch (e: any) {
      log.warn(`transcribe failed: ${e?.name ?? e}`);
      send({ t: 'error', message: 'I could not hear that clearly. Try again, or type your question.' });
    }
  };

  ws.on('message', (data: any, isBinary: boolean) => {
    if (isBinary) {
      if (!session) start({ t: 'start' });
      const buf = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
      session!.q.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      return;
    }
    let msg: SttClientMsg;
    try { msg = JSON.parse(String(data)); } catch { return send({ t: 'error', message: 'Bad message.' }); }
    if (msg.t === 'start') start(msg);
    else if (msg.t === 'stop' || msg.t === 'end') void stop();
  });
  ws.on('close', () => { session?.q.end(); session = null; });
}
