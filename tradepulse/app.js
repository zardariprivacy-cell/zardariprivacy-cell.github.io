'use strict';
/* ================= TradePulse AI — Binance market analyzer ================= */

const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3'];
const LOGO_BASE = 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/svg/color/';

/* Known coin names / brand colors for the fallback letter badge.
   Anything not listed simply shows its base symbol — the full market
   comes from Binance, not from this table. */
const NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP',
  DOGE: 'Dogecoin', ADA: 'Cardano', LINK: 'Chainlink', LTC: 'Litecoin',
  DOT: 'Polkadot', AVAX: 'Avalanche', TRX: 'TRON', NEAR: 'Near Protocol',
  UNI: 'Uniswap', PEPE: 'Pepe', SHIB: 'Shiba Inu', POL: 'Polygon',
  ARB: 'Arbitrum', OP: 'Optimism', INJ: 'Injective', SUI: 'Sui', APT: 'Aptos',
  ATOM: 'Cosmos', FIL: 'Filecoin', XLM: 'Stellar', HBAR: 'Hedera',
  WIF: 'dogwifhat', BONK: 'Bonk', FET: 'Artificial Superintelligence Alliance',
  RENDER: 'Render', TAO: 'Bittensor', AAVE: 'Aave', MKR: 'Maker',
  CRV: 'Curve DAO', SNX: 'Synthetix', LDO: 'Lido DAO', ETC: 'Ethereum Classic',
  BCH: 'Bitcoin Cash', EOS: 'EOS', XTZ: 'Tezos', SAND: 'The Sandbox',
  MANA: 'Decentraland', AXS: 'Axie Infinity', THETA: 'Theta Network',
  ALGO: 'Algorand', VET: 'VeChain', ICP: 'Internet Computer', GRT: 'The Graph',
  RUNE: 'THORChain', SEI: 'Sei', TIA: 'Celestia', JUP: 'Jupiter',
  WLD: 'Worldcoin', PYTH: 'Pyth Network', ENS: 'Ethereum Name Service',
  GALA: 'Gala', IMX: 'Immutable', STX: 'Stacks', KAS: 'Kaspa', TON: 'Toncoin',
  XMR: 'Monero', ZEC: 'Zcash', DASH: 'Dash', COMP: 'Compound', YFI: 'yearn.finance',
  SUSHI: 'SushiSwap', ONE: 'Harmony', ZIL: 'Zilliqa', ENJ: 'Enjin Coin',
  BAT: 'Basic Attention Token', CHZ: 'Chiliz', HOT: 'Holo', RVN: 'Ravencoin',
  ONDO: 'Ondo', JASMY: 'JasmyCoin', FLOKI: 'Floki', LUNC: 'Terra Classic',
  USTC: 'TerraClassicUSD', FDUSD: 'First Digital USD', TUSD: 'TrueUSD',
  USDC: 'USD Coin', DAI: 'Dai', ENA: 'Ethena', PENDLE: 'Pendle',
  TURBO: 'Turbo', NEIRO: 'Neiro', POPCAT: 'Popcat', MEW: 'cat in a dogs world',
  BOME: 'BOOK OF MEME', W: 'Wormhole', ETHFI: 'ether.fi', IO: 'io.net',
  ZK: 'ZKsync', ZRO: 'LayerZero', LISTA: 'Lista DAO', BANANA: 'Banana Gun',
  RARE: 'SuperRare', BRETT: 'Brett', DEGEN: 'Degen', AERO: 'Aerodrome Finance',
};
const COLORS = {
  BTC: '#F7931A', ETH: '#627EEA', BNB: '#F0B90B', SOL: '#9945FF', XRP: '#4AA8E0',
  DOGE: '#C2A633', ADA: '#3468D1', LINK: '#2A5ADA', LTC: '#A6B9D0', DOT: '#E6007A',
  AVAX: '#E84142', TRX: '#FF0013', NEAR: '#00EC97', UNI: '#FF007A', ATOM: '#5063C5',
  ETC: '#34FA99', BCH: '#8DC351', XLM: '#7AD3F8', ALGO: '#4A90D9', VET: '#15BDFF',
  ICP: '#29ABE2', FIL: '#0090FF', HBAR: '#B9B9B9', SHIB: '#FFA409', PEPE: '#4C9641',
};

