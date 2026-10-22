// Content banks: settings (floor plans on a 16 x 9 grid), suspect archetypes, means, and phrasing.
// All player-facing text lives here or in text.ts. House style: warm, witty, no gore, no em dashes.
import type { Tone } from '@accomplice/protocol';

export interface RoomDef {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number;
  /** Mildly embarrassing things a person might be caught doing here. Kid safe. "caught {activity}" */
  caught: string[];
}

export interface ItemDef { id: string; name: string; home: string }

export interface CrimeDef {
  victim: string;          // display name of the victim (or the missing treasure, in cozy)
  short: string;           // short reference used inside sentences ("Sir Hector", "the cake")
  description: string;
  what: string;            // "was found dead" | "vanished"
  /** Narrator line about the crime. {room} {time} {found} are filled in. */
  line: string;
}

export interface ToneDef {
  dateLine: string;
  slots: string[];
  titles: string[];
  /** Narrator opening, before the crime line. */
  opening: string;
  /** First briefing slide: setting and time, 20 words or fewer. */
  brief: string;
  crimes: CrimeDef[];
  items: ItemDef[];
}

export interface SettingDef {
  id: string;
  name: string;
  scene: string;
  place: string;
  /** "still {aboard}": in the house, aboard the train... */
  aboard: string;
  /** Local paper for the reveal's front page, and the name it prints in headlines. */
  paperName: string;
  headlineName: string;
  rooms: RoomDef[];
  doors: [string, string][];
  tones: Record<Tone, ToneDef>;
}

const CLASSIC_SLOTS = ['8:00 pm', '8:30 pm', '9:00 pm', '9:30 pm', '10:00 pm'];
const COZY_SLOTS = ['3:00 pm', '3:30 pm', '4:00 pm', '4:30 pm', '5:00 pm'];

