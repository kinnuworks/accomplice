// Adapts the game server's room based API (apps/server/src/game-api.ts) to the household GameApi this add-on uses.
// Each household gets its own room. If a household has none yet, it joins the room already running on the TV,
// so a voice assistant in the living room plays the same game as everyone else.

import type { CaseRef, CaseSummary, ClueCard, GameApi, Handoff, Hint, NamedRef, StartOptions, SuspectCard, Tone } from './types.ts';

// The parts of the server's API we rely on, kept structural so this package does not import the server.
interface RoomPublicCase {
  id: string; tone: Tone; title: string; place: string; dateLine: string; intro: string;
  victim: { name: string; description: string };
  crime: { room: string; slot: number; what: string };
  rooms: { id: string; name: string }[];
  slots: { id: number; label: string }[];
  suspects: { id: string; name: string; role: string; motive: string; portrait?: string }[];
  items: { id: string; name: string }[];
}
interface RoomClue { id: string; kind: 'physical' | 'document' | 'testimony'; title: string; text: string; round: number; key?: boolean }
export interface RoomGameApi {
  createRoom(opts?: { tone?: Tone; seed?: number }): { code: string; joinUrl: string };
  listRooms(): { code: string; phase: string; players: number }[];
  startCase(code: string, opts?: { tone?: Tone; seed?: number }): Promise<RoomPublicCase>;
  listSuspects(code: string): { id: string; name: string; role: string; motive: string; claimedAlibi: Record<number, string> }[];
  ask(code: string, suspectId: string, question: string): Promise<{ text: string; audioUrl?: string; speaker: string; speakerName: string }>;
  examineClue(code: string, clueId: string): RoomClue;
  board(code: string): { clues: RoomClue[]; round: number; phase: string };
  next?(code: string): Promise<unknown>;
  accuse(code: string, theory: { culprit: string; item?: string }): Promise<{ correct: boolean; culprit: { id: string; name: string }; item: string; steps: { says: string; therefore: string }[] }>;
  state(code: string): { phase: string; round: number; case: RoomPublicCase | null };
  /** Optional: the TV narrator's voice for a line. */
  narrate?(text: string): Promise<{ audioUrl?: string; captionChunks?: unknown }> | { audioUrl?: string; captionChunks?: unknown };
  /** Optional: one deduction step from the engine, never pointing at the culprit. */
  hint?(code: string): Promise<{ text: string; clueId?: string; hintsLeft?: number }> | { text: string; clueId?: string; hintsLeft?: number };
}

export function isRoomGameApi(x: unknown): x is RoomGameApi {
  const o = x as Record<string, unknown> | null;
  return !!o && typeof o.createRoom === 'function' && typeof o.board === 'function' && typeof o.ask === 'function' && typeof o.state === 'function';
}

const START_STEPS = ['Setting the scene', 'Placing the suspects', 'Hiding the clues', 'Checking there is exactly one answer'];

export interface RoomAdapterOptions {
  /** Join the room that is already running when a household has none. Default true. */
  joinRunningRoom?: boolean;
  /** Where the game server serves art, joined with a suspect's portrait key. Default "/tv/art/". */
  artBase?: string;
}

