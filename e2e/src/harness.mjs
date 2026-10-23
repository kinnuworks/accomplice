// Devices, instrumentation, per-phase capture and checks.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import WebSocket from 'ws';
import { pageAudit } from './inpage.mjs';

const MEDIA = /\.(mp3|ogg|wav|m4a|aac|webm)(\?|$)|\/audio\/|\/sfx\/|\/music\/|\/voice\//i;

export const PHONE_MODELS = ['iPhone 15', 'Pixel 7'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In-page probe installed before any script: media plays, WS frames, long tasks. */
function probe() {
  const w = window;
  w.__qa = { plays: [], errors: [], ws: [], sent: [] };
  const P = HTMLMediaElement.prototype;
  const origPlay = P.play;
  P.play = function (...a) {
    const src = this.currentSrc || this.src || '';
    const rec = { t: Date.now(), src, ok: null };
    w.__qa.plays.push(rec);
    const pr = origPlay.apply(this, a);
    if (pr && pr.then) pr.then(() => { rec.ok = true; }, (e) => { rec.ok = false; rec.err = String(e && e.name); });
    this.addEventListener('playing', () => { rec.playingAt = rec.playingAt ?? Date.now(); }, { once: true });
    this.addEventListener('error', () => { rec.mediaError = this.error && this.error.code; }, { once: true });
    return pr;
  };
  const AC = w.AudioBufferSourceNode && w.AudioBufferSourceNode.prototype;
  if (AC) {
    const s = AC.start;
    AC.start = function (...a) { w.__qa.plays.push({ t: Date.now(), src: 'webaudio', ok: true }); return s.apply(this, a); };
  }
  const OWS = w.WebSocket;
  w.WebSocket = class extends OWS {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (ev) => {
        if (typeof ev.data !== 'string') return;
        try { const m = JSON.parse(ev.data); if (m.t !== 'pong') w.__qa.ws.push({ t: Date.now(), m: m.t === 'room:state' ? { t: m.t, phase: m.state.phase, round: m.state.round, out: (m.state.players ?? []).every((p) => !p.connected || p.questionsLeft === 0) } : m }); } catch { /* */ }
        if (w.__qa.ws.length > 4000) w.__qa.ws.splice(0, 1000);
      });
    }
    send(d) { try { const m = JSON.parse(d); if (m.t !== 'ping') w.__qa.sent.push({ t: Date.now(), m }); } catch { /* */ } return super.send(d); }
  };
}

/**
 * Phones: a thumb scrolls the control to the middle of the screen before tapping. If something still sits on
 * top of it (sticky dock, toast, overlay), record that and fall back to a DOM click so the run can go on.
 */
let patched = false;
function patchLocatorClick(page, run) {
  if (patched) return;
  patched = true;
  const proto = Object.getPrototypeOf(page.locator('body'));
  const orig = proto.click;
  proto.click = async function (opts = {}) {
    if (!this.page().__qaPhone) return orig.call(this, opts);
    await this.evaluate((el) => el.scrollIntoView({ block: 'center' }), null, { timeout: opts.timeout ?? 8000 }).catch(() => {});
    try {
      return await orig.call(this, { ...opts, timeout: Math.min(opts.timeout ?? 4000, 4000) });
    } catch (e) {
      if (/not enabled|disabled/i.test(e.message) || !(await this.count().catch(() => 0))) throw e;
      const cover = await this.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h && !el.contains(h) ? `${h.tagName.toLowerCase()}.${[...h.classList].join('.')}` : 'not visible / not stable'; }).catch(() => '?');
      const label = (await this.evaluate((el) => el.innerText || el.getAttribute('aria-label') || el.tagName).catch(() => '?')).slice(0, 60);
      run.covered = run.covered ?? [];
      run.covered.push({ scenario: run.scenario, phase: run.phase, control: label, by: cover });
      return this.evaluate((el) => el.click());
    }
  };
}

export class Run {
  constructor({ name, outDir, baseUrl, log }) {
    this.name = name;
    this.outDir = outDir;
    this.baseUrl = baseUrl;
    this.log = log;
    this.devices = [];
    this.findings = [];        // { area, sev, title, repro, expected, actual, shot, scenario, phase }
    this.checks = [];          // per snapshot per device auto-check results
    this.moments = [];         // visible text per snapshot for the copy audit
    this.media = [];           // { device, url, status, phase, t }
    this.timeline = [];        // { t, scenario, event, detail }
    this.latency = [];         // { scenario, who, suspect, askedAt, firstUtterance, firstAudioPlay, firstPart }
    this.phase = 'boot';
    this.scenario = '';
    this.snapCount = 0;
  }