export const SETTINGS: SettingDef[] = [
  {
    id: 'ashby-hall',
    name: 'Ashby Hall',
    scene: 'scenes/ashby-hall.webp',
    place: 'Ashby Hall, a creaking country house in the Cotswolds',
    aboard: 'in the house',
    paperName: 'The Cotswold Gazette',
    headlineName: 'ASHBY HALL',
    rooms: [
      { id: 'library', name: 'Library', x: 0, y: 0, w: 5, h: 4, caught: ['reading the host\'s private diary and gasping at the good bits', 'asleep under a newspaper, snoring like a tuba', 'hiding a library book that was due back in 1998'] },
      { id: 'study', name: 'Study', x: 5, y: 0, w: 4, h: 4, caught: ['practising an acceptance speech to the mirror', 'trying on the host\'s spare monocle', 'reading other people\'s postcards'] },
      { id: 'conservatory', name: 'Conservatory', x: 9, y: 0, w: 7, h: 4, caught: ['talking tenderly to the orchids', 'doing yoga very badly behind a palm', 'singing opera to a cactus'] },
      { id: 'hall', name: 'Great Hall', x: 0, y: 4, w: 6, h: 5, caught: ['sliding down the banister', 'waltzing alone with a coat stand', 'hiding from the vicar inside a suit of armour'] },
      { id: 'dining', name: 'Dining Room', x: 6, y: 4, w: 5, h: 5, caught: ['swapping the place cards to sit next to a secret crush', 'licking the gravy boat', 'polishing off everyone\'s leftover pudding'] },
      { id: 'kitchen', name: 'Kitchen', x: 11, y: 4, w: 5, h: 3, caught: ['eating trifle straight from the bowl', 'feeding sausages to the dog under the table', 'secretly re-salting the soup'] },
      { id: 'pantry', name: 'Pantry', x: 11, y: 7, w: 5, h: 2, caught: ['eating jam with a teaspoon from the jar', 'hiding behind the flour sacks to avoid a bore', 'counting the biscuits, twice'] },
    ],
    doors: [['library', 'study'], ['study', 'conservatory'], ['library', 'hall'], ['hall', 'dining'], ['dining', 'kitchen'], ['kitchen', 'pantry'], ['conservatory', 'kitchen']],
    tones: {
      classic: {
        dateLine: 'A wet Saturday in November, 1932',
        slots: CLASSIC_SLOTS,
        titles: ['Murder at Ashby Hall', 'The Ashby Hall Affair', 'A Rather Final Dinner at Ashby Hall'],
        brief: 'Ashby Hall, November 1932. The bridge is out, the phone is dead, and the soup was lukewarm.',
        opening: 'Rain hammers the windows of Ashby Hall. The bridge is out, the telephone is dead, and the soup was only lukewarm. Then things got worse.',
        crimes: [
          { victim: 'Sir Hector Ashby', short: 'Sir Hector', description: 'The owner of Ashby Hall. Rich, rude, and rewriting his will at dinner.', what: 'was found dead', line: '{victim} was found in the {room}, stone dead and still wearing an expression of mild disapproval. The doctor says it happened at {time}.' },
          { victim: 'Lady Constance Ashby', short: 'Lady Constance', description: 'Matriarch of Ashby Hall. Collector of grudges and very small dogs.', what: 'was found dead', line: '{victim} was found in the {room}, quite dead, her teacup still perfectly level. It happened at {time}, give or take a biscuit.' },
        ],
        items: [
          { id: 'candlestick', name: 'brass candlestick', home: 'study' },
          { id: 'decanter', name: 'decanter of port', home: 'dining' },
          { id: 'draught', name: 'bottle of sleeping draught', home: 'pantry' },
          { id: 'mallet', name: 'croquet mallet', home: 'hall' },
          { id: 'cord', name: 'silk dressing gown cord', home: 'library' },
        ],
      },
      cozy: {
        dateLine: 'Granny Ashby\'s birthday, a sunny Sunday',
        slots: COZY_SLOTS,
        titles: ['The Case of the Vanishing Cake', 'Trouble at Ashby Hall', 'The Great Ashby Hall Mystery'],
        brief: 'Ashby Hall, Granny\'s birthday. Bunting, balloons, relatives, and one very important cake.',
        opening: 'Ashby Hall is full of bunting, balloons, and relatives. Everyone is on their best behaviour. Well, nearly everyone.',
        crimes: [
          { victim: 'Granny Ashby\'s birthday cake', short: 'the cake', description: 'Three tiers of lemon sponge with ninety candles. Well, nine. Ninety would be a fire hazard.', what: 'vanished', line: '{victim} vanished from the {room} at {time}. Only a few crumbs and one very sad candle remain.' },
          { victim: 'the prize marrow', short: 'the marrow', description: 'Fourteen pounds of gleaming green glory, due at the village show tomorrow.', what: 'was swapped for a supermarket courgette', line: 'At {time}, {victim} in the {room} was swapped for a supermarket courgette. A small one. The insult is almost worse than the crime.' },
        ],
        items: [
          { id: 'trolley', name: 'tea trolley', home: 'dining' },
          { id: 'hamper', name: 'picnic hamper', home: 'pantry' },
          { id: 'ladder', name: 'step ladder', home: 'hall' },
          { id: 'net', name: 'butterfly net', home: 'conservatory' },
          { id: 'tote', name: 'enormous tote bag', home: 'library' },
        ],
      },
    },
  },
  {
    id: 'sapphire-express',
    name: 'The Sapphire Express',
    scene: 'scenes/sapphire-express.webp',
    place: 'The Sapphire Express, a luxury night train crossing the Alps',
    aboard: 'aboard the train',
    paperName: 'The Express Bulletin',
    headlineName: 'SAPPHIRE EXPRESS',
    rooms: [
      { id: 'kitchen', name: 'Galley', x: 0, y: 0, w: 4, h: 4, caught: ['eating the chef\'s practice eclairs', 'hiding from the ticket inspector in a flour bin', 'teaching a lobster to wave'] },
      { id: 'dining', name: 'Dining Car', x: 4, y: 0, w: 4, h: 4, caught: ['pocketing the sugar cubes', 'swapping the menu cards for a joke', 'drinking soup straight from the tureen'] },
      { id: 'lounge', name: 'Lounge Car', x: 8, y: 0, w: 4, h: 4, caught: ['cheating at patience', 'playing the piano with their elbows', 'dancing alone to the gramophone'] },
      { id: 'first', name: 'First Class Sleepers', x: 12, y: 0, w: 4, h: 4, caught: ['trying on other people\'s hats', 'bouncing on a stranger\'s bunk', 'reading the countess\'s love letters'] },
      { id: 'second', name: 'Second Class Sleepers', x: 10, y: 4, w: 6, h: 5, caught: ['napping in the wrong bunk', 'knitting a scarf for a dog', 'practising card tricks on a sleeping porter'] },
      { id: 'baggage', name: 'Baggage Car', x: 4, y: 4, w: 6, h: 5, caught: ['rummaging through hat boxes', 'sitting inside a trunk for the quiet', 'feeding a stowaway cat'] },
      { id: 'observation', name: 'Observation Car', x: 0, y: 4, w: 4, h: 5, caught: ['crying at the scenery', 'writing very bad poetry about the moon', 'waving at sheep'] },
    ],
    doors: [['kitchen', 'dining'], ['dining', 'lounge'], ['lounge', 'first'], ['first', 'second'], ['second', 'baggage'], ['baggage', 'observation'], ['lounge', 'baggage']],
    tones: {
      classic: {
        dateLine: 'Somewhere between Zurich and Milan, a snowy night in 1934',
        slots: CLASSIC_SLOTS,
        titles: ['Death on the Sapphire Express', 'The Sapphire Express Affair', 'A One Way Ticket'],
        brief: 'The Sapphire Express, 1934. Snowbound in an Alpine pass, champagne cold, nobody getting off.',
        opening: 'The Sapphire Express is snowbound in a mountain pass. The champagne is cold, the passengers are colder, and nobody is getting off this train tonight.',
        crimes: [
          { victim: 'Count Ottokar Vell', short: 'the Count', description: 'A financier with a monocle, a moustache, and a great many enemies.', what: 'was found dead', line: '{victim} was found in the {room}, slumped politely over his newspaper. The guard\'s watch says it happened at {time}.' },
          { victim: 'Mrs. Winifred Sloane', short: 'Mrs. Sloane', description: 'A wealthy widow who knew everyone\'s secrets and kept a little notebook of them.', what: 'was found dead', line: '{victim} was found in the {room}, her little notebook gone. The doctor on board puts it at {time}.' },
        ],
        items: [
          { id: 'punch', name: 'conductor\'s ticket punch', home: 'baggage' },
          { id: 'tongs', name: 'silver sugar tongs', home: 'dining' },
          { id: 'chloral', name: 'vial of chloral', home: 'first' },
          { id: 'bottle', name: 'champagne bottle', home: 'lounge' },
          { id: 'poker', name: 'stove poker', home: 'kitchen' },
        ],
      },
      cozy: {
        dateLine: 'The Great Train Bake Off, a snowy afternoon',
        slots: COZY_SLOTS,
        titles: ['The Missing Teapot', 'Mischief on the Sapphire Express', 'All Aboard for Trouble'],
        brief: 'The Sapphire Express, Bake Off day. Hot ovens, hungry passengers, very serious judges.',
        opening: 'The Sapphire Express is hosting the Great Train Bake Off. The ovens are hot, the passengers are hungry, and the judges are very, very serious.',
        crimes: [
          { victim: 'the Golden Teapot trophy', short: 'the trophy', description: 'A gleaming golden teapot, awarded to the best baker on the line.', what: 'vanished', line: '{victim} vanished from the {room} at {time}. All that is left is a teapot shaped dust mark.' },
          { victim: 'the championship jam roly-poly', short: 'the roly-poly', description: 'The favourite to win. Still warm. Smelled like a hug.', what: 'vanished', line: 'At {time}, {victim} vanished from the {room}. A trail of custard leads absolutely nowhere.' },
        ],
        items: [
          { id: 'trolley', name: 'tea trolley', home: 'dining' },
          { id: 'basket', name: 'laundry basket', home: 'second' },
          { id: 'hatbox', name: 'hatbox', home: 'baggage' },
          { id: 'lantern', name: 'conductor\'s lantern', home: 'observation' },
          { id: 'apron', name: 'baker\'s apron with deep pockets', home: 'kitchen' },
        ],
      },
    },
  },
  {
    id: 'marigold-manor',
    name: 'Marigold Manor',
    scene: 'scenes/marigold-manor.webp',
    place: 'Marigold Manor, a hill station villa above the tea gardens of Darjeeling',
    aboard: 'in the villa',
    paperName: 'The Hill Station Herald',
    headlineName: 'MARIGOLD MANOR',
    rooms: [
      { id: 'veranda', name: 'Veranda', x: 0, y: 0, w: 6, h: 3, caught: ['dancing in the rain like nobody was watching', 'trying to teach the parrot rude words', 'catching raindrops on their tongue'] },
      { id: 'drawing', name: 'Drawing Room', x: 0, y: 3, w: 6, h: 6, caught: ['rearranging the family photos to put themselves in front', 'napping on the good sofa with shoes on', 'reading the host\'s letters by the lamp'] },
      { id: 'music', name: 'Music Room', x: 6, y: 0, w: 5, h: 5, caught: ['singing old film songs at full volume', 'playing the sitar with a spoon', 'practising a dramatic faint'] },
      { id: 'terrace', name: 'Tea Terrace', x: 11, y: 0, w: 5, h: 4, caught: ['sneaking a fourth plate of pakoras', 'feeding biscuits to the monkeys', 'pretending to meditate while eavesdropping'] },
      { id: 'dining', name: 'Dining Room', x: 6, y: 5, w: 5, h: 4, caught: ['picking all the cashews out of the pilau', 'licking the mango pickle spoon', 'counting the silver forks'] },
      { id: 'kitchen', name: 'Kitchen', x: 11, y: 4, w: 5, h: 3, caught: ['stealing hot jalebis from the cooling rack', 'arguing with the pressure cooker', 'eating ladoos two at a time'] },
      { id: 'store', name: 'Store Room', x: 11, y: 7, w: 5, h: 2, caught: ['hiding from a lady who wanted to discuss her horoscope', 'eating condensed milk from the tin', 'trying on a dusty old wedding turban'] },
    ],
    doors: [['veranda', 'drawing'], ['veranda', 'music'], ['drawing', 'dining'], ['music', 'terrace'], ['terrace', 'kitchen'], ['kitchen', 'store'], ['dining', 'kitchen']],
    tones: {
      classic: {
        dateLine: 'A monsoon night in July, 1936',
        slots: CLASSIC_SLOTS,
        titles: ['Murder at Marigold Manor', 'Monsoon at Marigold Manor', 'The Marigold Manor Mystery'],
        brief: 'Marigold Manor, July 1936. Monsoon rain, a washed out road, and the lamps flickering.',
        opening: 'The monsoon has arrived at Marigold Manor with the force of an opera. The road down the hill has washed away, the lamps are flickering, and the chai has gone cold.',
        crimes: [
          { victim: 'Mr. Rupert Ainsworth-Rao', short: 'Mr. Ainsworth-Rao', description: 'Tea baron, owner of Marigold Manor, and owner of strong opinions about everybody else.', what: 'was found dead', line: '{victim} was found in the {room}, very dead and very damp. The clock on the wall stopped at {time}.' },
          { victim: 'Begum Zarina Qureshi', short: 'the Begum', description: 'A formidable widow with a famous emerald and a famous temper.', what: 'was found dead', line: '{victim} was found in the {room}, quite dead, her emerald still on her finger. Whoever did it came at {time}.' },
        ],
        items: [
          { id: 'bookend', name: 'brass elephant bookend', home: 'music' },
          { id: 'tonic', name: 'bottle of sleeping tonic', home: 'store' },
          { id: 'bat', name: 'cricket bat', home: 'veranda' },
          { id: 'gong', name: 'dinner gong mallet', home: 'dining' },
          { id: 'tin', name: 'tea tin of something not quite tea', home: 'terrace' },
        ],
      },
      cozy: {
        dateLine: 'A rainy monsoon afternoon, the day before Diwali',
        slots: COZY_SLOTS,
        titles: ['The Pickle Puzzle', 'The Case of the Missing Mango Pickle', 'Mischief at Marigold Manor'],
        brief: 'Marigold Manor, the day before Diwali. Rain so heavy the frogs have moved onto the veranda.',
        opening: 'It is raining so hard at Marigold Manor that the frogs have taken up residence on the veranda. The whole family is indoors, and someone is up to something.',
        crimes: [
          { victim: 'Nani\'s famous jar of mango pickle', short: 'the pickle', description: 'A secret recipe, forty years old, and spicy enough to make a grown man weep.', what: 'vanished', line: '{victim} vanished from the {room} at {time}. The household is in shock. Nani is in a mood.' },
          { victim: 'the Diwali sweets box', short: 'the sweets box', description: 'Two kilos of ladoos, barfi, and jalebis for tomorrow\'s party.', what: 'vanished', line: 'At {time}, {victim} vanished from the {room}. Someone has a sticky conscience. And probably sticky fingers.' },
        ],
        items: [
          { id: 'umbrella', name: 'giant black umbrella', home: 'veranda' },
          { id: 'tiffin', name: 'stacked tiffin carrier', home: 'kitchen' },
          { id: 'stool', name: 'step stool', home: 'store' },
          { id: 'cricketbag', name: 'cricket kit bag', home: 'drawing' },
          { id: 'shawl', name: 'big woollen shawl', home: 'music' },
        ],
      },
    },
  },
];

