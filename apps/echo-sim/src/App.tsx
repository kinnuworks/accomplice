import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CallToolResult, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import { GameConnection, type ConnectionInfo, type TrafficEntry } from './mcp.ts';
import { route, HELP_TEXT } from './router.ts';
import { canListen, listen, speak, stopSpeaking, type ListenHandle } from './speech.ts';
import { AppFrame, type AppFrameHandle } from './AppFrame.tsx';
import { Drawer } from './Drawer.tsx';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Board { uri: string; html: string; csp?: { connectDomains?: string[]; resourceDomains?: string[] } }
interface UiMeta { resourceUri?: string; invoking?: string; invoked?: string }

const params = new URLSearchParams(location.search);
const HOUSEHOLD = params.get('household') ?? 'living-room';
const MCP_URL = new URL(params.get('mcp') ?? '/mcp', location.origin);
const SCREEN_W = 1280;
const SCREEN_H = 720;

function uiMetaOf(meta: unknown): UiMeta {
  const m = (meta ?? {}) as { ui?: UiMeta; 'ui/resourceUri'?: string };
  return { ...m.ui, resourceUri: m.ui?.resourceUri ?? m['ui/resourceUri'] };
}

function speechOf(r: CallToolResult): { text: string; audioUrl?: string } {
  const sc = (r.structuredContent ?? {}) as Record<string, any>;
  const text = sc.speech ?? r.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join(' ');
  const audioUrl = sc.audioUrl ?? sc.hint?.audioUrl ?? sc.result?.audioUrl ?? sc.case?.introAudioUrl;
  return { text, audioUrl };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

export function App() {
  const conn = useMemo(() => new GameConnection(MCP_URL, HOUSEHOLD), []);
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [connError, setConnError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [heard, setHeard] = useState('');
  const [caption, setCaption] = useState('');
  const [statusLine, setStatusLine] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [boardTool, setBoardTool] = useState('');
  const [elicit, setElicit] = useState<{ message: string; resolve: (r: ElicitResult) => void } | null>(null);
  const [drawer, setDrawer] = useState(params.get('drawer') !== '0');
  const [muted, setMuted] = useState(params.get('mute') === '1');
  const [typed, setTyped] = useState('');
  const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
  const [scale, setScale] = useState(0.6);

  const frame = useRef<AppFrameHandle | null>(null);
  const frameQueue = useRef<Array<(f: AppFrameHandle) => void>>([]);
  const toFrame = (fn: (f: AppFrameHandle) => void) => { if (frame.current) fn(frame.current); else frameQueue.current.push(fn); };
  const setFrame = useCallback((h: AppFrameHandle | null) => {
    frame.current = h;
    if (h) for (const fn of frameQueue.current.splice(0)) fn(h);
  }, []);
  const listening = useRef<ListenHandle | null>(null);
  const suspects = useRef<{ id: string; name: string; role: string }[]>([]);
  const pendingConfirm = useRef<{ culprit: string; item?: string } | null>(null);
  const elicitRef = useRef(elicit);
  elicitRef.current = elicit;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const now = useClock();

  // ---------- connection ----------
  useEffect(() => {
    const off = conn.log.subscribe(() => setTraffic(conn.log.entries));
    conn.connect().then(setInfo).catch((e: Error) => setConnError(e.message));
    return off;
  }, [conn]);

  // fit the 1280x720 screen into the available space
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const s = Math.min((width - 40) / (SCREEN_W + 48), (height - 40) / (SCREEN_H + 48));
      setScale(Math.max(0.25, Math.min(1.2, s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const say = useCallback(async (text: string, audioUrl?: string) => {
    setCaption(text);
    setStatus('speaking');
    await speak(text, audioUrl, mutedRef.current);
    setStatus((s) => (s === 'speaking' ? 'idle' : s));
  }, []);

  // ---------- tools ----------
  const ensureBoard = useCallback(async (toolName: string) => {
    const meta = uiMetaOf(conn.tool(toolName)?._meta);
    if (!meta.resourceUri) return meta;
    if (board?.uri !== meta.resourceUri) {
      const r = await conn.readResource(meta.resourceUri);
      const c = r.contents[0] as { text?: string; _meta?: { ui?: { csp?: Board['csp'] } } } | undefined;
      if (c?.text) setBoard({ uri: meta.resourceUri, html: c.text, csp: c._meta?.ui?.csp });
    }
    return meta;
  }, [conn, board]);

  const afterResult = useCallback((r: CallToolResult) => {
    const sc = (r.structuredContent ?? {}) as Record<string, any>;
    if (Array.isArray(sc.suspects)) suspects.current = sc.suspects;
    if (sc.suspect?.id && !suspects.current.some((s) => s.id === sc.suspect.id)) suspects.current = [...suspects.current, sc.suspect];
    pendingConfirm.current = sc.view === 'confirm' ? { culprit: sc.culprit, item: sc.itemId } : null;
  }, []);

  const runTool = useCallback(async (name: string, args: Record<string, unknown>, fromView = false): Promise<CallToolResult> => {
    stopSpeaking();
    setStatus('thinking');
    setBoardTool(name);
    const meta = await ensureBoard(name).catch(() => ({} as UiMeta));
    setStatusLine(meta.invoking ?? 'Working on it...');
    if (!fromView) toFrame((f) => f.sendInput(args));
    let result: CallToolResult;
    try {
      result = await conn.callTool(name, args, (s) => setStatusLine(s));
    } catch (e) {
      const msg = 'Sorry, the game is not answering right now.';
      setStatusLine('');
      void say(msg);
      result = { content: [{ type: 'text', text: msg }], isError: true, structuredContent: { view: 'notice', speech: msg } };
      if (!fromView) toFrame((f) => f.sendResult(result));
      console.error(e);
      return result;
    }
    setStatusLine(meta.invoked ?? '');
    afterResult(result);
    if (!fromView) toFrame((f) => f.sendResult(result));
    const { text, audioUrl } = speechOf(result);
    void say(text, audioUrl).then(() => {
      setStatusLine('');
      if (pendingConfirm.current) startListening();
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, ensureBoard, afterResult, say]);

  // ---------- elicitation (server asks us a question mid call) ----------
  useEffect(() => {
    conn.onElicit = ({ message }) => new Promise<ElicitResult>((resolve) => {
      setElicit({ message, resolve });
      setStatus('speaking');
      void speak(`${message} Say yes or no.`, undefined, mutedRef.current).then(() => startListening());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  const answerElicit = useCallback((yes: boolean) => {
    const e = elicitRef.current;
    if (!e) return;
    setElicit(null);
    setStatus('thinking');
    e.resolve(yes ? { action: 'accept', content: { confirm: true } } : { action: 'decline' });
  }, []);

  // ---------- utterances ----------
  const handleUtterance = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) { setStatus('idle'); return; }
    setHeard(text);
    const intent = route(text, { suspects: suspects.current });

    if (elicitRef.current) {
      if (intent.kind === 'yes') return answerElicit(true);
      if (intent.kind === 'no' || intent.kind === 'stop') return answerElicit(false);
      return void say('Please say yes or no.');
    }
    switch (intent.kind) {
      case 'yes':
        if (pendingConfirm.current) { const p = pendingConfirm.current; pendingConfirm.current = null; await runTool('accuse', { ...p, confirmed: true }); return; }
        return void say('Okay. What would you like to do?');
      case 'no':
        if (pendingConfirm.current) { pendingConfirm.current = null; return void say('No accusation made. Keep digging.'); }
        return void say('Okay.');
      case 'stop': stopSpeaking(); setStatus('idle'); setCaption(''); return;
      case 'help': return void say(HELP_TEXT);
      case 'unknown': return void say(`Sorry, I did not catch that. ${HELP_TEXT}`);
      case 'tool': await runTool(intent.tool, intent.args); return;
    }
  }, [answerElicit, runTool, say]);

  const startListening = useCallback(() => {
    stopSpeaking();
    listening.current?.cancel();
    setHeard('');
    setStatus('listening');
    const h = listen(
      (t) => setHeard(t),
      (t) => { listening.current = null; if (t) void handleUtterance(t); else setStatus('idle'); },
      (msg) => { listening.current = null; setStatus('idle'); setCaption(msg); inputRef.current?.focus(); },
    );
    if (!h) {
      // no speech recognition here: keep the light bar on and let them type
      inputRef.current?.focus();
      setTimeout(() => setStatus((s) => (s === 'listening' ? 'idle' : s)), 6000);
    }
    listening.current = h;
  }, [handleUtterance]);

  const wake = useCallback(() => {
    if (status === 'listening') { listening.current?.stop(); return; }
    startListening();
  }, [status, startListening]);

  // keyboard: Space wakes the device, backtick toggles the developer drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.code === 'Space' && !typing) { e.preventDefault(); wake(); }
      if (e.key === '`' && !typing) setDrawer((d) => !d);
      if (e.key === 'Escape') { stopSpeaking(); listening.current?.cancel(); setStatus('idle'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wake]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const t = typed;
    setTyped('');
    listening.current?.cancel();
    void handleUtterance(t);
  };

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const showCaption = status !== 'idle' || !!elicit;

  return (
    <div className={`app ${drawer ? 'with-drawer' : ''}`}>
      <div className="room" ref={stageRef}>
        <div className="device" style={{ width: (SCREEN_W + 48) * scale, height: (SCREEN_H + 48) * scale }}>
          <div className="bezel" style={{ transform: `scale(${scale})` }}>
            <span className="camera" aria-hidden="true" />
            <div className="screen" role="application" aria-label="Simulated smart display">
              {board ? (
                <AppFrame
                  ref={setFrame}
                  html={board.html}
                  csp={board.csp}
                  log={conn.log}
                  toolName={boardTool}
                  onCallTool={(name, args) => runTool(name, args, true)}
                  onReadResource={(uri) => conn.readResource(uri)}
                />
              ) : (
                <div className="home">
                  <div className="home-top">
                    <div className="home-time">{time}</div>
                    <div className="home-greet">{greeting}</div>
                  </div>
                  <div className="home-cards">
                    <button className="home-card" onClick={() => void handleUtterance('start a new case')}>
                      <span className="home-kicker">Accomplice</span>
                      <span className="home-title">A mystery for the whole room</span>
                      <span className="home-try">Try <q>Start a new case</q></span>
                    </button>
                    <button className="home-card alt" onClick={() => void handleUtterance('start a cozy case')}>
                      <span className="home-kicker">Family night</span>
                      <span className="home-title">Gentle, bloodless puzzles</span>
                      <span className="home-try">Try <q>Start a cozy case</q></span>
                    </button>
                  </div>
                  <div className="home-status">
                    {info ? `Accomplice add-on connected · ${info.tools.length} actions` : connError ? `Cannot reach the add-on: ${connError}` : 'Connecting to the Accomplice add-on...'}
                  </div>
                </div>
              )}

              {showCaption && (
                <div className={`caption ${status}`} aria-live="polite">
                  {heard && <div className="caption-heard">“{heard}”</div>}
                  {status === 'thinking' && statusLine && <div className="caption-status">{statusLine}</div>}
                  {status === 'listening' && !heard && <div className="caption-status">Listening...</div>}
                  {status === 'speaking' && caption && <div className="caption-text">{caption}</div>}
                </div>
              )}

              {elicit && (
                <div className="elicit" role="dialog" aria-modal="true" aria-label="Confirm">
                  <div className="elicit-card">
                    <div className="elicit-kicker">Accomplice is asking</div>
                    <div className="elicit-msg">{elicit.message}</div>
                    <div className="elicit-actions">
                      <button className="pill primary" onClick={() => answerElicit(true)}>Yes</button>
                      <button className="pill" onClick={() => answerElicit(false)}>Not yet</button>
                    </div>
                  </div>
                </div>
              )}

              <div className={`lightbar ${status}`} aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="controls">
          <div className="label">Simulated Alexa+ (Echo Show)</div>
          <div className="control-row">
            <button className={`mic ${status}`} onClick={wake} aria-label={status === 'listening' ? 'Stop listening' : 'Talk'}>
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
            </button>
            <form onSubmit={submitTyped} className="typed">
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={canListen() ? 'Press Space and speak, or type here' : 'Type what you would say'}
                aria-label="Type what you would say"
              />
              <button type="submit" className="pill primary">Say it</button>
            </form>
            <button className="pill" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? 'Sound off' : 'Sound on'}</button>
            <button className="pill" onClick={() => setDrawer((d) => !d)} aria-pressed={drawer}>Developer</button>
          </div>
          <div className="fineprint">An independent test page that acts as a real MCP client. Not an Amazon product.</div>
        </div>
      </div>
      {drawer && <Drawer info={info} error={connError} entries={traffic} onClose={() => setDrawer(false)} />}
    </div>
  );
}
