// A tiny in-memory game for tests and for running the add-on without the full server.
// Two hand-written cases, one per tone. Fair, small, and fully deterministic.

import type {
  CaseRef, Handoff,
  RoundResult,
  AccuseResult, CaseSummary, ClueCard, GameApi, Hint, StartOptions, SuspectCard, SuspectReply, Tone,
} from './types.ts';

interface FakeSuspect extends SuspectCard {
  where: string;    // answer to "where were you"
  why: string;      // answer to motive questions
  saw: string;      // answer to "did you see anything"
  other: string;    // anything else
}

interface FakeCase {
  summary: Omit<CaseSummary, 'suspectCount' | 'boardClueCount' | 'phase' | 'round' | 'solved'>;
  suspects: FakeSuspect[];
  clues: ClueCard[];
  culprit: string;
  means: string;
  hints: { text: string; clueId?: string }[];
  steps: { says: string; therefore: string }[];
}

const CLASSIC: FakeCase = {
  summary: {
    id: 'fake-classic-1',
    tone: 'classic',
    title: 'The Last Toast at Marlow House',
    place: 'Marlow House, a manor by the sea',
    dateLine: 'A stormy Saturday night, 1931',
    intro: 'The storm cut the road at eight. By nine, Lord Edmund Marlow lay still on the library rug, his evening toast never finished. Four people were in the house. One of them is lying to you.',
    victim: { name: 'Lord Edmund Marlow', description: 'Owner of Marlow House, fond of brandy and of reminding people what they owed him.' },
    crime: { room: 'the library', time: '9:00 pm', what: 'was struck down' },
    items: [
      { id: 'candlestick', name: 'the brass candlestick' },
      { id: 'shears', name: 'the garden shears' },
      { id: 'rollingpin', name: 'the rolling pin' },
    ],
  },
  suspects: [
    { id: 'cook', portraitUrl: '/tv/art/portraits/cook.webp', name: 'Mrs. Agatha Pike', role: 'the cook', motive: 'Was to be let go after thirty years of service.',
      claimedAlibi: 'Says she was in the kitchen all evening.',
      where: 'In my kitchen, where else? My pie timer rang at nine on the dot and Molly saw me take it out.',
      why: 'Thirty years I fed that man, and he meant to send me off with a handshake. Cross, yes. Cruel, no.',
      saw: 'Only mud on my clean floor by the garden door. Somebody tracked it through around a quarter to nine.',
      other: 'I keep my rolling pin where it belongs, thank you, on the hook by the stove.' },
    { id: 'gardener', portraitUrl: '/tv/art/portraits/gardener.webp', name: 'Tom Bramble', role: 'the gardener', motive: 'Owed Lord Marlow more money than he could ever repay.',
      claimedAlibi: 'Says he was in the greenhouse until ten.',
      where: 'In the greenhouse, minding the orchids. Storm like that, you do not leave them.',
      why: 'A debt is a debt. He was patient about it, mostly. I had no reason to wish him harm.',
      saw: 'Nothing. Rain on the glass, that is all I saw.',
      other: 'My boots? Muddy, of course they are. I work in a garden.' },
    { id: 'niece', portraitUrl: '/tv/art/portraits/heiress.webp', name: 'Clara Marlow', role: 'the niece', motive: 'Inherits the house now that her uncle is gone.',
      claimedAlibi: 'Says she was on the telephone in the study.',
      where: 'On the telephone to London, from just before nine until well after. Ask the exchange, they keep a log.',
      why: 'Everyone assumes I wanted the house. I wanted a life far away from it.',
      saw: 'I heard the garden door bang shut a little before nine. I thought it was the wind.',
      other: 'Uncle Edmund and I argued at dinner. Everybody heard. It was about money, it always was.' },
    { id: 'butler', portraitUrl: '/tv/art/portraits/butler.webp', name: 'Mr. Hollis', role: 'the butler', motive: 'Knew every family secret, and was paid to keep them.',
      claimedAlibi: 'Says he was polishing silver in the pantry.',
      where: 'In the butler\'s pantry with young Jenkins, polishing the silver for Sunday. He can vouch for every minute.',
      why: 'Discretion is my profession. His lordship\'s secrets were safer with me alive and employed.',
      saw: 'When I last laid the hall table at half past eight, the brass candlestick was there. By nine it was not.',
      other: 'I would rather not speculate about the family, if it is all the same to you.' },
  ],
  clues: [
    { id: 'boots', title: 'Muddy boot prints', kind: 'physical', round: 1,
      text: 'Fresh muddy boot prints run from the garden door to the library. The mud is still wet.' },
    { id: 'candle', title: 'The empty hall table', kind: 'physical', round: 1,
      text: 'The brass candlestick is missing from the hall table, beside the library door.' },
    { id: 'timer', title: 'The pie timer', kind: 'testimony', round: 2,
      text: 'Molly the maid saw the cook take a pie from the oven when the timer rang at nine.' },
    { id: 'phone', title: 'The exchange log', kind: 'document', round: 2,
      text: 'The telephone exchange logged a call from the study to London, 8:52 to 9:20 pm.' },
    { id: 'silver', title: 'Polished silver', kind: 'testimony', round: 3,
      text: 'Young Jenkins swears he and Mr. Hollis polished silver together from eight until ten.' },
  ],
  culprit: 'gardener',
  means: 'candlestick',
  hints: [
    { text: 'Start with the pie timer. Where does it put the cook at nine?', clueId: 'timer' },
    { text: 'The exchange log says someone was on the telephone the whole time. Who was that?', clueId: 'phone' },
    { text: 'Mr. Hollis had company at nine. Check the polished silver card.', clueId: 'silver' },
    { text: 'Who in this house would have muddy boots, and who said they never left the greenhouse?', clueId: 'boots' },
  ],
  steps: [
    { says: 'The pie timer rang at nine with the cook in the kitchen.', therefore: 'The cook was not in the library.' },
    { says: 'The exchange logged Clara on the telephone until 9:20.', therefore: 'Clara was not in the library.' },
    { says: 'Jenkins was with Mr. Hollis all evening.', therefore: 'The butler was not in the library.' },
    { says: 'Wet garden mud led to the library, and the candlestick vanished from beside its door.', therefore: 'Tom Bramble came in from the garden and took the candlestick.' },
  ],
};

