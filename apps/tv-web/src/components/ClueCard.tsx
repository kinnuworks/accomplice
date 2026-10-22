import { memo } from 'react';
import type { BoardClue } from '../net/types';
import { KindIcon } from './Ornament';

const KIND_LABEL = { physical: 'Physical', document: 'Document', testimony: 'Testimony' } as const;

export function hashTilt(id: string, range = 3): number {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1000) / 1000) * range * 2 - range;
}

interface Props {
  clue: BoardClue;
  pinned?: boolean;
  linkSource?: boolean;
  fresh?: boolean;
  nav?: boolean;
  autofocus?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  linkedCount?: number;
}

export const ClueCard = memo(function ClueCard({ clue, pinned, linkSource, fresh, nav, autofocus, onClick, style, className = '', linkedCount = 0 }: Props) {
  const label = `${clue.title}. ${clue.text}. ${pinned ? 'Pinned.' : 'Not pinned.'}${linkedCount ? ` Tied to ${linkedCount} other clue${linkedCount > 1 ? 's' : ''}.` : ''}`;
  return (
    <button
      className={`clue-card kind-${clue.kind} ${pinned ? 'is-pinned' : ''} ${linkSource ? 'is-source' : ''} ${fresh ? 'is-fresh' : ''} ${className}`}
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
      <span className="clue-inner">
        <span className="clue-kind"><KindIcon kind={clue.kind} />{KIND_LABEL[clue.kind]}</span>
        <span className="clue-round" aria-hidden="true">R{clue.round}</span>
        <span className="clue-title">{clue.title}</span>
        <span className="clue-text">{clue.text}</span>
        {pinned && <span className="clue-pinned-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3H7l3-3zM12 12v9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>Pinned{linkedCount ? ` · ${linkedCount} string${linkedCount > 1 ? 's' : ''}` : ''}</span>}
      </span>
      <span className="clue-pin" aria-hidden="true">
        <svg viewBox="0 0 40 40"><defs><radialGradient id={`pin-${clue.id}`} cx="0.35" cy="0.3" r="0.7"><stop offset="0" stopColor="#ffe7a8" /><stop offset="0.5" stopColor="#d6a03c" /><stop offset="1" stopColor="#7a5115" /></radialGradient></defs><circle cx="20" cy="20" r="13" fill={`url(#pin-${clue.id})`} /><ellipse cx="15" cy="14" rx="4" ry="2.5" fill="#fff" opacity="0.6" /></svg>
      </span>
    </button>
  );
});
