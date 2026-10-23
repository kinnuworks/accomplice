// Performs spoken lines: plays the voice, ducks the music, drives the caption clock.
// Two channels share the speaker: suspect replies (and their "Hmm" fillers) always go first and cut a
// narrator line short; narrator lines wait their turn and are dropped if they have gone stale.
import { lineQueue, send, setState, sfxQueue, getState } from '../net/store';
import type { ClientToServer } from '@accomplice/protocol';
import type { Line } from '../net/types';
import { audio } from './audio';

const NARRATOR_STALE_MS = 8000;
const isReply = (l: Line) => !l.narrator;
/** Briefing slides are paced by the TV itself, so they never go stale. */
const neverStale = (l: Line) => l.key.startsWith('briefing:') || l.key.startsWith('confession:');
/** Grace for narration that arrives just before the room state that moves to its phase. */
const PHASE_GRACE_MS = 1500;
/**
 * True when the line was queued in an earlier phase than the one on screen (the lobby's "Scan the code"
 * during the briefing, a round's answer on the accusation screen). Its caption is hidden; narration is also cut.
 */
export function fromEarlierPhase(l: Line, phaseAt = getState().phaseAt): boolean {
  return !neverStale(l) && !!phaseAt && (l.queuedAt ?? phaseAt) < phaseAt - PHASE_GRACE_MS;
}

let clock: () => number = () => 0;
let last: Line | null = null;
/** Milliseconds into the current line. */
export const lineElapsed = () => clock();

export function estimateMs(line: Line): number {
  if (line.marks?.length) return line.marks[line.marks.length - 1].time + 700;
  const words = line.text.split(/\s+/).filter(Boolean);
  return 600 + words.reduce((t, w) => t + 150 + w.length * 52 + (/[.,!?]$/.test(w) ? 260 : 0), 0);
}

let current: Line | null = null;
let skip: (() => void) | null = null;
/** Cut the current line short (OK during the briefing, or a reply arriving over the narrator). */
export function skipLine(): void { audio.stopVoice(); skip?.(); }

/** Next line to play: the oldest reply if any, else the oldest fresh narrator line. */
function takeNext(): Line | null {
  const now = Date.now();
  // drop stale narration (it still lands in the caption history so nothing is lost)
  for (let i = lineQueue.length - 1; i >= 0; i--) {
    const l = lineQueue[i];
    if (l.narrator && !neverStale(l) && (now - (l.queuedAt ?? now) > NARRATOR_STALE_MS || fromEarlierPhase(l))) {
      lineQueue.splice(i, 1);
      setState((s) => ({ lines: [...s.lines.slice(-40), l] }));
    }
  }
  const r = lineQueue.findIndex(isReply);
  const i = r >= 0 ? r : lineQueue.length ? 0 : -1;
  return i >= 0 ? lineQueue.splice(i, 1)[0] : null;
}
const peekNext = (): Line | undefined => lineQueue.find(isReply) ?? lineQueue[0];

const startedReplies = new Set<string>();

async function perform(line: Line): Promise<void> {
  current = line;
  const startedAt = performance.now();
  const est = estimateMs(line);
  if (line.filler) audio.play('thinking');
  const h = audio.speak(line.audioUrl);
  // tell the server the room is hearing this answer now, so hunch and objection windows start here
  if (line.utteranceId && !line.narrator && !startedReplies.has(line.utteranceId)) {
    startedReplies.add(line.utteranceId);
    send({ t: 'tv:playing', id: line.utteranceId } as unknown as ClientToServer);
  }
  const nextUrl = peekNext()?.audioUrl;
  if (nextUrl) audio.preload([nextUrl]);
  clock = () => h.elapsed() ?? performance.now() - startedAt;
  setState({ now: { line, startedAt, durationMs: est } });
  const skipped = new Promise<'skip'>((r) => { skip = () => r('skip'); });
  const ok = await Promise.race([h.done, skipped]);
  const played = performance.now() - startedAt;
  if (ok === false && played < est) await Promise.race([wait(est - played), skipped]);
  skip = null;
  if (ok === true) { const d = h.duration(); if (d) clock = () => d; }
  if (line.utteranceId && line.final !== false) send({ t: 'tv:spoken', id: line.utteranceId });
  // parts of the same streamed answer flow straight on; a waiting reply goes straight on too
  const next = peekNext();
  const continues = !!next && next.utteranceId !== undefined && next.utteranceId === line.utteranceId;
  const replyWaiting = !!next && isReply(next);
  if (!continues && !replyWaiting && ok !== 'skip') await wait(line.filler ? 200 : 900);
  if (!line.filler) last = line;
  setState((s) => ({ now: continues ? s.now : null, lines: line.filler ? s.lines : [...s.lines.slice(-40), line] }));
  current = null;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startDirector(): void {
  setInterval(() => {
    while (sfxQueue.length) audio.play(sfxQueue.shift()!);
    // a reply never waits behind the narrator
    if (current?.narrator && !neverStale(current) && lineQueue.some(isReply)) skipLine();
    // the phase moved on: the old phase's narration stops (its caption is already hidden)
    else if (current?.narrator && fromEarlierPhase(current)) skipLine();
    if (!current) {
      const l = takeNext();
      if (l) void perform(l);
    }
  }, 50);
}

/** Play/Pause on the remote: pause the voice, or replay the last suspect line. */
export function playPause(): void {
  if (audio.togglePause()) return;
  if (!getState().now && last && !last.narrator) lineQueue.push({ ...last, key: `${last.key}-again`, utteranceId: undefined, queuedAt: Date.now() });
}