export interface ArchetypeDef {
  id: string;
  role: string;
  portrait: string;
  /** [full name, short name] */
  names: [string, string][];
  voices: string[];
  /** Briefing one-liners, five words or so. */
  quip: Record<Tone, string[]>;
  /** First confession line, in their own voice. {V} = victim short reference. */
  confess: Record<Tone, string>;
  traits: string[][];
  motive: Record<Tone, string[]>;   // {V} = victim short reference
}

// Polly voices with neural or generative English models: en-US Ruth, Matthew, Stephen, Danielle, Gregory, Joanna;
// en-GB Amy, Brian, Arthur; en-AU Olivia; en-IN Kajal.
export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'cook', role: 'the cook', portrait: 'portraits/cook.webp',
    names: [['Mrs. Dolly Pargeter', 'Mrs Pargeter'], ['Mrs. Meena Iyer', 'Mrs Iyer'], ['Mrs. Bridget Hollis', 'Mrs Hollis'], ['Mrs. Lakshmi Rao', 'Mrs Rao']],
    voices: ['Kajal', 'Danielle', 'Ruth'],
    traits: [['warm but bossy', 'calls everyone "pet"', 'measures everything in pinches'], ['brisk', 'talks about food when nervous', 'suspicious of anyone thin']],
    quip: { classic: ['rules the kitchen, holds grudges', 'secret recipes, secret resentments'], cozy: ['bakes like an angel, sulks too', 'knows every crumb by name'] },
    confess: { classic: 'Thirty years I fed {V}. Thirty years of soup, and not one word of thanks. Not one.', cozy: 'Thirty years I have baked for this family, and suddenly my sponge is "a little bit dry"?' },
    motive: {
      classic: ['{V} was about to replace her with a fancy chef from Paris.', '{V} called her steak and kidney pie "a war crime" in front of guests.'],
      cozy: ['Was told her own cake was "a little bit dry". She has not recovered.', 'Was not asked to bake for the party, after thirty years of baking for every party.'],
    },
  },
  {
    id: 'gardener', role: 'the gardener', portrait: 'portraits/gardener.webp',
    names: [['Ned Furrow', 'Ned'], ['Arjun Bhatt', 'Arjun'], ['Silas Thorne', 'Silas'], ['Wilf Banning', 'Wilf']],
    voices: ['Stephen', 'Brian', 'Matthew'],
    traits: [['slow and thoughtful', 'compares people to plants', 'mumbles'], ['gruff', 'one word answers', 'secretly sentimental']],
    quip: { classic: ['green fingers, dark moods', 'loves roses more than people'], cozy: ['prize vegetables, prize sulks', 'talks to plants, not people'] },
    confess: { classic: '{V} wanted my roses gone. Forty years of roses. Some things a gardener simply cannot forgive.', cozy: 'I grew that rhubarb with my own two hands. A man has his pride.' },
    motive: {
      classic: ['{V} planned to pave over his prize roses for a tennis court.', '{V} accused him of selling the orchids. He did, but only the ugly ones.'],
      cozy: ['Grew a rival entry for the village show and lost by a whisker.', 'Believes the treat was baked with his stolen rhubarb.'],
    },
  },
  {
    id: 'butler', role: 'the butler', portrait: 'portraits/butler.webp',
    names: [['Mr. Crale', 'Crale'], ['Mr. Hobbs', 'Hobbs'], ['Mr. Venkat Pillai', 'Mr Pillai'], ['Mr. Ashcombe', 'Ashcombe']],
    voices: ['Arthur', 'Gregory', 'Brian'],
    traits: [['impeccably polite', 'answers questions with questions', 'dry as toast'], ['formal', 'pained sighs', 'notices everything']],
    quip: { classic: ['sees everything, says nothing', 'polished silver, tarnished patience'], cozy: ['polite, hungry, and dieting', 'sees everything, says very little'] },
    confess: { classic: 'I served {V} for forty years without a single thank you. Tonight, I served myself.', cozy: 'Polishing spoons all day, on a diet, smelling all that. Even a butler has limits.' },
    motive: {
      classic: ['Forty years of service, and {V} forgot his name at dinner. Twice.', '{V} was about to sell the house, and the butler with it.'],
      cozy: ['Has been on a strict diet since Tuesday and is not coping.', 'Was told to polish two hundred spoons for a party he was not invited to.'],
    },
  },
  {
    id: 'heiress', role: 'the heiress', portrait: 'portraits/heiress.webp',
    names: [['Lady Arabella Finch', 'Lady Arabella'], ['Miss Priya Malhotra', 'Miss Malhotra'], ['Miss Cordelia Vane', 'Miss Vane'], ['Lady Imogen Crewe', 'Lady Imogen']],
    voices: ['Amy', 'Olivia', 'Joanna'],
    traits: [['bored', 'drawls', 'finds everything "too tedious"'], ['sharp tongued', 'laughs at the wrong moments', 'very quick']],
    quip: { classic: ['bored, broke, and about to inherit', 'pearls, poise, and impatience'], cozy: ['wants the best party, always', 'sparkly shoes, sweet tooth'] },
    confess: { classic: 'Darling, I was simply tired of waiting. {V} was taking forever, and I have bills.', cozy: 'I wanted the best party anyone had ever seen. Mine. Not this one.' },
    motive: {
      classic: ['Inherits a fortune the moment {V} stops breathing, and has been counting.', '{V} forbade her engagement to a penniless saxophonist.'],
      cozy: ['Wanted it for her own party next week. Hers was going to be better.', 'Was told she could not have any until after the speeches.'],
    },
  },
  {
    id: 'doctor', role: 'the family doctor', portrait: 'portraits/doctor.webp',
    names: [['Dr. Edith Marsh', 'Dr Marsh'], ['Dr. Anjali Sen', 'Dr Sen'], ['Dr. Harriet Bligh', 'Dr Bligh']],
    voices: ['Ruth', 'Danielle', 'Kajal', 'Amy'],
    traits: [['precise', 'nervous laugh', 'over explains'], ['calm', 'clinical', 'diagnoses everyone she meets']],
    quip: { classic: ['kind hands, unpaid debts', 'steady pulse, shaky past'], cozy: ['anti sugar, pro biscuits', 'diagnoses everyone, then snacks'] },
    confess: { classic: '{V} knew things about me. Doctors are meant to keep secrets. So I kept mine.', cozy: 'Purely for science, you understand. Someone had to test it. Thoroughly.' },
    motive: {
      classic: ['{V} knew about the medical licence she "mislaid" in Lisbon.', '{V} owed her three years of unpaid house calls.'],
      cozy: ['Says sugar is the root of all evil, yet keeps being seen near the biscuit tin.', 'Wants to prove, scientifically, that it was not that delicious.'],
    },
  },
  {
    id: 'colonel', role: 'the retired colonel', portrait: 'portraits/colonel.webp',
    names: [['Colonel Rupert Hargreaves', 'Colonel Hargreaves'], ['Colonel Vikram Chauhan', 'Colonel Chauhan'], ['Colonel Mortimer Gage', 'Colonel Gage']],
    voices: ['Gregory', 'Arthur', 'Brian'],
    traits: [['booming', 'tells long war stories', 'easily offended'], ['barks', 'calls everyone "young man"', 'surprisingly soft hearted']],
    quip: { classic: ['loud stories, quiet debts', 'medals, some of them his'], cozy: ['still cross about last year', 'big voice, soft heart'] },
    confess: { classic: '{V} humiliated me over cards and over my war record. A soldier settles his accounts.', cozy: "I was robbed at last year's show and nobody listened. Well. Everyone is listening now." },
    motive: {
      classic: ['Lost his medals to {V} in a game of cards and wants them back.', '{V} told everyone the Colonel spent the war in a supply depot. He did.'],
      cozy: ['Believes, loudly and often, that he was robbed at last year\'s show.', 'Was not allowed to give his forty minute speech.'],
    },
  },
  {
    id: 'artist', role: 'the painter', portrait: 'portraits/artist.webp',
    names: [['Isadora Lark', 'Isadora'], ['Zoya Mirza', 'Zoya'], ['Pippa Quill', 'Pippa']],
    voices: ['Olivia', 'Joanna', 'Amy', 'Ruth'],
    traits: [['dreamy', 'talks in colours', 'dramatic sighs'], ['intense', 'stares too long', 'finds beauty in odd things']],
    quip: { classic: ['brilliant brush, wounded pride', 'sees beauty, keeps grudges'], cozy: ['paints everything, eats everything', 'dreamy, and suspiciously sticky'] },
    confess: { classic: '{V} called my work a crime against canvas. So I painted a real one.', cozy: 'It was far too beautiful to eat. I had to rescue it. For art.' },
    motive: {
      classic: ['{V} called her portrait of him "a crime against canvas" in front of everyone.', '{V} refused to pay for a painting he commissioned and then hated.'],
      cozy: ['Needed something marvellous for her next still life painting.', 'Thinks it was too beautiful to be eaten and must be "saved".'],
    },
  },
  {
    id: 'journalist', role: 'the society columnist', portrait: 'portraits/journalist.webp',
    names: [['Letitia Sharpe', 'Miss Sharpe'], ['Kitty Pemberton', 'Kitty'], ['Nandini Ghosh', 'Nandini']],
    voices: ['Danielle', 'Joanna', 'Ruth', 'Kajal'],
    traits: [['gossipy', 'speaks in headlines', 'name drops constantly'], ['quick', 'answers with questions', 'scribbles notes']],
    quip: { classic: ['writes everything down. Everything.', 'ink, gossip, and leverage'], cozy: ['nose for news, and cake', 'needs a front page, fast'] },
    confess: { classic: 'Every great column needs an ending. {V} was about to ruin mine, so I wrote one.', cozy: 'Nothing ever happens round here. I simply needed a front page. A really good one.' },
    motive: {
      classic: ['{V} threatened to sue over her column. She has a much juicier one ready.', '{V} knew the real name behind her pen name.'],
      cozy: ['A scandal would make a cracking front page for the parish newsletter.', 'Has not had a good story since the vicar\'s bicycle went missing.'],
    },
  },
  {
    id: 'magician', role: 'the stage magician', portrait: 'portraits/magician.webp',
    names: [['The Great Fantoni', 'Fantoni'], ['Marvello the Magnificent', 'Marvello'], ['Hugo Mysterio', 'Mysterio']],
    voices: ['Matthew', 'Stephen', 'Gregory'],
    traits: [['theatrical', 'refers to himself in the third person', 'flourishes'], ['smooth', 'deflects with jokes', 'secretly insecure']],
    quip: { classic: ['now you see him', 'tricks, debts, and a cape'], cozy: ['promised a vanishing act', 'his rabbit was not invited'] },
    confess: { classic: '{V} gave away my secrets. A magician without secrets is just a man in a cape.', cozy: 'I promised everyone a vanishing act. I am a professional. I deliver.' },
    motive: {
      classic: ['{V} told the whole party how the sawing in half trick works.', '{V} was his biggest investor, and wanted the money back.'],
      cozy: ['Promised the guests a vanishing act. Perhaps he delivered.', 'His rabbit was not invited and he took it personally.'],
    },
  },
  {
    id: 'nephew', role: 'the hard-up nephew', portrait: 'portraits/nephew.webp',
    names: [['Freddie Bunting', 'Freddie'], ['Rohan Kapoor', 'Rohan'], ['Algernon Pike', 'Algy'], ['Teddy Marchbanks', 'Teddy']],
    voices: ['Matthew', 'Stephen', 'Brian'],
    traits: [['charming', 'sulky', 'borrows things'], ['jittery', 'talks fast', 'always hungry']],
    quip: { classic: ['charming, broke, and desperate', 'all smiles, no savings'], cozy: ['always hungry. Always.', 'manners pending, appetite huge'] },
    confess: { classic: 'Not one penny more, {V} said. Well. Now it is every penny.', cozy: 'I was hungry. I am always hungry. Nobody ever believes me.' },
    motive: {
      classic: ['Owes {V} a small fortune and was told "not one penny more".', '{V} cut him out of the will last Tuesday.'],
      cozy: ['Is always hungry. Always.', 'Was told he could have a slice "when you learn some manners".'],
    },
  },
];

