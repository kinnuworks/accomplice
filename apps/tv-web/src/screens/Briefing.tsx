// Cinematic briefing: one slide per narrator line (case.briefing, at most six). Slides follow the narrator
// (announce ids briefing:0..n); OK skips ahead. The last slide ends on the line-up and "Begin round one".
import { useEffect, useMemo, useRef, useState } from 'react';
import { FloorPlan } from '../art/FloorPlan';
import { ArtImage, NightScene } from '../art/NightScene';
import { Portrait } from '../art/Portrait';
import { audio } from '../audio/audio';
import { estimateMs, skipLine } from '../audio/director';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { CaptionPanel } from '../components/Captions';
import { STEP, STILL } from '../env';
import { useKeys } from '../focus/focus';
import { send, useTv } from '../net/store';
import { shortName, type Line, type TvCase, type TvSuspect } from '../net/types';

type Kind = 'title' | 'victim' | 'house' | 'suspects';

export function crimeLabel(c: TvCase): string {
  const room = c.rooms.find((r) => r.id === c.crime.room)?.name ?? 'the house';
  const slot = (c.slots.find((s) => s.id === c.crime.slot)?.label ?? '').replace(/\s*pm$/i, '');
  return `${c.tone === 'cozy' ? 'Cake gone' : 'Body found'} · ${room} · ${slot}`;
}

function linesFor(c: TvCase): string[] {
  if (c.briefing?.length) return c.briefing.slice(0, 6);
  const room = c.rooms.find((r) => r.id === c.crime.room)?.name ?? 'house';
  const slot = c.slots.find((s) => s.id === c.crime.slot)?.label ?? '';
  return [`${c.title}.`, `${c.victim.name} ${c.crime.what} in the ${room} at ${slot}.`, 'Here is the house. Every door, every corridor, every place to hide.', 'And here are the people who were in it.'];
}

/** Which suspects a line talks about, by short name, first name or surname. */
function mentioned(line: string, suspects: TvSuspect[]): string[] {
  const low = line.toLowerCase();
  return suspects.filter((s) => {
    const keys = [shortName(s), ...s.name.replace(/[.]/g, '').split(' ').filter((w) => w.length > 3 && !/^(lady|lord|colonel|doctor|mrs|miss)$/i.test(w))];
    return keys.some((k) => low.includes(k.toLowerCase()));
  }).map((s) => s.id);
}

