import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CallToolResult, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import { GameConnection, type ConnectionInfo, type TrafficEntry } from './mcp.ts';
import { route, HELP_TEXT } from './router.ts';
import { canListen, listen, speak, stopSpeaking, SpeechQueue, type ListenHandle } from './speech.ts';
import { askHost, SentenceSplitter } from './hostAgent.ts';
import { AppFrame, type AppFrameHandle } from './AppFrame.tsx';
import { Drawer } from './Drawer.tsx';
import { DEMO_SCRIPT } from './demoScript.ts';

type Status = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Board { uri: string; html: string; csp?: { connectDomains?: string[]; resourceDomains?: string[] } }
interface UiMeta { resourceUri?: string; invoking?: string; invoked?: string }

const params = new URLSearchParams(location.search);
const HOUSEHOLD = params.get('household') ?? 'living-room';
/** The Strands house host handles anything the instant router does not. ?agent=0 turns it off. */
const USE_AGENT = params.get('agent') !== '0';
const MCP_URL = new URL(params.get('mcp') ?? '/mcp', location.origin);
const SCREEN_W = 1280;
const SCREEN_H = 800; // Echo Show 8 and 15: 1280x800, Alexa root scale 1.667

function uiMetaOf(meta: unknown): UiMeta {
  const m = (meta ?? {}) as { ui?: UiMeta; 'ui/resourceUri'?: string };
  return { ...m.ui, resourceUri: m.ui?.resourceUri ?? m['ui/resourceUri'] };
}

