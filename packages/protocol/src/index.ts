// Shared types for Accomplice. Engine, server, TV and phone all import from here.

export type Tone = 'classic' | 'cozy';
export type Phase = 'lobby' | 'briefing' | 'tutorial' | 'investigate' | 'accuse' | 'reveal' | 'results';
export type Role = 'detective' | 'accomplice';

// ---------- Case model (full, server-side only) ----------

export interface Room { id: string; name: string; x: number; y: number; w: number; h: number; adjacent: string[] }
export interface Slot { id: number; label: string } // e.g. { id: 0, label: '8:00 pm' }

export interface Suspect {
  id: string;
  name: string;
  shortName?: string;      // for tight spaces and speech: "Colonel Gage", "Dr Sen", "Freddie"
  role: string;            // "the cook"
  traits: string[];        // speaking style hints: ["clipped", "nervous laugh"]
  voiceId: string;         // TTS voice id
  portrait: string;        // asset key, e.g. "portraits/cook.webp"
  motive: string;          // one line shown on the board
  alibi: Record<number, string>; // what they CLAIM: slot -> roomId
}

export interface Item { id: string; name: string; homeRoom: string }

export type Fact =
  | { k: 'at'; s: string; room: string; slot: number }
  | { k: 'notAt'; s: string; room: string; slot: number }
  | { k: 'had'; s: string; item: string; slot: number }
  | { k: 'itemIn'; item: string; room: string; slot: number }
  | { k: 'saw'; a: string; b: string; room: string; slot: number };

export interface Clue {
  id: string;
  kind: 'physical' | 'document' | 'testimony';
  title: string;           // short card title
  short?: string;          // card face line, 12 words or fewer, readable at 3 m
  text: string;            // card text (player facing)
  visibility: 'board' | 'private';
  round: 1 | 2 | 3;
  fact: Fact;              // what the solver learns from it
  key?: boolean;           // necessary for a unique answer
  holderPlayerSlot?: number; // for private clues: which player seat receives it (0..5)
}

export interface Lie { s: string; slot: number; claimedRoom: string; trueRoom: string; reason: 'guilt' | 'embarrassment'; detail?: string } // detail: what they were really doing (embarrassment lies)

export interface Case {
  id: string;
  seed: number;
  tone: Tone;
  difficulty: 1 | 2 | 3;
  title: string;
  place: string;
  dateLine: string;
  intro: string;           // narrator paragraph
  scene?: string;          // scene art asset key, e.g. "scenes/ashby-hall.webp"
  briefing?: string[];     // 4 to 6 short narrator lines, one per briefing slide
  confession?: string[];   // 3 lines in the culprit's voice for the reveal: motive, method, parting shot
  headline?: { title: string; sub: string }; // newspaper front page; sub may contain {DETECTIVE}
  paperName?: string;      // e.g. "The Cotswold Gazette"
  clockChimes?: number[];  // hour chimes to play at the start of rounds 1, 2, 3
  victim: { name: string; description: string };
  crime: { room: string; slot: number; item: string; what: string }; // what: "was struck down" | "the cake vanished"
  rooms: Room[];
  slots: Slot[];
  suspects: Suspect[];
  items: Item[];
  truth: { position: Record<string, Record<number, string>>; culprit: string; holder: Record<number, string | null> };
  clues: Clue[];
  lies: Lie[];
}

export interface VerifyReport {
  ok: boolean;
  uniqueCulprit: boolean;
  culprit: string | null;
  keyClues: string[];
  solvableByRound: 1 | 2 | 3 | null;
  safeAccompliceLies: number;
  ms: number;
  notes: string[];
}

export interface SuspectSlice {
  suspect: Suspect;
  knows: string[];         // plain-language facts this suspect may state truthfully
  mustLie: string[];       // plain-language lies they must maintain
  mayNotReveal: string[];  // things they never say (e.g. the culprit if they don't know)
  otherSuspects: { id: string; name: string; role: string }[];
  setting: { title: string; place: string; dateLine: string; victim: string };
}

export interface Claim { kind: 'location'; s: string; room: string; slot: number } // extracted from a spoken reply
export interface ClaimCheck { ok: boolean; violations: string[] }

export interface Theory { culprit: string; item?: string }
export type TheoryVerdict = 'follows' | 'possible' | 'contradicted';

export interface ProofStep { clueId: string; says: string; therefore: string; eliminates?: string[] }

export interface AccompliceLie { text: string; fact: Fact }

