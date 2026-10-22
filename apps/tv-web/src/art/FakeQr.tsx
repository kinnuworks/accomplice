// Demo-only stand-in for the join QR (the real one comes from the server at /api/qr).
export function FakeQr({ seed }: { seed: string }) {
  const n = 29;
  let h = 7;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const cells: string[] = [];
  const finder = (x: number, y: number) => x < 8 && y < 8 || x > n - 9 && y < 8 || x < 8 && y > n - 9;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rnd() > 0.52) cells.push(`M${x} ${y}h1v1h-1z`);
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}><rect x={x} y={y} width="7" height="7" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fbf6ea" /><rect x={x + 2} y={y + 2} width="3" height="3" /></g>
  );
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-label="Join code picture (demo)">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fbf6ea" />
      <g fill="#1a1020"><path d={cells.join('')} />{eye(0, 0)}{eye(n - 7, 0)}{eye(0, n - 7)}</g>
    </svg>
  );
}
