// Builds one McpServer for one connection. Game state lives in the GameApi, keyed by household,
// so nothing here depends on the MCP session surviving.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, Icon, ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js';
import { z } from 'zod';
import type { CaseSummary, ClueCard, GameApi, GameApiSource, SuspectCard, Tone } from './types.ts';
import { bestMatch } from './match.ts';
import { BOARD_HTML } from './ui/board.ts';

export const BOARD_URI = 'ui://accomplice/board.html';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';
export const SERVER_NAME = 'accomplice';
export const SERVER_VERSION = '0.1.0';

export interface BuildContext {
  source: GameApiSource;
  household: string;
  taskStore: TaskStore;
  /** Absolute origin used to turn relative portrait/audio paths into full URLs. */
  publicBaseUrl?: string;
}

// ---------- icons (small inline SVGs, brass on transparent) ----------

function icon(body: string): Icon[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e0b25b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return [{ src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, mimeType: 'image/svg+xml', sizes: ['any'] }];
}
const ICONS = {
  app: icon('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/><path d="M8 10h4"/>'),
  start: icon('<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 13h8M8 17h5"/>'),
  summary: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'),
  suspects: icon('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M11 20c0-3 2.5-5 5-5s5 2 5 5"/>'),
  ask: icon('<path d="M4 5h16v11H9l-5 4z"/><path d="M10 9a2 2 0 1 1 2 2v1"/>'),
  clue: icon('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/>'),
  hint: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  next: icon('<rect x="4" y="5" width="10" height="13" rx="1" transform="rotate(-6 9 11)"/><path d="M14 8h5v12H9v-2"/>'),
  accuse: icon('<path d="m14 4 6 6M11 7l6 6M12.5 5.5l-6 6 3 3 6-6"/><path d="M8 13 3 18l3 3 5-5"/><path d="M14 21h7"/>'),
};

// ---------- result helpers ----------

type View = 'starting' | 'case' | 'suspects' | 'reply' | 'clue' | 'clues' | 'hint' | 'confirm' | 'verdict' | 'empty' | 'notice';

