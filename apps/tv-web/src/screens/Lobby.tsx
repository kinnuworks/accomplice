import { useEffect, useRef, useState } from 'react';
import type { Tone } from '@accomplice/protocol';
import { Avatar } from '../art/Avatar';
import { FakeQr } from '../art/FakeQr';
import { audio } from '../audio/audio';
import { Hints } from '../components/Hints';
import { Emblem } from '../components/Ornament';
import { DEMO } from '../env';
import { send, useTv } from '../net/store';

const MIN_PLAYERS = 3;
const NO_PLAYERS: never[] = [];

/** "192.168.1.24:8787/p" from the server's join URL. Never shows a localhost address. */
function shortJoin(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    if (/^(localhost|127\.|\[::1\])/.test(u.hostname)) return null;
    return `${u.host}${u.pathname}`.replace(/\/$/, '');
  } catch { return null; }
}

/** The join address with line-break chances after each dot and before each slash (hyphens already allow one),
 *  so a long tunnel host wraps between its parts instead of running off the card or splitting a word. */
function BreakableUrl({ text }: { text: string }) {
  const parts = text.split(/(?<=\.)|(?=\/)/);
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && <wbr />}{p}</span>)}</>;
}

export function Lobby() {
  const code = useTv((s) => s.code ?? s.room?.code ?? null);
  const joinUrl = useTv((s) => s.joinUrl);
  const players = useTv((s) => s.room?.players ?? NO_PLAYERS);
  const serverTone = useTv((s) => s.room?.tone ?? 'classic');
  const [tone, setTone] = useState<Tone>(serverTone);
  const [qrFailed, setQrFailed] = useState(false);
  const [news, setNews] = useState<{ id: number; text: string }[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => setTone(serverTone), [serverTone]);

  const say = (text: string) => {
    const id = Date.now() + Math.random();
    setNews((n) => [...n.slice(-1), { id, text }]);
    setTimeout(() => setNews((n) => n.filter((x) => x.id !== id)), 3000);
  };

  // arrivals: a line in the news strip, a chair scrape, and a moment in the spotlight
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  useEffect(() => {
    for (const p of players) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      if (first.current) continue;
      say(`${p.name} pulled up a chair`);
      audio.play('chair');
      setFresh((f) => new Set(f).add(p.id));
      setTimeout(() => setFresh((f) => { const n = new Set(f); n.delete(p.id); return n; }), 1600);
    }
    first.current = false;
  }, [players]);

  const url = joinUrl ?? '';
  const shown = shortJoin(joinUrl);
  const qrSrc = `/api/qr?text=${encodeURIComponent(url)}`;
  const missing = Math.max(0, MIN_PLAYERS - players.length);

  const chooseTone = (t: Tone) => {
    setTone(t);
    audio.play('cardFlip');
    send({ t: 'tv:setTone', tone: t });
  };
  const start = () => {
    if (missing) { say(`Waiting for ${missing} more player${missing > 1 ? 's' : ''}`); audio.play('back'); return; }
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
          {DEMO || qrFailed || !url ? <FakeQr seed={code ?? 'MOTH'} /> : <img src={qrSrc} alt="Scan to join" onError={() => setQrFailed(true)} />}
        </div>
        <div className="join-text">
          <p className="join-step"><span className="step-num">1</span><span>Scan with your phone camera</span></p>
          {shown && <p className="join-step"><span className="step-num">2</span><span className="join-step-text">Or type this address<span className="join-url"><BreakableUrl text={shown} /></span></span></p>}
          <p className="join-step"><span className="step-num">{shown ? 3 : 2}</span><span>Enter this room code</span></p>
        </div>
        <div className="room-code" aria-label={`Room code ${code?.split('').join(' ') ?? 'loading'}`}>
          {(code ?? '····').split('').map((ch, i) => <span className="code-tile" key={i} style={{ ['--i' as string]: i }}>{ch}</span>)}
        </div>
      </section>

      <section className="guests" aria-label="Players">
        <h2 className="section-title">Guests <span className="count-badge">{players.length} of 6</span></h2>
        <div className="news-strip" aria-live="polite">
          {news.map((n) => <span className="news-item" key={n.id}><span className="news-dot" aria-hidden="true">+</span>{n.text}</span>)}
        </div>
        <div className="seat-grid">
          {seats.map((p, i) => p ? (
            <div className={`seat is-filled ${fresh.has(p.id) ? 'is-new' : ''}`} key={p.id}>
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
            <span><b>Classic</b><small>A proper murder. No blood.</small></span>
            {tone === 'classic' && <span className="tone-check" aria-hidden="true">✓</span>}
          </button>
          <button role="radio" aria-checked={tone === 'cozy'} className={`tone-opt ${tone === 'cozy' ? 'is-on' : ''}`} data-nav onClick={() => chooseTone('cozy')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h16v7H4zM4 13c0-3 3-4 8-4s8 1 8 4M12 9V5M12 5c-1-1 0-2 0-2s1 1 0 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span><b>Cozy</b><small>A stolen cake. Lots of crumbs.</small></span>
            {tone === 'cozy' && <span className="tone-check" aria-hidden="true">✓</span>}
          </button>
        </div>
        <button className={`btn btn-primary btn-xl start-btn ${missing ? 'is-disabled' : ''}`} aria-disabled={missing > 0} data-nav data-nav-autofocus onClick={start}>
          <span className="btn-ok" aria-hidden="true">OK</span>
          {missing ? `Need ${missing} more` : 'Open the case'}
        </button>
      </section>
      <Hints items={[['arrows', 'Move'], ['ok', 'Choose'], ['back', 'Menu']]} />
    </main>
  );
}
