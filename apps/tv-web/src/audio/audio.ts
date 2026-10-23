// Audio for the living room: suspect voices, narrator, sound effects and music beds.
// Effects come from public/sfx/<name>.mp3, music from public/music/<name>.mp3. Anything missing falls back
// to a synthesized tone (effects) or a synthesized room tone (beds).
import type { SfxName } from '@accomplice/protocol';
import { BASE, MUTED } from '../env';

export type Sfx = SfxName | 'drumroll' | 'nav' | 'whoosh' | 'back' | 'blackout' | 'seal' | 'chair' | 'stamp';
export type Bed = 'theme' | 'investigate' | 'finale' | 'ambient';

const FILE_SFX: Sfx[] = ['join', 'start', 'cardFlip', 'pin', 'string', 'thinking', 'bell', 'gavel', 'reveal', 'win', 'lose', 'tick', 'blackout', 'seal', 'chair', 'drumroll', 'stamp'];
const BED_FILE: Record<Bed, string> = { theme: 'music/theme', investigate: 'music/investigate', finale: 'music/finale', ambient: 'sfx/ambient' };
const BED_GAIN: Record<Bed, number> = { theme: 0.75, investigate: 0.6, finale: 0.85, ambient: 0.9 };
const DUCK = 0.126; // -18 dB under any voice
const FADE = 0.8;   // seconds, crossfade between beds

const LEVEL = { master: 0.9, music: 0.6, sfx: 0.8, voice: 1 };