function hashColor(base) {
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) % 360;
  return `hsl(${h}, 62%, 52%)`;
}
const baseOf = symbol => symbol.replace(/USDT$/, '');
const colorFor = base => COLORS[base] || hashColor(base);
function metaFor(symbol) {
  const base = baseOf(symbol);
  return { symbol, base, name: NAMES[base] || base, color: colorFor(base) };
}

/* Leveraged tokens (BTCUP, ETHDOWN, ADABULL…) are not real coins — hide them.
   Rule: base ends in UP / DOWN / BULL / BEAR and is longer than 3 chars,
   so genuine short tickers like JUP are kept. */
function isLeveraged(base) {
  return base.length > 3 && /(UP|DOWN|BULL|BEAR)$/.test(base);
}

/* ---------------- state ---------------- */
function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
const state = {
  all: [],                // every USDT ticker (filtered), sorted by quoteVolume desc
  tickers: {},            // symbol -> ticker object (parsed numbers)
  sparks: {},             // symbol -> [closes] (top-20 only)
  sparkTop: [],           // symbols that get sparklines (top 20 by volume)
  watchlist: loadJSON('tradepulse_watchlist', []),
  alerts: loadJSON('tradepulse_alerts', []),
  portfolio: loadJSON('tradepulse_portfolio', []),
  query: '', sort: 'volume', showAll: false,
  pkr: null,
  analyzer: { symbol: 'BTCUSDT', tf: '1h', token: 0, candles: null, result: null },
  tab: 'market',
};
const saveWatchlist = () => localStorage.setItem('tradepulse_watchlist', JSON.stringify(state.watchlist));
const saveAlerts = () => localStorage.setItem('tradepulse_alerts', JSON.stringify(state.alerts));
const savePortfolio = () => localStorage.setItem('tradepulse_portfolio', JSON.stringify(state.portfolio));

/* ---------------- helpers ---------------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fmtPrice(p) {
  if (p == null || isNaN(p)) return '—';
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 0.01) return p.toFixed(4);
  if (p === 0) return '0';
  return p.toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
}
function fmtPct(x) {
  if (x == null || isNaN(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(2) + '%';
}
function fmtVol(v) {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}
function fmtMoney(v) {
  if (v == null || isNaN(v)) return '—';
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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

/* ---------------- coin logos (real icons, badge fallback) ---------------- */
function logoHTML(base, extra = '') {
  return `<img class="coin-logo ${extra}" src="${LOGO_BASE}${base.toLowerCase()}.svg" alt="${base}" loading="lazy" data-base="${base}" onerror="logoFail(this)">`;
}
window.logoFail = function (img) {
  const base = img.getAttribute('data-base') || '?';
  const s = document.createElement('span');
  s.className = img.className.replace('coin-logo', 'coin-badge');
  s.style.background = colorFor(base);
  s.textContent = base[0];
  img.replaceWith(s);
};

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

function stochastic(candles, period = 14, smooth = 3) {
  if (candles.length < period + smooth) return null;
  const ks = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].h > hh) hh = candles[j].h;
      if (candles[j].l < ll) ll = candles[j].l;
    }
    ks.push(hh === ll ? 50 : (candles[i].c - ll) / (hh - ll) * 100);
  }
  const last = ks.slice(-smooth);
  return last.reduce((a, b) => a + b, 0) / last.length;
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
   Transparent scoring, total clamped to -100..+100 (maxima sum to exactly 100):
   Trend (EMA structure) ±28 · RSI ±20 · MACD ±18 · Bollinger %B ±12 ·
   Volume ±8 · Stochastic (14,3) ±8 · Momentum ROC(10) ±6          */
