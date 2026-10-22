import type { BoardState, Clue, PublicCase, RoomState, Utterance, Theory, TheoryVerdict, WordMark } from '@accomplice/protocol';

export type { WordMark };
/** Utterance as the TV understands it. Without `marks` captions are paced by estimate. */
export type TvUtterance = Utterance;

/** Board clue as shown on the TV. The server may include these on the public case. */
export type BoardClue = Pick<Clue, 'id' | 'kind' | 'title' | 'text' | 'round'> & { key?: boolean; short?: string };

export type TvSuspect = PublicCase['suspects'][number] & { shortName?: string; claimedAlibi?: Record<number, string> };
export type TvCase = Omit<PublicCase, 'suspects'> & { suspects: TvSuspect[]; clues?: BoardClue[]; briefing?: string[] };
export interface Newspaper { paperName: string; headline: string; sub?: string; body?: string; date?: string; price?: string }
export type TvReveal = NonNullable<RoomState['reveal']> & { accompliceLine?: string; newspaper?: Newspaper };
/** Server events, including kinds newer than the shared types (objection, chime). */
export interface TvEvent { kind: 'blackout' | 'emergency' | 'smudge' | 'objection' | 'chime' | string; text: string; clueId?: string; suspectId?: string; count?: number; at: number }
export type TvRoomState = Omit<RoomState, 'case' | 'board' | 'reveal'> & {
  case: TvCase | null;
  reveal?: TvReveal;
  board: Omit<BoardState, 'cards'> & { cards?: BoardClue[] };
};

export interface VerdictEvent { theory: Theory; verdict: TheoryVerdict; explanation: string; at: number; proposalId?: string; by?: string }

/** A line to perform: suspect answer or narrator announcement. */
export interface Line {
  key: string;
  speaker: string;
  speakerName: string;
  text: string;
  audioUrl?: string;
  marks?: WordMark[];
  askedBy?: string;
  question?: string;
  narrator: boolean;
  /** Set for suspect utterances, so the TV can report when it finished playing. */
  utteranceId?: string;
  /** True for the last part of a streamed answer (or a whole answer). */
  final?: boolean;
  filler?: boolean;
  /** Caption screens from the server: each is up to two lines joined by \n. */
  chunks?: string[];
}

/** A theory a player proposed from their phone; the room votes before it is tested. */
export interface Proposal {
  id: string;
  by: string;
  byName: string;
  theory: Theory;
  agree: string[];
  notYet: string[];
  needed: number;
  closesAt: number;
  status: 'open' | 'testing' | 'done';
  at: number;
}

/** Short display name: the case may give one, otherwise drop the honorific. */
export function shortName(s: { name: string; shortName?: string }): string {
  if (s.shortName) return s.shortName;
  const parts = s.name.replace(/^(Dr|Mrs|Mr|Ms|Miss|Lady|Lord|Sir|Colonel|Captain|Uncle|Auntie|Madame|Professor)\.?\s+/, '').split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}
