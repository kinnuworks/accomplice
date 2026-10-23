// One game room. Server authoritative: every change ends in flush(), which sends room:state to all
// and you:state to each phone.
import { nanoid } from 'nanoid';
import type {
  BoardState, Case, Clue, Lang, Phase, Player, PublicCase, Role, RoomState, ServerToClient, SfxName, Theory, Tone,
  Utterance, WordMark, YouState,
} from '@accomplice/protocol';
import { cfg } from './config.js';
import type { Engine } from './engine.js';
import { suspectReply, fillersFor, deflectionsFor, type HistoryTurn, type ReplyResult } from './suspects.js';
import { speak, narrate, type Speech, type VoiceTier } from './tts.js';
import { cleanCaption, captionChunks, twoSentenceChunks } from './captions.js';
import { translate, cachedTranslation } from './translate.js';
import { correctNames } from './fuzzy.js';
import { log } from './log.js';
import { houseFor, houseReply, type House } from './house.js';
import { buildNewspaper, creditDetective } from './newspaper.js';
import type { Claim, Fact, ObjectionResult } from '@accomplice/protocol';

export class GameError extends Error {}

export interface Client { send(msg: ServerToClient): void; role: 'tv' | 'phone' | 'api'; playerId?: string; /** Missed heartbeats: socket still open, player shown as away. */ away?: boolean }

interface PlayerPriv {
  role: Role | null;
  clueIds: string[];
  notes: string;
  vote?: YouState['vote'];
  lang: Lang;
}

interface QueueItem {
  id: string; playerId: string; suspectId: string; text: string; via: 'voice' | 'typed' | 'api'; lang: Lang;
  resolve?: (u: Utterance) => void; reject?: (e: unknown) => void;
  live: LiveAnswer;
  queuedAt: number;
}

/** An answer being written and voiced sentence by sentence, ahead of its turn to speak. */
class LiveAnswer {
  parts: { text: string; speech: Promise<Speech>; readyAt: number }[] = [];
  done = false;
  english?: string;
  result?: ReplyResult;
  error?: unknown;
  translateMs = 0;
  private waiters: (() => void)[] = [];
  notify() { const w = this.waiters; this.waiters = []; for (const f of w) f(); }
  wait() { return new Promise<void>((r) => this.waiters.push(r)); }
}

export interface Timing { kind: string; ms: number; detail?: Record<string, unknown> }

const AVATARS = ['fox', 'owl', 'cat', 'hare', 'badger', 'raven'];
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

export class Room {
  readonly code: string;
  phase: Phase = 'lobby';
  round: 0 | 1 | 2 | 3 = 0;
  tone: Tone;
  players: Player[] = [];
  priv = new Map<string, PlayerPriv>();
  hostId: string | null = null;
  case: Case | null = null;
  pub: PublicCase | null = null;
  board: BoardState = { revealed: [], pinned: [], links: [] };
  transcript: Utterance[] = [];
  speaking: string | null = null;
  queue: QueueItem[] = [];
  reveal: RoomState['reveal'];
  deadlineAt: number | undefined;
  accompliceId: string | null = null;
  clients = new Set<Client>();
  history = new Map<string, HistoryTurn[]>();
  timings: Timing[] = [];
  lastActive = Date.now();
  starting = false;
  private processing = false;
  private flushScheduled = false;
  private spokenWaiters = new Map<string, () => void>();
  private prepChain = new Map<string, Promise<void>>();
  private narration: Promise<void> = Promise.resolve();
  private lastFiller = new Map<string, string>();
  private lastAsked = new Map<string, string>();
  proposal: { id: string; by: string; culprit: string; item?: string; agree: Set<string>; notYet: Set<string>; closesAt: number; timer: NodeJS.Timeout; settled: boolean } | null = null;
  /** Set by the hub: the address phones should open. */
  joinUrl = '';
  audience: { id: string; name: string; connected: boolean }[] = [];
  house: House | null = null;
  private tutorialAsked = new Set<string>();
  private phaseTimer: NodeJS.Timeout | null = null;
  emergency: (NonNullable<RoomState['emergency']> & { ballots: Map<string, string>; timer?: NodeJS.Timeout }) | null = null;
  private sabotageLog: NonNullable<NonNullable<RoomState['reveal']>['sabotage']> = [];
  private smudged = new Set<string>();
  private hunches = new Map<string, { lied: boolean; votes: Map<string, boolean>; closesAt: number }>();
  private openHunch: string | null = null;
  private narrationEndsAt = 0;
  private answerWindows = new Map<string, { suspectId: string; claims: Claim[]; endsAt: number; durationMs: number }>();
  private partOwner = new Map<string, string>();
  /** When each player first named the real culprit (proposal or vote): breaks ties for the headline. */
  private firstNamed = new Map<string, number>();
  private autoTimer: NodeJS.Timeout | null = null;
  private lastJoinPrompt = 0;
  private pendingWelcome: string[] = [];
  private welcomeTimer: NodeJS.Timeout | null = null;
  private objectionUsed = new Set<string>();
  private slipCount = 0;
  private finalPart = new Map<string, string>();

  /** Called (debounced by the hub) after any change, so the room can be snapshotted for crash recovery. */
  onChange: (() => void) | null = null;

  private warm: { tone: Tone; seed: number; p: Promise<Awaited<ReturnType<Engine['generateVerifiedCase']>>> } | null = null;

  constructor(code: string, private engine: Engine, tone: Tone = 'classic', private opts: { seed?: number; prewarm?: boolean } = {}) {
    this.code = code;
    this.tone = tone;
    if (opts.prewarm) this.prewarm();
  }

  /** Build and verify the next case in the background while people join, so Start is instant. */
  prewarm(seed?: number) {
    const s = seed ?? this.opts.seed ?? Math.floor(Math.random() * 1e9);
    if (this.warm && this.warm.tone === this.tone && this.warm.seed === s) return;
    const t0 = Date.now();
    const p = this.engine.generateVerifiedCase({ seed: s, tone: this.tone, difficulty: cfg.difficulty, suspectCount: 5 });
    p.then((r) => { this.timing('caseGenBackground', Date.now() - t0, { tries: r.tries }); this.prerender(r.c); }, () => {});
    this.warm = { tone: this.tone, seed: s, p };
  }

  /**
   * Voice everything predictable for a case before it is needed: narrator lines (best quality voice, made while
   * people are still joining) plus each suspect's thinking noises and deflections (fast voice).
   */
  prerender(c: Case) {
    const t0 = Date.now();
    const jobs: Promise<unknown>[] = [];
    for (const s of c.suspects) for (const line of [...fillersFor(s), ...deflectionsFor(s.id)]) jobs.push(speak(line, s.voiceId, 'fast', { background: true }));
    const lines = [...this.briefingLines(c), ...this.tutorialLines(c), this.blackoutText(c), EMERGENCY_TEXT, this.roundText(c, 1), this.roundText(c, 2), this.roundText(c, 3), this.accuseText(false), this.accuseText(true), REVEAL_INTRO, ...this.engine.proofChain(c).map((st) => st.therefore), this.unmaskText(c)];
    for (const l of lines) for (const chunk of twoSentenceChunks(l)) jobs.push(narrate(chunk, 'narrator', { background: true }));
    jobs.push(narrate(this.joinSpeech(), 'narrator', { background: true }));
    void Promise.allSettled(jobs).then(() => this.timing('prerender', Date.now() - t0, { lines: jobs.length }));
  }

  /** Narrator lines for the briefing: the engine's slides when it provides them, else one intro paragraph. */
  private briefingLines(c: Case): string[] {
    return c.briefing?.length ? [...c.briefing, ROLE_LINE] : [this.introText(c)];
  }

  /** Caption for the lobby join prompt (written form). */
  joinLine(): string { return `Scan the code or enter room code ${this.code}`; }
  /** What the narrator says: never a URL, and the code letter by letter. */
  joinSpeech(): string { return `Scan the code on the TV, or type the room code: ${this.code.split('').join(', ')}.`; }

