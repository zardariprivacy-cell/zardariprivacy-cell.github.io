'use strict';
/* ================= TradePulse AI — Binance market analyzer ================= */

const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];

const COINS = [
  { symbol: 'BTCUSDT',  name: 'Bitcoin',   short: 'BTC',  color: '#F7931A' },
  { symbol: 'ETHUSDT',  name: 'Ethereum',  short: 'ETH',  color: '#627EEA' },
  { symbol: 'BNBUSDT',  name: 'BNB',       short: 'BNB',  color: '#F0B90B' },
  { symbol: 'SOLUSDT',  name: 'Solana',    short: 'SOL',  color: '#9945FF' },
  { symbol: 'XRPUSDT',  name: 'XRP',       short: 'XRP',  color: '#4AA8E0' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin',  short: 'DOGE', color: '#C2A633' },
  { symbol: 'ADAUSDT',  name: 'Cardano',   short: 'ADA',  color: '#3468D1' },
  { symbol: 'LINKUSDT', name: 'Chainlink', short: 'LINK', color: '#2A5ADA' },
  { symbol: 'MATICUSDT',name: 'Polygon',   short: 'MATIC',color: '#8247E5' },
  { symbol: 'LTCUSDT',  name: 'Litecoin',  short: 'LTC',  color: '#A6B9D0' },
];
const coinOf = s => COINS.find(c => c.symbol === s);

/* ---------------- state ---------------- */
const state = {
  tickers: {},            // symbol -> ticker/24hr json
  sparks: {},             // symbol -> [closes]
  watchlist: JSON.parse(localStorage.getItem('tradepulse_watchlist') || '[]'),
  analyzer: { symbol: 'BTCUSDT', tf: '1h', token: 0, candles: null, result: null },
  tab: 'market',
};

/* ---------------- helpers ---------------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toFixed(4);
}
function fmtPct(x) {
  if (x == null || isNaN(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function setLive(ok) {
  $('livePill').classList.toggle('off', !ok);
  $('liveText').textContent = ok ? 'LIVE' : 'RETRYING';
}

async function api(path) {
  let lastErr = null;
  for (const base of BASES) {
    try {
      const r = await fetch(base + path, { cache: 'no-store' });
      if (r.ok) { setLive(true); return await r.json(); }
      lastErr = new Error('HTTP ' + r.status);
    } catch (e) { lastErr = e; }
  }
  setLive(false);
  throw lastErr || new Error('network');
}

/* ---------------- math: indicators ---------------- */
function emaSeries(values, period) {
  const k = 2 / (period + 1), out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period; out[period - 1] = prev;
  for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
  return out;
}
const emaLast = (values, p) => { const s = emaSeries(values, p); return s[s.length - 1]; };

function rsiWilder(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

function macd(closes) {
  const e12 = emaSeries(closes, 12), e26 = emaSeries(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const valid = line.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (valid.length < 10) return null;
  const vals = valid.map(([v]) => v);
  const sig = emaSeries(vals, 9);
  const hist = vals.map((v, i) => sig[i] != null ? v - sig[i] : null);
  const hv = hist.filter(v => v != null);
  if (hv.length < 2) return null;
  return { hist: hv[hv.length - 1], histPrev: hv[hv.length - 2], line: vals[vals.length - 1] };
}

function bollinger(closes, period = 20, mult = 2) {
  if (closes.length < period) return null;
  const win = closes.slice(-period);
  const mid = win.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  const upper = mid + mult * sd, lower = mid - mult * sd;
  const price = closes[closes.length - 1];
  return { mid, upper, lower, pctB: upper === lower ? 0.5 : (price - lower) / (upper - lower) };
}

function swingLevels(candles, price) {
  const W = 5, highs = [], lows = [];
  for (let i = W; i < candles.length - W; i++) {
    let isH = true, isL = true;
    for (let j = i - W; j <= i + W; j++) {
      if (candles[j].h > candles[i].h) isH = false;
      if (candles[j].l < candles[i].l) isL = false;
    }
    if (isH) highs.push(candles[i].h);
    if (isL) lows.push(candles[i].l);
  }
  let resistance = highs.filter(h => h > price).sort((a, b) => a - b)[0];
  let support = lows.filter(l => l < price).sort((a, b) => b - a)[0];
  if (resistance == null) resistance = Math.max(...candles.map(c => c.h));
  if (support == null) support = Math.min(...candles.map(c => c.l));
  return { support, resistance };
}

/* ---------------- signal engine ----------------
   Transparent scoring, total clamped to -100..+100:
   Trend (EMA structure) ±30 · RSI ±22 · MACD ±20 ·
   Bollinger %B ±13 · Volume ±8 · Momentum ROC(10) ±7          */
function analyze(candles) {
  const closes = candles.map(c => c.c), vols = candles.map(c => c.v);
  const price = closes[closes.length - 1];
  const e20 = emaLast(closes, 20), e50 = emaLast(closes, 50), e200 = emaLast(closes, 200);
  const rsi = rsiWilder(closes);
  const mac = macd(closes);
  const bb = bollinger(closes);
  const why = [];
  let score = 0;
  const add = (pts, text) => {
    score += pts;
    why.push({ pts, text, dir: pts > 0 ? 'bull' : pts < 0 ? 'bear' : 'flat' });
  };

  /* trend ±30 */
  let trendPts = 0; const trendBits = [];
  if (e50 != null) { const p = price > e50 ? 10 : -10; trendPts += p; trendBits.push(price > e50 ? 'price is above its 50-period average (uptrend)' : 'price is below its 50-period average (downtrend)'); }
  if (e20 != null && e50 != null) { const p = e20 > e50 ? 10 : -10; trendPts += p; trendBits.push(e20 > e50 ? 'short-term trend (EMA 20) is above the medium trend (EMA 50)' : 'short-term trend (EMA 20) is below the medium trend (EMA 50)'); }
  if (e200 != null && e50 != null) { const p = e50 > e200 ? 10 : -10; trendPts += p; trendBits.push(e50 > e200 ? 'the long-term trend is up (EMA 50 above EMA 200)' : 'the long-term trend is down (EMA 50 below EMA 200)'); }
  add(trendPts, 'Trend: ' + trendBits.join('; ') + '.');

  /* RSI ±22 */
  if (rsi != null) {
    let p, note;
    if (rsi < 25)      { p = 22;  note = 'very oversold — price has fallen hard and fast; a bounce becomes likely'; }
    else if (rsi < 35) { p = 15;  note = 'oversold — sellers are getting exhausted'; }
    else if (rsi < 45) { p = 7;   note = 'on the weak side, but not extreme'; }
    else if (rsi < 55) { p = 0;   note = 'neutral — no push either way'; }
    else if (rsi < 65) { p = 6;   note = 'healthy momentum — buyers are in control, not yet extreme'; }
    else if (rsi < 75) { p = -6;  note = 'getting overbought — price has risen a lot; be careful chasing'; }
    else if (rsi < 85) { p = -14; note = 'overbought — a pullback becomes likely'; }
    else               { p = -22; note = 'extremely overbought — sharp reversals are common from here'; }
    add(p, `RSI is ${rsi.toFixed(0)} — ${note}.`);
  }

  /* MACD ±20 */
  if (mac) {
    const rising = mac.hist > mac.histPrev;
    let p, note;
    if (mac.hist > 0 && rising)       { p = 20;  note = 'momentum is positive and getting stronger'; }
    else if (mac.hist > 0)            { p = 9;   note = 'momentum is positive but slowing down'; }
    else if (mac.hist < 0 && rising)  { p = -9;  note = 'momentum is negative, but the selling pressure is fading'; }
    else                              { p = -20; note = 'momentum is negative and getting stronger'; }
    add(p, `MACD: ${note}.`);
  }

  /* Bollinger ±13 */
  if (bb) {
    const pct = bb.pctB; let p, note;
    if (pct < 0)        { p = 13;  note = 'price is below the lower Bollinger Band — stretched down, often snaps back'; }
    else if (pct < 0.15){ p = 8;   note = 'price is hugging the lower Bollinger Band — cheap relative to its recent range'; }
    else if (pct <= 0.85){ p = 0;  note = 'price is in the middle of its Bollinger range — nothing extreme'; }
    else if (pct <= 1)  { p = -8;  note = 'price is hugging the upper Bollinger Band — expensive relative to its recent range'; }
    else                { p = -13; note = 'price is above the upper Bollinger Band — stretched up, often snaps back'; }
    add(p, `Bollinger Bands: ${note}.`);
  }

  /* volume ±8 */
  const lastVol = vols[vols.length - 1];
  const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, vols.length - 1));
  const ratio = avgVol > 0 ? lastVol / avgVol : 1;
  const green = closes[closes.length - 1] >= candles[candles.length - 1].o;
  if (ratio >= 1.3)       add(green ? 8 : -8, `Volume is ${ratio.toFixed(1)}x its average and the last candle is ${green ? 'up' : 'down'} — ${green ? 'buyers are stepping in with force' : 'sellers are stepping in with force'}.`);
  else if (ratio >= 1.1)  add(green ? 4 : -4, `Volume is a bit above average (${ratio.toFixed(1)}x) on a${green ? 'n up' : ' down'} candle.`);
  else                    add(0, `Volume is normal (${ratio.toFixed(1)}x average) — no strong push from big traders.`);

  /* momentum ROC(10) ±7 */
  if (closes.length > 10) {
    const roc = (price / closes[closes.length - 11] - 1) * 100;
    let p = 0;
    if (roc >= 3) p = 7; else if (roc >= 1) p = 4; else if (roc <= -3) p = -7; else if (roc <= -1) p = -4;
    add(p, `Momentum: price moved ${roc >= 0 ? '+' : ''}${roc.toFixed(1)}% over the last 10 candles.`);
  }

  score = clamp(Math.round(score), -100, 100);
  const levels = swingLevels(candles, price);
  return { score, why, price, e20, e50, levels, rsi };
}

function verdictOf(score) {
  if (score >= 50)  return { label: 'Strong Buy',  color: '#0ECB81' };
  if (score >= 20)  return { label: 'Buy',         color: '#3FB68B' };
  if (score > -20)  return { label: 'Neutral',     color: '#B7BDC6' };
  if (score > -50)  return { label: 'Sell',        color: '#F2788A' };
  return              { label: 'Strong Sell', color: '#F6465D' };
}

/* ---------------- gauges (SVG) ---------------- */
function polar(cx, cy, r, pos) { // pos 0..100 -> left..right along semicircle
  const th = Math.PI * (1 - pos / 100);
  return [cx + r * Math.cos(th), cy - r * Math.sin(th)];
}
function arcPath(cx, cy, r, p0, p1) {
  const [x0, y0] = polar(cx, cy, r, p0), [x1, y1] = polar(cx, cy, r, p1);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function drawGauge(svg, pos, bands, needleColor) {
  const cx = 100, cy = 104, r = 82;
  let html = '';
  for (const [a, b, col] of bands) {
    html += `<path d="${arcPath(cx, cy, r, a, b)}" fill="none" stroke="${col}" stroke-width="13" opacity="0.9"/>`;
  }
  const [nx, ny] = polar(cx, cy, r - 20, clamp(pos, 0, 100));
  html += `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${needleColor}" stroke-width="4" stroke-linecap="round"/>`;
  html += `<circle cx="${cx}" cy="${cy}" r="8" fill="#1E2329" stroke="${needleColor}" stroke-width="3"/>`;
  svg.innerHTML = html;
}
const FNG_BANDS = [[0,25,'#F6465D'],[25,45,'#EE7A3A'],[45,55,'#F0B90B'],[55,75,'#93C94B'],[75,100,'#0ECB81']];
const SIG_BANDS = [[0,20,'#F6465D'],[20,40,'#F2788A'],[40,60,'#5B6672'],[60,80,'#3FB68B'],[80,100,'#0ECB81']];

/* ---------------- fear & greed ---------------- */
async function loadFng() {
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { cache: 'no-store' });
    const j = await r.json();
    const d = j.data && j.data[0];
    if (!d) return;
    const v = parseInt(d.value, 10);
    drawGauge($('fngGauge'), v, FNG_BANDS, '#EAECEF');
    $('fngValue').textContent = v;
    const lbl = $('fngLabel');
    lbl.textContent = d.value_classification;
    lbl.style.color = v < 25 ? '#F6465D' : v < 45 ? '#EE7A3A' : v < 55 ? '#F0B90B' : v < 75 ? '#93C94B' : '#0ECB81';
  } catch (e) { /* keep last / placeholder */ }
}