  async init() {
    this.browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  }

  async close() {
    clearInterval(this.roundTimer);
    for (const d of this.devices) { try { await d.context.close(); } catch { /* */ } }
    try { await this.browser?.close(); } catch { /* */ }
  }

  mark(event, detail) { this.timeline.push({ t: Date.now(), scenario: this.scenario, phase: this.phase, event, detail }); }

  finding(f) {
    const full = { scenario: this.scenario, phase: this.phase, ...f };
    this.findings.push(full);
    this.log(`  [${f.sev}] ${f.area}: ${f.title}`);
  }

  async newDevice(name, kind, model) {
    const opts = kind === 'tv'
      ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }
      : { ...devices[model], reducedMotion: 'no-preference', permissions: ['microphone'] };
    if (kind !== 'tv') delete opts.defaultBrowserType;
    const context = await this.browser.newContext({ ...opts, baseURL: this.baseUrl });
    await context.addInitScript(probe);
    const page = await context.newPage();
    if (kind !== 'tv') { page.__qaPhone = true; patchLocatorClick(page, this); }
    const d = { name, kind, model: model ?? 'TV 1920x1080', context, page, logs: [], closed: false };
    this.instrument(d, page);
    this.devices.push(d);
    return d;
  }

  instrument(d, page) {
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') d.logs.push({ t: Date.now(), phase: this.phase, scenario: this.scenario, kind: `console.${type}`, text: msg.text().slice(0, 400), loc: msg.location()?.url });
    });
    page.on('pageerror', (err) => d.logs.push({ t: Date.now(), phase: this.phase, scenario: this.scenario, kind: 'uncaught', text: `${err.message}`.slice(0, 400), stack: (err.stack ?? '').split('\n').slice(0, 4).join(' | ') }));
    page.on('requestfailed', (req) => {
      const f = req.failure()?.errorText ?? '';
      if (/ERR_ABORTED/.test(f) && MEDIA.test(req.url())) { this.media.push({ device: d.name, url: req.url(), status: 'aborted', phase: this.phase, scenario: this.scenario, t: Date.now() }); return; }
      d.logs.push({ t: Date.now(), phase: this.phase, scenario: this.scenario, kind: 'request-failed', text: `${req.method()} ${req.url()} ${f}` });
    });
    page.on('response', (res) => {
      const url = res.url();
      if (MEDIA.test(url)) this.media.push({ device: d.name, url, status: res.status(), phase: this.phase, scenario: this.scenario, t: Date.now() });
      if (res.status() >= 400) d.logs.push({ t: Date.now(), phase: this.phase, scenario: this.scenario, kind: `http-${res.status()}`, text: `${res.request().method()} ${url}` });
    });
  }

  /** Raw protocol socket, used only to observe or as a documented fallback when the UI has no control. */
  async socket(query) {
    const url = this.baseUrl.replace(/^http/, 'ws') + '/ws?' + new URLSearchParams(query);
    const ws = new WebSocket(url);
    const msgs = [];
    ws.on('message', (data) => { try { msgs.push({ t: Date.now(), m: JSON.parse(String(data)) }); } catch { /* */ } });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    return { ws, msgs, send: (m) => ws.send(JSON.stringify(m)), close: () => ws.close() };
  }

  async roomState(code) {
    const r = await fetch(`${this.baseUrl}/api/rooms/${code}`);
    return r.ok ? r.json() : null;
  }

  async waitRoom(code, pred, timeout = 30_000, label = 'room condition') {
    const t0 = Date.now();
    let st = null;
    while (Date.now() - t0 < timeout) {
      st = await this.roomState(code);
      if (st && pred(st)) return st;
      await sleep(250);
    }
    throw new Error(`timed out after ${timeout} ms waiting for ${label} (phase ${st?.phase}, round ${st?.round})`);
  }

  /**
   * Capture every live device for a phase: screenshot, layout/contrast/focus checks, axe on phones, visible text.
   * Returns { dir } so callers can cite screenshot paths.
   */
  async snap(phase, only) {
    this.phase = phase;
    const n = String(++this.snapCount).padStart(2, '0');
    const dir = path.join(this.outDir, this.scenario, `${n}-${phase}`);
    fs.mkdirSync(dir, { recursive: true });
    const list = this.devices.filter((d) => !d.closed && (!only || only.includes(d.name)));
    await sleep(700);
    // Let entrance animations finish and transient full-screen moments (the clock chime, a blackout) clear, so the
    // checks judge the settled screen rather than a frame mid-fade. Snaps named after the moment keep it.
    const keepFx = /chime|blackout|lights/i.test(phase);
    await Promise.all(list.map((d) => settle(d.page, { keepFx: keepFx || d.kind !== 'tv' }).catch(() => {})));
    for (const d of list) {
      const file = path.join(dir, `${d.name}.png`);
      const rel = path.relative(path.resolve(this.outDir, '..', '..', '..'), file);
      try {
        let res;
        const sig = () => d.page.evaluate(() => `${document.body.innerText.length}:${document.querySelectorAll('*').length}`).catch(() => '');
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = await sig();
          const buf = d.kind === 'tv'
            ? await d.page.screenshot({ path: file, animations: 'allow' })
            : await d.page.screenshot({ path: file, fullPage: true, scale: 'css', animations: 'allow' });
          res = await d.page.evaluate(pageAudit, { kind: d.kind, shot: `data:image/png;base64,${buf.toString('base64')}`, dpr: 1, fullPage: d.kind !== 'tv' });
          // something arrived (a caption, a toast) between the screenshot and the checks: pixels and DOM disagree
          if (d.kind === 'tv' && before !== (await sig()) && attempt < 2) { await sleep(600); continue; }
          if (!res.stats.shotMismatch) break;
          await sleep(600); // the page changed under the screenshot; take it again
        }
        let axe = [];
        if (d.kind !== 'tv') {
          try {
            const a = await new AxeBuilder({ page: d.page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
            axe = a.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((x) => x.target.join(' ')).join(' ; '), html: v.nodes[0]?.html?.slice(0, 160) }));
          } catch (e) { axe = [{ id: 'axe-failed', impact: 'minor', help: String(e.message).slice(0, 200), nodes: 0 }]; }
        }
        this.checks.push({ scenario: this.scenario, phase, device: d.name, kind: d.kind, model: d.model, shot: rel, issues: res.issues, axe, stats: res.stats, focus: res.focus });
        this.moments.push({ scenario: this.scenario, phase, device: d.kind === 'tv' ? 'tv' : d.name, screen: rel, texts: res.texts });
      } catch (e) {
        this.log(`  snap ${phase}/${d.name} failed: ${e.message.split('\n')[0]}`);
        this.checks.push({ scenario: this.scenario, phase, device: d.name, kind: d.kind, shot: rel, error: e.message.slice(0, 300), issues: [], axe: [] });
      }
    }
    this.mark('snap', phase);
    return { dir: path.relative(path.resolve(this.outDir, '..', '..', '..'), dir) };
  }

  /**
   * Follow the room's investigate rounds in the background, so a round the server ends by itself (rather than
   * one the harness asked to leave through the TV) is known, with how long it lasted and whether it was legitimate
   * (everyone out of questions, or the round clock ran out).
   */
  watchRounds(code) {
    clearInterval(this.roundTimer);
    this.roundLog = [];
    let last = null; let since = Date.now(); let out = false;
    this.roundTimer = setInterval(async () => {
      const st = await this.roomState(code).catch(() => null);
      if (!st) return;
      const key = st.phase === 'investigate' ? `investigate ${st.round}` : st.phase;
      if (last && key !== last && last.startsWith('investigate')) {
        const requested = this.advancing || Date.now() - (this.advanceAt ?? 0) < 25_000;
        const lasted = Date.now() - since;
        this.roundLog.push({ t: Date.now(), from: last, to: key, lasted, requested, legit: out || lasted > 230_000 });
      }
      if (key !== last) { last = key; since = Date.now(); }
      out = st.phase === 'investigate' && st.players.every((p) => !p.connected || p.questionsLeft === 0);
    }, 700);
    this.roundTimer.unref?.();
  }

  /** The last time the server left a round on its own, if the harness has not moved on since. */
  unrequestedRoundEnd() {
    const last = (this.roundLog ?? []).at(-1);
    return last && !last.requested && !last.legit ? last : null;
  }

  /** Read the in-page probe (media plays, WS frames). */
  async probe(d) {
    try { return await d.page.evaluate(() => window.__qa); } catch { return null; }
  }
}

