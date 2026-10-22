// A small, deterministic intent router. Turns what someone says into one tool call.
// No language model: a handful of patterns cover the game, and anything unclear gets a friendly reprompt.

export type Intent =
  | { kind: 'tool'; tool: string; args: Record<string, unknown> }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'stop' }
  | { kind: 'help' }
  | { kind: 'unknown'; text: string };

export interface RouterContext {
  /** Names and roles the router can recognise when a sentence starts with someone's name. */
  suspects?: { id: string; name: string; role: string }[];
}

const WAKE = /^\s*(hey\s+|ok\s+|okay\s+)?(alexa|computer|echo)[\s,.!]*/i;

export function normalise(utterance: string): string {
  return utterance
    .replace(WAKE, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const PAST_TO_BASE: Record<string, string> = {
  saw: 'see', heard: 'hear', did: 'do', took: 'take', went: 'go', left: 'leave', found: 'find',
  noticed: 'notice', touched: 'touch', had: 'have', knew: 'know', thought: 'think', wanted: 'want', hid: 'hide',
};

/** "where she was at nine" -> "Where were you at nine?" */
export function toDirectQuestion(raw: string): string {
  let q = raw.trim().replace(/[?.!]+$/, '');
  q = q.replace(/^(to tell (me|us) |to say |tell (me|us) )/i, '');
  // "if/whether she saw anything" -> "did you see anything"
  q = q.replace(/^(if|whether) (she|he|they) (\w+)/i, (_m, _w, _p, verb: string) => {
    const v = verb.toLowerCase();
    if (v === 'was' || v === 'were') return 'were you';
    if (v === 'is' || v === 'are') return 'are you';
    if (v === 'has' || v === 'have') return 'have you';
    return `did you ${PAST_TO_BASE[v] ?? v.replace(/ed$/, '')}`;
  });
  // "where she was" -> "where were you", "what he saw" -> "what did you see"
  q = q.replace(/^(where|what|why|when|how|who|which) (she|he|they) (\w+)/i, (_m, wh: string, _p, verb: string) => {
    const v = verb.toLowerCase();
    if (v === 'was' || v === 'were') return `${wh} were you`;
    if (v === 'is' || v === 'are') return `${wh} are you`;
    if (v === 'has' || v === 'have') return `${wh} have you`;
    return `${wh} did you ${PAST_TO_BASE[v] ?? v.replace(/ed$/, '')}`;
  });
  // "about the candlestick" -> "What do you know about the candlestick"
  q = q.replace(/^about /i, 'what do you know about ');
  q = q
    .replace(/\b(she|he|they)\b (was|were)\b/gi, 'you were')
    .replace(/\b(she|he|they)\b (is|are)\b/gi, 'you are')
    .replace(/\b(she|he|they)\b/gi, 'you')
    .replace(/\b(her|his|their)\b/gi, 'your')
    .replace(/\b(herself|himself|themselves)\b/gi, 'yourself');
  q = q.charAt(0).toUpperCase() + q.slice(1);
  return /\?$/.test(q) ? q : `${q}?`;
}

const QUESTION_START = '(where|what|why|when|how|who|which|did|do|does|were|was|are|is|have|has|can|could|would|if|whether|about|to tell|tell)';

export function route(utterance: string, ctx: RouterContext = {}): Intent {
  const text = normalise(utterance);
  const t = text.toLowerCase().replace(/[.!]+$/, '');
  if (!t) return { kind: 'unknown', text };

  // confirmations first, they only matter while a question is pending
  if (/^(yes|yeah|yep|yup|sure|do it|confirm|correct|absolutely|lock it in)\b|^yes,? accuse/.test(t)) return { kind: 'yes' };
  if (/^(no|nope|not yet|cancel|wait|hold on|never ?mind)\b/.test(t)) return { kind: 'no' };
  if (/^(stop|quiet|shh+|be quiet|pause)$/.test(t)) return { kind: 'stop' };
  if (/^(help|what can i (say|do)|how do i play)\b/.test(t)) return { kind: 'help' };

  // start a case
  if (/\b(start|begin|new|open|play|set up|launch)\b.*\b(case|game|mystery|round)\b|^let'?s play\b|^(open|launch|start) accomplice\b/.test(t)) {
    const tone = /\b(cozy|cosy|family|kids?|gentle|light)\b/.test(t) ? 'cozy' : 'classic';
    return { kind: 'tool', tool: 'start_case', args: { tone } };
  }

  // next round
  if (/\b(next round|new round|more clues|new clues|reveal (the |more |new )?clues|move on|we'?re ready|ready for more)\b/.test(t)) {
    return { kind: 'tool', tool: 'next_round', args: {} };
  }

  // hints
  if (/\b(hint|clue me in|nudge|we'?re stuck|i'?m stuck|stuck)\b/.test(t)) return { kind: 'tool', tool: 'get_hint', args: {} };

  // accusations: "I accuse the gardener with the candlestick", "it was Clara", "the culprit is the cook"
  const acc = t.match(/^(?:i (?:want to |would like to |'d like to )?accuse|we accuse|accuse|i think it was|it was|the culprit is|the killer is|the thief is|whodunnit is|i blame)\s+(.+?)(?:\s+(?:with|using)\s+(.+))?$/);
  if (acc) {
    const args: Record<string, unknown> = { culprit: acc[1]!.trim() };
    if (acc[2]) args.item = acc[2].trim();
    return { kind: 'tool', tool: 'accuse', args };
  }

  // suspects
  if (/\b(who are the suspects|list (the )?suspects|show (me |us )?(the )?suspects|meet the suspects|who('?s| is) (here|there|in the house)|who are they|suspects)\b/.test(t)) {
    return { kind: 'tool', tool: 'list_suspects', args: {} };
  }

  // clues: "examine the boot prints", "read the letter", "what clues do we have"
  if (/\b(what clues|show (me |us )?(the )?clues|list (the )?clues|the board|evidence board|all (the )?clues|any clues)\b/.test(t)) {
    return { kind: 'tool', tool: 'examine_clue', args: {} };
  }
  const ex = t.match(/^(?:examine|inspect|look at|check|read|study|show me|tell me about the clue|what about)\s+(?:the\s+)?(?:clue\s+(?:called\s+)?)?(.+)$/);
  if (ex && !/\b(suspect|case)\b/.test(ex[1]!)) return { kind: 'tool', tool: 'examine_clue', args: { clue: ex[1]!.trim() } };

  // case summary
  if (/\b(what('?s| is) the case|case summary|recap|remind (me|us)|where are we|what do we know|what happened|summary|the story so far)\b/.test(t)) {
    return { kind: 'tool', tool: 'case_summary', args: {} };
  }

  // questioning: "ask the cook where she was at nine"
  const ask = text.match(new RegExp(`^(?:please\\s+)?(?:ask|question)\\s+(.+?)\\s+${QUESTION_START}\\b(.*)$`, 'i'));
  if (ask) {
    const question = toDirectQuestion(`${ask[2]}${ask[3]}`);
    return { kind: 'tool', tool: 'question_suspect', args: { suspect: ask[1]!.trim(), question } };
  }
  const askBare = text.match(/^(?:ask|question|talk to|speak to|interview)\s+(.+)$/i);
  if (askBare) {
    return { kind: 'tool', tool: 'question_suspect', args: { suspect: askBare[1]!.trim(), question: 'Where were you when it happened?' } };
  }

  // "Clara, did you hear anything?" or "cook, where were you"
  const direct = text.match(/^([^,?]{2,40}),\s*(.+)$/);
  if (direct && ctx.suspects?.length) {
    const who = findSuspect(direct[1]!, ctx.suspects);
    if (who) return { kind: 'tool', tool: 'question_suspect', args: { suspect: who.id, question: ensureQuestion(direct[2]!) } };
  }
  // a question that names a suspect anywhere: "did the butler see anything"
  if (ctx.suspects?.length && /\?$|^(where|what|why|when|how|who|did|do|were|was)\b/i.test(text)) {
    const who = findSuspect(text, ctx.suspects);
    if (who) return { kind: 'tool', tool: 'question_suspect', args: { suspect: who.id, question: ensureQuestion(text) } };
  }

  return { kind: 'unknown', text };
}

function ensureQuestion(s: string): string {
  const q = s.trim().replace(/[.!]+$/, '');
  return (q.charAt(0).toUpperCase() + q.slice(1)) + (q.endsWith('?') ? '' : '?');
}

function findSuspect(fragment: string, suspects: { id: string; name: string; role: string }[]) {
  const f = ` ${fragment.toLowerCase().replace(/[^a-z\s']/g, ' ')} `;
  for (const s of suspects) {
    const keys = [s.id, s.role.replace(/^the /i, ''), ...s.name.toLowerCase().replace(/\./g, '').split(/\s+/).filter((w) => w.length > 2 && !['mrs', 'mr', 'miss', 'lord', 'lady'].includes(w))];
    if (keys.some((k) => f.includes(` ${k.toLowerCase()} `))) return s;
  }
  return null;
}

export const HELP_TEXT =
  'You can say: start a new case, who are the suspects, ask the cook where she was at nine, examine the boot prints, next round, give me a hint, or I accuse the gardener.';