/* ---------------- market ---------------- */
function sparkSVG(closes) {
  if (!closes || closes.length < 2) return '<svg class="coin-spark"></svg>';
  const min = Math.min(...closes), max = Math.max(...closes), range = (max - min) || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1) * 64).toFixed(1)},${(24 - (c - min) / range * 22).toFixed(1)}`).join(' ');
  const col = closes[closes.length - 1] >= closes[0] ? '#0ECB81' : '#F6465D';
  return `<svg class="coin-spark" viewBox="0 0 64 26"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function coinRow(symbol, opts = {}) {
  const c = coinOf(symbol), t = state.tickers[symbol];
  const price = t ? parseFloat(t.lastPrice) : null;
  const chg = t ? parseFloat(t.priceChangePercent) : null;
  const starred = state.watchlist.includes(symbol);
  return `<button class="coin-row" data-symbol="${symbol}">
    <span class="coin-badge" style="background:${c.color}">${c.short[0]}</span>
    <span class="coin-main"><span class="coin-name">${c.name}</span><br><span class="coin-pair">${c.short} / USDT</span></span>
    ${opts.spark === false ? '' : `<span data-spark="${symbol}">${sparkSVG(state.sparks[symbol])}</span>`}
    <span class="coin-right">
      <span class="coin-price">$${fmtPrice(price)}</span><br>
      <span class="coin-chg ${chg >= 0 ? 'up' : 'down'}">${fmtPct(chg)}</span>
    </span>
    <span class="row-star" data-star="${symbol}" role="button" aria-label="Star ${c.name}">
      <svg viewBox="0 0 24 24" width="20" height="20"><path class="star-path ${starred ? 'on' : ''}" d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>
    </span>
  </button>`;
}

