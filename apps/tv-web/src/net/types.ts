import type { BoardState, Clue, PublicCase, RoomState, Utterance, Theory, TheoryVerdict, WordMark } from '@accomplice/protocol';

export type { WordMark };
/** Utterance as the TV understands it. Without `marks` captions are paced by estimate. */
export type TvUtterance = Utterance;

/** Board clue as shown on the TV. The server may include these on the public case. */
export type BoardClue = Pick<Clue, 'id' | 'kind' | 'title' | 'text' | 'round'> & { key?: boolean };

export type TvCase = PublicCase & { clues?: BoardClue[] };
export type TvRoomState = Omit<RoomState, 'case' | 'board'> & {
  case: TvCase | null;
  board: Omit<BoardState, 'cards'> & { cards?: BoardClue[] };
};

export interface VerdictEvent { theory: Theory; verdict: TheoryVerdict; explanation: string; at: number }

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
}