/** Topics two people might be arguing about when seen together. */
export const BICKER_TOPICS: Record<Tone, string[]> = {
  classic: ['the correct way to butter toast', 'who cheated at bridge in 1927', 'whether the soup was poisoned or just French', 'cricket, at length', 'the host\'s terrible taste in wallpaper'],
  cozy: ['whose turn it was to walk the dog', 'the correct way to dunk a biscuit', 'whether a hot dog is a sandwich', 'cricket, at length', 'who ate the last samosa'],
};

/** Evidence that a room was empty at a given time. */
export const EMPTY_ROOM_SIGNS = [
  'the lamps were off and the cat was asleep on the only chair',
  'the cushions were still perfectly plumped and nobody had touched the biscuits',
  'the door was still wedged shut with yesterday\'s newspaper',
  'the dust on the floor shows not a single footprint',
];

export const CONFESSION_METHOD: Record<Tone, string[]> = {
  classic: [
    'At {T} I slipped into the {C} with the {I} from the {H}. {V} barely looked up.',
    'At {T} I was in the {C}, the {I} from the {H} in hand. All very quiet.',
  ],
  cozy: [
    'At {T} I tiptoed into the {C} with the {I} from the {H}. Easy as pie.',
    'At {T} I nipped into the {C} with the {I}. Nobody looked twice.',
  ],
};

