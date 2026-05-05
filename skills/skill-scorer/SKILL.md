---
name: skill-scorer
description: Evaluates Agent Skills (Cursor / Claude / OpenClaw compatible) and produces a quantitative, rubric-based score with actionable improvement suggestions. Use when the user asks to review, rate, audit, grade, lint, or improve a SKILL.md file, a skill folder, or a skill archive, or says things like "给这个 skill 打分", "评估一下 skill 质量", "audit this skill", "rate my agent skill".
version: 0.1.0
license: MIT
tags: [skill, quality, rubric, audit, meta]
---

# skill-scorer

一个"评测 Skill 的 Skill"。接收任意 Agent Skill 的源文件，依据 `rubric/rubric.yaml`
给出 8 维度 100 分制评分、等级、证据引用与改进建议。同时兼容 **Cursor / Claude / OpenClaw** 三套规范。

## When to use

- 用户提供 `SKILL.md` / skill 文件夹 / `.zip` / GitHub URL，并请求评分、审计或改进建议。
- 用户询问"我这个 skill 写得怎么样"、"怎么提升我的 skill 质量"、"帮我对齐官方最佳实践"。
- **不适用于**：评价非 Skill 类文档（普通 README / 博客 / prompt 模板）。

## Inputs

- 一个 `SKILL.md` 文本，或
- 一个 skill 目录（含 `scripts/` `references/` `assets/` 等），或
- 一个 `.zip` 打包的 skill，或
- 一个指向 skill 仓库/子目录的 GitHub URL（Web 工具侧支持）。

## Outputs

```json
{
  "spec": "claude | openclaw",
  "language": "zh | en",
  "score": 0-100,
  "grade": "S | A | B | C | D",
  "dimensions": [
    { "id": "metadata", "score": 0-10, "checks": [{ "id": "...", "status": "pass|partial|fail", "evidence": "line 3-5" }] }
  ],
  "bonus": 0-5,
  "suggestions": [ "Top-N 改进项（跟随 skill 语言）" ]
}
```

## Workflow

1. **Detect spec**：读目录结构，判定属于 claude / openclaw 哪一种。
2. **Normalize**：产出 `CanonicalSkill` 中间结构（`meta / sections / workflow / scripts[] / references[] / examples[] / language`）。
3. **Rule scoring**：逐条评估 `rubric.yaml` 中 `type: rule` 的细则，给出 pass/partial/fail + 证据（行号）。
4. **LLM scoring**（可选）：对 `type: llm` 的细则调用模型，返回 0–1 连续分数 + 简短理由。
5. **Aggregate**：按权重加总，映射到 S/A/B/C/D 等级；计算 bonus。
6. **Render**：按 skill 语言（zh / en）生成 Markdown / JSON 报告；附 Top-5 改进项。

## Guardrails

- 规则分必须**确定性**且 **跨语言一致**（TS 前端与 Python CLI 行为等价）。
- LLM 评审仅用于 `type: llm` 的细则，**不得覆盖或改写**规则分结果。
- 报告语言始终跟随被测 skill 的主语言，除非用户在 Web 端手动切换。
- 不在报告中回显原 skill 中可能的密钥/凭证字符串。

## Files

- `rubric/rubric.yaml` — 评分细则（**Web 端与 CLI 共用的单一事实源**）
- `scripts/score.py` — CLI 打分脚本（规则分，MVP）
- `references/best-practices.md` — Skill 写作最佳实践（供 LLM few-shot 与人类阅读）

# SkillLens Report — Claude / S

**Total**: 91.63 / 100  ·  **Bonus**: +4.55

## 选题价值 — 21.6 / 25
### 目标用户清晰度 (4.8/5)
- `biz.target_users.specific` [pass] 明确列出了三类用户：开源维护者、小团队、独立开发者，并给出了频率估算。
### 用户需求真实度 (5.4/6)
- `biz.problem_reality.is_real` [pass] PR 审查耗时是真实痛点，作者量化了节省时间（25分钟/PR），且聚焦于风格审查而非已有工具覆盖的 bug/安全。
### 价值主张清晰度 (4.5/5)
- `biz.value_articulation.matched_to_type` [pass] 按 productivity 标准，量化了时间节省（4小时/周），并清晰对比了 Copilot Code Review 和 CodeQL。
### 复用价值 (4.5/5)
- `biz.usage_frequency.estimable` [pass] 明确说明 per-PR 高频使用，并给出了活跃仓库的每日频率。
### 沉淀 / 记忆点潜力 (2.4/4)
- `biz.moat_potential.compounding` [partial] 团队规则可积累，但未强调规则库的持续优化或社区共享机制。

## 市场竞争力 — 12.8 / 15
### 差异化 (4.5/5)
- `market.differentiation.clear` [pass] 一句话说清：聚焦团队风格和结构约定，而非 bug/安全。
### 聚焦度 (3.6/4)
- `market.scope_focus.disciplined` [pass] 明确声明不适用于 bug 查找和安全扫描，专注风格审查。
### 通用模型可替代风险 (2.5/3)
- `market.llm_replaceable.has_edge` [pass] 结合了静态 lint 工具和团队规则文件，纯 LLM 无法获取团队特定规则。
### 竞品调研意识 (2.1/3)
- `market.existing_alternatives.surveyed` [partial] 作者提到了 Copilot Code Review 和 CodeQL，但客观调研显示 reviewdog 系列（9264 stars）是强相关竞品，未被提及。

