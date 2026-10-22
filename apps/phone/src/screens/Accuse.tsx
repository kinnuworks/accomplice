import { useRef, useState } from 'react';
import type React from 'react';
import { Icon, PlayerAvatar, Portrait, ScreenHeading, portraitAlt } from '../components';
import { useGame } from '../game';
import { announce } from '../announce';
import { cue } from '../feedback';

const NOBODY = '__nobody__';

export function Accuse({ demoAt }: { demoAt?: string }) {
  const { room, you, send } = useGame();
  const preset = demoAt === 'accuse-confirm';
  const [culprit, setCulprit] = useState(preset ? 'finch' : '');
  const [item, setItem] = useState(preset ? 'candlestick' : '');
  const [accomplice, setAccomplice] = useState(preset ? 'p-theo' : '');
  const [step, setStep] = useState<'choose' | 'confirm'>(preset ? 'confirm' : 'choose');
  const [error, setError] = useState<string | null>(null);
  const culpritRef = useRef<HTMLFieldSetElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);

  if (!room?.case || !you) return null;
  const c = room.case;
  const others = room.players.filter((p) => p.id !== you.playerId);
  const askAccomplice = room.players.length >= 4;
  const isAcc = you.role === 'accomplice';

  if (you.vote) {
    const s = c.suspects.find((x) => x.id === you.vote!.culprit);
    const it = c.items.find((x) => x.id === you.vote!.item);
    const acc = room.players.find((p) => p.id === you.vote!.accomplice);
    return (
      <div className="screen">
        <p className="eyebrow">The accusation</p>
        <ScreenHeading>Locked in</ScreenHeading>
        <div className="sealed" aria-hidden="true">
          <Icon name="lock" />
        </div>
        <section className="panel panel--paper" aria-labelledby="mine-h">
          <h2 id="mine-h">Your accusation</h2>
          <dl className="summary">
            <dt>Who</dt>
            <dd>{s ? s.name : 'Unknown'}</dd>
            {it && (
              <>
                <dt>With</dt>
                <dd>the {it.name}</dd>
              </>
            )}
            {askAccomplice && (
              <>
                <dt>Accomplice</dt>
                <dd>{acc ? acc.name : 'Nobody, you think'}</dd>
              </>
            )}
          </dl>
        </section>
        <p className="votes" role="status">
          {room.votes.count} of {room.votes.needed} votes are in.{' '}
          {room.votes.count >= room.votes.needed ? 'Eyes on the TV.' : 'Waiting for the others.'}
        </p>
      </div>
    );
  }

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    if (!culprit) {
      setError('Pick who you think did it.');
      announce('Pick who you think did it.', 'assertive');
      culpritRef.current?.querySelector('input')?.focus();
      return;
    }
    setError(null);
    setStep('confirm');
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const lockIn = () => {
    send({
      t: 'phone:vote',
      culprit,
      item: item || undefined,
      accomplice: askAccomplice && accomplice && accomplice !== NOBODY ? accomplice : undefined,
    });
    cue.locked();
    announce('Accusation locked in.');
  };

  const s = c.suspects.find((x) => x.id === culprit);
  const it = c.items.find((x) => x.id === item);
  const acc = room.players.find((p) => p.id === accomplice);

  if (step === 'confirm') {
    return (
      <div className="screen">
        <p className="eyebrow">The accusation</p>
        <h1 className="screen-title" tabIndex={-1} ref={confirmRef}>
          Sure about this?
        </h1>
        <section className="panel panel--paper accuse-card" aria-label="Your accusation">
          {s && <Portrait id={s.id} name={s.name} src={s.portrait} size={112} alt={portraitAlt(s)} />}
          <p className="accuse-card__line">
            It was <strong>{s?.name ?? 'someone'}</strong>
            {it ? (
              <>
                , with the <strong>{it.name}</strong>
              </>
            ) : null}
            .
          </p>
          {askAccomplice && (
            <p className="accuse-card__line">
              {acc ? (
                <>
                  And <strong>{acc.name}</strong> helped them.
                </>
              ) : (
                'And nobody helped them.'
              )}
            </p>
          )}
        </section>
        <p className="hint center">Once it is locked in, you cannot change it.</p>
        <div className="stack">
          <button type="button" className="btn btn--danger btn--block btn--big" onClick={lockIn}>
            Lock it in
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => {
              setStep('choose');
            }}
          >
            Change my mind
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <p className="eyebrow">The accusation</p>
      <ScreenHeading>Name the guilty party</ScreenHeading>
      <p className="lede">{isAcc ? 'Vote like a detective would. Nobody needs to know.' : 'Take your time. Talk it over. The TV will wait.'}</p>
      <form className="stack" onSubmit={review} noValidate>
        <fieldset ref={culpritRef} className="field" aria-describedby={error ? 'culprit-err' : undefined}>
          <legend>Who did it?</legend>
          {error && (
            <p id="culprit-err" className="field__error">
              {error}
            </p>
          )}
          <div className="suspect-grid">
            {c.suspects.map((x) => (
              <label key={x.id} className="suspect">
                <input type="radio" name="culprit" value={x.id} checked={culprit === x.id} onChange={() => setCulprit(x.id)} />
                <span className="suspect__card">
                  <Portrait id={x.id} name={x.name} src={x.portrait} size={52} />
                  <span className="suspect__text">
                    <span className="suspect__name">{x.name}</span>
                    <span className="suspect__role">{x.role}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {c.items.length > 0 && (
          <fieldset className="field">
            <legend>With what?</legend>
            <div className="choice-list">
              {c.items.map((x) => (
                <label key={x.id} className="choice choice--row">
                  <input type="radio" name="item" value={x.id} checked={item === x.id} onChange={() => setItem(x.id)} />
                  <span className="choice__body">
                    <span className="choice__title">The {x.name}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {askAccomplice && (
          <fieldset className="field">
            <legend>Was someone here helping them?</legend>
            <p className="hint">There may or may not be an accomplice. Guess well and score extra.</p>
            <div className="choice-list">
              {others.map((p) => (
                <label key={p.id} className="choice choice--row">
                  <input type="radio" name="accomplice" value={p.id} checked={accomplice === p.id} onChange={() => setAccomplice(p.id)} />
                  <span className="choice__body">
                    <span className="choice__title">
                      <PlayerAvatar avatar={p.avatar} seat={p.seat} name={p.name} size={28} />{' '}
                      {p.name}
                    </span>
                  </span>
                </label>
              ))}
              <label className="choice choice--row">
                <input type="radio" name="accomplice" value={NOBODY} checked={accomplice === NOBODY} onChange={() => setAccomplice(NOBODY)} />
                <span className="choice__body">
                  <span className="choice__title">Nobody. We were all honest.</span>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        <button type="submit" className="btn btn--primary btn--block btn--big">
          Review my accusation
        </button>
        <p className="votes">
          {room.votes.count} of {room.votes.needed} votes are in.
        </p>
      </form>
    </div>
  );
}
