// Captions that light up word by word, in time with the voice (speech marks when available, else paced).
import { useEffect, useMemo, useRef, useState } from 'react';
import { lineElapsed } from '../audio/director';
import { reducedMotion } from '../env';
import type { Line } from '../net/types';

export function WordCaption({ line, durationMs, className = '' }: { line: Line; durationMs: number; className?: string }) {
  const words = useMemo(() => line.text.split(/\s+/).filter(Boolean), [line.text]);
  const times = useMemo(() => {
    if (line.marks && line.marks.length >= words.length * 0.8) {
      const t = line.marks.map((m) => m.time);
      while (t.length < words.length) t.push(t[t.length - 1] + 300);
      return t;
    }
    const w = words.map((x) => 150 + x.length * 52 + (/[.,!?]$/.test(x) ? 260 : 0));
    const total = w.reduce((a, b) => a + b, 0);
    const scale = (durationMs - 600) / total;
    let acc = 0;
    return w.map((x) => { const t = acc; acc += x * scale; return t; });
  }, [line.marks, words, durationMs]);
  const [idx, setIdx] = useState(reducedMotion() ? words.length : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setIdx(words.length); return; }
    const tick = () => {
      const e = lineElapsed();
      let i = 0;
      while (i < times.length && times[i] <= e) i++;
      setIdx((p) => (p === i ? p : i));
      if (i < words.length) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [times, words.length]);
  return (
    <p className={`wordcap ${className}`} aria-live="polite" aria-label={line.text}>
      {words.map((w, i) => (
        <span key={i} className={i < idx - 1 ? 'w said' : i === idx - 1 ? 'w now' : 'w'} aria-hidden="true">{w} </span>
      ))}
    </p>
  );
}
