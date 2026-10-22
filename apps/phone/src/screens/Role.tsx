import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ScreenHeading, sceneFor } from '../components';
import { useGame } from '../game';
import { cue, unlockAudio } from '../feedback';
import { usePress } from '../usePress';

/** The sealed envelope. Hold to peek, or tap to open and tap again to close. */
export function RolePeek({ startOpen = false, compact = false }: { startOpen?: boolean; compact?: boolean }) {
  const { you, room } = useGame();
  const [open, setOpen] = useState(startOpen);
  const [peeked, setPeeked] = useState(startOpen);
  const cardRef = useRef<HTMLDivElement>(null);
  const viaClick = useRef(false);

  // Slam the envelope shut if the phone is put down or the app is switched away.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && setOpen(false);
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  const press = usePress({
    active: open,
    onStart() {
      unlockAudio();
      cue.peek();
      setOpen(true);
      setPeeked(true);
    },
    onStop() {
      setOpen(false);
    },
  });

  // Screen reader and keyboard users open with a click: take them to the card.
  useEffect(() => {
    if (open && viaClick.current) cardRef.current?.focus();
    viaClick.current = false;
  }, [open]);

  const role = you?.role;
  const culprit = room?.case?.suspects.find((s) => s.id === you?.knowsCulprit);
  const isAcc = role === 'accomplice';

  return (
    <div className={`peek${open ? ' is-open' : ''}${compact ? ' peek--compact' : ''}`}>
      <button
        type="button"
        className="envelope"
        aria-expanded={open}
        aria-controls="role-card"
        aria-describedby="peek-hint"
        {...press}
        onKeyDown={() => (viaClick.current = true)}
        onClick={(e) => {
          if (e.detail === 0) viaClick.current = true; // keyboard or assistive tech
          press.onClick(e);
        }}
      >
        <span className="envelope__art" aria-hidden="true">
          <span className="envelope__back" />
          <span className="envelope__peek" />
          <span className="envelope__front">
            <span className="envelope__to">For your eyes only</span>
          </span>
          <span className="envelope__flap" />
          <span className="envelope__seal">A</span>
        </span>
        <span className="envelope__label">{open ? 'Hide my role' : 'Hold to peek at my role'}</span>
      </button>
      <p id="peek-hint" className="hint center">
        Press and hold to peek. Let go to hide it. Or tap once to open and tap again to close.
      </p>

      <div id="role-card" className={`role-card role-card--${role ?? 'none'}`} hidden={!open} ref={cardRef} tabIndex={-1} aria-labelledby="role-name">
        {open && role && (
          <>
            <p className="role-card__kicker">You are the</p>
            <h2 id="role-name" className="role-card__name foil">
              {isAcc ? 'Accomplice' : 'Detective'}
            </h2>
            {isAcc ? (
              <>
                <p className="role-card__line">
                  You are covering for <strong>{culprit ? `${culprit.name}, ${culprit.role}` : 'the culprit'}</strong>.
                </p>
                <p className="role-card__line">Steer the others wrong without getting caught. If the culprit walks free, you win.</p>
                {you?.safeLies && you.safeLies.length > 0 && (
                  <div className="role-card__lies">
                    <h3>Lies you can tell safely</h3>
                    <ul>
                      {you.safeLies.map((l, i) => (
                        <li key={i}>{l.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="role-card__line">Find who did it, and with what. Ask sharp questions and trust the clues more than the charm.</p>
                {(room?.players.length ?? 0) >= 4 && (
                  <p className="role-card__line">Someone at this party may be secretly helping the culprit. Watch who steers you wrong.</p>
                )}
              </>
            )}
          </>
        )}
        {open && !role && <p className="role-card__line" id="role-name">Your role is still being dealt. Hold on a moment.</p>}
      </div>
      {!open && peeked && <p className="hint center">Hidden again. Peek as often as you like.</p>}
    </div>
  );
}

export function Briefing({ startOpen }: { startOpen?: boolean }) {
  const { room } = useGame();
  const c = room?.case;
  return (
    <div className="screen screen--role" style={c ? ({ ['--scene' as string]: `url(${sceneFor(c)})` } as React.CSSProperties) : undefined}>
      <p className="eyebrow">{c ? c.dateLine : 'The game begins'}</p>
      <ScreenHeading>Your secret role</ScreenHeading>
      <p className="lede">Tilt your phone away from your neighbours first.</p>
      <RolePeek startOpen={startOpen} />
      {c && (
        <section className="panel panel--paper" aria-labelledby="case-h">
          <h2 id="case-h">{c.title}</h2>
          <p className="case-place">{c.place}</p>
          <p>{c.intro}</p>
          <p className="hint-ink">Listen to the narrator on the TV. The questions start soon.</p>
        </section>
      )}
    </div>
  );
}
