// The reveal's newspaper front page: data for the TV, plus a shareable 1080x1350 PNG rendered from an SVG
// template with resvg (no browser, no canvas). Fonts come from assets/fonts if present, else system serif fonts.
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Case, Newspaper } from '@accomplice/protocol';
import { REPO_ROOT } from './config.js';
import { escapeXml } from './tts.js';
import { log } from './log.js';

/** The headline credits the best detective, never the accomplice; if the accomplice won, the paper says so. */
export function creditDetective(players: Newspaper['players'], accompliceId: string | null, firstNamed: Map<string, number>): { detective?: string; accompliceWon: boolean } {
  const detectives = players.filter((p) => p.id !== accompliceId);
  const acc = players.find((p) => p.id === accompliceId);
  const top = Math.max(-1, ...detectives.map((p) => p.score));
  const accompliceWon = !!acc && acc.score > top;
  const best = detectives.filter((p) => p.score === top)
    .sort((a, b) => (firstNamed.get(a.id) ?? Infinity) - (firstNamed.get(b.id) ?? Infinity))[0];
  return { detective: best?.name, accompliceWon };
}

export function buildNewspaper(c: Case, opts: { players: Newspaper['players']; detective?: string; accompliceWon?: boolean }): Newspaper {
  const culprit = c.suspects.find((s) => s.id === c.truth.culprit)!;
  const item = c.items.find((i) => i.id === c.crime.item);
  const detective = opts.detective ?? 'the guests';
  const title = c.headline?.title ?? `${culprit.name.toUpperCase()} UNMASKED`;
  const headline = c.headline as (Case['headline'] & { accompliceSub?: string }) | undefined;
  const sub = opts.accompliceWon
    ? (headline?.accompliceSub ?? "The culprit's helper slips away with the silverware")
    : (headline?.sub ?? `${detective} cracks the case at ${c.place}; ${item ? `the ${item.name} was the key` : 'justice is served'}`).replace(/\{DETECTIVE\}/g, detective);
  return {
    paperName: c.paperName ?? (c.tone === 'cozy' ? 'The Village Crier' : 'The Evening Courier'),
    title, sub, date: c.dateLine, culpritPortrait: culprit.portrait, players: opts.players,
  };
}

function wrap(text: string, max: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(/\s+/)) {
    if (!line) line = w; else if ((line + ' ' + w).length <= max) line += ' ' + w; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

async function portraitDataUri(key?: string): Promise<string | null> {
  if (!key) return null;
  for (const p of [path.join(REPO_ROOT, 'assets/art', key), path.join(REPO_ROOT, 'assets', key)]) {
    if (existsSync(p)) {
      const ext = path.extname(p).slice(1).toLowerCase();
      let buf: Buffer = await readFile(p);
      let mime = ext === 'jpg' ? 'jpeg' : ext;
      if (ext === 'webp') {
        // resvg cannot decode WebP; convert to a black and white PNG for newsprint.
        try { const { default: sharp } = await import('sharp'); buf = await sharp(buf).grayscale().resize(480, 520, { fit: 'cover' }).png().toBuffer(); mime = 'png'; } catch { return null; }
      }
      return `data:image/${mime};base64,${buf.toString('base64')}`;
    }
  }
  return null;
}

export function frontPageSvg(n: Newspaper, portrait: string | null): string {
  const W = 1080; const H = 1350;
  const titleLines = wrap(n.title, 16).slice(0, 3);
  const longest = Math.max(...titleLines.map((l) => l.length), 1);
  const titleSize = Math.min(96, Math.floor(940 / (longest * 0.66)));
  const subLines = wrap(n.sub, 46).slice(0, 3);
  const ranked = [...n.players].sort((a, b) => b.score - a.score).slice(0, 6);
  const ink = '#1d1a16'; const paper = '#f3ead8';
  let y = 330;
  const title = titleLines.map((l) => { const t = `<text x="${W / 2}" y="${y}" text-anchor="middle" font-size="${titleSize}" font-weight="700" fill="${ink}" font-family="Georgia, 'Times New Roman', serif">${escapeXml(l)}</text>`; y += titleSize + 8; return t; }).join('');
  y += 10;
  const sub = subLines.map((l) => { const t = `<text x="${W / 2}" y="${y}" text-anchor="middle" font-size="40" font-style="italic" fill="${ink}" font-family="Georgia, 'Times New Roman', serif">${escapeXml(l)}</text>`; y += 50; return t; }).join('');
  const imgY = y + 30; const imgH = 520;
  const img = portrait
    ? `<image href="${portrait}" x="90" y="${imgY}" width="480" height="${imgH}" preserveAspectRatio="xMidYMid slice" style="filter:grayscale(1)"/><rect x="90" y="${imgY}" width="480" height="${imgH}" fill="none" stroke="${ink}" stroke-width="4"/>`
    : `<rect x="90" y="${imgY}" width="480" height="${imgH}" fill="#d9ceb6" stroke="${ink}" stroke-width="4"/>`;
  const col = ranked.map((p, i) => `<text x="620" y="${imgY + 70 + i * 70}" font-size="36" fill="${ink}" font-family="Georgia, 'Times New Roman', serif">${escapeXml(`${i + 1}. ${p.name}`)}</text><text x="990" y="${imgY + 70 + i * 70}" text-anchor="end" font-size="36" font-weight="700" fill="${ink}" font-family="Georgia, serif">${p.score}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  <text x="${W / 2}" y="130" text-anchor="middle" font-size="84" font-weight="700" fill="${ink}" font-family="'Old English Text MT', Georgia, serif">${escapeXml(n.paperName)}</text>
  <line x1="60" y1="160" x2="${W - 60}" y2="160" stroke="${ink}" stroke-width="4"/>
  <text x="${W / 2}" y="200" text-anchor="middle" font-size="26" fill="${ink}" font-family="Georgia, serif">${escapeXml(`${n.date.length > 60 ? n.date.slice(0, 57) + '...' : n.date}  ·  SPECIAL EDITION`)}</text>
  <line x1="60" y1="220" x2="${W - 60}" y2="220" stroke="${ink}" stroke-width="2"/>
  ${title}${sub}${img}
  <text x="620" y="${imgY + 10}" font-size="30" font-weight="700" fill="${ink}" font-family="Georgia, serif">THE DETECTIVES</text>
  ${col}
  <line x1="60" y1="${H - 90}" x2="${W - 60}" y2="${H - 90}" stroke="${ink}" stroke-width="2"/>
  <text x="${W / 2}" y="${H - 45}" text-anchor="middle" font-size="28" fill="${ink}" font-family="Georgia, serif">Solved in the living room. Play Accomplice.</text>
</svg>`;
}

const pngCache = new Map<string, Buffer>();

export async function renderFrontPage(key: string, n: Newspaper): Promise<Buffer | null> {
  const hit = pngCache.get(key);
  if (hit) return hit;
  try {
    const { Resvg } = await import('@resvg/resvg-js');
    const fontDir = path.join(REPO_ROOT, 'assets/fonts');
    const fontFiles = existsSync(fontDir) ? readdirSync(fontDir).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => path.join(fontDir, f)) : [];
    const svg = frontPageSvg(n, await portraitDataUri(n.culpritPortrait));
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { fontFiles, loadSystemFonts: true, defaultFontFamily: 'Georgia' } }).render().asPng();
    const buf = Buffer.from(png);
    if (pngCache.size > 50) pngCache.clear();
    pngCache.set(key, buf);
    return buf;
  } catch (e) {
    log.warn('front page render failed', (e as Error)?.message);
    return null;
  }
}