export const CONFESSION_CLOSER: Record<Tone, string[]> = {
  classic: ['I regret nothing, except the soup.', 'Do spell my name correctly in the papers.', 'You were cleverer than you look. Not by much.'],
  cozy: ['Worth it. Absolutely worth it.', 'I regret nothing. Well, maybe a little.', 'Next year I am hiding it much better.'],
};

export const HEADLINES: Record<Tone, string[]> = {
  classic: ['{N} DINNER ENDS IN DISGRACE', 'SCANDAL AT {N}', '{N} MYSTERY SOLVED', 'CAUGHT RED-HANDED AT {N}'],
  cozy: ['GREAT {X} CAPER CRACKED', '{X} THIEF UNMASKED AT {N}', 'CAUGHT RED-HANDED: THE {X} AFFAIR'],
};

/** {R} = role without "the", capitalised; {RL} = role with "the"; {S} = culprit short name. */
export const HEADLINE_SUBS = [
  '{R} unmasked as culprit; {DETECTIVE} toasts a famous victory',
  '{S}, {RL}, confesses all as {DETECTIVE} cracks the case',
  '{R} caught red-handed; {DETECTIVE} takes a well-earned bow',
  'Sharp-eyed {DETECTIVE} exposes {S}, {RL}',
];

export const RETORTS: Record<Tone, string[]> = {
  classic: [
    'How dare you. Every word I said was true, and I resent the implication.',
    'Objection overruled, by me. I have told you nothing but the truth.',
    'I beg your pardon? Check your clues before you insult me.',
  ],
  cozy: [
    'Hey! I told the truth, the whole truth, and nothing but the truth!',
    'Rude! Everything I said was completely true.',
    'Objection? Pfft. I am as honest as a puppy.',
  ],
};