  /** Spoken in the lobby when the room opens and whenever someone joins, so nobody needs to read the screen. */
  welcome(name?: string) {
    // Batch arrivals into one line and keep the join prompt to one every 30 s, so the narrator never
    // builds a backlog that spills into the game.
    if (name) this.pendingWelcome.push(name);
    if (this.welcomeTimer) return;
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      if (this.phase !== 'lobby') { this.pendingWelcome = []; return; }
      const names = this.pendingWelcome.splice(0);
      if (names.length) void this.announce(`Welcome, ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}.`, { tier: 'fast', lobbyOnly: true });
      if (Date.now() - this.lastJoinPrompt > 30_000) {
        this.lastJoinPrompt = Date.now();
        void this.announce(this.joinLine(), { speech: this.joinSpeech(), lobbyOnly: true });
      }
    }, name ? WELCOME_BATCH_MS : 0);
    this.welcomeTimer.unref?.();
  }

  private introText(c: Case) {
    const names = c.suspects.map((s) => `${s.name}, ${s.role}`);
    return `${c.title}. ${c.dateLine}, ${c.place}. ${c.intro} Your suspects: ${names.slice(0, -1).join('; ')}; and ${names[names.length - 1]}. ${ROLE_LINE}`;
  }
  private roundText(c: Case, r: 1 | 2 | 3) {
    // Round three's board clue arrives with the blackout instead.
    const board = c.clues.filter((x) => x.visibility === 'board' && x.round === r).slice(r === 3 ? 1 : 0);
    const hour = c.clockChimes?.[r - 1] ?? ((7 + r) % 12) + 1;
    const lines = [`The clock strikes ${HOUR_WORDS[hour] ?? hour}. Round ${NUM[r]}.`, `Everyone has ${NUM[cfg.questionsPerRound]} questions.`];
    if (board.length) {
      lines.push(board.length === 1 ? 'A new clue on the board.' : `${capital(NUM[board.length])} new clues on the board.`);
      for (const b of board) lines.push(`${b.title}. ${b.text}`);
    }
    lines.push('And there is a fresh private clue on each of your phones.');
    return lines.join(' ');
  }
  private tutorialLines(c: Case): string[] {
    const h = houseFor(this.engine.publicView(c));
    return [
      `Before the questions begin, ${h.name}, ${h.role}, will answer one question from each of you. It is free, and it does not count.`,
      'Hold the talk button on your phone, ask anything, and let go. Your words appear on the screen and the answer comes from the television.',
      'When clues arrive on the board, pin the ones you like with OK on the remote.',
    ];
  }
  private blackoutText(c: Case) {
    const clue = c.clues.find((x) => x.visibility === 'board' && x.round === 3);
    return `The lights flicker, and go out. Thunder rolls over ${c.place}. When they come back on, something has changed.${clue ? ` A new clue: ${clue.title}. ${clue.text}` : ''}`;
  }
  private accuseText(withAccomplice: boolean) {
    return `Time to accuse. On your phone, choose who did it and how.${withAccomplice ? ' Then name the accomplice. Someone in this room has been helping them.' : ''} Take your time.`;
  }
  private unmaskText(c: Case) {
    const culprit = c.suspects.find((s) => s.id === c.truth.culprit)!;
    const item = c.items.find((i) => i.id === c.crime.item)!;
    return `It was ${culprit.name}, ${culprit.role}, in the ${c.rooms.find((r) => r.id === c.crime.room)?.name ?? c.crime.room}, with the ${item.name}.`;
  }

  // ---------- connections ----------

  attach(c: Client) { this.clients.add(c); this.lastActive = Date.now(); this.flush(); }

  detach(c: Client) {
    this.clients.delete(c);
    if (c.playerId && ![...this.clients].some((x) => x.playerId === c.playerId && !x.away)) this.setPresence(c.playerId, false);
  }

  /**
   * A phone went quiet (heartbeat) or came back. An away player still holds their seat, but votes stop
   * waiting on them, so anything that was only waiting for them resolves now.
   */
  setPresence(playerId: string, connected: boolean) {
    const p = this.player(playerId);
    const a = this.audience.find((x) => x.id === playerId);
    if (!p && !a) return;
    if ((p?.connected ?? a?.connected) === connected) return;
    if (p) p.connected = connected;
    if (a) a.connected = connected;
    if (!connected && this.phase === 'lobby' && this.hostId === playerId) {
      this.hostId = this.players.find((x) => x.connected)?.id ?? this.hostId;
    }
    this.changed();
    if (!connected) this.recheckVotes();
  }

  /** Called when someone leaves: close any vote that now has every ballot it is waiting for. */
  private recheckVotes() {
    if (this.phase === 'accuse') {
      const { count, needed } = this.voteCount();
      if (count > 0 && count >= needed) void this.finishReveal();
    }
    const e = this.emergency;
    if (e && e.stage === 'vote' && e.ballots.size > 0 && e.ballots.size >= this.players.filter((p) => p.connected).length) this.closeEmergencyVote();
    const pr = this.proposal;
    if (pr && !pr.settled && pr.agree.size >= this.proposalNeeded()) void this.settleProposal(pr.id);
  }

  player(id: string) { return this.players.find((p) => p.id === id); }
  isHost(pid?: string) { return !!pid && pid === this.hostId; }
  isAudience(id?: string) { return !!id && this.audience.some((a) => a.id === id); }

  join(name: string, playerId?: string, avatar?: string): Player {
    const av = typeof avatar === 'string' && /^[\w-]{1,32}$/.test(avatar) ? avatar : undefined;
    this.lastActive = Date.now();
    const existing = playerId ? this.player(playerId) : undefined;
    if (existing) {
      existing.connected = true;
      if (name?.trim()) existing.name = cleanName(name);
      if (av) existing.avatar = av;
      if (!this.hostId) this.hostId = existing.id;
      this.changed();
      return existing;
    }
    // Late arrivals and anyone past the player cap join the audience: they cast hunch votes.
    const known = playerId ? this.audience.find((a) => a.id === playerId) : undefined;
    if (known || this.phase !== 'lobby' || this.players.length >= cfg.maxPlayers) {
      const a = known ?? { id: playerId && playerId.length >= 6 && playerId.length <= 40 ? playerId : nanoid(12), name: cleanName(name) || 'Guest', connected: true };
      a.connected = true;
      if (!known) { if (this.audience.length >= 500) throw new GameError('The audience is full tonight.'); this.audience.push(a); }
      this.changed();
      return { id: a.id, name: a.name, seat: -1, connected: true, avatar: 'audience', questionsLeft: 0 };
    }
    const seats = new Set(this.players.map((p) => p.seat));
    let seat = 0; while (seats.has(seat)) seat++;
    const p: Player = { id: playerId && playerId.length >= 6 && playerId.length <= 40 ? playerId : nanoid(12), name: cleanName(name) || `Player ${seat + 1}`, seat, connected: true, avatar: av ?? AVATARS[seat % AVATARS.length], questionsLeft: 0, lang: 'en' };
    this.players.push(p);
    this.priv.set(p.id, { role: null, clueIds: [], notes: '', lang: 'en' });
    if (!this.hostId) this.hostId = p.id;
    this.sfx('join');
    this.changed();
    this.welcome(p.name);
    return p;
  }

  setTone(by: string | 'tv', tone: Tone) {
    if (by !== 'tv' && !this.isHost(by)) throw new GameError('Only the host can choose the tone.');
    if (this.phase !== 'lobby') throw new GameError('The tone is set once the case begins.');
    if (tone !== 'classic' && tone !== 'cozy') throw new GameError('Unknown tone.');
    this.tone = tone;
    if (this.warm) this.prewarm();
    this.changed();
  }

  setLang(pid: string, lang: Lang) {
    const pv = this.priv.get(pid); const p = this.player(pid);
    if (!pv || !p) throw new GameError('Join the room first.');
    if (lang !== 'en' && lang !== 'hi') throw new GameError('That language is not available yet.');
    pv.lang = lang; p.lang = lang;
    this.changed();
  }

  // ---------- phases ----------

  async start(by: string | 'tv' | 'api', opts: { tone?: Tone; seed?: number; waitForNarration?: boolean } = {}) {
    if (by !== 'tv' && by !== 'api' && !this.isHost(by)) throw new GameError('Only the host can start the game.');
    if (this.phase !== 'lobby') throw new GameError('The game is already under way.');
    if (by !== 'api' && this.players.length < cfg.minPlayers) throw new GameError(`You need at least ${cfg.minPlayers} players to begin.`);
    if (this.starting) return;
    this.starting = true;
    if (opts.tone) this.tone = opts.tone;
    try {
      this.sfx('start');
      const t0 = Date.now();
      const seed = opts.seed ?? this.opts.seed;
      const warm = this.warm && this.warm.tone === this.tone && (seed === undefined || seed === this.warm.seed) ? this.warm.p : null;
      this.warm = null;
      const gen = warm
        ? await warm.catch(() => this.engine.generateVerifiedCase({ seed: Math.floor(Math.random() * 1e9), tone: this.tone, difficulty: cfg.difficulty, suspectCount: 5 }))
        : await this.engine.generateVerifiedCase({ seed: seed ?? Math.floor(Math.random() * 1e9), tone: this.tone, difficulty: cfg.difficulty, suspectCount: 5 });
      const { c, report, tries } = gen;
      this.timing('caseGen', Date.now() - t0, { tries, verifyMs: report.ms, engine: this.engine.source });
      this.case = c;
      this.pub = this.engine.publicView(c);
      this.board = { revealed: [], pinned: [], links: [] };
      this.transcript = []; this.history.clear(); this.queue = []; this.reveal = undefined;
      this.assignRoles();
      this.prewarmClueAudio();
      if (!warm) this.prerender(c);
      this.phase = 'briefing'; this.round = 0;
      this.changed();
      // Cold open: rain and thunder under the narrator, the briefing lines, then a sting and the title card.
      this.broadcast({ t: 'event', kind: 'coldOpen', text: c.title });
      this.sfx('rain'); this.sfx('thunder');
      const lines = c.briefing?.length ? c.briefing : [this.introText(c)];
      let sent: Promise<void> = Promise.resolve();
      lines.forEach((line, i) => { sent = this.announce(line, { id: `briefing:${i}` }); });
      void this.afterAudio().then(() => {
        if (this.phase !== 'briefing' || this.case !== c) return;
        this.sfx('sting');
        this.broadcast({ t: 'event', kind: 'titleCard', text: c.title });
        void this.announce(ROLE_LINE).then(() => this.afterAudio()).then(() => {
          // Nobody pressed on after the cold open: carry on by ourselves.
          if (cfg.autoAdvanceMs > 0 && this.phase === 'briefing' && this.case === c) {
            const t = setTimeout(() => { if (this.phase === 'briefing' && this.case === c) void this.next('api').catch(() => {}); }, BRIEFING_GRACE_MS);
            t.unref?.();
          }
        });
      });
      // Voice front ends only need the case; the briefing keeps playing on any TV in the room.
      if (opts.waitForNarration !== false) await sent; else sent.catch(() => {});
    } finally {
      this.starting = false;
    }
  }

  private assignRoles() {
    const c = this.case!;
    this.accompliceId = null;
    for (const p of this.players) {
      const pv = this.priv.get(p.id)!;
      pv.role = 'detective'; pv.clueIds = []; pv.vote = undefined; pv.notes = '';
      p.questionsLeft = 0;
    }
    if (this.players.length >= 4) {
      const pick = this.players[Math.floor(Math.random() * this.players.length)];
      this.accompliceId = pick.id;
      this.priv.get(pick.id)!.role = 'accomplice';
    }
    void c;
  }

  async next(by: string | 'tv' | 'api', opts: { skipTutorial?: boolean } = {}) {
    if (by !== 'tv' && by !== 'api' && !this.isHost(by)) throw new GameError('Only the host can move the game on.');
    switch (this.phase) {
      case 'lobby': return this.start(by);
      case 'briefing': return cfg.tutorial && !opts.skipTutorial ? this.beginTutorial() : this.beginRound(1);
      case 'tutorial': return this.beginRound(1);
      case 'investigate':
        if (this.round < 3) return this.beginRound((this.round + 1) as 2 | 3);
        return this.beginAccuse();
      case 'accuse': return this.finishReveal();
      case 'reveal': return this.showResults();
      case 'results': return this.resetToLobby();
    }
  }

  /** Cold open: a free practice question to the house character, then pinning. About a minute; the host can skip. */
  private async beginTutorial() {
    const c = this.case!;
    this.phase = 'tutorial';
    this.house = houseFor(this.pub!);
    this.tutorialAsked.clear();
    for (const p of this.players) p.questionsLeft = 1;
    this.deadlineAt = Date.now() + TUTORIAL_MS;
    this.setPhaseTimer(TUTORIAL_MS, async () => {
      if (this.phase !== 'tutorial') return;
      await this.queueIdle();
      if (this.phase === 'tutorial') await this.beginRound(1);
    });
    this.changed();
    for (const line of this.tutorialLines(c)) void this.announce(line);
  }

  private setPhaseTimer(ms: number, fn: () => void | Promise<void>) {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => { this.phaseTimer = null; void fn(); }, ms);
    this.phaseTimer.unref?.();
  }

  private async queueIdle() { while (this.queue.length) await new Promise((r) => setTimeout(r, 200)); }

  private async beginRound(r: 1 | 2 | 3) {
    const c = this.case!;
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    this.phase = 'investigate'; this.round = r;
    this.smudged.clear();
    this.cancelAutoAdvance();
    for (const p of this.players) p.questionsLeft = cfg.questionsPerRound;
    // Set the new deadline before arming the timer, or it fires on the previous phase's deadline.
    this.deadlineAt = cfg.roundSeconds > 0 ? Date.now() + cfg.roundSeconds * 1000 : undefined;
    this.armRoundTimer();
    const board = c.clues.filter((x) => x.visibility === 'board' && x.round === r);
    this.board.revealed.push(...board.map((x) => x.id));
    this.dealPrivate(r);
    this.prewarmClueAudio();
    // The night wears on: a grandfather clock strikes the hour and the TV darkens a little.
    const hour = c.clockChimes?.[r - 1] ?? ((7 + r) % 12) + 1;
    this.sfx('chime');
    this.broadcast({ t: 'event', kind: 'chime', text: `The clock strikes ${hour}.`, hour });
    if (board.length) this.sfx('cardFlip');
    this.changed();
    if (r === 3) await this.blackout(c);
    await this.announce(this.roundText(c, r));
  }

  // ---------- the lights go out (start of round three) ----------

  private async blackout(c: Case) {
    const clue = c.clues.find((x) => x.visibility === 'board' && x.round === 3);
    this.sfx('thunder');
    this.broadcast({ t: 'event', kind: 'blackout', text: 'The lights go out.', clueId: clue?.id });
    void this.announce(this.blackoutText(c));
    this.emergency = { stage: 'vote', closesAt: Date.now() + EMERGENCY_MS, votes: {}, voters: [], ballots: new Map() };
    this.emergency.timer = setTimeout(() => this.closeEmergencyVote(), EMERGENCY_MS);
    this.emergency.timer.unref?.();
    this.changed();
    void this.announce(EMERGENCY_TEXT);
  }

  emergencyVote(pid: string, suspectId: string) {
    const e = this.emergency;
    if (!e || e.stage !== 'vote') throw new GameError('There is no emergency vote right now.');
    if (!this.player(pid)) throw new GameError('Join the room first.');
    if (!this.case!.suspects.some((s) => s.id === suspectId)) throw new GameError('Pick one of the suspects.');
    e.ballots.set(pid, suspectId);
    e.votes = {}; for (const v of e.ballots.values()) e.votes[v] = (e.votes[v] ?? 0) + 1;
    e.voters = [...e.ballots.keys()];
    this.sfx('pin');
    this.changed();
    if (e.ballots.size >= this.players.filter((p) => p.connected).length) this.closeEmergencyVote();
  }

  private closeEmergencyVote() {
    const e = this.emergency;
    if (!e || e.stage !== 'vote') return;
    if (e.timer) clearTimeout(e.timer);
    const c = this.case;
    if (!c || this.phase !== 'investigate') { e.stage = 'done'; return; }
    const top = Math.max(0, ...Object.values(e.votes));
    const tied = top > 0 ? Object.keys(e.votes).filter((k) => e.votes[k] === top) : c.suspects.map((s) => s.id);
    const chosen = tied[Math.floor(Math.random() * tied.length)];
    e.stage = 'ask'; e.suspectId = chosen; e.closesAt = Date.now() + EMERGENCY_MS;
    e.timer = setTimeout(() => { if (this.emergency === e && e.stage === 'ask') { e.stage = 'done'; this.changed(); this.maybeAutoAdvance(); } }, EMERGENCY_MS);
    e.timer.unref?.();
    const name = c.suspects.find((s) => s.id === chosen)!.name;
    const text = `${name} must answer one question in front of everyone. First to hold the talk button gets it, and it is free.`;
    this.broadcast({ t: 'event', kind: 'emergency', text, suspectId: chosen });
    this.sfx('bell');
    this.changed();
    void this.announce(text, { tier: 'fast' });
  }

  /** The accomplice's phone pulses when someone names the culprit. Nobody else feels it. */
  private heartbeatIfCulprit(culprit: string) {
    if (!this.accompliceId || !this.case || culprit !== this.case.truth.culprit) return;
    for (const cl of this.clients) if (cl.role === 'phone' && cl.playerId === this.accompliceId) cl.send({ t: 'haptic', pattern: 'heartbeat' });
  }

  // ---------- objection ----------

  /** Once per player per game, during an answer or up to 6 s after it ends. */
  async objection(pid: string, utteranceId: string) {
    const c = this.case;
    const p = this.player(pid);
    if (!c || this.phase !== 'investigate') throw new GameError('Objections are for the questioning rounds.');
    if (!p) throw new GameError('Join the room first.');
    if (this.objectionUsed.has(pid)) throw new GameError('You have already used your objection this game.');
    const w = this.answerWindows.get(utteranceId);
    if (!w || Date.now() > w.endsAt + OBJECTION_GRACE_MS) throw new GameError('Too late to object to that one.');
    this.objectionUsed.add(pid);
    this.broadcast({ t: 'event', kind: 'objection', text: 'Objection!', by: pid, byName: p.name, suspectId: w.suspectId });
    this.flushYou(pid);
    const result = this.engine.objectionSlip ? this.engine.objectionSlip(c, w.suspectId, w.claims) : fallbackSlip(c, w.suspectId, w.claims);
    const suspect = c.suspects.find((s) => s.id === w.suspectId)!;
    if (result.wasLying) {
      this.sfx('gavel');
      if (result.fact) {
        const id = `slip-${++this.slipCount}`;
        const text = `Slip: ${result.factText ?? result.line}`;
        c.clues.push({ id, kind: 'testimony', title: `${suspect.name} slipped`, text, visibility: 'board', round: (this.round || 1) as 1 | 2 | 3, fact: result.fact });
        this.board.revealed.push(id);
        this.sfx('cardFlip');
      }
    }
    const sp = await speak(result.line, suspect.voiceId, 'fast');
    const u: Utterance = {
      id: `objection:${utteranceId}`, speaker: suspect.id, speakerName: suspect.name, text: result.line, audioUrl: sp.audioUrl, marks: sp.marks, at: Date.now(),
      askedBy: pid, parts: [{ id: `objection:${utteranceId}:0`, text: result.line, audioUrl: sp.audioUrl, marks: sp.marks, durationMs: sp.durationMs, captionChunks: captionChunks(result.line) }],
      partial: false, captionChunks: captionChunks(result.line),
    };
    this.pushTranscript(u);
    this.sendUtterance(u);
    this.changed();
    return result;
  }

  // ---------- accomplice sabotage ----------

  /** Board clues the accomplice may smudge: on the board, not already smudged, and not needed for a unique answer. */
  sabotageOptions(): string[] {
    const c = this.case;
    if (!c || this.phase !== 'investigate' || this.sabotageLog.length) return [];
    return c.clues
      .filter((x) => this.board.revealed.includes(x.id) && !x.key && !this.smudged.has(x.id))
      .sort((a, b) => b.round - a.round)
      .slice(0, 2)
      .map((x) => x.id);
  }

  async sabotage(pid: string, clueId: string) {
    const c = this.case;
    if (!c || pid !== this.accompliceId) throw new GameError('Only the accomplice can do that.');
    if (this.phase !== 'investigate') throw new GameError('Sabotage only works while the questions are flying.');
    if (this.sabotageLog.length) throw new GameError('You have already used your sabotage.');
    if (!this.sabotageOptions().includes(clueId)) throw new GameError('That clue is too important to smudge.');
    // Belt and braces: when the engine exposes its solver, prove the case is still uniquely solvable without the clue.
    if (this.engine.verifyCase) {
      const without = { ...c, clues: c.clues.filter((x) => x.id !== clueId) };
      const ok = await Promise.race([this.engine.verifyCase(without).then((r) => r.uniqueCulprit && r.culprit === c.truth.culprit), new Promise<boolean>((r) => setTimeout(() => r(true), 3000))]);
      if (!ok) throw new GameError('That clue is too important to smudge.');
    }
    const clue = c.clues.find((x) => x.id === clueId)!;
    this.smudged.add(clueId);
    this.board.pinned = this.board.pinned.filter((x) => x !== clueId);
    this.board.links = this.board.links.filter(([a, b]) => a !== clueId && b !== clueId);
    this.sabotageLog.push({ by: pid, byName: this.player(pid)?.name ?? '', clueId, clueTitle: clue.title, round: this.round, at: Date.now() });
    this.sfx('smudge');
    this.broadcast({ t: 'event', kind: 'smudge', text: 'A clue has been smudged!', clueId });
    this.changed();
    void this.announce('Someone has spilled the port on a clue. It will be unreadable until the next round. Who would do such a thing?', { tier: 'fast' });
  }

  // ---------- hunch votes ----------

  /** Players with no questions left, and the audience, guess whether the last answer was a lie. */
  hunch(pid: string, utteranceId: string, lying: boolean) {
    const h = this.hunches.get(utteranceId);
    if (!h || this.openHunch !== utteranceId || Date.now() > h.closesAt) throw new GameError('That hunch vote has closed.');
    const p = this.player(pid);
    if (!p && !this.isAudience(pid)) throw new GameError('Join the room first.');
    if (p && p.questionsLeft > 0) throw new GameError('Use your questions first; hunches are for when you are out.');
    h.votes.set(pid, !!lying);
    const tally = this.hunchTally(utteranceId);
    this.broadcast({ t: 'hunch', utteranceId, ...tally });
    this.changed();
  }

  private hunchTally(id: string) {
    const h = this.hunches.get(id)!;
    const v = [...h.votes.values()];
    return { lying: v.filter(Boolean).length, truth: v.filter((x) => !x).length };
  }

  private openHunchFor(u: Utterance, claims: { s: string; room: string; slot: number }[]) {
    const c = this.case!;
    const lied = claims.some((cl) => cl.s === u.speaker && c.truth.position[cl.s]?.[cl.slot] !== undefined && c.truth.position[cl.s][cl.slot] !== cl.room);
    // Until the TV reports playback, assume the answer plays now: the window runs 20 s past its end.
    const w = this.answerWindows.get(u.id);
    this.hunches.set(u.id, { lied, votes: new Map(), closesAt: Math.max(Date.now(), w?.endsAt ?? 0) + HUNCH_MS });
    this.openHunch = u.id;
  }

  private hunchResults(): NonNullable<NonNullable<RoomState['reveal']>['hunches']> {
    const byPlayer: Record<string, { right: number; total: number }> = {};
    let right = 0; let total = 0;
    for (const h of this.hunches.values()) {
      for (const [pid, saidLying] of h.votes) {
        const r = (byPlayer[pid] ??= { right: 0, total: 0 });
        r.total++; total++;
        if (saidLying === h.lied) { r.right++; right++; }
      }
    }
    return { byPlayer, right, total };
  }

  /** One private clue per player per round, dealt by seat. Key clues never go to the accomplice. */
  private dealPrivate(r: 1 | 2 | 3) {
    const c = this.case!;
    const bySeat = [...this.players].sort((a, b) => a.seat - b.seat);
    if (!bySeat.length) return;
    const priv = c.clues.filter((x) => x.visibility === 'private' && x.round === r);
    for (const cl of priv) {
      let idx = (cl.holderPlayerSlot ?? 0) % bySeat.length;
      if (cl.key && bySeat[idx].id === this.accompliceId && bySeat.length > 1) idx = (idx + 1) % bySeat.length;
      const pv = this.priv.get(bySeat[idx].id)!;
      if (!pv.clueIds.includes(cl.id)) pv.clueIds.push(cl.id);
    }
  }

  private async beginAccuse() {
    this.phase = 'accuse';
    this.cancelAutoAdvance();
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    this.smudged.clear();
    if (this.emergency) { if (this.emergency.timer) clearTimeout(this.emergency.timer); this.emergency.stage = 'done'; }
    this.cancelAutoAdvance();
    // Unanswered questions are dropped; the one being answered finishes.
    const pending = this.processing ? this.queue.slice(1) : this.queue;
    for (const q of pending) q.reject?.(new GameError('Questioning has closed.'));
    this.queue = this.processing ? this.queue.slice(0, 1) : [];
    for (const p of this.players) p.questionsLeft = 0;
    this.deadlineAt = cfg.roundSeconds > 0 ? Date.now() + cfg.roundSeconds * 1000 : undefined;
    this.sfx('bell');
    this.changed();
    // Voice the culprit's confession now, so the reveal can play it without a pause.
    const culprit = this.case!.suspects.find((s) => s.id === this.case!.truth.culprit)!;
    for (const line of this.case!.confession ?? []) void speak(line, culprit.voiceId, 'fast', { background: true }).catch(() => {});
    this.armRoundTimer();
    await this.announce(this.accuseText(!!this.accompliceId));
  }

  /** Anyone can ask for more time: it pushes the soft round timer back. */
  moreTime() {
    if (this.phase !== 'investigate' && this.phase !== 'accuse') throw new GameError('There is no clock running right now.');
    const base = Math.max(Date.now(), this.deadlineAt ?? Date.now());
    this.deadlineAt = base + cfg.moreTimeSeconds * 1000;
    this.cancelAutoAdvance();
    this.armRoundTimer(this.deadlineAt);
    this.sfx('tick');
    this.changed();
  }

  /** Soft timer for a round or the vote: when it runs out (and nobody is mid-answer) the game moves on. */
  private armRoundTimer(at?: number) {
    if (cfg.roundSeconds <= 0) return;
    const due = at ?? this.deadlineAt ?? Date.now() + cfg.roundSeconds * 1000;
    const phase = this.phase; const round = this.round;
    this.setPhaseTimer(Math.max(0, due - Date.now()), async () => {
      if (this.phase !== phase || this.round !== round) return;
      await this.queueIdle();
      if (this.phase === phase && this.round === round) await this.next('api');
    });
  }

  /**
   * Everyone is out of questions and nobody is talking: give the room a few seconds to react, then move on.
   * tv:next still works at any time.
   */
  private maybeAutoAdvance() {
    if (cfg.autoAdvanceMs <= 0 || this.phase !== 'investigate' || this.autoTimer) return;
    const active = this.players.filter((p) => p.connected);
    if (!active.length || active.some((p) => p.questionsLeft > 0)) return;
    if (this.queue.length || this.processing) return;
    if (this.emergency && (this.emergency.stage === 'vote' || this.emergency.stage === 'ask')) return;
    const round = this.round;
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      if (this.phase !== 'investigate' || this.round !== round || this.queue.length) return;
      if (this.players.some((p) => p.connected && p.questionsLeft > 0)) return;
      void this.next('api').catch(() => {});
    }, cfg.autoAdvanceMs);
    this.autoTimer.unref?.();
  }

  private cancelAutoAdvance() { if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; } }

  vote(pid: string, v: { culprit: string; item?: string; accomplice?: string }) {
    if (this.phase !== 'accuse') throw new GameError('Voting opens after the third round.');
    const c = this.case!;
    if (!c.suspects.some((s) => s.id === v.culprit)) throw new GameError('Pick one of the suspects.');
    if (v.item && !c.items.some((i) => i.id === v.item)) throw new GameError('Pick one of the items.');
    if (v.accomplice && !this.player(v.accomplice)) throw new GameError('Pick one of the players.');
    const pv = this.priv.get(pid);
    if (!pv) throw new GameError('Join the room first.');
    pv.vote = { culprit: v.culprit, item: v.item, accomplice: v.accomplice };
    if (v.culprit === c.truth.culprit && !this.firstNamed.has(pid)) this.firstNamed.set(pid, Date.now());
    this.sfx('pin');
    this.changed();
    const { count, needed } = this.voteCount();
    if (count >= needed) void this.finishReveal();
  }

  voteCount() {
    const voters = this.players.filter((p) => p.connected || this.priv.get(p.id)?.vote);
    return { count: voters.filter((p) => this.priv.get(p.id)?.vote).length, needed: Math.max(1, voters.length) };
  }

  scores(): Record<string, number> {
    const c = this.case!;
    const scores: Record<string, number> = {};
    const detectives = this.players.filter((p) => p.id !== this.accompliceId);
    let fooled = 0; let caught = 0;
    for (const p of detectives) {
      const v = this.priv.get(p.id)?.vote;
      let s = 0;
      if (v?.culprit === c.truth.culprit) s += 3; else fooled++;
      if (v?.item && v.item === c.crime.item) s += 1;
      if (this.accompliceId && v?.accomplice === this.accompliceId) { s += 2; caught++; }
      scores[p.id] = s;
    }
    // The accomplice scores for every detective fooled, plus a bonus for staying hidden.
    if (this.accompliceId) scores[this.accompliceId] = fooled * 2 + (caught < detectives.length / 2 ? 3 : 0);
    return scores;
  }

  private async finishReveal() {
    if (this.phase !== 'accuse') return;
    const c = this.case!;
    this.phase = 'reveal';
    this.deadlineAt = undefined;
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    const steps = this.engine.proofChain(c);
    const scores = this.scores();
    const detectives = this.players.filter((p) => p.id !== this.accompliceId);
    const named = detectives.filter((p) => this.priv.get(p.id)?.vote?.accomplice === this.accompliceId).length;
    const accompliceCaught = this.accompliceId ? named > detectives.length / 2 : undefined;
    const accompliceLine = this.accompliceId
      ? this.lastAsked.get(this.accompliceId) ?? this.engine.safeLiesForAccomplice(c)[0]?.text
      : undefined;
    const players = this.players.map((p) => ({ id: p.id, name: p.name, score: scores[p.id] ?? 0, role: this.priv.get(p.id)?.role ?? null, correct: this.priv.get(p.id)?.vote?.culprit === c.truth.culprit }));
    const credit = creditDetective(players, this.accompliceId, this.firstNamed);
    const newspaper = { ...buildNewspaper(c, { players, ...credit }), imageUrl: `/api/rooms/${this.code}/front-page.png` };
    this.reveal = { culprit: c.truth.culprit, accomplice: this.accompliceId, item: c.crime.item, steps, scores, accompliceCaught, accompliceLine, sabotage: [...this.sabotageLog], hunches: this.hunchResults(), newspaper };
    this.sfx('gavel');
    this.changed();
    void this.announce(REVEAL_INTRO);
    for (const st of steps) void this.announce(st.therefore);
    this.sfx('reveal');
    await this.announce(this.unmaskText(c));
    // The narrator steps back; the culprit confesses in their own voice.
    await this.afterAudio();
    const culprit = c.suspects.find((s) => s.id === c.truth.culprit)!;
    for (const [i, line] of (c.confession ?? []).entries()) {
      if (this.case !== c) return;
      const sp = await speak(line, culprit.voiceId, 'fast');
      const cc = captionChunks(line);
      const u: Utterance = { id: `confession:${i}`, speaker: culprit.id, speakerName: culprit.name, text: line, audioUrl: sp.audioUrl, marks: sp.marks, at: Date.now(), parts: [{ id: `confession:${i}:0`, text: line, audioUrl: sp.audioUrl, marks: sp.marks, durationMs: sp.durationMs, captionChunks: cc }], partial: false, captionChunks: cc };
      this.pushTranscript(u);
      this.sendUtterance(u);
      this.narrationEndsAt = Math.max(Date.now(), this.narrationEndsAt) + sp.durationMs;
      await this.afterAudio();
    }
    if (this.accompliceId && this.case === c) await this.announce(`And their accomplice, sitting right among you, was ${this.player(this.accompliceId)?.name}.`, { tier: 'fast' });
  }

  /** Resolves when everything the narrator has said so far has finished playing (by its audio length). */
  private async afterAudio() {
    await this.narration;
    const wait = cfg.speechWait <= 0 ? 0 : (this.narrationEndsAt - Date.now()) * cfg.speechWait;
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 120_000)));
  }

  private async showResults() {
    this.phase = 'results';
    const s = this.reveal?.scores ?? {};
    const ranked = [...this.players].sort((a, b) => (s[b.id] ?? 0) - (s[a.id] ?? 0));
    const top = ranked[0];
    const right = this.players.filter((p) => p.id !== this.accompliceId && this.priv.get(p.id)?.vote?.culprit === this.case?.truth.culprit).length;
    this.sfx(right > 0 ? 'win' : 'lose');
    this.changed();
    await this.announce(top ? `${right === 0 ? 'Nobody cracked it this time.' : `${capital(NUM[right] ?? String(right))} of you cracked it.`} Top detective tonight: ${top.name}, with ${s[top.id] ?? 0} points.` : 'Thanks for playing.', { tier: 'fast' });
  }

  private resetToLobby() {
    this.deadlineAt = undefined;
    if (this.proposal) { clearTimeout(this.proposal.timer); this.proposal = null; }
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
    if (this.emergency?.timer) clearTimeout(this.emergency.timer);
    this.firstNamed.clear();
    this.answerWindows.clear(); this.objectionUsed.clear(); this.slipCount = 0; this.partOwner.clear(); this.cancelAutoAdvance();
    this.emergency = null; this.house = null; this.sabotageLog = []; this.smudged.clear(); this.hunches.clear(); this.openHunch = null; this.tutorialAsked.clear();
    this.lastAsked.clear();
    this.phase = 'lobby'; this.round = 0; this.case = null; this.pub = null; this.reveal = undefined;
    this.board = { revealed: [], pinned: [], links: [] };
    this.transcript = []; this.queue = []; this.history.clear(); this.prepChain.clear(); this.accompliceId = null;
    for (const p of this.players) { p.questionsLeft = 0; const pv = this.priv.get(p.id)!; pv.role = null; pv.clueIds = []; pv.vote = undefined; }
    if (this.opts.prewarm) this.prewarm();
    this.changed();
  }

  // ---------- board ----------

  pin(clueId: string) {
    if (this.smudged.has(clueId)) throw new GameError('That clue is smudged until the next round.');
    if (!this.visibleToRoom(clueId)) throw new GameError('That clue is not on the board.');
    if (!this.board.pinned.includes(clueId)) this.board.pinned.push(clueId);
    this.sfx('pin'); this.changed();
  }
  unpin(clueId: string) {
    this.board.pinned = this.board.pinned.filter((x) => x !== clueId);
    this.board.links = this.board.links.filter(([a, b]) => a !== clueId && b !== clueId);
    this.changed();
  }
  link(a: string, b: string) {
    if (a === b || !this.board.pinned.includes(a) || !this.board.pinned.includes(b)) throw new GameError('Pin both clues before linking them.');
    if (!this.board.links.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) this.board.links.push([a, b]);
    this.sfx('string'); this.changed();
  }

  /** Board clues, plus private clues a player has shared by pinning them from the TV board. */
  private visibleToRoom(clueId: string) {
    return this.board.revealed.includes(clueId) || [...this.priv.values()].some((p) => p.clueIds.includes(clueId));
  }

  // ---------- theory proposals ----------

  /** A player puts a theory to the room. It is checked when most agree, or after 15 seconds. */
  propose(pid: string, theory: Theory) {
    const c = this.case;
    if (!c || (this.phase !== 'investigate' && this.phase !== 'accuse')) throw new GameError('There is nothing to prove yet.');
    if (!c.suspects.some((s) => s.id === theory.culprit)) throw new GameError('Pick a suspect for your theory.');
    if (theory.item && !c.items.some((i) => i.id === theory.item)) throw new GameError('Pick one of the items.');
    const p = this.player(pid);
    if (!p) throw new GameError('Join the room first.');
    if (this.proposal && !this.proposal.settled) throw new GameError('One theory at a time. Vote on the one in front of you first.');
    const id = nanoid(8);
    const closesAt = Date.now() + PROPOSAL_MS;
    const timer = setTimeout(() => void this.settleProposal(id), PROPOSAL_MS);
    timer.unref?.();
    this.proposal = { id, by: pid, culprit: theory.culprit, item: theory.item, agree: new Set([pid]), notYet: new Set(), closesAt, timer, settled: false };
    this.heartbeatIfCulprit(theory.culprit);
    if (theory.culprit === c.truth.culprit && !this.firstNamed.has(pid)) this.firstNamed.set(pid, Date.now());
    this.broadcast({ t: 'proposal', id, by: pid, byName: p.name, culprit: theory.culprit, item: theory.item, votes: { agree: [pid], notYet: [] }, needed: this.proposalNeeded(), closesAt });
    this.sfx('pin');
    const sus = c.suspects.find((s) => s.id === theory.culprit)!.name;
    const itm = theory.item ? ` with the ${c.items.find((i) => i.id === theory.item)?.name}` : '';
    void this.announce(`${p.name} thinks it was ${sus}${itm}. Do you agree? Vote on your phone.`, { tier: 'fast' });
    if (this.proposal.agree.size >= this.proposalNeeded()) void this.settleProposal(id);
    return id;
  }

  voteProposal(pid: string, proposalId: string, agree: boolean) {
    const pr = this.proposal;
    if (!pr || pr.id !== proposalId || pr.settled) throw new GameError('That vote has already closed.');
    if (!this.player(pid)) throw new GameError('Join the room first.');
    pr.agree.delete(pid); pr.notYet.delete(pid);
    (agree ? pr.agree : pr.notYet).add(pid);
    const needed = this.proposalNeeded();
    this.broadcast({ t: 'proposal:votes', id: pr.id, agree: [...pr.agree], notYet: [...pr.notYet], needed });
    if (pr.agree.size >= needed) void this.settleProposal(pr.id);
  }

  private proposalNeeded() {
    const n = this.players.filter((p) => p.connected).length || 1;
    return Math.floor(n / 2) + 1;
  }

  private async settleProposal(id: string) {
    const pr = this.proposal;
    if (!pr || pr.id !== id || pr.settled) return;
    pr.settled = true;
    clearTimeout(pr.timer);
    if (!this.case || (this.phase !== 'investigate' && this.phase !== 'accuse')) return;
    const clues = Array.from(new Set([...this.board.revealed, ...this.board.pinned])).filter((x) => !this.smudged.has(x));
    await this.proveIt({ culprit: pr.culprit, item: pr.item }, { clueIds: clues, proposalId: pr.id });
  }

  async proveIt(theory: Theory, opts: { clueIds?: string[]; proposalId?: string } = {}) {
    const c = this.case;
    if (!c || (this.phase !== 'investigate' && this.phase !== 'accuse')) throw new GameError('There is nothing to prove yet.');
    if (!c.suspects.some((s) => s.id === theory.culprit)) throw new GameError('Pick a suspect for your theory.');
    const t0 = Date.now();
    if (!opts.proposalId) this.heartbeatIfCulprit(theory.culprit);
    const verdict = await this.engine.evaluateTheory(c, opts.clueIds ?? this.board.pinned, theory);
    this.timing('theory', Date.now() - t0);
    const name = c.suspects.find((s) => s.id === theory.culprit)!.name;
    const item = theory.item ? c.items.find((i) => i.id === theory.item)?.name : undefined;
    const what = item ? `${name} with the ${item}` : name;
    const which = opts.clueIds ? 'clues on the board' : 'pinned clues';
    const explanation = verdict === 'follows'
      ? `The ${which} prove it. It has to be ${what}.`
      : verdict === 'possible'
        ? `Nothing in the ${which} rules out ${what}, but nothing proves it either. Keep digging.`
        : `One of the ${which} rules out ${what}. Look again.`;
    this.board.lastVerdict = { theory, verdict, at: Date.now() };
    this.broadcast({ t: 'verdict', theory, verdict, explanation, ...(opts.proposalId ? { proposalId: opts.proposalId } : {}) });
    this.sfx(verdict === 'follows' ? 'win' : verdict === 'possible' ? 'tick' : 'lose');
    this.changed();
    void this.announce(explanation, { tier: 'fast' });
    return { verdict, explanation };
  }

  // ---------- questions ----------

  ask(pid: string, suspectId: string, text: string, via: 'voice' | 'typed' | 'api', opts: { early?: boolean } = {}): Promise<Utterance> {
    const c = this.case;
    // A voice assistant asking a real suspect means the investigation has begun: never hand its question to
    // the practice character (it would answer as the butler under the suspect's name).
    if (via === 'api' && this.phase === 'tutorial' && c?.suspects.some((s) => s.id === suspectId)) {
      if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
      void this.beginRound(1).catch(() => {});
    }
    const tutorial = this.phase === 'tutorial';
    if ((this.phase !== 'investigate' && !tutorial) || !c) throw new GameError('Questions open once the first round begins.');
    if (tutorial) {
      // The practice question always goes to the house character, whoever was picked on the phone.
      suspectId = 'house';
    } else if (!c.suspects.some((s) => s.id === suspectId)) throw new GameError('That suspect is not in this case.');
    const q = (text ?? '').trim().slice(0, 300);
    if (!q) throw new GameError('I did not catch a question there.');
    let lang: Lang = 'en';
    if (via !== 'api') {
      if (this.isAudience(pid)) throw new GameError('The audience can cast hunches, but only players can ask questions.');
      const p = this.player(pid);
      if (!p) throw new GameError('Join the room first.');
      if (this.queue.some((x) => x.playerId === pid && x !== this.queue[0])) throw new GameError('Your question is already in line.');
      const e = this.emergency;
      if (tutorial) {
        if (this.tutorialAsked.has(pid)) throw new GameError('That was your practice question. The real ones start soon.');
        this.tutorialAsked.add(pid);
        p.questionsLeft = 0;
      } else if (e && e.stage === 'ask' && e.suspectId === suspectId) {
        // The emergency question is free and goes to whoever asks first.
        e.stage = 'done'; e.askedBy = pid; if (e.timer) clearTimeout(e.timer);
      } else {
        if (p.questionsLeft <= 0) throw new GameError('You have used your questions this round.');
        p.questionsLeft--;
      }
      lang = this.priv.get(pid)?.lang ?? 'en';
    }
    const item: QueueItem = { id: nanoid(10), playerId: pid, suspectId, text: q, via, lang, queuedAt: Date.now(), live: new LiveAnswer() };
    // Start thinking right away, in parallel with whoever is talking now. Questions to the same
    // suspect are prepared in order so each answer sees the previous one.
    const before = this.prepChain.get(suspectId) ?? Promise.resolve();
    const run = before.then(() => this.prepare(item));
    this.prepChain.set(suspectId, run.catch(() => {}));
    const done = new Promise<Utterance>((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
    done.catch(() => {});
    this.queue.push(item);
    this.changed();
    void this.processQueue();
    return opts.early ? this.checkedText(item, done) : done;
  }

  /**
   * The answer as soon as every sentence has passed the claim check, without waiting for its voice or its turn
   * in the queue (the room still plays it in order). Audio urls are included only when already rendered.
   */
  private async checkedText(item: QueueItem, done: Promise<Utterance>): Promise<Utterance> {
    const live = item.live;
    while (!live.done) await live.wait();
    const suspect = this.speakerFor(item.suspectId);
    const texts = live.parts.length ? live.parts.map((p) => p.text) : [deflectionsFor(suspect.id)[0]];
    void done; // the queue still voices it (the same stand-in line when nothing passed)
    const ready = await Promise.all(live.parts.map((p) => Promise.race([p.speech.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 0))])));
    const parts = texts.map((text, i) => ({ id: `${item.id}:${i}`, text, audioUrl: ready[i]?.audioUrl, marks: ready[i]?.marks, durationMs: ready[i]?.durationMs }));
    const single = parts.length === 1 ? parts[0] : undefined;
    return {
      id: item.id, speaker: suspect.id, speakerName: suspect.name, text: texts.join(' '), at: Date.now(),
      question: live.english ?? item.text, parts, partial: false, audioUrl: single?.audioUrl, marks: single?.marks,
    };
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        const item = this.queue[0];
        try {
          const u = await this.speakAnswer(item);
          item.resolve?.(u);
        } catch (e) {
          log.error('answer failed', e);
          item.reject?.(e);
        }
        this.queue.shift();
        this.speaking = null;
        this.changed();
      }
    } finally {
      this.processing = false;
    }
    this.maybeAutoAdvance();
  }

  /** Plays one answer: a thinking filler if nothing is ready, then each checked sentence the moment it is voiced. */
  private async speakAnswer(item: QueueItem): Promise<Utterance> {
    const live = item.live;
    const suspect = this.speakerFor(item.suspectId);
    const turnAt = Date.now();
    this.speaking = suspect.id;
    this.sfx('thinking');
    this.changed();
    let speechEnd = Date.now();
    const t: Record<string, unknown> = { waitedMs: turnAt - item.queuedAt };
    if (!live.parts.length && !live.done) {
      const f = await this.filler(suspect);
      if (f && !live.parts.length) {
        const fu: Utterance = { id: `${item.id}-f`, speaker: suspect.id, speakerName: suspect.name, text: f.text, audioUrl: f.speech.audioUrl, marks: f.speech.marks, at: Date.now(), askedBy: item.via === 'api' ? undefined : item.playerId, filler: true };
        this.broadcast({ t: 'utterance', u: fu });
        t.fillerMs = Date.now() - item.queuedAt;
        speechEnd = Date.now() + f.speech.durationMs;
      }
    }
    const u: Utterance = {
      id: item.id, speaker: suspect.id, speakerName: suspect.name, text: '', at: Date.now(),
      askedBy: item.via === 'api' ? undefined : item.playerId, question: item.text, parts: [], partial: true,
    };
    for (let i = 0; ;) {
      if (i < live.parts.length) {
        const p = live.parts[i];
        const sp = await p.speech;
        const part = { id: `${u.id}:${i}`, text: p.text, audioUrl: sp.audioUrl, marks: sp.marks, durationMs: sp.durationMs, captionChunks: captionChunks(p.text) };
        u.parts!.push(part);
        u.text = u.parts!.map((x) => x.text).join(' ');
        u.captionChunks = u.parts!.flatMap((x) => x.captionChunks ?? []);
        u.question = live.english ?? item.text;
        if (i === 0) { u.audioUrl = part.audioUrl; u.marks = part.marks; t.firstPartMs = Date.now() - item.queuedAt; t.firstSentenceMs = live.result?.ms.firstSentence ?? (p.readyAt - item.queuedAt); }
        u.partial = !(live.done && i === live.parts.length - 1);
        this.sendUtterance({ ...u, parts: [...u.parts!] });
        speechEnd = Math.max(Date.now(), speechEnd) + sp.durationMs;
        this.partOwner.set(part.id, u.id); this.partOwner.set(u.id, u.id);
        if (suspect.id !== 'house') this.answerWindows.set(u.id, { suspectId: suspect.id, claims: [], endsAt: speechEnd, durationMs: u.parts!.reduce((n, x) => n + (x.durationMs ?? 0), 0) });
        i++;
        continue;
      }
      if (live.done) break;
      await live.wait();
    }
    if (!u.parts!.length) {
      // The model and the check both failed hard; stay in character anyway.
      const line = deflectionsFor(suspect.id)[0];
      const sp = await speak(line, suspect.voiceId, 'fast');
      u.parts!.push({ id: `${u.id}:0`, text: line, audioUrl: sp.audioUrl, marks: sp.marks, durationMs: sp.durationMs });
      u.text = line; u.audioUrl = sp.audioUrl; u.marks = sp.marks; u.partial = false;
      this.sendUtterance({ ...u, parts: [...u.parts!] });
      speechEnd = Math.max(Date.now(), speechEnd) + sp.durationMs;
      t.firstPartMs = Date.now() - item.queuedAt;
    } else if (u.partial) {
      u.partial = false;
      this.sendUtterance({ ...u, parts: [...u.parts!] });
    }
    u.at = Date.now();
    this.finalPart.set(`${u.id}:${u.parts!.length - 1}`, u.id);
    if (suspect.id !== 'house' && this.phase === 'investigate') {
      this.openHunchFor(u, live.result?.claims ?? []);
      const prev = this.answerWindows.get(u.id);
      this.answerWindows.set(u.id, { suspectId: suspect.id, claims: live.result?.claims ?? [], endsAt: prev?.endsAt ?? speechEnd, durationMs: u.parts!.reduce((n, x) => n + (x.durationMs ?? 0), 0) });
      if (this.answerWindows.size > 100) this.answerWindows.delete(this.answerWindows.keys().next().value!);
    }
    const r = live.result;
    this.timing('answer', Date.now() - item.queuedAt, {
      ...t, fullMs: Date.now() - item.queuedAt, translateMs: live.translateMs, final: r?.final, sentences: u.parts!.length,
      dropped: r?.dropped, modelMs: r?.ms.gen, extractMs: r?.ms.extract,
    });
    this.pushTranscript({ ...u, parts: [...u.parts!] });
    this.changed();
    await this.waitForSpeech(u.id, speechEnd - Date.now());
    return u;
  }

  /** A suspect, or the house character during the practice question. */
  private speakerFor(id: string): { id: string; name: string; role: string; voiceId: string; traits: string[] } {
    if (id === 'house') return this.house ?? houseFor(this.pub!);
    return this.case!.suspects.find((s) => s.id === id)!;
  }

  private async filler(s: { id: string; role: string; traits: string[]; voiceId: string }): Promise<{ text: string; speech: Speech } | null> {
    const options = fillersFor(s).filter((f) => f !== this.lastFiller.get(s.id));
    const text = options[Math.floor(Math.random() * options.length)];
    this.lastFiller.set(s.id, text);
    // Fillers are voiced at case start; never let a slow one hold up the real answer.
    const sp = await Promise.race([speak(text, s.voiceId, 'fast'), new Promise<null>((r) => setTimeout(() => r(null), 250))]);
    return sp?.audioUrl || (sp && cfg.ttsProvider !== 'polly') ? { text, speech: sp! } : null;
  }

  /** Writes the answer sentence by sentence, starting each voice as soon as its sentence passes the check. */
  private async prepare(item: QueueItem): Promise<void> {
    const live = item.live;
    try {
      const c = this.case!; const pub = this.pub!;
      const t0 = Date.now();
      const suspect = this.speakerFor(item.suspectId);
      const asker = this.player(item.playerId);
      const names = [...c.suspects.map((s) => s.name), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name)];
      let english = item.lang === 'en' ? item.text : await translate(item.text, item.lang, 'en');
      english = correctNames(english, names);
      live.english = english;
      if (item.via !== 'api' && item.suspectId !== 'house') this.lastAsked.set(item.playerId, english);
      live.translateMs = Date.now() - t0;
      if (item.suspectId === 'house') {
        for (const text of await houseReply(this.house ?? houseFor(pub), pub, english)) {
          const speech = speak(text, suspect.voiceId, 'fast'); speech.catch(() => {});
          live.parts.push({ text, speech, readyAt: Date.now() }); live.notify();
        }
        return;
      }
      const hist = this.history.get(item.suspectId) ?? [];
      const prompt = asker ? `${asker.name} asks: ${english}` : english;
      const reply = await suspectReply({
        engine: this.engine, c, pub, suspectId: item.suspectId, question: prompt, rawQuestion: english, history: hist, room: this.code,
        onSentence: (text) => {
          const speech = speak(text, suspect.voiceId, 'fast');
          speech.catch(() => {});
          live.parts.push({ text, speech, readyAt: Date.now() });
          live.notify();
        },
      });
      live.result = reply;
      hist.push({ q: prompt, a: reply.text }); this.history.set(item.suspectId, hist.slice(-8));
    } catch (e) {
      live.error = e;
      log.error('prepare failed', e);
    } finally {
      live.done = true;
      live.notify();
    }
  }

  /** TV tells us when audio ends; otherwise we wait about as long as the lines take to say. */
  private waitForSpeech(id: string, remainingMs: number): Promise<void> {
    const wait = cfg.speechWait <= 0 ? 0 : Math.min(30_000, Math.max(0, remainingMs) * cfg.speechWait + 700);
    if (wait === 0) return Promise.resolve();
    const tvConnected = [...this.clients].some((c) => c.role === 'tv');
    return new Promise((resolve) => {
      const timer = setTimeout(done, tvConnected ? wait + 1500 : wait);
      const self = this;
      function done() { clearTimeout(timer); self.spokenWaiters.delete(id); resolve(); }
      this.spokenWaiters.set(id, done);
    });
  }

  /** Resolves once every narrator line queued so far has gone out. */
  narrationIdle(): Promise<void> { return this.narration; }

  /** The TV finished playing an utterance (or its last part). */
  spoken(id: string) {
    const uid = this.finalPart.get(id) ?? id;
    this.spokenWaiters.get(uid)?.();
    // The room has now heard the whole answer: objections get 6 s from here, hunches 20 s.
    const owner = this.partOwner.get(id) ?? id;
    const isLast = this.finalPart.has(id) || owner === id;
    if (isLast) this.heard(owner, Date.now());
  }

  /** The TV started playing an utterance (or one of its parts). Windows are measured from real playback. */
  playing(id: string) {
    const owner = this.partOwner.get(id) ?? id;
    const w = this.answerWindows.get(owner);
    if (!w) return;
    const partIdx = id === owner ? 0 : Number(id.slice(owner.length + 1)) || 0;
    if (partIdx === 0) this.heard(owner, Date.now() + w.durationMs);
  }

  private heard(uid: string, endsAt: number) {
    const w = this.answerWindows.get(uid);
    if (w) w.endsAt = endsAt;
    const h = this.hunches.get(uid);
    if (h) { h.closesAt = endsAt + HUNCH_MS; this.changed(); }
  }

  // ---------- narration and messaging ----------

  /** Narrator line for everyone (or one phone). Voices are made in parallel but lines go out in call order. */
  announce(text: string, opts: { only?: Client; tier?: VoiceTier; id?: string; speech?: string; lobbyOnly?: boolean } = {}): Promise<void> {
    // Long narration is split into pieces of at most two sentences; each piece is its own caption and audio.
    const pieces = opts.speech ? [text] : twoSentenceChunks(text);
    let last: Promise<void> = Promise.resolve();
    pieces.forEach((piece, k) => {
      const id = k === 0 ? opts.id : opts.id ? `${opts.id}.${k}` : undefined;
      last = this.announceOne(piece, { ...opts, id, speech: k === 0 ? opts.speech : undefined });
    });
    return last;
  }

  private announceOne(text: string, opts: { only?: Client; tier?: VoiceTier; id?: string; speech?: string; lobbyOnly?: boolean }): Promise<void> {
    const t0 = Date.now();
    const caption = cleanCaption(text);
    const said = opts.speech ?? caption;
    const speech = narrate(said, opts.tier ?? 'narrator');
    const turn = this.narration.then(async () => {
      const sp = await speech;
      if (opts.lobbyOnly && this.phase !== 'lobby') return; // stale lobby chatter: drop it
      this.timing('narration', Date.now() - t0, { cached: sp.cached, chars: said.length });
      const id = opts.id ?? nanoid(8);
      // Word marks only line up with the caption when the caption is exactly what was said.
      const marks = opts.speech ? undefined : sp.marks;
      const msg = { t: 'announce' as const, text: caption, ...(opts.speech ? { speech: opts.speech } : {}), captionChunks: captionChunks(caption), audioUrl: sp.audioUrl, marks, id };
      if (opts.only) { await this.sendLocalized(opts.only, msg); return; }
      if (this.phase !== 'lobby') this.pushTranscript({ id, speaker: 'narrator', speakerName: 'Narrator', text: caption, audioUrl: sp.audioUrl, at: Date.now(), marks, captionChunks: msg.captionChunks });
      for (const c of this.clients) void this.sendLocalized(c, msg);
      this.narrationEndsAt = Math.max(Date.now(), this.narrationEndsAt) + sp.durationMs;
      this.changed();
    });
    this.narration = turn.catch(() => {});
    return turn;
  }

  private sendUtterance(u: Utterance) {
    for (const c of this.clients) void this.sendLocalized(c, { t: 'utterance', u });
  }

  /** Phones with a non English language get a translated copy alongside the original. */
  private async sendLocalized(c: Client, msg: ServerToClient) {
    const lang = c.playerId ? this.priv.get(c.playerId)?.lang ?? 'en' : 'en';
    if (lang === 'en' || c.role !== 'phone') { c.send(msg); return; }
    if (msg.t === 'utterance') c.send({ t: 'utterance', u: { ...msg.u, translated: await translate(msg.u.text, 'en', lang) } });
    else if (msg.t === 'announce') c.send({ ...msg, translated: await translate(msg.text, 'en', lang) });
    else c.send(msg);
  }

  async readClues(pid: string) {
    const pv = this.priv.get(pid);
    if (!pv) throw new GameError('Join the room first.');
    const target = [...this.clients].find((c) => c.playerId === pid);
    if (!target) return;
    // Sent directly (not through the narration line) so it is quick; the audio is usually pre-made.
    const text = this.cluesText(pid);
    const sp = await narrate(text, 'fast');
    // Secret content: this goes to the one phone that asked, never the TV.
    await this.sendLocalized(target, { t: 'announce', text, captionChunks: captionChunks(text), audioUrl: sp.audioUrl, marks: sp.marks, id: nanoid(8) });
  }

  private cluesText(pid: string): string {
    const pv = this.priv.get(pid)!;
    const clues = pv.clueIds.map((id) => this.case?.clues.find((c) => c.id === id)).filter(Boolean) as Clue[];
    const role = pv.role === 'accomplice' && this.case
      ? `You are the accomplice. You are covering for ${this.case.suspects.find((s) => s.id === this.case!.truth.culprit)?.name}. `
      : pv.role === 'detective' ? 'You are a detective. ' : '';
    return clues.length ? `${role}Your private clues. ${clues.map((c, i) => `${i + 1}. ${c.title}. ${c.text}`).join(' ')}` : `${role}You have no private clues yet.`;
  }

  /** Make each player's "read my clues" audio ahead of time so the button answers fast. */
  private prewarmClueAudio() {
    for (const p of this.players) void narrate(this.cluesText(p.id), 'fast', { background: true }).catch(() => {});
  }

  setNotes(pid: string, text: string) {
    const pv = this.priv.get(pid);
    if (!pv) throw new GameError('Join the room first.');
    pv.notes = String(text ?? '').slice(0, 4000);
    this.flushYou(pid);
  }

  sfx(name: SfxName) { this.broadcast({ t: 'sfx', name }); }

  broadcast(msg: ServerToClient) { for (const c of this.clients) c.send(msg); }

  private pushTranscript(u: Utterance) {
    this.transcript.push(u);
    if (this.transcript.length > 50) this.transcript.splice(0, this.transcript.length - 50);
  }

  timing(kind: string, ms: number, detail?: Record<string, unknown>) {
    this.timings.push({ kind, ms, detail });
    if (this.timings.length > 500) this.timings.shift();
  }

  /** Used by the GameApi for solo accusations without a vote. */
  evaluateRevealed(culprit: string, item?: string) {
    return this.engine.evaluateTheory(this.case!, this.case!.clues.filter((c) => this.board.revealed.includes(c.id)).map((c) => c.id), { culprit, item });
  }
  proof() { return this.engine.proofChain(this.case!); }

  roomName(id: string) { return this.case?.rooms.find((r) => r.id === id)?.name ?? id; }

  // ---------- crash recovery ----------

  /**
   * Everything needed to rebuild this room after a restart. The case itself is not stored: it is regenerated
   * from its seed, which the engine guarantees is deterministic. Public state is kept alongside for inspection.
   */
  snapshot(): RoomState & { restore: RoomRestore } {
    const c = this.case;
    return {
      ...this.publicState(),
      restore: {
        v: 1, savedAt: Date.now(),
        case: c ? { seed: c.seed, tone: c.tone, difficulty: c.difficulty, id: c.id, slips: c.clues.filter((x) => x.id.startsWith('slip-')) } : null,
        players: this.players.map((p) => ({ ...p })),
        priv: Object.fromEntries([...this.priv].map(([k, v]) => [k, { ...v, clueIds: [...v.clueIds] }])),
        accompliceId: this.accompliceId,
        board: { ...this.board, revealed: [...this.board.revealed], pinned: [...this.board.pinned], links: this.board.links.map(([a, b]) => [a, b] as [string, string]) },
        smudged: [...this.smudged], sabotageLog: [...this.sabotageLog], objectionUsed: [...this.objectionUsed], slipCount: this.slipCount,
        tutorialAsked: [...this.tutorialAsked], lastAsked: Object.fromEntries(this.lastAsked),
        hunches: [...this.hunches].map(([id, h]) => ({ id, lied: h.lied, closesAt: h.closesAt, votes: [...h.votes] })),
        history: Object.fromEntries(this.history),
        emergency: this.emergency ? (({ timer: _t, ballots, ...rest }) => ({ ...rest, ballots: [...ballots] }))(this.emergency) : null,
        audience: this.audience.map((a) => ({ ...a })),
        reveal: this.reveal ?? null,
      },
    };
  }

  /** Rebuild a room from snapshot() output. Returns null if the snapshot is unusable (old format, case mismatch). */
  static async restore(code: string, engine: Engine, snap: unknown): Promise<Room | null> {
    const s = snap as (RoomState & { restore?: RoomRestore }) | null;
    const r = s?.restore;
    if (!s || !r || r.v !== 1) return null;
    const room = new Room(code, engine, s.tone);
    if (r.case) {
      const { c } = await engine.generateVerifiedCase({ seed: r.case.seed, tone: r.case.tone, difficulty: r.case.difficulty, suspectCount: 5 }, 1);
      if (c.id !== r.case.id) { log.warn(`room ${code}: case ${r.case.id} regenerated as ${c.id}; not restoring`); return null; }
      c.clues.push(...r.case.slips);
      room.case = c;
      room.pub = engine.publicView(c);
      room.house = s.house ? houseFor(room.pub) : null;
    }
    room.phase = s.phase; room.round = s.round; room.hostId = s.hostId; room.deadlineAt = s.deadlineAt;
    room.players = r.players.map((p) => ({ ...p, connected: false }));
    for (const [k, v] of Object.entries(r.priv)) room.priv.set(k, v);
    room.accompliceId = r.accompliceId;
    room.board = r.board;
    room.transcript = s.transcript ?? [];
    room.smudged = new Set(r.smudged); room.sabotageLog = r.sabotageLog; room.objectionUsed = new Set(r.objectionUsed); room.slipCount = r.slipCount;
    room.tutorialAsked = new Set(r.tutorialAsked); room.lastAsked = new Map(Object.entries(r.lastAsked));
    for (const h of r.hunches) room.hunches.set(h.id, { lied: h.lied, closesAt: h.closesAt, votes: new Map(h.votes) });
    room.history = new Map(Object.entries(r.history));
    room.audience = r.audience.map((a) => ({ ...a, connected: false }));
    room.reveal = r.reveal ?? undefined;
    if (r.emergency) {
      const e = { ...r.emergency, ballots: new Map(r.emergency.ballots) } as NonNullable<Room['emergency']>;
      room.emergency = e;
      // Timers do not survive a restart: give whatever stage was open a fresh window.
      if (e.stage === 'vote' || e.stage === 'ask') {
        e.closesAt = Date.now() + EMERGENCY_MS;
        e.timer = setTimeout(() => (e.stage === 'vote' ? room.closeEmergencyVoteNow() : (e.stage = 'done')), EMERGENCY_MS);
        e.timer.unref?.();
      }
    }
    if (room.phase === 'tutorial') room.setPhaseTimer(TUTORIAL_MS, async () => { if (room.phase === 'tutorial') await room.beginRound(1); });
    if (room.phase === 'lobby') room.opts.prewarm = true;
    log.info(`room ${code} restored at ${room.phase}${room.round ? ` round ${room.round}` : ''} with ${room.players.length} players`);
    return room;
  }

  closeEmergencyVoteNow() { this.closeEmergencyVote(); }

  // ---------- state ----------

  changed() {
    this.lastActive = Date.now();
    this.onChange?.();
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => { this.flushScheduled = false; this.flush(); });
  }

  flush() {
    const state = this.publicState();
    for (const c of this.clients) {
      c.send({ t: 'room:state', state });
      if (c.role === 'phone' && c.playerId) void this.sendYou(c, c.playerId);
    }
  }

  flushYou(pid: string) {
    for (const c of this.clients) if (c.playerId === pid && c.role === 'phone') void this.sendYou(c, pid);
  }

  publicState(): RoomState {
    return {
      code: this.code, phase: this.phase, round: this.round, tone: this.tone,
      players: this.players.map((p) => ({ ...p })), hostId: this.hostId, case: this.pub,
      board: {
        revealed: [...this.board.revealed], pinned: [...this.board.pinned], links: this.board.links.map(([a, b]) => [a, b] as [string, string]), lastVerdict: this.board.lastVerdict,
        cards: this.boardClues(),
        smudged: [...this.smudged],
      },
      transcript: this.transcript.slice(-50), speaking: this.speaking,
      queue: this.queue.map((q) => ({ playerId: q.playerId, suspectId: q.suspectId })),
      votes: this.voteCount(),
      reveal: this.phase === 'reveal' || this.phase === 'results' ? this.reveal : undefined,
      deadlineAt: this.deadlineAt,
      house: this.house ? { id: 'house', name: this.house.name, role: this.house.role, portrait: this.house.portrait } : undefined,
      emergency: this.emergency ? { stage: this.emergency.stage, closesAt: this.emergency.closesAt, votes: { ...this.emergency.votes }, voters: [...this.emergency.voters], suspectId: this.emergency.suspectId, askedBy: this.emergency.askedBy } : undefined,
      hunch: this.openHunch && this.hunches.get(this.openHunch) && Date.now() <= this.hunches.get(this.openHunch)!.closesAt
        ? { utteranceId: this.openHunch, ...this.hunchTally(this.openHunch), closesAt: this.hunches.get(this.openHunch)!.closesAt } : undefined,
      audience: this.audience.map((a) => ({ ...a })),
    };
  }

  /** Card text for everything on the board: revealed clues plus private clues someone pinned to share. */
  boardClues(): Clue[] {
    return (this.case?.clues ?? []).filter((c) => this.board.revealed.includes(c.id) || this.board.pinned.includes(c.id))
      .map(stripClue).map((c) => (this.smudged.has(c.id) ? { ...c, text: 'Smudged. Someone spilled the port on this one.' } : c));
  }

  youState(pid: string): YouState {
    const pv = this.priv.get(pid);
    const c = this.case;
    const you: YouState = { playerId: pid, role: pv?.role ?? null, privateClues: [], notes: pv?.notes ?? '', vote: pv?.vote, lang: pv?.lang ?? 'en' };
    if (this.isAudience(pid)) you.audience = true;
    if (this.phase === 'tutorial') you.tutorialQuestionUsed = this.tutorialAsked.has(pid);
    if (this.player(pid)) you.objectionUsed = this.objectionUsed.has(pid);
    if (!pv || !c) return you;
    you.privateClues = pv.clueIds.map((id) => c.clues.find((x) => x.id === id)!).filter(Boolean).map(stripClue);
    if (pv.role === 'accomplice') {
      you.knowsCulprit = c.truth.culprit;
      you.safeLies = this.engine.safeLiesForAccomplice(c);
      you.sabotage = { available: this.sabotageLog.length === 0 && this.phase === 'investigate', options: this.sabotageOptions() };
    }
    return you;
  }

  private async sendYou(c: Client, pid: string) {
    const you = this.youState(pid);
    const lang = you.lang ?? 'en';
    if (lang === 'en') { c.send({ t: 'you:state', you }); return; }
    // Send what we have translated right away; translate the rest and send again.
    const texts = [...you.privateClues.flatMap((x) => [x.title, x.text]), ...(you.safeLies ?? []).map((l) => l.text)];
    const missing = texts.filter((t) => cachedTranslation(t, 'en', lang) === undefined);
    const apply = (y: YouState): YouState => ({
      ...y,
      privateClues: y.privateClues.map((x) => ({ ...x, title: cachedTranslation(x.title, 'en', lang) ?? x.title, text: cachedTranslation(x.text, 'en', lang) ?? x.text })),
      safeLies: y.safeLies?.map((l) => ({ ...l, text: cachedTranslation(l.text, 'en', lang) ?? l.text })),
    });
    c.send({ t: 'you:state', you: apply(you) });
    if (missing.length) {
      await Promise.all(missing.map((t) => translate(t, 'en', lang)));
      c.send({ t: 'you:state', you: apply(this.youState(pid)) });
    }
  }
}

