import { useSyncExternalStore } from 'react';
import type { ClientToServer, ServerToClient, SfxName } from '@accomplice/protocol';
import type { BoardClue, Line, Proposal, TvEvent, TvRoomState, TvUtterance, VerdictEvent } from './types';

export interface Link {
  send(msg: ClientToServer): void;
  close(): void;
}

export interface Toast { id: number; text: string; icon?: string }

export interface TvState {
  stage: 'title' | 'game';
  connected: boolean;
  everConnected: boolean;
  room: TvRoomState | null;
  code: string | null;
  joinUrl: string | null;
  verdict: VerdictEvent | null;
  /** Line currently being performed (audio + caption). */
  now: { line: Line; startedAt: number; durationMs: number } | null;
  /** Narration history, for the caption log. */
  lines: Line[];
  toasts: Toast[];
  error: string | null;
  proposal: Proposal | null;
  event: TvEvent | null;
  hunch: { utteranceId: string; lying: number; truth: number; at: number } | null;
}

type Listener = () => void;
type EventListener = (msg: ServerToClient) => void;

let state: TvState = {
  stage: 'title', connected: false, everConnected: false, room: null, code: null, joinUrl: null,
  verdict: null, now: null, lines: [], toasts: [], error: null, proposal: null, event: null, hunch: null,
};
const listeners = new Set<Listener>();
const eventListeners = new Set<EventListener>();
let link: Link | null = null;
let toastId = 1;

export function getState(): TvState { return state; }
export function setState(patch: Partial<TvState> | ((s: TvState) => Partial<TvState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}
export function subscribe(l: Listener): () => void { listeners.add(l); return () => listeners.delete(l); }
export function onServerEvent(l: EventListener): () => void { eventListeners.add(l); return () => eventListeners.delete(l); }

export function useTv<T>(sel: (s: TvState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

export function setLink(l: Link | null): void { link?.close(); link = l; }
export function send(msg: ClientToServer): void { link?.send(msg); }

export function toast(text: string, icon?: string, ms = 4200): void {
  const id = toastId++;
  setState((s) => ({ toasts: [...s.toasts.slice(-1), { id, text, icon }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/** Lines waiting to be performed; consumed by the director in App. */
export const lineQueue: Line[] = [];
export const sfxQueue: SfxName[] = [];

// Streamed answers arrive several times with the same id; queue each new part exactly once.
const queuedParts = new Map<string, Set<string>>();
function queueUtterance(u: TvUtterance): void {
  const base = { speaker: u.speaker, speakerName: u.speakerName, askedBy: u.askedBy, question: u.question, narrator: u.speaker === 'narrator', utteranceId: u.id, filler: u.filler };
  let seen = queuedParts.get(u.id);
  if (!seen) { seen = new Set(); queuedParts.set(u.id, seen); if (queuedParts.size > 200) queuedParts.delete(queuedParts.keys().next().value!); }
  if (u.parts?.length) {
    u.parts.forEach((p, i) => {
      if (seen!.has(p.id)) return;
      seen!.add(p.id);
      lineQueue.push({ ...base, key: `${u.id}:${p.id}`, text: p.text, audioUrl: p.audioUrl, marks: p.marks, chunks: p.captionChunks, final: u.partial === false && i === u.parts!.length - 1 });
    });
    if (u.partial === false && !lineQueue.some((l) => l.utteranceId === u.id && l.final)) {
      const last = [...lineQueue].reverse().find((l) => l.utteranceId === u.id);
      if (last) last.final = true;
    }
    return;
  }
  if (seen.has('whole')) return;
  seen.add('whole');
  lineQueue.push({ ...base, key: u.id, text: u.text, audioUrl: u.audioUrl, marks: u.marks, chunks: u.captionChunks, final: true });
}

let announceN = 0;
export function receive(msg: ServerToClient): void {
  switch (msg.t) {
    case 'room:state': {
      const room = msg.state as TvRoomState;
      setState((s) => ({ room, code: room.code, stage: 'game', verdict: room.phase === s.room?.phase ? s.verdict : null }));
      break;
    }
    case 'room:created':
      setState({ code: msg.code, joinUrl: msg.joinUrl, stage: 'game' });
      break;
    case 'utterance':
      queueUtterance(msg.u as TvUtterance);
      break;
    case 'announce':
      lineQueue.push({ key: msg.id ?? `a${announceN++}`, speaker: 'narrator', speakerName: 'Narrator', text: msg.text, audioUrl: msg.audioUrl, marks: msg.marks, chunks: msg.captionChunks, narrator: true });
      break;
    case 'verdict':
      setState((s) => ({
        proposal: null,
        verdict: { theory: msg.theory, verdict: msg.verdict, explanation: msg.explanation, at: Date.now(), proposalId: msg.proposalId ?? s.proposal?.id, by: s.proposal && (!msg.proposalId || msg.proposalId === s.proposal.id) ? s.proposal.by : undefined },
      }));
      break;
    case 'sfx':
      sfxQueue.push(msg.name);
      break;
    case 'error':
      setState({ error: msg.message });
      toast(msg.message, '!');
      break;
    case 'proposal':
      setState({ proposal: { id: msg.id, by: msg.by, byName: msg.byName, theory: { culprit: msg.culprit, item: msg.item }, agree: msg.votes.agree, notYet: msg.votes.notYet, needed: msg.needed, closesAt: msg.closesAt, status: msg.votes.agree.length >= msg.needed ? 'testing' : 'open', at: Date.now() } });
      sfxQueue.push('bell');
      break;
    case 'event':
      setState({ event: { ...(msg as Omit<TvEvent, 'at'>), at: Date.now() } });
      if (msg.kind === 'blackout') sfxQueue.push('thunder');
      if (msg.kind === 'smudge') { sfxQueue.push('smudge'); toast(msg.text || 'Someone smudged a clue!', '!', 4000); }
      break;
    case 'hunch':
      setState({ hunch: { utteranceId: msg.utteranceId, lying: msg.lying, truth: msg.truth, at: Date.now() } });
      break;
    case 'proposal:votes':
      setState((s) => (s.proposal?.id === msg.id ? { proposal: { ...s.proposal, agree: msg.agree, notYet: msg.notYet, needed: msg.needed, status: msg.agree.length >= msg.needed ? 'testing' : 'open' } } : {}));
      sfxQueue.push('tick');
      break;
    default:
      break;
  }
  eventListeners.forEach((l) => l(msg));
}

export function resetToTitle(): void {
  setLink(null);
  lineQueue.length = 0;
  setState({ stage: 'title', room: null, code: null, joinUrl: null, verdict: null, now: null, lines: [], connected: false, proposal: null, event: null, hunch: null });
}

/** Clue text for a board id, from whichever field the server provides. */
export function clueById(room: TvRoomState | null, id: string): BoardClue | undefined {
  if (!room) return undefined;
  return room.board.cards?.find((c) => c.id === id) ?? room.case?.clues?.find((c) => c.id === id);
}
