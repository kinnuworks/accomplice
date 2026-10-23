import { useEffect, useLayoutEffect, useState } from 'react';
import type { Tone } from '@accomplice/protocol';
import { audio, type Bed } from './audio/audio';
import { playPause, startDirector } from './audio/director';
import { Captions } from './components/Captions';
import { StageFx } from './components/StageFx';
import { Confirm, Dialog } from './components/Dialog';
import { BADGE, DEMO, SCENE } from './env';
import { focus, useBack, useKeys } from './focus/focus';
import { startDemo } from './net/demo';
import { resetToTitle, send, setLink, setState, useTv } from './net/store';
import { connectServer } from './net/ws';
import { preloadPortraits } from './art/Portrait';
import { getSettings, setSettings, useSettings, type Settings } from './settings';
import { Title } from './screens/Title';
import { Lobby } from './screens/Lobby';
import { Briefing } from './screens/Briefing';
import { Tutorial } from './screens/Tutorial';
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
  const s = getSettings();
  audio.setLevels(s.voice, s.music, s.effects);
  const wake = () => { audio.unlock(); const st = getSettings(); audio.setLevels(st.voice, st.music, st.effects); };
  focus.onFirstKey = wake;
  window.addEventListener('pointerdown', wake, { once: true });
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

const BEDS: Record<string, Bed> = { title: 'theme', lobby: 'theme', briefing: 'ambient', tutorial: 'theme', investigate: 'investigate', accuse: 'ambient', reveal: 'ambient', results: 'finale' };

export function App() {
  boot();
  const scale = useStageScale();
  const stage = useTv((s) => s.stage);
  const phase = useTv((s) => s.room?.phase ?? (s.code ? 'lobby' : null));
  const connected = useTv((s) => s.connected);
  const everConnected = useTv((s) => s.everConnected);
  const toasts = useTv((s) => s.toasts);
  const suspects = useTv((s) => s.room?.case?.suspects);
  const round = useTv((s) => s.room?.round ?? 0);
  const [menu, setMenu] = useState<null | 'menu' | 'settings' | 'leave' | 'next'>(SCENE === 'settings' ? 'settings' : null);
  const settings = useSettings();

  useEffect(() => { if (suspects) preloadPortraits(suspects); }, [suspects]);
  useEffect(() => { if (sceneActive) setState({ stage: 'game' }); }, []);
  useEffect(() => { audio.setLevels(settings.voice, settings.music, settings.effects); }, [settings.voice, settings.music, settings.effects]);
  const where = stage === 'game' ? phase ?? 'lobby' : 'title';
  useEffect(() => { audio.setBed(BEDS[where] ?? 'ambient'); }, [where]);

  useBack(() => setMenu('menu'), !menu, -10);
  // The server can move on by itself (everyone out of questions, round timer). A move-on confirm left open
  // from the round before must not fire again and skip a round or close the vote.
  useEffect(() => { setMenu((m) => (m === 'next' ? null : m)); }, [phase, round]);
  useKeys((k) => { if (k === 'playpause') { playPause(); return true; } return false; }, true, -10);

  const host = (tone: Tone) => {
    audio.play('start');
    setState({ stage: 'game' });
    if (sceneActive) return;
    send({ t: 'tv:create', tone });
  };
  const leave = () => {
    setMenu(null);
    audio.stopVoice();
    resetToTitle();
    sceneActive = false;
    setLink(DEMO ? startDemo(false) : connectServer());
  };

  let screen = <Title onHost={host} onSettings={() => setMenu('settings')} />;
  if (stage === 'game') {
    switch (phase) {
      case 'briefing': screen = <Briefing />; break;
      case 'tutorial': screen = <Tutorial />; break;
      case 'investigate': screen = <Investigate />; break;
      case 'accuse': screen = <Accuse />; break;
      case 'reveal': screen = <Reveal />; break;
      case 'results': screen = <Results onTitle={leave} />; break;
      default: screen = <Lobby />;
    }
  }
  const lobbyToasts = where === 'lobby';

  return (
    <div className="viewport">
      <div className={`stage at-${where} night-${where === 'investigate' || where === 'accuse' || where === 'reveal' ? Math.max(1, round) : 0}`} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="bg-layer" aria-hidden="true" />
        <div className="lightfx" aria-hidden="true" />
        <div className="screen-host" key={where}>{screen}</div>
        <StageFx />
        {/* suspects speak inside their own screen's panel; on the accusation, reveal and results screens a stray answer never draws over a title */}
        {/* the briefing captions every line in its own slot */}
        {where !== 'briefing' && <Captions suppressSuspects={where === 'investigate' || where === 'tutorial' || where === 'accuse' || where === 'reveal' || where === 'results'} />}
        {!lobbyToasts && (
          <div className="toasts" aria-live="polite">
            {toasts.map((t) => <div className="toast" key={t.id}>{t.icon && <span className="toast-icon" aria-hidden="true">{t.icon}</span>}{t.text}</div>)}
          </div>
        )}
        {!DEMO && !connected && (
          <div className="conn-pill" role="status"><span className="conn-dot" aria-hidden="true" />{everConnected ? 'Lost the game server. Reconnecting...' : 'Looking for the game server...'}</div>
        )}
        {DEMO && BADGE && <div className="demo-pill" aria-hidden="true">Demo</div>}
        <div className="grain" aria-hidden="true" />
        {menu === 'menu' && (
          <Dialog title={stage === 'game' ? 'Paused' : 'Menu'} onClose={() => setMenu(null)} className="dialog-pause">
            <div className="dialog-actions column">
              <button className="btn btn-primary" data-nav data-nav-autofocus onClick={() => setMenu(null)}>Keep playing</button>
              {where === 'investigate' && <button className="btn btn-ghost" data-nav onClick={() => setMenu('next')}>{round >= 3 ? 'Time to accuse' : `Move on to round ${round + 1}`}</button>}
              <button className="btn btn-ghost" data-nav onClick={() => setMenu('settings')}>Settings</button>
              {stage === 'game' && <button className="btn btn-ghost" data-nav onClick={() => setMenu('leave')}>Leave this game</button>}
            </div>
          </Dialog>
        )}
        {menu === 'settings' && <SettingsDialog s={settings} onClose={() => setMenu(stage === 'game' ? 'menu' : null)} />}
        {menu === 'next' && (
          <Confirm
            title={round >= 3 ? 'Time to accuse?' : `Move on to round ${round + 1}?`}
            body={round >= 3 ? 'No more questions. Everyone votes in secret on their phone.' : 'New clues go on the board. Any questions not asked yet are lost.'}
            yes={round >= 3 ? 'Start the vote' : 'Next round'} no="Not yet"
            onYes={() => { setMenu(null); send({ t: 'tv:next', from: { phase: phase ?? 'lobby', round } }); }} onNo={() => setMenu(null)}
          />
        )}
        {menu === 'leave' && (
          <Confirm title="Leave this game?" body="The case will close for everyone and the room code will stop working." yes="Leave the game" no="Keep playing" onYes={leave} onNo={() => setMenu(null)} />
        )}
      </div>
    </div>
  );
}

