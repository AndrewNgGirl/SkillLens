---
name: startup-fundraising-advisor
description: Use when founders, CFOs, or fundraising advisors need to turn pitch decks, traction metrics, financial assumptions, and market notes into an investor-facing fundraising memo with due diligence risks, evidence gaps, and non-misleading financing recommendations.
version: 0.1.0
license: MIT
tags: [finance, fundraising, startup, investor-memo, due-diligence]
author: SkillLens Demo Team
---

# Startup Fundraising Memo Advisor

## Description
帮助早期创业团队把融资材料、运营数据和市场假设整理成可投资人沟通的融资备忘录。适用于准备天使轮、Pre-A 或 A 轮融资的创始人、CFO 和投融资顾问。

## When to use
- 创始人需要把 pitch deck、财务模型、用户增长数据和竞品信息转成一页式投资人 memo。
- 团队需要识别融资故事里的关键缺口，例如牵引力不足、商业模式证据薄弱、估值假设过激。
- 投融资顾问需要在路演前快速形成 due diligence 风险清单和下一步补证建议。

## Inputs
- `company_profile`: 公司简介、团队背景、产品阶段、目标融资轮次。
- `traction_metrics`: MRR、ARR、留存、CAC、LTV、毛利率、回款周期、客户数量。
- `fundraising_terms`: 目标融资金额、估值区间、资金用途、runway。
- `market_notes`: 市场规模、竞品、客户访谈、渠道反馈。

## Workflow
1. 判断融资阶段和投资人关注点，区分天使轮的团队/愿景、A 轮的增长效率、B 轮后的规模化证据。
2. 计算关键指标并标记异常：例如 CAC 回收期过长、净收入留存不足、客户集中度过高。
3. 生成投资人 memo：问题、解决方案、市场、牵引力、商业模式、竞争优势、融资用途。
4. 输出 due diligence 清单，明确哪些结论来自真实数据，哪些只是创始人假设。
5. 给出补证建议，例如补充 cohort 留存、客户 pipeline、付费转化漏斗、毛利拆解。

## Risk and compliance boundaries
- 不承诺融资成功率，不生成误导性估值背书。
- 对没有数据支持的 TAM、增长率、回款周期和 LTV/CAC 结论必须降级为假设。
- 涉及投资邀约、证券发行或跨境融资时，提示用户咨询持牌机构或律师。

## Output
返回结构化 JSON：

```json
{
  "memo": {
    "stage_fit": "pre_a",
    "one_liner": "AI workflow agent for compliance-heavy finance teams",
    "traction_summary": ["MRR 48k USD", "net revenue retention 112%"],
    "business_model": "seat-based SaaS with pilot-to-annual conversion",
    "fundraising_use": ["product", "sales", "security audit"]
  },
  "risks": [
    {
      "risk": "customer concentration",
      "severity": "high",
      "evidence": "top 2 customers contribute 61% of MRR",
      "fix": "add pipeline conversion and expansion plan before investor outreach"
    }
  ],
  "questions_for_founder": [
    "What is the latest cohort retention by acquisition channel?",
    "Which revenue is signed ARR versus non-binding LOI?"
  ]
}
```

## Example prompt
“根据这份 deck 和财务模型，帮我生成 Pre-A 投资人 memo，并指出最可能被投资人追问的 5 个问题。”
