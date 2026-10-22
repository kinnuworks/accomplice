// Performs queued lines one at a time: plays the voice, ducks the ambient bed, drives the caption clock.
import { lineQueue, send, setState, sfxQueue, getState } from '../net/store';
import type { Line } from '../net/types';
import { audio } from './audio';

let clock: () => number = () => 0;
let last: Line | null = null;
/** Milliseconds into the current line. */
export const lineElapsed = () => clock();

export function estimateMs(line: Line): number {
  if (line.marks?.length) return line.marks[line.marks.length - 1].time + 700;
  const words = line.text.split(/\s+/).filter(Boolean);
  return 600 + words.reduce((t, w) => t + 150 + w.length * 52 + (/[.,!?]$/.test(w) ? 260 : 0), 0);
}

let busy = false;
let skip: (() => void) | null = null;
/** Cut the current line short (OK during the briefing). */
export function skipLine(): void { audio.stopVoice(); skip?.(); }
async function perform(line: Line): Promise<void> {
  busy = true;
  const startedAt = performance.now();
  const est = estimateMs(line);
  if (line.filler) audio.play('thinking');
  const h = audio.speak(line.audioUrl);
  // warm the next part so streamed answers play back to back
  const nextUrl = lineQueue[0]?.audioUrl;
  if (nextUrl) audio.preload([nextUrl]);
  let pausedFor = 0;
  clock = () => h.elapsed() ?? performance.now() - startedAt - pausedFor;
  setState({ now: { line, startedAt, durationMs: est } });
  const skipped = new Promise<'skip'>((r) => { skip = () => r('skip'); });
  const ok = await Promise.race([h.done, skipped]);
  const played = performance.now() - startedAt;
  if (ok === false && played < est) await Promise.race([wait(est - played), skipped]);
  skip = null;
  if (ok === true) { const d = h.duration(); if (d) clock = () => d; }
  if (line.utteranceId && line.final !== false) send({ t: 'tv:spoken', id: line.utteranceId });
  // parts of the same streamed answer flow straight on; otherwise let the line breathe
  const next = lineQueue[0];
  const continues = !!next && next.utteranceId !== undefined && next.utteranceId === line.utteranceId;
  if (!continues) await wait(line.filler ? 200 : 1100);
  if (!line.filler) last = line;
  setState((s) => ({ now: continues ? s.now : null, lines: line.filler ? s.lines : [...s.lines.slice(-40), line] }));
  busy = false;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startDirector(): void {
  setInterval(() => {
    while (sfxQueue.length) audio.play(sfxQueue.shift()!);
    if (!busy && lineQueue.length) void perform(lineQueue.shift()!);
  }, 60);
}

/** Play/Pause on the remote: pause the voice, or replay the last suspect line. */
export function playPause(): void {
  if (audio.togglePause()) return;
  if (!getState().now && last && !last.narrator) lineQueue.push({ ...last, key: `${last.key}-again` });
}