function analyze(candles) {
  const closes = candles.map(c => c.c), vols = candles.map(c => c.v);
  const price = closes[closes.length - 1];
  const e20 = emaLast(closes, 20), e50 = emaLast(closes, 50), e200 = emaLast(closes, 200);
  const rsi = rsiWilder(closes);
  const mac = macd(closes);
  const bb = bollinger(closes);
  const stoch = stochastic(candles);
  const why = [];
  let score = 0;
  const add = (pts, text) => {
    score += pts;
    why.push({ pts, text, dir: pts > 0 ? 'bull' : pts < 0 ? 'bear' : 'flat' });
  };

  /* trend ±28 */
  let trendPts = 0; const trendBits = [];
  if (e50 != null) { const p = price > e50 ? 10 : -10; trendPts += p; trendBits.push(price > e50 ? 'price is above its 50-period average (uptrend)' : 'price is below its 50-period average (downtrend)'); }
  if (e20 != null && e50 != null) { const p = e20 > e50 ? 9 : -9; trendPts += p; trendBits.push(e20 > e50 ? 'short-term trend (EMA 20) is above the medium trend (EMA 50)' : 'short-term trend (EMA 20) is below the medium trend (EMA 50)'); }
  if (e200 != null && e50 != null) { const p = e50 > e200 ? 9 : -9; trendPts += p; trendBits.push(e50 > e200 ? 'the long-term trend is up (EMA 50 above EMA 200)' : 'the long-term trend is down (EMA 50 below EMA 200)'); }
  add(trendPts, 'Trend: ' + trendBits.join('; ') + '.');

  /* RSI ±20 */
  if (rsi != null) {
    let p, note;
    if (rsi < 25)      { p = 20;  note = 'very oversold — price has fallen hard and fast; a bounce becomes likely'; }
    else if (rsi < 35) { p = 14;  note = 'oversold — sellers are getting exhausted'; }
    else if (rsi < 45) { p = 6;   note = 'on the weak side, but not extreme'; }
    else if (rsi < 55) { p = 0;   note = 'neutral — no push either way'; }
    else if (rsi < 65) { p = 5;   note = 'healthy momentum — buyers are in control, not yet extreme'; }
    else if (rsi < 75) { p = -5;  note = 'getting overbought — price has risen a lot; be careful chasing'; }
    else if (rsi < 85) { p = -13; note = 'overbought — a pullback becomes likely'; }
    else               { p = -20; note = 'extremely overbought — sharp reversals are common from here'; }
    add(p, `RSI is ${rsi.toFixed(0)} — ${note}.`);
  }

  /* MACD ±18 */
  if (mac) {
    const rising = mac.hist > mac.histPrev;
    let p, note;
    if (mac.hist > 0 && rising)       { p = 18;  note = 'momentum is positive and getting stronger'; }
    else if (mac.hist > 0)            { p = 8;   note = 'momentum is positive but slowing down'; }
    else if (mac.hist < 0 && rising)  { p = -8;  note = 'momentum is negative, but the selling pressure is fading'; }
    else                              { p = -18; note = 'momentum is negative and getting stronger'; }
    add(p, `MACD: ${note}.`);
  }

  /* Bollinger ±12 */
  if (bb) {
    const pct = bb.pctB; let p, note;
    if (pct < 0)        { p = 12;  note = 'price is below the lower Bollinger Band — stretched down, often snaps back'; }
    else if (pct < 0.15){ p = 7;   note = 'price is hugging the lower Bollinger Band — cheap relative to its recent range'; }
    else if (pct <= 0.85){ p = 0;  note = 'price is in the middle of its Bollinger range — nothing extreme'; }
    else if (pct <= 1)  { p = -7;  note = 'price is hugging the upper Bollinger Band — expensive relative to its recent range'; }
    else                { p = -12; note = 'price is above the upper Bollinger Band — stretched up, often snaps back'; }
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

  /* stochastic ±8 */
  if (stoch != null) {
    let p, note;
    if (stoch < 10)      { p = 8;  note = 'deep in oversold territory — the fall is stretched, a bounce becomes likely'; }
    else if (stoch < 20) { p = 6;  note = 'oversold — price closed near the bottom of its 14-candle range'; }
    else if (stoch < 35) { p = 3;  note = 'on the weak side, near the bottom of its recent range'; }
    else if (stoch < 65) { p = 0;  note = 'in the middle of its recent range — nothing extreme'; }
    else if (stoch < 80) { p = -3; note = 'on the strong side, near the top of its recent range'; }
    else if (stoch < 90) { p = -6; note = 'overbought — price closed near the top of its 14-candle range'; }
    else                 { p = -8; note = 'deep in overbought territory — the rise is stretched, a pullback becomes likely'; }
    add(p, `Stochastic is ${stoch.toFixed(0)} — ${note}.`);
  }

  /* momentum ROC(10) ±6 */
  if (closes.length > 10) {
    const roc = (price / closes[closes.length - 11] - 1) * 100;
    let p = 0;
    if (roc >= 3) p = 6; else if (roc >= 1) p = 3; else if (roc <= -3) p = -6; else if (roc <= -1) p = -3;
    add(p, `Momentum: price moved ${roc >= 0 ? '+' : ''}${roc.toFixed(1)}% over the last 10 candles.`);
  }

  const rawScore = score;
  score = clamp(Math.round(score), -100, 100);
  const levels = swingLevels(candles, price);
  return { score, rawScore, parts: why.map(w => w.pts), why, price, e20, e50, levels, rsi, stoch };
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

/* ---------------- market: full Binance USDT list ---------------- */
function sparkSVG(closes) {
  if (!closes || closes.length < 2) return '<svg class="coin-spark"></svg>';
  const min = Math.min(...closes), max = Math.max(...closes), range = (max - min) || 1;
  const pts = closes.map((c, i) => `${(i / (closes.length - 1) * 64).toFixed(1)},${(24 - (c - min) / range * 22).toFixed(1)}`).join(' ');
  const col = closes[closes.length - 1] >= closes[0] ? '#0ECB81' : '#F6465D';
  return `<svg class="coin-spark" viewBox="0 0 64 26"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function starSVG(starred) {
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path class="star-path ${starred ? 'on' : ''}" d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z"/></svg>`;
}

function coinRowHTML(t) {
  const m = metaFor(t.symbol);
  const starred = state.watchlist.includes(t.symbol);
  const sparkCell = state.sparkTop.includes(t.symbol)
    ? `<span data-spark="${t.symbol}">${sparkSVG(state.sparks[t.symbol])}</span>`
    : '<span class="coin-spark"></span>';
  return `<button class="coin-row" data-symbol="${t.symbol}">
    ${logoHTML(m.base)}
    <span class="coin-main"><span class="coin-name">${m.name}</span><br><span class="coin-pair">${m.base} / USDT · Vol ${fmtVol(t.qv)}</span></span>
    ${sparkCell}
    <span class="coin-right">
      <span class="coin-price">$${fmtPrice(t.last)}</span><br>
      <span class="coin-chg ${t.chg >= 0 ? 'up' : 'down'}">${fmtPct(t.chg)}</span>
    </span>
    <span class="row-star" data-star="${t.symbol}" role="button" aria-label="Star ${m.name}">${starSVG(starred)}</span>
  </button>`;
}

function visibleTickers() {
  let list = state.all;
  if (state.query) {
    const q = state.query;
    list = list.filter(t => t.base.includes(q) || metaFor(t.symbol).name.toUpperCase().includes(q));
  }
  const sorted = [...list];
  if (state.sort === 'gainers') sorted.sort((a, b) => b.chg - a.chg);
  else if (state.sort === 'losers') sorted.sort((a, b) => a.chg - b.chg);
  else if (state.sort === 'az') sorted.sort((a, b) => a.base.localeCompare(b.base));
  else sorted.sort((a, b) => b.qv - a.qv);
  return sorted;
}

function stripChipHTML(t) {
  return `<button class="strip-chip" data-symbol="${t.symbol}">${logoHTML(t.base, 'logo-sm')}<span class="strip-base">${t.base}</span><span class="${t.chg >= 0 ? 'up' : 'down'}">${fmtPct(t.chg)}</span></button>`;
}

function renderMarket() {
  if (!state.all.length) return; // keep skeletons until first data lands
  /* stats strip */
  const gainers = state.all.filter(t => t.chg > 0).length;
  const losers = state.all.filter(t => t.chg < 0).length;
  const totalVol = state.all.reduce((a, t) => a + t.qv, 0);
  $('statPairs').textContent = state.all.length;
  $('statGainers').textContent = gainers;
  $('statLosers').textContent = losers;
  $('statVol').textContent = fmtVol(totalVol);
  /* gainers / losers strips (liquid pairs only) */
  const liquid = state.all.filter(t => t.qv > 1e6);
  const topG = [...liquid].sort((a, b) => b.chg - a.chg).slice(0, 5);
  const topL = [...liquid].sort((a, b) => a.chg - b.chg).slice(0, 5);
  $('gainersStrip').innerHTML = topG.length ? topG.map(stripChipHTML).join('') : '<span class="muted small">No data</span>';
  $('losersStrip').innerHTML = topL.length ? topL.map(stripChipHTML).join('') : '<span class="muted small">No data</span>';
  /* main list */
  const vis = visibleTickers();
  const cap = (state.query || state.showAll) ? vis.length : 100;
  const rows = vis.slice(0, cap);
  $('marketList').innerHTML = rows.length
    ? rows.map(coinRowHTML).join('')
    : '<div class="empty-note">No coins match your search.</div>';
  const wrap = $('showAllWrap');
  if (!state.query && !state.showAll && vis.length > 100) {
    wrap.hidden = false;
    $('showAllBtn').textContent = `Show all ${vis.length} pairs`;
  } else wrap.hidden = true;
  $('marketCount').textContent = `Showing ${rows.length} of ${vis.length} pairs · Binance public data · auto-refresh 15s · tap a coin to analyze it`;
  $('marketUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB');
}

function renderWatch() {
  const list = state.watchlist
    .map(s => state.tickers[s] || { symbol: s, base: baseOf(s), last: null, chg: null, qv: null });
  $('watchEmpty').classList.toggle('show', list.length === 0);
  $('watchList').innerHTML = list.map(coinRowHTML).join('');
  $('watchUpdated').textContent = list.length ? 'Updated ' + new Date().toLocaleTimeString('en-GB') : '';
}

async function loadTickers() {
  let arr;
  try {
    arr = await api('/ticker/24hr');
  } catch (e) {
    if (!state.all.length) toast('Could not reach Binance — retrying…');
    return;
  }
  const list = arr
    .filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({
      symbol: t.symbol, base: t.symbol.slice(0, -4),
      last: parseFloat(t.lastPrice), chg: parseFloat(t.priceChangePercent),
      qv: parseFloat(t.quoteVolume), high: parseFloat(t.highPrice),
      low: parseFloat(t.lowPrice), vol: parseFloat(t.volume),
    }))
    .filter(t => t.last > 0 && !isLeveraged(t.base))
    .sort((a, b) => b.qv - a.qv);
  state.all = list;
  state.tickers = {};
  list.forEach(t => { state.tickers[t.symbol] = t; });
  if (!state.sparkTop.length) state.sparkTop = list.slice(0, 20).map(t => t.symbol);
  renderMarket();
  renderWatch();
  renderPortfolio();
  buildChips();
  updateRange();
  renderConverter();
  renderAlerts();
  checkAlerts();
}

async function loadSparks() {
  if (!state.sparkTop.length) return;
  const syms = state.sparkTop;
  const results = await Promise.allSettled(syms.map(s => api(`/klines?symbol=${s}&interval=1h&limit=24`)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') state.sparks[syms[i]] = r.value.map(k => parseFloat(k[4]));
  });
  document.querySelectorAll('[data-spark]').forEach(el => {
    el.innerHTML = sparkSVG(state.sparks[el.getAttribute('data-spark')]);
  });
}

/* ---------------- watchlist ---------------- */
function toggleWatch(symbol) {
  const i = state.watchlist.indexOf(symbol);
  if (i >= 0) { state.watchlist.splice(i, 1); toast(metaFor(symbol).name + ' removed from watchlist'); }
  else { state.watchlist.push(symbol); toast(metaFor(symbol).name + ' added to watchlist'); }
  saveWatchlist();
  renderMarket(); renderWatch(); syncAnalyzerStar();
}

/* ---------------- analyzer ---------------- */
const FALLBACK_CHIPS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'LTCUSDT'];
function buildChips() {
  let syms = state.all.length ? state.all.slice(0, 12).map(t => t.symbol) : [...FALLBACK_CHIPS];
  if (!syms.includes(state.analyzer.symbol)) syms = [state.analyzer.symbol, ...syms].slice(0, 12);
  $('coinChips').innerHTML = syms.map(s =>
    `<button class="chip ${s === state.analyzer.symbol ? 'on' : ''}" data-chip="${s}">${baseOf(s)}</button>`).join('');
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
    $('chartLoading').textContent = 'Could not load ' + baseOf(symbol) + ' — check connection and retry.';
    toast('Failed to load ' + metaFor(symbol).name + ' data');
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
  const m = metaFor(state.analyzer.symbol);
  const t = state.tickers[state.analyzer.symbol];
  const chg = t ? t.chg : null;
  $('signalLogo').innerHTML = logoHTML(m.base, 'logo-md');
  $('signalCoin').textContent = `${m.base} / USDT · ${state.analyzer.tf}`;
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
  updateRange();
  renderConverter();
  renderAlerts();
}