class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;   // music level and ducking
  private buffers = new Map<string, AudioBuffer | 'missing' | 'loading'>();
  private bed: { name: Bed; src: AudioScheduledSourceNode[]; gain: GainNode } | null = null;
  private wantBed: Bed | null = null;
  private voice: HTMLAudioElement | null = null;
  private ducked = 0;
  private hush = false;
  muted = MUTED;

  /** Voice, music and effects levels, 0..100 each (Settings). */
  setLevels(voice: number, music: number, effects: number): void {
    LEVEL.voice = voice / 100;
    LEVEL.music = 0.6 * music / 100;
    LEVEL.sfx = 0.8 * effects / 100;
    if (this.voice) this.voice.volume = LEVEL.voice;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(LEVEL.sfx, this.ctx.currentTime, 0.05);
    this.applyMusicLevel(0.2);
  }

  /** Must be called from a user gesture (first key press) to satisfy autoplay rules. */
  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = LEVEL.master;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = LEVEL.sfx; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = LEVEL.music; this.musicBus.connect(this.master);
      for (const n of FILE_SFX) void this.load(`sfx/${n}`);
      if (this.wantBed) this.setBed(this.wantBed);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async load(path: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(path);
    if (have && have !== 'loading') return have === 'missing' ? null : have;
    if (!this.ctx) return null;
    if (have === 'loading') {
      // wait for the in-flight load
      for (let i = 0; i < 100 && this.buffers.get(path) === 'loading'; i++) await new Promise((r) => setTimeout(r, 100));
      const b = this.buffers.get(path);
      return b && typeof b !== 'string' ? b : null;
    }
    this.buffers.set(path, 'loading');
    try {
      const res = await fetch(`${BASE}${path}.mp3`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((ok, bad) => this.ctx!.decodeAudioData(data, ok, bad));
      this.buffers.set(path, buf);
      return buf;
    } catch {
      this.buffers.set(path, 'missing');
      return null;
    }
  }

  play(name: Sfx): void {
    if (this.muted || !this.ctx) return;
    if (name === 'thunder') name = 'blackout';
    const buf = this.buffers.get(`sfx/${name}`);
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

  // ---------- music beds ----------
  /** Crossfade to a bed (800 ms). null fades to silence. */
  setBed(name: Bed | null): void {
    this.wantBed = name;
    if (this.muted || !this.ctx) return;
    if (this.bed?.name === name) return;
    const ctx = this.ctx;
    const old = this.bed;
    if (old) {
      old.gain.gain.cancelScheduledValues(ctx.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE);
      old.src.forEach((s) => { try { s.stop(ctx.currentTime + FADE + 0.05); } catch { /* already stopped */ } });
    }
    this.bed = null;
    if (!name) return;
    void this.load(BED_FILE[name]).then((buf) => {
      if (this.wantBed !== name || this.bed?.name === name) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.musicBus);
      const src = buf ? [this.loopSource(buf, gain, name !== 'finale')] : this.synthBed(gain);
      gain.gain.linearRampToValueAtTime(BED_GAIN[name], ctx.currentTime + FADE);
      this.bed = { name, src, gain };
    });
  }
  private loopSource(buf: AudioBuffer, out: AudioNode, loop: boolean): AudioScheduledSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf; s.loop = loop;
    s.connect(out); s.start();
    return s;
  }
  private synthBed(out: AudioNode): AudioScheduledSourceNode[] {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const nb = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const noise = ctx.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const ng = ctx.createGain(); ng.gain.value = 0.12;
    noise.connect(lp).connect(ng).connect(out); noise.start();
    const out2: AudioScheduledSourceNode[] = [noise];
    for (const [f, v] of [[55, 0.02], [82.4, 0.014]] as const) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(out); o.start();
      out2.push(o);
    }
    return out2;
  }
  private applyMusicLevel(tc: number): void {
    if (!this.ctx) return;
    const target = this.hush ? 0 : this.ducked ? LEVEL.music * DUCK : LEVEL.music;
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
  }
  private duck(on: boolean): void {
    this.ducked = Math.max(0, this.ducked + (on ? 1 : -1));
    this.applyMusicLevel(on ? 0.05 : 0.25);
  }
  /** Full silence (for the pause before a name), then back. */
  silence(on: boolean): void { this.hush = on; this.applyMusicLevel(on ? 0.08 : 0.4); }

  // ---------- voices ----------
  /** Play a voice line. Resolves when finished (or on failure). */
  speak(url: string | undefined): { done: Promise<boolean>; elapsed: () => number | null; duration: () => number | null; stop: () => void } {
    this.stopVoice();
    if (!url || this.muted) return { done: Promise.resolve(false), elapsed: () => null, duration: () => null, stop: () => {} };
    const a = new Audio(url) as HTMLAudioElement & { _fin?: (ok: boolean) => void };
    a.preload = 'auto';
    a.volume = LEVEL.voice;
    this.voice = a;
    this.duck(true);
    let settled = false;
    const done = new Promise<boolean>((resolve) => {
      // The Vega WebView does not always fire `ended`, which used to stall the whole voice queue.
      // A watchdog ends the line when playback reaches the end, or when it stops advancing while not paused.
      let lastT = -1; let stillMs = 0;
      const watch = setInterval(() => {
        if (a.paused && a.currentTime > 0) { stillMs = 0; return; } // paused from the remote: wait
        const d = a.duration;
        if (isFinite(d) && d > 0 && a.currentTime >= d - 0.12) return fin(true);
        if (a.currentTime === lastT) stillMs += 250; else { stillMs = 0; lastT = a.currentTime; }
        if (stillMs >= (a.currentTime > 0 ? 1500 : 4000)) fin(a.currentTime > 0);
      }, 250);
      const fin = (ok: boolean) => { if (settled) return; settled = true; clearInterval(watch); this.duck(false); resolve(ok); };
      a.onended = () => fin(true);
      a.onerror = () => fin(false);
      a._fin = fin;
      a.play().catch(() => fin(false));
    });
    return {
      done,
      elapsed: () => (a.currentTime > 0 ? a.currentTime * 1000 : null),
      duration: () => (isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : null),
      stop: () => { a.pause(); a._fin?.(false); },
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
  private warmed = new Set<string>();
  preload(urls: string[]): void {
    for (const u of urls) {
      if (this.warmed.has(u)) continue;
      this.warmed.add(u);
      const a = new Audio(); a.preload = 'auto'; a.src = u;
    }
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
    case 'smudge': noise(ctx, out, t, 0.35, 0.3, 'lowpass', 600, 2); noise(ctx, out, t + 0.1, 0.25, 0.2, 'bandpass', 300, 4); break;
    case 'stamp': tone(ctx, out, 80, t, 0.25, 0.6); noise(ctx, out, t, 0.08, 0.5, 'lowpass', 900); break;
    case 'seal': noise(ctx, out, t, 0.05, 0.5, 'highpass', 2500); noise(ctx, out, t + 0.06, 0.08, 0.3, 'bandpass', 1200, 2); break;
    case 'chair': noise(ctx, out, t, 0.3, 0.15, 'bandpass', 300, 3); tone(ctx, out, 120, t + 0.2, 0.15, 0.2); break;
    case 'blackout': tone(ctx, out, 45, t, 1.6, 0.5); noise(ctx, out, t, 1.8, 0.35, 'lowpass', 400); break;
    case 'drumroll': for (let i = 0; i < 40; i++) noise(ctx, out, t + i * 0.05, 0.05, 0.1 + i * 0.006, 'bandpass', 220, 1.2); tone(ctx, out, 70, t + 2.05, 0.6, 0.6); noise(ctx, out, t + 2.05, 0.8, 0.3, 'highpass', 5000); break;
  }
}

export const audio = new AudioManager();
