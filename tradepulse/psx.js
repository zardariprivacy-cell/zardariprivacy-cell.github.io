/* =====================================================================
   TradePulse AI — PSX Stocks module (v3)
   Pakistan Stock Exchange daily analysis, 100% client-side.
   Data: Yahoo Finance daily candles (.KA) via the allorigins CORS relay.
   Method: TradingView-style transparent technical ratings (see README).
   Privacy: no accounts, no tracking — analysis runs on this device only.
   ===================================================================== */
(function () {
'use strict';

/* ---------------- indicator math (pure functions) ---------------- */
function smaArr(v, p) {
  const out = new Array(v.length).fill(null); let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i]; if (i >= p) s -= v[i - p];
    if (i >= p - 1) out[i] = s / p;
  }
  return out;
}
function emaArr(v, p) {
  const out = new Array(v.length).fill(null); const k = 2 / (p + 1);
  let prev = null, seed = 0;
  for (let i = 0; i < v.length; i++) {
    if (i < p - 1) { seed += v[i]; continue; }
    if (i === p - 1) { seed += v[i]; prev = seed / p; out[i] = prev; continue; }
    prev = v[i] * k + prev * (1 - k); out[i] = prev;
  }
  return out;
}
function rsiArr(c, p) {
  p = p || 14;
  const out = new Array(c.length).fill(null);
  if (c.length <= p) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= p; l /= p;
  out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function stochArr(h, l, c, kp, dp) {
  kp = kp || 14; dp = dp || 3;
  const raw = new Array(c.length).fill(null);
  for (let i = kp - 1; i < c.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kp + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
    raw[i] = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
  }
  const k = smaArr(raw.map(x => x === null ? 0 : x), dp);
  for (let i = 0; i < raw.length; i++) if (raw[i] === null) k[i] = null;
  const d = smaArr(k.map(x => x === null ? 0 : x), dp);
  for (let i = 0; i < raw.length; i++) if (k[i] === null) d[i] = null;
  return { k, d };
}
function stochRsiArr(c, p) {
  const r = rsiArr(c, 14);
  const raw = new Array(c.length).fill(null);
  for (let i = 0; i < c.length; i++) {
    if (i < p) continue;
    let mn = Infinity, mx = -Infinity, ok = true;
    for (let j = i - p + 1; j <= i; j++) { if (r[j] === null) { ok = false; break; } mn = Math.min(mn, r[j]); mx = Math.max(mx, r[j]); }
    if (ok) raw[i] = mx === mn ? 50 : (r[i] - mn) / (mx - mn) * 100;
  }
  const k = smaArr(raw.map(x => x === null ? 0 : x), 3);
  for (let i = 0; i < raw.length; i++) if (raw[i] === null) k[i] = null;
  const d = smaArr(k.map(x => x === null ? 0 : x), 3);
  for (let i = 0; i < raw.length; i++) if (k[i] === null) d[i] = null;
  return { k, d };
}
function cciArr(h, l, c, p) {
  p = p || 20;
  const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  const s = smaArr(tp, p);
  const out = new Array(c.length).fill(null);
  for (let i = p - 1; i < c.length; i++) {
    let md = 0; for (let j = i - p + 1; j <= i; j++) md += Math.abs(tp[j] - s[i]);
    md /= p;
    out[i] = md === 0 ? 0 : (tp[i] - s[i]) / (0.015 * md);
  }
  return out;
}
function macdCalc(c) {
  const e12 = emaArr(c, 12), e26 = emaArr(c, 26);
  const line = c.map((_, i) => (e12[i] !== null && e26[i] !== null) ? e12[i] - e26[i] : null);
  const filled = line.map(x => x === null ? 0 : x);
  const sigFull = emaArr(filled, 9);
  const signal = line.map((x, i) => x === null ? null : sigFull[i]);
  return { line, signal };
}
function willrArr(h, l, c, p) {
  p = p || 14;
  const out = new Array(c.length).fill(null);
  for (let i = p - 1; i < c.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hh = Math.max(hh, h[j]); ll = Math.min(ll, l[j]); }
    out[i] = hh === ll ? -50 : (hh - c[i]) / (hh - ll) * -100;
  }
  return out;
}
function lastIdx(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && isFinite(arr[i])) return i; return -1; }
function at(arr) { const i = lastIdx(arr); return i < 0 ? null : arr[i]; }
function prevOf(arr) { const i = lastIdx(arr); if (i < 1) return null; for (let j = i - 1; j >= 0; j--) if (arr[j] !== null && isFinite(arr[j])) return arr[j]; return null; }

