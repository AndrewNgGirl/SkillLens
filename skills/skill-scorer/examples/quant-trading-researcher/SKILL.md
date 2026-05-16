---
name: quant-trading-researcher
description: Use when quant researchers or strategy developers need to evaluate factor ideas, backtest validity, statistical reliability, trading costs, implementation risk, and live monitoring readiness before paper trading or limited production deployment.
version: 0.1.0
license: MIT
tags: [finance, quant, backtest, trading, risk-control]
author: SkillLens Demo Team
---

# Quant Strategy Researcher

## Description
面向量化研究员和个人策略开发者的策略研究助手，用于把因子想法、回测配置、交易成本和上线监控要求整理成可复现的策略研究报告。

## When to use
- 需要评估一个因子或交易信号是否具备统计可靠性。
- 需要检查回测是否存在未来函数、幸存者偏差、过拟合或交易成本低估。
- 策略准备从 notebook 进入 paper trading 或小资金实盘观察。

## Inputs
- `universe`: 股票池、期货品种、ETF 或加密资产范围。
- `signal_definition`: 因子公式、调仓频率、持仓约束。
- `backtest_result`: 收益、波动、最大回撤、换手率、胜率、IC、IR、分年度表现。
- `cost_model`: 手续费、滑点、冲击成本、借券或融资成本。
- `live_monitoring`: 实盘延迟、成交偏差、异常告警和止损规则。

## Workflow
1. 识别策略类型：横截面选股、时序动量、套利、做市、事件驱动。
2. 检查数据可得性、复权逻辑、停牌涨跌停处理和样本外区间。
3. 评估统计可靠性：样本量、t 值、IC 稳定性、分市场环境表现、参数敏感性。
4. 将交易成本和容量约束纳入净收益估计。
5. 输出上线前 checklist：paper trading、风控阈值、漂移监控、成交偏差告警。

## Guardrails
- 不给出确定性收益预测，不鼓励高杠杆或无风控实盘。
- 回测结果没有样本外验证、成本模型或异常处理时必须标记为高风险。
- 对加密、期货、融资融券等高风险品种要求更严格的保证金和强平风险提示。

## Output
```json
{
  "strategy_summary": {
    "type": "cross_sectional_factor",
    "rebalance": "weekly",
    "universe": "CSI 800",
    "expected_capacity": "medium"
  },
  "quality_checks": [
    {
      "check": "out_of_sample_validation",
      "status": "partial",
      "evidence": "2023-2025 sample exists, but no market-regime split",
      "fix": "add bull, bear, and sideways regime attribution"
    }
  ],
  "go_live_plan": {
    "phase": "paper_trading",
    "monitoring": ["slippage drift", "turnover spike", "factor decay"],
    "kill_switch": "drawdown over 6% or 3 consecutive abnormal fills"
  }
}
```

## Example prompt
“检查这个周频多因子策略的回测报告，判断是否可以进入 paper trading，并列出上线前必须补的证据。”
