// Builds one McpServer for one connection. Game state lives in the GameApi and the detective record,
// both keyed by household, so nothing here depends on the MCP session surviving.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, Icon, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { z } from 'zod';
import type { CaseSummary, ClueCard, GameApi, GameApiSource, SuspectCard, Tone } from './types.ts';
import { bestMatch } from './match.ts';
import { BOARD_HTML, SKILL_MD } from './ui/board.ts';
import { favouriteSuspect, isoWeek, weekSeed, type DetectiveRecord, type RecordStore } from './records.ts';

export const BOARD_URI = 'ui://accomplice/board.html';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';
export const SKILL_URI = 'accomplice://skill/SKILL.md';
export const SERVER_NAME = 'accomplice';
export const SERVER_VERSION = '0.3.0';

export interface BuildContext {
  source: GameApiSource;
  household: string;
  taskStore: TaskStore;
  records: RecordStore;
  updateRecord: (household: string, fn: (r: DetectiveRecord) => void) => Promise<DetectiveRecord>;
  /** Narrator voice when the game itself has none. */
  narrate?: (text: string) => Promise<{ audioUrl?: string }> | { audioUrl?: string };
  /** Absolute origin used to turn relative portrait/audio paths into full URLs. */
  publicBaseUrl?: string;
}

// ---------- icons (small inline SVGs, brass on transparent) ----------

function icon(body: string): Icon[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#C9A24A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return [{ src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, mimeType: 'image/svg+xml', sizes: ['any'] }];
}
const ICONS = {
  app: icon('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/><path d="M8 10h4"/>'),
  start: icon('<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 13h8M8 17h5"/>'),
  summary: icon('<path d="M3 6h7l2 2h9v11H3z"/><path d="M7 13h10"/>'),
  suspects: icon('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5"/>'),
  ask: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9a2 2 0 1 1 2 2v1"/>'),
  clue: icon('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>'),
  hint: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  next: icon('<rect x="4" y="5" width="10" height="13" rx="1" transform="rotate(-6 9 11)"/><path d="M14 8h5v12H9v-2"/>'),
  accuse: icon('<path d="m14 4 6 6M11 7l6 6M12.5 5.5l-6 6 3 3 6-6"/><path d="M8 13 3 18l3 3 5-5"/><path d="M14 21h7"/>'),
  record: icon('<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z"/>'),
  resume: icon('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>'),
  tv: icon('<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/>'),
};

// ---------- result helpers ----------

type View = 'case' | 'suspects' | 'reply' | 'clue' | 'clues' | 'hint' | 'confirm' | 'verdict' | 'empty' | 'notice' | 'record' | 'handoff';

const uiMeta = { ui: { resourceUri: BOARD_URI } };

/** Every result: a spoken line, a plain text copy for voice-only hosts, and data for the board. */
function reply(view: View, speech: string, data: Record<string, unknown> = {}, extraText?: string): CallToolResult {
  return {
    content: [{ type: 'text', text: extraText ? `${speech}\n\n${extraText}` : speech }],
    structuredContent: { view, speech, ...data },
    _meta: uiMeta,
  };
}

function toolMeta(invoking: string, invoked: string) {
  return {
    ui: { resourceUri: BOARD_URI, visibility: ['model', 'app'], invoking, invoked },
    'ui/resourceUri': BOARD_URI,
  };
}

const householdArg = z.string().min(1).max(80).optional()
  .describe('Which home this game belongs to. Usually filled in by the assistant from the account; leave empty to use the default.');

function absolutize(url: string | undefined, base?: string): string | undefined {
  if (!url) return url;
  if (/^(https?:|data:)/.test(url) || !base) return url;
  return new URL(url, base).toString();
}

function noCase(): CallToolResult {
  return reply('empty', 'There is no case open yet. Say "start a new case" and I will set one up.');
}

