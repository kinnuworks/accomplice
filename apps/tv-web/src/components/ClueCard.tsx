import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { BoardClue } from '../net/types';
import { KindIcon } from './Ornament';

export const KIND_LABEL = { physical: 'Physical', document: 'Document', testimony: 'Testimony' } as const;

export function hashTilt(id: string, range = 1): number {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * range * 2 - range;
}

/** Card face line: the case's short text, else the first sentence. */
export function faceText(c: BoardClue): string {
  if (c.short) return c.short;
  const first = c.text.split(/(?<=[.!?])\s/)[0];
  return first.length <= 90 ? first : `${first.slice(0, 86).replace(/\s+\S*$/, '')}...`;
}

interface Props {
  clue: BoardClue;
  pinned?: boolean;
  linkSource?: boolean;
  fresh?: boolean;
  nav?: boolean;
  autofocus?: boolean;
  full?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  linkedCount?: number;
  smudged?: boolean;
}

export const ClueCard = memo(function ClueCard({ clue, pinned, linkSource, fresh, nav, autofocus, full, onClick, style, className = '', linkedCount = 0, smudged }: Props) {
  // shrink to fit, never truncate: title 34 -> 28 px, text 30 -> 28 px (the 10-foot floor), then drop the short line
  const inner = useRef<HTMLSpanElement>(null);
  const [lvl, setLvl] = useState(0);
  const LEVELS = [[34, 30], [32, 30], [32, 28], [30, 28], [28, 28], [30, 28, 1], [28, 28, 1]] as const;
  const [fontsTick, setFontsTick] = useState(0);
  useLayoutEffect(() => { setLvl(0); }, [clue.id, clue.title, clue.short, clue.text, full, fontsTick]);
  // fonts arriving late change the measurements; refit once they are in
  useLayoutEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => { if (live) setFontsTick((n) => n + 1); });
    const onLoad = () => setFontsTick((n) => n + 1);
    document.fonts?.addEventListener?.('loadingdone', onLoad);
    return () => { live = false; document.fonts?.removeEventListener?.('loadingdone', onLoad); };
  }, []);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || lvl >= LEVELS.length - 1) return;
    if (el.scrollHeight > el.clientHeight + 1) setLvl(lvl + 1);
  });
  const [ct, cb, noShort] = LEVELS[lvl] as readonly number[];
  const label = smudged ? `Clue, ${clue.kind}, ${clue.title}. Smudged: someone spilled ink on it.` : `Clue, ${clue.kind}, ${clue.title}. ${clue.text} ${pinned ? 'Pinned.' : 'Not pinned.'}${linkedCount ? ` Tied to ${linkedCount} other clue${linkedCount > 1 ? 's' : ''}.` : ''}`;
  return (
    <button
      className={`clue-card kind-${clue.kind} ${noShort && !full ? 'no-short' : ''} ${smudged ? 'is-smudged' : ''} ${pinned ? 'is-pinned' : ''} ${linkSource ? 'is-source' : ''} ${fresh ? 'is-fresh' : ''} ${className}`}
      style={{ ['--tilt' as string]: `${hashTilt(clue.id)}deg`, ...style }}
      data-nav={nav ? '' : undefined}
      data-nav-id={`clue-${clue.id}`}
      data-nav-autofocus={autofocus ? '' : undefined}
      data-clue={clue.id}
      aria-label={label}
      aria-pressed={pinned}
      onClick={onClick}
      tabIndex={nav ? 0 : -1}
    >
      <span className="clue-inner" ref={inner} style={{ ['--ct' as string]: `${ct}px`, ['--cb' as string]: `${cb}px` }}>
        <span className="clue-kind"><KindIcon kind={clue.kind} />{KIND_LABEL[clue.kind]}</span>
        {pinned && <span className="clue-pinned-tag" aria-hidden="true">Pinned{linkedCount ? ` +${linkedCount}` : ''}</span>}
        <span className="clue-title">{clue.title}</span>
        <span className="clue-text">{full ? clue.text : faceText(clue)}</span>
        {smudged && <span className="smudge" aria-hidden="true"><svg viewBox="0 0 200 120" preserveAspectRatio="none"><path d="M20 60 C10 20 60 10 90 25 C120 0 180 15 170 50 C200 70 180 110 140 100 C110 125 60 115 45 95 C10 100 0 80 20 60Z" /><circle cx="175" cy="20" r="7" /><circle cx="25" cy="105" r="5" /></svg><b>Smudged</b></span>}
      </span>
      <span className="clue-pin" aria-hidden="true">
        <svg viewBox="0 0 40 40"><defs><radialGradient id={`pin-${clue.id}`} cx="0.35" cy="0.3" r="0.7"><stop offset="0" stopColor="#ffe7a8" /><stop offset="0.5" stopColor="#d6a03c" /><stop offset="1" stopColor="#7a5115" /></radialGradient></defs><circle cx="20" cy="20" r="13" fill={`url(#pin-${clue.id})`} /><ellipse cx="15" cy="14" rx="4" ry="2.5" fill="#fff" opacity="0.6" /></svg>
      </span>
    </button>
  );
});
