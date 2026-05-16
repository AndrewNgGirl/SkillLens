# Transparent Signal Scoring Model

The score is not a trading instruction. It is a structured way to compare candidates for human review.

## Candidate Signal Score

Total: 100 points.

| Dimension | Weight | Notes |
|---|---:|---|
| Catalyst clarity | 20 | Public, traceable reason for movement |
| Theme strength | 18 | Breadth, ladder structure, limit-up quality |
| Capital confirmation | 16 | Net inflow, volume ratio, turnover sustainability |
| Liquidity quality | 12 | Tradability, slippage, abnormal small-cap risk |
| Risk-adjusted setup | 14 | Crowding, high-position divergence, volatility |
| Data confidence | 10 | Source count, freshness, missing fields |
| Explainability | 10 | Clear invalidation and counter-evidence |

## Confidence Downgrades

Apply downgrades after the raw score:

- stale data: -10 to -20 points;
- one-source evidence: -8 to -15 points;
- no timestamp: -10 points;
- direct rumor without public confirmation: cap at 60;
- critical compliance risk: cap at 50.

## Risk Level

- `low`: score >= 80 and no major risk flags;
- `medium`: score >= 65 or moderate volatility / evidence gaps;
- `high`: score >= 50 but high volatility, crowding, or missing evidence;
- `critical`: manipulation, insider-info, delisting, or direct-advice risk.

## Human Review Checklist

Before the user acts on any output, they should verify:

- latest price, liquidity, and suspension status;
- public announcement / news source;
- sector breadth and same-theme follow-through;
- personal suitability and position sizing;
- invalidation condition and stop plan.