## 运行成本 — 14.7 / 15
### 上下文预算 (4.0/4)
- `cost.context_budget.skill_md_size` [pass] 5274 chars（约 1758 tokens）
### 分层加载 (4.0/4)
- `cost.reference_layering.has_dirs` [pass] 已检测到 references/ scripts/ assets/ 等分层目录
### 外部依赖重量 (3.8/4)
- `cost.external_dependencies.declared` [pass] 已同时提供依赖清单和 Dependencies 说明
- `cost.external_dependencies.weight_assessed` [pass] 依赖少且免费（GitHub API、lint 工具），LLM 调用成本低（$0.005/PR）。
### 可缓存性 (2.9/3)
- `cost.cache_friendliness.idempotent_inputs` [pass] 定义了缓存键（SHA-256 of pr_url, head_sha, team_rules_hash），明确复用条件。

## 效果稳定性 — 18.4 / 20
### 任务模型匹配度 (4.5/5)
- `rel.task_model_fit.in_zone` [pass] 任务为结构化提取和风格评论，属于 LLM 稳定能力区。
### 脚本兜底 (4.0/4)
- `rel.script_fallback.has_scripts` [pass] 已找到 scripts/ 目录
### 输出校验 (3.9/4)
- `rel.output_validation.declared` [pass] 已找到 Outputs 章节和 schema / typed declaration
- `rel.output_validation.enforced` [pass] 有 validate_review.py 脚本和 schema.json，失败时重试一次后降级。
### 幂等性 (2.7/3)
- `rel.idempotency.discussed` [pass] 讨论了温度 0.2 和去重机制，说明同输入输出近似一致。
### 异常路径 (1.9/2)
- `rel.failure_path.explicit` [pass] 详细列出了 API 403/404、linter 缺失、schema 验证失败、限流等场景的处理。
### 边界情况 (1.4/2)
- `rel.edge_cases.discussed` [partial] 未明确讨论边界场景，如空 diff、超大 PR、非支持语言等。

## 书写规范性 — 24.3 / 25
### 元数据规范性 (4.0/4)
- `meta.frontmatter_valid` [pass] frontmatter 可正常解析
- `meta.required_fields` [pass] 必填字段齐全：name, description
- `meta.recommended_fields` [pass] 推荐字段齐全：license, version
- `meta.name_format` [pass] name="pr-reviewer"
### 可发现性 (4.7/5)
- `disc.length_ok` [pass] 276 chars (<= 1024)
- `disc.has_trigger_cue` [pass] 已找到触发线索
- `disc.third_person` [pass] 已使用第三人称表达
- `disc.keyword_coverage` [pass] 覆盖了 review/audit/comment/评审/审查 等中英文关键词，但缺少 'code review' 等常见短语。
### 结构与可读性 (3.0/3)
- `struct.has_headings` [pass] 共有 13 个 H2 章节
- `struct.has_workflow` [pass] 已找到 Workflow / steps 章节
- `struct.md_well_formed` [pass] 4 个代码块围栏，已成对闭合
### 可执行性 (5.7/6)
- `act.steps_atomic` [pass] 工作流步骤清晰，每步只做一件事（fetch、lint、LLM、compose、validate）。
- `act.io_explicit` [pass] 输入输出表格完整，包含类型、必需性、默认值。
- `act.tool_calls_clear` [pass] 已有可复制的代码块
- `act.no_ambiguity` [pass] 步骤描述明确，无模糊词汇。
- `act.has_examples` [pass] 已找到示例/用法内容
### 安全合规 (2.9/3)
- `safe.dangerous_ops_flagged` [pass] 未检测到破坏性操作
- `safe.secrets_policy` [pass] 未检测到明文密钥
- `safe.least_privilege` [pass] 仅需 GitHub API 读权限和本地 lint 工具，无多余权限。
- `safe.privacy` [pass] 明确说明 diff 发送给 LLM 提供商，并提示检查数据保留政策，引用 privacy.md。
### 可维护性 (4.0/4)
- `maint.has_version` [pass] version="0.3.0"
- `maint.declares_deps` [pass] 已找到依赖清单文件
- `maint.has_tests` [pass] 已找到测试文件
- `maint.has_changelog` [pass] 已找到 changelog / 更新记录

## Top improvements
1. **是否具备持续使用后的沉淀、记忆点或传播性** _(medium, business_value/biz.moat_potential.compounding)_
   - 现状: 团队规则可积累，但未强调规则库的持续优化或社区共享机制。
   - 改法: 建议增加规则库版本管理或用户贡献规则的功能。
2. **是否主动调研并说明真实同类项目与差异点** _(medium, market/market.existing_alternatives.surveyed)_
   - 现状: 作者提到了 Copilot Code Review 和 CodeQL，但客观调研显示 reviewdog 系列（9264 stars）是强相关竞品，未被提及。
   - 改法: 建议补充 reviewdog 的对比，说明差异化。
3. **讨论了 2–3 个边界场景或已知缺陷** _(medium, reliability/rel.edge_cases.discussed)_
   - 现状: 未明确讨论边界场景，如空 diff、超大 PR、非支持语言等。
   - 改法: 建议补充空 diff 处理、语言不支持时的降级策略。