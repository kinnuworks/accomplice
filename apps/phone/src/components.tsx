import { useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import type { Clue } from '@accomplice/protocol';
import { useGame } from './game';

export const AVATARS = [
  { id: '🕯️', label: 'Candle' },
  { id: '🎩', label: 'Top hat' },
  { id: '🔑', label: 'Old key' },
  { id: '🌹', label: 'Rose' },
  { id: '🫖', label: 'Teapot' },
  { id: '🦉', label: 'Owl' },
  { id: '🐈‍⬛', label: 'Black cat' },
  { id: '🕰️', label: 'Mantel clock' },
];
export const avatarLabel = (id: string) => AVATARS.find((a) => a.id === id)?.label ?? 'Guest';

const HUES = [18, 330, 200, 42, 280, 160];
function hueFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}
function initials(name: string) {
  const parts = name.replace(/^(Dr|Mr|Mrs|Ms|Miss|Lady|Lord|Captain|Sir)\.?\s+/i, '').split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const BASE = import.meta.env.BASE_URL;

/** Small copy of a portrait, made for phones (192px). Falls back to the full painting, then a cameo. */
function portraitSources(src: string) {
  const file = src.split('/').pop() ?? src;
  const dir = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : 'portraits';
  return [`${BASE}art/${dir}/sm/${file}`, `${BASE}art/${src}`];
}

/**
 * Suspect portrait. Pass `alt` when the picture stands alone; leave it out when the
 * name is already written right next to it (inside a labelled choice), so screen
 * readers don't hear every name twice.
 */
export function Portrait({
  id,
  name,
  src,
  size = 56,
  speaking,
  alt,
}: {
  id: string;
  name: string;
  src?: string;
  size?: number;
  speaking?: boolean;
  alt?: string;
}) {
  const sources = src ? portraitSources(src) : [];
  const [attempt, setAttempt] = useState(0);
  const hue = hueFor(id);
  const url = sources[attempt];
  return (
    <span
      className={`portrait${speaking ? ' is-speaking' : ''}`}
      style={{ width: size, height: size }}
      {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
    >
      {url ? (
        <img src={url} alt="" width={size} height={size} onError={() => setAttempt((a) => a + 1)} decoding="async" loading="lazy" />
      ) : (
        <svg viewBox="0 0 64 64" width={size} height={size}>
          <defs>
            <radialGradient id={`g-${id}`} cx="50%" cy="35%" r="70%">
              <stop offset="0" stopColor={`hsl(${hue} 45% 42%)`} />
              <stop offset="1" stopColor={`hsl(${hue} 50% 16%)`} />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="31" fill={`url(#g-${id})`} />
          <path d="M14 60c2-11 9-17 18-17s16 6 18 17" fill={`hsl(${hue} 35% 10% / .75)`} />
          <circle cx="32" cy="28" r="10" fill={`hsl(${hue} 35% 10% / .75)`} />
          <text x="32" y="38" textAnchor="middle" fontSize="19" fontFamily="var(--font-display)" fill="#f6e3b0" fontWeight="600">
            {initials(name)}
          </text>
        </svg>
      )}
    </span>
  );
}

export const portraitAlt = (s: { name: string; role: string }) => `Portrait of ${s.name}, ${s.role}`;

/** Painted backdrop for the case, chosen by name or mood. */
export function sceneFor(c: { id: string; title: string; place: string; tone: string } | null | undefined) {
  if (!c) return null;
  const hay = `${c.id} ${c.title} ${c.place}`.toLowerCase();
  const known = ['ashby-hall', 'sapphire-express', 'marigold-manor'];
  const hit = known.find((k) => hay.includes(k.split('-')[0]));
  const scene = hit ?? (c.tone === 'cozy' ? 'marigold-manor' : 'ashby-hall');
  return `${BASE}art/scenes/sm/${scene}.webp`;
}

const KIND_LABEL: Record<Clue['kind'], string> = { physical: 'Physical evidence', document: 'Document', testimony: 'Testimony' };

export function ClueCard({ clue, isNew, index }: { clue: Clue; isNew?: boolean; index: number }) {
  const h = useId();
  return (
    <li className={`clue clue--${clue.kind}`} style={{ ['--tilt' as string]: `${(index % 3) - 1}deg` }}>
      <article aria-labelledby={h}>
        <p className="clue__meta">
          <span>{KIND_LABEL[clue.kind]}</span>
          <span>Round {clue.round}</span>
        </p>
        <h3 id={h} className="clue__title">
          {clue.title}
          {isNew && <span className="badge badge--new">New</span>}
        </h3>
        <p className="clue__text">{clue.text}</p>
      </article>
    </li>
  );
}

/** Focus the screen heading when a screen appears, so screen readers land in the right place. */
export function ScreenHeading({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Don't steal focus on the very first page load; do it on every screen change after.
    if (document.body.dataset.booted) ref.current?.focus({ preventScroll: false });
    document.body.dataset.booted = '1';
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={`screen-title ${className ?? ''}`}>
      {children}
    </h1>
  );
}

export function Toast() {
  const { toast, dismissToast } = useGame();
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, 7000);
    return () => window.clearTimeout(t);
  }, [toast, dismissToast]);
  if (!toast) return null;
  // Already spoken through the live region, so this is visual only.
  return (
    <div className={`toast toast--${toast.kind}`}>
      <p>{toast.text}</p>
      <button type="button" className="btn btn--ghost btn--small" onClick={dismissToast}>
        Dismiss
      </button>
    </div>
  );
}

