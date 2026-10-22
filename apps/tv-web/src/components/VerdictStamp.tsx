import { useEffect } from 'react';
import type { TheoryVerdict } from '@accomplice/protocol';
import { audio } from '../audio/audio';

const WORD: Record<TheoryVerdict, string> = { follows: 'Follows', possible: 'Possible', contradicted: 'Contradicted' };
const SUB: Record<TheoryVerdict, string> = {
  follows: 'The clues prove it',
  possible: 'Not ruled out. Not proven.',
  contradicted: 'The clues say no',
};

export function VerdictStamp({ verdict, small = false }: { verdict: TheoryVerdict; small?: boolean }) {
  useEffect(() => { if (!small) setTimeout(() => audio.play('gavel'), 380); }, [verdict, small]);
  return (
    <div className={`stamp stamp-${verdict} ${small ? 'stamp-sm' : ''}`} role="img" aria-label={`${WORD[verdict]}. ${SUB[verdict]}`}>
      <svg className="stamp-icon" viewBox="0 0 48 48" aria-hidden="true">
        {verdict === 'follows' && <path d="M10 25l9 9 19-20" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
        {verdict === 'possible' && <path d="M8 26c5-8 10-8 16 0s11 8 16 0" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />}
        {verdict === 'contradicted' && <path d="M12 12l24 24M36 12L12 36" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />}
      </svg>
      <span className="stamp-word">{WORD[verdict]}</span>
      <span className="stamp-sub">{SUB[verdict]}</span>
    </div>
  );
}
