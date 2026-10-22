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
async function perform(line: Line): Promise<void> {
  busy = true;
  const startedAt = performance.now();
  const est = estimateMs(line);
  const h = audio.speak(line.audioUrl);
  let pausedFor = 0;
  clock = () => h.elapsed() ?? performance.now() - startedAt - pausedFor;
  setState({ now: { line, startedAt, durationMs: est } });
  const ok = await h.done;
  const played = performance.now() - startedAt;
  if (!ok && played < est) await wait(est - played);
  if (ok) { const d = h.duration(); if (d) clock = () => d; }
  if (line.utteranceId) send({ t: 'tv:spoken', id: line.utteranceId });
  await wait(1100);
  last = line;
  setState((s) => ({ now: null, lines: [...s.lines.slice(-40), line] }));
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
