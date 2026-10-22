import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { ClientToServer, Player, RoomState, ServerToClient, YouState } from '@accomplice/protocol';
import { connectSocket, type ConnStatus, type Transport } from './net';
import { createDemo, demoParams } from './demo';
import { announce } from './announce';
import { cue, getPrefs, playUrl, setPrefs as storePrefs, speak, stopSpeaking, type Prefs } from './feedback';

export interface Profile {
  name: string;
  avatar: string;
}

interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

export interface Game {
  demo: boolean;
  status: ConnStatus;
  roomCode: string;
  room: RoomState | null;
  you: YouState | null;
  me: Player | null;
  profile: Profile | null;
  join(code: string, profile: Profile): void;
  resetJoin(): void;
  send(msg: ClientToServer | { t: string; [k: string]: unknown }): void;
  narration: string | null;
  lastReply: RoomState['transcript'][number] | null;
  toast: Toast | null;
  dismissToast(): void;
  readClues(): void;
  stopReading(): void;
  reading: boolean;
  newClueIds: string[];
  markCluesSeen(): void;
  prefs: Prefs;
  setPrefs(p: Prefs): void;
}

const Ctx = createContext<Game | null>(null);
export const useGame = () => {
  const g = useContext(Ctx);
  if (!g) throw new Error('useGame outside provider');
  return g;
};

const store = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
};

export const isDemo = () => new URLSearchParams(location.search).has('demo');

