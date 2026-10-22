// A small exact reasoner over the case model, in plain TypeScript.
// It answers "which (culprit, means) pairs are still possible given these facts?" by enumerating
// every legal walk through the floor plan. The generator uses it to build cases (it must be
// synchronous), and verifyCase cross-checks its answers against Z3, an independent solver.
//
// The model (identical to the Z3 encoding in verify.ts):
//  - pos[s][t]: each suspect is in one room per slot, and moves only to an adjacent room (or stays).
//  - The culprit is in the crime room at the crime slot, holding the means.
//  - Every item starts the evening in its home room. Items other than the means never move.
//  - The means moves only while the culprit holds it. Picking it up happens in the room where it lies.
//    When put down, it stays where it was last held.
//  - Facts: at, notAt, saw (both present), had (that suspect held that item then), itemIn.
import type { Case, Fact } from '@accomplice/protocol';

export interface World {
  R: number;              // rooms
  T: number;              // slots
  n: number;              // suspects
  adj: number[][];        // neighbours (excluding self)
  homes: number[];        // item home rooms
  crimeRoom: number;
  crimeSlot: number;
  paths: Int8Array[];     // all legal walks
}

export type IFact =
  | { k: 'at'; s: number; room: number; slot: number }
  | { k: 'notAt'; s: number; room: number; slot: number }
  | { k: 'had'; s: number; item: number; slot: number }
  | { k: 'itemIn'; item: number; room: number; slot: number }
  | { k: 'saw'; a: number; b: number; room: number; slot: number };

const pathCache = new Map<string, Int8Array[]>();

export function allWalks(adj: number[][], T: number): Int8Array[] {
  const key = JSON.stringify(adj) + T;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const out: Int8Array[] = [];
  const cur = new Int8Array(T);
  const rec = (t: number) => {
    if (t === T) { out.push(cur.slice()); return; }
    const prev = cur[t - 1];
    for (const r of [prev, ...adj[prev]]) { cur[t] = r; rec(t + 1); }
  };
  for (let r = 0; r < adj.length; r++) { cur[0] = r; rec(1); }
  pathCache.set(key, out);
  return out;
}

export function makeWorld(R: number, adj: number[][], T: number, n: number, homes: number[], crimeRoom: number, crimeSlot: number): World {
  return { R, T, n, adj, homes, crimeRoom, crimeSlot, paths: allWalks(adj, T) };
}

export function worldOf(c: Case): { w: World; sIdx: Map<string, number>; rIdx: Map<string, number>; iIdx: Map<string, number> } {
  const rIdx = new Map(c.rooms.map((r, i) => [r.id, i]));
  const sIdx = new Map(c.suspects.map((s, i) => [s.id, i]));
  const iIdx = new Map(c.items.map((it, i) => [it.id, i]));
  const adj = c.rooms.map((r) => r.adjacent.map((a) => rIdx.get(a)!));
  const w = makeWorld(c.rooms.length, adj, c.slots.length, c.suspects.length, c.items.map((it) => rIdx.get(it.homeRoom)!), rIdx.get(c.crime.room)!, c.crime.slot);
  return { w, sIdx, rIdx, iIdx };
}

export function toIFact(f: Fact, m: { sIdx: Map<string, number>; rIdx: Map<string, number>; iIdx: Map<string, number> }): IFact {
  switch (f.k) {
    case 'at': return { k: 'at', s: m.sIdx.get(f.s)!, room: m.rIdx.get(f.room)!, slot: f.slot };
    case 'notAt': return { k: 'notAt', s: m.sIdx.get(f.s)!, room: m.rIdx.get(f.room)!, slot: f.slot };
    case 'had': return { k: 'had', s: m.sIdx.get(f.s)!, item: m.iIdx.get(f.item)!, slot: f.slot };
    case 'itemIn': return { k: 'itemIn', item: m.iIdx.get(f.item)!, room: m.rIdx.get(f.room)!, slot: f.slot };
    case 'saw': return { k: 'saw', a: m.sIdx.get(f.a)!, b: m.sIdx.get(f.b)!, room: m.rIdx.get(f.room)!, slot: f.slot };
  }
}

