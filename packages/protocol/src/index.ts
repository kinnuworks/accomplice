// Shared types for Accomplice. Engine, server, TV and phone all import from here.

export type Tone = 'classic' | 'cozy';
export type Phase = 'lobby' | 'briefing' | 'investigate' | 'accuse' | 'reveal' | 'results';
export type Role = 'detective' | 'accomplice';

// ---------- Case model (full, server-side only) ----------

export interface Room { id: string; name: string; x: number; y: number; w: number; h: number; adjacent: string[] }
export interface Slot { id: number; label: string } // e.g. { id: 0, label: '8:00 pm' }

export interface Suspect {
  id: string;
  name: string;
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
  text: string;            // card text (player facing)
  visibility: 'board' | 'private';
  round: 1 | 2 | 3;
  fact: Fact;              // what the solver learns from it
  key?: boolean;           // necessary for a unique answer
  holderPlayerSlot?: number; // for private clues: which player seat receives it (0..5)
}

export interface Lie { s: string; slot: number; claimedRoom: string; trueRoom: string; reason: 'guilt' | 'embarrassment' }

export interface Case {
  id: string;
  seed: number;
  tone: Tone;
  difficulty: 1 | 2 | 3;
  title: string;
  place: string;
  dateLine: string;
  intro: string;           // narrator paragraph
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

// ---------- Public views (safe to send) ----------

export interface PublicCase {
  id: string; tone: Tone; title: string; place: string; dateLine: string; intro: string;
  victim: { name: string; description: string };
  crime: { room: string; slot: number; what: string };
  rooms: Room[]; slots: Slot[];
  suspects: Omit<Suspect, 'alibi'>[] & { claimedAlibi?: Record<number, string> }[];
  items: Item[];
}

export interface Player { id: string; name: string; seat: number; connected: boolean; avatar: string; questionsLeft: number }

export interface Utterance {
  id: string;
  speaker: string;         // suspect id | 'narrator' | player id
  speakerName: string;
  text: string;
  audioUrl?: string;
  at: number;
  askedBy?: string;        // player id who asked
  question?: string;
}

export interface BoardState {
  revealed: string[];      // clue ids on the board
  pinned: string[];        // clue ids pinned by the room
  links: [string, string][]; // string links between pinned clue ids
  lastVerdict?: { theory: Theory; verdict: TheoryVerdict; at: number };
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
  reveal?: { culprit: string; accomplice: string | null; item: string; steps: ProofStep[]; scores: Record<string, number> };
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
}

// ---------- Messages ----------

export type ClientToServer =
  | { t: 'tv:create'; tone?: Tone }
  | { t: 'tv:start' }
  | { t: 'tv:next' }                               // advance phase/round (host remote)
  | { t: 'tv:pin'; clueId: string }
  | { t: 'tv:unpin'; clueId: string }
  | { t: 'tv:link'; a: string; b: string }
  | { t: 'tv:proveIt'; theory: Theory }
  | { t: 'phone:join'; room: string; name: string; playerId?: string }
  | { t: 'phone:setTone'; tone: Tone }
  | { t: 'phone:start' }
  | { t: 'phone:ask'; suspectId: string; text: string; via: 'voice' | 'typed' }
  | { t: 'phone:notes'; text: string }
  | { t: 'phone:vote'; culprit: string; item?: string; accomplice?: string }
  | { t: 'phone:readClues' }
  | { t: 'ping' };

export type ServerToClient =
  | { t: 'room:state'; state: RoomState }
  | { t: 'you:state'; you: YouState }
  | { t: 'room:created'; code: string; joinUrl: string }
  | { t: 'utterance'; u: Utterance }               // play audio + caption
  | { t: 'sfx'; name: SfxName }
  | { t: 'announce'; text: string; audioUrl?: string } // narrator line, also for screen readers
  | { t: 'verdict'; theory: Theory; verdict: TheoryVerdict; explanation: string }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export type SfxName = 'join' | 'start' | 'cardFlip' | 'pin' | 'string' | 'thinking' | 'bell' | 'gavel' | 'reveal' | 'win' | 'lose' | 'tick';