/* 24h high/low range bar + volume, from the ticker for the analyzer coin */
function updateRange() {
  const t = state.tickers[state.analyzer.symbol];
  if (!t) return;
  $('rangeLow').textContent = '$' + fmtPrice(t.low);
  $('rangeHigh').textContent = '$' + fmtPrice(t.high);
  const span = t.high - t.low;
  $('rangeDot').style.left = (span > 0 ? clamp((t.last - t.low) / span * 100, 1, 99) : 50) + '%';
  $('rangeVol').textContent = fmtVol(t.qv);
}

/* ---------------- converter (USD + PKR) ---------------- */
async function loadPkr() {
  const cached = loadJSON('tradepulse_pkr', null);
  if (cached && cached.rate && Date.now() - cached.ts < 6 * 3600 * 1000) {
    state.pkr = cached.rate; renderConverter(); return;
  }
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    const j = await r.json();
    if (j && j.rates && j.rates.PKR) {
      state.pkr = j.rates.PKR;
      localStorage.setItem('tradepulse_pkr', JSON.stringify({ rate: state.pkr, ts: Date.now() }));
      renderConverter();
    }
  } catch (e) { /* USD-only mode, silently */ }
}
function analyzerPrice() {
  if (state.analyzer.result) return state.analyzer.result.price;
  const t = state.tickers[state.analyzer.symbol];
  return t ? t.last : null;
}
function renderConverter() {
  const price = analyzerPrice();
  $('convCoinLabel').textContent = baseOf(state.analyzer.symbol);
  const amt = parseFloat($('convAmount').value);
  if (price == null || isNaN(amt)) {
    $('convUsd').textContent = '—';
    $('convPkr').textContent = '—';
    return;
  }
  const usd = amt * price;
  $('convUsd').textContent = fmtMoney(usd);
  $('convPkrRow').style.display = state.pkr ? '' : 'none';
  if (state.pkr) $('convPkr').textContent = 'Rs ' + Math.round(usd * state.pkr).toLocaleString('en-US');
}

