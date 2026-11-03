// Spoolghetti: check the math. Filament price per kg for Amazon.com search results.
// Copyright (C) 2026 wendsell
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT ANY
// WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
// PARTICULAR PURPOSE. See the GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along with this
// program. If not, see <https://www.gnu.org/licenses/>.
//
// Content script. Runs only on https://www.amazon.com/s* pages.

(async function () {
  'use strict';

  const CFG = {
    SPOOL_SIZES: [1.1, 1.0],  // tried in order when inferring spool count from total weight (Jayo 1.1kg first)
    MAX_SINGLE_KG: 1.6,       // a lone weight at or below this is treated as per-spool weight
    SNAP_TOL: 0.07,           // tolerance when snapping unit-price-derived weights to real spool sizes
  };

  const MATERIALS = ['PLA', 'PLA+', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'Other'];

  const EPS = 0.04;
  const LB_TO_KG = 0.45359237;
  const OZ_TO_KG = 0.028349523;

  const near = (a, b) => Math.abs(a - b) < EPS;
  const isWhole = n => n >= 1 && near(n, Math.round(n));
  const fmtKg = n => `${+n.toFixed(2)}kg`;
  const build = (count, perKg, conf) => ({ count, perKg, totalKg: count * perKg, conf });

  // Truncate (no rounding) to 4 decimals, drop trailing zeros, keep at least 2.
  function fmtMoney(n) {
    const s = (Math.floor(n * 1e4 + 1e-6) / 1e4).toFixed(4);
    return s.replace(/(\.\d\d\d?)0+$/, '$1').replace(/(\.\d\d)0$/, '$1');
  }

  // ---------- classification ----------

  const ACCESSORY = /\b(storage|dryers?|dry\s*box(es)?|containers?|holders?|racks?|hygrometers?|desiccant|nozzles?|hot\s*ends?|hotends?|extruders?|scrapers?|glue|bags?|enclosures?|cutters?|cleaning)\b/i;

  // 3D pen refills: "3D Pen Filament Refills", "Pen Filament", "Compatible with 3D Printing Pens", "Sample Pack"
  const PEN = /\b3d\s*pens?\b|\bpen\s+(filament|material|refills?)\b|\bprinting\s+pens?\b|\bsample\s+pack\b/i;
  // Sold by length (16 ft, 32.8Ft, 3m Each, 4 Meter) instead of weight
  const LENGTH = /\b\d+(?:\.\d+)?\s*(ft|feet|foot|meters?|metres?|m)\b/i;
  const WEIGHT = /\b\d+(?:\.\d+)?\s*(kgs?|kilograms?|g|grams?|lbs?)\b/i;

  function isFilament(t) {
    if (ACCESSORY.test(t) || PEN.test(t)) return false;
    if (LENGTH.test(t) && !WEIGHT.test(t)) return false;
    return /filament/i.test(t) || detectMaterial(t) !== 'Other';
  }

  function isRefill(t) {
    return /\b(refill|refilament|spool-?less|no-?spool|spool-?free)\b/i.test(t);
  }

  const MAT_RULES = [
    ['Nylon', /\b(nylon|pa\d{1,3}|paht|ppa)\b/i],
    ['PC',    /\b(polycarbonate|pc)\b/i],
    ['ASA',   /\basa\b/i],
    ['ABS',   /\babs\b/i],
    ['TPU',   /\b(tpu|tpe|flexible|flex)\b/i],
    ['PETG',  /\bpetg\b/i],
    ['PLA+',  /\bpla\s*(\+|plus\b|pro\b)/i],
    ['PLA',   /\b(pla|cospla)\b/i],
  ];

  function detectMaterial(t) {
    for (const [name, re] of MAT_RULES) if (re.test(t)) return name;
    return 'Other';
  }

  const KNOWN_BRANDS = [
    'SUNLU', 'eSUN', 'OVERTURE', 'HATCHBOX', 'Creality', 'AMOLEN', 'INLAND', 'ELEGOO', 'FLASHFORGE',
    'ERYONE', 'ANYCUBIC', 'Gizmo Dorks', 'Amazon Basics', 'Prusament', 'Proto-Pasta', 'CC3D', 'MakerBot',
    'Geeetech', 'Dremel', 'Comgrow', 'SainSmart', 'Voxelab', 'iSANMATE', 'JAYO', 'Kingroon', 'GIANTARM',
    'SCRIB3D', 'Deeplee', '3DHoJor', 'Cookiecad', 'ColorFabb', 'Paramount 3D', '3Doodler', 'MYNT3D',
    'Bambu Lab', 'Verbatim', 'LulzBot', 'BIQU', 'XYZprinting', 'Polymaker', 'Siraya Tech', 'UGUESS',
    'UJOY3D', 'Dynta', 'Reprapper', 'MarsWork', 'Sovol', 'Snapmaker', 'QIDI', 'Prusa',
  ];
  const GENERIC_FIRST = /^(pla\+?|petg|abs|asa|tpu|matte|silk|glow|filament|rapid|pre-dried|high|premium|multicolor|3d|pla\+3d)$/i;

  function brandFromTitle(t) {
    const s = t.trim();
    for (const b of KNOWN_BRANDS) {
      const first = b.split(' ')[0].replace(/[-+.]/g, '\\$&');
      if (new RegExp('^' + first + '\\b', 'i').test(s)) return b;
    }
    const w = (s.split(/[\s,]+/)[0] || '');
    if (!w || /\d/.test(w) || GENERIC_FIRST.test(w)) return 'Unbranded';
    return w;
  }

  // ---------- weight parsing ----------

  function toKg(val, unit) {
    const v = parseFloat(val);
    const u = unit.toLowerCase();
    if (u.startsWith('k')) return v;
    if (u.startsWith('lb')) return v * LB_TO_KG;
    return v / 1000; // grams
  }

  function getCount(t) {
    let m = t.match(/\b(\d+)\s*-?\s*(?:packs?|pk|pcs|spools?|rolls?|count)\b/i) || t.match(/\bpack\s+of\s+(\d+)\b/i);
    if (m) return +m[1];
    // "Dual Color*5, Triple Color *3" -> 8
    const stars = t.match(/\*\s*(\d+)\b/g);
    if (stars) return stars.reduce((a, s) => a + parseInt(s.replace(/\D/g, ''), 10), 0);
    m = t.match(/\b(\d+)\s*colou?rs?\b/i);
    if (m) return +m[1];
    return null;
  }

  // "Black+White+Red" -> 3. Only used when nothing else gives a count. Strips "PLA+" and "+/-".
  function plusCount(t) {
    const tt = t.replace(/pla\s*\+/ig, ' ').replace(/\+\s*\/\s*-/g, ' ');
    const chains = tt.match(/[A-Za-z][A-Za-z ]*(?:\+[A-Za-z][A-Za-z ]*)+/g);
    if (!chains) return null;
    return Math.max.apply(null, chains.map(c => c.split('+').length));
  }

  // Returns {count, perKg, totalKg, conf} | {count, perKg:null, conf:'none'} | null
  // conf: 'high' = trust it, 'low' = prefer unit-price fallback, 'none' = count only
  function parseTitle(raw) {
    const t = raw.replace(/×/g, 'x');

    // Explicit "4 x 1.1kg" or "250gx8"
    let m = t.match(/\b(\d+)\s*[x*]\s*(\d+(?:\.\d+)?)\s*(kgs?|g|lbs?)\b/i);
    if (m) return build(+m[1], toKg(m[2], m[3]), 'high');
    m = t.match(/(\d+(?:\.\d+)?)\s*(kgs?|g|lbs?)\s*[x*]\s*(\d+)\b/i);
    if (m) return build(+m[3], toKg(m[1], m[2]), 'high');

    const metric = [];
    const imperial = [];
    const wRe = /(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|g|grams?|lbs?)\b/gi;
    let w;
    while ((w = wRe.exec(t)) !== null) {
      const kg = toKg(w[1], w[2]);
      if (kg > 0) (/^lb/i.test(w[2]) ? imperial : metric).push(kg);
    }
    // "1 kg Spool (2.2 lbs)": lbs is a restatement, ignore it when kg/g is present
    const weights = metric.length ? metric : imperial;
    const count = getCount(t);

    if (!weights.length) {
      const n = count || plusCount(t);
      return n ? { count: n, perKg: null, totalKg: null, conf: 'none' } : null;
    }

    const max = Math.max.apply(null, weights);
    const min = Math.min.apply(null, weights);

    if (count) {
      if (count > 1 && min < max && near(min * count, max)) return build(count, min, 'high'); // 250g each, 4kg total
      if (count > 1 && max <= CFG.MAX_SINGLE_KG) return build(count, max, 'high');           // "1kg, 4 Pack"
      return build(count, max / count, 'high');                                               // "4-Pack (4KG)"
    }

    if (min < max && isWhole(max / min)) return build(Math.round(max / min), min, 'high');

    if (max <= CFG.MAX_SINGLE_KG) {
      // "1.1KG per Spool, Black+White" says nothing about how many spools
      if (/\bper\s*(spool|roll)\b/i.test(t)) {
        const n = plusCount(t);
        if (n && n > 1) return build(n, max, 'low');
      }
      return build(1, max, 'high');
    }

    for (const s of CFG.SPOOL_SIZES) {
      const n = max / s;
      if (isWhole(n)) return build(Math.round(n), s, 'high');
    }
    const n = Math.max(1, Math.round(max));
    return build(n, max / n, 'high');
  }

  function snapSpool(kg) {
    for (const s of [1.1, 1, 0.75, 0.5, 0.25, 2, 3]) if (Math.abs(kg - s) / s < CFG.SNAP_TOL) return s;
    return kg;
  }

  function snapCount(total) {
    for (const s of CFG.SPOOL_SIZES) {
      const n = Math.round(total / s);
      if (n >= 1 && Math.abs(n * s - total) / total < CFG.SNAP_TOL) return [n, s];
    }
    if (total <= CFG.MAX_SINGLE_KG) return [1, total];
    const n = Math.round(total);
    return [n, total / n];
  }

  // Combine title parse with Amazon's unit price ($/oz etc) when the title is vague.
  // unitPerKg = $/kg derived from the listing's unit price, or null.
  function resolveWeight(p, price, unitPerKg) {
    if (p && p.conf === 'high') return { count: p.count, spoolKg: p.perKg, totalKg: p.totalKg, approx: false };

    if (unitPerKg && price) {
      const total = price / unitPerKg;
      if (p && p.count) {
        const raw = total / p.count;
        const spool = snapSpool(raw);
        // only trust the title's count if it lands on a real spool size
        if (spool !== raw) return { count: p.count, spoolKg: spool, totalKg: p.count * spool, approx: true };
      }
      const [n, s] = snapCount(total);
      return { count: n, spoolKg: s, totalKg: n * s, approx: true };
    }

    if (p && p.count && !p.perKg) return { count: p.count, spoolKg: 1, totalKg: p.count, approx: true }; // assume 1kg
    if (p && p.perKg) return { count: p.count, spoolKg: p.perKg, totalKg: p.totalKg, approx: true };
    return null;
  }

  // ---------- DOM ----------

  const CARD_SEL = 'div[data-component-type="s-search-result"]';
  const STORE_KEY = 'filHelperSettings.v2';
  const DEFAULTS = {
    minSpoolKg: 0.5, highlightTop: 3, refill: 'all', hiddenMaterials: [], hiddenBrands: [], showHidden: false,
    autoLoad: true, maxPages: 7, sortByPrice: true,
  };

  const hasSync = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  // Chrome sync storage, so filters follow you across devices.
  // First run: import settings saved by the old Tampermonkey userscript (same key in amazon.com localStorage).
  async function loadSettings() {
    let saved = null;
    if (hasSync) {
      try { saved = (await chrome.storage.sync.get(STORE_KEY))[STORE_KEY] || null; } catch (e) { /* ignore */ }
    }
    if (!saved) {
      try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
      if (saved && hasSync) {
        try { await chrome.storage.sync.set({ [STORE_KEY]: saved }); } catch (e) { /* ignore */ }
      }
    }
    return Object.assign({}, DEFAULTS, saved || {});
  }
  function saveSettings() {
    const copy = JSON.parse(JSON.stringify(settings));
    if (hasSync) {
      try { chrome.storage.sync.set({ [STORE_KEY]: copy }); return; } catch (e) { /* fall through */ }
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(copy)); } catch (e) { /* ignore */ }
  }
  const settings = await loadSettings();

  function cardH2s(card) {
    return Array.from(card.querySelectorAll('h2'))
      .map(h => (h.getAttribute('aria-label') || h.textContent || '').replace(/^Sponsored Ad\s*-\s*/i, '').trim())
      .filter(Boolean);
  }

  function getTitle(card) {
    return cardH2s(card).sort((a, b) => b.length - a.length)[0] || '';
  }

  function getBrand(card, title) {
    const hs = cardH2s(card);
    if (hs.length > 1) {
      const short = hs.sort((a, b) => a.length - b.length)[0];
      if (short.length <= 30 && short !== title) {
        const known = KNOWN_BRANDS.find(b => b.toLowerCase() === short.toLowerCase());
        return known || short;
      }
    }
    return brandFromTitle(title);
  }

  function getPrice(card) {
    const scope = card.querySelector('[data-cy="price-recipe"]') || card;
    const el = scope.querySelector('.a-price:not(.a-text-price) .a-offscreen');
    if (!el) return null;
    const v = parseFloat(el.textContent.replace(/[^0-9.]/g, ''));
    return isFinite(v) && v > 0 ? v : null;
  }

  // Amazon's "($0.28/ounce)" -> $/kg. Ignores /count, /spools, etc.
  function getUnitPerKg(card) {
    const m = (card.textContent || '').match(/\$\s?(\d+(?:\.\d+)?)\s*\/\s*(ounce|oz|pound|lb|kilogram|kg|100\s*grams?|100\s*g|grams?|g)\b/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    const u = m[2].toLowerCase().replace(/\s+/g, '');
    if (u === 'ounce' || u === 'oz') return v / OZ_TO_KG;
    if (u === 'pound' || u === 'lb') return v / LB_TO_KG;
    if (u === 'kilogram' || u === 'kg') return v;
    if (u.startsWith('100g')) return v * 10;
    return v * 1000; // per gram
  }

  // ---------- UI ----------

  const css = document.createElement('style');
  css.textContent = `
    :root {
      --fil-badge-bg:#232f3e; --fil-badge-fg:#fff;
      --fil-best-bg:#067d62; --fil-best-ring:#0a9e7a; --fil-best-tint:rgba(10,158,122,.09);
      --fil-gold-bg:#ffc21a; --fil-gold-fg:#1a1a1a; --fil-gold-ring:#f0a800; --fil-gold-tint:rgba(255,194,26,.16);
      --fil-unk-bg:#8a8a8a;
      --fil-panel-bg:#fff; --fil-panel-fg:#111; --fil-panel-line:#e5e5e5; --fil-panel-muted:#666;
      --fil-input-bg:#fff; --fil-btn-bg:#f4f4f4;
    }
    :root.fil-dark {
      --fil-badge-bg:#3b4658; --fil-badge-fg:#f2f2f2;
      --fil-best-bg:#12b38c; --fil-best-ring:#19d3a6; --fil-best-tint:rgba(25,211,166,.13);
      --fil-gold-bg:#ffcc33; --fil-gold-fg:#111; --fil-gold-ring:#ffcc33; --fil-gold-tint:rgba(255,204,51,.14);
      --fil-unk-bg:#5c5c5c;
      --fil-panel-bg:#1f2125; --fil-panel-fg:#e8e8e8; --fil-panel-line:#363a40; --fil-panel-muted:#a0a4ab;
      --fil-input-bg:#2a2d33; --fil-btn-bg:#2f333a;
    }

    .fil-badge { display:inline-flex !important; align-items:center; flex-wrap:wrap; gap:4px; margin:4px 0;
      padding:4px 8px; border-radius:5px; font:600 13px/1.35 Arial,sans-serif !important;
      background:var(--fil-badge-bg) !important; color:var(--fil-badge-fg) !important; }
    .fil-badge.fil-best { background:var(--fil-best-bg) !important; font-size:14px !important; }
    .fil-badge.fil-gold { background:var(--fil-gold-bg) !important; color:var(--fil-gold-fg) !important; font-size:15px !important; }
    .fil-badge.fil-unk { background:var(--fil-unk-bg) !important; }
    .fil-sub { font-weight:400; opacity:.85; }
    .fil-rank { display:none; padding:0 6px; border-radius:10px; font-weight:800;
      background:rgba(255,255,255,.95); color:#111; }
    .fil-best .fil-rank, .fil-gold .fil-rank { display:inline-block; }
    .fil-gold .fil-rank { background:#111; color:var(--fil-gold-bg); }

    .fil-top { box-shadow:0 0 0 3px var(--fil-best-ring) !important; background-color:var(--fil-best-tint) !important;
      border-radius:8px !important; }
    .fil-top1 { box-shadow:0 0 0 4px var(--fil-gold-ring), 0 0 18px var(--fil-gold-ring) !important;
      background-color:var(--fil-gold-tint) !important; border-radius:8px !important; }

    body.fil-off .fil-badge, body.fil-off #fil-gear, body.fil-off #fil-panel { display:none !important; }
    .fil-hidden { display:none !important; }
    .fil-ghost { opacity:.3; }

    #fil-gear { position:fixed; left:12px; bottom:12px; z-index:2147483000; padding:7px 11px;
      border:1px solid var(--fil-panel-line); border-radius:6px; background:var(--fil-badge-bg) !important;
      color:var(--fil-badge-fg) !important; font:13px Arial,sans-serif; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,.3); }
    #fil-panel { position:fixed; left:12px; bottom:52px; z-index:2147483000; width:300px; max-height:75vh;
      overflow:auto; background:var(--fil-panel-bg) !important; color:var(--fil-panel-fg) !important;
      border:1px solid var(--fil-panel-line); border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.35);
      font:13px/1.4 Arial,sans-serif; display:none; color-scheme:light; }
    :root.fil-dark #fil-panel { color-scheme:dark; }
    #fil-panel.open { display:block; }
    #fil-panel * { color:inherit; }
    #fil-panel .fh { display:flex; justify-content:space-between; align-items:center; padding:10px 12px;
      border-bottom:1px solid var(--fil-panel-line); font-weight:700; position:sticky; top:0;
      background:var(--fil-panel-bg) !important; }
    #fil-panel .fh .tag { font-weight:400; font-style:italic; color:var(--fil-panel-muted); margin-left:4px; }
    #fil-panel .fh button { border:0; background:none; font-size:18px; cursor:pointer; line-height:1; }
    #fil-panel section { padding:8px 12px; border-bottom:1px solid var(--fil-panel-line); }
    #fil-panel h4 { margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--fil-panel-muted); }
    #fil-panel label { display:flex; align-items:center; gap:6px; padding:2px 0; cursor:pointer; }
    #fil-panel .grid { display:grid; grid-template-columns:1fr 1fr; column-gap:8px; }
    #fil-panel .cnt { color:var(--fil-panel-muted); margin-left:auto; }
    #fil-panel .brands { max-height:220px; overflow:auto; }
    #fil-panel .row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 0; }
    #fil-panel input[type=number] { width:64px; background:var(--fil-input-bg); border:1px solid var(--fil-panel-line); border-radius:4px; padding:2px 4px; }
    #fil-panel .mini { font-size:11px; border:1px solid var(--fil-panel-line); background:var(--fil-btn-bg); border-radius:4px; padding:1px 6px; cursor:pointer; }
    #fil-panel .stats { color:var(--fil-panel-muted); font-size:12px; }
    body.fil-loadall .s-pagination-strip, body.fil-loadall .s-pagination-container { display:none !important; }
  `;
  document.head.appendChild(css);

  // Dark mode: OS/Chrome dark theme, or Dark Reader running on the page
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function updateTheme() {
    const html = document.documentElement;
    const darkReader = html.getAttribute('data-darkreader-scheme') === 'dark' ||
      (html.hasAttribute('data-darkreader-mode') && html.getAttribute('data-darkreader-scheme') !== 'light');
    html.classList.toggle('fil-dark', !!(darkReader || (mq && mq.matches)));
  }
  updateTheme();
  if (mq && mq.addEventListener) mq.addEventListener('change', updateTheme);
  new MutationObserver(updateTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-darkreader-scheme', 'data-darkreader-mode'],
  });

  const gear = document.createElement('button');
  gear.id = 'fil-gear';
  document.body.appendChild(gear);

  const panel = document.createElement('div');
  panel.id = 'fil-panel';
  document.body.appendChild(panel);

  gear.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderPanel(true);
  });

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function allCards() {
    return Array.from(document.querySelectorAll(CARD_SEL)).filter(c => c._fil);
  }

  function counts() {
    const mats = {}, brands = {};
    allCards().forEach(c => {
      const d = c._fil;
      if (!d.filament) return;
      mats[d.material] = (mats[d.material] || 0) + 1;
      brands[d.brand] = (brands[d.brand] || 0) + 1;
    });
    settings.hiddenBrands.forEach(b => { if (!(b in brands)) brands[b] = 0; });
    return { mats, brands };
  }

  let lastSig = '';
  function renderPanel(force) {
    if (!panel.classList.contains('open')) return;
    const { mats, brands } = counts();
    const brandNames = Object.keys(brands).sort((a, b) => (brands[b] - brands[a]) || a.localeCompare(b));
    const sig = JSON.stringify([mats, brands, settings, stats]);
    if (!force && sig === lastSig) return;
    lastSig = sig;

    const brandBox = panel.querySelector('.brands');
    const scroll = brandBox ? brandBox.scrollTop : 0;

    panel.innerHTML = `
      <div class="fh"><span>Spoolghetti <span class="tag">Check the math.</span></span> <button data-act="close" title="Close">&times;</button></div>
      <section>
        <h4>Refills (spool-less)</h4>
        ${['all', 'hide', 'only'].map(v => `
          <label><input type="radio" name="refill" value="${v}" ${settings.refill === v ? 'checked' : ''}>
          ${{ all: 'Show all', hide: 'Hide refills', only: 'Refills only' }[v]}</label>`).join('')}
      </section>
      <section>
        <h4>Material</h4>
        <div class="grid">
          ${MATERIALS.map(m => `
            <label><input type="checkbox" data-mat="${esc(m)}" ${settings.hiddenMaterials.includes(m) ? '' : 'checked'}>
            ${esc(m)}<span class="cnt">${mats[m] || 0}</span></label>`).join('')}
        </div>
      </section>
      <section>
        <div class="row"><h4 style="margin:0">Brand</h4>
          <span><button class="mini" data-act="brands-all">All</button> <button class="mini" data-act="brands-none">None</button></span></div>
        <div class="brands">
          ${brandNames.map(b => `
            <label><input type="checkbox" data-brand="${esc(b)}" ${settings.hiddenBrands.includes(b) ? '' : 'checked'}>
            ${esc(b)}<span class="cnt">${brands[b]}</span></label>`).join('') || '<span class="stats">No listings yet</span>'}
        </div>
      </section>
      <section>
        <h4>Results</h4>
        <label><input type="checkbox" name="sortByPrice" ${settings.sortByPrice ? 'checked' : ''}> Sort cheapest $/kg first</label>
        <label><input type="checkbox" name="autoLoad" ${settings.autoLoad ? 'checked' : ''}> Auto-load more pages</label>
        <div class="row">Max pages <input type="number" step="1" min="1" max="20" name="maxPages" value="${settings.maxPages}"></div>
        <div class="row stats"><span>${esc(loaderText())}</span>
          ${loader.running ? '<button class="mini" data-act="stop-load">Stop</button>' : ''}</div>
      </section>
      <section>
        <div class="row">Min spool size (kg) <input type="number" step="0.05" min="0" name="minKg" value="${settings.minSpoolKg}"></div>
        <div class="row">Highlight cheapest <input type="number" step="1" min="0" name="topN" value="${settings.highlightTop}"></div>
        <label><input type="checkbox" name="showHidden" ${settings.showHidden ? 'checked' : ''}> Show hidden listings (dimmed)</label>
      </section>
      <section class="stats">${stats.shown} shown &middot; ${stats.small} small spools &middot; ${stats.filtered} filtered &middot; ${stats.junk} non-filament${stats.offpage ? ` &middot; ${stats.offpage} hidden by another extension or Amazon` : ''}</section>
    `;
    const nb = panel.querySelector('.brands');
    if (nb) nb.scrollTop = scroll;
  }

  function toggleIn(arr, val, hide) {
    const i = arr.indexOf(val);
    if (hide && i < 0) arr.push(val);
    if (!hide && i >= 0) arr.splice(i, 1);
  }

  panel.addEventListener('change', e => {
    const el = e.target;
    if (el.name === 'refill') settings.refill = el.value;
    else if (el.dataset.mat) toggleIn(settings.hiddenMaterials, el.dataset.mat, !el.checked);
    else if (el.dataset.brand) toggleIn(settings.hiddenBrands, el.dataset.brand, !el.checked);
    else if (el.name === 'minKg') settings.minSpoolKg = Math.max(0, parseFloat(el.value) || 0);
    else if (el.name === 'topN') settings.highlightTop = Math.max(0, parseInt(el.value, 10) || 0);
    else if (el.name === 'showHidden') settings.showHidden = el.checked;
    else if (el.name === 'sortByPrice') settings.sortByPrice = el.checked;
    else if (el.name === 'maxPages') settings.maxPages = Math.min(20, Math.max(1, parseInt(el.value, 10) || 1));
    else if (el.name === 'autoLoad') {
      settings.autoLoad = el.checked;
      if (el.checked) startLoader(); else stopLoader('off');
    }
    saveSettings();
    if (el.name === 'maxPages') startLoader();
    applyFilters();
    renderPanel(true);
  });

  panel.addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'close') panel.classList.remove('open');
    if (act === 'brands-all') settings.hiddenBrands = [];
    if (act === 'brands-none') settings.hiddenBrands = Object.keys(counts().brands);
    if (act === 'stop-load') { stopLoader('stopped'); renderPanel(true); return; }
    if (act !== 'close') { saveSettings(); applyFilters(); renderPanel(true); }
  });

  function insertBadge(card, badge) {
    const anchor = card.querySelector('[data-cy="price-recipe"]') || card.querySelector('h2');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(badge, anchor);
    else card.prepend(badge);
  }

  // ---------- processing ----------

  function processCard(card) {
    if (card.dataset.filDone) return;
    card.dataset.filDone = '1';

    const title = getTitle(card);
    const d = {
      title,
      filament: isFilament(title),
      brand: getBrand(card, title),
      material: detectMaterial(title),
      refill: isRefill(title),
      spoolKg: null,
      perKg: null,
      badge: null,
      frame: card.querySelector('.s-card-container') || card, // element that gets the outline
    };
    d.idx = cardSeq++;
    card._fil = d;
    if (!d.filament) return;

    const price = getPrice(card);
    const r = resolveWeight(parseTitle(title), price, getUnitPerKg(card));

    const badge = document.createElement('div');
    badge.className = 'fil-badge';
    const tags = `${esc(d.material)}${d.refill ? ' &middot; refill' : ''}`;

    if (!r || !price) {
      badge.classList.add('fil-unk');
      badge.innerHTML = `? ${!price ? 'no price' : 'weight unknown'} <span class="fil-sub">${tags}</span>`;
    } else {
      d.spoolKg = r.spoolKg;
      d.perKg = price / r.totalKg;
      const t = r.approx ? '~' : '';
      const spools = r.count === 1 ? fmtKg(r.spoolKg) : `${r.count} x ${fmtKg(r.spoolKg)}`;
      const main = near(r.spoolKg, 1)
        ? `${t}$${fmtMoney(d.perKg)}/kg`
        : `${t}$${fmtMoney(price / r.count)}/spool &middot; ${t}$${fmtMoney(d.perKg)}/kg`;
      badge.innerHTML = `<span class="fil-rank"></span>${main} <span class="fil-sub">(${spools}) ${tags}</span>`;
    }
    d.badge = badge;
    insertBadge(card, badge);
  }

  let cardSeq = 0;
  const stats = { shown: 0, small: 0, filtered: 0, junk: 0, offpage: 0 };

  function hideReason(d) {
    if (!d.filament) return 'junk';
    if (d.spoolKg !== null && d.spoolKg < settings.minSpoolKg) return 'small';
    if (settings.refill === 'hide' && d.refill) return 'filtered';
    if (settings.refill === 'only' && !d.refill) return 'filtered';
    if (settings.hiddenMaterials.includes(d.material)) return 'filtered';
    if (settings.hiddenBrands.includes(d.brand)) return 'filtered';
    return null;
  }

  // Only run on filament pages: filament search/category in the URL, or most listings say "filament".
  // Uses the literal word (not material detection) so "abs workout" or "tpu phone case" don't trip it.
  const FIL_URL = /[?&](k|field-keywords)=[^&#]*filament|6066129011/i;
  const MIN_SHARE = 0.5;
  function searchTerm() {
    try { return new URL(location.href).searchParams.get('k') || ''; } catch (e) { return ''; }
  }
  function isFilamentPage(cards) {
    const k = searchTerm();
    if (ACCESSORY.test(k) || PEN.test(k)) return false; // "filament dryer", "3d pen refills"
    if (FIL_URL.test(location.href)) return true;
    if (cards.length < 4) return false;
    const n = cards.filter(c => /filament/i.test(c._fil.title)).length;
    return n / cards.length >= MIN_SHARE;
  }

  function applyFilters() {
    stats.shown = stats.small = stats.filtered = stats.junk = stats.offpage = 0;
    const cards = allCards();

    if (!isFilamentPage(cards)) {
      document.body.classList.add('fil-off');
      document.body.classList.remove('fil-loadall');
      panel.classList.remove('open');
      cards.forEach(card => {
        card.classList.remove('fil-hidden', 'fil-ghost');
        if (card._fil.frame) card._fil.frame.classList.remove('fil-top', 'fil-top1');
      });
      return;
    }
    document.body.classList.remove('fil-off');

    const visible = [];
    cards.forEach(card => {
      const d = card._fil;
      const why = hideReason(d);
      d.why = why;
      if (why) stats[why]++; else stats.shown++;
      card.classList.toggle('fil-hidden', !!why && !settings.showHidden);
      card.classList.toggle('fil-ghost', !!why && settings.showHidden);
      d.rank = 0;
    });

    // Cards hidden by something other than us can't be seen, so they can't be ranked.
    // Ad blockers hide Sponsored results with CSS, and Amazon hides some placeholder cards.
    // Checked after our own classes are applied; all reads happen here in one pass.
    cards.forEach(card => {
      const d = card._fil;
      d.offPage = !d.why && card.getClientRects().length === 0;
      if (d.offPage) { stats.shown--; stats.offpage++; }
      if (!d.why && !d.offPage && d.perKg !== null) visible.push(d);
    });

    // #1 = gold, rest of top N = green. Ties share a rank.
    let rank = 0, prev = null;
    visible
      .sort((a, b) => a.perKg - b.perKg)
      .slice(0, settings.highlightTop)
      .forEach((d, i) => {
        if (prev === null || Math.abs(d.perKg - prev) > 1e-9) rank = i + 1;
        prev = d.perKg;
        d.rank = rank;
      });

    // Write each badge once with its final state (rewriting text re-triggers the observer)
    cards.forEach(card => {
      const d = card._fil;
      const r = d.rank;
      if (d.frame) {
        d.frame.classList.toggle('fil-top1', r === 1);
        d.frame.classList.toggle('fil-top', r > 1);
      }
      if (!d.badge) return;
      d.badge.classList.toggle('fil-gold', r === 1);
      d.badge.classList.toggle('fil-best', r > 1);
      const rk = d.badge.querySelector('.fil-rank');
      const want = r ? `#${r}` : '';
      if (rk && rk.textContent !== want) rk.textContent = want;
    });

    reorder(cards);
    updateGear();
  }

  function updateGear() {
    const hidden = stats.small + stats.filtered + stats.junk;
    const load = loaderShort();
    const txt = `⚙ Spoolghetti${hidden ? ` · ${hidden} hidden` : ''}${load ? ` · ${load}` : ''}`;
    if (gear.textContent !== txt) gear.textContent = txt;
  }

  // ---------- sorting ----------

  let anchor = null; // marker where the sorted block starts (keeps Amazon's "Results" header above it)

  function getSlot() {
    const first = document.querySelector(CARD_SEL);
    return document.querySelector('.s-main-slot') || (first && first.parentElement);
  }

  function sortGroup(d) {
    if (d.why || d.offPage) return 2;
    return d.perKg === null ? 1 : 0;
  }

  function reorder(cards) {
    const slot = getSlot();
    if (!slot) return;
    const mine = cards.filter(c => c.parentElement === slot);
    if (mine.length < 2) return;

    const desired = mine.slice().sort((a, b) => {
      const x = a._fil, y = b._fil;
      if (settings.sortByPrice) {
        const g = sortGroup(x) - sortGroup(y);
        if (g) return g;
        if (sortGroup(x) === 0 && x.perKg !== y.perKg) return x.perKg - y.perKg;
      }
      return x.idx - y.idx;
    });
    if (desired.every((c, i) => c === mine[i])) return; // already in order, avoids observer loops

    if (!anchor || anchor.parentElement !== slot) {
      anchor = document.createElement('div');
      anchor.className = 'fil-anchor';
      anchor.style.display = 'none';
      slot.insertBefore(anchor, mine.reduce((a, b) => (a._fil.idx < b._fil.idx ? a : b)));
    }
    const frag = document.createDocumentFragment();
    desired.forEach(c => frag.appendChild(c));
    slot.insertBefore(frag, anchor.nextSibling);
  }

  // ---------- auto-load more pages ----------

  const loader = { running: false, page: 1, done: false, state: '', token: 0 };

  function pageParam(url) {
    try { return parseInt(new URL(url).searchParams.get('page'), 10) || 1; } catch (e) { return 1; }
  }

  function hasNext(doc) {
    const next = doc.querySelector('.s-pagination-next');
    return !!next && !next.classList.contains('s-pagination-disabled') && next.tagName === 'A';
  }

  function loaderShort() {
    if (loader.running) return `loading p${loader.page + 1}/${settings.maxPages}`;
    if (loader.state === 'blocked') return 'paused (Amazon check)';
    if (loader.page > 1) return `${loader.page} pages`;
    return '';
  }

  function loaderText() {
    if (!settings.autoLoad) return 'Auto-load off';
    if (loader.running) return `Loading page ${loader.page + 1} of up to ${settings.maxPages}...`;
    if (loader.state === 'blocked') return 'Amazon showed a check page, stopped. Use the page links below.';
    if (loader.state === 'error') return 'Load failed, stopped. Use the page links below.';
    if (loader.state === 'stopped') return `Stopped at page ${loader.page}`;
    if (loader.state === 'end') return `All ${loader.page} pages loaded`;
    if (loader.state === 'max') return `Loaded ${loader.page} pages (max)`;
    return `Page ${loader.page}`;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function stopLoader(state) {
    loader.token++;
    loader.running = false;
    loader.state = state;
    if (state !== 'end' && state !== 'max') document.body.classList.remove('fil-loadall');
    updateGear();
  }

  async function startLoader() {
    if (loader.running || !settings.autoLoad) return;
    if (document.body.classList.contains('fil-off')) return;
    if (loader.page === 1) loader.page = pageParam(location.href);
    if (!hasNext(document) && loader.page === pageParam(location.href)) { loader.state = 'end'; return; }
    if (loader.state === 'end' || loader.state === 'blocked') return;
    if (loader.page >= settings.maxPages) { loader.state = 'max'; return; }

    const token = ++loader.token;
    loader.running = true;
    loader.state = '';
    document.body.classList.add('fil-loadall');
    updateGear();
    renderPanel(true);

    try {
      while (loader.page < settings.maxPages) {
        await sleep(1200 + Math.random() * 800);
        if (token !== loader.token) return;

        const url = new URL(location.href);
        url.searchParams.set('page', String(loader.page + 1));
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (token !== loader.token) return;
        if (!res.ok) { stopLoader(res.status === 503 ? 'blocked' : 'error'); return; }

        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        if (doc.querySelector('form[action*="validateCaptcha"], form[action*="Captcha"]')) { stopLoader('blocked'); return; }

        const have = new Set(Array.from(document.querySelectorAll(CARD_SEL)).map(c => c.getAttribute('data-asin')));
        const fresh = Array.from(doc.querySelectorAll(CARD_SEL))
          .filter(c => { const a = c.getAttribute('data-asin'); return a && !have.has(a); });
        if (!fresh.length && !doc.querySelector(CARD_SEL)) { stopLoader('blocked'); return; }

        const slot = getSlot();
        const cardsNow = Array.from(document.querySelectorAll(CARD_SEL)).filter(c => c.parentElement === slot);
        let after = cardsNow[cardsNow.length - 1];
        fresh.forEach(c => {
          const n = document.importNode(c, true);
          if (after && after.parentNode) { after.parentNode.insertBefore(n, after.nextSibling); after = n; }
          else if (slot) slot.appendChild(n);
        });

        loader.page++;
        updateGear();
        renderPanel(true);
        if (!hasNext(doc)) { stopLoader('end'); renderPanel(true); return; }
      }
      stopLoader('max');
      renderPanel(true);
    } catch (e) {
      if (token === loader.token) { stopLoader('error'); renderPanel(true); }
    }
  }

  function scan() {
    document.querySelectorAll(CARD_SEL).forEach(processCard);
    applyFilters();
    renderPanel(false);
    if (!loader.running && !loader.state) startLoader();
  }

  let timer = null;
  new MutationObserver(muts => {
    // ignore our own panel/gear re-renders
    if (muts.every(m => panel.contains(m.target) || m.target === gear)) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });

  // Settings changed in another tab or on another device: apply them here too.
  if (hasSync && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes[STORE_KEY]) return;
      const next = changes[STORE_KEY].newValue;
      if (!next || JSON.stringify(next) === JSON.stringify(settings)) return;
      const wasAuto = settings.autoLoad;
      Object.assign(settings, DEFAULTS, next);
      applyFilters();
      renderPanel(true);
      if (settings.autoLoad && !wasAuto) startLoader();
      if (!settings.autoLoad && wasAuto && loader.running) stopLoader('off');
    });
  }

  scan();
  // Some ad blockers hide Sponsored cards a moment after load; re-check once so rankings skip them.
  setTimeout(scan, 2500);
})();