export function factKey(f: IFact): string {
  switch (f.k) {
    case 'saw': { const [a, b] = f.a < f.b ? [f.a, f.b] : [f.b, f.a]; return `saw:${a}:${b}:${f.room}:${f.slot}`; }
    case 'had': return `had:${f.s}:${f.item}:${f.slot}`;
    case 'itemIn': return `itemIn:${f.item}:${f.room}:${f.slot}`;
    default: return `${f.k}:${f.s}:${f.room}:${f.slot}`;
  }
}

interface Compiled {
  ok: boolean;
  req: Int8Array[];     // [s][t] required room or -1
  forb: Int32Array[];   // [s][t] bitmask of forbidden rooms
  itemReq: Int8Array[]; // [i][t]
  had: { s: number; item: number; slot: number }[];
}

function compile(w: World, facts: IFact[]): Compiled {
  const req = Array.from({ length: w.n }, () => new Int8Array(w.T).fill(-1));
  const forb = Array.from({ length: w.n }, () => new Int32Array(w.T));
  const itemReq = Array.from({ length: w.homes.length }, () => new Int8Array(w.T).fill(-1));
  const had: Compiled['had'] = [];
  let ok = true;
  const setAt = (s: number, room: number, t: number) => {
    if (req[s][t] !== -1 && req[s][t] !== room) ok = false;
    req[s][t] = room;
  };
  for (const f of facts) {
    switch (f.k) {
      case 'at': setAt(f.s, f.room, f.slot); break;
      case 'saw': setAt(f.a, f.room, f.slot); setAt(f.b, f.room, f.slot); break;
      case 'notAt': forb[f.s][f.slot] |= 1 << f.room; break;
      case 'itemIn':
        if (itemReq[f.item][f.slot] !== -1 && itemReq[f.item][f.slot] !== f.room) ok = false;
        itemReq[f.item][f.slot] = f.room; break;
      case 'had': had.push(f); break;
    }
  }
  return { ok, req, forb, itemReq, had };
}

function pathOk(p: Int8Array, req: Int8Array, forb: Int32Array): boolean {
  for (let t = 0; t < p.length; t++) {
    if (req[t] !== -1 && p[t] !== req[t]) return false;
    if (forb[t] & (1 << p[t])) return false;
  }
  return true;
}

/** Can the means `m` be moved along culprit path `p` consistent with item facts? Returns the item track or null. */
function itemTrack(w: World, p: Int8Array, m: number, ireq: Int8Array, mustHold: boolean[]): { held: boolean[]; loc: number[] } | null {
  // DP over (held, loc). Keep a parent pointer for one witness.
  const T = w.T;
  type St = { held: boolean; loc: number; prev: St | null };
  let layer: St[] = [];
  const home = w.homes[m];
  const okLoc = (t: number, loc: number) => ireq[t] === -1 || ireq[t] === loc;
  if (!mustHold[0] && okLoc(0, home)) layer.push({ held: false, loc: home, prev: null });
  if (p[0] === home && okLoc(0, home)) layer.push({ held: true, loc: home, prev: null });
  for (let t = 1; t < T && layer.length; t++) {
    const next: St[] = [];
    const seen = new Set<number>();
    const add = (s: St) => { const k = (s.held ? 1000 : 0) + s.loc; if (!seen.has(k) && okLoc(t, s.loc)) { seen.add(k); next.push(s); } };
    for (const st of layer) {
      if (!mustHold[t]) add({ held: false, loc: st.loc, prev: st });
      if (st.held) add({ held: true, loc: p[t], prev: st });
      else if (p[t] === st.loc) add({ held: true, loc: st.loc, prev: st });
    }
    layer = next;
  }
  if (!layer.length) return null;
  const held: boolean[] = [], loc: number[] = [];
  for (let s: St | null = layer[0]; s; s = s.prev) { held.unshift(s.held); loc.unshift(s.loc); }
  return { held, loc };
}

export interface Witness { culprit: number; means: number; path: Int8Array; held: boolean[]; loc: number[] }

