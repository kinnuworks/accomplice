import { useEffect, useRef } from 'react';
import { Portrait } from '../art/Portrait';
import { audio } from '../audio/audio';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { useTv } from '../net/store';

export function Accuse() {
  const room = useTv((s) => s.room)!;
  const c = room.case!;
  const { count, needed } = room.votes;
  const all = needed > 0 && count >= needed;
  const rolled = useRef(false);
  useEffect(() => {
    if (all && !rolled.current) { rolled.current = true; audio.play('drumroll'); }
  }, [all]);

  return (
    <main className={`screen accuse-screen ${all ? 'is-all-in' : ''}`}>
      <div className="beams" aria-hidden="true"><i /><i /><i /></div>
      <header className="accuse-head">
        <p className="eyebrow">The moment of truth</p>
        <h1 className="display-title huge">Who did it?</h1>
        <Flourish />
        <p className="accuse-sub">Vote in secret on your phone. Name the culprit, and how they did it.{c.tone === 'classic' ? ' If you think someone at this table helped them, say so.' : ''}</p>
      </header>

      <div className="accuse-lineup">
        {c.suspects.map((s, i) => (
          <figure key={s.id} className="accuse-suspect" style={{ ['--i' as string]: i }}>
            <Portrait suspect={s} />
            <figcaption><b>{s.name}</b><span>{s.role}</span></figcaption>
          </figure>
        ))}
      </div>

      <section className="votes" aria-live="polite" aria-label={`${count} of ${needed} votes in`}>
        <div className="envelopes" aria-hidden="true">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={`envelope ${i < count ? 'is-in' : ''}`}>
              <svg viewBox="0 0 64 44"><rect x="2" y="2" width="60" height="40" rx="3" /><path d="M2 4 L32 26 L62 4" fill="none" /><circle className="seal" cx="32" cy="26" r="8" /></svg>
            </span>
          ))}
        </div>
        <p className="votes-count">{all ? 'All votes are in. Hold your breath.' : <><b>{count}</b> of {needed} votes sealed</>}</p>
        <div className="vote-bar" aria-hidden="true"><i style={{ transform: `scaleX(${needed ? count / needed : 0})` }} /></div>
      </section>
      <Hints items={[['back', 'Menu']]} />
    </main>
  );
}