function initialCode() {
  const q = new URLSearchParams(location.search).get('room');
  return (q ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export function clueSpeech(you: YouState | null) {
  const clues = you?.privateClues ?? [];
  if (!clues.length) return 'You have no private clues yet. They arrive at the start of each round.';
  return (
    `You have ${clues.length} private ${clues.length === 1 ? 'clue' : 'clues'}. ` +
    clues.map((c, i) => `Clue ${i + 1}, ${c.title}. ${c.text}`).join(' ')
  );
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const [roomCode, setRoomCode] = useState(initialCode);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [you, setYou] = useState<YouState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (demo) return demoParams().at === 'join' ? null : { name: 'Ada', avatar: '🕯️' };
    const code = initialCode();
    // Coming back to a room you were already in (refresh, phone slept): rejoin quietly.
    return code && store.get<boolean>(`accomplice:joined:${code}`) ? store.get<Profile>('accomplice:profile') : null;
  });
  const [narration, setNarration] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<Game['lastReply']>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [reading, setReading] = useState(false);
  const [newClueIds, setNewClueIds] = useState<string[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(getPrefs);

  const transport = useRef<Transport | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const codeRef = useRef(roomCode);
  codeRef.current = roomCode;
  const youRef = useRef(you);
  youRef.current = you;
  const awaitingNarrator = useRef<number | null>(null);

  const showToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    setToast({ id: Date.now(), text, kind });
  }, []);

  const onMessage = useCallback(
    (m: ServerToClient) => {
      switch (m.t) {
        case 'room:state':
          setRoom(m.state);
          break;
        case 'you:state': {
          const prev = youRef.current;
          const fresh = m.you.privateClues.filter((c) => !prev?.privateClues.some((p) => p.id === c.id));
          if (prev && fresh.length) {
            setNewClueIds((ids) => [...ids, ...fresh.map((c) => c.id)]);
            cue.clue();
            announce(
              fresh.length === 1 ? `New private clue: ${fresh[0].title}.` : `${fresh.length} new private clues on your phone.`,
            );
          } else if (!prev) {
            setNewClueIds(m.you.privateClues.map((c) => c.id));
          }
          setYou(m.you);
          if (!demo) {
            store.set(`accomplice:pid:${codeRef.current}`, m.you.playerId);
            store.set(`accomplice:joined:${codeRef.current}`, true);
          }
          break;
        }
        case 'utterance': {
          const u = m.u;
          if (u.speaker === 'narrator') {
            setNarration(u.text);
            announce(u.text);
          } else {
            setLastReply(u);
            announce(`${u.speakerName} says: ${u.text}`);
            if (getPrefs().speakReplies) speak(`${u.speakerName}. ${u.text}`);
          }
          break;
        }
        case 'announce':
          if (awaitingNarrator.current !== null && m.audioUrl) {
            // The narrator is reading my clues to me.
            window.clearTimeout(awaitingNarrator.current);
            awaitingNarrator.current = null;
            setReading(true);
            void playUrl(m.audioUrl, () => setReading(false)).then((ok) => {
              if (!ok) {
                setReading(speak(clueSpeech(youRef.current), { onEnd: () => setReading(false) }));
              }
            });
            break;
          }
          setNarration(m.text);
          announce(m.text);
          break;
        case 'verdict':
          setNarration(m.explanation);
          announce(m.explanation);
          break;
        case 'error':
          cue.error();
          showToast(m.message, 'error');
          announce(m.message, 'assertive');
          break;
        default:
          break;
      }
    },
    [demo, showToast],
  );

  // Connect once we know the room and who we are.
  useEffect(() => {
    if (!profile || (!roomCode && !demo)) return;
    const handlers = {
      onMessage,
      onStatus: setStatus,
      onOpen: () => {
        const p = profileRef.current;
        if (!p) return;
        const pid = demo ? undefined : store.get<string>(`accomplice:pid:${codeRef.current}`) ?? undefined;
        // `avatar` rides along on join; servers that do not know it can ignore it.
        transport.current?.send({ t: 'phone:join', room: codeRef.current, name: p.name, playerId: pid, avatar: p.avatar });
      },
    };
    const t = demo
      ? createDemo(handlers)
      : connectSocket(roomCode, store.get<string>(`accomplice:pid:${roomCode}`) ?? undefined, handlers);
    transport.current = t;
    return () => {
      t.close();
      transport.current = null;
    };
    // Reconnect only when the room or identity changes, not on every name edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, profile !== null, demo]);

  const send = useCallback<Game['send']>((msg) => transport.current?.send(msg), []);

  const join = useCallback((code: string, p: Profile) => {
    store.set('accomplice:profile', p);
    setRoomCode(code);
    setProfile(p);
    if (transport.current) {
      const pid = store.get<string>(`accomplice:pid:${code}`) ?? undefined;
      transport.current.send({ t: 'phone:join', room: code, name: p.name, playerId: pid, avatar: p.avatar });
    }
    const url = new URL(location.href);
    url.searchParams.set('room', code);
    history.replaceState(null, '', url);
  }, []);

  const resetJoin = useCallback(() => {
    try {
      localStorage.removeItem(`accomplice:joined:${codeRef.current}`);
    } catch {
      /* ignore */
    }
    setProfile(null);
    setRoom(null);
    setYou(null);
  }, []);

  const readClues = useCallback(() => {
    stopSpeaking();
    // Ask the server narrator first. If no narrator audio comes back quickly, use the phone's own voice.
    if (!demo && transport.current && status === 'open') {
      transport.current.send({ t: 'phone:readClues' });
      setReading(true);
      awaitingNarrator.current = window.setTimeout(() => {
        awaitingNarrator.current = null;
        setReading(speak(clueSpeech(youRef.current), { onEnd: () => setReading(false) }));
      }, 1800);
      return;
    }
    const ok = speak(clueSpeech(youRef.current), { onEnd: () => setReading(false) });
    setReading(ok);
    if (!ok) showToast('This browser cannot read aloud. Your clues are listed below.', 'info');
  }, [demo, status, showToast]);

  const stopReading = useCallback(() => {
    if (awaitingNarrator.current !== null) window.clearTimeout(awaitingNarrator.current);
    awaitingNarrator.current = null;
    stopSpeaking();
    setReading(false);
  }, []);

  const me = useMemo(() => room?.players.find((p) => p.id === you?.playerId) ?? null, [room, you]);

  const value: Game = {
    demo,
    status,
    roomCode,
    room,
    you,
    me,
    profile,
    join,
    resetJoin,
    send,
    narration,
    lastReply,
    toast,
    dismissToast: () => setToast(null),
    readClues,
    stopReading,
    reading,
    newClueIds,
    markCluesSeen: () => setNewClueIds([]),
    prefs,
    setPrefs: (p) => {
      storePrefs(p);
      setPrefsState(p);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
