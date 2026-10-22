import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { ClientToServer, Player, RoomState, ServerToClient, YouState } from '@accomplice/protocol';
import { connectSocket, type ConnStatus, type Transport } from './net';
import { createDemo, demoParams } from './demo';
import { announce } from './announce';
import { cue, getPrefs, playUrl, setPrefs as storePrefs, speak, stopSpeaking, type Prefs } from './feedback';
import { clueShort, shortName, type Proposal, type SuspectX } from './types';
import type { TheoryVerdict } from '@accomplice/protocol';

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
  /** "Test a theory": the open proposal, if any, and the latest verdict. */
  proposal: Proposal | null;
  hunchResult: { utteranceId: string; lying: number; truth: number } | null;
  /** Accomplice only: someone just named the culprit. */
  heartbeat: number;
  /** "Ten o'clock. Round 2." */
  chime: string | null;
  verdict: { verdict: TheoryVerdict; explanation: string; culprit: string; item?: string; at: number } | null;
  dismissVerdict(): void;
  /** The earbud check before anything secret is read out loud. */
  earbudOpen: boolean;
  answerEarbud(ok: boolean): void;
  speakSecret(text: string): Promise<void>;
  lastAsked: string | null;
  markAsked(suspectId: string): void;
}

const PHASE_SAY: Record<string, string> = {
  lobby: 'Back in the lobby.',
  briefing: 'The game has begun. Your secret role is ready.',
  investigate: 'The questions begin.',
  accuse: 'Time to accuse. Make your choice.',
  reveal: 'All votes are in. The truth is coming out.',
  results: 'Case closed. Your score is in.',
};

const VERDICT_SAY: Record<TheoryVerdict, string> = {
  follows: 'It follows',
  possible: 'Possible',
  contradicted: 'Contradicted',
};

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