const COZY: FakeCase = {
  summary: {
    id: 'fake-cozy-1',
    tone: 'cozy',
    title: 'The Case of the Vanishing Birthday Cake',
    place: 'Willowbrook Bakery, on the village green',
    dateLine: 'A sunny Sunday afternoon',
    intro: 'Grandma June baked a three tier lemon cake for the village party. At three o\'clock she turned around and it was gone. Only crumbs remain. Somebody here has frosting on their conscience.',
    victim: { name: 'The lemon birthday cake', description: 'Three tiers, lemon curd, and a sugar rose on top.' },
    crime: { room: 'the bakery', time: '3:00 pm', what: 'vanished' },
    items: [
      { id: 'cakebox', name: 'the big pink cake box' },
      { id: 'wagon', name: 'the red wagon' },
      { id: 'basket', name: 'the picnic basket' },
    ],
  },
  suspects: [
    { id: 'pip', portraitUrl: '/tv/art/portraits/nephew.webp', name: 'Pip Hollow', role: 'the neighbour kid', motive: 'Was not invited to the party.',
      claimedAlibi: 'Says he was flying his kite on the green.',
      where: 'Flying my kite on the green! It got stuck in the oak tree right at three. Everyone laughed.',
      why: 'I was a bit sad about the party. But I would never take a cake. Probably.',
      saw: 'I saw a pink cake box going past the window. I was busy with my kite though.',
      other: 'Is there going to be any cake left? Asking for a friend.' },
    { id: 'fennel', portraitUrl: '/tv/art/portraits/colonel.webp', name: 'Mr. Fennel', role: 'the postman', motive: 'Has a famous sweet tooth and a long route.',
      claimedAlibi: 'Says he was delivering letters on Mill Lane.',
      where: 'Mill Lane, every Sunday at three. Mrs. Abernathy signed for a parcel, you can ask her.',
      why: 'I do love lemon. But a postman never leaves his round.',
      saw: 'Somebody with a pink box hurrying toward the duck pond. Couldn\'t see who.',
      other: 'Lovely weather for a party, shame about the cake.' },
    { id: 'daisy', portraitUrl: '/tv/art/portraits/artist.webp', name: 'Daisy Marsh', role: 'the dog walker', motive: 'Her dog Biscuit is banned from the bakery.',
      claimedAlibi: 'Says she was walking dogs by the duck pond.',
      where: 'By the duck pond with six dogs. Well, five. Biscuit wandered off for a bit.',
      why: 'Biscuit would eat a cake, I would not. I am more of a scone person.',
      saw: 'Nothing unusual. Dogs, ducks, sunshine.',
      other: 'Why does everyone keep looking at my coat? That is not frosting. Probably.' },
    { id: 'rosa', portraitUrl: '/tv/art/portraits/journalist.webp', name: 'Rosa Bell', role: 'the party planner', motive: 'Wanted a chocolate cake instead.',
      claimedAlibi: 'Says she was hanging bunting in the hall.',
      where: 'In the village hall, up a ladder, hanging bunting. Vicar Thorne held the ladder the whole time.',
      why: 'I suggested chocolate. Once. Maybe twice. That is hardly a crime.',
      saw: 'From the hall window I saw the red wagon parked by the pond. It is usually by the bakery.',
      other: 'The party starts at five whether we have a cake or not.' },
  ],
  clues: [
    { id: 'frosting', title: 'Lemon frosting on a coat', kind: 'physical', round: 1,
      text: 'A smear of lemon frosting on a blue coat left by the duck pond bench.' },
    { id: 'box', title: 'The pink cake box', kind: 'physical', round: 1,
      text: 'The big pink cake box is missing from the bakery shelf. It was there at half past two.' },
    { id: 'kite', title: 'Kite in the oak', kind: 'testimony', round: 2,
      text: 'Six people saw Pip trying to free his kite from the oak tree at three o\'clock.' },
    { id: 'parcel', title: 'Signed for parcel', kind: 'document', round: 2,
      text: 'Mrs. Abernathy signed for a parcel on Mill Lane at 3:02 pm. Mr. Fennel delivered it.' },
    { id: 'ladder', title: 'The steady ladder', kind: 'testimony', round: 3,
      text: 'Vicar Thorne held Rosa\'s ladder in the village hall from two until four.' },
  ],
  culprit: 'daisy',
  means: 'cakebox',
  hints: [
    { text: 'Half the village saw something at three o\'clock. Who was stuck under the oak tree?', clueId: 'kite' },
    { text: 'Somebody signed for a parcel at 3:02. Who brought it?', clueId: 'parcel' },
    { text: 'Rosa had someone holding her ladder. Check the steady ladder card.', clueId: 'ladder' },
    { text: 'Whose coat would be left by the duck pond, and who said Biscuit wandered off?', clueId: 'frosting' },
  ],
  steps: [
    { says: 'Six people saw Pip under the oak at three.', therefore: 'Pip was not at the bakery.' },
    { says: 'Mr. Fennel delivered a signed parcel on Mill Lane at 3:02.', therefore: 'The postman was not at the bakery.' },
    { says: 'The vicar held Rosa\'s ladder until four.', therefore: 'Rosa was not at the bakery.' },
    { says: 'Lemon frosting on a coat by the duck pond, where the pink box was seen heading.', therefore: 'Daisy carried the cake away in the pink cake box.' },
  ],
};

