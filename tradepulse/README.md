# TradePulse AI — Binance Market Analyzer

A mobile-first web app (add it to your home screen and it behaves like an app) that watches the top USDT pairs on Binance and explains, in plain English, whether the market is leaning buy, sell, or neutral for each coin.

**Live data only** — prices come straight from the Binance public API (`data-api.binance.vision`, fallback `api.binance.com`); the market-mood gauge uses the free Fear & Greed Index from alternative.me. No account, no API key, no server: everything runs in the browser.

## Tabs

- **Market** — Fear & Greed gauge, live prices + 24h change + sparkline for BTC, ETH, BNB, SOL, XRP, DOGE, ADA, LINK, MATIC, LTC. Auto-refreshes every 15 seconds. Tap any coin to analyze it.
- **Analyzer** — pick a coin and timeframe (15m / 1h / 4h / 1d). Candlestick chart with EMA 20 / EMA 50 and volume, a signal gauge, a "Why this signal?" breakdown in simple words, and key support / resistance levels with distances.
- **Watchlist** — star coins anywhere; the list is saved on the device (localStorage) and shows live prices.

## How the signal score works

Every indicator votes with points. The total is clamped to **−100 … +100**:

| Component | Max points | Idea |
|---|---|---|
| Trend (price vs EMA 50, EMA 20 vs 50, EMA 50 vs 200) | ±30 | Is the coin in an uptrend or downtrend? |
| RSI (14) | ±22 | Oversold (low RSI) leans buy; overbought leans sell |
| MACD (12, 26, 9) | ±20 | Is momentum rising or falling, and which side of zero? |
| Bollinger Bands (20, 2) | ±13 | Price stretched far above/below its recent range tends to snap back |
| Volume trend | ±8 | Above-average volume confirms the last candle's direction |
| Momentum ROC (10) | ±7 | How much price moved over the last 10 candles |

Score → verdict: **≥ +50 Strong Buy · +20…+49 Buy · −19…+19 Neutral · −49…−20 Sell · ≤ −50 Strong Sell.**

Support and resistance are the nearest swing highs/lows (5-candle pivots) around the current price, so the levels shown are places price actually turned before.

## Files

`index.html` · `styles.css` · `app.js` · `manifest.json` · `icon.svg` / `icon-192.png` / `icon-512.png` — a fully static site, no build step. Serve the folder with any static host or open `index.html` from a local server.

## Disclaimer

Analysis only — **not financial advice**. Crypto is high risk and this score is a summary of public technical indicators, not a prediction. Never trade money you cannot afford to lose.
