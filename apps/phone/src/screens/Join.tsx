import { useState } from 'react';
import type React from 'react';
import { AVATARS, ScreenHeading } from '../components';
import { useGame } from '../game';
import { unlockAudio } from '../feedback';

export function Join() {
  const { roomCode, join } = useGame();
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem('accomplice:profile') ?? 'null') as { name: string; avatar: string } | null;
    } catch {
      return null;
    }
  })();
  const [code, setCode] = useState(roomCode);
  const [name, setName] = useState(saved?.name ?? '');
  const [avatar, setAvatar] = useState(saved?.avatar ?? AVATARS[0].id);
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const codeFromLink = roomCode.length === 4;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    unlockAudio(); // good moment to wake audio on iOS: we're inside a tap
    const errs: typeof errors = {};
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) errs.code = 'The room code is the 4 letters on the TV.';
    if (!name.trim()) errs.name = 'Tell us what to call you.';
    setErrors(errs);
    if (errs.code) return document.getElementById('room-code')?.focus();
    if (errs.name) return document.getElementById('player-name')?.focus();
    join(c, { name: name.trim().slice(0, 16), avatar });
  };

  return (
    <div className="screen screen--join">
      <div className="marquee">
        <img className="marquee__icon" src={`${import.meta.env.BASE_URL}art/app-icon-256.webp`} alt="" width="112" height="112" />
      </div>
      <ScreenHeading>Join the party</ScreenHeading>
      <p className="lede">Everyone is a suspect tonight. Even you.</p>

      <form className="stack" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="room-code">Room code</label>
          {codeFromLink && !errors.code ? (
            <p className="hint" id="room-code-hint">
              From the TV. Change it if you are joining a different room.
            </p>
          ) : (
            <p className="hint" id="room-code-hint">
              4 letters, shown on the TV.
            </p>
          )}
          <input
            id="room-code"
            className="input input--code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '').slice(0, 4))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={4}
            aria-invalid={!!errors.code}
            aria-describedby={errors.code ? 'room-code-hint room-code-err' : 'room-code-hint'}
          />
          {errors.code && (
            <p id="room-code-err" className="field__error">
              {errors.code}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            placeholder="e.g. Ada"
            maxLength={16}
            enterKeyHint="go"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'player-name-err' : undefined}
          />
          {errors.name && (
            <p id="player-name-err" className="field__error">
              {errors.name}
            </p>
          )}
        </div>

        <fieldset className="field">
          <legend>Pick your calling card</legend>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <label key={a.id} className="avatar-opt">
                <input type="radio" name="avatar" value={a.id} checked={avatar === a.id} onChange={() => setAvatar(a.id)} />
                <span className="avatar-opt__face" aria-hidden="true">
                  {a.id}
                </span>
                <span className="avatar-opt__label">
                  <span className="sr-only">Calling card: </span>
                  {a.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn btn--primary btn--block btn--big">
          Step inside
        </button>
      </form>
    </div>
  );
}
