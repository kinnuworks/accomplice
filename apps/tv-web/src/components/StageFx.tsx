// Theatre effects that can happen in any phase: the clock chimes the hour, lightning on thunder.
import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { onServerEvent, useTv } from '../net/store';
import type { TvEvent } from '../net/types';
import { useEventFlag } from './useEventFlag';

const HOURS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const bongsFor = (e: TvEvent) => {
  const m = e.text.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
  return Math.max(1, Math.min(12, e.count ?? (m ? (HOURS.indexOf(m[1]) || 12) : 1)));
};

export function StageFx() {
  const bongTimers = useRef<number[]>([]);
  const phase = useTv((s) => s.room?.phase);
  // the chime shows for its bongs plus a beat, and never longer than 10 s
  const [chimeMs, setChimeMs] = useState(6000);
  const chime = useEventFlag('chime', chimeMs, (e) => {
    const n = bongsFor(e);
    setChimeMs(Math.min(10000, 400 + Math.min(n, 6) * 1100 + 1400));
    bongTimers.current.forEach(clearTimeout);
    bongTimers.current = Array.from({ length: Math.min(n, 6) }, (_, i) => window.setTimeout(() => audio.play('bell'), 400 + i * 1100));
  });
  const blackout = useEventFlag('blackout', 1500);
  const [flash, setFlash] = useState(0);
  useEffect(() => onServerEvent((m) => { if (m.t === 'sfx' && (m.name === 'thunder' || m.name === 'start')) setFlash(Date.now()); }), []);
  useEffect(() => { if (blackout) setFlash(Date.now()); }, [blackout]);
  useEffect(() => () => bongTimers.current.forEach(clearTimeout), []);

  const n = chime ? bongsFor(chime) : 0;
  const text = chime?.text || (n ? `${HOURS[n % 12][0].toUpperCase()}${HOURS[n % 12].slice(1)} o'clock` : '');
  return (
    <>
      {flash > 0 && <div className="lightning" key={flash} aria-hidden="true" />}
      {chime && phase !== 'reveal' && phase !== 'results' && (
        <div className="chime" role="status" aria-label={text} key={chime.at}>
          <svg className="clock-face" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="92" className="cf-rim" />
            <circle cx="100" cy="100" r="80" className="cf-face" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <line key={i} x1={100 + Math.sin(a) * 66} y1={100 - Math.cos(a) * 66} x2={100 + Math.sin(a) * 74} y2={100 - Math.cos(a) * 74} className="cf-tick" />;
            })}
            <line x1="100" y1="100" x2={100 + Math.sin((n % 12) / 12 * Math.PI * 2) * 44} y2={100 - Math.cos((n % 12) / 12 * Math.PI * 2) * 44} className="cf-hour" />
            <line x1="100" y1="100" x2="100" y2="34" className="cf-min" />
            <circle cx="100" cy="100" r="6" className="cf-pin" />
          </svg>
          <p className="chime-text">{text}</p>
          <p className="chime-bongs" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</p>
        </div>
      )}
    </>
  );
}