function pairWitness(w: World, cf: Compiled, k: number, m: number, start = 0): Witness | null {
  for (const h of cf.had) if (h.s !== k || h.item !== m) return null;
  for (let i = 0; i < w.homes.length; i++) {
    if (i === m) continue;
    for (let t = 0; t < w.T; t++) if (cf.itemReq[i][t] !== -1 && cf.itemReq[i][t] !== w.homes[i]) return null;
  }
  const mustHold = Array.from({ length: w.T }, (_, t) => t === w.crimeSlot || cf.had.some((h) => h.slot === t));
  const req = cf.req[k], forb = cf.forb[k];
  if (req[w.crimeSlot] !== -1 && req[w.crimeSlot] !== w.crimeRoom) return null;
  if (forb[w.crimeSlot] & (1 << w.crimeRoom)) return null;
  const P = w.paths, N = P.length;
  for (let j = 0; j < N; j++) {
    const p = P[(j + start) % N];
    if (p[w.crimeSlot] !== w.crimeRoom) continue;
    if (!pathOk(p, req, forb)) continue;
    const tr = itemTrack(w, p, m, cf.itemReq[m], mustHold);
    if (tr) return { culprit: k, means: m, path: p, ...tr };
  }
  return null;
}

export interface Analysis {
  consistent: boolean;
  pairs: [number, number][];      // possible (culprit, means)
  culprits: number[];
  means: number[];
}

export function analyse(w: World, facts: IFact[]): Analysis {
  const cf = compile(w, facts);
  const empty: Analysis = { consistent: false, pairs: [], culprits: [], means: [] };
  if (!cf.ok) return empty;
  // Every suspect needs at least one legal walk.
  for (let s = 0; s < w.n; s++) if (!w.paths.some((p) => pathOk(p, cf.req[s], cf.forb[s]))) return empty;
  const pairs: [number, number][] = [];
  for (let k = 0; k < w.n; k++) for (let m = 0; m < w.homes.length; m++) if (pairWitness(w, cf, k, m)) pairs.push([k, m]);
  if (!pairs.length) return empty;
  return {
    consistent: true,
    pairs,
    culprits: [...new Set(pairs.map((p) => p[0]))],
    means: [...new Set(pairs.map((p) => p[1]))],
  };
}

/** A concrete alternative explanation different from (culprit, means), or null if none exists. */
export function alternative(w: World, facts: IFact[], culprit: number, means: number, rand: () => number): Witness | null {
  const cf = compile(w, facts);
  if (!cf.ok) return null;
  const order: [number, number][] = [];
  for (let k = 0; k < w.n; k++) for (let m = 0; m < w.homes.length; m++) if (k !== culprit || m !== means) order.push([k, m]);
  // Prefer wrong culprits over wrong means, randomised within each group.
  order.sort((a, b) => ((a[0] === culprit ? 1 : 0) - (b[0] === culprit ? 1 : 0)) || rand() - 0.5);
  for (const [k, m] of order) {
    const wit = pairWitness(w, cf, k, m, Math.floor(rand() * w.paths.length));
    if (wit) return wit;
  }
  return null;
}

export function isUnique(w: World, facts: IFact[], culprit: number, means: number): boolean {
  const a = analyse(w, facts);
  return a.consistent && a.pairs.length === 1 && a.pairs[0][0] === culprit && a.pairs[0][1] === means;
}

/** True when a fact holds in the true story. */
export function factTrue(f: IFact, pos: number[][], itemLoc: number[][], holder: (number | null)[], means: number): boolean {
  switch (f.k) {
    case 'at': return pos[f.s][f.slot] === f.room;
    case 'notAt': return pos[f.s][f.slot] !== f.room;
    case 'saw': return pos[f.a][f.slot] === f.room && pos[f.b][f.slot] === f.room && f.a !== f.b;
    case 'itemIn': return itemLoc[f.item][f.slot] === f.room;
    case 'had': return f.item === means && holder[f.slot] === f.s;
  }
}

export function dist(adj: number[][]): number[][] {
  const R = adj.length;
  return Array.from({ length: R }, (_, a) => {
    const d = new Array(R).fill(Infinity);
    d[a] = 0;
    const q = [a];
    while (q.length) { const x = q.shift()!; for (const y of adj[x]) if (d[y] === Infinity) { d[y] = d[x] + 1; q.push(y); } }
    return d;
  });
}
