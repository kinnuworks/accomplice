// The reveal, as a show: the proof chain, any sabotage, the culprit unmasked, their confession, the accomplice,
// then tomorrow's front page. OK moves on at every beat.
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../art/Avatar';
import { FakeQr } from '../art/FakeQr';
import { Portrait } from '../art/Portrait';
import { audio } from '../audio/audio';
import { CaptionPanel } from '../components/Captions';
import { ClueCard } from '../components/ClueCard';
import { Hints } from '../components/Hints';
import { Typed } from '../components/Typed';
import { DEMO, reducedMotion, STEP, STILL } from '../env';
import { useKeys } from '../focus/focus';
import { clueById, lineQueue, send, useTv } from '../net/store';
import { shortName, type Newspaper, type TvCase, type TvReveal } from '../net/types';

type Stage = { k: 'step'; i: number } | { k: 'sabotage' } | { k: 'culprit' } | { k: 'confession' } | { k: 'accomplice' } | { k: 'newspaper' };
const DUR: Record<Stage['k'], number> = { step: 5600, sabotage: 6000, culprit: 9000, confession: 9000, accomplice: 9500, newspaper: 0 };

function defaultPaper(c: TvCase, culpritName: string): Newspaper {
  const town = c.place.split(',')[0].replace(/^(The)\s+/i, '');
  return {
    paperName: `The ${town} Evening Post`,
    headline: c.tone === 'cozy' ? `${culpritName} Caught With Cake` : `${culpritName} Unmasked`,
    sub: `${c.victim.name} ${c.crime.what}. Amateur detectives crack the case in a single evening.`,
    date: c.dateLine,
    price: 'One penny',
  };
}

