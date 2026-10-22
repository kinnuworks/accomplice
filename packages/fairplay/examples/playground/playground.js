// The browser-safe core: generation, theory testing and proof chains, no Z3 needed.
// Build first (npm run build), then serve the package folder: npx serve . and open /examples/playground/
import { generateCase, evaluateTheory, proofChain } from '../../dist/core.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
let c = null;

function plan(c) {
  const cell = 40;
  const rooms = c.rooms.map((r) => {
    const crime = r.id === c.crime.room;
    return `<g><rect x="${r.x * cell + 2}" y="${r.y * cell + 2}" width="${r.w * cell - 4}" height="${r.h * cell - 4}" rx="6"
      fill="${crime ? 'rgba(163,59,59,.18)' : 'rgba(176,138,62,.12)'}" stroke="currentColor" stroke-opacity=".4"/>
      <text x="${(r.x + r.w / 2) * cell}" y="${(r.y + r.h / 2) * cell}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="currentColor">${esc(r.name)}</text></g>`;
  }).join('');
  const center = (id) => { const r = c.rooms.find((x) => x.id === id); return [(r.x + r.w / 2) * cell, (r.y + r.h / 2) * cell]; };
  const doors = c.rooms.flatMap((r) => r.adjacent.filter((a) => a > r.id).map((a) => {
    const [x1, y1] = center(r.id), [x2, y2] = center(a);
    return `<line x1="${x1}" y1="${y1 + 12}" x2="${x2}" y2="${y2 + 12}" stroke="#b08a3e" stroke-dasharray="4 4" stroke-opacity=".7"/>`;
  })).join('');
  return `<svg viewBox="0 0 ${16 * cell} ${9 * cell}" role="img" aria-label="Floor plan; dashed lines are doors, the red room is the crime scene">${rooms}${doors}</svg>`;
}

function render() {
  const seed = Number($('seed').value) || 1;
  c = generateCase({ seed, tone: $('tone').value, difficulty: Number($('difficulty').value) });
  const slot = c.slots[c.crime.slot].label;
  $('story').innerHTML = `<h2>${esc(c.title)}</h2><p class="muted">${esc(c.place)}. ${esc(c.dateLine)}.</p><p>${esc(c.intro)}</p>
    <p><strong>The crime:</strong> ${esc(c.victim.name)} ${esc(c.crime.what)}, ${esc(c.rooms.find((r) => r.id === c.crime.room).name)}, ${esc(slot)}.</p>`;
  $('plan').innerHTML = plan(c);
  $('cast').innerHTML = `<h2>Suspects</h2>` + c.suspects.map((s) => `<p><strong>${esc(s.name)}</strong>, ${esc(s.role)}. <span class="muted">${esc(s.motive)}</span></p>`).join('')
    + `<p class="muted">Possible means: ${c.items.map((i) => `the ${esc(i.name)} (kept in the ${esc(c.rooms.find((r) => r.id === i.homeRoom).name)})`).join(', ')}.</p>`;
  $('clues').innerHTML = c.clues.map((cl) => `<label class="clue"><input type="checkbox" value="${cl.id}">
    <span><strong>${esc(cl.title)}</strong> <small>round ${cl.round}, ${cl.visibility === 'board' ? 'board' : `seat ${cl.holderPlayerSlot}`}</small><br>${esc(cl.text)}</span></label>`).join('');
  $('culprit').innerHTML = c.suspects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('item').innerHTML = '<option value="">Any</option>' + c.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
  $('verdict').innerHTML = ''; $('solution').innerHTML = '';
}

async function prove() {
  const pinned = [...document.querySelectorAll('#clues input:checked')].map((x) => x.value);
  const theory = { culprit: $('culprit').value, ...($('item').value ? { item: $('item').value } : {}) };
  const v = await evaluateTheory(c, pinned, theory);
  const words = { follows: 'It follows. The ticked clues prove it.', possible: 'Possible, but not proven yet.', contradicted: 'Contradicted. The ticked clues rule it out.' };
  $('verdict').innerHTML = `<span class="verdict ${v}">${words[v]}</span> <span class="muted">(${pinned.length} clues ticked)</span>`;
}

function reveal() {
  const name = (id) => c.suspects.find((s) => s.id === id).name;
  $('solution').innerHTML = `<h2>Solution: ${esc(name(c.truth.culprit))}</h2><ol>${proofChain(c).map((s) => `<li>${esc(s.says)} <em>${esc(s.therefore)}</em></li>`).join('')}</ol>`
    + (c.confession ?? []).map((l) => `<p>"${esc(l)}"</p>`).join('');
}

$('go').onclick = render;
$('random').onclick = () => { $('seed').value = String(1 + Math.floor(Math.random() * 99999)); render(); };
$('prove').onclick = prove;
$('all').onclick = () => document.querySelectorAll('#clues input').forEach((x) => { x.checked = true; });
$('reveal').onclick = reveal;
render();
