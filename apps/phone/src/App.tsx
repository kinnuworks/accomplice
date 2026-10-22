import { useEffect, useState } from 'react';
import type React from 'react';
import { ConnectionBanner, Icon, ScreenHeading, SettingsDialog, Toast, avatarLabel } from './components';
import { LiveRegions } from './announce';
import { GameProvider, useGame } from './game';
import { demoParams } from './demo';
import { Join } from './screens/Join';
import { Lobby } from './screens/Lobby';
import { Briefing } from './screens/Role';
import { Investigate } from './screens/Investigate';
import { Accuse } from './screens/Accuse';
import { Reveal } from './screens/Reveal';

export function App() {
  return (
    <GameProvider>
      <Shell />
      <LiveRegions />
    </GameProvider>
  );
}

function Shell() {
  const g = useGame();
  const [settings, setSettings] = useState(false);
  const demoAt = g.demo ? demoParams().at : undefined;

  useEffect(() => {
    document.documentElement.classList.toggle('large-text', g.prefs.largeText);
  }, [g.prefs.largeText]);

  const phase = g.room?.phase;
  useEffect(() => {
    if (phase) document.title = `Accomplice: ${PHASE_TITLE[phase]}`;
  }, [phase]);

  let screen: React.ReactNode;
  let key = 'join';
  if (!g.profile) screen = <Join />;
  else if (!g.you || !g.room) {
    key = 'joining';
    screen = <Joining />;
  } else {
    key = g.room.phase;
    switch (g.room.phase) {
      case 'lobby':
        screen = <Lobby />;
        break;
      case 'briefing':
        screen = <Briefing startOpen={demoAt === 'role-peek'} />;
        break;
      case 'investigate':
        key = `investigate-${g.room.round}`;
        screen = <Investigate demoAt={demoAt} />;
        break;
      case 'accuse':
        screen = <Accuse demoAt={demoAt} />;
        break;
      default:
        screen = <Reveal />;
    }
  }

  return (
    <div className={`app phase-${phase ?? 'join'}${g.you?.role === 'accomplice' ? ' is-accomplice' : ''}`}>
      <header className={`topbar${g.room ? ' in-room' : ''}`}>
        <p className="brand">
          <span className="brand__seal" aria-hidden="true">
            A
          </span>
          <span className="brand__word">Accomplice</span>
        </p>
        {g.room && (
          <p className="topbar__room">
            <span className="sr-only">Room </span>
            {g.room.code}
          </p>
        )}
        {g.me && (
          <p className="topbar__me">
            <span role="img" aria-label={avatarLabel(g.me.avatar)}>
              {g.me.avatar}
            </span>
            <span className="topbar__name">{g.me.name}</span>
          </p>
        )}
        <button type="button" className="btn btn--icon" onClick={() => setSettings(true)} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </header>
      <ConnectionBanner />
      <main id="main" key={key}>
        {screen}
      </main>
      {g.demo && <DemoBar />}
      <Toast />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

const PHASE_TITLE: Record<string, string> = {
  lobby: 'Lobby',
  briefing: 'Your secret role',
  investigate: 'Investigate',
  accuse: 'Accuse',
  reveal: 'The reveal',
  results: 'Results',
};

function Joining() {
  const { roomCode, status, resetJoin } = useGame();
  return (
    <div className="screen center">
      <div className="marquee" aria-hidden="true">
        <span className="marquee__seal is-pulsing">A</span>
      </div>
      <ScreenHeading>Knocking on the door</ScreenHeading>
      <p className="lede" role="status">
        {status === 'reconnecting' ? `Still trying room ${roomCode}. Is the TV on?` : `Joining room ${roomCode}...`}
      </p>
      <button type="button" className="btn btn--ghost" onClick={resetJoin}>
        Change room or name
      </button>
    </div>
  );
}

function DemoBar() {
  const { send, room } = useGame();
  if (!room || room.phase === 'results') return null;
  return (
    <aside className="demobar" aria-label="Demo controls">
      <span>Demo mode. No TV needed.</span>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => send({ t: 'demo:next' })}>
        Skip ahead
      </button>
    </aside>
  );
}
