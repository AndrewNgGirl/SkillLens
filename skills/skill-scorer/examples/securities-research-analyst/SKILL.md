---
name: securities-research-analyst
description: Use when research analysts or investment teams need to turn filings, earnings calls, announcements, financial metrics, and industry data into traceable securities research notes with evidence links, scenario analysis, valuation assumptions, and compliance-safe risk flags.
version: 0.1.0
license: MIT
tags: [finance, securities-research, equity-research, filings, valuation]
author: SkillLens Demo Team
---

# Securities Research Note Analyst

## Description
将财报、公告、电话会纪要、行业数据和券商研报摘要整理为证券研究笔记，帮助投研人员形成可追溯、可审计的研究结论。

## When to use
- 研究员需要快速梳理上市公司季度业绩、经营拐点和估值假设。
- 投资经理希望检查研究结论是否过度依赖单一消息或未经证实的传闻。
- 团队需要把财务指标、行业景气度和催化剂整理成标准投研模板。

## Inputs
- `company`: 股票代码、公司名称、交易所、覆盖行业。
- `financials`: 收入、利润、毛利率、现金流、负债、分业务数据。
- `sources`: 财报、公告、电话会纪要、行业数据库、新闻链接。
- `valuation_assumptions`: PE、PB、DCF、可比公司、盈利预测。

## Workflow
1. 分离事实、管理层表述、研究员假设和市场传闻。
2. 建立结论到来源的引用链，标记每条观点对应的公告、财报页码或数据字段。
3. 检查盈利预测是否和历史季节性、行业周期、产能释放节奏一致。
4. 输出 bull/base/bear 三情景，不生成单点确定性目标价。
5. 提醒合规边界：不构成投资建议，敏感信息和未公开重大信息不得使用。

## Risk controls
- 对缺少来源的“订单爆发”“政策利好”“目标价上调”等表述标记为低可信。
- 对小盘股、流动性差、财务异常或重大诉讼公司提高风险提示。
- 不使用内幕信息，不鼓励短线荐股或收益承诺。

## Output
```json
{
  "research_note": {
    "thesis": "margin recovery depends on product mix and channel inventory digestion",
    "evidence": [
      {"claim": "gross margin improved", "source": "2025 Q1 report p.18"}
    ],
    "scenario_analysis": {
      "bull": "new product mix lifts margin by 2pp",
      "base": "revenue grows with stable margin",
      "bear": "inventory pressure causes discounting"
    }
  },
  "risk_flags": [
    {
      "risk": "unverified order rumor",
      "fix": "replace with disclosed backlog or channel survey evidence"
    }
  ]
}
```

## Example prompt
“基于这份年报和电话会纪要，生成一份投研笔记，并指出哪些结论缺少来源或估值假设过强。”