/** Whether a clue is key to the solution stays server side. */
function stripClue(c: Clue): Clue {
  const { key: _k, ...rest } = c;
  return rest;
}

export interface RoomRestore {
  v: 1; savedAt: number;
  case: { seed: number; tone: Tone; difficulty: 1 | 2 | 3; id: string; slips: Clue[] } | null;
  players: Player[];
  priv: Record<string, PlayerPriv>;
  accompliceId: string | null;
  board: BoardState;
  smudged: string[];
  sabotageLog: NonNullable<NonNullable<RoomState['reveal']>['sabotage']>;
  objectionUsed: string[]; slipCount: number;
  tutorialAsked: string[]; lastAsked: Record<string, string>;
  hunches: { id: string; lied: boolean; closesAt: number; votes: [string, boolean][] }[];
  history: Record<string, HistoryTurn[]>;
  emergency: (NonNullable<RoomState['emergency']> & { ballots: [string, string][] }) | null;
  audience: { id: string; name: string; connected: boolean }[];
  reveal: RoomState['reveal'] | null;
}

const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const TUTORIAL_MS = 60_000;
const OBJECTION_GRACE_MS = 6_000;
const BRIEFING_GRACE_MS = 12_000;
const WELCOME_BATCH_MS = Number(process.env.WELCOME_BATCH_MS ?? 2500);