/* ---------------- price alerts ---------------- */
function renderAlerts() {
  const t = state.tickers[state.analyzer.symbol];
  $('alertPrice').textContent = t ? `${baseOf(t.symbol)} now $${fmtPrice(t.last)}` : '';
  const box = $('alertList');
  if (!state.alerts.length) {
    box.innerHTML = '<p class="muted small">No alerts set yet.</p>';
    return;
  }
  box.innerHTML = state.alerts.map(a => {
    const cur = state.tickers[a.symbol];
    return `<div class="alert-row">
      ${logoHTML(baseOf(a.symbol), 'logo-sm')}
      <span class="alert-main"><b>${baseOf(a.symbol)}</b> ${a.dir === 'above' ? 'rises above' : 'falls below'} $${fmtPrice(a.target)}</span>
      <span class="alert-cur">${cur ? 'now $' + fmtPrice(cur.last) : ''}</span>
      <button class="del-btn" data-del-alert="${a.id}" aria-label="Delete alert">×</button>
    </div>`;
  }).join('');
}
function createAlert() {
  const target = parseFloat($('alertTarget').value);
  const t = state.tickers[state.analyzer.symbol];
  if (!t) { toast('Price data not loaded yet — try again in a moment'); return; }
  if (!(target > 0)) { toast('Enter a target price first'); return; }
  const dir = target >= t.last ? 'above' : 'below';
  state.alerts.push({ id: Date.now(), symbol: state.analyzer.symbol, target, dir, lastPrice: t.last });
  saveAlerts();
  renderAlerts();
  toast(`Alert set: ${baseOf(t.symbol)} ${dir === 'above' ? 'rises above' : 'falls below'} $${fmtPrice(target)}`);
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
function checkAlerts() {
  if (!state.alerts.length) return;
  const fired = [];
  state.alerts = state.alerts.filter(a => {
    const t = state.tickers[a.symbol];
    if (!t) return true;
    const now = t.last;
    const prev = a.lastPrice != null ? a.lastPrice : now;
    const crossed = a.dir === 'above'
      ? (prev < a.target && now >= a.target)
      : (prev > a.target && now <= a.target);
    a.lastPrice = now;
    if (crossed) { fired.push(a); return false; }
    return true;
  });
  if (fired.length) {
    saveAlerts();
    fired.forEach(a => {
      const t = state.tickers[a.symbol];
      const msg = `${baseOf(a.symbol)} ${a.dir === 'above' ? 'rose above' : 'fell below'} $${fmtPrice(a.target)}${t ? ' — now $' + fmtPrice(t.last) : ''}`;
      toast('Price alert: ' + msg);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('TradePulse AI — price alert', { body: msg, icon: 'icon.svg' }); } catch (e) { /* ignore */ }
      }
    });
    renderAlerts();
  } else {
    saveAlerts(); // persist lastPrice tracking
  }
}