function speechOf(r: CallToolResult): { text: string; audioUrl?: string } {
  const sc = (r.structuredContent ?? {}) as Record<string, any>;
  const text = sc.speech ?? r.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join(' ');
  // a suspect's own voice first, then the TV narrator's voice, then the device reads the text
  const audioUrl = sc.audioUrl ?? sc.hint?.audioUrl ?? sc.result?.audioUrl ?? sc.narrationUrl;
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
  const [theme, setTheme] = useState<'dark' | 'light'>(params.get('theme') === 'light' ? 'light' : 'dark');
  const [typed, setTyped] = useState('');
  const [traffic, setTraffic] = useState<TrafficEntry[]>([]);
  const [scale, setScale] = useState(0.6);
  const scripted = params.get('script') === '1';
  const [scriptStep, setScriptStep] = useState(0);

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
  const confirmFromAgent = useRef(false);
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

  // fit the 1280x800 screen into the available space
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
    confirmFromAgent.current = false;
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

  // ---------- the Strands house host (free-form speech) ----------
  const queue = useMemo(() => new SpeechQueue(() => mutedRef.current), []);
  useEffect(() => {
    queue.onStart = () => setStatus('speaking');
    queue.onIdle = () => {
      setStatus('idle');
      setStatusLine('');
      if (pendingConfirm.current) startListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue]);

  const runHost = useCallback(async (text: string): Promise<boolean> => {
    stopSpeaking();
    queue.clear();
    setStatus('thinking');
    setStatusLine('Thinking it over...');
    setCaption('');
    const t0 = performance.now();
    let firstWordMs: number | null = null;
    let spoken = '';
    const splitter = new SentenceSplitter();
    const sayLine = (line: string) => {
      if (firstWordMs === null) firstWordMs = Math.round(performance.now() - t0);
      spoken = `${spoken} ${line}`.trim();
      setCaption(spoken);
      queue.push(line);
    };
    conn.log.note('agent', 'out', 'host/turn', 'request', { utterance: text, household: HOUSEHOLD }, `"${text}"`);
    try {
      for await (const ev of askHost(text, HOUSEHOLD)) {
        if (ev.type === 'start') {
          conn.log.note('agent', 'in', 'agent/start', 'notification', ev, `Strands agent, model ${ev.model}`);
        } else if (ev.type === 'tool') {
          const meta = uiMetaOf(conn.tool(ev.name)?._meta);
          setStatusLine(meta.invoking ?? 'Working on it...');
          setBoardTool(ev.name);
          conn.log.note('agent', 'in', 'agent/tool_call', 'request', ev, `Strands agent called ${ev.name}(${JSON.stringify(ev.input)})`);
          await ensureBoard(ev.name).catch(() => {});
          toFrame((f) => f.sendInput(ev.input));
        } else if (ev.type === 'toolResult') {
          conn.log.note('agent', 'in', 'agent/tool_result', ev.ok ? 'response' : 'error', ev, `${ev.name}: ${ev.view ? `view ${ev.view}` : ev.ok ? 'ok' : 'failed'}, ${ev.ms} ms`);
          if (ev.structuredContent) {
            const r = { content: [{ type: 'text', text: ev.speech ?? '' }], structuredContent: ev.structuredContent, _meta: ev.meta } as CallToolResult;
            afterResult(r);
            confirmFromAgent.current = !!pendingConfirm.current;
            toFrame((f) => f.sendResult(r));
            // a suspect's own recorded voice plays before the host adds anything
            const clip = ev.structuredContent.audioUrl as string | undefined;
            if (clip) { if (firstWordMs === null) firstWordMs = Math.round(performance.now() - t0); queue.push('', clip); }
          }
        } else if (ev.type === 'text') {
          for (const line of splitter.push(ev.text)) sayLine(line);
        } else if (ev.type === 'done') {
          for (const line of splitter.flush()) sayLine(line);
          conn.log.note('agent', 'in', 'agent/done', 'response', { ...ev, deviceFirstWordMs: firstWordMs },
            `first word ${firstWordMs ?? '-'} ms on the device (agent ${ev.firstTextMs ?? '-'} ms), total ${ev.totalMs} ms, ${ev.toolCalls} tool call${ev.toolCalls === 1 ? '' : 's'}`);
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
    } catch (e) {
      conn.log.note('agent', 'in', 'agent/error', 'error', { message: String(e) }, String((e as Error).message ?? e));
      return false;
    }
    if (!queue.busy) { setStatus('idle'); setStatusLine(''); }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, queue, ensureBoard, afterResult]);

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
        // the agent asked the question, so the agent hears the answer and keeps its conversation whole
        if (pendingConfirm.current && confirmFromAgent.current && USE_AGENT) { pendingConfirm.current = null; confirmFromAgent.current = false; if (await runHost(text)) return; }
        if (pendingConfirm.current) { const p = pendingConfirm.current; pendingConfirm.current = null; await runTool('accuse', { ...p, confirmed: true }); return; }
        return void say('Okay. What would you like to do?');
      case 'no':
        if (pendingConfirm.current && confirmFromAgent.current && USE_AGENT) { pendingConfirm.current = null; confirmFromAgent.current = false; if (await runHost(text)) return; }
        if (pendingConfirm.current) { pendingConfirm.current = null; return void say('No accusation made. Keep digging.'); }
        return void say('Okay.');
      case 'stop': stopSpeaking(); setStatus('idle'); setCaption(''); return;
      case 'help': return void say(HELP_TEXT);
      case 'unknown':
        // anything the instant router cannot place goes to the Strands house host; offline, a friendly reprompt
        if (USE_AGENT && (await runHost(text))) return;
        return void say(`Sorry, I did not catch that. ${HELP_TEXT}`);
      case 'tool': await runTool(intent.tool, intent.args); return;
    }
  }, [answerElicit, runTool, say, runHost]);

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
      if (scripted && !typing && (e.key === 'ArrowRight' || e.key === 'n')) { e.preventDefault(); void nextScriptLine(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wake, scripted, scriptStep]);

  /** Scripted demo: type the next line into the box like a person would, then say it. */
  const nextScriptLine = async () => {
    const line = DEMO_SCRIPT[scriptStep];
    if (!line) return;
    setScriptStep((n) => n + 1);
    stopSpeaking();
    for (let i = 1; i <= line.length; i++) {
      setTyped(line.slice(0, i));
      await new Promise((r) => setTimeout(r, 28));
    }
    await new Promise((r) => setTimeout(r, 250));
    setTyped('');
    void handleUtterance(line);
  };

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
            <div className={`screen theme-${theme}`} role="application" aria-label="Simulated smart display">
              {board ? (
                <AppFrame
                  ref={setFrame}
                  html={board.html}
                  csp={board.csp}
                  log={conn.log}
                  theme={theme}
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
          <div className="label">Simulated Alexa+ (Echo Show 8 / 15, 1280x800)</div>
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
            <button className="pill" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label={`Switch the display to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? 'Dark' : 'Light'}</button>
            <button className="pill" onClick={() => setDrawer((d) => !d)} aria-pressed={drawer}>Developer</button>
          </div>
          {scripted && (
            <div className="script" aria-live="polite">
              Demo {Math.min(scriptStep, DEMO_SCRIPT.length)}/{DEMO_SCRIPT.length}
              {DEMO_SCRIPT[scriptStep] ? <> · next: <q>{DEMO_SCRIPT[scriptStep]}</q> (press →)</> : ' · done'}
            </div>
          )}
          <div className="fineprint">An independent test page that acts as a real MCP client. Not an Amazon product.</div>
        </div>
      </div>
      {drawer && <Drawer info={info} error={connError} entries={traffic} onClose={() => setDrawer(false)} />}
    </div>
  );
}
