// Small seeded random number generator (mulberry32). Deterministic across platforms.
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: Rng, n: number) => Math.floor(r() * n);
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[int(r, xs.length)];

export function shuffle<T>(r: Rng, xs: readonly T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function weighted<T>(r: Rng, xs: readonly T[], w: (x: T) => number): T {
  let total = 0;
  for (const x of xs) total += Math.max(0, w(x));
  if (total <= 0) return pick(r, xs);
  let roll = r() * total;
  for (const x of xs) {
    roll -= Math.max(0, w(x));
    if (roll <= 0) return x;
  }
  return xs[xs.length - 1];
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
