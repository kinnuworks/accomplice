// The house character (a butler or housekeeper) who answers the free practice question in the tutorial.
// Not a suspect: the prompt holds only public setting details, and any reply that places anyone anywhere
// at any time is swapped for a stock line, so practice can never leak or invent evidence.
import type { PublicCase } from '@accomplice/protocol';
import { getModel, type TextModel } from './models.js';
import { cleanSentence, SentenceSplitter } from './suspects.js';
import { extractClaims, confesses } from './claims.js';
import { log } from './log.js';

export interface House { id: 'house'; name: string; role: string; voiceId: string; traits: string[]; portrait?: string }

export function houseFor(pub: PublicCase): House {
  return pub.tone === 'cozy'
    ? { id: 'house', name: 'Mrs Biddle', role: 'the housekeeper', voiceId: process.env.HOUSE_VOICE ?? 'Amy', traits: ['warm', 'proper', 'chatty'], portrait: 'portraits/house-cozy.webp' }
    : { id: 'house', name: 'Hobbs', role: 'the butler', voiceId: process.env.HOUSE_VOICE ?? 'Arthur', traits: ['dry', 'proper', 'unflappable'], portrait: 'portraits/house-classic.webp' };
}

const STOCK = [
  'Very good. That is exactly how it works: hold the button, ask, and someone answers. Do save the hard questions for the suspects.',
  'An excellent question, and well asked. The suspects will be less polite than I am, I assure you.',
  'I only keep the house, I am afraid. But you hold that button beautifully.',
];

export async function houseReply(h: House, pub: PublicCase, question: string, model: TextModel = getModel()): Promise<string[]> {
  const stock = () => [STOCK[Math.floor(Math.random() * STOCK.length)]];
  if (model.kind === 'mock') return stock();
  const system = [
    `You are ${h.name}, ${h.role} at ${pub.place}, in "${pub.title}", ${pub.dateLine}. Personality: ${h.traits.join(', ')}.`,
    'This is a practice question in a party game, before the investigation starts. You are not a suspect and know nothing about the crime.',
    'Reply in 1 or 2 short spoken sentences, under 30 words, warm and witty, in period. No stage directions or dashes.',
    'Never say where anyone was or at what time, never accuse anyone, never mention clues. If asked about the crime, say the suspects are the ones to ask.',
  ].join('\n');
  try {
    const raw = await model.complete({ system, messages: [{ role: 'user', content: question }], maxTokens: 100 });
    const sp = new SentenceSplitter();
    const sentences = [...sp.push(raw), ...sp.flush()].map(cleanSentence).filter(Boolean).slice(0, 2);
    const unsafe = sentences.some((x) => confesses(x) || extractClaims(x, { pub, speakerId: 'house' }).length > 0);
    return sentences.length && !unsafe ? sentences : stock();
  } catch (e) {
    log.warn('house reply failed', (e as Error)?.message);
    return stock();
  }
}
