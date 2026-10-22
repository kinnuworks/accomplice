// Captions in time with the voice, following the Xbox caption rules: at most 40 characters a line and two
// lines on screen. The chunk advances with the word marks; the current word is marked, nothing is dimmed.
import { useEffect, useMemo, useRef, useState } from 'react';
import { lineElapsed } from '../audio/director';
import type { Line } from '../net/types';

interface Props { line: Line; durationMs: number; className?: string; lineChars?: number; live?: boolean }

export function WordCaption({ line, durationMs, className = '', lineChars = 40, live = true }: Props) {
  // server chunks (one caption screen each) win over our own wrapping
  const serverLines = useMemo(() => line.chunks?.length ? line.chunks.map((ch) => ch.split('\n').map((l) => l.split(/\s+/).filter(Boolean))) : null, [line.chunks]);
  const words = useMemo(() => serverLines ? serverLines.flat(2) : line.text.split(/\s+/).filter(Boolean), [serverLines, line.text]);
  const hasMarks = !!line.marks && line.marks.length >= words.length * 0.8;
  const times = useMemo(() => {
    if (line.marks && line.marks.length >= words.length * 0.8) {
      const t = line.marks.map((m) => m.time);
      while (t.length < words.length) t.push(t[t.length - 1] + 300);
      return t;
    }
    const w = words.map((x) => 150 + x.length * 52 + (/[.,!?]$/.test(x) ? 260 : 0));
    const total = w.reduce((a, b) => a + b, 0);
    const scale = Math.max(0.3, (durationMs - 600) / total);
    let acc = 0;
    return w.map((x) => { const t = acc; acc += x * scale; return t; });
  }, [line.marks, words, durationMs]);

  // break into lines of <= lineChars, then pair lines into two-line chunks (new sentence prefers a new chunk)
  const chunks = useMemo(() => {
    if (serverLines) {
      let n = 0;
      return serverLines.map((ch) => ch.map((ln) => ln.map(() => n++)));
    }
    const lines: number[][] = [];
    let cur: number[] = [], len = 0;
    words.forEach((w, i) => {
      if (cur.length && len + 1 + w.length > lineChars) { lines.push(cur); cur = []; len = 0; }
      cur.push(i); len += (len ? 1 : 0) + w.length;
    });
    if (cur.length) lines.push(cur);
    const out: number[][][] = [];
    for (let i = 0; i < lines.length; i += 2) out.push(lines.slice(i, i + 2));
    return out;
  }, [words, lineChars, serverLines]);

  const [idx, setIdx] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    // not being voiced right now: page through the chunks on our own clock, no word marker
    const t0 = performance.now();
    const clock = live ? lineElapsed : () => performance.now() - t0;
    const tick = () => {
      const e = clock();
      let i = 0;
      while (i < times.length && times[i] <= e) i++;
      setIdx((p) => (p === i ? p : i));
      if (i < words.length) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [times, words.length, live]);

  const current = idx - 1;
  let chunk = 0;
  chunks.forEach((ch, k) => { if (current >= ch[0][0]) chunk = k; });
  const show = chunks[chunk] ?? [];

  return (
    <p className={`wordcap ${className}`} aria-label={line.text}>
      {show.map((ln, li) => (
        <span className="cap-line" key={`${chunk}-${li}`} aria-hidden="true">
          {ln.map((i) => <span key={i} className={live && hasMarks && i === current ? 'w now' : i < current ? 'w said' : 'w'}>{words[i]}{' '}</span>)}
        </span>
      ))}
    </p>
  );
}
