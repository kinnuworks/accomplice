import { useEffect, useRef, useState } from 'react';
import type { ClientToServer, Tone } from '@accomplice/protocol';
import { Avatar } from '../art/Avatar';
import { FakeQr } from '../art/FakeQr';
import { audio } from '../audio/audio';
import { Hints } from '../components/Hints';
import { Emblem, Flourish } from '../components/Ornament';
import { DEMO } from '../env';
import { send, toast, useTv } from '../net/store';

const MIN_PLAYERS = 3;
const NO_PLAYERS: never[] = [];

export function Lobby() {
  const code = useTv((s) => s.code ?? s.room?.code ?? null);
  const joinUrl = useTv((s) => s.joinUrl);
  const players = useTv((s) => s.room?.players ?? NO_PLAYERS);
  const serverTone = useTv((s) => s.room?.tone ?? 'classic');
  const [tone, setTone] = useState<Tone>(serverTone);
  const [qrFailed, setQrFailed] = useState(false);
  useEffect(() => setTone(serverTone), [serverTone]);

  // a little fanfare whenever someone new arrives
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  useEffect(() => {
    for (const p of players) {
      if (!seen.current.has(p.id)) {
        if (!first.current) toast(`${p.name} pulled up a chair`, '+');
        seen.current.add(p.id);
      }
    }
    first.current = false;
  }, [players]);

  const url = joinUrl ?? (code ? `${location.origin}/p?room=${code}` : '');
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  const qrSrc = `/api/qr?text=${encodeURIComponent(url)}`;

  const chooseTone = (t: Tone) => {
    setTone(t);
    audio.play('cardFlip');
    // Not in the shared protocol yet: the server may ignore it. Phones can also set the tone.
    send({ t: 'tv:setTone', tone: t } as unknown as ClientToServer);
  };
  const start = () => {
    if (players.length < MIN_PLAYERS) { toast(`Waiting for at least ${MIN_PLAYERS} players`, '!'); audio.play('lose'); return; }
    send({ t: 'tv:start' });
  };

  const seats = Array.from({ length: 6 }, (_, i) => players.find((p) => p.seat === i) ?? null);

  return (
    <main className="screen lobby-screen">
      <header className="lobby-head">
        <Emblem className="lobby-emblem" />
        <div>
          <p className="eyebrow">Tonight's gathering</p>
          <h1 className="display-title">The guests are arriving</h1>
        </div>
      </header>

      <section className="join-card" aria-label="How to join">
        <div className="qr-frame">
          {DEMO || qrFailed ? <FakeQr seed={code ?? 'MOTH'} /> : <img src={qrSrc} alt="Scan to join" onError={() => setQrFailed(true)} />}
        </div>
        <div className="join-text">
          <p className="join-step"><span className="step-num">1</span>Scan with your phone camera</p>
          <p className="join-step"><span className="step-num">2</span><span>Or visit <b className="join-url">{shortUrl || 'the join page'}</b></span></p>
          <p className="join-step"><span className="step-num">3</span>Enter this room code</p>
        </div>
          <div className="room-code" aria-label={`Room code ${code?.split('').join(' ') ?? 'loading'}`}>
            {(code ?? '····').split('').map((ch, i) => <span className="code-tile" key={i} style={{ ['--i' as string]: i }}>{ch}</span>)}
          </div>
      </section>

      <section className="guests" aria-label="Players">
        <h2 className="section-title">Guests <span className="count-badge">{players.length} of 6</span></h2>
        <div className="seat-grid">
          {seats.map((p, i) => p ? (
            <div className="seat is-filled" key={p.id}>
              <Avatar player={p} size={124} />
              <span className="seat-name">{p.name}</span>
              {p.id === players[0]?.id && <span className="seat-tag">Host</span>}
            </div>
          ) : (
            <div className="seat is-empty" key={`e${i}`}>
              <div className="seat-ghost" aria-hidden="true">?</div>
              <span className="seat-name">Seat open</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lobby-controls">
        <div className="tone-toggle" role="radiogroup" aria-label="Tone" data-nav-group>
          <span className="tone-label">Tone</span>
          <button role="radio" aria-checked={tone === 'classic'} className={`tone-opt ${tone === 'classic' ? 'is-on' : ''}`} data-nav onClick={() => chooseTone('classic')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10l-1 6a4 4 0 0 1-8 0zM12 13v6M8 21h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span><b>Classic</b><small>A proper murder. No blood, all nerves.</small></span>
            {tone === 'classic' && <span className="tone-check" aria-hidden="true">✓</span>}
          </button>
          <button role="radio" aria-checked={tone === 'cozy'} className={`tone-opt ${tone === 'cozy' ? 'is-on' : ''}`} data-nav onClick={() => chooseTone('cozy')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h16v7H4zM4 13c0-3 3-4 8-4s8 1 8 4M12 9V5M12 5c-1-1 0-2 0-2s1 1 0 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span><b>Cozy</b><small>A stolen cake. Plenty of crumbs.</small></span>
            {tone === 'cozy' && <span className="tone-check" aria-hidden="true">✓</span>}
          </button>
        </div>
        <button className={`btn btn-primary btn-xl start-btn ${players.length < MIN_PLAYERS ? 'is-waiting' : ''}`} data-nav data-nav-autofocus onClick={start}>
          <span className="btn-ok" aria-hidden="true">OK</span>
          {players.length < MIN_PLAYERS ? `Need ${MIN_PLAYERS - players.length} more` : 'Open the case'}
        </button>
      </section>
      <Flourish className="lobby-flourish" />
      <Hints items={[['arrows', 'Move'], ['ok', 'Choose'], ['back', 'Leave']]} />
    </main>
  );
}
