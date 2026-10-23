// Runs inside the page (serialized by page.evaluate). Must be self contained.
// Returns layout, text size, contrast, focus and safe-area findings plus the visible text.
export async function pageAudit({ kind, shot, dpr, fullPage }) {
  const TV = kind === 'tv';
  const vw = innerWidth, vh = innerHeight;
  const issues = [];
  const stage = document.querySelector('.stage');
  const scale = TV && stage ? stage.getBoundingClientRect().width / 1920 : 1;
  const SAFE = { l: 96, r: 1920 - 96, t: 54, b: 1080 - 54 };

  const cssPath = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      const cls = [...e.classList].filter((c) => !/^(is-|has-)/.test(c)).slice(0, 2);
      if (e.id) p += `#${e.id}`; else if (cls.length) p += '.' + cls.join('.');
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  const snippet = (el, n = 70) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

  const hiddenCache = new Map();
  const hidden = (el) => {
    if (!el || el === document.documentElement) return false;
    if (hiddenCache.has(el)) return hiddenCache.get(el);
    const cs = getComputedStyle(el);
    let h = cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || Number(cs.opacity) < 0.05 || el.hidden;
    if (!h && el.tagName === 'DIALOG' && !el.open) h = true;
    // content of a closed <details> (other than its summary) is not rendered
    if (!h && el.parentElement?.tagName === 'DETAILS' && !el.parentElement.open && el.tagName !== 'SUMMARY') h = true;
    if (!h) h = hidden(el.parentElement);
    hiddenCache.set(el, h);
    return h;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };

  /** Visible part of an element after ancestor clipping, or null if fully clipped. */
  const clipRect = (el) => {
    let r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let clippedBy = null;
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.clipPath !== 'none') {
        const pr = e.getBoundingClientRect();
        const nb = { l: Math.max(box.l, pr.left), t: Math.max(box.t, pr.top), r: Math.min(box.r, pr.right), b: Math.min(box.b, pr.bottom) };
        if (nb.r - nb.l < box.r - box.l - 2 || nb.b - nb.t < box.b - box.t - 2) clippedBy = clippedBy ?? e;
        box = nb;
        if (box.r <= box.l || box.b <= box.t) return { gone: true };
      }
    }
    return { box, rect: r, clippedBy };
  };

  // ---------- collect text elements ----------
  const textEls = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
    seen.add(el);
    if (hidden(el)) continue;
    if (el.closest('.sr-only, .visually-hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // sr-only style clip
    const cs = getComputedStyle(el);
    if ((cs.position === 'absolute' && r.width <= 1 && r.height <= 1) || cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    textEls.push(el);
  }

  const visibleText = [];
  for (const el of textEls) {
    const c = clipRect(el);
    if (c.gone) continue;
    const own = [...el.childNodes].filter((x) => x.nodeType === 3).map((x) => x.nodeValue).join('').replace(/\s+/g, ' ').trim();
    const caption = !!el.closest('.cap-panel, .captionbar, .wordcap, .narration, .spot-answer, .reply__text, .tut-caption, .b-caption');
    const block = !/^(inline|contents)$/.test(getComputedStyle(el).display);
    visibleText.push({ sel: cssPath(el), text: own, full: block ? snippet(el, 600) : '', caption, aria: !!el.closest('[aria-hidden="true"]') });

    const cs = getComputedStyle(el);
    const r = c.rect;
    // text size
    const px = parseFloat(cs.fontSize) * scale;
    const min = TV ? 28 : 14;
    // Exempt: remote key-cap glyphs ("OK" inside a round badge, in hints or on a button). They are aria-hidden
    // decoration next to a full-size word that carries the meaning, and sit inside a 44 px cap.
    const keyCap = !!el.closest('[aria-hidden="true"]') && el.matches('.key, .key *, .btn-ok, .btn-ok *');
    if (px + 0.01 < min && own.length > 0 && !keyCap && !/^[\s·•|✓✕×+!?.,:;'"“”‘’…-]+$/.test(own)) {
      issues.push({ type: 'small-text', sel: cssPath(el), text: own.slice(0, 60), detail: `${px.toFixed(1)}px < ${min}px` });
    }
    // truncation
    const clipsX = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
    const clipsY = ['hidden', 'clip'].includes(cs.overflowY) || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
    if ((clipsX && el.scrollWidth > el.clientWidth + 1) || (clipsY && el.scrollHeight > el.clientHeight + 2)) {
      issues.push({ type: 'truncated', sel: cssPath(el), text: snippet(el), detail: `scroll ${el.scrollWidth}x${el.scrollHeight} > client ${el.clientWidth}x${el.clientHeight}` });
    }
    // clipped by an ancestor
    if (c.clippedBy && !c.clippedBy.matches('html, body, .viewport, main, .screen-host')) {
      const cut = Math.round((r.width * r.height - (c.box.r - c.box.l) * (c.box.b - c.box.t)) / Math.max(1, r.width * r.height) * 100);
      if (cut >= 8 && !el.closest('[aria-hidden="true"]')) issues.push({ type: 'clipped', sel: cssPath(el), text: snippet(el), detail: `${cut}% cut off by ${cssPath(c.clippedBy)}` });
    }
    // off the viewport
    const b = c.box;
    if (TV) {
      if (b.l < -2 || b.t < -2 || b.r > vw + 2 || b.b > vh + 2) issues.push({ type: 'off-screen', sel: cssPath(el), text: snippet(el), detail: `rect ${Math.round(b.l)},${Math.round(b.t)} to ${Math.round(b.r)},${Math.round(b.b)}` });
      // safe area (in 1920x1080 stage pixels)
      const sr = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
      const L = (b.l - sr.left) / scale, R = (b.r - sr.left) / scale, T = (b.t - sr.top) / scale, B = (b.b - sr.top) / scale;
      if ((R - L) < 1700 && (B - T) < 950 && !el.closest('[aria-hidden="true"]')) {
        const v = [];
        if (L < SAFE.l - 1) v.push(`left ${Math.round(L)}`);
        if (R > SAFE.r + 1) v.push(`right ${Math.round(R)}`);
        if (T < SAFE.t - 1) v.push(`top ${Math.round(T)}`);
        if (B > SAFE.b + 1) v.push(`bottom ${Math.round(B)}`);
        if (v.length) issues.push({ type: 'safe-area', sel: cssPath(el), text: snippet(el), detail: v.join(', ') });
      }
    } else if (b.l < -2 || b.r > vw + 2) {
      issues.push({ type: 'off-screen', sel: cssPath(el), text: snippet(el), detail: `x ${Math.round(b.l)} to ${Math.round(b.r)} (viewport ${vw})` });
    }
  }

  // ---------- interactive elements: overlap, safe area ----------
  function topModal() {
    let m = null;
    try { m = document.querySelector('dialog:modal'); } catch { /* old engines */ }
    if (!m) { const scopes = [...document.querySelectorAll('[data-nav-scope][aria-modal="true"]')].filter((x) => !hidden(x)); m = scopes.at(-1) ?? null; }
    return m;
  }
  const inter = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"], input:not([type="hidden"]), textarea, select, summary, [data-nav], label.choice, label.suspect')]
    .filter((el) => !hidden(el))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && opacityOf(el) > 0.05; })
    .filter((el) => !(el.tagName === 'INPUT' && ['radio', 'checkbox'].includes(el.type) && el.closest('label')))
    // while a modal is open (a <dialog> opened with showModal, or the TV's focus-trapping dialog) everything behind it
    // is inert, so only the modal's own controls can collide
    .filter((el) => { const m = topModal(); return !m || m.contains(el); });
  const reach = (el) => {
    const c = clipRect(el);
    if (c.gone) return null;
    const x = (c.box.l + c.box.r) / 2, y = (c.box.t + c.box.b) / 2;
    if (x < 0 || y < 0 || x > vw || y > vh) return { box: c.box, top: null };
    const hit = document.elementFromPoint(x, y);
    const ok = hit && (el === hit || el.contains(hit) || (hit.closest('label') && hit.closest('label') === el.closest('label')));
    return { box: c.box, top: ok };
  };
  const info = inter.map((el) => ({ el, r: reach(el) })).filter((x) => x.r && x.r.top !== false);
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i], b = info[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // content scrolling under a fixed or sticky bar is expected
      const pinnedBar = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
      if (!TV && pinnedBar(a.el) !== pinnedBar(b.el)) continue;
      const A = a.r.box, B = b.r.box;
      const w = Math.min(A.r, B.r) - Math.max(A.l, B.l), h = Math.min(A.b, B.b) - Math.max(A.t, B.t);
      if (w <= 2 || h <= 2) continue;
      const area = w * h;
      const small = Math.min((A.r - A.l) * (A.b - A.t), (B.r - B.l) * (B.b - B.t));
      if (area > 25 && area / small > 0.05) {
        issues.push({ type: 'overlap', sel: `${cssPath(a.el)} ⨯ ${cssPath(b.el)}`, text: `${snippet(a.el).slice(0, 30)} / ${snippet(b.el).slice(0, 30)}`, detail: `${Math.round(w)}x${Math.round(h)} px overlap (${Math.round((area / small) * 100)}% of smaller)` });
      }
    }
    if (TV) {
      const B = info[i].r.box;
      const sr = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
      const L = (B.l - sr.left) / scale, R = (B.r - sr.left) / scale, T = (B.t - sr.top) / scale, Bo = (B.b - sr.top) / scale;
      if ((R - L) < 1700 && (Bo - T) < 950 && (L < SAFE.l - 1 || R > SAFE.r + 1 || T < SAFE.t - 1 || Bo > SAFE.b + 1)) {
        issues.push({ type: 'safe-area', sel: cssPath(info[i].el), text: snippet(info[i].el), detail: `control at ${Math.round(L)},${Math.round(T)} to ${Math.round(R)},${Math.round(Bo)}` });
      }
    } else {
      // the control's own size: a row half scrolled out of a sheet is not a small target (clipping is checked above)
      const el = info[i].el;
      const R = el.getBoundingClientRect();
      if (R.width < 44 || R.height < 44) {
        if (!el.closest('.sr-only') && !['INPUT', 'TEXTAREA'].includes(el.tagName)) issues.push({ type: 'small-target', sel: cssPath(el), text: snippet(el), detail: `${Math.round(R.width)}x${Math.round(R.height)} px (< 44)` });
      }
    }
  }

  // ---------- phone: sideways scroll ----------
  if (!TV) {
    const sw = document.scrollingElement.scrollWidth;
    if (sw > vw + 1) issues.push({ type: 'h-scroll', sel: 'document', text: '', detail: `page is ${sw}px wide in a ${vw}px viewport` });
  }

  // ---------- broken images ----------
  for (const img of document.images) {
    if (!hidden(img) && img.complete && img.naturalWidth === 0 && img.getAttribute('src')) issues.push({ type: 'broken-image', sel: cssPath(img), text: img.getAttribute('src'), detail: 'image failed to load' });
  }

  // ---------- TV focus ring ----------
  let focusInfo = null;
  if (TV) {
    const navs = [...document.querySelectorAll('[data-nav]')].filter((e) => !hidden(e));
    const f = document.querySelector('[data-focused]');
    if (navs.length && !f) issues.push({ type: 'focus', sel: 'document', text: '', detail: `${navs.length} focusable controls but nothing has focus` });
    else if (f) {
      const props = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'backgroundColor', 'transform', 'scale', 'filter', 'color', 'opacity', 'translate'];
      const grab = () => [null, '::before', '::after'].map((p) => { const cs = getComputedStyle(f, p); return props.map((k) => cs[k]).join('|'); }).join('#');
      const prevT = f.style.transition;
      const kids = [f, ...f.querySelectorAll('*')];
      const prevKids = kids.map((k) => k.style.transition);
      kids.forEach((k) => (k.style.transition = 'none'));
      const on = grab();
      const onKids = kids.slice(1, 30).map((k) => getComputedStyle(k).transform + getComputedStyle(k).color + getComputedStyle(k).boxShadow).join();
      f.removeAttribute('data-focused');
      const hadFocus = document.activeElement === f;
      if (hadFocus) f.blur();
      const off = grab();
      const offKids = kids.slice(1, 30).map((k) => getComputedStyle(k).transform + getComputedStyle(k).color + getComputedStyle(k).boxShadow).join();
      f.setAttribute('data-focused', '');
      if (hadFocus) f.focus({ preventScroll: true });
      kids.forEach((k, i) => (k.style.transition = prevKids[i]));
      f.style.transition = prevT;
      const r = f.getBoundingClientRect();
      focusInfo = { sel: cssPath(f), text: snippet(f), differs: on !== off || onKids !== offKids };
      if (on === off && onKids === offKids) issues.push({ type: 'focus', sel: cssPath(f), text: snippet(f), detail: 'focused control looks the same as unfocused' });
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh || hidden(f)) issues.push({ type: 'focus', sel: cssPath(f), text: snippet(f), detail: 'focused control is off screen or hidden' });
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (top && !f.contains(top) && !top.contains(f)) issues.push({ type: 'focus', sel: cssPath(f), text: snippet(f), detail: `focused control is covered by ${cssPath(top)}` });
    }
  }

  // ---------- contrast, sampled from the screenshot ----------
  let contrastChecked = 0;
  let shotMismatch = false;
  if (shot) {
    const img = new Image();
    img.src = shot;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const oy = fullPage ? scrollY : 0, ox = fullPage ? scrollX : 0;
    const flagged = new Set();
    // the page grew or shrank since the screenshot (a line arrived): pixels no longer line up with the DOM
    const docH = fullPage ? document.scrollingElement.scrollHeight : innerHeight;
    shotMismatch = Math.abs(img.naturalHeight - Math.round(docH * dpr)) > 2;
    for (const el of shotMismatch ? [] : textEls) {
      const c = clipRect(el);
      if (c.gone) continue;
      const cs = getComputedStyle(el);
      const own = [...el.childNodes].filter((x) => x.nodeType === 3).map((x) => x.nodeValue).join('').trim();
      if (!own || /^[\s·•|✓✕×+!?.,:;'"“”‘’…-]+$/.test(own)) continue;
      const col = parse(cs.color);
      if (!col) continue;
      // behind an open modal everything is inert and dimmed by its backdrop on purpose
      { const m = topModal(); if (m && !m.contains(el)) continue; }
      // a wordmark split into one span per letter: the ring around a single glyph reads its neighbours, not the page
      if (own.length <= 2 && el.parentElement && [...el.parentElement.children].length > 3 && [...el.parentElement.childNodes].every((n) => n.nodeType !== 3 || !n.nodeValue.trim())) continue;
      // disabled controls are exempt from contrast (WCAG 1.4.3)
      if (el.closest('button:disabled, [aria-disabled="true"], fieldset:disabled')) continue;
      // a backdrop the screen deliberately sinks (spotlight, verdict: brightness(0.15) blur) is not meant to be read
      let sunk = false;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const f = getComputedStyle(e).filter;
        const m = /brightness\(([\d.]+)\)/.exec(f);
        if ((m && Number(m[1]) < 0.5) || /blur\(/.test(f)) { sunk = true; break; }
      }
      if (sunk) continue;
      // Measure the text's own line boxes, then sample a ring just outside them.
      // only this element's own text nodes, so icons and badges inside it do not count as background
      const rects = [];
      for (const tn of el.childNodes) {
        if (tn.nodeType !== 3 || !tn.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(tn);
        rects.push(...[...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2));
      }
      if (!rects.length) continue;
      // text under a passing full-screen moment (Objection!, the chime, a blackout) is judged on a calmer frame
      {
        const r0 = rects[0];
        const under = [...document.querySelectorAll('.objection, .objection *, .chime, .blackout-fx')].some((o) => { if (o.contains(el)) return false; const q = o.getBoundingClientRect(); return r0.right > q.left && r0.left < q.right && r0.bottom > q.top && r0.top < q.bottom; });
        if (under) continue;
      }
      // text covered by something else (a dialog scrim, the spotlight) is not being read; overlap checks cover that
      {
        const r0 = rects[0];
        const hit = document.elementFromPoint((r0.left + r0.right) / 2, (r0.top + r0.bottom) / 2);
        if (hit && !el.contains(hit) && !hit.contains(el) && hit.tagName !== 'INPUT' && !(hit.closest('label') && hit.closest('label') === el.closest('label'))) continue;
      }
      // Sample the background inside the nearest painted box (a tile, a tag, a chip): a big glyph's line box can
      // poke out of its tile, and the ring around it would otherwise read the page behind the tile.
      let paint = null;
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const ps = getComputedStyle(e);
        const bgc = parse(ps.backgroundColor);
        if ((bgc && bgc[3] > 0.6) || (ps.backgroundImage !== 'none' && !/url\(/.test(ps.backgroundImage))) { paint = e.getBoundingClientRect(); break; }
      }
      const inPaint = (x, y) => !paint || (x >= paint.left + 2 && x <= paint.right - 2 && y >= paint.top + 2 && y <= paint.bottom - 2);
      const samples = [];
      for (const r of rects.slice(0, 6)) {
        const pts = [];
        const pad = 3;
        for (let i = 0; i <= 8; i++) {
          const x = r.left + (r.width * i) / 8;
          pts.push([x, r.top - pad], [x, r.bottom + pad]);
        }
        pts.push([r.left - pad, (r.top + r.bottom) / 2], [r.right + pad, (r.top + r.bottom) / 2]);
        for (const [x, y] of pts.filter(([x, y]) => inPaint(x, y))) {
          const X = Math.round((x + ox) * dpr), Y = Math.round((y + oy) * dpr);
          if (X < 0 || Y < 0 || X >= cv.width || Y >= cv.height) continue;
          const d = ctx.getImageData(X, Y, 1, 1).data;
          samples.push([d[0], d[1], d[2]]);
        }
      }
      if (samples.length < 4) continue;
      // background: the sample at the 60th percentile of contrast, so a stray icon or neighbouring glyph does not decide it
      const alpha = col[3] * opacityOf(el);
      // text faded nearly out (mid fade, or a deliberately ghosted layer) is not meant to be read in this frame
      if (opacityOf(el) < 0.3) continue;
      const scored = samples.map((bgc) => { const fgc = [0, 1, 2].map((i) => col[i] * alpha + bgc[i] * (1 - alpha)); return { bg: bgc, fg: fgc, r: ratio(fgc, bgc) }; }).sort((a, b) => a.r - b.r);
      const pick = scored[Math.floor(scored.length * 0.6)];
      const bg = pick.bg, fg = pick.fg, cr = pick.r;
      contrastChecked++;
      const size = parseFloat(cs.fontSize) * scale;
      const bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      if (cr < need) {
        const key = cssPath(el) + own.slice(0, 20);
        if (flagged.has(key)) continue;
        flagged.add(key);
        issues.push({ type: 'contrast', sel: cssPath(el), text: own.slice(0, 60), detail: `${cr.toFixed(2)}:1 (needs ${need}:1) text rgb(${fg.map(Math.round)}) on ~rgb(${bg})`, ratio: Number(cr.toFixed(2)) });
      }
    }
  }

  // de-duplicate identical findings
  const uniq = [];
  const keys = new Set();
  for (const i of issues) { const k = `${i.type}|${i.sel}|${i.text}|${i.detail}`; if (!keys.has(k)) { keys.add(k); uniq.push(i); } }

  return {
    issues: uniq,
    texts: visibleText,
    focus: focusInfo,
    stats: { shotMismatch, textEls: textEls.length, interactive: info.length, contrastChecked, scale, vw, vh, title: document.title },
  };
}