/** Used until the engine provides objectionSlip(): reveals only what the lie hides, gently for the guilty. */
function fallbackSlip(c: Case, suspectId: string, claims: Claim[]): ObjectionResult {
  const s = c.suspects.find((x) => x.id === suspectId)!;
  const rn = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  for (const cl of claims) {
    if (cl.s !== suspectId) continue;
    const lie = c.lies.find((l) => l.s === suspectId && l.slot === cl.slot && l.claimedRoom === cl.room);
    if (!lie) continue;
    const at = c.slots.find((x) => x.id === lie.slot)?.label ?? '';
    if (lie.reason === 'guilt') {
      const fact: Fact = { k: 'notAt', s: suspectId, room: lie.claimedRoom, slot: lie.slot };
      return { wasLying: true, line: `All right, all right! I was not in the ${rn(lie.claimedRoom)} at ${at}. That proves nothing!`, fact, factText: `${s.name} was not in the ${rn(lie.claimedRoom)} at ${at}.` };
    }
    const fact: Fact = { k: 'at', s: suspectId, room: lie.trueRoom, slot: lie.slot };
    return { wasLying: true, line: `Oh, fine! I was in the ${rn(lie.trueRoom)} at ${at}. Happy now?`, fact, factText: `${s.name} was really in the ${rn(lie.trueRoom)} at ${at}.` };
  }
  return { wasLying: false, line: 'Objection overruled, I am afraid. Every word of that was true.' };
}
const EMERGENCY_MS = 45_000;
const HUNCH_MS = 20_000;
const EMERGENCY_TEXT = 'Emergency meeting! On your phones, choose one suspect who must answer an extra question, in front of everyone.';
const ROLE_LINE = 'Check your phone for your secret role.';
const PROPOSAL_MS = 15_000;
const REVEAL_INTRO = 'The votes are in. Let us walk through it, clue by clue.';

function cleanName(n: string) { return String(n ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20); }
function capital(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
export type { WordMark };
