import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Icon, ScreenHeading, sceneFor } from '../components';
import { useGame } from '../game';
import { cue, preloadSeal, unlockAudio } from '../feedback';
import { usePress } from '../usePress';
import { shortName, type SuspectX } from '../types';

/**
 * The sealed envelope, filling the screen. Hold to peek (it closes when you let go),
 * or double-tap / tap to open it and use Hide to close. Screen readers get the
 * double-tap path for free, since that is how they press a button.
 */
export function RolePeek({ startOpen = false, compact = false }: { startOpen?: boolean; compact?: boolean }) {
  const { you, room, speakSecret } = useGame();
  const [open, setOpen] = useState(startOpen);
  const [lie, setLie] = useState(0);
  // While a finger is down we are in "hold to peek"; otherwise an open card replaces the envelope.
  const [pressing, setPressing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<HTMLButtonElement>(null);
  const viaClick = useRef(false);
  const touchX = useRef<number | null>(null);

  useEffect(preloadSeal, []);

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
      cue.crack();
      setOpen(true);
    },
    onStop() {
      setOpen(false);
    },
  });

  useEffect(() => {
    if (open && viaClick.current) cardRef.current?.focus();
    viaClick.current = false;
  }, [open]);

  const hide = () => {
    setOpen(false);
    requestAnimationFrame(() => envRef.current?.focus());
  };

  const role = you?.role;
  const culprit = (room?.case?.suspects as SuspectX[] | undefined)?.find((s) => s.id === you?.knowsCulprit);
  const isAcc = role === 'accomplice';
  const lies = you?.safeLies ?? [];
  const nextLie = (d: number) => setLie((i) => (i + d + lies.length) % lies.length);

  const readAloud = () => {
    let text = isAcc
      ? `You are the Accomplice. You are covering for ${culprit ? `${culprit.name}, ${culprit.role}` : 'the culprit'}. Steer the others wrong without getting caught.`
      : 'You are the Detective. Find who did it, and with what.';
    if (isAcc && lies.length) text += ' Safe lies you can tell: ' + lies.map((l) => l.text).join(' ');
    void speakSecret(text);
  };

  return (
    <div className={`peek${open ? ' is-open' : ''}${compact ? ' peek--compact' : ''}`}>
      <div className="peek__stage">
        <button
          ref={envRef}
          type="button"
          className="envelope"
          aria-expanded={open}
          aria-controls="role-card"
          aria-describedby="peek-help"
          {...press}
          onPointerDown={(e) => {
            setPressing(true);
            press.onPointerDown(e);
          }}
          onPointerUp={() => {
            setPressing(false);
            press.onPointerUp();
          }}
          onPointerCancel={() => {
            setPressing(false);
            press.onPointerCancel();
          }}
          hidden={open && !pressing ? true : undefined}
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
          <span className="envelope__label">{open ? 'Close the envelope' : 'Hold to peek at my role'}</span>
          <span className="envelope__sub" aria-hidden="true">
            or double-tap to open
          </span>
        </button>
        <p id="peek-help" className="sr-only">
          Press and hold to peek, and let go to hide. Or double-tap to open, then use Hide to close.
        </p>

        <div id="role-card" className={`role-card role-card--${role ?? 'none'}`} hidden={!open} ref={cardRef} tabIndex={-1} aria-labelledby="role-name">
          {open && role && (
            <>
              <p className="telegram__head" aria-hidden="true">
                <span>Telegram</span>
                <span>Urgent. Private.</span>
              </p>
              <p className="telegram__line">To: {room?.players.find((p) => p.id === you?.playerId)?.name ?? 'you'}</p>
              <h2 id="role-name" className="telegram__role">
                <span className="telegram__you">You are the</span>{' '}
                <span className={`stamp stamp--${isAcc ? 'acc' : 'det'}`}>{isAcc ? 'Accomplice' : 'Detective'}</span>
              </h2>
              {isAcc ? (
                <>
                  <p className="telegram__body">
                    Cover for {culprit ? shortName(culprit) : 'the culprit'}
                    {culprit ? `, ${culprit.role}` : ''}. Stop. If they walk free, you win. Stop.
                  </p>
                  {lies.length > 0 && (
                    <section
                      className="lie"
                      aria-labelledby="lie-h"
                      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
                      onTouchEnd={(e) => {
                        if (touchX.current === null || lies.length < 2) return;
                        const dx = e.changedTouches[0].clientX - touchX.current;
                        if (Math.abs(dx) > 40) nextLie(dx < 0 ? 1 : -1);
                        touchX.current = null;
                      }}
                    >
                      <h3 id="lie-h" className="lie__h">
                        Safe lie {lie + 1} of {lies.length}
                      </h3>
                      <p className="lie__text" aria-live="polite">
                        {lies[lie]?.text}
                      </p>
                      {lies.length > 1 && (
                        <div className="row lie__nav">
                          <button type="button" className="btn btn--ghost btn--small grow" onClick={() => nextLie(-1)}>
                            Previous lie
                          </button>
                          <button type="button" className="btn btn--ghost btn--small grow" onClick={() => nextLie(1)}>
                            Next lie
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <>
                  <p className="telegram__body">Find who did it, and with what. Stop. Trust the clues more than the charm. Stop.</p>
                  {(room?.players.length ?? 0) >= 4 && <p className="telegram__body">Someone here may be helping the culprit. Stop. Watch who steers you wrong. Stop.</p>}
                </>
              )}
              <div className="row role-card__actions">
                <button type="button" className="btn btn--ghost btn--small grow" onClick={readAloud}>
                  <Icon name="speaker" />
                  Read it to me
                </button>
                <button type="button" className="btn btn--primary btn--small grow" onClick={hide}>
                  Hide
                </button>
              </div>
            </>
          )}
          {open && !role && (
            <p className="role-card__line" id="role-name">
              Your role is still being dealt. Hold on a moment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Briefing({ startOpen }: { startOpen?: boolean }) {
  const { room } = useGame();
  const c = room?.case;
  const [about, setAbout] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (about && !d.open) d.showModal();
    if (!about && d.open) d.close();
  }, [about]);
  return (
    <div className="screen screen--role" style={c ? ({ ['--scene' as string]: `url(${sceneFor(c)})` } as React.CSSProperties) : undefined}>
      <p className="eyebrow">{c ? c.dateLine : 'The game begins'}</p>
      <ScreenHeading>Your secret role</ScreenHeading>
      <RolePeek startOpen={startOpen} />
      {c && (
        <button type="button" className="btn btn--ghost btn--block about-btn" onClick={() => setAbout(true)}>
          About the case
        </button>
      )}
      {c && (
        <dialog ref={ref} className="sheet" aria-labelledby="about-h" onClose={() => setAbout(false)} onCancel={() => setAbout(false)}>
          <h2 id="about-h">{c.title}</h2>
          <p className="case-place">{c.place}</p>
          {c.briefing?.length ? (
            <ul className="briefing">
              {c.briefing.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>{c.intro}</p>
          )}
          <button type="button" className="btn btn--primary btn--block" onClick={() => setAbout(false)}>
            Close
          </button>
        </dialog>
      )}
    </div>
  );
}
