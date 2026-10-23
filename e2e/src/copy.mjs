// Copy audit: AI-sounding phrasing, spoken forms in captions, typos, vendor brands, naming consistency.
import fs from 'node:fs';

const STOCK = ['delve', 'delves', 'delving', 'seamless', 'seamlessly', 'elevate', 'elevates', 'tapestry', 'robust', 'leverage', 'unleash', 'embark', 'realm', 'testament', 'vibrant', 'intricate', 'bustling', 'captivating', 'meticulous', 'meticulously', 'pivotal', 'foster', 'showcase', 'myriad', 'plethora', 'synergy', 'game-changer', 'game changer', 'cutting-edge', 'immersive', 'unparalleled', 'navigate the', 'in today\'s', 'whether you\'re', 'look no further', 'embrace', 'journey', 'treasure trove', 'nestled', 'enigmatic', 'a symphony of', 'dive into', 'dive in', 'buckle up', 'let\'s dive', 'gripping', 'elevated', 'curated', 'unlock the', 'harness'];
const CLOSERS = [/\bhappy (sleuthing|hunting|investigating)\b/i, /\bgood luck\b/i, /\benjoy\b[^.]*!/i, /\blet the (games|fun) begin\b/i, /\bthe game is afoot\b/i, /\bstay tuned\b/i];
const BRANDS = /\b(Claude|Anthropic|OpenAI|ChatGPT|GPT-?\d\w*|Gemini|Bard|Copilot|Alexa|Bedrock|Amazon Polly|Polly|Llama|Mistral|Nova Sonic|ElevenLabs|LLM|large language model|AI[- ]generated|artificial intelligence)\b/;
const SPOKEN = [
  { re: /\bdot (com|net|org|io|co)\b/i, why: 'spoken URL ("dot com")' },
  { re: /\b(?:[A-Z], ){2,}[A-Z]\b/, why: 'letters spelled out with commas (spoken form of a code)' },
  { re: /\bslash\b/i, why: 'spoken "slash"' },
  { re: /\bo clock\b/i, why: '"o clock" without the apostrophe' },
  { re: /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (?:thirty|fifteen|forty[- ]five) (?:pm|am|p\.m\.)/i, why: 'time written as speech' },
  { re: /\bhttps?\b|\bwww\b/i, why: 'URL read aloud' },
];

let DICT = null;
function dict() {
  if (DICT) return DICT;
  DICT = new Set();
  for (const f of ['/usr/share/dict/words', '/usr/share/dict/web2a', '/usr/share/dict/propernames']) {
    try { for (const w of fs.readFileSync(f, 'utf8').split('\n')) if (w) DICT.add(w.toLowerCase()); } catch { /* not on this OS */ }
  }
  return DICT;
}
const EXTRA_OK = new Set(('accomplice accomplices ok tv phone phones app wi fi wifi qr emoji haptic hunch hunches smudge smudged smudging unpin unpinned pinned ' +
  'sleuthing sleuth karaoke voiceover talkback whodunit whodunnit lineup ledger cozy cosy honours honour colour colours favourite parlour ' +
  'cancelled travelling jewellery grey mum realise realised organise apologise theatre centre metre neighbour labour rumour practise ' +
  'gazette butler cook gardener maid colonel doctor dr mr mrs ms lady lord miss sir madam ma\'am ' +
  'detectives detective suspects suspect clue clues pinned links linked string ok onscreen online offline audio mic mics ' +
  'screenshot screenshots url urls api ws hmm hm mm uh um ah oh eh ahem tsk shh ' +
  'there\'s it\'s don\'t can\'t won\'t isn\'t wasn\'t didn\'t couldn\'t wouldn\'t shouldn\'t you\'re you\'ll you\'ve i\'m i\'ve i\'d i\'ll we\'re we\'ll they\'re that\'s what\'s who\'s let\'s here\'s doesn\'t aren\'t weren\'t hasn\'t haven\'t hadn\'t ' +
  'tonight\'s everyone\'s nobody\'s somebody\'s someone\'s ' +
  'birthday cake crumbs teapot candlestick candlesticks letter opener poker decanter ' +
  'vs etc eg ie pm am o\'clock draughty licence mislaid timeline').split(/\s+/));

