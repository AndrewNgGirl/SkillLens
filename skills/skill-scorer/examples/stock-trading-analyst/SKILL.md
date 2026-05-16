---
name: stock-trading-analyst
description: Use when the user needs an A-share stock watchlist, short-term theme rotation review, or trading-plan risk audit based on user-provided market data. Produces evidence-based sector analysis, signal confidence, risk warnings, and a non-advisory action checklist for retail investors, research assistants, and trading educators.
version: 0.1.0
license: MIT
tags: [finance, stock, trading, a-share, risk-control]
author: SkillLens Demo Team
---

# stock-trading-analyst

## When to use

Use this skill when the user provides A-share market data and asks for:

- 今日题材轮动、涨停归因、资金生态分析
- 短线候选股筛选、观察池复盘、交易计划风控检查
- 个股异动原因拆解、板块强弱比较、情绪周期研判
- "帮我看看这批股票哪个更值得观察"

**Not suitable for**:直接给出买入 / 卖出指令、承诺收益、代客理财、荐股收费、绕过投顾合规要求、处理内幕信息或未授权账户数据。

## Target users

- 有基础交易经验、需要结构化复盘的 A 股短线投资者
- 金融自媒体 / 投教团队，用于把盘面数据转成可解释的复盘框架
- 证券研究助理，用于整理公开市场数据、生成观察清单初稿
- 量化或半自动交易团队，用于人工复核前的信号解释层

Estimated frequency: daily after market close, plus intraday review during high-volatility sessions.

## Value proposition

Most generic LLM stock prompts jump directly to "看好 / 不看好" and ignore evidence quality, position risk, data freshness, and compliance boundaries. This skill focuses on **decision support, not trading instruction**:

- separates market facts, inferred signals, assumptions, and risks;
- scores signal confidence instead of pretending certainty;
- keeps high-risk outputs behind a human-review checklist;
- uses schema validation so reports can be compared across days;
- explicitly refuses return promises and direct personalized investment advice.

Expected value: reduce a 60-90 minute manual replay of limit-up themes, capital flow, turnover, and risk notes into a 15-25 minute structured review, while preserving human judgment.

## Inputs

| Field | Type | Required | Notes |
|---|---|---:|---|
| `market_date` | string | yes | Trading date, e.g. `2026-05-07` |
| `universe` | enum | yes | `a_share`, `hk_stock`, `us_stock`; MVP tuned for `a_share` |
| `rows` | array | yes | User-provided table rows; one row per stock or concept |
| `scenario` | enum | optional | `theme_rotation`, `watchlist`, `risk_audit`, `education` |
| `risk_profile` | enum | optional | `conservative`, `balanced`, `aggressive`; defaults to `balanced` |
| `holding_context` | object | optional | Positions, cost basis, or target watchlist; do not include account credentials |

Recommended row fields:

```json
{
  "code": "000001",
  "name": "示例股份",
  "concepts": ["AI应用", "金融科技"],
  "price_change_pct": 7.2,
  "turnover_rate": 18.5,
  "volume_ratio": 2.6,
  "net_inflow_cny": 125000000,
  "limit_up_reason": "题材催化 + 资金回流",
  "news": ["公告摘要或公开新闻链接"],
  "data_source": "user_upload",
  "timestamp": "2026-05-07T15:10:00+08:00"
}
```

## Workflow

1. **Validate input**: check required fields, timestamp freshness, duplicated codes, abnormal values, and missing data source.
2. **Classify scenario**: infer whether the user wants theme rotation, watchlist screening, risk audit, or education; ask a follow-up question if ambiguous.
3. **Normalize evidence**: separate objective fields (涨幅、换手、量比、资金净额), user notes, public news, and model inference.
4. **Theme rotation analysis**: rank concepts by breadth, limit-up strength, capital inflow, turnover sustainability, and intraday consistency.
5. **Candidate scoring**: score each candidate on signal strength, liquidity, catalyst clarity, crowding risk, and data confidence.
6. **Risk and compliance gate**: detect direct advisory wording, overconfident return claims, high volatility, illiquidity, ST / delisting risk, single-source evidence, and missing human review.
7. **Generate report**: output JSON following `assets/stock_signal.schema.json`, plus a concise markdown summary for humans.
8. **Validate output**: run `scripts/validate_signal.py` against the JSON schema. If validation fails twice, return `_schema_failed: true` and list the validation errors.

## Analysis framework

### Scenario fit

The skill must state whether it is doing:

- `theme_rotation`: sector / concept-level review;
- `watchlist`: candidate observation list, not buy recommendations;
- `risk_audit`: checks an existing trading plan for missing stops, data weaknesses, concentration, and compliance issues;
- `education`: explains the market logic without personalized advice.