function renderMarket() {
  const present = COINS.filter(c => state.tickers[c.symbol]);
  $('marketList').innerHTML = present.length
    ? present.map(c => coinRow(c.symbol)).join('')
    : '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
  $('marketUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB');
  renderWatch();
}
function renderWatch() {
  const list = state.watchlist.filter(s => coinOf(s));
  $('watchEmpty').classList.toggle('show', list.length === 0);
  $('watchList').innerHTML = list.map(s => coinRow(s)).join('');
  $('watchUpdated').textContent = list.length ? 'Updated ' + new Date().toLocaleTimeString('en-GB') : '';
}

async function loadTickers() {
  const results = await Promise.allSettled(COINS.map(c => api(`/ticker/24hr?symbol=${c.symbol}`)));
  let ok = 0;
  results.forEach((r, i) => { if (r.status === 'fulfilled') { state.tickers[COINS[i].symbol] = r.value; ok++; } });
  if (ok) renderMarket();
  else if (!Object.keys(state.tickers).length) toast('Could not reach Binance — retrying…');
}
async function loadSparks() {
  const results = await Promise.allSettled(COINS.map(c => api(`/klines?symbol=${c.symbol}&interval=1h&limit=24`)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') state.sparks[COINS[i].symbol] = r.value.map(k => parseFloat(k[4]));
  });
  document.querySelectorAll('[data-spark]').forEach(el => {
    el.innerHTML = sparkSVG(state.sparks[el.getAttribute('data-spark')]);
  });
}

