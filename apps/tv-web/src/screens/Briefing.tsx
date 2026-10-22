import { useEffect, useMemo, useState } from 'react';
import { FloorPlan } from '../art/FloorPlan';
import { ArtImage, NightScene } from '../art/NightScene';
import { Portrait, Silhouette } from '../art/Portrait';
import { audio } from '../audio/audio';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { reducedMotion, STEP, STILL } from '../env';
import { useKeys } from '../focus/focus';
import { send, useTv } from '../net/store';

type Step = { k: 'title' } | { k: 'victim' } | { k: 'plan' } | { k: 'suspect'; i: number } | { k: 'ready' };

const DUR: Record<Step['k'], number> = { title: 6500, victim: 8000, plan: 8500, suspect: 5200, ready: 0 };

export function Briefing() {
  const c = useTv((s) => s.room?.case);
  const steps = useMemo<Step[]>(() => [
    { k: 'title' }, { k: 'victim' }, { k: 'plan' },
    ...(c?.suspects ?? []).map((_, i) => ({ k: 'suspect' as const, i })),
    { k: 'ready' },
  ], [c?.suspects]);

  const initial = useMemo(() => {
    if (!STEP) return 0;
    const [k, n] = STEP.split('-');
    const idx = steps.findIndex((s) => s.k === k && (s.k !== 'suspect' || s.i === Number(n ?? 0)));
    return Math.max(0, idx);
  }, [steps]);
  const [at, setAt] = useState(initial);
  const step = steps[Math.min(at, steps.length - 1)];

  useEffect(() => {
    if (step.k === 'ready' || STILL) return;
    const t = setTimeout(() => setAt((a) => a + 1), reducedMotion() ? DUR[step.k] * 1.2 : DUR[step.k]);
    return () => clearTimeout(t);
  }, [at, step.k]);
  useEffect(() => { audio.play(step.k === 'suspect' ? 'cardFlip' : step.k === 'title' ? 'reveal' : 'whoosh'); }, [at]);

  useKeys((k) => {
    if (k === 'ok' && step.k !== 'ready') { setAt((a) => Math.min(a + 1, steps.length - 1)); return true; }
    if (k === 'right' && step.k !== 'ready') { setAt((a) => Math.min(a + 1, steps.length - 1)); return true; }
    if (k === 'left' && at > 0) { setAt((a) => a - 1); return true; }
    return false;
  });

  if (!c) return <main className="screen briefing-screen" />;
  const crimeRoom = c.rooms.find((r) => r.id === c.crime.room);
  const crimeSlot = c.slots.find((s) => s.id === c.crime.slot);

  return (
    <main className={`screen briefing-screen step-${step.k}`}>
      <div className="briefing-bg" aria-hidden="true">
        <NightScene />
        <ArtImage src={`art/${c.scene ?? `scenes/${c.id}.webp`}`} className="scene-art" />
      </div>
      <div className="letterbox top" aria-hidden="true" /><div className="letterbox bottom" aria-hidden="true" />

      {step.k === 'title' && (
        <section className="b-title" key="title">
          <p className="eyebrow">{c.tone === 'cozy' ? 'A cozy case' : 'A case of murder'}</p>
          <h1 className="b-case-title">{c.title}</h1>
          <Flourish />
          <p className="b-place">{c.place}</p>
          <p className="b-date">{c.dateLine}</p>
        </section>
      )}

      {step.k === 'victim' && (
        <section className="b-victim" key="victim">
          <div className="victim-frame">
            <Silhouette arch="butler" uid="victim" />
            <span className="victim-ribbon" aria-hidden="true" />
          </div>
          <div className="victim-text">
            <p className="eyebrow">{c.tone === 'cozy' ? 'The scene of the crime' : 'The victim'}</p>
            <h2 className="b-name">{c.victim.name}</h2>
            <p className="b-desc">{c.victim.description}</p>
            <p className="b-crime">
              <span className="hand">{c.victim.name.split(' ').slice(-1)[0]} {c.crime.what}</span>
              <span className="b-crime-where">in the {crimeRoom?.name ?? 'house'}, at {crimeSlot?.label ?? 'night'}.</span>
            </p>
          </div>
        </section>
      )}

      {step.k === 'plan' && (
        <section className="b-plan" key="plan">
          <p className="eyebrow">The house</p>
          <div className="plan-paper">
            <FloorPlan rooms={c.rooms} crimeRoom={c.crime.room} className="plan-reveal" width={1300} height={530} />
          </div>
          <p className="b-plan-note"><span className="crime-key" aria-hidden="true">!</span> Scene of the crime: the {crimeRoom?.name}, around {crimeSlot?.label}</p>
        </section>
      )}

      {step.k === 'suspect' && (() => {
        const s = c.suspects[step.i];
        return (
          <section className="b-suspect" key={`s${step.i}`}>
            <div className="b-suspect-card">
              <Portrait suspect={s} className="portrait-xl" />
              <span className="b-suspect-num">No. {step.i + 1}</span>
            </div>
            <div className="b-suspect-text">
              <p className="eyebrow">Suspect {step.i + 1} of {c.suspects.length}</p>
              <h2 className="b-name">{s.name}</h2>
              <p className="b-role">{s.role}</p>
              <p className="b-motive hand">{s.motive}</p>
            </div>
          </section>
        );
      })()}

      {step.k === 'suspect' && (
        <div className="b-thumbs" aria-hidden="true">
          {c.suspects.map((s, i) => (
            <div key={s.id} className={`b-thumb ${i < step.i ? 'is-met' : i === step.i ? 'is-now' : ''}`}><Portrait suspect={s} /></div>
          ))}
        </div>
      )}

      {step.k === 'ready' && (
        <section className="b-ready" key="ready">
          <p className="eyebrow">Everyone is in the parlour</p>
          <h2 className="display-title">One of them did it.</h2>
          <div className="lineup">
            {c.suspects.map((s, i) => (
              <figure key={s.id} className="lineup-card" style={{ ['--i' as string]: i }}>
                <Portrait suspect={s} />
                <figcaption><b>{s.name}</b><span>{s.role}</span></figcaption>
              </figure>
            ))}
          </div>
          <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
            <span className="btn-ok" aria-hidden="true">OK</span> Begin round one
          </button>
          <p className="b-ready-note">Get your questions ready. Each of you can ask two per round.</p>
        </section>
      )}

      <div className="b-progress" aria-hidden="true">
        {steps.map((_, i) => <i key={i} className={i < at ? 'done' : i === at ? 'now' : ''} />)}
      </div>
      <Hints items={step.k === 'ready' ? [['ok', 'Begin'], ['back', 'Leave']] : [['ok', 'Skip ahead'], ['arrows', 'Back and forth']]} />
    </main>
  );
}
