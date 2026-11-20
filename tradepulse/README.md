# TradePulse AI — Binance Market Analyzer

A mobile-first web app (add it to your home screen and it behaves like an app) that watches **every USDT spot pair on Binance** and explains, in plain English, whether the market is leaning buy, sell, or neutral for each coin.

**Live data only** — prices come straight from the Binance public API (`data-api.binance.vision`, fallback `api.binance.com`); the market-mood gauge uses the free Fear & Greed Index from alternative.me, and the converter's PKR rate comes from open.er-api.com. No account, no API key, no server: everything runs in the browser.

## Tabs

- **Market** — Fear & Greed gauge; market stats (pair count, gainers vs losers, total 24h volume); Top Gainers / Top Losers strips; and the **full list of Binance USDT pairs** (300+) with real coin logos, live price, 24h change and 24h volume. Search by coin name or symbol, sort by Volume / Gainers / Losers / A–Z. The top 20 pairs by volume also get sparklines. Leveraged tokens (BTCUP, ETHDOWN, …) are filtered out — they are not real coins. Auto-refreshes every 15 seconds. Tap any coin to analyze it.
- **Analyzer** — pick any coin and timeframe (15m / 1h / 4h / 1d / 1w). Candlestick chart with EMA 20 / EMA 50 and volume, a signal gauge, a "Why this signal?" breakdown in simple words, key support / resistance levels, a 24h high/low range bar with 24h volume, a **converter** (coin → USD and PKR at the live price), and **price alerts**.
- **Watchlist** — star coins anywhere; the list is saved on the device (localStorage) and shows live prices.
- **Portfolio** — a **paper portfolio (practice only, not real money)**: add holdings with quantity and buy price, and watch live value and profit/loss update with Binance prices. Saved on the device.

## Price alerts

In the Analyzer, enter a target price and tap **Set alert** — the direction (rises above / falls below) is picked automatically from the current price. Alerts are stored on the device and checked on every 15-second refresh while the page is open. When the price crosses the target, you get an in-app message and, if you granted permission, a browser notification. Alerts are one-shot: once triggered, they are removed.

## How the signal score works

Every indicator votes with points. The maxima sum to exactly 100 and the total is clamped to **−100 … +100**:

| Component | Max points | Idea |
|---|---|---|
| Trend (price vs EMA 50, EMA 20 vs 50, EMA 50 vs 200) | ±28 | Is the coin in an uptrend or downtrend? |
| RSI (14) | ±20 | Oversold (low RSI) leans buy; overbought leans sell |
| MACD (12, 26, 9) | ±18 | Is momentum rising or falling, and which side of zero? |
| Bollinger Bands (20, 2) %B | ±12 | Price stretched far above/below its recent range tends to snap back |
| Volume trend | ±8 | Above-average volume confirms the last candle's direction |
| Stochastic (14, 3) | ±8 | Oversold (low %K) leans buy; overbought leans sell |
| Momentum ROC (10) | ±6 | How much price moved over the last 10 candles |

Score → verdict: **≥ +50 Strong Buy · +20…+49 Buy · −19…+19 Neutral · −49…−20 Sell · ≤ −50 Strong Sell.**

Support and resistance are the nearest swing highs/lows (5-candle pivots) around the current price, so the levels shown are places price actually turned before.

## Coin logos

Real coin icons load from the `cryptocurrency-icons` set on jsDelivr (`svg/color/{symbol}.svg`). If a coin has no icon there, the app falls back to a colored letter badge in the coin's brand color, so every row always shows something sensible.

## Files

`index.html` · `styles.css` · `app.js` · `manifest.json` · `icon.svg` / `icon-192.png` / `icon-512.png` — a fully static site, no build step. Serve the folder with any static host or open `index.html` from a local server.

## Disclaimer

Analysis only — **not financial advice**. Crypto is high risk and this score is a summary of public technical indicators, not a prediction. The Portfolio tab is a paper (practice) portfolio — no real money is involved anywhere in this app. Never trade money you cannot afford to lose.