const HOURS = ['Twelve', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
function hourWord(h: number) {
  return HOURS[((h % 12) + 12) % 12 || 12] ?? String(h);
}

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
    clues.map((c, i) => `Clue ${i + 1}, ${clueShort(c)}. ${c.text}`).join(' ')
  );
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const [roomCode, setRoomCode] = useState(initialCode);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [you, setYou] = useState<YouState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (demo) return demoParams().at === 'join' ? null : { name: 'Ada', avatar: 'owl' };
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
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [hunchResult, setHunchResult] = useState<Game['hunchResult']>(null);
  const [heartbeat, setHeartbeat] = useState(0);
  const [chime, setChime] = useState<string | null>(null);
  const chimedRound = useRef(0);
  const [verdict, setVerdict] = useState<Game['verdict']>(null);
  const [earbudOpen, setEarbudOpen] = useState(false);
  const earbudResolve = useRef<((ok: boolean) => void) | null>(null);
  const [lastAsked, setLastAsked] = useState<string | null>(() => store.get<string>('accomplice:lastAsked'));
  const roomRef = useRef<RoomState | null>(null);
  const askPending = useRef(false);
  const spokenIds = useRef(new Set<string>());

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
        case 'room:state': {
          const prev = roomRef.current;
          const next = m.state;
          roomRef.current = next;
          const myId = youRef.current?.playerId;
          const mine = next.players.find((p) => p.id === myId);
          const left = mine?.questionsLeft ?? 0;
          const qs = `${left} ${left === 1 ? 'question' : 'questions'} left`;
          const say: string[] = [];
          if (prev && (prev.round !== next.round || prev.phase !== next.phase)) setVerdict(null); // old verdicts don't follow you into a new round
          if (prev) {
            const nameOf = (id: string) => (next.case?.suspects as SuspectX[] | undefined)?.find((s) => s.id === id)?.name ?? 'A suspect';
            if (next.phase !== prev.phase && next.phase !== 'investigate') {
              cue.phase();
              say.push(PHASE_SAY[next.phase] ?? '');
            }
            if (next.phase === 'investigate' && (prev.phase !== 'investigate' || prev.round !== next.round)) {
              cue.turn();
              const hour = next.case?.clockChimes?.[next.round - 1];
              const line = hour ? `${hourWord(hour)} o'clock. Round ${next.round}.` : `Round ${next.round} of 3.`;
              if (hour) {
                setChime(line);
                chimedRound.current = next.round;
              }
              say.push(`${line} It's your turn to ask. ${qs}.`);
            }
            if (next.speaking && next.speaking !== prev.speaking) {
              cue.nudge();
              say.push(`${nameOf(next.speaking)} is speaking.`);
            }
            if (!next.speaking && prev.speaking && askPending.current && next.phase === 'investigate' && next.round === prev.round) {
              askPending.current = false;
              if (left > 0) {
                cue.turn();
                say.push(`It's your turn to ask. ${qs}.`);
              }
            }
          }
          if (prev) {
            const hunchOpen = next.hunch && next.hunch.utteranceId !== prev.hunch?.utteranceId;
            const canHunch = left === 0 || youRef.current?.audience;
            if (hunchOpen && canHunch && next.phase === 'investigate') {
              cue.nudge();
              say.push('Lying or truthful? Cast your hunch on that answer.');
            }
            const em = next.emergency;
            if (em && em.stage !== prev.emergency?.stage) {
              const sus = (id?: string) => (next.case?.suspects as SuspectX[] | undefined)?.find((s) => s.id === id);
              if (em.stage === 'vote') say.push('Blackout! Vote for the suspect who must answer one extra question.');
              if (em.stage === 'ask') {
                const s = sus(em.suspectId);
                const who = s ? shortName(s) : 'the suspect';
                say.push(em.askedBy === myId ? `You won the race. You get a free question to ${who}. Hold to ask.` : `A free question goes to ${who}.`);
                if (em.askedBy === myId) cue.turn();
              }
            }
          }
          if (say.length) announce(say.filter(Boolean).join(' '));
          setRoom(next);
          break;
        }
        case 'you:state': {
          const prev = youRef.current;
          youRef.current = m.you; // two quick updates must not count the same clue twice
          const fresh = m.you.privateClues.filter((c) => !prev?.privateClues.some((p) => p.id === c.id));
          const have = new Set(m.you.privateClues.map((c) => c.id));
          if (prev && fresh.length) {
            setNewClueIds((ids) => [...new Set([...ids, ...fresh.map((c) => c.id)])].filter((id) => have.has(id)));
            cue.clue();
            announce(
              fresh.length === 1 ? `New clue: ${clueShort(fresh[0])}.` : `${fresh.length} new clues on your phone.`,
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
          if (u.filler) break; // "Hmm." while they think: TV only
          if (u.speaker !== 'narrator') setLastReply(u);
          // Streaming answers arrive in pieces; speak each answer once, when it is complete.
          if (u.partial || spokenIds.current.has(u.id)) break;
          spokenIds.current.add(u.id);
          if (u.speaker === 'narrator') {
            setNarration(u.text);
            announce(u.text);
          } else {
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
        case 'verdict': {
          cue.locked();
          const name = (roomRef.current?.case?.suspects ?? []).find((s) => s.id === m.theory.culprit)?.name ?? 'That theory';
          if (m.proposalId) setProposal((cur) => (cur && cur.id === m.proposalId ? null : cur));
          setVerdict({ verdict: m.verdict, explanation: m.explanation, culprit: m.theory.culprit, item: m.theory.item, at: Date.now() });
          announce(`Verdict on ${name}: ${VERDICT_SAY[m.verdict]}. ${m.explanation}`, 'assertive');
          break;
        }
        case 'error':
          cue.error();
          showToast(m.message, 'error');
          announce(m.message, 'assertive');
          break;
        case 'proposal': {
          const myId = youRef.current?.playerId;
          const p: Proposal = {
            id: m.id,
            by: m.by,
            byName: m.byName,
            culprit: m.culprit,
            item: m.item,
            agree: m.votes.agree.length,
            needed: m.needed,
            myVote: myId && m.votes.agree.includes(myId) ? true : myId && m.votes.notYet.includes(myId) ? false : null,
            status: m.votes.agree.length >= m.needed ? 'testing' : 'open',
            closesAt: m.closesAt,
          };
          setProposal(p);
          if (p.by !== myId && p.myVote === null) {
            const c = roomRef.current?.case;
            const s = (c?.suspects as SuspectX[] | undefined)?.find((v) => v.id === p.culprit);
            const it = c?.items.find((i) => i.id === p.item);
            cue.nudge();
            announce(`${p.byName ?? 'A player'} wants to test a theory: ${s ? shortName(s) : 'a suspect'}${it ? ` with the ${it.name}` : ''}. Agree, or not yet?`);
          }
          break;
        }
        case 'proposal:votes': {
          const myId = youRef.current?.playerId;
          setProposal((cur) =>
            cur && cur.id === m.id
              ? {
                  ...cur,
                  agree: m.agree.length,
                  needed: m.needed,
                  myVote: myId && m.agree.includes(myId) ? true : myId && m.notYet.includes(myId) ? false : null,
                  status: m.agree.length >= m.needed ? 'testing' : 'open',
                }
              : cur,
          );
          break;
        }
        case 'event':
          if (m.kind === 'chime') {
            setChime(m.text);
            if (chimedRound.current === roomRef.current?.round) break; // already said with the round change
            announce(m.text);
            break;
          }
          if (m.kind === 'coldOpen' || m.kind === 'titleCard') {
            setNarration(m.text);
            break;
          }
          if (m.kind === 'blackout') cue.crack();
          else if (m.kind === 'objection') cue.thud();
          else cue.phase();
          setNarration(m.text);
          announce(m.text, 'assertive');
          break;
        case 'haptic':
          if (youRef.current?.role === 'accomplice' && m.pattern === 'heartbeat') {
            // Sound only for someone who is listening privately; never a live region.
            cue.heartbeat(getPrefs().quietHeartbeat);
            setHeartbeat(Date.now());
          }
          break;
        case 'hunch':
          setHunchResult({ utteranceId: m.utteranceId, lying: m.lying, truth: m.truth });
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

  const askEarbud = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        earbudResolve.current = resolve;
        setEarbudOpen(true);
      }),
    [],
  );
  const answerEarbud = useCallback((ok: boolean) => {
    setEarbudOpen(false);
    if (ok && !getPrefs().quietHeartbeat && youRef.current?.role === 'accomplice') {
      // They have an earbud in: the heartbeat can be heard privately from now on.
      const next = { ...getPrefs(), quietHeartbeat: true };
      storePrefs(next);
      setPrefsState(next);
    }
    earbudResolve.current?.(ok);
    earbudResolve.current = null;
  }, []);

  const speakSecret = useCallback(
    async (text: string) => {
      if (!(await askEarbud())) return;
      setReading(speak(text, { onEnd: () => setReading(false) }));
    },
    [askEarbud],
  );

  const readClues = useCallback(async () => {
    stopSpeaking();
    if (!(await askEarbud())) return;
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
  }, [demo, status, showToast, askEarbud]);

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
    proposal,
    hunchResult,
    heartbeat,
    chime,
    verdict,
    dismissVerdict: () => setVerdict(null),
    earbudOpen,
    answerEarbud,
    speakSecret,
    lastAsked,
    markAsked: (id) => {
      askPending.current = true;
      setLastAsked(id);
      store.set('accomplice:lastAsked', id);
    },
    prefs,
    setPrefs: (p) => {
      storePrefs(p);
      setPrefsState(p);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