/* ---------------- watchlist ---------------- */
function toggleWatch(symbol) {
  const i = state.watchlist.indexOf(symbol);
  if (i >= 0) { state.watchlist.splice(i, 1); toast(coinOf(symbol).name + ' removed from watchlist'); }
  else { state.watchlist.push(symbol); toast(coinOf(symbol).name + ' added to watchlist'); }
  localStorage.setItem('tradepulse_watchlist', JSON.stringify(state.watchlist));
  renderMarket(); syncAnalyzerStar();
}

/* ---------------- analyzer ---------------- */
function renderChips() {
  $('coinChips').innerHTML = COINS.map(c =>
    `<button class="chip ${c.symbol === state.analyzer.symbol ? 'on' : ''}" data-chip="${c.symbol}">${c.short}</button>`).join('');
}
function syncAnalyzerStar() {
  $('analyzerStar').classList.toggle('on', state.watchlist.includes(state.analyzer.symbol));
}

async function loadAnalyzer() {
  const { symbol, tf } = state.analyzer;
  const token = ++state.analyzer.token;
  $('chartLoading').classList.remove('hide');
  let raw;
  try {
    raw = await api(`/klines?symbol=${symbol}&interval=${tf}&limit=300`);
  } catch (e) {
    if (token !== state.analyzer.token) return;
    $('chartLoading').textContent = 'Could not load ' + coinOf(symbol).short + ' — check connection and retry.';
    toast('Failed to load ' + coinOf(symbol).name + ' data');
    return;
  }
  if (token !== state.analyzer.token) return; // a newer request won
  const candles = raw.map(k => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }));
  state.analyzer.candles = candles;
  const res = analyze(candles);
  state.analyzer.result = res;
  renderAnalyzer(res, candles);
  $('chartLoading').classList.add('hide');
}