export function ConnectionBanner() {
  const { status } = useGame();
  if (status !== 'reconnecting' && status !== 'connecting') return null;
  return (
    <p className="conn" role="status">
      <span className="conn__dot" aria-hidden="true" />
      {status === 'connecting' ? 'Finding the parlour...' : 'Lost the TV for a moment. Reconnecting...'}
    </p>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { prefs, setPrefs } = useGame();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  type BoolKey = 'sounds' | 'vibration' | 'speakReplies' | 'highContrast' | 'reduceMotion';
  const toggle = (k: BoolKey, label: string, hint: string) => (
    <div className="switch">
      <input
        id={`pref-${k}`}
        type="checkbox"
        role="switch"
        checked={prefs[k]}
        onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })}
        aria-describedby={`pref-${k}-hint`}
      />
      <label htmlFor={`pref-${k}`}>{label}</label>
      <p id={`pref-${k}-hint`} className="hint">
        {hint}
      </p>
    </div>
  );
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="settings-title" onClose={onClose} onCancel={onClose}>
      <h2 id="settings-title">Settings</h2>
      {toggle('sounds', 'Sound cues', 'Little chimes when you start and stop talking, and when clues arrive.')}
      {toggle('vibration', 'Vibration', 'A buzz when the mic opens and closes. Not every phone can do this.')}
      {toggle('speakReplies', 'Read replies on my phone', 'Suspects also speak from your phone, handy with headphones.')}
      <fieldset className="field text-size">
        <legend>Text size</legend>
        <div className="seg">
          {([100, 125, 150] as const).map((n) => (
            <label key={n} className="seg__opt">
              <input type="radio" name="text-size" value={n} checked={prefs.textSize === n} onChange={() => setPrefs({ ...prefs, textSize: n })} />
              <span>{n}%</span>
            </label>
          ))}
        </div>
        <p className="hint">On top of your phone&rsquo;s own text size.</p>
      </fieldset>
      {toggle('highContrast', 'High contrast', 'Brighter text and stronger outlines.')}
      {toggle('reduceMotion', 'Reduce motion', 'No shimmer, wiggles or sliding cards.')}
      <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}

export function Icon({ name }: { name: 'gear' | 'mic' | 'stop' | 'speaker' | 'keyboard' | 'eye' | 'lock' }) {
  const p: Record<string, React.ReactNode> = {
    gear: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" />
      </>
    ),
    stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
    speaker: (
      <>
        <path d="M4 9h4l5-4v14l-5-4H4z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      </>
    ),
    keyboard: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2" />
        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  };
  return (
    <svg className="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {p[name]}
    </svg>
  );
}

/** Asked before anything secret is read out loud. */
export function EarbudDialog() {
  const { earbudOpen, answerEarbud } = useGame();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (earbudOpen && !d.open) d.showModal();
    if (!earbudOpen && d.open) d.close();
  }, [earbudOpen]);
  return (
    <dialog
      ref={ref}
      className="sheet sheet--earbud"
      aria-labelledby="earbud-h"
      aria-describedby="earbud-d"
      onCancel={(e) => {
        e.preventDefault();
        answerEarbud(false);
      }}
    >
      <p className="sheet__emoji" aria-hidden="true">
        🎧
      </p>
      <h2 id="earbud-h">Put in one earbud first</h2>
      <p id="earbud-d">Or this will be read out loud, and everyone at the table will hear your secrets.</p>
      <div className="stack">
        <button type="button" className="btn btn--primary btn--block btn--big" onClick={() => answerEarbud(true)}>
          Continue
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => answerEarbud(false)}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
