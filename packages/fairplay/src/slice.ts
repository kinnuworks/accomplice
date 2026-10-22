// What each suspect knows, what they must lie about, and a checker for what they actually said.
import type { Case, Claim, ClaimCheck, PublicCase, SuspectSlice } from '@accomplice/protocol';
import { namesOf } from './text.js';

function itemRoomAt(c: Case, itemId: string, slot: number): string | null {
  // Where an item is in the true story, or null while someone is carrying it.
  const it = c.items.find((x) => x.id === itemId)!;
  if (itemId !== c.crime.item) return it.homeRoom;
  const holder = c.truth.holder[slot];
  if (holder) return null;
  const firstHeld = Object.keys(c.truth.holder).map(Number).filter((t) => c.truth.holder[t]).sort((a, b) => a - b)[0];
  return firstHeld !== undefined && slot > firstHeld ? c.crime.room : it.homeRoom;
}

export function sliceFor(c: Case, suspectId: string): SuspectSlice {
  const me = c.suspects.find((s) => s.id === suspectId);
  if (!me) throw new Error(`Unknown suspect: ${suspectId}`);
  const N = namesOf(c);
  const isCulprit = c.truth.culprit === suspectId;
  const myLies = c.lies.filter((l) => l.s === suspectId);
  const knows: string[] = [];
  const mustLie: string[] = [];
  const mayNotReveal: string[] = [];
  const victimLine = `${c.victim.name} ${c.crime.what} in the ${N.room(c.crime.room)} at ${N.slot(c.crime.slot)}.`;
  knows.push(`Everyone knows this: ${victimLine}`);

  for (const slot of c.slots) {
    const t = slot.id;
    const lie = myLies.find((l) => l.slot === t);
    if (lie) continue;
    const room = c.truth.position[suspectId][t];
    knows.push(`At ${slot.label} you were in the ${N.room(room)}.`);
    const others = c.suspects.filter((s) => s.id !== suspectId && c.truth.position[s.id][t] === room).map((s) => s.name);
    knows.push(others.length
      ? `At ${slot.label} you saw ${joinNames(others)} in the ${N.room(room)} with you.`
      : `At ${slot.label} nobody else was in the ${N.room(room)}.`);
    for (const it of c.items) {
      const where = itemRoomAt(c, it.id, t);
      if (where === room) knows.push(`At ${slot.label} the ${it.name} was in the ${N.room(room)}.`);
    }
  }
  for (const it of c.items) knows.push(`The ${it.name} is normally kept in the ${N.room(it.homeRoom)}.`);

  for (const lie of myLies) {
    const T = N.slot(lie.slot), claimed = N.room(lie.claimedRoom), real = N.room(lie.trueRoom);
    if (lie.reason === 'guilt') {
      mustLie.push(`If anyone asks where you were at ${T}, say you were in the ${claimed}. Stick to it calmly. You were really in the ${real}, and nobody must ever know.`);
    } else {
      const doing = lie.detail ? `, ${lie.detail}` : '';
      mustLie.push(`If anyone asks where you were at ${T}, say you were in the ${claimed}. Truthfully you were in the ${real}${doing}, and you are mortified. If someone shows you proof, you may admit it with great embarrassment.`);
    }
  }

  if (isCulprit) {
    const item = c.items.find((x) => x.id === c.crime.item)!;
    mayNotReveal.push(
      'Never confess. Never hint that you did it.',
      `Never say you were in the ${N.room(c.crime.room)} at ${N.slot(c.crime.slot)}.`,
      `Never mention touching, carrying, or moving the ${item.name}.`,
    );
  } else {
    mayNotReveal.push(
      'You do not know who did it. Never name anyone as the culprit as if it were fact; you may share honest suspicions.',
      'Never confess to the crime. You did not do it.',
    );
  }
  mayNotReveal.push('Never invent where other people were. Only mention people you actually saw.');

  return {
    suspect: me,
    knows,
    mustLie,
    mayNotReveal,
    otherSuspects: c.suspects.filter((s) => s.id !== suspectId).map((s) => ({ id: s.id, name: s.name, role: s.role })),
    setting: { title: c.title, place: c.place, dateLine: c.dateLine, victim: victimLine },
  };
}

function joinNames(xs: string[]) {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * Check claims extracted from a suspect's reply. Flags anything false that is not one of this
 * suspect's own permitted lies, anything that gives away the culprit, and claims about other
 * people this suspect could not have seen.
 */
export function checkReply(c: Case, suspectId: string, claims: Claim[]): ClaimCheck {
  const N = namesOf(c);
  const violations: string[] = [];
  const myLies = c.lies.filter((l) => l.s === suspectId);
  for (const cl of claims) {
    if (cl.kind !== 'location') continue;
    const truthRow = c.truth.position[cl.s];
    if (!truthRow || !c.rooms.some((r) => r.id === cl.room) || truthRow[cl.slot] === undefined) {
      violations.push(`Unknown person, room, or time in claim (${cl.s}, ${cl.room}, ${cl.slot}).`);
      continue;
    }
    const who = N.suspect(cl.s), where = N.room(cl.room), when = N.slot(cl.slot);
    if (cl.s === c.truth.culprit && cl.room === c.crime.room && cl.slot === c.crime.slot) {
      violations.push(`Gives away the culprit: places ${who} in the ${where} at ${when}.`);
      continue;
    }
    const truth = truthRow[cl.slot];
    if (cl.room !== truth) {
      const allowed = cl.s === suspectId && myLies.some((l) => l.slot === cl.slot && l.claimedRoom === cl.room);
      if (!allowed) violations.push(`Says ${who} was in the ${where} at ${when}, which is not true and not an allowed lie.`);
      continue;
    }
    if (cl.s !== suspectId) {
      const mine = c.truth.position[suspectId][cl.slot];
      const lyingThen = myLies.some((l) => l.slot === cl.slot);
      if (mine !== truth) violations.push(`Says where ${who} was at ${when}, but could not have seen it.`);
      else if (lyingThen) violations.push(`Mentions seeing ${who} at ${when}, which gives away where the speaker really was.`);
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Everything safe to show on the TV and phones: no truth, no lies, no culprit, no means, no clues. */
export function publicView(c: Case): PublicCase {
  return {
    id: c.id,
    tone: c.tone,
    title: c.title,
    place: c.place,
    dateLine: c.dateLine,
    intro: c.intro,
    scene: c.scene,
    briefing: c.briefing ? [...c.briefing] : undefined,
    victim: { ...c.victim },
    crime: { room: c.crime.room, slot: c.crime.slot, what: c.crime.what },
    rooms: c.rooms.map((r) => ({ ...r, adjacent: [...r.adjacent] })),
    slots: c.slots.map((s) => ({ ...s })),
    suspects: c.suspects.map(({ alibi: _alibi, ...rest }) => ({ ...rest, traits: [...rest.traits] })),
    items: c.items.map((i) => ({ ...i })),
  };
}
