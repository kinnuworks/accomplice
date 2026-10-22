// Hold-to-talk speech capture.
//
// Path 1 (preferred): mic -> AudioWorklet -> 16 kHz PCM16 -> /stt WebSocket -> {partial|final}.
// Path 2 (fallback): the browser's own SpeechRecognition, if /stt is unreachable.
// Path 3: no mic at all -> the UI switches to typing.
//
// start() must be called from inside a user gesture. It creates and resumes the
// AudioContext before its first await, which is what iOS Safari requires.

import { audioCtx, unlockAudio } from './feedback';

export type VoiceMode = 'stream' | 'native' | 'demo' | 'none';
export type VoiceFailure = 'denied' | 'unsupported' | 'insecure' | 'nodevice' | 'failed';

export interface VoiceCallbacks {
  onText(text: string, isFinal: boolean): void;
  onLevel(level: number): void;
  onFallback?(mode: VoiceMode): void;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function canStream() {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return typeof md?.getUserMedia === 'function' && typeof AudioWorkletNode !== 'undefined';
}

function nativeRecognizer(): SRCtor | null {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupport(): { ok: boolean; reason?: VoiceFailure } {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
  if (canStream() || nativeRecognizer()) return { ok: true };
  return { ok: false, reason: 'unsupported' };
}

export class VoiceError extends Error {
  constructor(public kind: VoiceFailure) {
    super(kind);
  }
}

const DEMO_LINES = [
  'Where were you at nine o clock, and who can vouch for you?',
  'Why was the candlestick missing from the library?',
  'Did you see anyone near the study after the dinner bell?',
];

export class VoiceCapture {
  mode: VoiceMode;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private workletReady: Promise<void> | null = null;
  private ws: WebSocket | null = null;
  private wsDone: Promise<void> | null = null;
  private pending: ArrayBuffer[] = [];
  private capturing = false;
  private finals: string[] = [];
  private partial = '';
  private rec: SpeechRecognitionLike | null = null;
  private recEnded: Promise<void> | null = null;
  private idleTimer: number | undefined;
  private demoTimer: number | undefined;
  private demoIndex = 0;

  constructor(
    private cb: VoiceCallbacks,
    private opts: { demo?: boolean; sttPath?: string } = {},
  ) {
    if (opts.demo) this.mode = 'demo';
    else if (!window.isSecureContext) this.mode = 'none';
    else if (canStream()) this.mode = 'stream';
    else if (nativeRecognizer()) this.mode = 'native';
    else this.mode = 'none';
  }

  get text() {
    return [...this.finals, this.partial].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  private emit(isFinal = false) {
    this.cb.onText(this.text, isFinal);
  }

  /** Call synchronously from the gesture. Resolves once audio is flowing. */
  async start(): Promise<void> {
    window.clearTimeout(this.idleTimer);
    this.finals = [];
    this.partial = '';
    if (this.mode === 'demo') return this.startDemo();
    if (this.mode === 'none') {
      throw new VoiceError(window.isSecureContext ? 'unsupported' : 'insecure');
    }
    if (this.mode === 'native') return this.startNative();

    // stream mode
    unlockAudio(); // before any await: iOS needs this inside the gesture
    this.capturing = true;
    this.openSocket();
    try {
      await this.ensureMic();
    } catch (e) {
      this.capturing = false;
      this.closeSocket();
      throw e;
    }
  }

  /** Stops listening and resolves with the best transcript we have. */
  async stop(): Promise<string> {
    if (this.mode === 'demo') return this.stopDemo();
    if (this.mode === 'native') return this.stopNative();
    if (!this.capturing) return this.text;
    this.capturing = false;
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ t: 'end' }));
      } catch {
        /* ignore */
      }
      // Give the service a moment to send the last final result.
      await Promise.race([this.wsDone, new Promise((r) => setTimeout(r, 1500))]);
    }
    this.closeSocket();
    this.scheduleRelease();
    if (this.partial) {
      this.finals.push(this.partial);
      this.partial = '';
    }
    return this.text;
  }

  /** Abandon whatever is going on and free the mic. */
  dispose() {
    this.capturing = false;
    window.clearTimeout(this.demoTimer);
    this.closeSocket();
    this.rec?.abort();
    this.rec = null;
    this.releaseMic();
  }

  // ---------- stream mode ----------

  private socketUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${this.opts.sttPath ?? '/stt'}?rate=16000&encoding=pcm16le`;
  }

  private openSocket() {
    let opened = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.socketUrl());
    } catch {
      void this.fallBack();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.pending = [];
    let resolveDone: () => void = () => {};
    this.wsDone = new Promise<void>((r) => (resolveDone = r));
    const openTimer = window.setTimeout(() => {
      if (!opened) ws.close();
    }, 3500);

    ws.onopen = () => {
      opened = true;
      window.clearTimeout(openTimer);
      for (const b of this.pending) ws.send(b);
      this.pending = [];
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: { partial?: string; final?: string; error?: string };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof msg.final === 'string') {
        if (msg.final.trim()) this.finals.push(msg.final.trim());
        this.partial = '';
        this.emit(true);
      } else if (typeof msg.partial === 'string') {
        this.partial = msg.partial;
        this.emit(false);
      } else if (msg.error && !this.text) {
        void this.fallBack();
      }
    };
    ws.onclose = () => {
      window.clearTimeout(openTimer);
      resolveDone();
      if (this.ws === ws) this.ws = null;
      // Never opened, or dropped while we were still talking with nothing heard: switch engines.
      if (this.capturing && !this.text) void this.fallBack();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  }

  private async fallBack() {
    if (this.mode !== 'stream') return;
    if (!nativeRecognizer()) {
      // No browser engine either. Keep the mic open so at least nothing breaks;
      // the UI will offer typing when the transcript comes back empty.
      return;
    }
    const wasCapturing = this.capturing;
    this.capturing = false;
    this.closeSocket();
    this.releaseMic();
    this.mode = 'native';
    this.cb.onFallback?.('native');
    if (wasCapturing) {
      try {
        await this.startNative();
      } catch {
        /* surfaced on stop */
      }
    }
  }

  private async ensureMic() {
    const c = audioCtx();
    if (!c) throw new VoiceError('unsupported');
    if (!this.stream || this.stream.getAudioTracks().every((t) => t.readyState === 'ended')) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') throw new VoiceError('denied');
        if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new VoiceError('nodevice');
        throw new VoiceError('failed');
      }
      this.source = null;
    }
    if (!this.workletReady) {
      this.workletReady = c.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-worklet.js`);
    }
    try {
      await this.workletReady;
    } catch {
      this.workletReady = null;
      throw new VoiceError('unsupported');
    }
    if (c.state !== 'running') await c.resume().catch(() => {});
    if (!this.node) {
      this.node = new AudioWorkletNode(c, 'pcm-worklet', { numberOfInputs: 1, numberOfOutputs: 0 });
      this.node.port.onmessage = (ev: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        if (!this.capturing) return;
        this.cb.onLevel(ev.data.level);
        const ws = this.ws;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(ev.data.pcm);
        else if (ws && ws.readyState === WebSocket.CONNECTING && this.pending.length < 60) this.pending.push(ev.data.pcm);
      };
    }
    if (!this.source) {
      this.source = c.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
    }
  }

  /** Keep the mic warm for a short while so the next question starts instantly. */
  private scheduleRelease() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.releaseMic(), 25000);
  }

  private releaseMic() {
    window.clearTimeout(this.idleTimer);
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // ---------- native mode ----------

  private startNative(): Promise<void> {
    const SR = nativeRecognizer();
    if (!SR) return Promise.reject(new VoiceError('unsupported'));
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    this.rec = rec;
    let resolveEnd: () => void = () => {};
    this.recEnded = new Promise<void>((r) => (resolveEnd = r));
    let failure: VoiceFailure | null = null;
    rec.onresult = (e) => {
      const finals: string[] = [];
      let partial = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals.push(r[0].transcript.trim());
        else partial += r[0].transcript;
      }
      this.finals = finals;
      this.partial = partial.trim();
      this.emit(false);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') failure = 'denied';
      else if (e.error === 'audio-capture') failure = 'nodevice';
    };
    rec.onend = () => resolveEnd();
    return new Promise<void>((resolve, reject) => {
      try {
        rec.start();
      } catch {
        reject(new VoiceError('failed'));
        return;
      }
      // SpeechRecognition reports permission problems asynchronously.
      setTimeout(() => (failure ? reject(new VoiceError(failure)) : resolve()), 250);
    });
  }

  private async stopNative(): Promise<string> {
    const rec = this.rec;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      await Promise.race([this.recEnded, new Promise((r) => setTimeout(r, 1500))]);
    }
    this.rec = null;
    if (this.partial) {
      this.finals.push(this.partial);
      this.partial = '';
    }
    return this.text;
  }

  // ---------- demo mode: types out a sample question ----------

  private startDemo(): Promise<void> {
    const line = DEMO_LINES[this.demoIndex++ % DEMO_LINES.length];
    const words = line.split(' ');
    let i = 0;
    const tick = () => {
      i++;
      this.partial = words.slice(0, i).join(' ');
      this.cb.onLevel(0.3 + Math.random() * 0.5);
      this.emit(false);
      if (i < words.length) this.demoTimer = window.setTimeout(tick, 170);
    };
    this.demoTimer = window.setTimeout(tick, 250);
    return Promise.resolve();
  }

  private stopDemo(): Promise<string> {
    window.clearTimeout(this.demoTimer);
    if (this.partial) this.finals = [this.partial.replace(/\?*$/, '?')];
    this.partial = '';
    this.cb.onLevel(0);
    return Promise.resolve(this.text);
  }
}
