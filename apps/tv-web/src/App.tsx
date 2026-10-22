import { useEffect, useLayoutEffect, useState } from 'react';
import type { Tone } from '@accomplice/protocol';
import { audio } from './audio/audio';
import { playPause, startDirector } from './audio/director';
import { Captions } from './components/Captions';
import { Confirm } from './components/Dialog';
import { DEMO, SCENE } from './env';
import { focus, useBack, useKeys } from './focus/focus';
import { startDemo } from './net/demo';
import { resetToTitle, send, setLink, setState, useTv } from './net/store';
import { connectServer } from './net/ws';
import { preloadPortraits } from './art/Portrait';
import { Title } from './screens/Title';
import { Lobby } from './screens/Lobby';
import { Briefing } from './screens/Briefing';
import { Investigate } from './screens/Investigate';
import { Accuse } from './screens/Accuse';
import { Reveal } from './screens/Reveal';
import { Results } from './screens/Results';

let booted = false;
let sceneActive = DEMO && !!SCENE && SCENE !== 'title';
function boot() {
  if (booted) return;
  booted = true;
  focus.start();
  startDirector();
  focus.onFirstKey = () => { audio.unlock(); audio.startBed(); };
  window.addEventListener('pointerdown', () => { audio.unlock(); audio.startBed(); }, { once: true });
  setLink(DEMO ? startDemo() : connectServer());
}

/** Lay out at 1920x1080 and scale to whatever the WebView reports. */
function useStageScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

export function App() {
  boot();
  const scale = useStageScale();
  const stage = useTv((s) => s.stage);
  const phase = useTv((s) => s.room?.phase ?? (s.code ? 'lobby' : null));
  const connected = useTv((s) => s.connected);
  const everConnected = useTv((s) => s.everConnected);
  const toasts = useTv((s) => s.toasts);
  const suspects = useTv((s) => s.room?.case?.suspects);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => { if (suspects) preloadPortraits(suspects); }, [suspects]);
  useEffect(() => { if (sceneActive) setState({ stage: 'game' }); }, []);

  useBack(() => { if (stage === 'game') setLeaving(true); }, true, -10);
  useKeys((k) => { if (k === 'playpause') { playPause(); return true; } return false; }, true, -10);

  const host = (tone: Tone) => {
    audio.play('start');
    setState({ stage: 'game' });
    if (sceneActive) return;
    send({ t: 'tv:create', tone });
  };
  const leave = () => {
    setLeaving(false);
    audio.stopVoice();
    resetToTitle();
    sceneActive = false;
    setLink(DEMO ? startDemo(false) : connectServer());
  };

  let screen = <Title onHost={host} />;
  if (stage === 'game') {
    switch (phase) {
      case 'briefing': screen = <Briefing />; break;
      case 'investigate': screen = <Investigate />; break;
      case 'accuse': screen = <Accuse />; break;
      case 'reveal': screen = <Reveal />; break;
      case 'results': screen = <Results onTitle={leave} />; break;
      default: screen = <Lobby />;
    }
  }

  return (
    <div className="viewport">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="bg-layer" aria-hidden="true" />
        <div className="screen-host" key={stage === 'game' ? phase ?? 'lobby' : 'title'}>{screen}</div>
        <Captions suppressSuspects={phase === 'investigate' && stage === 'game'} />
        <div className="toasts" aria-live="polite">
          {toasts.map((t) => <div className="toast" key={t.id}>{t.icon && <span className="toast-icon" aria-hidden="true">{t.icon}</span>}{t.text}</div>)}
        </div>
        {!DEMO && !connected && (
          <div className="conn-pill" role="status"><span className="conn-dot" aria-hidden="true" />{everConnected ? 'Lost the game server. Reconnecting...' : 'Looking for the game server...'}</div>
        )}
        {DEMO && <div className="demo-pill" aria-hidden="true">Demo</div>}
        <div className="grain" aria-hidden="true" />
        {leaving && (
          <Confirm
            title="Leave this game?"
            body="The case will close for everyone and the room code will stop working."
            yes="Leave the game"
            no="Keep playing"
            onYes={leave}
            onNo={() => setLeaving(false)}
          />
        )}
      </div>
    </div>
  );
}