/** Engine answer to an objection: a slip when the suspect was lying in that answer, else a retort. */
export interface ObjectionResult { wasLying: boolean; line: string; fact?: Fact; factText?: string }

export interface Newspaper {
  paperName: string; title: string; sub: string; date: string; culpritPortrait?: string;
  players: { id: string; name: string; score: number; role: Role | null; correct: boolean }[];
  imageUrl?: string;       // 1080x1350 PNG front page, shareable
}

// ---------- Public views (safe to send) ----------

export interface PublicCase {
  id: string; tone: Tone; title: string; place: string; dateLine: string; intro: string;
  scene?: string;
  briefing?: string[];
  paperName?: string;
  clockChimes?: number[];
  victim: { name: string; description: string };
  crime: { room: string; slot: number; what: string };
  rooms: Room[]; slots: Slot[];
  suspects: Omit<Suspect, 'alibi'>[] & { claimedAlibi?: Record<number, string> }[];
  items: Item[];
}

export interface Player { id: string; name: string; seat: number; connected: boolean; avatar: string; questionsLeft: number; lang?: Lang }

export interface Utterance {
  id: string;
  speaker: string;         // suspect id | 'narrator' | player id
  speakerName: string;
  text: string;
  audioUrl?: string;
  at: number;
  askedBy?: string;        // player id who asked
  question?: string;
  marks?: WordMark[];      // word timings for karaoke captions (ms from audio start)
  translated?: string;     // per-phone copy only: text in that player's language
  // Streaming answers: the same utterance id is sent again as each sentence is voiced. Play parts in order;
  // when partial is false the answer is complete. audioUrl/marks above mirror parts[0] for older clients.
  parts?: UtterancePart[];
  partial?: boolean;
  // Caption frames: each entry is one screen of at most 2 lines (joined by \n), each line <= 40 characters.
  // `text` is always the written form for captions; `speech` (announce only) is what the voice says when it differs.
  captionChunks?: string[];
  filler?: boolean;        // a short "Hmm." while the suspect thinks; play it, keep it out of the transcript
}

export interface UtterancePart { id: string; text: string; audioUrl?: string; marks?: WordMark[]; durationMs?: number; captionChunks?: string[] }

export interface WordMark { time: number; value: string; start?: number; end?: number }

export type Lang = 'en' | 'hi';

export interface BoardState {
  revealed: string[];      // clue ids on the board
  pinned: string[];        // clue ids pinned by the room
  links: [string, string][]; // string links between pinned clue ids
  lastVerdict?: { theory: Theory; verdict: TheoryVerdict; at: number };
  cards?: Clue[];
  smudged?: string[];      // clue ids the accomplice smudged this round: show the card blurred, text hidden          // card contents for revealed (and pinned) clues, so the TV can draw them
}

export interface RoomState {
  code: string;
  phase: Phase;
  round: 0 | 1 | 2 | 3;
  tone: Tone;
  players: Player[];
  hostId: string | null;
  case: PublicCase | null;
  board: BoardState;
  transcript: Utterance[]; // last 50
  speaking: string | null; // suspect id currently talking
  queue: { playerId: string; suspectId: string }[];
  votes: { count: number; needed: number };
  reveal?: { culprit: string; accomplice: string | null; item: string; steps: ProofStep[]; scores: Record<string, number>; accompliceCaught?: boolean; accompliceLine?: string;
    sabotage?: { by: string; byName: string; clueId: string; clueTitle: string; round: number; at: number }[];
    hunches?: { byPlayer: Record<string, { right: number; total: number }>; right: number; total: number };
    newspaper?: Newspaper;
  };
  house?: { id: 'house'; name: string; role: string; portrait?: string }; // non-suspect who answers the practice question
  emergency?: { stage: 'vote' | 'ask' | 'done'; closesAt: number; votes: Record<string, number>; voters: string[]; suspectId?: string; askedBy?: string };
  hunch?: { utteranceId: string; lying: number; truth: number; closesAt: number }; // open hunch vote on the last answer
  audience?: { id: string; name: string; connected: boolean }[];
  deadlineAt?: number;     // optional soft timer (always extendable)
}

export interface YouState {
  playerId: string;
  role: Role | null;
  privateClues: Clue[];
  knowsCulprit?: string;   // accomplice only
  safeLies?: AccompliceLie[];
  notes: string;
  vote?: { culprit: string; item?: string; accomplice?: string };
  lang?: Lang;
  audience?: boolean;      // joined beyond the player cap or late: hunch votes only
  tutorialQuestionUsed?: boolean;
  objectionUsed?: boolean;
  sabotage?: { available: boolean; options: string[] }; // accomplice only: board clues that are safe to smudge
}

