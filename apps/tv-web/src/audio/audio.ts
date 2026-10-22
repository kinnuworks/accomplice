// Audio for the living room: suspect voices, narrator, sound effects and a soft ambient bed.
// Files come from public/sfx/<name>.mp3. Anything missing falls back to a synthesized tone.
import type { SfxName } from '@accomplice/protocol';
import { BASE, MUTED } from '../env';

export type Sfx = SfxName | 'drumroll' | 'nav' | 'whoosh' | 'back';

const FILE_SFX: Sfx[] = ['join', 'start', 'cardFlip', 'pin', 'string', 'thinking', 'bell', 'gavel', 'reveal', 'win', 'lose', 'tick'];

const LEVEL = { master: 0.9, bed: 0.22, bedDucked: 0.07, sfx: 0.55, ui: 0.18, voice: 1 };

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private bedBus!: GainNode;
  private buffers = new Map<string, AudioBuffer | 'missing' | 'loading'>();
  private bedStarted = false;
  private voice: HTMLAudioElement | null = null;
  private ducked = 0;
  muted = MUTED;

  /** Must be called from a user gesture (first key press) to satisfy autoplay rules. */
  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = LEVEL.master;
      // gentle limiter so stacked effects never clip on TV speakers
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = LEVEL.sfx; this.sfxBus.connect(this.master);
      this.bedBus = this.ctx.createGain(); this.bedBus.gain.value = 0; this.bedBus.connect(this.master);
      for (const n of [...FILE_SFX, 'ambient']) void this.load(n);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async load(name: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(name);
    if (have && have !== 'loading') return have === 'missing' ? null : have;
    if (have === 'loading' || !this.ctx) return null;
    this.buffers.set(name, 'loading');
    try {
      const res = await fetch(`${BASE}sfx/${name}.mp3`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, bad) => this.ctx!.decodeAudioData(data, ok, bad));
      this.buffers.set(name, buf);
      if (name === 'ambient' && this.bedStarted) this.startBedFile(buf);
      return buf;
    } catch {
      this.buffers.set(name, 'missing');
      if (name === 'ambient' && this.bedStarted) this.startBedSynth();
      return null;
    }
  }

  play(name: Sfx): void {
    if (this.muted || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (buf && typeof buf !== 'string') {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = name === 'tick' ? 0.6 : 1;
      src.connect(g).connect(this.sfxBus);
      src.start();
      return;
    }
    synth(this.ctx, this.sfxBus, name);
  }

  // ---------- ambient bed ----------
  startBed(): void {
    if (this.muted || !this.ctx || this.bedStarted) return;
    this.bedStarted = true;
    const b = this.buffers.get('ambient');
    if (b && typeof b !== 'string') this.startBedFile(b);
    else if (b === 'missing') this.startBedSynth();
    // else: load() will start it when ready
    this.bedBus.gain.setTargetAtTime(this.ducked ? LEVEL.bedDucked : LEVEL.bed, this.ctx.currentTime, 1.5);
  }
  private startBedFile(buf: AudioBuffer): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.connect(this.bedBus); src.start();
  }
  private startBedSynth(): void {
    const ctx = this.ctx!;
    // brown noise room tone
    const len = ctx.sampleRate * 4;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    noise.connect(lp).connect(ng).connect(this.bedBus); noise.start();
    // warm low drone, slowly breathing
    for (const [f, v] of [[55, 0.05], [82.4, 0.035], [110.3, 0.02]] as const) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + f / 4000;
      const lg = ctx.createGain(); lg.gain.value = v * 0.5;
      lfo.connect(lg).connect(g.gain); lfo.start();
      o.connect(g).connect(this.bedBus); o.start();
    }
    // candle crackle
    const crackle = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      const cb = ctx.createBuffer(1, 400, ctx.sampleRate);
      const cd = cb.getChannelData(0);
      for (let i = 0; i < 400; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / 400) ** 3;
      s.buffer = cb;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = ctx.createGain(); g.gain.value = 0.08 + Math.random() * 0.12;
      s.connect(hp).connect(g).connect(this.bedBus); s.start(t);
      setTimeout(crackle, 180 + Math.random() * 2400);
    };
    crackle();
  }
  private duck(on: boolean): void {
    this.ducked += on ? 1 : -1;
    if (this.ducked < 0) this.ducked = 0;
    if (!this.ctx || !this.bedStarted) return;
    this.bedBus.gain.setTargetAtTime(this.ducked ? LEVEL.bedDucked : LEVEL.bed, this.ctx.currentTime, on ? 0.12 : 0.6);
  }

  // ---------- voices ----------
  /** Play a voice line. Resolves when finished (or immediately on failure). `elapsed` gives ms into the line. */
  speak(url: string | undefined): { done: Promise<boolean>; elapsed: () => number | null; duration: () => number | null; stop: () => void } {
    this.stopVoice();
    if (!url || this.muted) return { done: Promise.resolve(false), elapsed: () => null, duration: () => null, stop: () => {} };
    const a = new Audio(url);
    a.preload = 'auto';
    a.volume = LEVEL.voice;
    this.voice = a;
    this.duck(true);
    let settled = false;
    const done = new Promise<boolean>((resolve) => {
      const fin = (ok: boolean) => {
        if (settled) return;
        settled = true;
        this.duck(false);
        resolve(ok);
      };
      a.onended = () => fin(true);
      a.onerror = () => fin(false);
      (a as HTMLAudioElement & { _fin?: (ok: boolean) => void })._fin = fin;
      a.play().catch(() => fin(false));
    });
    return {
      done,
      elapsed: () => (a.currentTime > 0 ? a.currentTime * 1000 : null),
      duration: () => (isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : null),
      stop: () => { a.pause(); (a as HTMLAudioElement & { _fin?: (ok: boolean) => void })._fin?.(false); },
    };
  }
  stopVoice(): void {
    const v = this.voice as (HTMLAudioElement & { _fin?: (ok: boolean) => void }) | null;
    if (v) { v.pause(); v._fin?.(false); }
    this.voice = null;
  }
  togglePause(): boolean {
    const v = this.voice;
    if (!v) return false;
    if (v.paused) void v.play(); else v.pause();
    return true;
  }
  preload(urls: string[]): void {
    for (const u of urls) { const a = new Audio(); a.preload = 'auto'; a.src = u; }
  }
}

