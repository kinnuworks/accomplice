// Forgiving lookups so people (and voice assistants) can say "the cook" or "Agatha" instead of an id.

const STOP = new Set(['the', 'a', 'an', 'mr', 'mrs', 'ms', 'miss', 'dr', 'lord', 'lady', 'sir', 'with', 'of', 'card', 'clue']);

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/'s$/, '').replace(/'/g, ''))
    .filter((w) => w && !STOP.has(w));
}

export interface Matchable { id: string; name?: string; title?: string; role?: string }

/** Best match for a spoken or typed reference, or null when nothing fits. */
export function bestMatch<T extends Matchable>(query: string | undefined, list: T[]): T | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  const exact = list.find((x) => x.id.toLowerCase() === q);
  if (exact) return exact;
  const qw = words(query);
  if (qw.length === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of list) {
    const label = [item.name, item.title, item.role, item.id].filter(Boolean).join(' ');
    const lw = new Set(words(label));
    let score = 0;
    for (const w of qw) {
      if (lw.has(w)) score += 2;
      else if ([...lw].some((l) => l.length > 3 && (l.startsWith(w) || w.startsWith(l)))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore > 0 ? best : null;
}