function words(text) { return text.match(/[A-Za-z][A-Za-z'’]*[A-Za-z]|[A-Za-z]/g) ?? []; }

/**
 * @param {Array<{screen:string, device:string, phase:string, texts:{text:string, full:string, caption:boolean, sel:string}[]}>} moments
 * @param {{ names: string[] }} ctx  proper nouns from the case (suspects, rooms, items, players)
 */
export function auditCopy(moments, ctx) {
  const findings = [];
  const proper = new Set();
  for (const n of ctx.names ?? []) for (const w of words(n)) proper.add(w.toLowerCase());
  const D = dict();
  const add = (kind, m, text, why) => findings.push({ kind, device: m.device, phase: m.phase, screen: m.screen, text: text.slice(0, 160), why });
  const typoSeen = new Map();
  const closerCount = new Map();

  for (const m of moments) {
    const joined = new Set();
    for (const t of m.texts) {
      const s = (t.full || t.text || '').trim();
      if (!s || joined.has(s)) continue;
      joined.add(s);
      if (/[—]/.test(s)) add('em-dash', m, s, 'em dash in player-facing text');
      if (/\s–\s/.test(s)) add('em-dash', m, s, 'spaced en dash used as a dash');
      if (/\bnot (just|only|merely)\b[^.]{0,80}\bbut\b/i.test(s)) add('ai-phrasing', m, s, '"not just X but Y" construction');
      if (/\bit'?s not\b[^.]{0,40}[,;]\s*it'?s\b/i.test(s)) add('ai-phrasing', m, s, '"it\'s not X, it\'s Y" construction');
      for (const w of STOCK) if (new RegExp(`\\b${w.replace(/[-']/g, (c) => `\\${c}`)}\\b`, 'i').test(s)) add('ai-phrasing', m, s, `stock word "${w}"`);
      for (const re of CLOSERS) if (re.test(s)) { const k = s.toLowerCase(); closerCount.set(k, (closerCount.get(k) ?? 0) + 1); add('ai-phrasing', m, s, `stock closer (${re.source})`); }
      const b = s.match(BRANDS);
      if (b) add('brand', m, s, `mentions "${b[0]}"`);
      if (t.caption || /narrat|caption/i.test(t.sel)) for (const sp of SPOKEN) if (sp.re.test(s)) add('spoken-form', m, s, sp.why);
      if (/\b([A-Za-z]{2,})\s+\1\b/i.test(s) && !/\b(that that|had had|very very|no no|ha ha|tick tock|knock knock)\b/i.test(s)) add('typo', m, s, `doubled word "${s.match(/\b([A-Za-z]{2,})\s+\1\b/i)[0]}"`);
      if (/\b([A-Za-z]{2,})[:,;]\s+\1\b/i.test(s)) add('typo', m, s, `repeated word across punctuation "${s.match(/\b([A-Za-z]{2,})[:,;]\s+\1\b/i)[0]}"`);
      if (/\s[,.!?;:](?!\d)/.test(s) && !/\s\.\.\./.test(s)) add('typo', m, s, 'space before punctuation');
      if (/ {2,}/.test(t.full ?? '')) { /* collapsed by innerText; ignore */ }
      if (/\.\.\.(?!$)/.test(s) && /…/.test(s)) add('typo', m, s, 'mixes ... and … in one string');
      if (/\b(undefined|null|NaN|\[object Object\])\b/.test(s)) add('typo', m, s, 'leaked code value');
      if (/\{[A-Z_]+\}/.test(s)) add('typo', m, s, 'unfilled template placeholder');
      // spelling: lowercase words not in the dictionary and not proper nouns from the case
      for (const w0 of words(s)) {
        const w = w0.replace(/’/g, "'").toLowerCase();
        if (w.length < 3 || D.size === 0) continue;
        if (D.has(w) || EXTRA_OK.has(w) || proper.has(w)) continue;
        const base = w.replace(/'s$/, '').replace(/(ing|ed|es|s|ly|er|est|ness)$/, '');
        if (D.has(base) || D.has(base + 'e') || D.has(w.replace(/'s$/, '')) || D.has(w.replace(/ies$/, 'y')) || D.has(w.replace(/ied$/, 'y')) || D.has(w.replace(/(.)\1(ing|ed|er)$/, '$1'))) continue;
        if (/^[A-Z]/.test(w0) && !/^[A-Z][a-z]/.test(s.slice(s.indexOf(w0) - 2 < 0 ? 0 : s.indexOf(w0) - 2))) { /* likely a name mid sentence */ }
        if (/^[A-Z]/.test(w0)) continue; // capitalised: treat as a name
        const k = `${w}`;
        if (typoSeen.has(k)) continue;
        typoSeen.set(k, true);
        add('spelling', m, s, `"${w0}" is not in the dictionary`);
      }
    }
  }
  // British vs American spelling mix across the whole product
  const all = moments.flatMap((m) => m.texts.map((t) => t.text)).join(' \n ').toLowerCase();
  const pairs = [['colour', 'color'], ['honour', 'honor'], ['favourite', 'favorite'], ['cosy', 'cozy'], ['parlour', 'parlor'], ['grey', 'gray'], ['realise', 'realize'], ['theatre', 'theater'], ['centre', 'center'], ['cancelled', 'canceled']];
  for (const [uk, us] of pairs) {
    if (new RegExp(`\\b${uk}`).test(all) && new RegExp(`\\b${us}`).test(all)) findings.push({ kind: 'consistency', device: 'all', phase: 'all', screen: '', text: `${uk} / ${us}`, why: 'British and American spellings both appear' });
  }
  return findings;
}

/** Compare how suspects, the house character and players are named on the TV vs phones in the same phase. */
export function nameConsistency(moments, c, players) {
  const out = [];
  if (!c) return out;
  const variants = (s) => {
    const full = s.name;
    const parts = full.split(' ');
    return { full, short: s.shortName ?? full, last: parts[parts.length - 1], first: parts[0] };
  };
  for (const s of c.suspects ?? []) {
    const v = variants(s);
    const tvForms = new Set(), phoneForms = new Set();
    for (const m of moments) {
      for (const t of m.texts) {
        const txt = t.text ?? '';
        for (const f of [v.full, v.short]) if (f && txt.includes(f)) (m.device === 'tv' ? tvForms : phoneForms).add(f);
      }
    }
    // a suspect that the TV calls by one name and phones never mention by either form
    if (tvForms.size && phoneForms.size && ![...tvForms].some((f) => phoneForms.has(f))) out.push({ kind: 'names', why: `${s.name}: TV says ${[...tvForms].join(' / ')}, phones say ${[...phoneForms].join(' / ')}`, text: s.name });
  }
  // the house character
  const houseTv = new Set(), housePhone = new Set();
  for (const m of moments.filter((x) => x.phase.startsWith('tutorial'))) {
    for (const t of m.texts) {
      const mm = (t.full || t.text || '').match(/^Ask (.+?)(?: anything|,)/);
      if (mm) (m.device === 'tv' ? houseTv : housePhone).add(mm[1].trim());
    }
  }
  if (houseTv.size && housePhone.size && ![...houseTv].some((h) => [...housePhone].some((p) => p.includes(h) || h.includes(p)))) out.push({ kind: 'names', why: `Practice character: TV "${[...houseTv].join('/')}" vs phone "${[...housePhone].join('/')}"`, text: 'house' });
  // player names should match exactly everywhere
  for (const p of players ?? []) {
    const anyTv = moments.some((m) => m.device === 'tv' && m.texts.some((t) => (t.text ?? '').includes(p.name)));
    const anyPhone = moments.some((m) => m.device !== 'tv' && m.texts.some((t) => (t.text ?? '').includes(p.name)));
    if (!anyTv && anyPhone) out.push({ kind: 'names', why: `Player "${p.name}" never appears by name on the TV`, text: p.name });
  }
  return out;
}
