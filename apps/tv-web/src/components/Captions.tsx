// Caption panels. Every spoken line is captioned: speaker name above, at most two 40 character lines.
import { fromEarlierPhase } from '../audio/director';
import { useTv } from '../net/store';
import type { Line } from '../net/types';
import { WordCaption } from './WordCaption';

export function CaptionPanel({ line, durationMs, live = true, speaker, className = '' }: { line: Line; durationMs: number; live?: boolean; speaker?: string; className?: string }) {
  return (
    <div className={`cap-panel ${className}`} role="status">
      <p className="cap-speaker">{speaker ?? line.speakerName}</p>
      {line.filler ? <p className="wordcap"><span className="cap-line">{line.text}</span></p> : <WordCaption line={line} durationMs={durationMs} live={live} />}
    </div>
  );
}

/** Global caption bar for narrator lines (and any line the current screen does not stage itself). */
export function Captions({ suppressSuspects }: { suppressSuspects: boolean }) {
  const now = useTv((s) => s.now);
  const phaseAt = useTv((s) => s.phaseAt);
  // a line queued in an earlier phase never draws over the new phase's screen
  if (!now || now.line.key.startsWith('briefing:') || (suppressSuspects && !now.line.narrator) || fromEarlierPhase(now.line, phaseAt)) return null;
  return <CaptionPanel key={now.line.key} line={now.line} durationMs={now.durationMs} className="captionbar" />;
}
