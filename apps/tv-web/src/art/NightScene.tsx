// Placeholder backdrop: a manor on the moor at night. Painted art (art/title-art.webp or a case scene) covers it when present.
import { useState } from 'react';
import { asset } from '../env';

export function ArtImage({ src, className = '' }: { src: string; className?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return <img className={className} src={asset(src)} alt="" draggable={false} onError={() => setOk(false)} />;
}

const WINDOWS: [number, number, number][] = [
  [612, 610, 0], [652, 610, 1], [612, 680, 2], [760, 560, 0], [800, 560, 3], [840, 560, 1], [760, 640, 2], [880, 640, 0],
  [1010, 520, 1], [1010, 600, 3], [1150, 600, 2], [1190, 600, 0], [1150, 670, 1], [1290, 650, 3], [1330, 650, 2],
];

export function NightScene({ className = '' }: { className?: string }) {
  return (
    <svg className={`nightscene ${className}`} viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <radialGradient id="ns-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff4d6" /><stop offset="0.25" stopColor="#f5dfa8" stopOpacity="0.55" /><stop offset="1" stopColor="#f5dfa8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ns-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0712" /><stop offset="0.6" stopColor="#24133a" /><stop offset="1" stopColor="#3a1d3f" />
        </linearGradient>
        <linearGradient id="ns-fog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8c6fa8" stopOpacity="0" /><stop offset="1" stopColor="#8c6fa8" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#ns-sky)" />
      <circle cx="1460" cy="250" r="260" fill="url(#ns-moon)" />
      <circle cx="1460" cy="250" r="66" fill="#fbecc4" />
      <circle cx="1440" cy="232" r="12" fill="#e8d3a0" opacity="0.6" /><circle cx="1482" cy="270" r="8" fill="#e8d3a0" opacity="0.5" />
      <g className="ns-stars" fill="#f6e6c0">
        {[[180, 120], [320, 210], [520, 90], [760, 160], [940, 70], [1120, 190], [1720, 120], [1820, 300], [260, 360], [1640, 420]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} style={{ ['--d' as string]: `${(i % 5) * 0.7}s` }} />
        ))}
      </g>
      {/* far hills */}
      <path d="M0 820 C300 760 520 790 760 770 C1000 750 1300 800 1560 770 C1720 755 1840 770 1920 760 V1080 H0Z" fill="#1c1029" />
      {/* the manor */}
      <g fill="#0e0815">
        <path d="M560 760 V600 L640 540 L720 600 V760Z" />
        <path d="M720 760 V540 L800 480 L880 540 V760Z" />
        <rect x="900" y="440" width="140" height="320" /><path d="M890 450 L970 360 L1050 450Z" />
        <rect x="955" y="300" width="30" height="70" />
        <path d="M1040 760 V560 L1240 560 L1240 760Z" /><path d="M1030 570 L1140 480 L1250 570Z" />
        <path d="M1240 760 V600 L1310 560 L1380 600 V760Z" />
        <rect x="1180" y="470" width="22" height="60" /><rect x="760" y="430" width="20" height="70" />
        <rect x="540" y="740" width="870" height="30" />
      </g>
      <g className="ns-windows">
        {WINDOWS.map(([x, y, d], i) => <rect key={i} x={x} y={y} width="22" height="34" rx="11" style={{ ['--d' as string]: `${d * 1.3 + i * 0.17}s` }} />)}
      </g>
      {/* near ground and trees */}
      <path d="M0 900 C260 850 480 880 700 860 C980 835 1280 880 1600 850 C1760 838 1860 850 1920 845 V1080 H0Z" fill="#090510" />
      <path d="M120 900 C130 760 150 700 180 640 C200 700 230 760 240 900Z M1700 880 C1710 720 1740 660 1770 600 C1800 660 1830 740 1840 880Z" fill="#090510" />
      <rect className="ns-fog" x="-400" y="700" width="2720" height="260" fill="url(#ns-fog)" />
    </svg>
  );
}
