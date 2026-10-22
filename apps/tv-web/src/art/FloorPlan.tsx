// Blueprint-style floor plan drawn from the case rooms. Rooms carry a small line illustration.
import type { Room } from '@accomplice/protocol';
import { memo, type ReactNode } from 'react';

export interface PlanToken { roomId: string; key: string; label: string; color: string; dim?: boolean }

interface Props {
  rooms: Room[];
  crimeRoom?: string;
  highlight?: string | null;
  tokens?: PlanToken[];
  className?: string;
  width?: number;
  height?: number;
}

const PAD = 0.35;

function iconFor(name: string): ReactNode {
  const n = name.toLowerCase();
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (/librar|book/.test(n)) return <g {...s}><path d="M4 20V5h3v15M8 20V7h3v13M12 20V4h3v16M16 20l2-14 3 .5-2 13.5" /><path d="M2 20h20" /></g>;
  if (/kitchen|pantry|scullery/.test(n)) return <g {...s}><path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" /><path d="M3 11h18M9 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4" /></g>;
  if (/ball|music|salon/.test(n)) return <g {...s}><path d="M12 3v3M6 9h12M7 9l1 4h8l1-4M8 13l-1 3M16 13l1 3M12 13v4" /><circle cx="12" cy="7" r="1.2" /></g>;
  if (/conservator|greenhouse|garden|terrace/.test(n)) return <g {...s}><path d="M12 21V11M12 11c-4 0-6-3-6-7 4 0 6 3 6 7zM12 14c3 0 5-2 5-5-3 0-5 2-5 5z" /><path d="M8 21h8" /></g>;
  if (/study|office|desk/.test(n)) return <g {...s}><path d="M3 20h18M5 20v-6h14v6M9 14V9l-3-3M6 6l3-2 2 3" /><path d="M8 9h3" /></g>;
  if (/hall|foyer|entrance|lobby|corridor/.test(n)) return <g {...s}><path d="M6 21V5a6 6 0 0 1 12 0v16M3 21h18" /><circle cx="15" cy="13" r=".8" /></g>;
  if (/dining|restaurant/.test(n)) return <g {...s}><circle cx="12" cy="12" r="6" /><path d="M3 5v5a2 2 0 0 0 2 2v8M5 5v4M21 5c-2 1-2 5 0 6v9" /></g>;
  if (/bed|sleep|suite|nursery/.test(n)) return <g {...s}><path d="M3 18V8M3 14h18v4M21 18v-6a2 2 0 0 0-2-2h-8v4" /><circle cx="7" cy="11" r="1.5" /></g>;
  if (/cellar|wine|vault/.test(n)) return <g {...s}><ellipse cx="12" cy="12" rx="7" ry="8" /><path d="M5 9h14M5 15h14M12 4v16" /></g>;
  if (/billiard|game|card/.test(n)) return <g {...s}><circle cx="9" cy="13" r="3" /><circle cx="15" cy="13" r="3" /><path d="M3 21L21 5" /></g>;
  if (/gallery|art|studio/.test(n)) return <g {...s}><rect x="4" y="5" width="16" height="12" /><path d="M4 15l5-5 4 4 3-3 4 4" /></g>;
  if (/observ|tower|attic/.test(n)) return <g {...s}><path d="M5 15l12-7 2 3-12 7zM9 16l-3 5M10 16l3 5" /></g>;
  if (/car|carriage|cabin|compartment|lounge|bar/.test(n)) return <g {...s}><rect x="3" y="6" width="18" height="11" rx="2" /><path d="M6 9h4v4H6zM14 9h4v4h-4zM6 20a1.5 1.5 0 1 0 0-.1M18 20a1.5 1.5 0 1 0 0-.1" /></g>;
  if (/chapel/.test(n)) return <g {...s}><path d="M12 2v6M9 5h6M5 21V12l7-4 7 4v9z" /></g>;
  return <g {...s}><rect x="5" y="5" width="14" height="14" rx="1" /><path d="M5 12h14" /></g>;
}