function renderAnalyzer(res, candles) {
  const c = coinOf(state.analyzer.symbol);
  const t = state.tickers[state.analyzer.symbol];
  const chg = t ? parseFloat(t.priceChangePercent) : null;
  $('signalCoin').textContent = `${c.short} / USDT · ${state.analyzer.tf}`;
  $('signalPrice').textContent = '$' + fmtPrice(res.price);
  const chgEl = $('signalChange');
  chgEl.textContent = chg == null ? '' : fmtPct(chg) + ' (24h)';
  chgEl.className = 'signal-change ' + (chg >= 0 ? 'up' : 'down');

  const v = verdictOf(res.score);
  drawGauge($('signalGauge'), (res.score + 100) / 2, SIG_BANDS, v.color);
  const lbl = $('verdictLabel'); lbl.textContent = v.label; lbl.style.color = v.color;
  $('verdictScore').textContent = `Score ${res.score > 0 ? '+' : ''}${res.score} / 100`;
  const fill = $('signalMeterFill');
  fill.style.background = v.color;
  if (res.score >= 0) { fill.style.left = '50%'; fill.style.width = (res.score / 2) + '%'; }
  else { fill.style.left = (50 + res.score / 2) + '%'; fill.style.width = (-res.score / 2) + '%'; }

  $('whyList').innerHTML = res.why.map(w =>
    `<li><span class="why-dot ${w.dir}"></span><span class="why-text">${w.text}</span>` +
    `<span class="why-pts ${w.dir === 'bull' ? 'up' : w.dir === 'bear' ? 'down' : 'muted'}">${w.pts > 0 ? '+' + w.pts : w.pts}</span></li>`).join('');

  const { support, resistance } = res.levels;
  $('resVal').textContent = '$' + fmtPrice(resistance);
  $('supVal').textContent = '$' + fmtPrice(support);
  $('resDist').textContent = ((resistance / res.price - 1) * 100).toFixed(1) + '% above price';
  $('supDist').textContent = ((1 - support / res.price) * 100).toFixed(1) + '% below price';
  const span = resistance - support;
  $('levelDot').style.left = (span > 0 ? clamp((res.price - support) / span * 100, 2, 98) : 50) + '%';

  drawChart(candles, res);
  syncAnalyzerStar();
}

