// Sound cues, haptics, speech and the little settings that control them.

export interface Prefs {
  sounds: boolean;
  vibration: boolean;
  speakReplies: boolean; // read suspect replies aloud on this phone too
  textSize: 100 | 125 | 150;
  highContrast: boolean;
  reduceMotion: boolean;
}

const PREFS_KEY = 'accomplice:prefs';
const defaults: Prefs = { sounds: true, vibration: true, speakReplies: false, textSize: 100, highContrast: false, reduceMotion: false };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch {
    return { ...defaults };
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode, fine */
  }
}

let prefs = loadPrefs();
export function setPrefs(p: Prefs) {
  prefs = p;
  savePrefs(p);
}
export function getPrefs() {
  return prefs;
}

// ---------- One shared AudioContext ----------
// iOS Safari only lets audio start inside a user gesture, so callers create and
// resume it synchronously from a pointer or click handler.

type ACtor = typeof AudioContext;
let ctx: AudioContext | null = null;

export function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC: ACtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Call from inside a gesture handler, before any await. */
export function unlockAudio() {
  const c = audioCtx();
  if (c && c.state !== 'running') void c.resume().catch(() => {});
  return c;
}

function tone(freqs: number[], dur = 0.09, gain = 0.07, type: OscillatorType = 'sine') {
  if (!prefs.sounds) return;
  const c = audioCtx();
  if (!c || c.state !== 'running') return;
  let t = c.currentTime + 0.01;
  for (const f of freqs) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
    t += dur * 0.85;
  }
}

function buzz(pattern: number | number[]) {
  if (!prefs.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** A short burst of filtered noise: the wax seal cracking. */
function crackle() {
  if (!prefs.sounds) return;
  const c = audioCtx();
  if (!c || c.state !== 'running') return;
  const len = Math.floor(c.sampleRate * 0.18);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // a few sharp snaps that decay fast
    const env = Math.exp(-i / (len * 0.12)) + (i > len * 0.35 && i < len * 0.4 ? 0.6 : 0);
    d[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = 0.35;
  src.connect(bp).connect(g).connect(c.destination);
  src.start();
  tone([110, 82], 0.12, 0.08, 'sine'); // the thump underneath
}

let sealBuf: AudioBuffer | null = null;
let sealLoading = false;
/** Loads the real wax-seal sound once, so the first reveal can use it. */
export function preloadSeal() {
  const c = audioCtx();
  if (!c || sealBuf || sealLoading) return;
  sealLoading = true;
  fetch(`${import.meta.env.BASE_URL}sfx/seal.mp3`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
    .then((b) => c.decodeAudioData(b))
    .then((buf) => (sealBuf = buf))
    .catch(() => {})
    .finally(() => (sealLoading = false));
}

function playSeal() {
  const c = audioCtx();
  if (!prefs.sounds || !c || c.state !== 'running') return false;
  if (!sealBuf) return false;
  const src = c.createBufferSource();
  src.buffer = sealBuf;
  const g = c.createGain();
  g.gain.value = 0.8;
  src.connect(g).connect(c.destination);
  src.start();
  return true;
}

export const cue = {
  crack() {
    if (!playSeal()) crackle();
    buzz([12, 30, 45]);
  },
  thud() {
    tone([70, 55], 0.18, 0.12, 'sine');
    buzz(120);
  },
  heartbeat() {
    buzz([80, 120, 80, 600, 80, 120, 80, 600]);
  },
  nudge() {
    tone([660], 0.07, 0.04, 'triangle');
    buzz(25);
  },
  turn() {
    tone([587, 880], 0.1, 0.05, 'triangle');
    buzz([30, 60, 30]);
  },
  phase() {
    tone([392, 587], 0.14, 0.05, 'triangle');
    buzz([40, 50, 40]);
  },
  talkStart() {
    tone([523, 784], 0.08);
    buzz(35);
  },
  talkStop() {
    tone([784, 523], 0.08);
    buzz([20, 50, 20]);
  },
  clue() {
    tone([988, 1319], 0.12, 0.05, 'triangle');
    buzz([15, 30, 15]);
  },
  peek() {
    tone([330, 494], 0.12, 0.05, 'triangle');
    buzz(20);
  },
  locked() {
    tone([392, 523, 659], 0.11, 0.06, 'triangle');
    buzz([30, 40, 60]);
  },
  error() {
    tone([220, 196], 0.12, 0.05, 'square');
    buzz([60, 40, 60]);
  },
};

// ---------- Speech ----------

export function canSpeak() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: { onEnd?: () => void } = {}) {
  if (!canSpeak()) {
    opts.onEnd?.();
    return false;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  u.rate = 0.98;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  synth.speak(u);
  return true;
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  if (current) {
    current.pause();
    current = null;
  }
}

let current: HTMLAudioElement | null = null;
export function playUrl(url: string, onEnd?: () => void) {
  stopSpeaking();
  const a = new Audio(url);
  current = a;
  a.onended = () => {
    current = null;
    onEnd?.();
  };
  a.onerror = () => {
    current = null;
    onEnd?.();
  };
  return a.play().then(
    () => true,
    () => false,
  );
}
