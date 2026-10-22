// Listening (browser speech recognition) and speaking (server audio first, then speech synthesis).

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionCtor() !== null;

export interface ListenHandle { stop(): void; cancel(): void }

/** Listen for one utterance. onInterim shows words as they come; onFinal fires once with the full text (or '' on silence). */
export function listen(onInterim: (t: string) => void, onFinal: (t: string) => void, onError: (msg: string) => void): ListenHandle | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let done = false;
  const finish = (t: string) => { if (!done) { done = true; onFinal(t.trim()); } };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i]!;
      if (r.isFinal) finalText += r[0]!.transcript;
      else interim += r[0]!.transcript;
    }
    onInterim((finalText + ' ' + interim).trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    done = true;
    onError(e.error === 'not-allowed' ? 'Microphone access is blocked. You can type instead.' : `I could not hear that (${e.error}). You can type instead.`);
  };
  rec.onend = () => finish(finalText);
  try { rec.start(); } catch { return null; }
  return { stop: () => rec.stop(), cancel: () => { done = true; rec.abort(); } };
}

let current: { stop(): void } | null = null;

export function stopSpeaking() {
  current?.stop();
  current = null;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /en[-_]US/i.test(v.lang) && /natural|neural|premium|enhanced/i.test(v.name))
    ?? voices.find((v) => /en[-_]US/i.test(v.lang))
    ?? voices.find((v) => v.lang.startsWith('en'));
}

function synth(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    current = { stop: () => { window.speechSynthesis.cancel(); resolve(); } };
    window.speechSynthesis.speak(u);
    // Some browsers never fire onend when muted or headless; do not hang the device.
    setTimeout(resolve, Math.min(30_000, 1500 + text.length * 80));
  });
}

/** Speak a reply. Plays the server's recorded line when there is one, otherwise reads the text. */
export async function speak(text: string, audioUrl?: string, muted = false): Promise<void> {
  stopSpeaking();
  if (muted) return;
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    const played = await new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      current = { stop: () => { audio.pause(); resolve(true); } };
      audio.play().catch(() => resolve(false));
    });
    if (played) return;
  }
  await synth(text);
}

/** Plays lines one after another (server audio or synthesized), so streamed sentences queue up naturally. */
export class SpeechQueue {
  private items: { text: string; audioUrl?: string }[] = [];
  private running = false;
  private muted: () => boolean;
  onStart?: () => void;
  onIdle?: () => void;
  constructor(muted: () => boolean) { this.muted = muted; }
  push(text: string, audioUrl?: string) {
    const clean = text.replace(/[*_#`>]+/g, '').trim();
    if (!clean && !audioUrl) return;
    this.items.push({ text: clean, audioUrl });
    void this.run();
  }
  clear() { this.items = []; stopSpeaking(); }
  get busy() { return this.running || this.items.length > 0; }
  private async run() {
    if (this.running) return;
    this.running = true;
    this.onStart?.();
    while (this.items.length) {
      const it = this.items.shift()!;
      await speakOne(it.text, it.audioUrl, this.muted());
    }
    this.running = false;
    this.onIdle?.();
  }
}

/** Like speak(), but does not cancel what is already queued. */
async function speakOne(text: string, audioUrl: string | undefined, muted: boolean): Promise<void> {
  if (muted) { await new Promise((r) => setTimeout(r, Math.min(2500, 300 + text.length * 25))); return; }
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    const ok = await new Promise<boolean>((resolve) => {
      audio.onended = () => resolve(true);
      audio.onerror = () => resolve(false);
      current = { stop: () => { audio.pause(); resolve(true); } };
      audio.play().catch(() => resolve(false));
    });
    if (ok) return;
  }
  await synth(text);
}