export function Briefing() {
  const c = useTv((s) => s.room?.case) as TvCase | undefined;
  const now = useTv((s) => s.now);
  const lines = useMemo(() => (c ? linesFor(c) : []), [c]);
  const kinds = useMemo<Kind[]>(() => lines.map((_, i) => (i === 0 ? 'title' : i === 1 ? 'victim' : i === 2 ? 'house' : 'suspects')), [lines]);
  const spot = useMemo(() => {
    if (!c) return [] as string[][];
    const per = lines.map((l, i) => (kinds[i] === 'suspects' ? mentioned(l, c.suspects) : []));
    const firstSus = kinds.indexOf('suspects');
    if (firstSus >= 0 && per.every((p) => p.length === 0)) per[firstSus] = c.suspects.map((s) => s.id);
    return per;
  }, [c, lines, kinds]);

  const initial = useMemo(() => {
    if (!STEP) return 0;
    const map: Record<string, number> = { title: 0, victim: 1, plan: 2, house: 2, suspects: 3, ready: lines.length - 1 };
    const n = STEP.startsWith('suspect') ? 3 + (Number(STEP.split('-')[1]) || 0) : map[STEP] ?? 0;
    return Math.min(lines.length - 1, n);
  }, [lines.length]);
  const [at, setAt] = useState(initial);
  const [ready, setReady] = useState(STEP === 'ready');
  const heard = useRef(false);
  const last = lines.length - 1;

  // follow the narrator
  const playing = now?.line.key.match(/^briefing:(\d+)$/);
  const playingIdx = playing ? Number(playing[1]) : -1;
  useEffect(() => {
    if (playingIdx >= 0) { heard.current = true; setAt(Math.min(playingIdx, last)); }
    else if (heard.current && at === last) setReady(true);
  }, [playingIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // without a narrator (or before it starts), pace the slides ourselves
  useEffect(() => {
    if (STILL || ready || heard.current) return;
    const ms = estimateMs({ text: lines[at] ?? '' } as Line) + 1800;
    const t = setTimeout(() => { if (heard.current) return; if (at < last) setAt(at + 1); else setReady(true); }, Math.max(4500, ms));
    return () => clearTimeout(t);
  }, [at, ready, lines, last]);

  useEffect(() => {
    if (kinds[at] !== 'title') { audio.play(kinds[at] === 'suspects' ? 'cardFlip' : 'whoosh'); return; }
    // cold open: thunder now, the title card slams in a few seconds later
    audio.play('blackout');
    const t = setTimeout(() => audio.play('reveal'), STEP ? 0 : 3400);
    return () => clearTimeout(t);
  }, [at]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeys((k) => {
    if (ready) return false;
    if (k === 'ok' || k === 'right') {
      if (playingIdx >= 0) skipLine();
      if (at < last) setAt(at + 1); else setReady(true);
      return true;
    }
    if (k === 'left' && at > 0) { setAt(at - 1); return true; }
    return false;
  });

  if (!c) return <main className="screen briefing-screen" />;
  const kind = kinds[at];
  const crimeRoom = c.rooms.find((r) => r.id === c.crime.room);
  const crimeSlot = c.slots.find((s) => s.id === c.crime.slot);
  const lit = ready ? c.suspects.map((s) => s.id) : (spot[at] ?? []);
  const captionLine: Line = { key: `briefing:${at}`, speaker: 'narrator', speakerName: 'Narrator', text: lines[at] ?? '', narrator: true };

  return (
    <main className={`screen briefing-screen slide-${kind} ${ready ? 'is-ready' : ''}`}>
      <div className="briefing-bg" aria-hidden="true">
        <NightScene />
        <ArtImage src={`art/${c.scene ?? `scenes/${c.id}.webp`}`} className="scene-art" />
        <div className="rain">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${(i % 7) * -0.23}s`, ['--s' as string]: `${0.55 + (i % 5) * 0.08}s` }} />)}</div>
        <div className="candle-vignette" />
        {kind === 'title' && !STEP && <div className="lightning" />}
      </div>

      {kind === 'title' && (
        <section className={`b-title ${STEP ? '' : 'cold-open'}`} key="title">
          <p className="eyebrow">{c.tone === 'cozy' ? 'A cozy case' : 'A case of murder'}</p>
          <h1 className="b-case-title">{c.title}</h1>
          <Flourish />
          <p className="b-place">{c.place}</p>
          <p className="b-date">{c.dateLine}</p>
        </section>
      )}

      {kind === 'victim' && (
        <section className="b-victim" key="victim">
          <div className="memorial">
            <span className="memorial-band" aria-hidden="true" />
            <p className="memorial-kicker">{c.tone === 'cozy' ? 'Reported missing' : 'In memory of'}</p>
            <h2 className="memorial-name">{c.victim.name}</h2>
            <p className="memorial-desc">{c.victim.description}</p>
            <div className="memorial-rule" aria-hidden="true" />
            <p className="memorial-what">{((w) => w.charAt(0).toUpperCase() + w.slice(1))(c.crime.what.replace(/^was\s+/i, ''))}</p>
            <p className="memorial-where"><span className="crime-key" aria-hidden="true">!</span>{crimeRoom?.name} · {crimeSlot?.label}</p>
          </div>
        </section>
      )}

      {kind === 'house' && (
        <section className="b-plan" key="plan">
          <p className="eyebrow">The house</p>
          <div className="plan-paper">
            <FloorPlan rooms={c.rooms} crimeRoom={c.crime.room} className="plan-reveal" width={1300} height={500} />
          </div>
          <p className="crime-chip"><span className="crime-key" aria-hidden="true">!</span>{crimeLabel(c)}</p>
        </section>
      )}

      {kind === 'suspects' && (
        <section className="b-suspects" key={`sus${ready ? 'r' : at}`}>
          <p className="eyebrow">{ready ? 'Everyone is in the parlour' : 'The suspects'}</p>
          {ready && <h2 className="display-title">One of them did it.</h2>}
          <div className={`lineup ${lit.length && lit.length < c.suspects.length ? 'has-spot' : ''}`}>
            {c.suspects.map((s, i) => {
              const on = lit.includes(s.id);
              return (
                <figure key={s.id} className={`lineup-card ${on ? 'is-lit' : ''}`} style={{ ['--i' as string]: i }}>
                  <Portrait suspect={s} />
                  <figcaption><b>{shortName(s)}</b><span>{s.role}</span></figcaption>
                  {on && lit.length <= 2 && !ready && <p className="lineup-motive">{s.motive}</p>}
                </figure>
              );
            })}
          </div>
          {ready && (
            <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
              <span className="btn-ok" aria-hidden="true">OK</span> Begin round one
            </button>
          )}
        </section>
      )}

      {!ready && (
        <CaptionPanel key={`cap${at}`} className="b-caption" line={captionLine} durationMs={now && playingIdx === at ? now.durationMs : estimateMs(captionLine)} live={playingIdx === at} />
      )}

      <div className="b-progress" aria-label={`Slide ${at + 1} of ${lines.length}`}>
        {lines.map((_, i) => <i key={i} className={i < at || ready ? 'done' : i === at ? 'now' : ''} />)}
      </div>
      <Hints items={ready ? [['ok', 'Begin'], ['back', 'Menu']] : [['ok', 'Skip ahead'], ['back', 'Menu']]} />
    </main>
  );
}
