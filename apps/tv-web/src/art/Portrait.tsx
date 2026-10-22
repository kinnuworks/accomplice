// Suspect portraits. Painted art loads from public/art/<suspect.portrait>; until it exists
// we draw a silhouette with a distinct colour and props per character archetype.
import { memo, useEffect, useState } from 'react';
import { asset } from '../env';

export type Archetype = 'cook' | 'gardener' | 'butler' | 'heiress' | 'doctor' | 'colonel' | 'artist' | 'journalist' | 'magician' | 'nephew';
const ARCHETYPES: Archetype[] = ['cook', 'gardener', 'butler', 'heiress', 'doctor', 'colonel', 'artist', 'journalist', 'magician', 'nephew'];

export const ARCH_COLOR: Record<Archetype, string> = {
  cook: '#c8743f', gardener: '#7d9b45', butler: '#5b7fa6', heiress: '#c2577f', doctor: '#3fa093',
  colonel: '#a8463a', artist: '#d1a238', journalist: '#7d6bb5', magician: '#8a4fc0', nephew: '#4f8fd6',
};

const KEYWORDS: [RegExp, Archetype][] = [
  [/cook|chef|baker|housekeeper|maid/i, 'cook'], [/garden|groundskeeper/i, 'gardener'], [/butler|valet|steward|porter|conductor/i, 'butler'],
  [/heiress|lady|duchess|countess|widow|singer|diva/i, 'heiress'], [/doctor|nurse|physician|surgeon/i, 'doctor'],
  [/colonel|captain|major|general|admiral|sailor|soldier/i, 'colonel'], [/artist|painter|sculptor|poet/i, 'artist'],
  [/journalist|reporter|writer|novelist|columnist/i, 'journalist'], [/magician|conjurer|illusionist|medium/i, 'magician'],
  [/nephew|niece|son|heir|student/i, 'nephew'],
];

function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

export function archetypeOf(s: { id: string; role?: string; portrait?: string }): Archetype {
  const base = (s.portrait ?? '').split('/').pop()?.replace(/\.\w+$/, '') ?? '';
  if ((ARCHETYPES as string[]).includes(base)) return base as Archetype;
  for (const [re, a] of KEYWORDS) if (re.test(`${base} ${s.role ?? ''}`)) return a;
  return ARCHETYPES[hash(s.id) % ARCHETYPES.length];
}
export function suspectColor(s: { id: string; role?: string; portrait?: string }): string { return ARCH_COLOR[archetypeOf(s)]; }

export function portraitUrl(p: string | undefined): string | null {
  if (!p) return null;
  const path = p.includes('/') ? p : `portraits/${p}`;
  return asset(`art/${/\.\w+$/.test(path) ? path : `${path}.webp`}`);
}

const failed = new Set<string>();
const loaded = new Set<string>();
/** Warm the cache so portraits never pop in mid scene. */
export function preloadPortraits(list: { portrait?: string }[]): void {
  for (const s of list) {
    const u = portraitUrl(s.portrait);
    if (!u || failed.has(u) || loaded.has(u)) continue;
    const img = new Image();
    img.onload = () => loaded.add(u);
    img.onerror = () => failed.add(u);
    img.src = u;
  }
}

interface Props { suspect: { id: string; name?: string; role?: string; portrait?: string }; className?: string }

export const Portrait = memo(function Portrait({ suspect, className }: Props) {
  const url = portraitUrl(suspect.portrait);
  const [bad, setBad] = useState(() => !url || failed.has(url));
  useEffect(() => { setBad(!url || failed.has(url)); }, [url]);
  const arch = archetypeOf(suspect);
  return (
    <div className={`portrait arch-${arch} ${className ?? ''}`} style={{ ['--sc' as string]: ARCH_COLOR[arch] }}>
      <Silhouette arch={arch} uid={suspect.id} />
      {!bad && url && (
        <img src={url} alt="" draggable={false} onError={() => { failed.add(url); setBad(true); }} onLoad={() => loaded.add(url)} />
      )}
    </div>
  );
});

const INK = '#120a18';