### Signal dimensions

| Dimension | What to inspect | Common failure |
|---|---|---|
| Catalyst clarity | 公告、政策、财报、行业事件是否能解释异动 | 只有传闻或社媒情绪 |
| Capital confirmation | 资金净额、量比、成交额是否支持题材强度 | 缩量上涨或尾盘脉冲 |
| Breadth | 同题材涨停 / 大涨个股数量与梯队结构 | 单一孤立个股 |
| Liquidity | 成交额、换手率、封单质量、滑点风险 | 小票极端换手 |
| Crowding risk | 连板高度、情绪一致性、加速后分歧 | 追高风险被忽略 |
| Data confidence | 来源、时间戳、口径一致性 | 数据过期或无法追溯 |

### Risk controls

- Always say: "This is decision support, not personalized investment advice."
- Never output "buy now", "must buy", "guaranteed", "稳赚", "目标价必到".
- For high-volatility or illiquid names, require human review before action.
- If data is older than the current trading session, downgrade confidence.
- If only one source supports a conclusion, mark it as `low_confidence`.
- If the user asks for direct trade instruction, convert the response into a risk checklist and explain the boundary.

## Outputs

Return strict JSON first, then an optional short markdown explanation.

```json
{
  "market_date": "2026-05-07",
  "scenario": "watchlist",
  "summary": "AI应用与金融科技有资金回流，但高位股拥挤度上升。",
  "risk_disclaimer": "This is decision support, not personalized investment advice.",
  "theme_rankings": [
    {
      "theme": "AI应用",
      "score": 82,
      "evidence": ["涨停家数增加", "资金净流入居前"],
      "risks": ["高位分歧扩大", "新闻催化持续性待验证"],
      "confidence": 0.78
    }
  ],
  "watchlist": [
    {
      "code": "000001",
      "name": "示例股份",
      "role": "观察池候选",
      "signal_score": 76,
      "risk_level": "medium",
      "evidence": ["换手率 18.5%", "量比 2.6", "题材内强度靠前"],
      "invalidations": ["跌破关键均线", "题材资金连续两日流出"],
      "human_review_required": true
    }
  ],
  "data_quality": {
    "freshness": "same_session",
    "source_count": 2,
    "missing_fields": [],
    "confidence": 0.8
  }
}
```

## Dependencies

| Name | Type | Paid? | Approx cost / call |
|---|---|---:|---:|
| User-uploaded market table | Data | no | $0 |
| Optional public news links | Data | maybe | depends on source |
| `jsonschema` | Python package | no | $0 |
| LLM provider configured by host | API | yes | depends on model |

No broker API or trading account permission is required. This skill should not place orders.

## Determinism

- Input validation and schema validation are deterministic.
- Theme ranking uses transparent weighted dimensions before LLM explanation.
- LLM output must include `confidence` and cite the exact input fields used as evidence.
- Same input table + same scenario should produce the same ranked themes within a small tolerance; if rankings differ, explain which evidence changed.

## Failure handling

- Missing timestamp → mark data freshness as `unknown` and downgrade all confidence by at least 0.15.
- Missing data source → do not produce high-confidence signals.
- Contradictory fields (e.g. high inflow but very weak turnover) → surface as conflict rather than hiding it.
- User asks for direct buy/sell → refuse direct instruction and provide a risk checklist instead.
- Schema validation failure → retry once; if still invalid, return `_schema_failed: true` with errors.

## Privacy and compliance

Do not ask for brokerage passwords, full account numbers, ID cards, phone numbers, or private order records. If the user includes sensitive account data, summarize only non-sensitive aggregates and warn them to remove credentials.

This skill does not provide licensed investment advice. It provides structured analysis of user-provided public or self-owned data for education, research, and decision-support purposes.

## Example

User:

```text
请基于我上传的今日涨停分析表，筛选 5 个明天值得观察的 AI 应用方向候选股。
```

Assistant output:

```text
我可以生成观察池和风险清单，但不会给出买入指令。请确认数据时间戳与来源。
```

Then return the JSON report described above.

## Files

- `assets/stock_signal.schema.json` — output schema for machine validation
- `scripts/validate_signal.py` — deterministic JSON schema validator
- `references/risk-policy.md` — risk, compliance, and refusal policy
- `references/scoring-model.md` — transparent signal scoring model
- `tests/sample_market_rows.json` — demo input table for regression tests

## Changelog

- `0.1.0` — initial finance expert demo for A-share stock watchlist and theme rotation review
