// The small surface the voice add-on needs from the game.
// apps/server implements this on top of its rooms; tests use createFakeGameApi().
// Every method may return a value or a Promise.

export type Tone = 'classic' | 'cozy';
export type Awaitable<T> = T | Promise<T>;

export interface NamedRef { id: string; name: string }

export interface CaseSummary {
  id: string;
  tone: Tone;
  title: string;            // "Murder at Marlow House"
  place: string;            // "Marlow House, a seaside manor"
  dateLine: string;         // "A stormy Saturday, 1931"
  intro: string;            // narrator paragraph, read aloud once
  victim: { name: string; description: string };
  crime: { room: string; time: string; what: string }; // what: "was struck down"
  items: NamedRef[];        // possible means, for accusations
  suspectCount: number;
  boardClueCount: number;
  phase?: string;           // lobby | briefing | investigate | accuse | reveal | results
  roomCode?: string;        // the TV room this case lives in, when there is one
  seed?: number;
  round?: number;
  solved?: boolean;
  introAudioUrl?: string;
}

export interface SuspectCard {
  id: string;
  name: string;             // "Mrs. Agatha Pike"
  role: string;             // "the cook"
  motive: string;           // one line
  portraitUrl?: string;
  claimedAlibi?: string;    // "Says she was in the kitchen all evening"
}

export interface SuspectReply {
  text: string;             // in-character answer, one or two spoken sentences
  audioUrl?: string;        // pre-rendered voice line, if the server has one
  suspectId?: string;
  suspectName?: string;
}

export interface ClueCard {
  id: string;
  title: string;            // "Flour on the stair"
  text: string;             // card text
  kind: 'physical' | 'document' | 'testimony';
  round?: number;
  imageUrl?: string;
}

export interface AccuseResult {
  correct: boolean;
  accused: NamedRef;
  item?: NamedRef | null;
  culprit: NamedRef;        // the real one (revealed after accusing)
  means?: NamedRef | null;
  explanation: string;      // short spoken wrap-up
  steps?: { says: string; therefore: string }[]; // proof chain for the reveal
  audioUrl?: string;
}

export interface Hint {
  text: string;             // reveals at most one deduction step
  clueId?: string;          // the clue the hint points at, if any
  audioUrl?: string;
  hintsLeft?: number;
}

export interface StartProgress { progress: number; total: number; message: string }

export interface StartOptions {
  onProgress?: (p: StartProgress) => void;
  /** Same seed, same case. Used for the case of the week. */
  seed?: number;
  signal?: AbortSignal;
}

export interface GameApi {
  /** Build and verify a fresh case. May take several seconds; report progress through opts.onProgress. */
  startCase(tone: Tone, opts?: StartOptions): Awaitable<CaseSummary>;
  /** The open case, or null when nothing has been started. */
  getCaseSummary(): Awaitable<CaseSummary | null>;
  listSuspects(): Awaitable<SuspectCard[]>;
  /** Ask a suspect out loud. Throws if the suspect id is unknown. */
  askSuspect(suspectId: string, question: string): Awaitable<SuspectReply>;
  examineClue(clueId: string): Awaitable<ClueCard>;
  listBoardClues(): Awaitable<ClueCard[]>;
  /** Commit an accusation. Ends the case. culprit and item are ids. */
  accuse(culprit: string, item?: string): Awaitable<AccuseResult>;
  /** One small nudge: never more than one deduction step. */
  hint(): Awaitable<Hint>;
  /** Optional: move to the next round and pin its clues. Without it, new clues arrive on their own. */
  nextRound?(): Awaitable<RoundResult>;
  /** Optional: reopen a case this household started earlier (maybe in another session or on the TV). Null when it is gone. */
  resumeCase?(ref: CaseRef): Awaitable<CaseSummary | null>;
  /** Optional: where the TV and phones can pick this case up. */
  handoff?(): Awaitable<Handoff>;
  /** Optional: the narrator's voice for a line, the same voice the TV uses. */
  narrate?(text: string): Awaitable<{ audioUrl?: string }>;
}

export interface CaseRef { caseId?: string; roomCode?: string; tone?: Tone; seed?: number; round?: number }

export interface Handoff {
  roomCode: string;
  tvPath: string;           // e.g. "/tv/?room=ABCD"
  joinPath: string;         // phones: "/p?room=ABCD"
  qrService?: string;       // a path that turns ?text=<url> into a QR code image, e.g. "/api/qr"
}

export interface RoundResult { round: number; phase?: string; newClues: ClueCard[] }

/** Either one GameApi, or a lookup that returns the game for a household. */
export type GameApiSource = GameApi | ((household: string) => Awaitable<GameApi>);