export function Silhouette({ arch, uid }: { arch: Archetype; uid: string }) {
  const c = ARCH_COLOR[arch];
  const g = `g-${uid}`;
  return (
    <svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`${g}-bg`} cx="50%" cy="34%" r="75%">
          <stop offset="0" stopColor={c} stopOpacity="0.95" />
          <stop offset="0.55" stopColor={c} stopOpacity="0.35" />
          <stop offset="1" stopColor="#0c0710" />
        </radialGradient>
        <linearGradient id={`${g}-fig`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#2a1c33" />
          <stop offset="0.6" stopColor={INK} />
        </linearGradient>
        <pattern id={`${g}-wall`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M12 2 L16 12 L12 22 L8 12Z" fill="#fff" opacity="0.05" />
        </pattern>
      </defs>
      <rect width="200" height="240" fill={`url(#${g}-bg)`} />
      <rect width="200" height="240" fill={`url(#${g}-wall)`} />
      <g fill={`url(#${g}-fig)`} stroke={c} strokeOpacity="0.55" strokeWidth="1.5">
        <Body arch={arch} />
      </g>
      <Props arch={arch} c={c} />
    </svg>
  );
}

function Body({ arch }: { arch: Archetype }) {
  const shoulders = arch === 'colonel'
    ? 'M10 240 C12 192 50 170 100 166 C150 170 188 192 190 240Z'
    : arch === 'heiress'
      ? 'M30 240 C36 196 64 180 100 178 C136 180 164 196 170 240Z'
      : 'M18 240 C22 192 56 172 100 168 C144 172 178 192 182 240Z';
  return (
    <>
      <path d={shoulders} />
      <path d={arch === 'heiress' ? 'M88 132 L112 132 L114 182 L86 182Z' : 'M85 136 L115 136 L117 172 L83 172Z'} />
      <ellipse cx="100" cy="110" rx={arch === 'heiress' ? 30 : 33} ry="40" />
    </>
  );
}

function Props({ arch, c }: { arch: Archetype; c: string }) {
  const gold = '#f0c66b';
  const cream = '#efe4cc';
  switch (arch) {
    case 'cook':
      return (
        <g>
          <path d="M70 84 C58 60 72 38 88 46 C92 26 116 26 118 46 C134 36 146 62 130 84Z" fill={cream} />
          <rect x="70" y="78" width="60" height="14" rx="3" fill="#d8cbb0" />
          <path d="M76 176 L100 196 L124 176 L118 172 L100 186 L82 172Z" fill={c} />
        </g>
      );
    case 'gardener':
      return (
        <g>
          <ellipse cx="100" cy="80" rx="70" ry="13" fill="#3a2a17" stroke={gold} strokeOpacity="0.5" />
          <path d="M70 80 C72 52 128 52 130 80Z" fill="#4a3620" />
          <rect x="70" y="70" width="60" height="8" fill={c} />
          <path d="M150 240 L162 160 L168 162 L160 240Z" fill="#6b5a3a" />
          <path d="M156 160 C150 140 176 136 172 160Z" fill={c} />
        </g>
      );
    case 'butler':
      return (
        <g>
          <path d="M67 100 C64 66 136 66 133 100 C128 82 74 82 67 100Z" fill="#1b1222" />
          <path d="M82 170 L100 228 L118 170Z" fill={cream} />
          <path d="M88 178 L100 186 L112 178 L112 192 L100 186 L88 192Z" fill={INK} />
          <path d="M82 170 L64 240 M118 170 L136 240" stroke={c} strokeWidth="3" />
          <circle cx="100" cy="206" r="2.5" fill={gold} />
        </g>
      );
    case 'heiress':
      return (
        <g>
          <path d="M68 108 C60 60 90 44 104 50 C130 50 140 80 132 108 C126 84 80 82 68 108Z" fill="#1b1222" />
          <circle cx="104" cy="56" r="16" fill="#1b1222" />
          <path d="M84 72 L90 60 L96 70 L102 56 L108 70 L114 60 L120 72Z" fill={gold} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <circle key={i} cx={74 + i * 6.5} cy={188 + Math.sin((i / 8) * Math.PI) * 12} r="3.4" fill={cream} />
          ))}
          <path d="M60 240 C70 214 130 214 140 240" fill="none" stroke={c} strokeWidth="4" />
        </g>
      );
    case 'doctor':
      return (
        <g>
          <circle cx="86" cy="108" r="11" fill="none" stroke={gold} strokeWidth="3" />
          <circle cx="114" cy="108" r="11" fill="none" stroke={gold} strokeWidth="3" />
          <path d="M97 108 L103 108" stroke={gold} strokeWidth="3" />
          <circle cx="100" cy="78" r="9" fill={cream} opacity="0.85" />
          <path d="M80 172 C70 206 92 220 104 206" fill="none" stroke={c} strokeWidth="4" />
          <circle cx="106" cy="204" r="6" fill={gold} />
          <path d="M60 240 L84 170 M140 240 L116 170" stroke={cream} strokeWidth="4" opacity="0.7" />
        </g>
      );
    case 'colonel':
      return (
        <g>
          <path d="M64 84 C66 58 134 58 136 84Z" fill="#2a1d14" />
          <path d="M60 84 L140 84 L150 94 L58 94Z" fill="#1b1222" />
          <rect x="64" y="76" width="72" height="7" fill={c} />
          <circle cx="100" cy="70" r="5" fill={gold} />
          <path d="M76 128 C86 120 96 126 100 124 C104 126 114 120 124 128 C114 134 106 130 100 132 C94 130 86 134 76 128Z" fill="#d8cbb0" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={24 + i * 7} y="182" width="4" height="16" fill={gold} />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`r${i}`} x={144 + i * 7} y="182" width="4" height="16" fill={gold} />)}
          <circle cx="76" cy="206" r="6" fill={gold} /><circle cx="90" cy="208" r="6" fill={c} />
        </g>
      );
    case 'artist':
      return (
        <g>
          <path d="M60 86 C58 62 132 54 146 76 C138 90 76 94 60 86Z" fill={c} />
          <circle cx="104" cy="64" r="4" fill={c} />
          <path d="M70 168 C90 186 110 186 130 168 L136 184 C112 204 88 204 64 184Z" fill={c} opacity="0.9" />
          <path d="M84 186 L76 238" stroke={c} strokeWidth="10" />
          <path d="M134 94 L160 60" stroke="#8a6a3a" strokeWidth="4" /><path d="M158 62 L166 50" stroke={cream} strokeWidth="5" />
        </g>
      );
    case 'journalist':
      return (
        <g>
          <path d="M66 86 C66 58 134 58 134 86Z" fill="#241a2c" />
          <ellipse cx="100" cy="86" rx="58" ry="9" fill="#1b1222" />
          <rect x="68" y="76" width="64" height="7" fill={c} />
          <rect x="118" y="64" width="18" height="12" fill={cream} transform="rotate(-12 127 70)" />
          <rect x="132" y="194" width="34" height="44" rx="2" fill={cream} />
          <path d="M138 206 H160 M138 214 H160 M138 222 H154" stroke="#7a6a5a" strokeWidth="2" />
          <path d="M72 116 L60 92" stroke="#c9a46a" strokeWidth="3" />
        </g>
      );
    case 'magician':
      return (
        <g>
          <rect x="72" y="18" width="56" height="62" fill="#160d1c" stroke={c} strokeOpacity="0.6" />
          <rect x="72" y="64" width="56" height="9" fill={c} />
          <ellipse cx="100" cy="80" rx="46" ry="8" fill="#160d1c" />
          <path d="M30 240 L52 150 L84 168 L100 200 L116 168 L148 150 L170 240Z" fill="#1b1222" stroke={c} strokeWidth="2" />
          <path d="M156 42 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z" fill={gold} />
          <path d="M40 70 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill={gold} opacity="0.7" />
        </g>
      );
    case 'nephew':
      return (
        <g>
          <path d="M66 96 C58 60 92 52 104 60 C116 50 146 62 134 96 C128 76 116 74 106 80 C96 72 76 76 66 96Z" fill="#1b1222" />
          <path d="M100 58 C108 44 124 44 128 54" fill="none" stroke="#1b1222" strokeWidth="6" />
          <circle cx="114" cy="108" r="9" fill="none" stroke={gold} strokeWidth="2.5" />
          <path d="M122 112 L130 140" stroke={gold} strokeWidth="1.5" />
          <path d="M86 170 C94 180 106 180 114 170 L108 196 L100 186 L92 196Z" fill={c} />
        </g>
      );
  }
}