// ---------- synthesized fallbacks ----------
function env(ctx: AudioContext, g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function tone(ctx: AudioContext, out: AudioNode, f: number, t: number, dur: number, peak = 0.3, type: OscillatorType = 'sine'): void {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ctx.createGain(); env(ctx, g, t, peak, 0.01, dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function noise(ctx: AudioContext, out: AudioNode, t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 1): void {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(ctx, g, t, peak, 0.005, dur);
  s.connect(f).connect(g).connect(out); s.start(t);
}
function synth(ctx: AudioContext, out: AudioNode, name: Sfx): void {
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'nav': tone(ctx, out, 1320, t, 0.05, 0.04, 'triangle'); break;
    case 'back': tone(ctx, out, 660, t, 0.07, 0.05, 'triangle'); break;
    case 'tick': noise(ctx, out, t, 0.03, 0.3, 'bandpass', 3200, 4); break;
    case 'join': tone(ctx, out, 784, t, 0.35, 0.22); tone(ctx, out, 1175, t + 0.09, 0.5, 0.18); break;
    case 'start': [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, f, t + i * 0.09, 0.5, 0.18, 'triangle')); break;
    case 'cardFlip': noise(ctx, out, t, 0.12, 0.4, 'bandpass', 2400, 0.8); noise(ctx, out, t + 0.06, 0.08, 0.25, 'bandpass', 1500, 1); break;
    case 'pin': tone(ctx, out, 2100, t, 0.08, 0.2, 'square'); noise(ctx, out, t, 0.04, 0.4, 'highpass', 4000); break;
    case 'string': {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.5);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
      const g = ctx.createGain(); env(ctx, g, t, 0.18, 0.005, 0.55);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.6);
      break;
    }
    case 'thinking': [0, 0.35, 0.7, 1.05].forEach((d, i) => tone(ctx, out, i % 2 ? 880 : 988, t + d, 0.2, 0.08)); break;
    case 'bell': [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(ctx, out, 523 * m, t, 2.2 / (i + 1), 0.22 / (i + 1))); break;
    case 'gavel': tone(ctx, out, 90, t, 0.35, 0.6); noise(ctx, out, t, 0.06, 0.6, 'lowpass', 1200); tone(ctx, out, 90, t + 0.45, 0.3, 0.5); noise(ctx, out, t + 0.45, 0.06, 0.5, 'lowpass', 1200); break;
    case 'reveal': [196, 233, 294, 370].forEach((f) => tone(ctx, out, f, t, 1.8, 0.12, 'sawtooth')); noise(ctx, out, t, 1.6, 0.12, 'highpass', 6000); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, f, t + i * 0.11, 0.7, 0.16, 'triangle')); break;
    case 'lose': [392, 370, 349, 294].forEach((f, i) => tone(ctx, out, f, t + i * 0.22, 0.5, 0.15, 'triangle')); break;
    case 'whoosh': noise(ctx, out, t, 0.5, 0.18, 'bandpass', 900, 0.6); break;
    case 'drumroll': for (let i = 0; i < 40; i++) noise(ctx, out, t + i * 0.05, 0.05, 0.1 + i * 0.006, 'bandpass', 220, 1.2); tone(ctx, out, 70, t + 2.05, 0.6, 0.6); noise(ctx, out, t + 2.05, 0.8, 0.3, 'highpass', 5000); break;
  }
}

export const audio = new AudioManager();
