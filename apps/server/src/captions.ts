// Caption hygiene: written form for the screen, short frames that fit the TV safe area.
const MAX_LINE = 40;
const LINES_PER_FRAME = 2;

/** Sentence case, no stray quotes or SSML leftovers, single spaces. */
export function cleanCaption(text: string): string {
  let t = String(text ?? '')
    .replace(/<[^>]+>/g, ' ')                 // any markup
    .replace(/[“”"]/g, '')          // stray double quotes
    .replace(/^\s*['‘’]+|['‘’]+\s*$/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

/** Wrap into lines of at most 40 characters, then group 2 lines per caption frame. */
export function captionChunks(text: string): string[] {
  const words = cleanCaption(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= MAX_LINE) line += ' ' + w;
    else { lines.push(line); line = w; }
    // A sentence end near the end of a line is a good place to break the frame.
  }
  if (line) lines.push(line);
  const frames: string[] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_FRAME) frames.push(lines.slice(i, i + LINES_PER_FRAME).join('\n'));
  return frames;
}

/** Split narration into pieces of at most two sentences each. */
export function twoSentenceChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  // Do not split after abbreviations like "Mr." or "Dr.".
  const merged: string[] = [];
  for (const sn of sentences) {
    if (merged.length && /\b(Mr|Mrs|Ms|Dr|St)\.$/.test(merged[merged.length - 1])) merged[merged.length - 1] += ' ' + sn;
    else merged.push(sn);
  }
  const out: string[] = [];
  for (let i = 0; i < merged.length; i += 2) out.push(merged.slice(i, i + 2).join(' '));
  return out;
}
