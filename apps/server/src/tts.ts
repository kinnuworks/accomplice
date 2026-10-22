// Voices via Amazon Polly. mp3 + word speech marks, cached on disk by hash of (voice, engine, text).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { WordMark } from '@accomplice/protocol';
import { cfg } from './config.js';
import { log } from './log.js';
import { mp3DurationMs } from './mp3.js';

export interface Speech { audioUrl?: string; marks: WordMark[]; durationMs: number; engine?: string; cached?: boolean; ms: number }

type PollyEngine = 'generative' | 'neural' | 'standard';
/** 'fast' = suspect voices on the critical path; 'narrator' = pre-rendered narration (quality first). */
export type VoiceTier = 'fast' | 'narrator';
const TIERS: Record<VoiceTier, { region: () => string; engines: PollyEngine[] }> = {
  fast: {
    region: () => process.env.POLLY_REGION || 'ap-south-1',
    engines: process.env.POLLY_ENGINE === 'generative' ? ['generative', 'neural', 'standard'] : ['neural', 'standard'],
  },
  narrator: {
    region: () => process.env.NARRATOR_POLLY_REGION || 'us-east-1',
    engines: process.env.NARRATOR_POLLY_ENGINE === 'neural' ? ['neural', 'standard'] : ['generative', 'neural', 'standard'],
  },
};
const memo = new Map<string, Speech>();
const voiceEngine = new Map<string, PollyEngine>();
const inflight = new Map<string, Promise<Speech & { voiceRejected?: boolean }>>();
const pollyByRegion = new Map<string, any>();
let pollyMod: any = null;
let pollyDisabledReason: string | null = null;

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 20);

export function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function toSsml(text: string): string {
  const body = escapeXml(text)
    .replace(/\.\.\.|…/g, '<break time="350ms"/>')
    .replace(/\s+-\s+/g, ', ');
  return `<speak>${body}</speak>`;
}

