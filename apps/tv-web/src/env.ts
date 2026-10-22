// Runtime flags read once from the URL.
const q = new URLSearchParams(location.search);

export const DEMO = q.has('demo') && q.get('demo') !== '0';
/** Jump straight to a demo scene: title, lobby, briefing, investigate, speaking, link, verdict, accuse, reveal, results */
export const SCENE = q.get('scene') ?? '';
/** Sub-step inside a scene, e.g. briefing step or reveal step. */
export const STEP = q.get('step') ?? '';
/** Freeze timed sequences (useful for screenshots). */
export const STILL = q.has('still');
export const MUTED = q.has('mute');
export const BASE = import.meta.env.BASE_URL;

const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export function reducedMotion(): boolean {
  if (q.get('motion') === 'reduced') return true;
  if (q.get('motion') === 'full') return false;
  return !!motionQuery?.matches;
}

export function asset(path: string): string {
  if (/^(https?:|data:|\/)/.test(path)) return path;
  return BASE + path.replace(/^\.?\//, '');
}
