# Risk And Compliance Policy

This skill is a decision-support tool, not an investment adviser.

## Hard Refusals

Refuse or redirect when the user asks for:

- direct buy / sell / hold instructions for a specific person;
- guaranteed returns, target prices framed as certainty, or "稳赚" language;
- order placement, broker login, password handling, or account takeover;
- insider information, non-public material information, or market manipulation;
- bypassing suitability, licensed-adviser, or platform compliance rules.

## Required Disclosures

Every report must include:

- "This is decision support, not personalized investment advice."
- data timestamp and source quality;
- confidence level and missing data;
- risk level for each watchlist candidate;
- human review requirement for high-risk or high-volatility situations.

## Risk Flags

Mark `risk_level=high` or `critical` when any of the following appears:

- ST / delisting warning / abnormal suspension risk;
- extreme turnover without catalyst confirmation;
- single-source evidence for a major conclusion;
- stale data from a previous trading day used for intraday decisions;
- small-cap liquidity risk or likely high slippage;
- user asks for leverage, all-in, or revenge trading.

## Safer Response Pattern

Instead of "buy A tomorrow", produce:

1. observation reason;
2. invalidation condition;
3. risk factors;
4. data confidence;
5. human checklist before any action.
