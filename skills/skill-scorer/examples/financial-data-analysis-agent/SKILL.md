---
name: financial-data-analysis-agent
description: Use when analysts, finance teams, or operators need to clean financial datasets, check data quality, analyze revenue, margin, cash flow, customer value, anomalies, or trends, and produce traceable management-ready insights with confidence caveats.
version: 0.1.0
license: MIT
tags: [finance, data-analysis, revenue, cash-flow, data-quality]
author: SkillLens Demo Team
---

# Financial Data Analysis Agent

## Description
面向分析师、财务团队和运营管理者的金融数据分析助手，用于清洗财务、交易、客户和经营数据，生成可追溯的数据洞察报告。

## When to use
- 需要分析收入、成本、利润、现金流、应收账款或客户分层数据。
- 需要从 CSV、Excel、数据库导出中识别异常、缺失、口径不一致和趋势变化。
- 需要把数据分析结果转成管理层可读的 dashboard 摘要。

## Inputs
- `dataset_schema`: 字段名、类型、币种、时间粒度、主键。
- `analysis_goal`: 盈利分析、现金流预测、客户价值、异常检测或经营复盘。
- `data_quality_rules`: 缺失值、重复值、异常值、币种转换和会计口径。
- `business_context`: 公司业务、收入确认方式、季节性和关键指标定义。

## Workflow
1. 检查字段、口径、时间范围和数据质量，先输出 data quality report。
2. 根据目标选择分析方法：同比环比、贡献分解、cohort、异常检测、滚动预测。
3. 将结论绑定到具体字段、筛选条件和计算公式，避免黑箱结论。
4. 标记统计可靠性：样本量、缺失比例、异常影响、是否可外推。
5. 输出管理层摘要和后续验证建议。

## Risk controls
- 不把相关性直接写成因果。
- 样本量不足、字段缺失或口径不一致时必须降低置信度。
- 涉及客户数据时默认脱敏，不输出个人敏感信息。

## Output
```json
{
  "data_quality": {
    "missing_rate": "3.8%",
    "duplicate_keys": 12,
    "issues": ["revenue_currency mixed between CNY and USD"]
  },
  "insights": [
    {
      "claim": "gross margin dropped mainly because enterprise discounts increased",
      "evidence": "discount_rate contribution explains 62% of margin change",
      "confidence": "medium"
    }
  ],
  "next_checks": [
    "validate currency conversion rules",
    "split margin by customer segment and contract term"
  ]
}
```

## Example prompt
“分析这份月度收入和成本表，找出毛利率下降的主要原因，并说明数据质量是否足够支撑结论。”