function cycle<T>(list: T[], v: T): T { return list[(list.indexOf(v) + 1) % list.length]; }
const LEVELS = [100, 80, 60, 40, 20, 0];

function SettingsDialog({ s, onClose }: { s: Settings; onClose: () => void }) {
  const row = (label: string, value: string, onClick: () => void, hint: string, auto = false) => (
    <button className="setting-row" data-nav data-nav-autofocus={auto ? '' : undefined} onClick={() => { onClick(); audio.play('tick'); }} aria-label={`${label}: ${value}. ${hint}`}>
      <span className="setting-label">{label}<small>{hint}</small></span>
      <span className="setting-value">{value}</span>
    </button>
  );
  return (
    <Dialog title="Settings" onClose={onClose} className="dialog-settings">
      <div className="settings-grid">
        <div className="settings-col" data-nav-group>
          <h3 className="settings-head">Seeing</h3>
          {row('Reduce motion', s.reduceMotion ? 'On' : 'Off', () => setSettings({ reduceMotion: !s.reduceMotion }), 'Stops light rays, stamp slams and drifting', true)}
          {row('Text size', `${s.textSize}%`, () => setSettings({ textSize: cycle([100, 125, 150] as const as unknown as (100 | 125 | 150)[], s.textSize) }), 'Captions and clue text')}
          {row('High contrast', s.highContrast ? 'On' : 'Off', () => setSettings({ highContrast: !s.highContrast }), 'Flat dark backgrounds, stronger outlines')}
          {row('Captions', s.captions === 'full' ? 'Full line' : 'Karaoke', () => setSettings({ captions: s.captions === 'full' ? 'karaoke' : 'full' }), 'Karaoke greys words not yet spoken')}
        </div>
        <div className="settings-col" data-nav-group>
          <h3 className="settings-head">Hearing</h3>
          {row('Voices', `${s.voice}%`, () => setSettings({ voice: cycle(LEVELS, s.voice) }), 'Suspects and narrator')}
          {row('Music', `${s.music}%`, () => setSettings({ music: cycle(LEVELS, s.music) }), 'Ducks under every voice')}
          {row('Effects', `${s.effects}%`, () => setSettings({ effects: cycle(LEVELS, s.effects) }), 'Pins, stamps, string')}
        </div>
      </div>
      <div className="dialog-actions"><button className="btn btn-primary" data-nav onClick={onClose}>Done</button></div>
    </Dialog>
  );
}
