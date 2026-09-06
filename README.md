# Swing Trading Toolkit 🇨🇦

Planning, sizing, journalling and reality-check tools for swing trading the Canadian market around a full-time job. Vanilla HTML/CSS/JS, zero dependencies, no build step. All data stays in your browser (localStorage) — nothing is sent anywhere.

**⚠️ Educational tools only.** Nothing in this project is investment, tax, or legal advice, and nothing recommends any security. Trading involves a substantial risk of loss — most active retail traders lose money. Verify tax and brokerage details with the CRA or a licensed professional.

## What's inside

- **Reality Check** — closed-form expectancy math plus a seeded, deterministic Monte Carlo (1,000 simulated trading years) showing what a weekly income target actually demands in capital, edge and drawdown tolerance.
- **Position Sizer** — entry/stop/target → shares, capped dollar risk, R:R, breakeven, concentration warnings, and an 8-point pre-trade checklist.
- **Trade Journal** — log trades, auto-computed P&L and R-multiples, win rate / expectancy / profit factor, equity curve, weekly P&L vs. target. CSV import/export. Stored in localStorage only.
- **Canada Playbook** — TSX mechanics and liquidity filters, TFSA/CRA cautions for active traders, the 30-day superficial-loss rule, broker landscape, an evening routine for trading around a 9–5, and a phased roadmap (paper trade → small size → scale on proven stats).
- **VCP One-Pager** (`vcp-plan.html`) — a printable one-page trading plan for the volatility contraction pattern on TSX daily charts: screening recipe, entry trigger, stop/management rules, and sizing worked for a small account. A template with rules — it names no securities.

## Run locally

Any static file server works:

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>. No install, no dependencies.