export function Reveal() {
  const room = useTv((s) => s.room)!;
  const now = useTv((s) => s.now);
  const c = room.case as TvCase;
  const rv = room.reveal as TvReveal | undefined;
  const steps = rv?.steps ?? [];
  const hasSabotage = !!rv?.sabotage?.length;
  const stages = useMemo<Stage[]>(() => [
    ...steps.map((_, i) => ({ k: 'step' as const, i })),
    ...(hasSabotage ? [{ k: 'sabotage' as const }] : []),
    { k: 'culprit' }, { k: 'confession' }, { k: 'accomplice' }, { k: 'newspaper' },
  ], [steps, hasSabotage]);
  const [at, setAt] = useState(() => {
    if (!STEP) return 0;
    if (STEP.startsWith('step-')) return Math.min(steps.length - 1, Number(STEP.slice(5)) || 0);
    const i = stages.findIndex((s) => s.k === STEP);
    return i < 0 ? 0 : i;
  });
  const stage = stages[Math.min(at, stages.length - 1)];
  const next = () => setAt((a) => Math.min(a + 1, stages.length - 1));

  const confessing = !!now?.line.utteranceId?.startsWith('confession:');
  useEffect(() => {
    if (STILL || stage.k === 'newspaper') return;
    if (stage.k === 'confession' && confessing) return; // wait for the culprit to finish
    const t = setTimeout(next, reducedMotion() ? DUR[stage.k] * 1.2 : DUR[stage.k]);
    return () => clearTimeout(t);
  }, [at, stage.k, confessing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    switch (stage.k) {
      case 'step': audio.play('cardFlip'); later(600, () => audio.play('string')); break;
      case 'sabotage': audio.play('smudge'); break;
      case 'culprit':
        // drumroll, then 1.5 s of stillness and silence before the name
        audio.silence(true); audio.play('drumroll');
        later(1500, () => audio.play('reveal')); later(2300, () => audio.play('stamp')); later(3400, () => audio.silence(false));
        break;
      case 'confession':
        if (DEMO && !STILL && culprit) {
          ['Fine. Yes. It was me.', culprit.motive, 'And I would have got away with it, if it were not for this lot and their pins.'].forEach((t, i) =>
            lineQueue.push({ key: `confession:${i}`, utteranceId: `confession:${i}`, speaker: culprit.id, speakerName: culprit.name, text: t, narrator: false }));
        }
        break;
      case 'accomplice':
        audio.silence(true); audio.play('blackout');
        later(900, () => audio.play('drumroll'));
        later(3600, () => audio.play(rv?.accomplice ? 'stamp' : 'bell')); later(4200, () => audio.silence(false));
        break;
      case 'newspaper': audio.play('whoosh'); later(1400, () => audio.play('stamp')); break;
    }
    return () => { timers.forEach(clearTimeout); audio.silence(false); };
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeys((k) => {
    if ((k === 'ok' || k === 'right') && stage.k !== 'newspaper') { next(); return true; }
    return false;
  });

  const culprit = c.suspects.find((s) => s.id === rv?.culprit);
  if (!rv) return <main className="screen reveal-screen"><p className="eyebrow center">The detectives gather in the parlour...</p></main>;

  const cleared = new Set(steps.slice(0, stage.k === 'step' ? stage.i + 1 : steps.length).flatMap((s) => s.eliminates ?? []));
  const nowClearing = new Set(stage.k === 'step' ? steps[stage.i].eliminates ?? [] : []);
  const item = c.items.find((i) => i.id === rv.item);
  const accomplice = room.players.find((p) => p.id === rv.accomplice);
  const crimeRoom = c.rooms.find((r) => r.id === c.crime.room);
  const crimeSlot = c.slots.find((s) => s.id === c.crime.slot);
  const caught = !!rv.accompliceCaught;
  const paper = rv.newspaper ?? defaultPaper(c, culprit ? shortName(culprit) : 'Culprit');
  const frontPageUrl = `${location.origin}/api/rooms/${room.code}/front-page.png`;

  return (
    <main className={`screen reveal-screen stage-${stage.k}`}>
      {stage.k === 'step' && (() => {
        const st = steps[stage.i];
        const clue = clueById(room, st.clueId);
        return (
          <>
            <header className="reveal-head"><p className="eyebrow">How it was done</p><p className="reveal-count">Step {stage.i + 1} of {steps.length}</p></header>
            <section className="chain" key={`st${stage.i}`}>
              <div className="chain-clue">
                {clue ? <ClueCard clue={clue} pinned full className="is-highlight" /> : <div className="clue-card is-highlight"><span className="clue-inner"><span className="clue-text">{st.says}</span></span></div>}
              </div>
              <svg className="chain-string" viewBox="0 0 400 200" aria-hidden="true">
                <path d="M10 60 Q200 190 390 70" className="string-shadow" />
                <path d="M10 60 Q200 190 390 70" className="string-line draw" pathLength={1} />
              </svg>
              <div className="chain-note">
                <p className="note-says">{st.says}</p>
                <p className="note-therefore"><span className="therefore" aria-label="Therefore">∴</span>{st.therefore}</p>
                {!!st.eliminates?.length && <p className="note-cleared">Cleared: {st.eliminates.map((id) => { const s = c.suspects.find((x) => x.id === id); return s ? shortName(s) : id; }).join(', ')}</p>}
              </div>
            </section>
          </>
        );
      })()}

      {stage.k === 'sabotage' && rv.sabotage && (
        <section className="sabotage" key="sab">
          <p className="eyebrow">Meanwhile, under the table</p>
          <h1 className="display-title">Someone tampered with the evidence</h1>
          <div className="sabotage-list">
            {rv.sabotage.map((sb) => {
              const clue = clueById(room, sb.clueId);
              return (
                <div className="sabotage-item" key={`${sb.clueId}${sb.at}`}>
                  {clue && <ClueCard clue={clue} smudged />}
                  <p><b>{sb.byName}</b> smudged <b>{sb.clueTitle}</b> in round {sb.round}.</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {stage.k === 'culprit' && culprit && (
        <section className="unmask" key="culprit">
          <div className="iris" aria-hidden="true" />
          <div className="unmask-portrait">
            <Portrait suspect={culprit} className="portrait-xl" />
            <span className="guilty-big" aria-hidden="true">Guilty</span>
          </div>
          <div className="unmask-text">
            <p className="eyebrow unmask-kicker">It was</p>
            <h1 className="display-title huge unmask-name">{culprit.name}</h1>
            <p className="unmask-how">with the <b>{(item?.name ?? 'a steady hand').replace(/^the\s+/i, '')}</b>, in the <b>{crimeRoom?.name}</b>, at <b>{crimeSlot?.label}</b>.</p>
            <Typed className="unmask-quip" text={culprit.motive} cps={33} delay={2800} />
          </div>
        </section>
      )}

      {stage.k === 'confession' && culprit && (
        <section className="confession" key="conf">
          <div className="conf-portrait"><Portrait suspect={culprit} className="portrait-xl" /></div>
          <div className="conf-side">
            <p className="eyebrow">The confession</p>
            {confessing && now ? (
              <CaptionPanel key={now.line.key} line={now.line} durationMs={now.durationMs} speaker={shortName(culprit)} className="conf-caption" />
            ) : (
              <blockquote className="conf-quote">“{culprit.motive}”</blockquote>
            )}
          </div>
        </section>
      )}

      {stage.k === 'accomplice' && (
        <section className={`accomplice ${accomplice ? '' : 'is-none'}`} key="acc">
          <div className="blackout" aria-hidden="true" />
          {accomplice ? (
            <>
              <div className="acc-avatar">
                <Avatar player={accomplice} size={280} />
                <span className={`acc-stamp ${caught ? 'is-caught' : 'is-away'}`}>{caught ? 'Caught' : 'Got away'}</span>
              </div>
              <Typed as="h1" className="display-title acc-line" text={`${accomplice.name} was the Accomplice.`} cps={22} delay={1700} />
              <blockquote className="acc-quote">“{rv.accompliceLine ?? 'I was only trying to help.'}”</blockquote>
            </>
          ) : (
            <>
              <Typed as="h1" className="display-title acc-line" text="Nobody was the Accomplice." cps={22} delay={1700} />
              <p className="acc-quote">Everyone at this table told the truth. Which is, frankly, suspicious.</p>
            </>
          )}
        </section>
      )}

      {stage.k === 'newspaper' && (
        <section className="paper-stage" key="paper">
          <article className="newspaper" aria-label={`${paper.paperName}: ${paper.headline}`}>
            <header className="np-mast">
              <span className="np-meta">{paper.date ?? c.dateLine}</span>
              <h2 className="np-name">{paper.paperName}</h2>
              <span className="np-meta">{paper.price ?? 'Extra! Extra!'}</span>
            </header>
            <h1 className="np-headline">{paper.headline}</h1>
            <div className="np-body">
              {culprit && <figure className="np-photo"><Portrait suspect={culprit} /><figcaption>{culprit.name}, {culprit.role}</figcaption></figure>}
              <div className="np-copy">
                <p className="np-sub">{paper.sub}</p>
                {paper.body && <p className="np-text">{paper.body}</p>}
                <p className="np-credits"><b>Our detectives:</b> {room.players.map((p) => p.name).join(', ')}.</p>
                {accomplice && <p className="np-credits"><b>Accomplice:</b> {accomplice.name}, {caught ? 'caught red-handed' : 'still at large'}.</p>}
              </div>
            </div>
            <span className="np-stamp" aria-hidden="true">Case closed</span>
          </article>
          <aside className="paper-side">
            <div className="qr-frame small">{DEMO ? <FakeQr seed={`${room.code}-paper`} /> : <img src={`/api/qr?text=${encodeURIComponent(frontPageUrl)}`} alt="" />}</div>
            <p className="paper-save"><b>Save the front page</b>Scan to keep it on your phone.</p>
            <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
              <span className="btn-ok" aria-hidden="true">OK</span> The ledger
            </button>
          </aside>
        </section>
      )}

      {(stage.k === 'step' || stage.k === 'culprit') && (
        <div className="reveal-lineup" aria-label="Suspects">
          {c.suspects.map((s) => {
            const unmasked = stage.k === 'culprit';
            const isCulprit = unmasked && s.id === rv.culprit;
            const out = cleared.has(s.id) || (unmasked && s.id !== rv.culprit);
            return (
              <figure key={s.id} className={`rl-card ${out ? 'is-cleared' : ''} ${nowClearing.has(s.id) ? 'is-clearing' : ''} ${isCulprit ? 'is-culprit' : ''}`}>
                <Portrait suspect={s} />
                <figcaption>{shortName(s)}</figcaption>
                {out && <span className="cleared-stamp">Cleared</span>}
              </figure>
            );
          })}
        </div>
      )}

      <div className="b-progress reveal-progress" aria-hidden="true">
        {stages.map((_, i) => <i key={i} className={i < at ? 'done' : i === at ? 'now' : ''} />)}
      </div>
      <Hints items={stage.k === 'newspaper' ? [['ok', 'The ledger'], ['back', 'Menu']] : [['ok', 'Next'], ['back', 'Menu']]} />
      <span className="sr-only" aria-live="polite">{stage.k === 'step' ? `${steps[stage.i]?.says} Therefore, ${steps[stage.i]?.therefore}` : ''}</span>
    </main>
  );
}
