// Theatre effects that can happen in any phase: the clock chimes the hour, lightning on thunder.
import { useEffect, useState } from 'react';
import { audio } from '../audio/audio';
import { onServerEvent, useTv } from '../net/store';

const HOURS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

export function StageFx() {
  const event = useTv((s) => s.event);
  const [chime, setChime] = useState<{ text: string; n: number } | null>(null);
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    if (event?.kind !== 'chime' || Date.now() - event.at > 3000) return;
    const m = event.text.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/);
    const n = Math.max(1, Math.min(12, event.count ?? (m ? (HOURS.indexOf(m[1]) || 12) : 1)));
    setChime({ text: event.text || `${HOURS[n % 12]} o'clock`, n });
    const timers = Array.from({ length: n }, (_, i) => window.setTimeout(() => audio.play('bell'), 400 + i * 1100));
    timers.push(window.setTimeout(() => setChime(null), 400 + n * 1100 + 1600));
    return () => timers.forEach(clearTimeout);
  }, [event?.at, event?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onServerEvent((m) => { if (m.t === 'sfx' && (m.name === 'thunder' || m.name === 'start')) setFlash(Date.now()); }), []);
  useEffect(() => { if (event?.kind === 'blackout') setFlash(Date.now()); }, [event?.at, event?.kind]);

  return (
    <>
      {flash > 0 && <div className="lightning" key={flash} aria-hidden="true" />}
      {chime && (
        <div className="chime" role="status" aria-label={chime.text}>
          <svg className="clock-face" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="92" className="cf-rim" />
            <circle cx="100" cy="100" r="80" className="cf-face" />
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i / 12) * Math.PI * 2;
              return <line key={i} x1={100 + Math.sin(a) * 66} y1={100 - Math.cos(a) * 66} x2={100 + Math.sin(a) * 74} y2={100 - Math.cos(a) * 74} className="cf-tick" />;
            })}
            <line x1="100" y1="100" x2={100 + Math.sin((chime.n % 12) / 12 * Math.PI * 2) * 44} y2={100 - Math.cos((chime.n % 12) / 12 * Math.PI * 2) * 44} className="cf-hour" />
            <line x1="100" y1="100" x2="100" y2="34" className="cf-min" />
            <circle cx="100" cy="100" r="6" className="cf-pin" />
          </svg>
          <p className="chime-text">{chime.text}</p>
          <p className="chime-bongs" aria-hidden="true">{Array.from({ length: chime.n }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</p>
        </div>
      )}
    </>
  );
}
