// Calling cards: the same animal medallions the TV draws (ids match the server's).

const D = '#1a1020';
const C = '#f6ecd6';
export const SEAT_COLORS = ['#e2725b', '#5fb3a1', '#e8b64c', '#8f7ad8', '#d0679a', '#6ea8e0'];

export const AVATARS = [
  { id: 'fox', label: 'Fox' },
  { id: 'owl', label: 'Owl' },
  { id: 'cat', label: 'Cat' },
  { id: 'hare', label: 'Hare' },
  { id: 'badger', label: 'Badger' },
  { id: 'raven', label: 'Raven' },
];

export const avatarLabel = (id: string) => AVATARS.find((a) => a.id === id)?.label ?? (id === 'audience' ? 'Audience' : 'Guest');

function Animal({ kind }: { kind: string }) {
  switch (kind) {
    case 'fox': return <g><path d="M14 22 L22 6 L34 24 L50 24 L62 6 L70 22 L66 46 L42 74 L18 46Z" fill="currentColor" /><path d="M24 48 L42 74 L60 48 L50 54 L42 50 L34 54Z" fill={C} /><circle cx="32" cy="40" r="3.5" fill={D} /><circle cx="52" cy="40" r="3.5" fill={D} /><circle cx="42" cy="68" r="3.5" fill={D} /></g>;
    case 'owl': return <g><path d="M16 14 L28 22 L56 22 L68 14 L66 50 C64 68 52 76 42 76 C32 76 20 68 18 50Z" fill="currentColor" /><circle cx="31" cy="40" r="11" fill={C} /><circle cx="53" cy="40" r="11" fill={C} /><circle cx="31" cy="40" r="5" fill={D} /><circle cx="53" cy="40" r="5" fill={D} /><path d="M38 50 L42 60 L46 50Z" fill="#e8b64c" /></g>;
    case 'cat': return <g><path d="M16 12 L32 26 L52 26 L68 12 L66 52 C62 68 52 74 42 74 C32 74 22 68 18 52Z" fill="currentColor" /><path d="M28 42 C30 38 36 38 38 42 C36 44 30 44 28 42Z M46 42 C48 38 54 38 56 42 C54 44 48 44 46 42Z" fill={C} /><path d="M38 54 L46 54 L42 59Z" fill={D} /><path d="M14 52 L32 56 M14 60 L32 58 M70 52 L52 56 M70 60 L52 58" stroke={C} strokeWidth="1.6" /></g>;
    case 'hare': return <g><path d="M28 34 C22 18 22 4 28 2 C34 4 36 18 36 32Z M48 32 C48 18 50 4 56 2 C62 4 62 18 56 34Z" fill="currentColor" /><path d="M30 26 C27 16 27 8 29 6 C31 8 33 16 33 26Z M51 26 C51 16 53 8 55 6 C57 8 57 16 54 26Z" fill={C} opacity="0.7" /><ellipse cx="42" cy="52" rx="22" ry="22" fill="currentColor" /><circle cx="34" cy="48" r="3.5" fill={D} /><circle cx="50" cy="48" r="3.5" fill={D} /><path d="M38 58 L46 58 L42 62Z" fill={C} /></g>;
    case 'badger': return <g><ellipse cx="42" cy="44" rx="28" ry="30" fill="currentColor" /><path d="M36 16 C38 30 38 50 40 72 L44 72 C46 50 46 30 48 16 C44 14 40 14 36 16Z" fill={C} /><path d="M20 30 C26 40 30 48 32 58 L26 58 C20 50 16 40 20 30Z M64 30 C58 40 54 48 52 58 L58 58 C64 50 68 40 64 30Z" fill={D} /><circle cx="30" cy="44" r="3" fill={C} /><circle cx="54" cy="44" r="3" fill={C} /><ellipse cx="42" cy="70" rx="5" ry="3.5" fill={D} /></g>;
    case 'raven': return <g><path d="M18 46 C18 26 30 14 46 14 C60 14 68 24 68 36 L80 46 L66 52 C62 66 52 74 40 74 C28 74 18 62 18 46Z" fill="currentColor" /><circle cx="50" cy="34" r="5" fill={C} /><circle cx="51" cy="34" r="2.4" fill={D} /><path d="M66 40 L82 46 L66 50Z" fill={D} opacity="0.6" /></g>;
    default: return null;
  }
}

const isEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/**
 * A player's calling card as a picture, never as its id in words.
 * Pass `labelled` where the picture should be announced ("Calling card: Fox"),
 * leave it off where the name right next to it already says who it is.
 */
export function PlayerAvatar({
  avatar,
  seat = 0,
  name = '',
  size = 32,
  labelled = false,
}: {
  avatar: string;
  seat?: number;
  name?: string;
  size?: number;
  labelled?: boolean;
}) {
  const a = (avatar ?? '').toLowerCase();
  const known = AVATARS.some((x) => x.id === a);
  const color = SEAT_COLORS[((seat % 6) + 6) % 6];
  const a11y = labelled ? { role: 'img', 'aria-label': `Calling card: ${avatarLabel(a)}` } : { 'aria-hidden': true as const };
  return (
    <span className="pavatar" style={{ width: size, height: size, color }} {...a11y}>
      {known ? (
        <svg viewBox="0 0 84 84" width={size * 0.8} height={size * 0.8}>
          <Animal kind={a} />
        </svg>
      ) : (
        <span className="pavatar__face" style={{ fontSize: size * 0.5 }}>
          {a === 'audience' ? '👁' : isEmoji(avatar) ? avatar : (name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  );
}
