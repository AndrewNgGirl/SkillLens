---
name: finance-scenario-advisor
description: Use when a finance-related Agent Skill does not clearly fit one sub-scenario and needs intake classification, decision-impact assessment, risk boundary review, and recommendations for whether to evaluate it as fundraising, quant trading, stock trading, securities research, banking workflow, financial education, or financial data analysis.
version: 0.1.0
license: MIT
tags: [finance, scenario-classification, intake, risk-boundary, expert-review]
author: SkillLens Demo Team
---

# Finance Scenario Intake Advisor

## Description
用于尚未明确归类的金融场景，先帮助用户识别任务属于投融资、量化交易、短线盯盘、证券研究、银行流程、金融教育还是金融数据分析，再生成对应的评测和改造建议。

## When to use
- 用户上传的 skill 混合了多个金融任务，无法直接归入单一场景。
- 产品经理需要判断一个金融 Agent 应该走哪个专业评测 rubric。
- 团队需要在正式开发前明确用户、数据、风险边界和商业化路径。

## Inputs
- `skill_description`: Agent 的目标、输入、输出和使用场景。
- `user_roles`: 面向投资者、研究员、银行员工、学生、创业者还是数据分析师。
- `decision_impact`: 输出是否会影响投资、授信、交易、教育或运营决策。
- `data_sources`: 用户上传、公开数据、内部系统、行情、财报、公告或新闻。

## Workflow
1. 识别金融任务类型和决策影响等级。
2. 给出最匹配的金融子场景，并说明为什么不是其他场景。
3. 检查缺失的风险边界、数据证据、合规约束和用户反馈闭环。
4. 给出重构建议：如果要转成具体垂类，应补哪些输入、输出和保护机制。
5. 对无法安全归类的场景，建议保持通用评测并补充人工审查。

## Risk boundaries
- 不直接生成投资建议、授信结论或交易信号。
- 当场景涉及客户隐私、证券推荐、收益承诺或监管审批时，提高风险等级。
- 明确告知用户需要选择更具体的专业场景才能获得更严格评估。

## Output
```json
{
  "scenario_classification": {
    "primary": "financial_data_analysis",
    "secondary": "banking_workflow",
    "confidence": 0.78,
    "reason": "the skill analyzes customer cashflow data and routes exceptions"
  },
  "missing_boundaries": [
    "no privacy masking policy",
    "no manual escalation path for credit decisions"
  ],
  "recommended_rewrite": {
    "target_scenario": "banking_workflow",
    "must_add": ["policy references", "SLA owner", "audit log", "PII masking"]
  }
}
```

## Example prompt
“帮我判断这个金融 Agent 更像哪个子场景，并列出如果要做成专业版需要补哪些风控和数据说明。”
