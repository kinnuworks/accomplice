// Text that types itself out, one character at a time (screen readers get the whole line at once).
import { useEffect, useState } from 'react';
import { reducedMotion } from '../env';

export function Typed({ text, cps = 22, delay = 0, className = '', as: Tag = 'p' }: { text: string; cps?: number; delay?: number; className?: string; as?: 'p' | 'h1' | 'h2' }) {
  const [n, setN] = useState(reducedMotion() ? text.length : 0);
  useEffect(() => {
    if (reducedMotion()) { setN(text.length); return; }
    setN(0);
    let i = 0, timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => { i++; setN(i); if (i >= text.length) clearInterval(timer); }, 1000 / cps);
    }, delay);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [text, cps, delay]);
  return (
    <Tag className={`typed ${className}`} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      <span className="typed-ghost" aria-hidden="true">{text.slice(n)}</span>
    </Tag>
  );
}