/* Full TradingView-style analysis of one candle series.
   candles: [{t,o,h,l,c}] oldest→newest, closes non-null. */
function analyzeCandles(candles) {
  const c = candles.map(x => x.c), h = candles.map(x => x.h), l = candles.map(x => x.l);
  const n = c.length, price = c[n - 1], prevClose = n > 1 ? c[n - 2] : price;
  const change = price - prevClose, changePct = prevClose ? change / prevClose * 100 : 0;
  const rows = []; // {name, value, vote}  vote: 1 buy, -1 sell, 0 neutral
  const reasons = [];
  const voteName = v => v > 0 ? 'Buy' : v < 0 ? 'Sell' : 'Neutral';

  /* ---- Moving averages: 10 position votes + 2 crossover votes = 12 ---- */
  const maRows = [];
  const periods = [10, 20, 50, 100, 200];
  const smas = {}, emas = {};
  for (const p of periods) { smas[p] = smaArr(c, p); emas[p] = emaArr(c, p); }
  for (const p of periods) {
    for (const [kind, arr] of [['SMA', smas[p]], ['EMA', emas[p]]]) {
      const v = at(arr);
      if (v === null) continue;
      const vote = price > v ? 1 : price < v ? -1 : 0;
      maRows.push({ name: kind + ' ' + p, value: v, vote });
    }
  }
  // Crossover votes (TradingView-style trend conditions)
  const s10 = at(smas[10]), s20 = at(smas[20]);
  if (s10 !== null && s20 !== null) maRows.push({ name: 'SMA 10 / 20 cross', value: s10 - s20, vote: s10 > s20 ? 1 : s10 < s20 ? -1 : 0, fmt: 'diff' });
  const e50 = at(emas[50]), e200 = at(emas[200]);
  if (e50 !== null && e200 !== null) maRows.push({ name: 'EMA 50 / 200 cross', value: e50 - e200, vote: e50 > e200 ? 1 : e50 < e200 ? -1 : 0, fmt: 'diff' });
  rows.push(...maRows);
  const s50 = at(smas[50]), s200 = at(smas[200]);
  if (s50 !== null) reasons.push({ dir: price > s50 ? 1 : -1, text: 'Price is ' + (price > s50 ? 'above' : 'below') + ' its 50-day average (Rs ' + fmt(s50) + ') — ' + (price > s50 ? 'medium-term uptrend' : 'medium-term downtrend') + '.' });
  if (s200 !== null) reasons.push({ dir: price > s200 ? 1 : -1, text: 'Price is ' + (price > s200 ? 'above' : 'below') + ' its 200-day average (Rs ' + fmt(s200) + ') — the long-term trend is ' + (price > s200 ? 'up' : 'down') + '.' });
  if (e50 !== null && e200 !== null) reasons.push({ dir: e50 > e200 ? 1 : -1, text: e50 > e200 ? 'Golden-cross setup: the 50-day EMA is above the 200-day EMA.' : 'Death-cross setup: the 50-day EMA is below the 200-day EMA.' });

  /* ---- Oscillators: 7 votes, TradingView published conditions ---- */
  const osc = [];
  const rsi = rsiArr(c, 14), rsiV = at(rsi), rsiP = prevOf(rsi);
  if (rsiV !== null) {
    let v = 0;
    if (rsiV < 30 && rsiP !== null && rsiV > rsiP) v = 1;
    else if (rsiV > 70 && rsiP !== null && rsiV < rsiP) v = -1;
    osc.push({ name: 'RSI (14)', value: rsiV, vote: v, fmt: '2' });
    if (rsiV > 70) reasons.push({ dir: -1, text: 'RSI is ' + rsiV.toFixed(0) + ' — overbought zone; buyers may be exhausted.' });
    else if (rsiV < 30) reasons.push({ dir: 1, text: 'RSI is ' + rsiV.toFixed(0) + ' — oversold zone; sellers may be exhausted.' });
  }
  const st = stochArr(h, l, c, 14, 3), sk = at(st.k), sd = at(st.d);
  if (sk !== null && sd !== null) {
    let v = 0;
    if (sk < 20 && sk > sd) v = 1; else if (sk > 80 && sk < sd) v = -1;
    osc.push({ name: 'Stochastic %K (14,3)', value: sk, vote: v, fmt: '2' });
  }
  const cci = cciArr(h, l, c, 20), cciV = at(cci), cciP = prevOf(cci);
  if (cciV !== null) {
    let v = 0;
    if (cciV < -100 && cciP !== null && cciV > cciP) v = 1;
    else if (cciV > 100 && cciP !== null && cciV < cciP) v = -1;
    osc.push({ name: 'CCI (20)', value: cciV, vote: v, fmt: '0' });
  }
  const mc = macdCalc(c), ml = at(mc.line), ms = at(mc.signal);
  if (ml !== null && ms !== null) {
    const v = ml > ms ? 1 : ml < ms ? -1 : 0;
    osc.push({ name: 'MACD (12,26,9)', value: ml - ms, vote: v, fmt: 'diff' });
    reasons.push({ dir: v, text: v >= 0 ? 'MACD is above its signal line — momentum is rising.' : 'MACD is below its signal line — momentum is weakening.' });
  }
  const sr = stochRsiArr(c, 14), srk = at(sr.k), srd = at(sr.d);
  if (srk !== null && srd !== null) {
    let v = 0;
    if (srk < 20 && srk > srd) v = 1; else if (srk > 80 && srk < srd) v = -1;
    osc.push({ name: 'Stochastic RSI (14)', value: srk, vote: v, fmt: '2' });
  }
  const wr = willrArr(h, l, c, 14), wrV = at(wr), wrP = prevOf(wr);
  if (wrV !== null) {
    let v = 0;
    if (wrV < -80 && wrP !== null && wrV > wrP) v = 1;
    else if (wrV > -20 && wrP !== null && wrV < wrP) v = -1;
    osc.push({ name: 'Williams %R (14)', value: wrV, vote: v, fmt: '2' });
  }
  if (n > 11) {
    const mom = c[n - 1] - c[n - 11], momPrev = c[n - 2] - c[n - 12];
    const v = mom > momPrev ? 1 : mom < momPrev ? -1 : 0;
    osc.push({ name: 'Momentum (10)', value: mom, vote: v, fmt: 'diff' });
  }
  rows.push(...osc);

  /* ---- Overall score → TradingView bands ---- */
  const votes = rows.map(r => r.vote);
  const score = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0;
  const maScore = maRows.length ? maRows.reduce((a, r) => a + r.vote, 0) / maRows.length : 0;
  const oscScore = osc.length ? osc.reduce((a, r) => a + r.vote, 0) / osc.length : 0;
  const rating = score > 0.5 ? 'Strong Buy' : score >= 0.1 ? 'Buy' : score <= -0.5 ? 'Strong Sell' : score <= -0.1 ? 'Sell' : 'Neutral';
  const color = score > 0.5 ? '#0ECB81' : score >= 0.1 ? '#3FB68B' : score <= -0.5 ? '#F6465D' : score <= -0.1 ? '#F2788A' : '#B7BDC6';
  reasons.push({ dir: change >= 0 ? 1 : -1, text: 'Last session: ' + (change >= 0 ? 'up' : 'down') + ' ' + Math.abs(changePct).toFixed(2) + '% to Rs ' + fmt(price) + '.' });

  /* ---- Classic pivot points from the last candle ---- */
  const L = candles[n - 1];
  const pp = (L.h + L.l + L.c) / 3;
  const pivots = {
    pp, r1: 2 * pp - L.l, s1: 2 * pp - L.h,
    r2: pp + (L.h - L.l), s2: pp - (L.h - L.l),
    r3: L.h + 2 * (pp - L.l), s3: L.l - 2 * (L.h - pp)
  };
  return {
    price, prevClose, change, changePct, rows, maRows, osc,
    score, maScore, oscScore, rating, color, reasons: reasons.slice(0, 6),
    pivots, sma50: s50, above50: s50 !== null ? price > s50 : null,
    date: candles[n - 1].t, count: n
  };
}
function fmt(x) { return x === null || x === undefined || !isFinite(x) ? '—' : x.toLocaleString('en-US', { maximumFractionDigits: 2 }); }