/* ---------------- paper portfolio ---------------- */
function renderPortfolio() {
  const sel = $('pfCoin');
  if (state.all.length && sel.options.length !== state.all.length) {
    const cur = sel.value;
    sel.innerHTML = state.all.map(t => `<option value="${t.symbol}">${t.base} / USDT — $${fmtPrice(t.last)}</option>`).join('');
    if (cur && state.tickers[cur]) sel.value = cur;
    prefillPfBuy();
  }
  let totalValue = 0, totalCost = 0, anyPriced = false;
  const rows = state.portfolio.map(h => {
    const t = state.tickers[h.symbol];
    const m = metaFor(h.symbol);
    const cost = h.qty * h.buy;
    let value = null, pl = null, plPct = null;
    if (t) {
      value = h.qty * t.last; pl = value - cost; plPct = cost > 0 ? pl / cost * 100 : 0;
      totalValue += value; totalCost += cost; anyPriced = true;
    }
    return `<div class="pf-row">
      ${logoHTML(m.base)}
      <span class="pf-main">
        <span class="coin-name">${m.name}</span><br>
        <span class="coin-pair">${h.qty} ${m.base} · bought @ $${fmtPrice(h.buy)}</span>
      </span>
      <span class="pf-right">
        ${value != null
          ? `<span class="coin-price">${fmtMoney(value)}</span><br><span class="coin-chg ${pl >= 0 ? 'up' : 'down'}">${pl >= 0 ? '+' : '−'}$${Math.abs(pl).toFixed(2)} (${fmtPct(plPct)})</span>`
          : '<span class="coin-price">—</span>'}
      </span>
      <button class="del-btn" data-del-holding="${h.id}" aria-label="Delete holding">×</button>
    </div>`;
  });
  $('pfList').innerHTML = rows.join('');
  $('pfEmpty').classList.toggle('show', state.portfolio.length === 0);
  if (state.portfolio.length && anyPriced) {
    const pl = totalValue - totalCost;
    const plPct = totalCost > 0 ? pl / totalCost * 100 : 0;
    $('pfTotalValue').textContent = fmtMoney(totalValue);
    const el = $('pfTotalPl');
    el.textContent = `${pl >= 0 ? '+' : '−'}$${Math.abs(pl).toFixed(2)} (${fmtPct(plPct)}) all time · practice only`;
    el.className = 'pf-pl ' + (pl >= 0 ? 'up' : 'down');
  } else if (state.portfolio.length) {
    $('pfTotalValue').textContent = '—';
    $('pfTotalPl').textContent = 'Waiting for live prices…';
    $('pfTotalPl').className = 'pf-pl';
  } else {
    $('pfTotalValue').textContent = '$0.00';
    $('pfTotalPl').textContent = 'Add a holding below to start practicing.';
    $('pfTotalPl').className = 'pf-pl';
  }
}
function prefillPfBuy() {
  const t = state.tickers[$('pfCoin').value];
  if (t) $('pfBuy').value = t.last;
}
function addHolding() {
  const symbol = $('pfCoin').value;
  const qty = parseFloat($('pfQty').value);
  const buy = parseFloat($('pfBuy').value);
  if (!symbol) { toast('Coin list is still loading — try again in a moment'); return; }
  if (!(qty > 0)) { toast('Enter a quantity'); return; }
  if (!(buy > 0)) { toast('Enter a buy price'); return; }
  state.portfolio.push({ id: Date.now(), symbol, qty, buy });
  savePortfolio();
  renderPortfolio();
  toast(`Added ${qty} ${baseOf(symbol)} to your paper portfolio`);
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
  if (name === 'portfolio') renderPortfolio();
}
function openAnalyzer(symbol) {
  if (state.analyzer.symbol !== symbol) {
    state.analyzer.symbol = symbol;
    buildChips(); loadAnalyzer();
  }
  switchTab('analyzer');
}

