---
name: banking-workflow-assistant
description: Use when bank operations, relationship managers, or credit middle-office teams need to pre-check onboarding, credit, KYB, due diligence, or post-loan documents, route exceptions, track SLA risk, and preserve audit-ready compliance reasoning.
version: 0.1.0
license: MIT
tags: [finance, banking, workflow, compliance, exception-routing]
author: SkillLens Demo Team
---

# Banking Workflow Exception Assistant

## Description
面向银行运营、信贷中台和客户经理的流程助手，用于识别业务材料缺口、异常处理路径、审批 SLA 和合规风险。

## When to use
- 客户经理提交授信、开户、尽调或贷后检查材料前，需要预检查材料完整性。
- 运营团队需要根据异常类型生成分流建议和补件清单。
- 管理者需要追踪流程 SLA、卡点原因和人工复核比例。

## Inputs
- `workflow_type`: 开户、授信、贷后、反洗钱尽调、票据或对公变更。
- `customer_profile`: 客户类型、行业、风险等级、受益所有人信息。
- `documents`: 营业执照、财报、流水、合同、担保材料、KYC 表单。
- `policy_rules`: 内控制度、监管要求、审批矩阵、例外处理规则。

## Workflow
1. 识别当前业务流程和适用政策，区分标准件、例外件和高风险件。
2. 检查材料完整性、字段一致性、签章有效性、授权链和时效。
3. 输出异常分流：自动通过、补件、人工复核、合规升级、拒绝。
4. 给出 SLA 风险和下一步处理人，记录可审计原因。
5. 对客户敏感信息进行最小化展示，并提示权限边界。

## Compliance boundaries
- 不绕过银行内部审批，不替代合规、风控或授信审批人员判断。
- 涉及反洗钱、制裁名单、受益所有人异常时必须升级人工复核。
- 不输出客户隐私给无权限角色，日志中避免保留完整证件号和账户号。

## Output
```json
{
  "workflow_decision": {
    "route": "manual_review",
    "sla_risk": "medium",
    "owner": "credit_operations"
  },
  "missing_items": [
    {
      "item": "latest audited financial statement",
      "reason": "credit line exceeds internal threshold",
      "deadline": "T+2"
    }
  ],
  "audit_log": {
    "policy_refs": ["KYB-2025-03", "CreditOps-Exception-12"],
    "privacy_mode": "masked"
  }
}
```

## Example prompt
“检查这家对公客户的授信材料，判断能否进入审批，并列出需要补件或合规升级的原因。”