// The Ashby Hall case from packages/protocol/fixtures/demo-case.json: the same cast, culprit, means and clues
// the TV and phone demos play, so every product shot tells one story. Used when FakeGameOptions.caseSet is 'demo'.
const ASHBY: FakeCase = {
  summary: {
    id: 'ashby-hall-classic-8',
    tone: 'classic',
    title: 'A Rather Final Dinner at Ashby Hall',
    place: 'Ashby Hall, a creaking country house in the Cotswolds',
    dateLine: 'A wet Saturday in November, 1932',
    intro: 'Rain hammers the windows of Ashby Hall. The bridge is out, the telephone is dead, and the soup was only lukewarm. Lady Constance Ashby was found in the Kitchen at half past nine, quite dead, her teacup still perfectly level. Five guests are still in the house. One of them did it.',
    victim: { name: 'Lady Constance Ashby', description: 'Matriarch of Ashby Hall. Collector of grudges and very small dogs.' },
    crime: { room: 'the kitchen', time: '9:30 pm', what: 'was found dead' },
    items: [
      { id: 'draught', name: 'the bottle of sleeping draught' },
      { id: 'mallet', name: 'the croquet mallet' },
      { id: 'cord', name: 'the silk dressing gown cord' },
      { id: 'decanter', name: 'the decanter of port' },
    ],
  },
  suspects: [
    { id: 'cook', portraitUrl: '/tv/art/portraits/cook.webp', name: 'Mrs. Dolly Pargeter', role: 'the cook', motive: 'Lady Constance was about to replace her with a fancy chef from Paris.',
      claimedAlibi: 'Says she was laying out the cheese in the Dining Room at half past nine.',
      where: 'Half past nine? In the Dining Room, laying out the cheese. Nobody lays out a cheese board like I do.',
      why: 'A chef from Paris! Thirty years of my gravy and she wanted snails. Cross, yes. Wicked, no.',
      saw: 'I saw young Mr Pike sliding down the banister in the Great Hall like a schoolboy. At his age.',
      other: 'The decanter of port lives in the Dining Room. I never touch it. Hardly ever.' },
    { id: 'nephew', portraitUrl: '/tv/art/portraits/nephew.webp', name: 'Algernon Pike', role: 'the hard-up nephew', motive: 'Lady Constance cut him out of the will last Tuesday.',
      claimedAlibi: 'Says he was in the Dining Room at half past eight.',
      where: 'Half past eight, the Dining Room, dear thing. And at half past nine the Great Hall, watching Mysterio pull coins out of my ear.',
      why: 'Aunt Constance cut me out of the will on Tuesday. Rotten timing, I grant you, but I am a lover, not a poisoner.',
      saw: 'Mysterio was with me in the Great Hall at half past nine. He found a shilling in my ear. Twice.',
      other: 'I may have borrowed the Colonel\'s umbrella. And his hat. Not his port.' },
    { id: 'doctor', portraitUrl: '/tv/art/portraits/doctor.webp', name: 'Dr. Harriet Bligh', role: 'the family doctor', motive: 'Lady Constance owed her three years of unpaid house calls.',
      claimedAlibi: 'Says she was in the Study with the Colonel at ten.',
      where: 'At ten I was in the Study with the Colonel, arguing about toast. Medically, he was wrong.',
      why: 'She owed me three years of house calls. One does not murder a debtor. One sends a stern letter.',
      saw: 'I heard the kitchen door bang a little after nine. Kitchens are not my department.',
      other: 'The sleeping draught in the Pantry is mine. It was exactly where I left it at nine.' },
    { id: 'colonel', portraitUrl: '/tv/art/portraits/colonel.webp', name: 'Colonel Rupert Hargreaves', role: 'the retired colonel', motive: 'Lady Constance told everyone the Colonel spent the war in a supply depot. He did.',
      claimedAlibi: 'Says he was in the Great Hall at eight.',
      where: 'Eight o\'clock? The Great Hall, inspecting the umbrellas. And at ten, the Study, with the doctor.',
      why: 'She told everyone I spent the war in a supply depot. I did. It was a very dangerous depot.',
      saw: 'Saw young Pike on the banister. Disgraceful. Rather good form, mind you.',
      other: 'The place cards at dinner were perfectly arranged. By whom is nobody\'s business.' },
    { id: 'magician', portraitUrl: '/tv/art/portraits/magician.webp', name: 'Hugo Mysterio', role: 'the stage magician', motive: 'Lady Constance was his biggest investor, and wanted the money back.',
      claimedAlibi: 'Says he was in the Great Hall at half past nine.',
      where: 'Half past nine, the Great Hall, entertaining young Algernon. Ask him to check his ear.',
      why: 'She was my biggest investor and wanted her money back. Dead investors do not pay, my friend.',
      saw: 'The Dining Room door was wedged shut all evening. I tried it, for a trick.',
      other: 'A magician never reveals his secrets. Except that one. The coin was in my sleeve.' },
  ],
  clues: [
    { id: 'r1b1', title: 'Colonel Hargreaves\'s little secret', kind: 'testimony', round: 1,
      text: 'Colonel Rupert Hargreaves claims to have been in the Great Hall at 8:00 pm. Not so: he was in the Dining Room, caught swapping the place cards to sit next to a secret crush. Mortifying, yes. Criminal, no.' },
    { id: 'r1b2', title: 'The croquet mallet', kind: 'physical', round: 1,
      text: 'The Great Hall was tidied at 10:00 pm. The croquet mallet was there, exactly where it always is.' },
    { id: 'r2b1', title: 'Algy\'s little secret', kind: 'testimony', round: 2,
      text: 'Fresh evidence: at 8:30 pm Algernon Pike was in the Great Hall, sliding down the banister. Not the Dining Room, whatever Algy may say.' },
    { id: 'r2b2', title: 'An alibi wobbles', kind: 'physical', round: 2,
      text: 'Mrs. Dolly Pargeter claims to have spent 9:30 pm in the Dining Room. But at 9:30 pm nobody was in the Dining Room: the door was still wedged shut with yesterday\'s newspaper.' },
    { id: 'r3b1', title: 'An empty Dining Room', kind: 'physical', round: 3,
      text: 'Nobody was in the Dining Room at 9:30 pm: the dust on the floor shows not a single footprint. So Hugo Mysterio was not there either.' },
    { id: 'r3b2', title: 'An empty Kitchen', kind: 'physical', round: 3,
      text: 'Nobody was in the Kitchen at 8:00 pm: the lamps were off and the cat was asleep on the only chair. So Dr. Harriet Bligh was not there either.' },
  ],
  culprit: 'cook',
  means: 'decanter',
  hints: [
    { text: 'Start with the croquet mallet. Where was it at ten, and could it have been in the Kitchen at half past nine?', clueId: 'r1b2' },
    { text: 'The Colonel told a little fib about eight o\'clock. Embarrassing, but does it matter for half past nine?', clueId: 'r1b1' },
    { text: 'Someone says they were in the Dining Room at half past nine. Was anybody in there at all?', clueId: 'r2b2' },
    { text: 'Who is left with nobody to vouch for them at half past nine, and what lives in the Dining Room?' },
  ],
  steps: [
    { says: 'Dr. Harriet Bligh and Colonel Rupert Hargreaves were together in the Study at 10:00 pm.', therefore: 'Dr. Harriet Bligh and Colonel Rupert Hargreaves are in the clear.' },
    { says: 'Algernon Pike and Hugo Mysterio were in the Great Hall at 9:30 pm.', therefore: 'Neither of them could have done it.' },
    { says: 'The croquet mallet was in the Great Hall at 10:00 pm, and the cord in the Library at 9:00 pm.', therefore: 'Neither was used.' },
    { says: 'Mrs. Dolly Pargeter was not in the Dining Room at 9:30 pm.', therefore: 'Mrs. Dolly Pargeter lied about 9:30 pm. She took the decanter of port from the Dining Room and was in the Kitchen at 9:30 pm.' },
  ],
};