/* Parse a Yahoo chart JSON payload into clean candles (closes non-null).
   NOTE: meta.regularMarketPrice is frozen at Jul 2024 for .KA symbols —
   price is ALWAYS derived from the candle series, never from meta. */
function parseYahoo(j) {
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp || !res.indicators || !res.indicators.quote) return null;
  const q = res.indicators.quote[0], ts = res.timestamp, out = [];
  for (let i = 0; i < ts.length; i++) {
    const cl = q.close[i];
    if (cl === null || cl === undefined) continue;
    out.push({
      t: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      o: q.open[i] !== null && q.open[i] !== undefined ? q.open[i] : cl,
      h: q.high[i] !== null && q.high[i] !== undefined ? q.high[i] : cl,
      l: q.low[i] !== null && q.low[i] !== undefined ? q.low[i] : cl,
      c: cl
    });
  }
  return out.length ? out : null;
}

/* ---------------- news sentiment (transparent keyword lists) ---------------- */
/* Documented word lists — a headline is tagged by simple keyword counts.
   This is a rough headline-mood check, NOT a prediction and NOT part of
   the technical score. */
const POS_WORDS = ['rises', 'rose', 'rising', 'gain', 'gains', 'gained', 'rally', 'rallies', 'record high', 'surplus', 'growth', 'grows', 'profit up', 'approval', 'approved', 'deal', 'recovery', 'recovers', 'recovered', 'bullish', 'jump', 'jumps', 'jumped', 'surge', 'surges', 'surged', 'climb', 'climbs', 'climbed', 'higher', 'boost', 'boosts', 'upgrade', 'upgraded', 'positive', 'strengthens', 'eases', 'falls to record low inflation'];
const NEG_WORDS = ['falls', 'fell', 'falling', 'drop', 'drops', 'dropped', 'decline', 'declines', 'declined', 'deficit', 'loss', 'losses', 'sell-off', 'selloff', 'plunge', 'plunges', 'plunged', 'slump', 'default', 'crisis', 'downgrade', 'downgraded', 'lower', 'negative', 'tumble', 'tumbles', 'sink', 'sinks', 'inflation up', 'rate hike', 'warning', 'fears', 'fear of'];
function sentimentOf(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  let p = 0, n = 0, hit = '';
  for (const w of POS_WORDS) if (t.includes(w)) { p++; if (!hit) hit = w; }
  for (const w of NEG_WORDS) if (t.includes(w)) { n++; if (!hit) hit = w; }
  return { tag: p > n ? 'Positive' : n > p ? 'Negative' : 'Neutral', p, n, hit };
}
/* Extract an official KSE-100 close from a news headline/description. */
function extractKse100(text) {
  const m = String(text || '').match(/KSE[\s-]?100[^0-9]{0,60}?(\d{2,3},\d{3}(?:\.\d{1,2})?)/i);
  return m ? m[1] : null;
}

