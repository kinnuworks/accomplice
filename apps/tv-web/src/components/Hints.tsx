// Remote control legend, bottom right. Icons plus words, never colour alone.
export type HintKey = 'ok' | 'back' | 'arrows' | 'play';

function Key({ k }: { k: HintKey }) {
  switch (k) {
    case 'ok': return <span className="key key-ok" aria-hidden="true">OK</span>;
    case 'back': return <span className="key" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 6L4 12l6 6M4 12h11a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
    case 'arrows': return <span className="key" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l3 3H9zM12 21l-3-3h6zM3 12l3-3v6zM21 12l-3 3V9z" fill="currentColor" /></svg></span>;
    case 'play': return <span className="key" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5l8 7-8 7zM14 5h2.5v14H14zM18.5 5H21v14h-2.5z" fill="currentColor" /></svg></span>;
  }
}

export function Hints({ items }: { items: [HintKey, string][] }) {
  return (
    <div className="hints">
      {items.map(([k, label]) => (
        <span className="hint" key={label}><Key k={k} />{label}</span>
      ))}
    </div>
  );
}
