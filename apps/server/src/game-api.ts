// In-process API so other front ends (the MCP server for voice assistants) can drive a room.
import type { BoardState, Clue, PublicCase, RoomState, Theory, TheoryVerdict, Tone, Utterance } from '@accomplice/protocol';
import type { Hub } from './hub.js';
import { GameError, type Room } from './room.js';
import { narrate } from './tts.js';
import { cleanCaption, captionChunks } from './captions.js';

export interface SuspectInfo { id: string; name: string; role: string; motive: string; claimedAlibi: Record<number, string> }
export interface BoardView extends BoardState { clues: Clue[]; round: number; phase: RoomState['phase'] }
export interface AccuseResult { correct: boolean; culprit: { id: string; name: string }; item: string; steps: { says: string; therefore: string }[]; verdictOnYourTheory: TheoryVerdict }

export interface GameApi {
  /** Create a room. A room driven only through the API needs no phones. */
  createRoom(opts?: { tone?: Tone; seed?: number }): { code: string; joinUrl: string };
  listRooms(): { code: string; phase: RoomState['phase']; players: number }[];
  /** Generate a verified case and move straight into round one. */
  startCase(code: string, opts?: { tone?: Tone; seed?: number }): Promise<PublicCase>;
  listSuspects(code: string): SuspectInfo[];
  /**
   * Ask a suspect a question. Resolves as soon as every sentence has passed the claim check (audio urls only when
   * already rendered); the room still voices and plays the answer in order. { wait: true } resolves after playback.
   */
  ask(code: string, suspectId: string, question: string, opts?: { wait?: boolean }): Promise<Utterance>;
  examineClue(code: string, clueId: string): Clue;
  board(code: string): BoardView;
  /** Reveal the next round of clues (or move to accusations after round three). */
  next(code: string): Promise<RoomState>;
  proveIt(code: string, theory: Theory): Promise<{ verdict: TheoryVerdict; explanation: string }>;
  accuse(code: string, theory: Theory): Promise<AccuseResult>;
  state(code: string): RoomState;
  /** One deduction step at most: points at a board clue and what it rules out. Never names the culprit. */
  hint(code: string): { text: string; clueId?: string; hintsLeft: number };
  /** The TV narrator's voice (ElevenLabs when configured, else Polly), cached. */
  narrate(text: string): Promise<{ audioUrl?: string; captionChunks?: string[] }>;
}

export function createGameApi(hub: Hub): GameApi {
  const room = (code: string): Room => {
    const r = hub.get(code);
    if (!r) throw new GameError(`No room with code ${code}.`);
    return r;
  };
  const hintsGiven = new Map<string, Set<string>>();
  return {
    createRoom(opts = {}) {
      const r = hub.createRoom(opts.tone ?? 'classic', { seed: opts.seed });
      return { code: r.code, joinUrl: hub.joinUrlFor(r.code) };
    },
    listRooms() { return [...hub.rooms.values()].map((r) => ({ code: r.code, phase: r.phase, players: r.players.length })); },
    async startCase(code, opts = {}) {
      const r = room(code);
      if (r.phase !== 'lobby') throw new GameError('A case is already running in that room.');
      // Voice turns must answer fast: return once the case is built and round one is open. Narration (briefing,
      // round text) keeps rendering and playing on any TV in the room; the practice question is skipped because
      // a voice assistant's questions are always for the real suspects.
      await r.start('api', { ...opts, waitForNarration: false });
      if ((r.phase as string) === 'briefing') void r.next('api', { skipTutorial: true }).catch(() => {});
      return r.pub!;
    },
    listSuspects(code) {
      const r = room(code);
      if (!r.case) throw new GameError('No case yet. Start one first.');
      return r.case.suspects.map((s) => ({ id: s.id, name: s.name, role: s.role, motive: s.motive, claimedAlibi: { ...s.alibi } }));
    },
    ask(code, suspectId, question, opts = {}) { return room(code).ask('api', resolveSuspect(room(code), suspectId), question, 'api', { early: !opts.wait }); },
    examineClue(code, clueId) {
      const r = room(code);
      const c = r.boardClues().find((x) => x.id === clueId);
      if (!c) throw new GameError('That clue is not on the board yet.');
      return c;
    },
    board(code) {
      const r = room(code);
      return { ...r.board, clues: r.boardClues(), round: r.round, phase: r.phase };
    },
    async next(code) { const r = room(code); await r.next('api'); return r.publicState(); },
    proveIt(code, theory) { const r = room(code); return r.proveIt({ ...theory, culprit: resolveSuspect(r, theory.culprit) }); },
    async accuse(code, theory) {
      const r = room(code);
      const c = r.case;
      if (!c) throw new GameError('No case yet.');
      const culprit = resolveSuspect(r, theory.culprit);
      const verdict = await r.evaluateRevealed(culprit, theory.item);
      const real = c.suspects.find((s) => s.id === c.truth.culprit)!;
      const correct = culprit === c.truth.culprit && (!theory.item || theory.item === c.crime.item);
      return {
        correct, culprit: { id: real.id, name: real.name }, item: c.items.find((i) => i.id === c.crime.item)!.name,
        steps: r.proof().map((s) => ({ says: s.says, therefore: s.therefore })), verdictOnYourTheory: verdict,
      };
    },
    state(code) { return room(code).publicState(); },
    hint(code) {
      const r = room(code);
      const c = r.case;
      if (!c) throw new GameError('No case yet. Start one first.');
      // Only elimination steps whose clue is already on the board: a nudge, never the answer.
      const steps = r.proof().filter((st) => st.eliminates?.length && r.board.revealed.includes(st.clueId) && !r.board.pinned.includes(st.clueId));
      const used = hintsGiven.get(code) ?? new Set<string>();
      const next = steps.find((st) => !used.has(st.clueId));
      const time = c.slots.find((s) => s.id === c.crime.slot)?.label;
      if (!next) {
        return steps.length
          ? { text: 'You have what you need on the board. Pin the clues that clear people, then try Prove it.', hintsLeft: 0 }
          : { text: `Ask each suspect where they were at ${time}. Their answers and the board will start ruling people out.`, hintsLeft: 0 };
      }
      used.add(next.clueId); hintsGiven.set(code, used);
      const clue = c.clues.find((x) => x.id === next.clueId)!;
      return { text: `Look at "${clue.title}". ${next.therefore}`, clueId: clue.id, hintsLeft: steps.filter((st) => !used.has(st.clueId)).length };
    },
    async narrate(text) {
      const caption = cleanCaption(text);
      const sp = await narrate(caption, 'narrator');
      return { audioUrl: sp.audioUrl, captionChunks: captionChunks(caption) };
    },
  };
}

/** Accept an id or a spoken name ("the colonel", "Hask"). */
function resolveSuspect(r: Room, idOrName: string): string {
  const c = r.case;
  if (!c) throw new GameError('No case yet.');
  const q = String(idOrName ?? '').toLowerCase().trim();
  const hit = c.suspects.find((s) => s.id === q)
    ?? c.suspects.find((s) => s.name.toLowerCase() === q)
    ?? c.suspects.find((s) => s.name.toLowerCase().split(/\s+/).some((w) => w.length > 2 && q.includes(w)))
    ?? c.suspects.find((s) => q.includes(s.role.replace(/^the /, '').toLowerCase()));
  if (!hit) throw new GameError(`No suspect called ${idOrName}. Try one of: ${c.suspects.map((s) => s.name).join(', ')}.`);
  return hit.id;
}