const PSX_LIB = { analyzeCandles, parseYahoo, sentimentOf, extractKse100, smaArr, emaArr, rsiArr };
if (typeof module !== 'undefined' && module.exports) { module.exports = PSX_LIB; return; }

/* ============================ browser app ============================ */
const $ = id => document.getElementById(id);
const PROXY = 'https://api.allorigins.win/raw?url=';
const yahooUrl = s => PROXY + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/' + s + '.KA?range=1y&interval=1d');
/* Heavyweight basket — only symbols Yahoo Finance actually carries
   (verified live 23 Nov 2026; HUBC and ENGROH are NOT on Yahoo). */
const BASKET = ['FFC', 'OGDC', 'MCB', 'PPL', 'MARI', 'HBL', 'NBP', 'SNGP', 'UBL', 'MEBL', 'LUCK', 'SYS', 'EFERT', 'POL', 'PSO', 'BAHL'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let SYMBOLS = [], NEWS = [], basketDone = false, psxInit = false, currentSym = null;

function cacheGet(sym) {
  try { const raw = localStorage.getItem('psx_cache_' + sym); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function cacheSet(sym, candles) {
  try { localStorage.setItem('psx_cache_' + sym, JSON.stringify({ d: new Date().toISOString().slice(0, 10), candles })); } catch (e) { /* storage full — ignore */ }
}
async function fetchCandles(sym, tries) {
  tries = tries || 2;
  for (let a = 0; a < tries; a++) {
    try {
      const r = await fetch(yahooUrl(sym));
      if (r.status === 404) return { notFound: true };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.chart && j.chart.error) return { notFound: true };
      const candles = parseYahoo(j);
      if (candles && candles.length > 30) { cacheSet(sym, candles); return { candles, stale: false }; }
      throw new Error('empty');
    } catch (e) { if (a < tries - 1) await sleep(900); }
  }
  const cached = cacheGet(sym);
  if (cached && cached.candles && cached.candles.length > 30) return { candles: cached.candles, stale: true, staleDate: cached.d };
  return { error: true };
}

/* ---------------- market mood (basket) ---------------- */
async function loadBasket() {
  if (basketDone) return; basketDone = true;
  const results = [];
  for (const s of BASKET) {
    const r = await fetchCandles(s, 2);
    if (r.candles) { try { results.push({ s, a: analyzeCandles(r.candles), stale: r.stale }); } catch (e) { /* skip */ } }
    await sleep(350);
  }
  const box = $('psxMoodBody');
  if (!results.length) {
    box.innerHTML = '<p class="muted small">Could not load market data right now (the free data relay may be busy). Your saved data and the news below still work — try Refresh in a little while.</p>';
    return;
  }
  const above = results.filter(r => r.a.above50).length;
  const withTrend = results.filter(r => r.a.above50 !== null).length || results.length;
  const adv = results.filter(r => r.a.change > 0).length;
  const dec = results.filter(r => r.a.change < 0).length;
  const avgChg = results.reduce((a, r) => a + r.a.changePct, 0) / results.length;
  const pctAbove = above / withTrend;
  const breadth = (adv + dec) ? adv / (adv + dec) : 0.5;
  const chgScore = Math.max(0, Math.min(1, 0.5 + avgChg / 4));
  const mood = Math.round((0.5 * pctAbove + 0.3 * breadth + 0.2 * chgScore) * 100);
  const label = mood < 20 ? 'Very Weak' : mood < 40 ? 'Weak' : mood < 60 ? 'Mixed' : mood < 80 ? 'Strong' : 'Very Strong';
  const mColor = mood < 20 ? '#F6465D' : mood < 40 ? '#EE7A3A' : mood < 60 ? '#F0B90B' : mood < 80 ? '#93C94B' : '#0ECB81';
  const sentence =
    (pctAbove >= 0.5 ? 'Most big PSX stocks are above their 50-day average (uptrend)' : 'Most big PSX stocks are below their 50-day average (downtrend)') +
    ', and ' + (adv > dec ? 'more rose than fell last session' : adv < dec ? 'more fell than rose last session' : 'risers and fallers were even last session') +
    ' (average move ' + (avgChg >= 0 ? '+' : '') + avgChg.toFixed(2) + '%).';
  if (typeof drawGauge === 'function' && typeof SIG_BANDS !== 'undefined') drawGauge($('psxMoodGauge'), mood, SIG_BANDS, '#EAECEF');
  $('psxMoodValue').textContent = mood;
  const lbl = $('psxMoodLabel'); lbl.textContent = label; lbl.style.color = mColor;
  $('psxMoodNote').textContent = sentence;
  $('psxMoodStats').innerHTML =
    '<div class="stat"><span class="stat-val">' + above + '/' + withTrend + '</span><span class="stat-name">Above 50-day avg</span></div>' +
    '<div class="stat"><span class="stat-val up">' + adv + '</span><span class="stat-name">Rose</span></div>' +
    '<div class="stat"><span class="stat-val down">' + dec + '</span><span class="stat-name">Fell</span></div>' +
    '<div class="stat"><span class="stat-val">' + (avgChg >= 0 ? '+' : '') + avgChg.toFixed(2) + '%</span><span class="stat-name">Avg move</span></div>';
  const rows = results.slice().sort((a, b) => b.a.changePct - a.a.changePct).map(r =>
    '<button class="psx-basket-row" data-sym="' + r.s + '"><span class="psx-basket-sym">' + r.s + '</span>' +
    '<span class="psx-basket-price">Rs ' + fmt(r.a.price) + '</span>' +
    '<span class="coin-chg ' + (r.a.change >= 0 ? 'up' : 'down') + '">' + (r.a.change >= 0 ? '+' : '') + r.a.changePct.toFixed(2) + '%</span>' +
    '<span class="psx-basket-rating" style="color:' + r.a.color + '">' + r.a.rating + '</span></button>').join('');
  $('psxBasketList').innerHTML = rows;
  $('psxMoodUpdated').textContent = 'Basket of ' + results.length + ' heavyweights · data as of ' + results[0].a.date + (results.some(r => r.stale) ? ' · some rows are saved data' : '');
  $('psxBasketList').querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => openStock(b.dataset.sym)));
}