export const FloorPlan = memo(function FloorPlan({ rooms, crimeRoom, highlight, tokens = [], className = '', width = 1000, height = 640 }: Props) {
  if (!rooms.length) return null;
  const minX = Math.min(...rooms.map((r) => r.x)), minY = Math.min(...rooms.map((r) => r.y));
  const maxX = Math.max(...rooms.map((r) => r.x + r.w)), maxY = Math.max(...rooms.map((r) => r.y + r.h));
  const vw = maxX - minX + PAD * 2, vh = maxY - minY + PAD * 2;
  const unit = Math.min(width / vw, height / vh);
  const ox = (width - (maxX - minX) * unit) / 2 - minX * unit;
  const oy = (height - (maxY - minY) * unit) / 2 - minY * unit;
  const R = (r: Room) => ({ x: ox + r.x * unit, y: oy + r.y * unit, w: r.w * unit, h: r.h * unit });

  // doors where adjacent rooms share an edge
  const doors: ReactNode[] = [];
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const a of rooms) for (const bid of a.adjacent) {
    const b = byId.get(bid);
    const k = [a.id, bid].sort().join('|');
    if (!b || seen.has(k)) continue;
    seen.add(k);
    const A = R(a), B = R(b);
    const eps = 2;
    let d: [number, number, boolean] | null = null;
    if (Math.abs(A.x + A.w - B.x) < eps || Math.abs(B.x + B.w - A.x) < eps) {
      const x = Math.abs(A.x + A.w - B.x) < eps ? B.x : A.x;
      const top = Math.max(A.y, B.y), bot = Math.min(A.y + A.h, B.y + B.h);
      if (bot > top) d = [x, (top + bot) / 2, true];
    } else if (Math.abs(A.y + A.h - B.y) < eps || Math.abs(B.y + B.h - A.y) < eps) {
      const y = Math.abs(A.y + A.h - B.y) < eps ? B.y : A.y;
      const l = Math.max(A.x, B.x), r = Math.min(A.x + A.w, B.x + B.w);
      if (r > l) d = [(l + r) / 2, y, false];
    }
    if (d) {
      const [x, y, vert] = d;
      const half = Math.min(unit * 0.28, 26);
      doors.push(<line key={k} className="plan-door" x1={vert ? x : x - half} y1={vert ? y - half : y} x2={vert ? x : x + half} y2={vert ? y + half : y} />);
    } else {
      const ac = { x: A.x + A.w / 2, y: A.y + A.h / 2 }, bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
      doors.push(<line key={k} className="plan-passage" x1={ac.x} y1={ac.y} x2={bc.x} y2={bc.y} />);
    }
  }

  return (
    <svg className={`floorplan ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Floor plan: ${rooms.map((r) => r.name).join(', ')}`}>
      <defs>
        <pattern id="plan-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeOpacity="0.07" />
        </pattern>
        <pattern id="plan-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#e05a4f" strokeOpacity="0.35" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#plan-grid)" />
      {rooms.map((r, i) => {
        const b = R(r);
        const isCrime = r.id === crimeRoom;
        const icon = Math.min(b.w, b.h) * 0.34;
        return (
          <g key={r.id} className={`plan-room ${isCrime ? 'is-crime' : ''} ${highlight === r.id ? 'is-hl' : ''}`} style={{ ['--i' as string]: i }}>
            <rect x={b.x + 3} y={b.y + 3} width={b.w - 6} height={b.h - 6} rx="4" className="plan-room-bg" />
            {isCrime && <rect x={b.x + 3} y={b.y + 3} width={b.w - 6} height={b.h - 6} rx="4" fill="url(#plan-hatch)" />}
            <rect x={b.x + 3} y={b.y + 3} width={b.w - 6} height={b.h - 6} rx="4" className="plan-room-wall" pathLength={100} />
            <g className="plan-icon" transform={`translate(${b.x + b.w / 2 - icon / 2} ${b.y + b.h / 2 - icon * 0.85}) scale(${icon / 24})`}>{iconFor(r.name)}</g>
            <text x={b.x + b.w / 2} y={b.y + b.h - Math.max(16, b.h * 0.12)} className="plan-label" textAnchor="middle">{r.name}</text>
            {isCrime && <text x={b.x + 16} y={b.y + 38} className="plan-crime-mark">!</text>}
          </g>
        );
      })}
      <g className="plan-doors">{doors}</g>
      {tokens.length > 0 && (
        <g className="plan-tokens">
          {rooms.map((r) => {
            const here = tokens.filter((t) => t.roomId === r.id);
            const b = R(r);
            return here.map((t, i) => {
              const cols = Math.max(1, Math.floor((b.w - 20) / 52));
              const x = b.x + 30 + (i % cols) * 52;
              const y = b.y + 30 + Math.floor(i / cols) * 52;
              return (
                <g key={t.key} className={`plan-token ${t.dim ? 'is-dim' : ''}`} transform={`translate(${x} ${y})`}>
                  <circle r="22" fill={t.color} />
                  <text textAnchor="middle" dy="8" className="plan-token-label">{t.label}</text>
                </g>
              );
            });
          })}
        </g>
      )}
    </svg>
  );
});
