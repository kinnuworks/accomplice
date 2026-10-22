// Rubber stamp for Prove it: icon plus word, never colour alone. Drops from 2.5x, lands in 160 ms, splats ink.
import { useEffect } from 'react';
import type { TheoryVerdict } from '@accomplice/protocol';
import { audio } from '../audio/audio';

export const VERDICT_WORD: Record<TheoryVerdict, string> = { follows: 'Proven', possible: 'Possible', contradicted: 'Ruled out' };
const SUB: Record<TheoryVerdict, string> = {
  follows: 'The clues prove it',
  possible: 'Not ruled out, not proven',
  contradicted: 'The clues say no',
};
/** When the stamp lands, in ms after mount (used to sync the shake and thump). */
export const STAMP_LAND_MS = 420;

export function StampIcon({ verdict }: { verdict: TheoryVerdict }) {
  return (
    <svg className="stamp-icon" viewBox="0 0 48 48" aria-hidden="true">
      {verdict === 'follows' && <path d="M9 25l10 10 20-22" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
      {verdict === 'possible' && <><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="5" /><path d="M24 13v13" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><circle cx="24" cy="33" r="3.2" fill="currentColor" /></>}
      {verdict === 'contradicted' && <path d="M12 12l24 24M36 12L12 36" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />}
    </svg>
  );
}

export function VerdictStamp({ verdict }: { verdict: TheoryVerdict }) {
  useEffect(() => { const t = setTimeout(() => audio.play('gavel'), STAMP_LAND_MS - 40); return () => clearTimeout(t); }, [verdict]);
  return (
    <div className={`stamp-wrap stamp-${verdict}`}>
      <span className="ink-splat" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <div className="stamp" role="img" aria-label={`${VERDICT_WORD[verdict]}. ${SUB[verdict]}`}>
        <StampIcon verdict={verdict} />
        <span className="stamp-word">{VERDICT_WORD[verdict]}</span>
      </div>
      <p className="stamp-sub">{SUB[verdict]}</p>
    </div>
  );
}