export interface FakeGameOptions {
  /** Milliseconds per generation step. Default 250. */
  stepMs?: number;
  /** Room code this game pretends to have on the TV. */
  roomCode?: string;
  /** 'demo': the classic case is Ashby Hall, the case the TV and phone demos play (room MOTH). Default: Marlow House. */
  caseSet?: 'default' | 'demo';
}

/** Thrown for unknown ids so the add-on can answer kindly. */
export class NotFoundError extends Error {}
export class NoCaseError extends Error {
  constructor() { super('No case is open yet.'); }
}

export function createFakeGameApi(opts: FakeGameOptions = {}): GameApi & { readonly accusations: number } {
  const demoSet = opts.caseSet === 'demo';
  const CLASSIC_CASE = demoSet ? ASHBY : CLASSIC;
  const roomCode = opts.roomCode ?? (demoSet ? 'MOTH' : 'MRLW');
  const stepMs = opts.stepMs ?? 250;
  let current: FakeCase | null = null;
  let solved = false;
  let hintIndex = 0;
  let round = 1;
  let accusations = 0;
  const asked = new Map<string, number>();

  const need = (): FakeCase => {
    if (!current) throw new NoCaseError();
    return current;
  };
  const summary = (c: FakeCase): CaseSummary => ({
    ...c.summary,
    suspectCount: c.suspects.length,
    boardClueCount: c.clues.filter((x) => (x.round ?? 1) <= round).length,
    phase: solved ? 'results' : 'investigate',
    round,
    roomCode,
    solved,
  });
  const card = ({ where: _w, why: _y, saw: _s, other: _o, ...pub }: FakeSuspect): SuspectCard => pub;

  return {
    get accusations() { return accusations; },

    async startCase(tone: Tone, o?: StartOptions) {
      const steps = ['Setting the scene', 'Placing the suspects', 'Hiding the clues', 'Checking there is exactly one answer'];
      for (let i = 0; i < steps.length; i++) {
        if (o?.signal?.aborted) throw new Error('Case generation was cancelled.');
        o?.onProgress?.({ progress: i, total: steps.length, message: steps[i]! });
        await new Promise((r) => setTimeout(r, stepMs));
      }
      o?.onProgress?.({ progress: steps.length, total: steps.length, message: 'The case is ready' });
      current = tone === 'cozy' ? COZY : CLASSIC_CASE;
      solved = false;
      hintIndex = 0;
      round = 1;
      asked.clear();
      return summary(current);
    },

    getCaseSummary() {
      return current ? summary(current) : null;
    },

    listSuspects() {
      return need().suspects.map(card);
    },

    askSuspect(suspectId: string, question: string): SuspectReply {
      const s = need().suspects.find((x) => x.id === suspectId);
      if (!s) throw new NotFoundError(`No suspect called ${suspectId}.`);
      asked.set(s.id, (asked.get(s.id) ?? 0) + 1);
      const q = question.toLowerCase();
      let text = s.other;
      if (/\b(where|when|nine|three|o'?clock|alibi|doing|at \d)/.test(q)) text = s.where;
      else if (/\b(why|motive|money|feel|angry|like him|like her|reason|hate|want)/.test(q)) text = s.why;
      else if (/\b(see|saw|hear|heard|notice|anyone|anything|somebody|someone)/.test(q)) text = s.saw;
      return { text, suspectId: s.id, suspectName: s.name };
    },

    examineClue(clueId: string) {
      const c = need().clues.find((x) => x.id === clueId && (x.round ?? 1) <= round);
      if (!c) throw new NotFoundError(`That clue is not on the board yet.`);
      return c;
    },

    listBoardClues() {
      return need().clues.filter((x) => (x.round ?? 1) <= round);
    },

    resumeCase(ref: CaseRef) {
      const c = [CLASSIC_CASE, COZY].find((x) => x.summary.id === ref.caseId) ?? (ref.roomCode === roomCode ? current : null);
      if (!c) return null;
      if (current !== c) { current = c; solved = false; hintIndex = 0; asked.clear(); round = Math.min(3, Math.max(1, ref.round ?? 1)); }
      return summary(c);
    },

    handoff(): Handoff {
      need();
      return { roomCode, tvPath: `/tv/?room=${roomCode}`, joinPath: `/p?room=${roomCode}` };
    },

    nextRound(): RoundResult {
      const c = need();
      if (round < 3) round++;
      return { round, phase: 'investigate', newClues: c.clues.filter((x) => x.round === round) };
    },

    accuse(culprit: string, item?: string): AccuseResult {
      const c = need();
      const accused = c.suspects.find((s) => s.id === culprit);
      if (!accused) throw new NotFoundError(`No suspect called ${culprit}.`);
      const itm = item ? c.summary.items.find((i) => i.id === item) ?? null : null;
      accusations++;
      solved = true;
      const real = c.suspects.find((s) => s.id === c.culprit)!;
      const means = c.summary.items.find((i) => i.id === c.means)!;
      const correct = accused.id === c.culprit && (!itm || itm.id === c.means);
      const explanation = correct
        ? `You got it. ${real.name}, ${real.role}, did it with ${means.name}.`
        : accused.id === c.culprit
          ? `Right person, wrong means. It was ${real.name}, but with ${means.name}.`
          : `Not quite. ${accused.name} is innocent. It was ${real.name}, ${real.role}, with ${means.name}.`;
      return {
        correct,
        accused: { id: accused.id, name: accused.name },
        item: itm,
        culprit: { id: real.id, name: real.name },
        means,
        explanation,
        steps: c.steps,
      };
    },

    hint(): Hint {
      const c = need();
      const h = c.hints[Math.min(hintIndex, c.hints.length - 1)]!;
      hintIndex = Math.min(hintIndex + 1, c.hints.length);
      return { ...h, hintsLeft: c.hints.length - hintIndex };
    },
  };
}
