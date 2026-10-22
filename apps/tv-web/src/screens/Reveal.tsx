import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../art/Avatar';
import { Portrait } from '../art/Portrait';
import { audio } from '../audio/audio';
import { ClueCard } from '../components/ClueCard';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { reducedMotion, STEP, STILL } from '../env';
import { useKeys } from '../focus/focus';
import { clueById, send, useTv } from '../net/store';

type Stage = { k: 'step'; i: number } | { k: 'culprit' } | { k: 'accomplice' } | { k: 'done' };

export function Reveal() {
  const room = useTv((s) => s.room)!;
  const c = room.case!;
  const rv = room.reveal;
  const steps = rv?.steps ?? [];
  const stages = useMemo<Stage[]>(() => [...steps.map((_, i) => ({ k: 'step' as const, i })), { k: 'culprit' }, { k: 'accomplice' }, { k: 'done' }], [steps]);
  const [at, setAt] = useState(() => {
    if (!STEP) return 0;
    if (STEP.startsWith('step-')) return Math.min(steps.length - 1, Number(STEP.slice(5)) || 0);
    const i = stages.findIndex((s) => s.k === STEP);
    return i < 0 ? 0 : i;
  });
  const stage = stages[Math.min(at, stages.length - 1)];

  useEffect(() => {
    if (STILL || stage.k === 'done') return;
    const ms = stage.k === 'step' ? 6000 : stage.k === 'culprit' ? 7500 : 6500;
    const t = setTimeout(() => setAt((a) => a + 1), reducedMotion() ? ms * 1.2 : ms);
    return () => clearTimeout(t);
  }, [at, stage.k]);
  useEffect(() => {
    if (stage.k === 'step') { audio.play('cardFlip'); setTimeout(() => audio.play('string'), 700); }
    if (stage.k === 'culprit') audio.play('reveal');
    if (stage.k === 'accomplice') audio.play(rv?.accomplice ? 'gavel' : 'bell');
  }, [at]);
  useKeys((k) => {
    if ((k === 'ok' || k === 'right') && stage.k !== 'done') { setAt((a) => Math.min(a + 1, stages.length - 1)); return true; }
    return false;
  });

  if (!rv) return <main className="screen reveal-screen"><p className="eyebrow center">The detective is gathering everyone in the parlour...</p></main>;

  const stepIndex = stage.k === 'step' ? stage.i : steps.length;
  const cleared = new Set(steps.slice(0, stage.k === 'step' ? stage.i + 1 : steps.length).flatMap((s) => s.eliminates ?? []));
  const nowClearing = new Set(stage.k === 'step' ? steps[stage.i].eliminates ?? [] : []);
  const culprit = c.suspects.find((s) => s.id === rv.culprit);
  const item = c.items.find((i) => i.id === rv.item);
  const accomplice = room.players.find((p) => p.id === rv.accomplice);
  const crimeRoom = c.rooms.find((r) => r.id === c.crime.room);
  const crimeSlot = c.slots.find((s) => s.id === c.crime.slot);
  const unmasked = stage.k !== 'step';

  return (
    <main className={`screen reveal-screen stage-${stage.k}`}>
      <header className="reveal-head">
        {(stage.k === 'step' || stage.k === 'culprit') && <p className="eyebrow">{stage.k === 'step' ? 'How it was done' : 'The truth'}</p>}
        {stage.k === 'step' && <p className="reveal-count">Step {stage.i + 1} of {steps.length}</p>}
      </header>

      {stage.k === 'step' && (() => {
        const st = steps[stage.i];
        const clue = clueById(room, st.clueId);
        return (
          <section className="chain" key={`st${stage.i}`}>
            <div className="chain-clue">
              {clue ? <ClueCard clue={clue} pinned className="is-highlight" /> : <div className="clue-card is-highlight"><span className="clue-inner"><span className="clue-text">{st.says}</span></span></div>}
            </div>
            <svg className="chain-string" viewBox="0 0 400 200" aria-hidden="true">
              <path d="M10 60 Q200 190 390 70" className="string-shadow" />
              <path d="M10 60 Q200 190 390 70" className="string-line draw" pathLength={1} />
            </svg>
            <div className="chain-note">
              <p className="note-says">{st.says}</p>
              <p className="note-therefore"><span className="therefore" aria-label="Therefore">∴</span>{st.therefore}</p>
              {!!st.eliminates?.length && (
                <p className="note-cleared">Cleared: {st.eliminates.map((id) => c.suspects.find((s) => s.id === id)?.name).join(', ')}</p>
              )}
            </div>
          </section>
        );
      })()}

      {stage.k === 'culprit' && culprit && (
        <section className="unmask" key="culprit">
          <div className="unmask-burst" aria-hidden="true" />
          <div className="unmask-portrait">
            <Portrait suspect={culprit} className="portrait-xl" />
            <div className="unmask-veil" aria-hidden="true"><span>?</span></div>
          </div>
          <div className="unmask-text">
            <p className="eyebrow">It was</p>
            <h1 className="display-title huge">{culprit.name}</h1>
            <Flourish />
            <p className="unmask-how">with <b>{item?.name ?? 'a steady hand'}</b>, in the <b>{crimeRoom?.name}</b>, at <b>{crimeSlot?.label}</b>.</p>
            <p className="hand unmask-quip">{culprit.motive}</p>
          </div>
        </section>
      )}

      {(stage.k === 'accomplice' || stage.k === 'done') && (
        <section className="accomplice" key="acc">
          <p className="eyebrow">{accomplice ? 'And they had help' : 'And their helper?'}</p>
          {accomplice ? (
            <>
              <div className="flip-card">
                <div className="flip-inner">
                  <div className="flip-front" aria-hidden="true">?</div>
                  <div className="flip-back"><Avatar player={accomplice} size={260} /></div>
                </div>
              </div>
              <h1 className="display-title huge">{accomplice.name} was the accomplice</h1>
              <p className="hand acc-quip">All those helpful questions. All that sweet, misleading nodding.</p>
            </>
          ) : (
            <>
              <h1 className="display-title huge">No accomplice tonight</h1>
              <p className="hand acc-quip">Everyone at this table told the truth. Which is, frankly, suspicious.</p>
            </>
          )}
          {stage.k === 'done' && (
            <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
              <span className="btn-ok" aria-hidden="true">OK</span> See the scores
            </button>
          )}
        </section>
      )}

      {(stage.k === 'step' || stage.k === 'culprit') && (
        <div className="reveal-lineup" aria-label="Suspects">
          {c.suspects.map((s) => {
            const isCulprit = unmasked && s.id === rv.culprit;
            const out = cleared.has(s.id) || (unmasked && s.id !== rv.culprit);
            return (
              <figure key={s.id} className={`rl-card ${out ? 'is-cleared' : ''} ${nowClearing.has(s.id) ? 'is-clearing' : ''} ${isCulprit ? 'is-culprit' : ''}`}>
                <Portrait suspect={s} />
                <figcaption>{s.name.split(' ').slice(-1)[0]}</figcaption>
                {out && <span className="cleared-stamp">Cleared</span>}
                {isCulprit && <span className="guilty-stamp">Guilty</span>}
              </figure>
            );
          })}
        </div>
      )}

      <div className="b-progress reveal-progress" aria-hidden="true">
        {stages.slice(0, -1).map((_, i) => <i key={i} className={i < at ? 'done' : i === at ? 'now' : ''} />)}
      </div>
      <Hints items={stage.k === 'done' ? [['ok', 'Scores']] : [['ok', 'Next'], ['back', 'Menu']]} />
      <span className="sr-only" aria-live="polite">{stage.k === 'step' ? `${steps[stepIndex]?.says} Therefore, ${steps[stepIndex]?.therefore}` : ''}</span>
    </main>
  );
}