/** Returns a household lookup suitable for createMcpHandler. */
export function fromRoomApi(api: RoomGameApi, opts: RoomAdapterOptions = {}): (household: string) => GameApi {
  const roomOf = new Map<string, string>();
  const solved = new Set<string>();
  const hintIndex = new Map<string, number>();
  const seeds = new Map<string, number>();
  const joinUrls = new Map<string, string>();
  const games = new Map<string, GameApi>();

  const findRoom = (household: string): string | null => {
    const known = roomOf.get(household);
    const rooms = api.listRooms();
    if (known && rooms.some((r) => r.code === known)) return known;
    // a household id that is itself a room code ("ABCD") points straight at that room
    const asCode = household.toUpperCase();
    if (rooms.some((r) => r.code === asCode)) { roomOf.set(household, asCode); return asCode; }
    if (opts.joinRunningRoom ?? true) {
      const running = [...rooms].reverse().find((r) => r.phase !== 'lobby');
      if (running) { roomOf.set(household, running.code); return running.code; }
    }
    return null;
  };

  const summary = (code: string): CaseSummary | null => {
    const st = api.state(code);
    const c = st.case;
    if (!c) return null;
    const roomName = c.rooms.find((r) => r.id === c.crime.room)?.name ?? c.crime.room;
    const time = c.slots.find((s) => s.id === c.crime.slot)?.label ?? '';
    let boardClueCount = 0;
    try { boardClueCount = api.board(code).clues.length; } catch { /* no board yet */ }
    return {
      id: c.id, tone: c.tone, title: c.title, place: c.place, dateLine: c.dateLine, intro: c.intro,
      victim: c.victim,
      crime: { room: /^the /i.test(roomName) ? roomName : `the ${roomName.toLowerCase()}`, time, what: c.crime.what },
      items: c.items.map((i) => ({ id: i.id, name: /^(the|a|an) /i.test(i.name) ? i.name : `the ${i.name}` })),
      suspectCount: c.suspects.length,
      boardClueCount,
      phase: st.phase,
      round: st.round,
      roomCode: code,
      seed: seeds.get(code),
      solved: solved.has(code) || st.phase === 'reveal' || st.phase === 'results',
    };
  };

  const clueCard = (c: RoomClue): ClueCard => ({ id: c.id, title: c.title, text: c.text, kind: c.kind, round: c.round });

  const make = (household: string): GameApi => {
    const need = () => {
      const code = findRoom(household);
      if (!code) throw new Error('No case is open yet.');
      return code;
    };
    return {
      async startCase(tone: Tone, o?: StartOptions) {
        const { code, joinUrl } = api.createRoom({ tone, seed: o?.seed });
        roomOf.set(household, code);
        if (joinUrl) joinUrls.set(code, joinUrl);
        if (o?.seed !== undefined) seeds.set(code, o.seed);
        solved.delete(code);
        hintIndex.delete(code);
        let i = 0;
        o?.onProgress?.({ progress: 0, total: START_STEPS.length, message: START_STEPS[0]! });
        const tick = setInterval(() => {
          i = Math.min(i + 1, START_STEPS.length - 1);
          o?.onProgress?.({ progress: i, total: START_STEPS.length, message: START_STEPS[i]! });
        }, 1200);
        try {
          await api.startCase(code, { tone, seed: o?.seed });
        } finally {
          clearInterval(tick);
        }
        o?.onProgress?.({ progress: START_STEPS.length, total: START_STEPS.length, message: 'The case is ready' });
        return summary(code)!;
      },
      getCaseSummary() {
        const code = findRoom(household);
        return code ? summary(code) : null;
      },
      listSuspects(): SuspectCard[] {
        const code = need();
        const st = api.state(code);
        const c = st.case;
        const crimeSlot = c?.crime.slot;
        return api.listSuspects(code).map((s) => {
          const roomId = crimeSlot !== undefined ? s.claimedAlibi[crimeSlot] : undefined;
          const room = c?.rooms.find((r) => r.id === roomId)?.name;
          const time = c?.slots.find((x) => x.id === crimeSlot)?.label;
          const portrait = c?.suspects.find((x) => x.id === s.id)?.portrait;
          return {
            id: s.id, name: s.name, role: s.role, motive: s.motive,
            portraitUrl: portrait ? `${opts.artBase ?? '/tv/art/'}${portrait.replace(/^\/+/, '')}` : undefined,
            claimedAlibi: room && time ? `Says they were in the ${room.toLowerCase()} at ${time}.` : undefined,
          };
        });
      },
      async askSuspect(suspectId: string, question: string) {
        const u = await api.ask(need(), suspectId, question);
        return { text: u.text, audioUrl: u.audioUrl, suspectId: u.speaker, suspectName: u.speakerName };
      },
      examineClue(clueId: string) {
        return clueCard(api.examineClue(need(), clueId));
      },
      listBoardClues() {
        return api.board(need()).clues.map(clueCard);
      },
      async nextRound() {
        const code = need();
        if (!api.next) return { round: api.state(code).round, newClues: [] };
        const before = new Set(api.board(code).clues.map((c) => c.id));
        await api.next(code);
        const after = api.board(code);
        return { round: after.round, phase: after.phase, newClues: after.clues.filter((c) => !before.has(c.id)).map(clueCard) };
      },
      async accuse(culprit: string, item?: string) {
        const code = need();
        const c = api.state(code).case;
        const accused = c?.suspects.find((s) => s.id === culprit);
        const itm = item ? c?.items.find((i) => i.id === item) : undefined;
        const r = await api.accuse(code, { culprit, item });
        solved.add(code);
        const meansName = /^(the|a|an) /i.test(r.item) ? r.item : `the ${r.item}`;
        const real = c?.suspects.find((s) => s.id === r.culprit.id);
        const explanation = r.correct
          ? `You got it. ${r.culprit.name}${real ? `, ${real.role},` : ''} did it with ${meansName}.`
          : accused?.id === r.culprit.id
            ? `Right person, wrong means. It was ${r.culprit.name}, but with ${meansName}.`
            : `Not quite. ${accused?.name ?? 'They'} is innocent. It was ${r.culprit.name}${real ? `, ${real.role},` : ''} with ${meansName}.`;
        const named = (x?: { id: string; name: string }): NamedRef | null => (x ? { id: x.id, name: x.name } : null);
        return {
          correct: r.correct,
          accused: named(accused) ?? { id: culprit, name: culprit },
          item: named(itm),
          culprit: r.culprit,
          means: { id: c?.items.find((i) => i.name === r.item)?.id ?? r.item, name: meansName },
          explanation,
          steps: r.steps,
        };
      },
      async resumeCase(ref: CaseRef) {
        const rooms = api.listRooms();
        const code = ref.roomCode?.toUpperCase();
        if (code && rooms.some((r) => r.code === code) && api.state(code).case) {
          roomOf.set(household, code);
          return summary(code);
        }
        // the room is gone (the server restarted): rebuild the same case from its seed
        if (ref.seed !== undefined) {
          const g = make(household);
          return g.startCase(ref.tone ?? 'classic', { seed: ref.seed });
        }
        return null;
      },
      handoff(): Handoff {
        const code = need();
        const joinPath = joinUrls.get(code) ?? `/p?room=${code}`;
        return { roomCode: code, tvPath: `/tv/?room=${code}`, joinPath, qrService: '/api/qr' };
      },
      narrate: api.narrate ? async (text: string) => { const n = await api.narrate!(text); return { audioUrl: n?.audioUrl }; } : undefined,
      async hint(): Promise<Hint> {
        const code = need();
        // The engine knows the deduction chain: use its hint when the server provides one.
        if (api.hint) {
          const h = await api.hint(code);
          return { text: h.text, clueId: h.clueId, hintsLeft: h.hintsLeft };
        }
        // Fallback: point at a single clue on the board and ask the question it answers.
        const s = summary(code);
        const clues = api.board(code).clues;
        if (!clues.length) return { text: 'Start by asking each suspect where they were at the time of the crime.' };
        const ordered = [...clues.filter((c) => c.key), ...clues.filter((c) => !c.key)];
        const i = hintIndex.get(code) ?? 0;
        hintIndex.set(code, i + 1);
        const c = ordered[i % ordered.length]!;
        const when = s ? ` in ${s.crime.room} at ${s.crime.time}` : '';
        return { text: `Look closely at "${c.title}". Who does it rule out from being${when}?`, clueId: c.id, hintsLeft: Math.max(0, ordered.length - i - 1) };
      },
    };
  };

  return (household: string) => {
    let g = games.get(household);
    if (!g) { g = make(household); games.set(household, g); }
    return g;
  };
}
