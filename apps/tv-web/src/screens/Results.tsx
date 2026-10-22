// Results as an awards show: three superlatives one at a time, then the ledger with rolling numbers.
import { useEffect, useMemo, useState } from 'react';
import type { Player } from '@accomplice/protocol';
import { Avatar } from '../art/Avatar';
import { Portrait } from '../art/Portrait';
import { audio } from '../audio/audio';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { reducedMotion, STEP, STILL } from '../env';
import { useKeys } from '../focus/focus';
import { send, useTv } from '../net/store';
import type { TvReveal } from '../net/types';

const TITLES = ['Sharpest eye in the house', 'A very close second', 'Solid sleuthing', 'Asked good questions', 'Enjoyed the snacks', 'Needs more tea'];

interface Award { key: string; title: string; player: Player; why: string }

function Rolling({ to, ms = 1200 }: { to: number; ms?: number }) {
  const [v, setV] = useState(reducedMotion() || STILL ? to : 0);
  useEffect(() => {
    if (reducedMotion() || STILL) { setV(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => { const p = Math.min(1, (performance.now() - t0) / ms); setV(Math.round(to * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{v.toLocaleString()}</>;
}

export function Results({ onTitle }: { onTitle: () => void }) {
  const room = useTv((s) => s.room)!;
  const rv = room.reveal as TvReveal | undefined;
  const scores = rv?.scores ?? {};
  const ranked = [...room.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const max = Math.max(1, ...ranked.map((p) => scores[p.id] ?? 0));
  const culprit = room.case?.suspects.find((s) => s.id === rv?.culprit);
  const hb = rv?.hunches?.byPlayer ?? {};
  const detectorId = Object.entries(hb).filter(([, v]) => v.total > 0).sort((a, b) => b[1].right / b[1].total - a[1].right / a[1].total || b[1].total - a[1].total)[0]?.[0];

  const awards = useMemo<Award[]>(() => {
    const out: Award[] = [];
    if (ranked[0]) out.push({ key: 'eye', title: 'Sharpest Eye', player: ranked[0], why: `${(scores[ranked[0].id] ?? 0).toLocaleString()} points. Nothing got past them.` });
    const acc = room.players.find((p) => p.id === rv?.accomplice);
    if (acc) out.push({ key: 'liar', title: 'Best Liar', player: acc, why: rv?.accompliceCaught ? 'Smooth. Not quite smooth enough.' : 'Fooled the whole room. Be afraid.' });
    const det = room.players.find((p) => p.id === detectorId);
    if (det) out.push({ key: 'detector', title: 'Lie Detector', player: det, why: `Called ${hb[det.id].right} of ${hb[det.id].total} answers right.` });
    else if (ranked.length > 2) out.push({ key: 'wild', title: 'Wildest Theory', player: ranked[ranked.length - 1], why: 'Bold. Wrong. Magnificent.' });
    return out;
  }, [room.players, rv, detectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [award, setAward] = useState(STEP === 'awards' ? 0 : STEP === 'ledger' || !awards.length ? awards.length : 0);
  const showingAwards = award < awards.length;
  useEffect(() => {
    if (!showingAwards) { audio.play('win'); return; }
    audio.play('drumroll');
    const s = setTimeout(() => audio.play('stamp'), 900);
    if (STILL) return () => clearTimeout(s);
    const t = setTimeout(() => setAward((a) => a + 1), 3600);
    return () => { clearTimeout(s); clearTimeout(t); };
  }, [award, showingAwards]);
  useKeys((k) => { if (showingAwards && (k === 'ok' || k === 'right')) { setAward((a) => a + 1); return true; } return false; });

  if (showingAwards) {
    const a = awards[award];
    return (
      <main className="screen results-screen awards-screen">
        <div className="iris" aria-hidden="true" />
        <p className="eyebrow">Tonight's honours · {award + 1} of {awards.length}</p>
        <section className="award" key={a.key} aria-live="polite">
          <h1 className="award-title">{a.title}</h1>
          <div className="award-avatar"><Avatar player={a.player} size={240} /></div>
          <p className="award-name">{a.player.name}</p>
          <p className="award-why">{a.why}</p>
        </section>
        <Hints items={[['ok', 'Next award'], ['back', 'Menu']]} />
      </main>
    );
  }

  return (
    <main className="screen results-screen">
      <header className="results-head">
        <p className="eyebrow">Case closed</p>
        <h1 className="display-title">The detectives' ledger</h1>
        <Flourish />
      </header>

      <section className="ledger" aria-label="Scores">
        {ranked.map((p, i) => {
          const sc = scores[p.id] ?? 0;
          const isAcc = rv?.accomplice === p.id;
          return (
            <div className={`ledger-row rank-${i + 1}`} key={p.id} style={{ ['--i' as string]: ranked.length - 1 - i }}>
              <span className="ledger-rank" aria-label={`Rank ${i + 1}`}>{i === 0 ? <svg className="crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill="currentColor" /></svg> : i + 1}</span>
              <Avatar player={p} size={80} />
              <div className="ledger-who">
                <b>{p.name}</b>
                <span>{isAcc ? 'Smooth, but caught' : TITLES[Math.min(i, TITLES.length - 1)]}</span>
              </div>
              {isAcc && <span className="tag tag-acc">Accomplice</span>}
              {p.id === detectorId && <span className="tag tag-hunch">Lie detector</span>}
              <div className="ledger-bar" aria-hidden="true"><i style={{ transform: `scaleX(${sc / max})` }} /></div>
              <span className="ledger-score"><Rolling to={sc} /></span>
            </div>
          );
        })}
      </section>

      {culprit && (
        <aside className="results-culprit">
          <Portrait suspect={culprit} />
          <p><span className="eyebrow">Behind bars</span><b>{culprit.shortName ?? culprit.name}</b></p>
        </aside>
      )}
      {rv?.hunches && rv.hunches.total > 0 && (
        <p className="results-hunch">The room called <b>{rv.hunches.right} of {rv.hunches.total}</b> lies right.</p>
      )}

      <div className="results-actions">
        <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
          <span className="btn-ok" aria-hidden="true">OK</span> Play again
        </button>
        <button className="btn btn-ghost" data-nav onClick={onTitle}>Back to the title</button>
      </div>
      <Hints items={[['arrows', 'Move'], ['ok', 'Choose']]} />
    </main>
  );
}