document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.addEventListener('click', e => {
  const delAlert = e.target.closest('[data-del-alert]');
  if (delAlert) {
    state.alerts = state.alerts.filter(a => a.id !== +delAlert.getAttribute('data-del-alert'));
    saveAlerts(); renderAlerts(); toast('Alert deleted');
    return;
  }
  const delHolding = e.target.closest('[data-del-holding]');
  if (delHolding) {
    state.portfolio = state.portfolio.filter(h => h.id !== +delHolding.getAttribute('data-del-holding'));
    savePortfolio(); renderPortfolio(); toast('Holding removed');
    return;
  }
  const star = e.target.closest('[data-star]');
  if (star) { e.stopPropagation(); toggleWatch(star.getAttribute('data-star')); return; }
  const row = e.target.closest('[data-symbol]');
  if (row) { openAnalyzer(row.getAttribute('data-symbol')); return; }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    state.analyzer.symbol = chip.getAttribute('data-chip');
    buildChips(); loadAnalyzer();
  }
});
$('tfSegmented').addEventListener('click', e => {
  const b = e.target.closest('[data-tf]'); if (!b) return;
  document.querySelectorAll('#tfSegmented button').forEach(x => x.classList.toggle('on', x === b));
  state.analyzer.tf = b.dataset.tf; loadAnalyzer();
});
$('analyzerStar').addEventListener('click', () => toggleWatch(state.analyzer.symbol));

