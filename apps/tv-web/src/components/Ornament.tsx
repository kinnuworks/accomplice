// Decorative brass flourishes.
export function Flourish({ className = '' }: { className?: string }) {
  return (
    <svg className={`flourish ${className}`} viewBox="0 0 400 24" aria-hidden="true">
      <path d="M0 12 H160 M240 12 H400" stroke="currentColor" strokeWidth="1.5" />
      <path d="M160 12 C175 2 185 2 200 12 C215 22 225 22 240 12 C225 2 215 2 200 12 C185 22 175 22 160 12Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="200" cy="12" r="3" fill="currentColor" />
      <circle cx="150" cy="12" r="2" fill="currentColor" /><circle cx="250" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function Emblem({ className = '' }: { className?: string }) {
  return (
    <svg className={`emblem ${className}`} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="60" cy="60" r="49" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 5" />
      <circle cx="60" cy="48" r="13" fill="currentColor" />
      <path d="M53 58 L67 58 L74 90 L46 90Z" fill="currentColor" />
    </svg>
  );
}

export function KindIcon({ kind }: { kind: 'physical' | 'document' | 'testimony' }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="kind-icon">
      {kind === 'physical' && <g {...s}><circle cx="10" cy="10" r="6" /><path d="M14.5 14.5L21 21" /></g>}
      {kind === 'document' && <g {...s}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></g>}
      {kind === 'testimony' && <g {...s}><path d="M4 5h16v11H10l-5 4v-4H4z" /><path d="M8 10h8" /></g>}
    </svg>
  );
}