/** Wait (bounded) for finite CSS/WAAPI animations to finish and, on the TV, for the chime/blackout overlays to go. */
async function settle(page, { keepFx = false, maxMs = 2000, fxMs = 11_000 } = {}) {
  if (!keepFx) {
    await page.waitForFunction(() => !document.querySelector('.chime, .blackout-fx'), null, { timeout: fxMs, polling: 250 }).catch(() => {});
  }
  await page.evaluate(async (max) => {
    const finite = document.getAnimations().filter((a) => {
      const t = a.effect?.getComputedTiming?.();
      return a.playState === 'running' && t && Number.isFinite(t.endTime) && t.endTime < 20_000;
    });
    await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, max))]);
  }, maxMs);
}

// ---------- TV helpers (remote control = keyboard) ----------

export async function tvKey(tv, key, times = 1, gap = 160) {
  for (let i = 0; i < times; i++) { await tv.page.keyboard.press(key); await sleep(gap); }
}

/** Move the D-pad focus onto a target element using arrow keys only. */
export async function tvFocus(tv, locator, maxSteps = 30) {
  const target = await locator.elementHandle({ timeout: 5000 });
  if (!target) throw new Error('focus target not found');
  for (let i = 0; i < maxSteps; i++) {
    const st = await tv.page.evaluate((t) => {
      const f = document.querySelector('[data-focused]');
      if (!f) return { none: true };
      if (f === t || t.contains(f)) return { done: true };
      const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
      return { dx: (b.left + b.width / 2) - (a.left + a.width / 2), dy: (b.top + b.height / 2) - (a.top + a.height / 2) };
    }, target);
    if (st.done) return true;
    if (st.none) { await tvKey(tv, 'ArrowDown'); continue; }
    const horiz = Math.abs(st.dx) > Math.abs(st.dy) * 1.2 && Math.abs(st.dx) > 20;
    const key = horiz ? (st.dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (st.dy > 0 ? 'ArrowDown' : 'ArrowUp');
    const before = await tv.page.evaluate(() => document.querySelector('[data-focused]')?.outerHTML.slice(0, 120));
    await tvKey(tv, key);
    const after = await tv.page.evaluate(() => document.querySelector('[data-focused]')?.outerHTML.slice(0, 120));
    if (before === after) {
      // stuck on this axis: try the other axis
      const alt = horiz ? (st.dy > 0 ? 'ArrowDown' : 'ArrowUp') : (st.dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      await tvKey(tv, alt);
    }
  }
  return false;
}

// ---------- phone helpers ----------

export async function phoneJoin(p, code, name, avatarIdx = 0) {
  await p.page.goto(`/p/?room=${code}`);
  await p.page.getByLabel('Your name').fill(name);
  const radios = p.page.locator('input[name="avatar"]');
  if (await radios.count()) await radios.nth(avatarIdx % (await radios.count())).evaluate((el) => el.click());
  await p.page.getByRole('button', { name: 'Step inside' }).click();
}

/** Type a question to a suspect through the real dock. Returns the wall clock time of the submit tap. */
export async function phoneAsk(p, suspectName, question) {
  const page = p.page;
  const tab = page.getByRole('tab', { name: /^Ask/ });
  if (await tab.count()) await tab.click();
  const again = page.getByRole('button', { name: 'Ask another question' });
  if (await again.count()) await again.click();
  if (suspectName) {
    const radio = page.getByRole('radio', { name: new RegExp(escapeRe(suspectName)) }).first();
    await radio.evaluate((el) => el.click(), null, { timeout: 5000 });
  }
  const typeBtn = page.getByRole('button', { name: /^(Type instead|Type your question)$/ });
  await typeBtn.click({ timeout: 8000 });
  await page.locator('textarea#question').fill(question);
  const ask = page.getByRole('button', { name: /^Ask\b/ });
  const at = Date.now();
  await ask.click({ timeout: 5000 });
  return at;
}

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
