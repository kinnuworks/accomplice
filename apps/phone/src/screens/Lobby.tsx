import type { Tone } from '@accomplice/protocol';
import { PlayerAvatar, ScreenHeading } from '../components';
import { useGame } from '../game';

const TONES: { id: Tone; name: string; blurb: string }[] = [
  { id: 'classic', name: 'Classic', blurb: 'A proper murder at a proper house. Bloodless, but nobody is laughing.' },
  { id: 'cozy', name: 'Cozy', blurb: 'Something precious has vanished. The birthday cake, probably. Good for kids.' },
];

export function Lobby() {
  const { room, you, send } = useGame();
  if (!room || !you) return null;
  const isHost = room.hostId === you.playerId;
  const host = room.players.find((p) => p.id === room.hostId);
  const count = room.players.length;

  return (
    <div className="screen">
      <p className="eyebrow">Room {room.code.split('').join(' ')}</p>
      <ScreenHeading>The guests are arriving</ScreenHeading>
      <p className="lede">
        {count < 3
          ? `Best with 3 to 6 players. ${count === 1 ? 'Just you so far.' : `${count} here so far.`}`
          : `${count} guests. A fine number for a mystery.`}
      </p>

      <section aria-labelledby="guests-h" className="panel">
        <h2 id="guests-h">Guest list</h2>
        <ul className="guest-list">
          {room.players.map((p) => (
            <li key={p.id} className={`guest${p.connected ? '' : ' guest--away'}`}>
              <PlayerAvatar avatar={p.avatar} seat={p.seat} name={p.name} size={40} labelled />
              <span className="guest__name">
                {p.name}
                {p.id === you.playerId && <span className="sr-only"> (you)</span>}
              </span>
              <span className="guest__tags">
                {p.id === you.playerId && (
                  <span className="tag" aria-hidden="true">
                    You
                  </span>
                )}
                {p.id === room.hostId && <span className="tag tag--gold">Host</span>}
                {!p.connected && <span className="tag tag--dim">Away</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isHost ? (
        <section aria-labelledby="host-h" className="panel">
          <h2 id="host-h">You are the host</h2>
          <fieldset className="field">
            <legend>Choose the mood</legend>
            <div className="choice-list">
              {TONES.map((t) => (
                <label key={t.id} className="choice">
                  <input
                    type="radio"
                    name="tone"
                    value={t.id}
                    checked={room.tone === t.id}
                    onChange={() => send({ t: 'phone:setTone', tone: t.id })}
                    aria-describedby={`tone-${t.id}-d`}
                  />
                  <span className="choice__body">
                    <span className="choice__title">{t.name}</span>
                    <span className="choice__blurb" id={`tone-${t.id}-d`}>
                      {t.blurb}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="button" className="btn btn--primary btn--block btn--big" onClick={() => send({ t: 'phone:start' })}>
            Start the mystery
          </button>
          <p className="hint center">Wait until everyone is on the list. Late guests can still join.</p>
        </section>
      ) : (
        <section aria-labelledby="wait-h" className="panel panel--quiet">
          <h2 id="wait-h">Waiting for the host</h2>
          <p>
            {host ? `${host.name} will start the game` : 'The host will start the game'}. Tonight&rsquo;s mood:{' '}
            <strong>{room.tone === 'cozy' ? 'Cozy' : 'Classic'}</strong>.
          </p>
          <p className="hint">Keep this page open. Your phone is your secret notebook.</p>
        </section>
      )}
    </div>
  );
}