/* ---------------- chart (canvas) ---------------- */
function drawChart(candles, res) {
  const canvas = $('chart');
  if (!canvas || !candles) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const view = candles.slice(-120);
  const closesAll = candles.map(c => c.c);
  const e20All = emaSeries(closesAll, 20), e50All = emaSeries(closesAll, 50);
  const off = candles.length - view.length;
  const padR = 56, padB = 16, padT = 8, plotW = W - padR - 4, plotH = H - padB - padT;
  const volH = plotH * 0.14, priceH = plotH - volH - 4;

  let min = Infinity, max = -Infinity, vMax = 0;
  view.forEach(c => { min = Math.min(min, c.l); max = Math.max(max, c.h); vMax = Math.max(vMax, c.v); });
  const pad = (max - min) * 0.06 || 1; min -= pad; max += pad;
  const x = i => 4 + (i + 0.5) * (plotW / view.length);
  const y = p => padT + (max - p) / (max - min) * priceH;
  const cw = Math.max(1, plotW / view.length * 0.62);

  /* grid + price labels */
  ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const p = min + (max - min) * g / 4, yy = y(p);
    ctx.strokeStyle = 'rgba(43,49,57,.55)'; ctx.beginPath(); ctx.moveTo(4, yy); ctx.lineTo(4 + plotW, yy); ctx.stroke();
    ctx.fillStyle = '#848E9C'; ctx.fillText(fmtPrice(p), 4 + plotW + 6, yy);
  }
  /* volume bars */
  view.forEach((c, i) => {
    const vh = vMax ? c.v / vMax * volH : 0;
    ctx.fillStyle = c.c >= c.o ? 'rgba(14,203,129,.4)' : 'rgba(246,70,93,.4)';
    ctx.fillRect(x(i) - cw / 2, padT + priceH + 4 + (volH - vh), cw, vh);
  });
  /* candles */
  view.forEach((c, i) => {
    const up = c.c >= c.o, col = up ? '#0ECB81' : '#F6465D';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x(i), y(c.h)); ctx.lineTo(x(i), y(c.l)); ctx.stroke();
    const yO = y(c.o), yC = y(c.c);
    ctx.fillRect(x(i) - cw / 2, Math.min(yO, yC), cw, Math.max(1.4, Math.abs(yC - yO)));
  });
  /* EMA lines */
  const drawLine = (series, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); let started = false;
    view.forEach((_, i) => {
      const v = series[off + i];
      if (v == null) return;
      const xx = x(i), yy = y(v);
      if (!started) { ctx.moveTo(xx, yy); started = true; } else ctx.lineTo(xx, yy);
    });
    ctx.stroke(); ctx.lineWidth = 1;
  };
  drawLine(e20All, '#F0B90B');
  drawLine(e50All, '#B18CFF');
  /* last price dashed line */
  const lp = view[view.length - 1].c, ly = y(lp);
  ctx.strokeStyle = 'rgba(234,236,239,.45)'; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(4, ly); ctx.lineTo(4 + plotW, ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#EAECEF'; ctx.fillText(fmtPrice(lp), 4 + plotW + 6, ly);
}

/* ---------------- navigation & events ---------------- */
function switchTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo({ top: 0 });
  if (name === 'analyzer' && state.analyzer.result) drawChart(state.analyzer.candles, state.analyzer.result);
  if (name === 'watchlist') renderWatch();
}
function openAnalyzer(symbol) {
  if (state.analyzer.symbol !== symbol) { state.analyzer.symbol = symbol; renderChips(); loadAnalyzer(); }
  switchTab('analyzer');
}

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.addEventListener('click', e => {
  const star = e.target.closest('[data-star]');
  if (star) { e.stopPropagation(); toggleWatch(star.getAttribute('data-star')); return; }
  const row = e.target.closest('[data-symbol]');
  if (row) { openAnalyzer(row.getAttribute('data-symbol')); return; }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    state.analyzer.symbol = chip.getAttribute('data-chip');
    renderChips(); loadAnalyzer();
  }
});
$('tfSegmented').addEventListener('click', e => {
  const b = e.target.closest('[data-tf]'); if (!b) return;
  document.querySelectorAll('#tfSegmented button').forEach(x => x.classList.toggle('on', x === b));
  state.analyzer.tf = b.dataset.tf; loadAnalyzer();
});
$('analyzerStar').addEventListener('click', () => toggleWatch(state.analyzer.symbol));

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.analyzer.result) drawChart(state.analyzer.candles, state.analyzer.result); }, 180);
});

/* ---------------- boot & loops ---------------- */
renderChips();
loadFng();
loadTickers().then(loadSparks);
loadAnalyzer();
setInterval(loadTickers, 15000);
setInterval(loadSparks, 60000);
setInterval(loadFng, 300000);
setInterval(() => { if (state.tab === 'analyzer') loadAnalyzer(); }, 30000);