// ---------- Messages ----------

export type ClientToServer =
  | { t: 'tv:create'; tone?: Tone }
  | { t: 'tv:start' }
  | { t: 'tv:setTone'; tone: Tone }
  | { t: 'tv:next'; from?: { phase: string; round: number } } // advance phase/round (host remote); `from` makes a stale press a no-op
  | { t: 'tv:pin'; clueId: string }
  | { t: 'tv:unpin'; clueId: string }
  | { t: 'tv:link'; a: string; b: string }
  | { t: 'tv:proveIt'; theory: Theory }
  | { t: 'phone:join'; room: string; name: string; playerId?: string; avatar?: string }
  | { t: 'phone:setTone'; tone: Tone }
  | { t: 'phone:start' }
  | { t: 'phone:ask'; suspectId: string; text: string; via: 'voice' | 'typed' }
  | { t: 'phone:notes'; text: string }
  | { t: 'phone:vote'; culprit: string; item?: string; accomplice?: string }
  | { t: 'phone:readClues' }
  | { t: 'phone:moreTime' }
  | { t: 'phone:propose'; culprit: string; item?: string }       // put a theory to the room
  | { t: 'phone:voteProposal'; proposalId: string; agree: boolean }
  | { t: 'phone:emergencyVote'; suspectId: string }   // blackout: choose who must answer one extra question
  | { t: 'phone:sabotage'; clueId: string }           // accomplice, once per game
  | { t: 'phone:hunch'; utteranceId: string; lying: boolean }
  | { t: 'phone:objection'; utteranceId: string }   // once per game, during or up to 6 s after that answer                         // push the soft timer back (never a hard limit)
  | { t: 'phone:setLang'; lang: Lang }
  | { t: 'tv:playing'; id: string }                 // TV actually started playing an utterance or part (windows start here)
  | { t: 'tv:spoken'; id: string }                 // TV finished playing an utterance (frees the queue early)
  | { t: 'ping' };

export type ServerToClient =
  | { t: 'room:state'; state: RoomState }
  | { t: 'you:state'; you: YouState }
  | { t: 'room:created'; code: string; joinUrl: string }
  | { t: 'utterance'; u: Utterance }               // play audio + caption
  | { t: 'sfx'; name: SfxName }
  | { t: 'announce'; text: string; speech?: string; captionChunks?: string[]; audioUrl?: string; marks?: WordMark[]; id?: string; translated?: string } // narrator line, also for screen readers
  | { t: 'verdict'; theory: Theory; verdict: TheoryVerdict; explanation: string; proposalId?: string }
  | { t: 'proposal'; id: string; by: string; byName: string; culprit: string; item?: string; votes: { agree: string[]; notYet: string[] }; needed: number; closesAt: number }
  | { t: 'proposal:votes'; id: string; agree: string[]; notYet: string[]; needed: number }
  | { t: 'event'; kind: 'blackout' | 'emergency' | 'smudge' | 'objection' | 'chime' | 'coldOpen' | 'titleCard'; text: string; clueId?: string; suspectId?: string; by?: string; byName?: string; hour?: number }
  | { t: 'haptic'; pattern: 'heartbeat' }            // accomplice phone only: someone named the culprit
  | { t: 'hunch'; utteranceId: string; lying: number; truth: number }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export type SfxName = 'join' | 'start' | 'cardFlip' | 'pin' | 'string' | 'thinking' | 'bell' | 'gavel' | 'reveal' | 'win' | 'lose' | 'tick' | 'thunder' | 'smudge' | 'rain' | 'sting' | 'chime';

// ---------- Speech input socket: /stt?room=CODE&pid=<playerId> ----------
// Client sends one JSON {t:'start'}, then binary frames of 16 kHz mono PCM16 (little endian), then {t:'stop'}.
// If start carries suspectId and autoAsk, the server submits the final transcript as a question itself.
export type SttClientMsg =
  | { t: 'start'; lang?: Lang; suspectId?: string; autoAsk?: boolean; sampleRate?: number }
  | { t: 'stop' }
  | { t: 'end' };                                  // same as stop: flush and send the final transcript

export type SttServerMsg =
  | { t: 'ready' }
  | { t: 'partial'; text: string }
  | { t: 'final'; text: string; final: string; raw?: string }   // final mirrors text; raw = before suspect-name correction
  | { t: 'asked'; suspectId: string; text: string }
  | { t: 'error'; message: string }
  | { t: 'closed' };