function caseSpeech(c: CaseSummary, opening: boolean): string {
  if (opening) {
    return `${c.title}. ${c.intro} ${c.suspectCount} suspects are waiting. Ask one of them a question, or say "who are the suspects".`;
  }
  if (c.solved) return `${c.title} is closed. Say "start a new case" to play again.`;
  return `${c.title}. ${c.victim.name} ${c.crime.what} in ${c.crime.room} at ${c.crime.time}. There are ${c.suspectCount} suspects and ${c.boardClueCount} clues on the board.`;
}

function joinNames(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function plural(n: number, one: string, many = `${one}s`) { return `${n} ${n === 1 ? one : many}`; }

function recordSpeech(r: DetectiveRecord): string {
  if (!r.casesStarted) return 'No cases on your record yet. Say "start a new case" to open your first file.';
  const fav = favouriteSuspect(r);
  const parts = [`You have solved ${plural(r.solved, 'case')} out of ${plural(r.casesStarted, 'started', 'started')}.`];
  if (r.streak > 1) parts.push(`You are on a streak of ${r.streak}.`);
  else if (r.bestStreak > 1) parts.push(`Your best streak is ${r.bestStreak}.`);
  if (fav) parts.push(`Your favourite suspect to question is ${fav.name}.`);
  if (r.lastCase && !r.lastCase.finished) parts.push(`${r.lastCase.title} is still open. Say "let's finish last night's case" to pick it up.`);
  return parts.join(' ');
}

/** Public, safe view of a record for the board. Never includes anything about the solution. */
function recordView(r: DetectiveRecord) {
  const fav = favouriteSuspect(r);
  return {
    solved: r.solved, wrong: r.wrong, casesStarted: r.casesStarted, streak: r.streak, bestStreak: r.bestStreak,
    hintsUsed: r.hintsUsed, questionsAsked: r.questionsAsked, favouriteSuspect: fav,
    lastCase: r.lastCase ? { title: r.lastCase.title, finished: r.lastCase.finished, questionsAsked: r.lastCase.questionsAsked, updatedAt: r.lastCase.updatedAt } : null,
    caseOfTheWeek: r.caseOfTheWeek, history: r.history.slice(0, 5),
  };
}

// ---------- server ----------

export function buildServer(ctx: BuildContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      title: 'Accomplice',
      version: SERVER_VERSION,
      icons: ICONS.app,
      websiteUrl: 'https://github.com/accomplice-game',
    },
    {
      capabilities: {
        logging: {},
        tasks: { requests: { tools: { call: {} } }, list: {}, cancel: {} },
      },
      taskStore: ctx.taskStore,
      instructions:
        'Accomplice is a living-room murder mystery. Start a case, let players question suspects out loud, ' +
        'examine clues, ask for a gentle hint, and finally accuse someone. Keep replies short and spoken. ' +
        'Never reveal the culprit before an accusation, and always let the household confirm an accusation. ' +
        'Suspect and clue arguments accept names or roles, like "the cook". The household keeps a detective record ' +
        'across sessions, can resume an unfinished case, and can move the case to their Fire TV with send_to_tv.',
    },
  );

  const api = async (householdOverride?: string): Promise<GameApi> => {
    const hh = householdOverride || ctx.household;
    return typeof ctx.source === 'function' ? await ctx.source(hh) : ctx.source;
  };
  const hhOf = (h?: string) => h || ctx.household;
  const abs = (u?: string) => absolutize(u, ctx.publicBaseUrl);
  const suspectView = (s: SuspectCard) => ({ ...s, portraitUrl: abs(s.portraitUrl) });

  /** Add the narrator's voice (the same voice as the TV) when the game provides one. Never blocks for long. */
  const narrated = async (game: GameApi, result: CallToolResult): Promise<CallToolResult> => {
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    const narrate = game.narrate?.bind(game) ?? ctx.narrate;
    if (!sc || !narrate || sc.audioUrl || typeof sc.speech !== 'string') return result;
    try {
      const v = await Promise.race([
        Promise.resolve(narrate(sc.speech)),
        new Promise<{ audioUrl?: string }>((r) => setTimeout(() => r({}), 8000)),
      ]);
      if (v?.audioUrl) sc.narrationUrl = abs(v.audioUrl);
    } catch { /* the device reads the text instead */ }
    return result;
  };

  /** One investigative move: questioning, examining, or a new round. Re-arms the hint. */
  const noteMove = (household: string, fn?: (r: DetectiveRecord) => void) =>
    ctx.updateRecord(household, (r) => {
      if (r.hint) r.hint.movesSince++;
      if (r.lastCase && !r.lastCase.finished) r.lastCase.updatedAt = Date.now();
      fn?.(r);
    }).catch(() => null);

  const noteStarted = (household: string, c: CaseSummary, weekly: boolean) =>
    ctx.updateRecord(household, (r) => {
      r.casesStarted++;
      r.hint = null;
      r.lastCase = {
        caseId: c.id, title: c.title, tone: c.tone, roomCode: c.roomCode, seed: c.seed, round: c.round,
        startedAt: Date.now(), updatedAt: Date.now(), finished: false, questionsAsked: 0, suspectsQuestioned: [], hintsUsed: 0,
      };
      if (weekly) r.caseOfTheWeek = { week: isoWeek(), solved: false };
    }).catch(() => null);

  // ----- start_case (long running: MCP task when the client asks for one, plain call otherwise) -----
  server.experimental.tasks.registerToolTask(
    'start_case',
    {
      title: 'Start a new case',
      description:
        'Builds a brand new mystery and checks that it has exactly one fair answer. Takes a few seconds. ' +
        'Use when someone says "start a new case", "new game" or "let\'s play". tone "cozy" is a gentle, bloodless puzzle for families; "classic" is a parlour murder. ' +
        'Set weekly to true for the case of the week, the same case every household gets this week.',
      inputSchema: {
        tone: z.enum(['classic', 'cozy']).default('classic').describe('classic (parlour murder) or cozy (family friendly theft)'),
        weekly: z.boolean().optional().describe('Play the case of the week'),
        household: householdArg,
      },
      annotations: { title: 'Start a new case', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      execution: { taskSupport: 'optional' },
      _meta: toolMeta('Writing your case...', 'Your case is ready'),
    },
    {
      async createTask(args, extra) {
        const { tone, weekly, household } = args as { tone: Tone; weekly?: boolean; household?: string };
        const task = await extra.taskStore.createTask({ ttl: 10 * 60_000, pollInterval: 300 });
        const sessionId = extra.sessionId;
        const progressToken = extra._meta?.progressToken;
        const shared = ctx.taskStore;
        void (async () => {
          try {
            const game = await api(household);
            const summary = await game.startCase(tone ?? 'classic', {
              seed: weekly ? weekSeed() : undefined,
              onProgress: (p) => {
                void shared.updateTaskStatus(task.taskId, 'working', p.message, sessionId).catch(() => {});
                if (progressToken !== undefined) {
                  void extra
                    .sendNotification({ method: 'notifications/progress', params: { progressToken, progress: p.progress, total: p.total, message: p.message } })
                    .catch(() => {});
                }
              },
            });
            await noteStarted(hhOf(household), summary, !!weekly);
            const suspects = (await game.listSuspects()).map(suspectView);
            const opening = weekly ? `The case of the week. ${caseSpeech(summary, true)}` : caseSpeech(summary, true);
            const result = await narrated(game, reply('case', opening, { household: hhOf(household), case: summary, suspects, weekly: !!weekly }));
            await shared.storeTaskResult(task.taskId, 'completed', result, sessionId);
          } catch (e) {
            await shared
              .storeTaskResult(task.taskId, 'failed', {
                content: [{ type: 'text', text: `I could not build a case just now. ${errorText(e)}` }],
                isError: true,
              }, sessionId)
              .catch(() => {});
          }
        })();
        return { task };
      },
      async getTask(_args, extra) {
        return await extra.taskStore.getTask(extra.taskId);
      },
      async getTaskResult(_args, extra) {
        return (await extra.taskStore.getTaskResult(extra.taskId)) as CallToolResult;
      },
    },
  );

  // ----- case_summary -----
  server.registerTool(
    'case_summary',
    {
      title: 'Case file',
      description: 'Opens the case file: what happened, where, when, who is under suspicion and how many clues are on the board. Use for "what is the case", "remind me" or "show the case file".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Case file', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Opening the case file...', 'Case file open'),
    },
    async ({ household }) => {
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      const clues = await game.listBoardClues();
      const suspects = (await game.listSuspects()).map(suspectView);
      return narrated(game, reply('case', caseSpeech(c, false), { household: hhOf(household), case: c, clues, suspects }));
    },
  );

  // ----- list_suspects -----
  server.registerTool(
    'list_suspects',
    {
      title: 'Who are the suspects?',
      description: 'Lists everyone under suspicion with their role and motive. Use for "who are the suspects" or "who is here".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Who are the suspects?', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Gathering the suspects...', 'Suspects gathered'),
    },
    async ({ household }) => {
      const game = await api(household);
      if (!(await game.getCaseSummary())) return noCase();
      const suspects = (await game.listSuspects()).map(suspectView);
      const speech = `The suspects are ${joinNames(suspects.map((s) => `${s.name}, ${s.role}`))}. Who would you like to question?`;
      const list = suspects.map((s) => `- ${s.name} (${s.role}): ${s.motive}`).join('\n');
      return narrated(game, reply('suspects', speech, { household: hhOf(household), suspects }, list));
    },
  );

  // ----- question_suspect -----
  server.registerTool(
    'question_suspect',
    {
      title: 'Question a suspect',
      description:
        'Asks one suspect a question and returns their in-character spoken answer (with a voice clip when available). ' +
        'Suspects may lie. Use for "ask the cook where she was at nine" or "Clara, did you hear anything?". ' +
        'Rephrase the question in the second person, as the player would say it to the suspect.',
      inputSchema: {
        suspect: z.string().min(1).describe('Suspect name, role or id, e.g. "the cook", "Agatha", "gardener"'),
        question: z.string().min(1).max(400).describe('The question, addressed to the suspect, e.g. "Where were you at nine?"'),
        household: householdArg,
      },
      annotations: { title: 'Question a suspect', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta('Calling the suspect in...', 'The suspect answered'),
    },
    async ({ suspect, question, household }) => {
      const game = await api(household);
      if (!(await game.getCaseSummary())) return noCase();
      const suspects = await game.listSuspects();
      const s = bestMatch(suspect, suspects);
      if (!s) {
        return reply('suspects', `I am not sure who "${suspect}" is. The suspects are ${joinNames(suspects.map((x) => x.name))}.`, {
          household: hhOf(household), suspects: suspects.map(suspectView),
        });
      }
      const r = await game.askSuspect(s.id, question);
      await noteMove(hhOf(household), (rec) => {
        rec.questionsAsked++;
        rec.suspectCounts[s.name] = (rec.suspectCounts[s.name] ?? 0) + 1;
        if (rec.lastCase && !rec.lastCase.finished) {
          rec.lastCase.questionsAsked++;
          if (!rec.lastCase.suspectsQuestioned.includes(s.name)) rec.lastCase.suspectsQuestioned.push(s.name);
        }
      });
      return reply('reply', r.text, {
        household: hhOf(household),
        suspect: suspectView(s),
        question,
        answer: r.text,
        audioUrl: abs(r.audioUrl),
      }, `${s.name} (${s.role}) says: "${r.text}"`);
    },
  );

  // ----- examine_clue -----
  server.registerTool(
    'examine_clue',
    {
      title: 'Examine a clue',
      description:
        'Reads one clue card from the evidence board. Without a clue, lists the clues on the board. ' +
        'Use for "examine the boot prints", "read the letter" or "what clues do we have".',
      inputSchema: {
        clue: z.string().optional().describe('Clue title, a word from it, or id. Leave empty to list all board clues.'),
        household: householdArg,
      },
      annotations: { title: 'Examine a clue', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Pulling the card off the board...', 'Here is the card'),
    },
    async ({ clue, household }) => {
      const game = await api(household);
      if (!(await game.getCaseSummary())) return noCase();
      const clues: ClueCard[] = await game.listBoardClues();
      if (!clue || /^(all|clues?|everything|board)$/i.test(clue.trim())) {
        const speech = clues.length
          ? `There are ${clues.length} clues on the board: ${joinNames(clues.map((c) => c.title.toLowerCase()))}. Which one should I read?`
          : 'The board is empty for now. Clues appear as the rounds go on.';
        return narrated(game, reply('clues', speech, { household: hhOf(household), clues }));
      }
      const m = bestMatch(clue, clues);
      if (!m) {
        return reply('clues', `I could not find a clue like "${clue}". On the board: ${joinNames(clues.map((c) => c.title.toLowerCase()))}.`, {
          household: hhOf(household), clues,
        });
      }
      const card = await game.examineClue(m.id);
      await noteMove(hhOf(household));
      return narrated(game, reply('clue', `${card.title}. ${card.text}`, { household: hhOf(household), clue: { ...card, imageUrl: abs(card.imageUrl) } }));
    },
  );

  // ----- get_hint (one deduction step, and only one until the players act on it) -----
  server.registerTool(
    'get_hint',
    {
      title: 'Get a hint',
      description:
        'Gives one gentle nudge toward the answer. Each hint reveals at most one deduction step and never names the culprit. ' +
        'A second hint only comes after the players have acted on the first (questioned someone, examined a clue, or moved to the next round); until then the same nudge is repeated. ' +
        'Use for "give me a hint" or "we are stuck".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Get a hint', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta('Thinking of a nudge...', 'Here is a hint'),
    },
    async ({ household }) => {
      const hh = hhOf(household);
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      const clues = await game.listBoardClues();
      const rec = await ctx.records.get(hh);
      if (rec.hint && rec.hint.caseId === c.id && rec.hint.movesSince === 0) {
        const clue = clues.find((x) => x.id === rec.hint!.clueId);
        return narrated(game, reply('hint', `One step at a time. ${rec.hint.text} Try that first, then ask me again.`, {
          household: hh, hint: { text: rec.hint.text, clueId: rec.hint.clueId }, clue, limited: true,
        }));
      }
      const h = await game.hint();
      await ctx.updateRecord(hh, (r) => {
        r.hintsUsed++;
        if (r.lastCase && !r.lastCase.finished) r.lastCase.hintsUsed++;
        r.hint = { caseId: c.id, text: h.text, clueId: h.clueId, movesSince: 0 };
      }).catch(() => null);
      const clue = clues.find((x) => x.id === h.clueId);
      return narrated(game, reply('hint', h.text, { household: hh, hint: { ...h, audioUrl: abs(h.audioUrl) }, clue, limited: false }));
    },
  );

  // ----- next_round -----
  server.registerTool(
    'next_round',
    {
      title: 'Reveal new clues',
      description: 'Moves the game to the next round and pins its new clues on the board. Use for "next round", "show us more clues" or "we are ready to move on".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Reveal new clues', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: toolMeta('Pinning new clues...', 'New clues on the board'),
    },
    async ({ household }) => {
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      if (!game.nextRound) {
        return reply('notice', 'New clues arrive on their own as the rounds go on. Keep questioning the suspects.', { household: hhOf(household) });
      }
      const r = await game.nextRound();
      await noteMove(hhOf(household), (rec) => { if (rec.lastCase && !rec.lastCase.finished) rec.lastCase.round = r.round; });
      const clues = await game.listBoardClues();
      const speech = r.newClues.length
        ? `Round ${r.round}. New on the board: ${joinNames(r.newClues.map((x) => x.title.toLowerCase()))}.`
        : r.phase === 'accuse'
          ? 'That was the last round. Time to make an accusation.'
          : `This is round ${r.round}, and every clue is already on the board.`;
      return narrated(game, reply('clues', speech, { household: hhOf(household), clues, round: r.round, newClueIds: r.newClues.map((x) => x.id) }));
    },
  );

  // ----- accuse (asks the household to confirm first) -----
  server.registerTool(
    'accuse',
    {
      title: 'Make an accusation',
      description:
        'Accuses a suspect, optionally naming the means, and ends the case with the reveal. This cannot be undone, so the household is asked to confirm first. ' +
        'Use for "I accuse the gardener" or "it was Clara with the candlestick". ' +
        'If the client cannot show a confirmation, call once to get the question, then again with confirmed true after the player says yes.',
      inputSchema: {
        culprit: z.string().min(1).describe('Suspect name, role or id'),
        item: z.string().optional().describe('The means, e.g. "the candlestick". Optional.'),
        confirmed: z.boolean().optional().describe('Set true only after the players clearly said yes to the confirmation question.'),
        household: householdArg,
      },
      annotations: { title: 'Make an accusation', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      _meta: toolMeta('Gathering everyone in the drawing room...', 'The truth is out'),
    },
    async ({ culprit, item, confirmed, household }) => {
      const hh = hhOf(household);
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      if (c.solved) return reply('notice', `${c.title} is already closed. Say "start a new case" to play again.`, { household: hh });
      const suspects = await game.listSuspects();
      const s = bestMatch(culprit, suspects);
      if (!s) {
        return reply('suspects', `I am not sure who "${culprit}" is. You can accuse ${joinNames(suspects.map((x) => x.name))}.`, {
          household: hh, suspects: suspects.map(suspectView),
        });
      }
      const itm = item ? bestMatch(item, c.items) : null;
      const question = `Accuse ${s.name}${itm ? ` with ${itm.name}` : ''}? This ends the case.`;

      if (!confirmed) {
        const canElicit = Boolean(server.server.getClientCapabilities()?.elicitation);
        const confirmView = () => reply('confirm', `${question} Say "yes, accuse" to lock it in, or "not yet" to keep investigating.`, {
          household: hh, suspect: suspectView(s), item: itm, culprit: s.id, itemId: itm?.id,
        });
        if (!canElicit) return confirmView();
        let answer: ElicitResult;
        try {
          answer = await server.server.elicitInput({
            mode: 'form',
            message: question,
            requestedSchema: {
              type: 'object',
              properties: {
                confirm: { type: 'boolean', title: `Accuse ${s.name}`, description: 'Yes locks in the accusation and starts the reveal.', default: true },
              },
              required: ['confirm'],
            },
          });
        } catch {
          return confirmView();
        }
        if (answer.action !== 'accept' || answer.content?.confirm !== true) {
          return reply('notice', 'No accusation made. Take your time, the suspects are not going anywhere.', { household: hh });
        }
      }

      const r = await game.accuse(s.id, itm?.id);
      const rec = await ctx.updateRecord(hh, (x) => {
        if (r.correct) { x.solved++; x.streak++; x.bestStreak = Math.max(x.bestStreak, x.streak); }
        else { x.wrong++; x.streak = 0; }
        if (x.lastCase) { x.lastCase.finished = true; x.lastCase.updatedAt = Date.now(); }
        if (x.caseOfTheWeek && x.caseOfTheWeek.week === isoWeek() && r.correct) x.caseOfTheWeek.solved = true;
        x.history.unshift({ caseId: c.id, title: c.title, correct: r.correct, at: Date.now() });
        x.history = x.history.slice(0, 10);
        x.hint = null;
      }).catch(() => null);
      const streakLine = r.correct && rec && rec.streak > 1 ? ` That is ${rec.streak} in a row.` : '';
      const speech = `${r.correct ? 'Case closed!' : 'Oh dear.'} ${r.explanation}${streakLine}`;
      const real = suspects.find((x) => x.id === r.culprit.id);
      return narrated(game, reply('verdict', speech, {
        household: hh, result: r, suspect: suspectView(s), culprit: real ? suspectView(real) : undefined,
        caseTitle: c.title, record: rec ? recordView(rec) : undefined,
      }, r.steps?.length ? r.steps.map((x, i) => `${i + 1}. ${x.says} So ${x.therefore.charAt(0).toLowerCase()}${x.therefore.slice(1)}`).join('\n') : undefined));
    },
  );

  // ----- my_detective_record (context across sessions) -----
  server.registerTool(
    'my_detective_record',
    {
      title: 'My detective record',
      description:
        'Reads this household\'s detective career, kept between sessions: cases solved, current streak, favourite suspect to question, ' +
        'the case of the week, and whether last night\'s case is still unfinished. Use for "how are we doing", "what\'s our record" or "how many cases have we solved".',
      inputSchema: { household: householdArg },
      annotations: { title: 'My detective record', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Pulling your file...', 'Your detective record'),
    },
    async ({ household }) => {
      const hh = hhOf(household);
      const game = await api(household);
      const rec = await ctx.records.get(hh);
      return narrated(game, reply('record', recordSpeech(rec), { household: hh, record: recordView(rec), week: isoWeek() }));
    },
  );

  // ----- resume_case -----
  server.registerTool(
    'resume_case',
    {
      title: 'Finish last night\'s case',
      description:
        'Picks up this household\'s unfinished case where they left it, even in a new session or after a restart, and recaps where they were. ' +
        'With a room code, joins the case already running on the Fire TV instead. Use for "let\'s finish last night\'s case", "pick up where we left off" or "join the game on the TV, code ABCD".',
      inputSchema: {
        room: z.string().regex(/^[A-Za-z]{4}$/).optional().describe('Four letter room code shown on the TV, to join that case'),
        household: householdArg,
      },
      annotations: { title: 'Finish last night\'s case', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta('Finding your case file...', 'Case reopened'),
    },
    async ({ room, household }) => {
      const hh = hhOf(household);
      const game = await api(household);
      const rec = await ctx.records.get(hh);
      const last = rec.lastCase;
      const open = await game.getCaseSummary();

      let c: CaseSummary | null = null;
      if (room) {
        c = game.resumeCase ? await game.resumeCase({ roomCode: room.toUpperCase() }) : null;
        if (!c) return reply('notice', `I could not find a game with the code ${room.toUpperCase()}. Check the code on the TV and try again.`, { household: hh });
        if (!last || last.caseId !== c.id) await noteStarted(hh, c, false);
      } else {
        if (!last || last.finished) {
          if (open && !open.solved) c = open;
          else return reply('notice', 'There is no unfinished case on your record. Say "start a new case" to open a new file.', { household: hh, record: recordView(rec) });
        } else if (open && open.id === last.caseId && !open.solved) {
          c = open;
        } else if (game.resumeCase) {
          c = await game.resumeCase({ caseId: last.caseId, roomCode: last.roomCode, tone: last.tone, seed: last.seed, round: last.round });
        }
        if (!c) {
          await ctx.updateRecord(hh, (r) => { if (r.lastCase) r.lastCase.finished = true; }).catch(() => null);
          return reply('notice', `${last?.title ?? 'That case'} has gone cold, I am afraid. Say "start a new case" for a fresh one.`, { household: hh });
        }
      }
      const fresh = await ctx.records.get(hh);
      const lc = fresh.lastCase;
      const done = lc && lc.caseId === c.id ? lc : null;
      const recap = done && done.questionsAsked
        ? `Welcome back. You had asked ${plural(done.questionsAsked, 'question')}${done.suspectsQuestioned.length ? `, mostly of ${joinNames(done.suspectsQuestioned.slice(0, 3))}` : ''}${done.hintsUsed ? `, and used ${plural(done.hintsUsed, 'hint')}` : ''}.`
        : 'Welcome back.';
      const speech = `${recap} ${c.title}. ${c.victim.name} ${c.crime.what} in ${c.crime.room} at ${c.crime.time}. ${c.boardClueCount} clues are on the board.`;
      const suspects = (await game.listSuspects()).map(suspectView);
      const clues = await game.listBoardClues();
      return narrated(game, reply('case', speech, { household: hh, case: c, suspects, clues, resumed: true, progress: done ? { questionsAsked: done.questionsAsked, suspectsQuestioned: done.suspectsQuestioned, hintsUsed: done.hintsUsed } : undefined }));
    },
  );

  // ----- send_to_tv (cross-surface handoff) -----
  server.registerTool(
    'send_to_tv',
    {
      title: 'Continue on your Fire TV',
      description:
        'Moves the open case to the Fire TV so the whole room can play on the big screen, with phones as private controllers. ' +
        'Returns the room code, the TV address and the phone join link. Use for "put it on the TV", "continue on the TV" or "let everyone join".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Continue on your Fire TV', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Finding your TV...', 'Ready on your TV'),
    },
    async ({ household }) => {
      const hh = hhOf(household);
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      if (!game.handoff) return reply('notice', 'This game cannot move to a TV yet.', { household: hh });
      const h = await game.handoff();
      const joinUrl = abs(h.joinPath) ?? h.joinPath;
      const qrUrl = h.qrService ? abs(`${h.qrService}?text=${encodeURIComponent(joinUrl)}`) : undefined;
      const spaced = h.roomCode.split('').join(' ');
      const speech = `Open Accomplice on your Fire TV and enter the code ${spaced}. Everyone else can join on their phones with the same code.`;
      return narrated(game, reply('handoff', speech, {
        household: hh, caseTitle: c.title, roomCode: h.roomCode, tvUrl: abs(h.tvPath), joinUrl, qrUrl,
      }, `Room code: ${h.roomCode}\nTV: ${abs(h.tvPath)}\nPhones: ${joinUrl}`));
    },
  );

  // ----- MCP Apps UI resource -----
  server.registerResource(
    'evidence-board',
    BOARD_URI,
    {
      title: 'Accomplice evidence board',
      description: 'A glanceable case file, suspect card, evidence board and verdict stamp for smart displays. Renders any Accomplice tool result.',
      mimeType: MCP_APP_MIME,
      icons: ICONS.summary,
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [{
        uri: BOARD_URI,
        mimeType: MCP_APP_MIME,
        text: BOARD_HTML,
        _meta: {
          ui: {
            prefersBorder: false,
            csp: {
              connectDomains: [],
              resourceDomains: ctx.publicBaseUrl ? [new URL(ctx.publicBaseUrl).origin] : [],
            },
          },
        },
      }],
    }),
  );

  // ----- the agent skill, for hosts that onboard add-ons from a SKILL.md -----
  server.registerResource(
    'accomplice-skill',
    SKILL_URI,
    { title: 'How to host Accomplice', description: 'Open-format SKILL.md: when to use the game, how to call each tool, house style for narrating, and the safety rules.', mimeType: 'text/markdown' },
    async () => ({ contents: [{ uri: SKILL_URI, mimeType: 'text/markdown', text: SKILL_MD }] }),
  );

  addToolIcons(server);
  return server;
}

const TOOL_ICONS: Record<string, Icon[]> = {
  start_case: ICONS.start,
  case_summary: ICONS.summary,
  list_suspects: ICONS.suspects,
  question_suspect: ICONS.ask,
  examine_clue: ICONS.clue,
  get_hint: ICONS.hint,
  next_round: ICONS.next,
  accuse: ICONS.accuse,
  my_detective_record: ICONS.record,
  resume_case: ICONS.resume,
  send_to_tv: ICONS.tv,
};

/** registerTool has no icons option in SDK v1, so decorate the tools/list response. */
function addToolIcons(server: McpServer) {
  const inner = server.server as unknown as { _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<{ tools: { name: string; icons?: Icon[] }[] }>> };
  const original = inner._requestHandlers.get('tools/list');
  if (!original) return;
  inner._requestHandlers.set('tools/list', async (req, extra) => {
    const res = await original(req, extra);
    for (const t of res.tools) if (TOOL_ICONS[t.name]) t.icons = TOOL_ICONS[t.name];
    return res;
  });
}