/** Rough timings when no speech marks are available, so captions still flow word by word. */
export function estimateMarks(text: string): { marks: WordMark[]; durationMs: number } {
  const marks: WordMark[] = [];
  let t = 150;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    marks.push({ time: Math.round(t), value: m[0].replace(/[^\p{L}\p{N}'-]/gu, '') || m[0], start: m.index, end: m.index + m[0].length });
    t += 120 + m[0].length * 45 + (/[.,!?;:]$/.test(m[0]) ? 220 : 0);
  }
  return { marks, durationMs: Math.round(t + 250) };
}

async function client(region: string) {
  if (!pollyMod) pollyMod = await import('@aws-sdk/client-polly');
  let polly = pollyByRegion.get(region);
  if (!polly) {
    polly = new pollyMod.PollyClient({ region });
    polly.middlewareStack.add((next: any) => async (args: any) => {
      try { return await next(args); } catch (e: any) { if (/Throttl/i.test(e?.name ?? '')) pollyStats.throttled++; throw e; }
    }, { step: 'deserialize', name: 'countThrottles' });
    pollyByRegion.set(region, polly);
  }
  return polly;
}

async function exists(p: string) { try { await stat(p); return true; } catch { return false; } }

// Polly throttles bursts (generative voices especially); a small gate keeps p95 sane.
const MAX_CONCURRENT = Number(process.env.POLLY_CONCURRENCY ?? 8);
// Separate gates so slow narrator renders in the background never delay a suspect's next line.
const gates: Record<VoiceTier, { active: number; waiting: (() => void)[] }> = { fast: { active: 0, waiting: [] }, narrator: { active: 0, waiting: [] } };
export const pollyStats = { calls: 0, throttled: 0, slow: [] as { voice: string; engine: string; format: string; ms: number; chars: number }[] };
async function gate<T>(fn: () => Promise<T>, tier: VoiceTier): Promise<T> {
  const g = gates[tier];
  const max = tier === 'fast' ? MAX_CONCURRENT : Math.max(2, Math.floor(MAX_CONCURRENT / 2));
  if (g.active >= max) await new Promise<void>((r) => g.waiting.push(r));
  g.active++;
  try { return await fn(); } finally { g.active--; g.waiting.shift()?.(); }
}

async function synth(tier: VoiceTier, voice: string, engine: PollyEngine, ssml: string, format: 'mp3' | 'json'): Promise<Uint8Array> {
  return gate(async () => {
    const t0 = Date.now();
    try { return await synthNow(TIERS[tier].region(), voice, engine, ssml, format); } finally {
      const ms = Date.now() - t0;
      if (ms > 4000) { pollyStats.slow.push({ voice, engine, format, ms, chars: ssml.length }); if (pollyStats.slow.length > 50) pollyStats.slow.shift(); }
    }
  }, tier);
}

async function synthNow(region: string, voice: string, engine: PollyEngine, ssml: string, format: 'mp3' | 'json'): Promise<Uint8Array> {
  const c = await client(region);
  pollyStats.calls++;
  const res = await c.send(new pollyMod.SynthesizeSpeechCommand({
    VoiceId: voice, Engine: engine, Text: ssml, TextType: 'ssml', OutputFormat: format,
    ...(format === 'json' ? { SpeechMarkTypes: ['word'] } : { SampleRate: engine === 'standard' ? '22050' : '24000' }),
  }));
  return await res.AudioStream.transformToByteArray();
}

function parseMarks(buf: Uint8Array, text: string): WordMark[] {
  const marks: WordMark[] = [];
  for (const line of Buffer.from(buf).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.type === 'word') marks.push({ time: j.time, value: j.value, start: j.start, end: j.end });
    } catch { /* skip */ }
  }
  // SSML offsets point into the SSML string; map values back onto the plain text in order.
  let cursor = 0;
  for (const m of marks) {
    const i = text.indexOf(m.value, cursor);
    if (i >= 0) { m.start = i; m.end = i + m.value.length; cursor = m.end; } else { delete m.start; delete m.end; }
  }
  return marks;
}

const FALLBACK_VOICES = ['Matthew', 'Joanna', 'Brian', 'Amy', 'Stephen', 'Ruth', 'Gregory', 'Danielle'];
const badVoices = new Set<string>();

/** Voice ids from the case engine that Polly does not know get a stable stand-in voice. */
function fallbackVoice(voice: string) {
  let h = 0; for (const ch of voice) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_VOICES[h % FALLBACK_VOICES.length];
}

export async function speak(text: string, voice: string, tier: VoiceTier = 'fast'): Promise<Speech> {
  if (badVoices.has(voice)) voice = fallbackVoice(voice);
  const k = `${tier}|${voice}|${text.trim()}`;
  const hit = memo.get(k);
  if (hit) return { ...hit, cached: true, ms: 0 };
  let res = await speakWith(text, voice, tier);
  if (!res.audioUrl && res.voiceRejected && !FALLBACK_VOICES.includes(voice)) {
    badVoices.add(voice);
    res = await speakWith(text, fallbackVoice(voice), tier);
  }
  if (res.audioUrl) { memo.set(k, res); if (memo.size > 3000) memo.delete(memo.keys().next().value!); }
  return res;
}

async function speakWith(text: string, voice: string, tier: VoiceTier): Promise<Speech & { voiceRejected?: boolean }> {
  const t0 = Date.now();
  const clean = text.trim();
  if (!clean) return { marks: [], durationMs: 0, ms: 0 };
  if (cfg.ttsProvider !== 'polly' || pollyDisabledReason) return { ...estimateMarks(clean), ms: Date.now() - t0 };
  const key = `${tier}|${voice}|${clean}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async (): Promise<Speech & { voiceRejected?: boolean }> => {
    await mkdir(cfg.audioDir, { recursive: true });
    const vk = `${tier}|${voice}`;
    const order = voiceEngine.has(vk) ? [voiceEngine.get(vk)!] : TIERS[tier].engines;
    // Disk cache first.
    for (const eng of order) {
      const h = hash(`${voice}|${eng}|${clean}`);
      const mp3 = path.join(cfg.audioDir, `${h}.mp3`);
      if (await exists(mp3)) {
        let marks: WordMark[] = [];
        try { marks = JSON.parse(await readFile(path.join(cfg.audioDir, `${h}.json`), 'utf8')); } catch { /* none */ }
        if (!marks.length) marks = estimateMarks(clean).marks;
        let durationMs = lastTime(marks);
        try { durationMs = Number(await readFile(path.join(cfg.audioDir, `${h}.dur`), 'utf8')) || durationMs; } catch { /* old entry */ }
        return { audioUrl: `/audio/${h}.mp3`, marks, durationMs, engine: eng, cached: true, ms: Date.now() - t0 };
      }
    }
    const ssml = toSsml(clean);
    let lastErr: any = null;
    for (const eng of order) {
      try {
        const [audio, marksBuf] = await Promise.all([
          synth(tier, voice, eng, ssml, 'mp3'),
          // Generative voices have no word marks: borrow timings from the neural engine, else estimate.
          synth(tier, voice, eng === 'generative' ? 'neural' : eng, ssml, 'json').catch(() => null),
        ]);
        voiceEngine.set(vk, eng);
        const audioMs = mp3DurationMs(audio);
        let marks = marksBuf ? parseMarks(marksBuf, clean) : [];
        if (!marks.length) marks = estimateMarks(clean).marks;
        // Generative voices return no word marks: stretch the borrowed or estimated timings to the real audio length.
        if (audioMs > 0 && eng === 'generative') {
          const est = lastTime(marks);
          const k = est > 0 ? (audioMs - 250) / est : 1;
          if (k > 0.4 && k < 2.5) for (const m of marks) m.time = Math.round(m.time * k);
        }
        const h = hash(`${voice}|${eng}|${clean}`);
        await writeFile(path.join(cfg.audioDir, `${h}.mp3`), audio);
        await writeFile(path.join(cfg.audioDir, `${h}.json`), JSON.stringify(marks));
        await writeFile(path.join(cfg.audioDir, `${h}.dur`), String(audioMs || lastTime(marks)));
        return { audioUrl: `/audio/${h}.mp3`, marks, durationMs: audioMs || lastTime(marks), engine: eng, cached: false, ms: Date.now() - t0 };
      } catch (e: any) {
        lastErr = e;
        const name = e?.name ?? '';
        if (/Credential|UnrecognizedClient|InvalidSignature|AccessDenied|ExpiredToken/i.test(name + ' ' + (e?.message ?? ''))) {
          pollyDisabledReason = name || 'credentials';
          log.warn(`Polly unavailable (${pollyDisabledReason}); continuing with captions only`);
          break;
        }
        // Engine or voice not supported: try the next engine.
      }
    }
    if (lastErr && !pollyDisabledReason) log.warn(`Polly failed for voice ${voice}: ${lastErr?.name ?? lastErr}`);
    const voiceRejected = /voice|VoiceId/i.test(String(lastErr?.message ?? ''));
    return { ...estimateMarks(clean), ms: Date.now() - t0, voiceRejected };
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

function lastTime(marks: WordMark[]) {
  if (!marks.length) return 0;
  const last = marks[marks.length - 1];
  return last.time + 120 + (last.value?.length ?? 4) * 60 + 300;
}

export function ttsStatus() { return { provider: cfg.ttsProvider, disabled: pollyDisabledReason, engines: Object.fromEntries(voiceEngine) }; }

// ---------- narrator voice (Polly or ElevenLabs) ----------

let elevenWarned = false;

/** The narrator's voice. ElevenLabs when configured (cached forever on disk), else Polly. */
export async function narrate(text: string, tier: VoiceTier = 'narrator'): Promise<Speech> {
  // Default ElevenLabs voice: George (warm British storyteller).
  const key = process.env.ELEVENLABS_API_KEY; const voice = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
  if (cfg.narratorProvider === 'elevenlabs' && key && voice && cfg.ttsProvider !== 'none') {
    const r = await elevenSpeak(text, voice, key).catch((e) => {
      if (!elevenWarned) { elevenWarned = true; log.warn(`ElevenLabs narrator failed (${(e as Error)?.message?.slice(0, 80)}); using Polly`); }
      return null;
    });
    if (r) return r;
  }
  return speak(text, cfg.narratorVoice, tier);
}

async function elevenSpeak(text: string, voice: string, apiKey: string): Promise<Speech> {
  const t0 = Date.now();
  const clean = text.trim();
  const model = process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2';
  const k = `el|${voice}|${model}|${clean}`;
  const hit = memo.get(k);
  if (hit) return { ...hit, cached: true, ms: 0 };
  await mkdir(cfg.audioDir, { recursive: true });
  const h = hash(k);
  const mp3 = path.join(cfg.audioDir, `${h}.mp3`);
  if (await exists(mp3)) {
    let marks: WordMark[] = [];
    try { marks = JSON.parse(await readFile(path.join(cfg.audioDir, `${h}.json`), 'utf8')); } catch { /* none */ }
    const dur = Number(await readFile(path.join(cfg.audioDir, `${h}.dur`), 'utf8').catch(() => '0')) || lastTime(marks);
    const r = { audioUrl: `/audio/${h}.mp3`, marks, durationMs: dur, engine: 'elevenlabs', cached: true, ms: Date.now() - t0 };
    memo.set(k, r);
    return r;
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ text: clean, model_id: model }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j: any = await res.json();
  const audio = Buffer.from(String(j.audio_base64 ?? ''), 'base64');
  if (!audio.length) throw new Error('no audio');
  // Character timings -> word marks.
  const marks: WordMark[] = [];
  const chars: string[] = j.alignment?.characters ?? [];
  const starts: number[] = j.alignment?.character_start_times_seconds ?? [];
  let word = ''; let wStart = 0; let pos = 0; let wPos = 0;
  const flush = () => { const v = word.replace(/[^\p{L}\p{N}'-]/gu, ''); if (v) marks.push({ time: Math.round(wStart * 1000), value: v, start: wPos, end: wPos + word.length }); word = ''; };
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) flush();
    else { if (!word) { wStart = starts[i] ?? 0; wPos = pos; } word += ch; }
    pos += ch.length;
  });
  flush();
  const durationMs = mp3DurationMs(audio) || lastTime(marks);
  await writeFile(mp3, audio);
  await writeFile(path.join(cfg.audioDir, `${h}.json`), JSON.stringify(marks));
  await writeFile(path.join(cfg.audioDir, `${h}.dur`), String(durationMs));
  const r = { audioUrl: `/audio/${h}.mp3`, marks, durationMs, engine: 'elevenlabs', cached: false, ms: Date.now() - t0 };
  memo.set(k, r);
  return r;
}
