// Player tokens: a brass medallion with an animal, a seat colour and a seat shape,
// so players never have to tell each other apart by colour alone.
import type { Player } from '@accomplice/protocol';

export const SEAT_COLORS = ['#e2725b', '#5fb3a1', '#e8b64c', '#8f7ad8', '#d0679a', '#6ea8e0'];
const SHAPES = ['circle', 'diamond', 'star', 'moon', 'key', 'heart'] as const;

function Shape({ i }: { i: number }) {
  switch (SHAPES[i % 6]) {
    case 'circle': return <circle cx="12" cy="12" r="7" />;
    case 'diamond': return <path d="M12 3 L20 12 L12 21 L4 12Z" />;
    case 'star': return <path d="M12 2 l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" />;
    case 'moon': return <path d="M15 3 A9 9 0 1 0 21 15 A7 7 0 1 1 15 3Z" />;
    case 'key': return <path d="M8 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm4.5 4H22v3h-2v3h-3v-3h-4.5z" />;
    case 'heart': return <path d="M12 21 C4 14 2 10 2 7.5 A4.5 4.5 0 0 1 12 5 A4.5 4.5 0 0 1 22 7.5 C22 10 20 14 12 21Z" />;
  }
}

const D = '#1a1020';
const C = '#f6ecd6';
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
const ANIMALS = ['fox', 'owl', 'cat', 'hare', 'badger', 'raven'];
const isEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

export function Avatar({ player, size = 96, className = '' }: { player: Pick<Player, 'name' | 'seat' | 'avatar'> & { connected?: boolean }; size?: number; className?: string }) {
  const color = SEAT_COLORS[player.seat % 6];
  const a = (player.avatar ?? '').toLowerCase();
  const animal = ANIMALS.includes(a) ? a : null;
  const emoji = !animal && player.avatar && isEmoji(player.avatar) ? player.avatar : null;
  return (
    <div className={`avatar ${player.connected === false ? 'is-away' : ''} ${className}`} style={{ width: size, height: size, ['--pc' as string]: color }} aria-hidden="true">
      {animal ? (
        <svg className="avatar-animal" viewBox="0 0 84 84"><Animal kind={animal} /></svg>
      ) : (
        <span className="avatar-face" style={{ fontSize: size * (emoji ? 0.5 : 0.44) }}>{emoji ?? (player.name.trim()[0] ?? '?').toUpperCase()}</span>
      )}
      <svg className="avatar-badge" viewBox="0 0 24 24"><Shape i={player.seat} /></svg>
    </div>
  );
}