/* market tools */
let searchTimer = null;
$('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim().toUpperCase();
    renderMarket();
  }, 120);
});
$('sortChips').addEventListener('click', e => {
  const b = e.target.closest('[data-sort]'); if (!b) return;
  document.querySelectorAll('#sortChips button').forEach(x => x.classList.toggle('on', x === b));
  state.sort = b.dataset.sort;
  renderMarket();
});
$('showAllBtn').addEventListener('click', () => { state.showAll = true; renderMarket(); });

/* converter + alerts + portfolio controls */
$('convAmount').addEventListener('input', renderConverter);
$('alertBtn').addEventListener('click', createAlert);
$('pfCoin').addEventListener('change', prefillPfBuy);
$('pfAdd').addEventListener('click', addHolding);

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.analyzer.result) drawChart(state.analyzer.candles, state.analyzer.result); }, 180);
});

/* ---------------- boot & loops ---------------- */
buildChips();
renderAlerts();
renderPortfolio();
loadFng();
loadPkr();
loadTickers().then(loadSparks);
loadAnalyzer();
setInterval(loadTickers, 15000);
setInterval(loadSparks, 60000);
setInterval(loadFng, 300000);
setInterval(loadPkr, 3600000);
setInterval(() => { if (state.tab === 'analyzer') loadAnalyzer(); }, 30000);
