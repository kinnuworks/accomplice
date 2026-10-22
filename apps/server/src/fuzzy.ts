// Fix suspect names that speech recognition mangles ("Hasp" -> "Hask", "more oh" -> "Moreau").
const COMMON = new Set(('the a an and or but if of to in on at by for with from was were is are am be been you your i me my we our he she they them his her their it its this that what who where when why how did do does not no yes '
  + 'there here then than so see saw seen room hall time night were said tell told about after before around near into out over under up down just only very really maybe '
  + 'ask asked asking have has had kitchen study library garden dining parlour pantry hallway sunroom conservatory doctor mister miss missus mrs mr colonel auntie uncle cousin lord lady').split(/\s+/));

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const skeleton = (w: string) => w.toLowerCase().replace(/ph/g, 'f').replace(/ck|q|c/g, 'k').replace(/z/g, 's').replace(/[aeiouyhw]/g, '').replace(/(.)\1+/g, '$1');

/** Replace near-miss words (and adjacent word pairs) with the closest canonical name token. */
export function correctNames(text: string, names: string[]): string {
  const tokens = Array.from(new Set(names.flatMap((n) => n.split(/[\s.]+/)).filter((t) => t.length >= 3 && !COMMON.has(t.toLowerCase()))));
  if (!tokens.length) return text;
  const best = (w: string, joined: boolean): string | null => {
    const lw = w.toLowerCase();
    if (lw.length < 3 || COMMON.has(lw)) return null;
    let pick: string | null = null; let score = Infinity;
    for (const t of tokens) {
      const lt = t.toLowerCase();
      if (lt === lw) return joined ? t : null; // already right
      const d = levenshtein(lw, lt);
      const sk = skeleton(lw) === skeleton(lt) && skeleton(lt).length >= 2;
      const ok = joined
        ? sk && d <= 2
        : Math.abs(lw.length - lt.length) <= 1 && ((d <= (lt.length >= 7 ? 2 : 1) && lw[0] === lt[0]) || (sk && d <= 2));
      if (ok && d < score) { score = d; pick = t; }
    }
    return pick;
  };
  const words = text.split(/(\s+)/);
  for (let i = 0; i < words.length; i += 2) {
    const m = /^([^\p{L}]*)([\p{L}']+)([^\p{L}]*)$/u.exec(words[i]);
    if (!m) continue;
    const single = best(m[2], false);
    if (single) { words[i] = m[1] + single + m[3]; continue; }
    if (i + 2 < words.length && !m[3]) {
      const n = /^([\p{L}']+)([^\p{L}]*)$/u.exec(words[i + 2]);
      const joined = n ? best(m[2] + n[1], true) : null;
      if (n && joined) { words[i] = m[1] + joined + n[2]; words.splice(i + 1, 2); }
    }
  }
  return words.join('');
}