/* ---------------- news ---------------- */
async function fetchFeed(url, source) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('feed ' + r.status);
  const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
  return Array.from(xml.querySelectorAll('item')).map(it => ({
    title: (it.querySelector('title') || {}).textContent || '',
    link: (it.querySelector('link') || {}).textContent || '',
    date: (it.querySelector('pubDate') || {}).textContent || '',
    desc: ((it.querySelector('description') || {}).textContent || '').replace(/<[^>]+>/g, ' '),
    source
  })).filter(x => x.title);
}
function matchSymbols(text) {
  const found = [];
  const upper = ' ' + String(text).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ') + ' ';
  for (const it of SYMBOLS) {
    if (it.s.length >= 3 && upper.includes(' ' + it.s + ' ')) { found.push(it.s); continue; }
    const nameWords = it.n.replace(/\b(Limited|Ltd|Company|The|Pakistan)\b/gi, '').trim().split(/\s+/).slice(0, 2).join(' ');
    if (nameWords.length > 5 && String(text).toLowerCase().includes(nameWords.toLowerCase())) found.push(it.s);
    if (found.length >= 3) break;
  }
  return found;
}
async function loadNews() {
  let items = [];
  try { items = items.concat(await fetchFeed('https://www.dawn.com/feeds/business', 'Dawn')); } catch (e) { /* one feed down */ }
  try { items = items.concat(await fetchFeed('https://www.brecorder.com/feeds/markets', 'Business Recorder')); } catch (e) { /* one feed down */ }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  const seen = new Set(); NEWS = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 42);
    if (seen.has(key)) continue; seen.add(key);
    it.sent = sentimentOf(it.title + ' ' + it.desc);
    it.syms = matchSymbols(it.title + ' ' + it.desc);
    NEWS.push(it);
    if (NEWS.length >= 15) break;
  }
  const box = $('psxNewsList');
  if (!NEWS.length) {
    box.innerHTML = '<p class="muted small">News feeds could not be loaded right now. Read them directly: <a class="psx-link" href="https://www.dawn.com/business" target="_blank" rel="noopener">Dawn Business</a> · <a class="psx-link" href="https://www.brecorder.com/markets" target="_blank" rel="noopener">Business Recorder Markets</a></p>';
    return;
  }
  // Official KSE-100 close, when a headline reports it (labelled with its source)
  for (const it of NEWS) {
    const v = extractKse100(it.title) || extractKse100(it.desc);
    if (v) {
      $('psxKseRow').hidden = false;
      $('psxKseRow').innerHTML = 'Official KSE-100 close reported by ' + it.source + ': <b>' + v + '</b> <span class="muted">— from the headline “' + it.title.slice(0, 90) + '”</span>';
      break;
    }
  }
  const pos = NEWS.filter(x => x.sent.tag === 'Positive').length;
  const neg = NEWS.filter(x => x.sent.tag === 'Negative').length;
  $('psxNewsMood').textContent = 'News mood today: ' + (pos > neg ? 'mostly positive' : neg > pos ? 'mostly negative' : 'mixed') +
    ' (' + pos + ' positive, ' + neg + ' negative of ' + NEWS.length + ' headlines — a rough keyword check, kept separate from the technical score).';
  box.innerHTML = NEWS.map(it => {
    const when = it.date ? new Date(it.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    const chipCls = it.sent.tag === 'Positive' ? 'psx-chip-pos' : it.sent.tag === 'Negative' ? 'psx-chip-neg' : 'psx-chip-neu';
    const symChips = it.syms.map(s => '<button class="psx-sym-chip" data-sym="' + s + '">' + s + '</button>').join(' ');
    return '<div class="psx-news-item"><a class="psx-news-title" href="' + it.link + '" target="_blank" rel="noopener">' + escapeHtml(it.title) + '</a>' +
      '<div class="psx-news-meta"><span>' + it.source + (when ? ' · ' + when : '') + '</span>' +
      '<span class="psx-sent-chip ' + chipCls + '">' + it.sent.tag + '</span>' + symChips + '</div></div>';
  }).join('');
  box.querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => openStock(b.dataset.sym)));
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------------- directory + analyzer ---------------- */
function renderDirectory(q) {
  q = (q || '').trim().toLowerCase();
  const list = SYMBOLS.filter(it => !q || it.s.toLowerCase().includes(q) || it.n.toLowerCase().includes(q)).slice(0, 60);
  $('psxDirList').innerHTML = list.length ? list.map(it =>
    '<button class="coin-row" data-sym="' + it.s + '"><span class="coin-badge" style="background:#2B3139;color:#F0B90B">' + it.s.slice(0, 2) + '</span>' +
    '<span class="coin-main"><span class="coin-name">' + it.s + '</span><br><span class="coin-pair">' + escapeHtml(it.n) + '</span></span>' +
    '<span class="psx-dir-arrow">Analyze ›</span></button>').join('')
    : '<div class="empty-note">No stock matches “' + escapeHtml(q) + '”.</div>';
  $('psxDirList').querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => openStock(b.dataset.sym)));
  $('psxDirCount').textContent = SYMBOLS.length + ' listed companies · showing ' + list.length;
}
async function openStock(sym) {
  currentSym = sym;
  const meta = SYMBOLS.find(x => x.s === sym) || { s: sym, n: '' };
  const box = $('psxDetail');
  box.hidden = false;
  box.innerHTML = '<div class="card signal-card"><div class="card-head"><h2>' + sym + '</h2><span class="card-sub">' + escapeHtml(meta.n) + '</span></div><p class="muted small">Loading daily data…</p></div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const r = await fetchCandles(sym, 2);
  if (currentSym !== sym) return;
  if (r.notFound || r.error) {
    box.innerHTML = '<div class="card"><div class="card-head"><h2>' + sym + '</h2><span class="card-sub">' + escapeHtml(meta.n) + '</span></div>' +
      '<p class="small">No free daily data for this stock yet — the free Yahoo feed does not carry ' + sym + ' (this also affects a few big names like HUBC). No numbers are shown rather than fake ones.</p>' +
      '<p style="margin-top:10px"><a class="psx-btn" href="https://dps.psx.com.pk/company/' + sym + '" target="_blank" rel="noopener">See official quote on PSX Data Portal ›</a></p></div>';
    return;
  }
  const a = analyzeCandles(r.candles);
  const voteChip = v => '<span class="psx-vote ' + (v > 0 ? 'psx-vote-buy' : v < 0 ? 'psx-vote-sell' : 'psx-vote-neu') + '">' + (v > 0 ? 'Buy' : v < 0 ? 'Sell' : 'Neutral') + '</span>';
  const valFmt = row => row.fmt === 'diff' ? (row.value >= 0 ? '+' : '') + fmt(row.value) : row.fmt === '0' ? row.value.toFixed(0) : row.fmt === '2' ? row.value.toFixed(2) : fmt(row.value);
  const tableRows = a.rows.map(row => '<tr><td>' + row.name + '</td><td class="psx-num">' + valFmt(row) + '</td><td>' + voteChip(row.vote) + '</td></tr>').join('');
  const related = NEWS.filter(it => it.syms.includes(sym));
  box.innerHTML =
    '<div class="card signal-card"><div class="signal-top"><div>' +
    '<div class="signal-coin">' + sym + ' · PSX' + (r.stale ? ' · <span class="psx-stale">Saved data' + (r.staleDate ? ' · ' + r.staleDate : '') + '</span>' : '') + '</div>' +
    '<div class="signal-price">Rs ' + fmt(a.price) + '</div>' +
    '<div class="signal-change ' + (a.change >= 0 ? 'up' : 'down') + '">' + (a.change >= 0 ? '▲ +' : '▼ ') + fmt(Math.abs(a.change)) + ' (' + a.changePct.toFixed(2) + '%) · ' + a.date + '</div>' +
    '<div class="muted small" style="margin-top:4px">' + escapeHtml(meta.n) + '</div></div>' +
    '<svg id="psxStockGauge" viewBox="0 0 200 118" class="gauge small" aria-hidden="true"></svg></div>' +
    '<div class="signal-verdict"><span class="verdict-label" style="color:' + a.color + '">' + a.rating + '</span>' +
    '<span class="verdict-score">score ' + a.score.toFixed(2) + ' · MA ' + a.maScore.toFixed(2) + ' · Oscillators ' + a.oscScore.toFixed(2) + '</span></div>' +
    '<div class="signal-meter"><div class="signal-meter-fill" id="psxMeterFill"></div><div class="signal-meter-mid"></div></div>' +
    '<div class="meter-scale"><span>Strong Sell</span><span>Neutral</span><span>Strong Buy</span></div></div>' +
    '<div class="card"><div class="card-head"><h2>Why this rating?</h2><span class="card-sub">Plain-English reasons</span></div>' +
    '<ul class="why-list">' + a.reasons.map(x => '<li><span class="why-dot ' + (x.dir > 0 ? 'bull' : x.dir < 0 ? 'bear' : 'flat') + '"></span><span class="why-text">' + x.text + '</span></li>').join('') + '</ul></div>' +
    '<div class="card"><div class="card-head"><h2>Indicator votes</h2><span class="card-sub">TradingView-style · daily</span></div>' +
    '<table class="psx-table"><thead><tr><th>Indicator</th><th>Value</th><th>Vote</th></tr></thead><tbody>' + tableRows + '</tbody></table>' +
    '<p class="fineprint" style="text-align:left;margin-top:8px">How this works: 12 moving-average votes (price vs SMA/EMA 10–200, plus two crossovers) and 7 oscillator votes (RSI, Stochastic, CCI, MACD, Stochastic RSI, Williams %R, Momentum) using TradingView’s published conditions. The average maps to Strong Sell…Strong Buy with TradingView’s bands. It summarises the past — it is not a prediction.</p></div>' +
    '<div class="card"><div class="card-head"><h2>Key levels</h2><span class="card-sub">Classic pivot points · last session</span></div><div class="levels">' +
    '<div class="level-row"><span class="level-name res">Resistance 2</span><span class="level-val">Rs ' + fmt(a.pivots.r2) + '</span></div>' +
    '<div class="level-row"><span class="level-name res">Resistance 1</span><span class="level-val">Rs ' + fmt(a.pivots.r1) + '</span></div>' +
    '<div class="level-row"><span class="level-name">Pivot</span><span class="level-val">Rs ' + fmt(a.pivots.pp) + '</span></div>' +
    '<div class="level-row"><span class="level-name sup">Support 1</span><span class="level-val">Rs ' + fmt(a.pivots.s1) + '</span></div>' +
    '<div class="level-row"><span class="level-name sup">Support 2</span><span class="level-val">Rs ' + fmt(a.pivots.s2) + '</span></div>' +
    '</div></div>' +
    (related.length ? '<div class="card"><div class="card-head"><h2>In the news</h2><span class="card-sub">Headlines naming this company</span></div>' +
      related.map(it => '<div class="psx-news-item"><a class="psx-news-title" href="' + it.link + '" target="_blank" rel="noopener">' + escapeHtml(it.title) + '</a><div class="psx-news-meta"><span>' + it.source + '</span><span class="psx-sent-chip ' + (it.sent.tag === 'Positive' ? 'psx-chip-pos' : it.sent.tag === 'Negative' ? 'psx-chip-neg' : 'psx-chip-neu') + '">' + it.sent.tag + '</span></div></div>').join('') + '</div>' : '') +
    '<p style="margin:2px 0 14px"><a class="psx-btn" href="https://dps.psx.com.pk/company/' + sym + '" target="_blank" rel="noopener">Official quote &amp; filings on PSX Data Portal ›</a></p>';
  if (typeof drawGauge === 'function' && typeof SIG_BANDS !== 'undefined') drawGauge($('psxStockGauge'), (a.score + 1) / 2 * 100, SIG_BANDS, a.color);
  const fill = $('psxMeterFill');
  if (fill) { const pos = (a.score + 1) / 2 * 100; fill.style.left = Math.min(pos, 50) + '%'; fill.style.width = Math.abs(pos - 50) + '%'; }
}

/* ---------------- init (lazy, first PSX tab open) ---------------- */
async function initPsx() {
  if (psxInit) return; psxInit = true;
  try {
    const r = await fetch('psx-symbols.json');
    SYMBOLS = await r.json();
  } catch (e) { SYMBOLS = []; }
  renderDirectory('');
  $('psxSearch').addEventListener('input', e => renderDirectory(e.target.value));
  $('psxRefresh').addEventListener('click', () => { basketDone = false; $('psxBasketList').innerHTML = ''; loadBasket(); loadNews(); });
  loadBasket();
  loadNews();
}
document.querySelectorAll('[data-tab="psx"]').forEach(b => b.addEventListener('click', initPsx));
if (document.getElementById('tab-psx') && document.getElementById('tab-psx').classList.contains('active')) initPsx();
})();