const uiMeta = { ui: { resourceUri: BOARD_URI } };

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
  if (e instanceof Error) return e.message;
  return String(e);
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
        'Never reveal the culprit before an accusation. Suspect and clue arguments accept names or roles, like "the cook".',
    },
  );

  const api = async (householdOverride?: string): Promise<GameApi> => {
    const hh = householdOverride || ctx.household;
    return typeof ctx.source === 'function' ? await ctx.source(hh) : ctx.source;
  };
  const hhOf = (h?: string) => h || ctx.household;

  const suspectView = (s: SuspectCard) => ({ ...s, portraitUrl: absolutize(s.portraitUrl, ctx.publicBaseUrl) });

  // ----- start_case (long running: MCP task when the client asks for one, plain call otherwise) -----
  server.experimental.tasks.registerToolTask(
    'start_case',
    {
      title: 'Start a new case',
      description:
        'Builds a brand new mystery and checks that it has exactly one fair answer. Takes a few seconds. ' +
        'Use when someone says "start a new case", "new game" or "let\'s play". tone "cozy" is a gentle, bloodless puzzle for families; "classic" is a parlour murder.',
      inputSchema: {
        tone: z.enum(['classic', 'cozy']).default('classic').describe('classic (parlour murder) or cozy (family friendly theft)'),
        household: householdArg,
      },
      annotations: { title: 'Start a new case', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      execution: { taskSupport: 'optional' },
      _meta: toolMeta('Writing your case...', 'Your case is ready'),
    },
    {
      async createTask(args, extra) {
        const { tone, household } = args as { tone: Tone; household?: string };
        const task = await extra.taskStore.createTask({ ttl: 10 * 60_000, pollInterval: 300 });
        const sessionId = extra.sessionId;
        const progressToken = extra._meta?.progressToken;
        const shared = ctx.taskStore;
        void (async () => {
          try {
            const game = await api(household);
            const summary = await game.startCase(tone ?? 'classic', {
              onProgress: (p) => {
                void shared.updateTaskStatus(task.taskId, 'working', p.message, sessionId).catch(() => {});
                if (progressToken !== undefined) {
                  void extra
                    .sendNotification({ method: 'notifications/progress', params: { progressToken, progress: p.progress, total: p.total, message: p.message } })
                    .catch(() => {});
                }
              },
            });
            const result = reply('case', caseSpeech(summary, true), {
              household: hhOf(household),
              case: summary,
            });
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
      title: 'Case summary',
      description: 'Recaps the open case: what happened, where, when, and how many suspects and clues there are. Use for "what is the case", "remind me" or "show the board".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Case summary', readOnlyHint: true, openWorldHint: false },
      _meta: toolMeta('Opening the case file...', 'Case file open'),
    },
    async ({ household }) => {
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      const clues = await game.listBoardClues();
      return reply('case', caseSpeech(c, false), { household: hhOf(household), case: c, clues });
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
      return reply('suspects', speech, { household: hhOf(household), suspects }, list);
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
      return reply('reply', r.text, {
        household: hhOf(household),
        suspect: suspectView(s),
        question,
        answer: r.text,
        audioUrl: absolutize(r.audioUrl, ctx.publicBaseUrl),
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
        return reply('clues', speech, { household: hhOf(household), clues });
      }
      const m = bestMatch(clue, clues);
      if (!m) {
        return reply('clues', `I could not find a clue like "${clue}". On the board: ${joinNames(clues.map((c) => c.title.toLowerCase()))}.`, {
          household: hhOf(household), clues,
        });
      }
      const card = await game.examineClue(m.id);
      return reply('clue', `${card.title}. ${card.text}`, { household: hhOf(household), clue: { ...card, imageUrl: absolutize(card.imageUrl, ctx.publicBaseUrl) } });
    },
  );

  // ----- get_hint -----
  server.registerTool(
    'get_hint',
    {
      title: 'Get a hint',
      description: 'Gives one gentle nudge toward the answer. Each hint reveals at most one deduction step and never names the culprit. Use for "give me a hint" or "we are stuck".',
      inputSchema: { household: householdArg },
      annotations: { title: 'Get a hint', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: toolMeta('Thinking of a nudge...', 'Here is a hint'),
    },
    async ({ household }) => {
      const game = await api(household);
      if (!(await game.getCaseSummary())) return noCase();
      const h = await game.hint();
      const clues = h.clueId ? await game.listBoardClues() : [];
      const clue = clues.find((c) => c.id === h.clueId);
      return reply('hint', h.text, { household: hhOf(household), hint: { ...h, audioUrl: absolutize(h.audioUrl, ctx.publicBaseUrl) }, clue });
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
      const clues = await game.listBoardClues();
      const speech = r.newClues.length
        ? `Round ${r.round}. New on the board: ${joinNames(r.newClues.map((x) => x.title.toLowerCase()))}.`
        : r.phase === 'accuse'
          ? 'That was the last round. Time to make an accusation.'
          : `This is round ${r.round}, and every clue is already on the board.`;
      return reply('clues', speech, { household: hhOf(household), clues, round: r.round, newClueIds: r.newClues.map((x) => x.id) });
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
      const game = await api(household);
      const c = await game.getCaseSummary();
      if (!c) return noCase();
      if (c.solved) return reply('notice', `${c.title} is already closed. Say "start a new case" to play again.`, { household: hhOf(household) });
      const suspects = await game.listSuspects();
      const s = bestMatch(culprit, suspects);
      if (!s) {
        return reply('suspects', `I am not sure who "${culprit}" is. You can accuse ${joinNames(suspects.map((x) => x.name))}.`, {
          household: hhOf(household), suspects: suspects.map(suspectView),
        });
      }
      const itm = item ? bestMatch(item, c.items) : null;
      const question = `Accuse ${s.name}${itm ? ` with ${itm.name}` : ''}? This ends the case.`;

      if (!confirmed) {
        const canElicit = Boolean(server.server.getClientCapabilities()?.elicitation);
        if (!canElicit) {
          return reply('confirm', `${question} Say "yes, accuse" to lock it in, or "not yet" to keep investigating.`, {
            household: hhOf(household), suspect: suspectView(s), item: itm, culprit: s.id, itemId: itm?.id,
          });
        }
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
          return reply('confirm', `${question} Say "yes, accuse" to lock it in.`, {
            household: hhOf(household), suspect: suspectView(s), item: itm, culprit: s.id, itemId: itm?.id,
          });
        }
        if (answer.action !== 'accept' || answer.content?.confirm !== true) {
          return reply('notice', 'No accusation made. Take your time, the suspects are not going anywhere.', { household: hhOf(household) });
        }
      }

      const r = await game.accuse(s.id, itm?.id);
      const speech = `${r.correct ? 'Case closed!' : 'Oh dear.'} ${r.explanation}`;
      const real = suspects.find((x) => x.id === r.culprit.id);
      return reply('verdict', speech, { household: hhOf(household), result: r, suspect: suspectView(s), culprit: real ? suspectView(real) : undefined },
        r.steps?.length ? r.steps.map((x, i) => `${i + 1}. ${x.says} So ${x.therefore.charAt(0).toLowerCase()}${x.therefore.slice(1)}`).join('\n') : undefined);
    },
  );

  // ----- MCP Apps UI resource -----
  server.registerResource(
    'evidence-board',
    BOARD_URI,
    {
      title: 'Accomplice evidence board',
      description: 'A glanceable evidence board and suspect card for smart displays. Renders any Accomplice tool result.',
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
