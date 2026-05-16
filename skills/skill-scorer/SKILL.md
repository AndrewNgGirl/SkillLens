---
name: skill-scorer
description: Evaluates Agent Skills (Cursor / Claude / OpenClaw compatible) and produces a quantitative, rubric-based score with actionable improvement suggestions. Use when the user asks to review, rate, audit, grade, lint, or improve a SKILL.md file, a skill folder, or a skill archive, or says things like "给这个 skill 打分", "评估一下 skill 质量", "audit this skill", "rate my agent skill".
version: 0.4.0
license: MIT
tags: [skill, quality, rubric, audit, meta]
---

# skill-scorer

一个"评测 Skill 的 Skill"。接收任意 Agent Skill 的源文件，必须依据本仓库的官方评分入口和 `rubric/rubric.yaml`
给出 5 大支柱的 100 分制评分、等级、证据引用与改进建议。Rubric 内置三类型差异化（atomic / pipeline / composite），子维度数随 skill 结构自动启用，由 `applies_to` 字段控制。同时兼容 **Cursor / Claude / OpenClaw** 三套规范。

## When to use

- 用户提供 `SKILL.md` / skill 文件夹 / `.zip` / GitHub URL，并请求评分、审计或改进建议。
- 用户询问"我这个 skill 写得怎么样"、"怎么提升我的 skill 质量"、"帮我对齐官方最佳实践"。
- **不适用于**：评价非 Skill 类文档（普通 README / 博客 / prompt 模板）。

## Code Agent Quick Start

如果你是 Cursor、WorkBuddy、Hermes、小龙虾或类似 code agent，先读 `USAGE.md`。

推荐先运行 CLI 向导，让用户选择通用评测或金融专家版；如果选择金融专家版，向导会继续确认金融子场景，并输出后续官方命令：

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill-zip-dir-or-SKILL.md>
```

规则分预览：

```bash
python3 skills/skill-scorer/scripts/score.py <path-to-skill-zip-dir-or-SKILL.md>
```

完整 agent-side Deep Review（使用 code agent 自己的模型套餐，不消耗 SkillLens 服务端 key）：

```bash
python3 skills/skill-scorer/scripts/score.py --agent-prompt <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
# 将 agent-deep-review-prompt.md 完整交给当前 code agent 的模型，保存严格 JSON 为 agent-llm-results.json
python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json <path-to-skill-zip-dir-or-SKILL.md>
```

不得临时生成自定义评分脚本替代官方 CLI；最终分数必须来自最后一步官方 CLI 输出。

金融专家版（可选）应优先通过 `--agent-wizard` 选择；手动执行时，必须在 `--agent-prompt` 和 `--llm-results` 两步都加入相同的 `--domain finance --scenario <scenario-id>`。支持的场景详见 `USAGE.md`。

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
  "pillars": [
    {
      "id": "business_value",
      "score": 0-25,
      "dimensions": [
        { "id": "...", "checks": [{ "id": "...", "status": "pass|partial|fail|n_a", "evidence": "..." }] }
      ]
    }
  ],
  "bonus": 0-5,
  "suggestions": [
    { "title": "Top 改进项", "why": "现状", "how": "改法" }
  ],
  "deepReviewCertificate": {
    "status": "verified"
  }
}
```

## Workflow

1. **Locate SkillLens root**：先定位包含 `skills/skill-scorer/rubric/rubric.yaml` 的 SkillLens 仓库根目录。
2. **Run official scorer**：运行官方 CLI，不得临时生成替代评分脚本：

   ```bash
   python3 skills/skill-scorer/scripts/score.py <path-to-skill-zip-dir-or-SKILL.md>
   ```

3. **Choose review mode**：优先运行 `--agent-wizard`。如手动执行，必须确认是否启用领域专家版；当前 MVP 支持 `finance`，并必须确认具体 `--scenario`。
4. **Agent-side Deep Review when requested**：如需完整深度评测，必须先运行 `--agent-prompt` 生成官方提示词，用当前 code agent 的模型返回严格 JSON，再运行 `--llm-results` 合并。领域专家版必须在两步命令都带上相同的 `--domain` / `--scenario`。
5. **Use official JSON only**：总分、等级、pillar/dimension/check 分数必须来自官方 CLI 最终 JSON 输出，不能由 Agent 自己重算或补满。
6. **Verify certificate**：完整 Deep Review 必须包含 `deepReviewCertificate.status="verified"`；金融专家版还必须包含 `domainExpert` 和 `deepReviewCertificate.domain`；没有证书只能称为规则分预览或非官方结果。
7. **Render**：按 skill 语言（zh / en）把官方 JSON 渲染成 Markdown 报告；Top 改进项必须来自 JSON 的 `suggestions` 或对应 check 的 `fix_zh/fix_en`。

## Official Tool Contract

- **MUST** call `skills/skill-scorer/scripts/score.py` for local tool use, or call the deployed SkillLens Web/API endpoint when the user explicitly提供该服务地址。
- **SHOULD** start with `--agent-wizard` for agent-side Deep Review so the user explicitly chooses general vs. finance expert review.
- **MUST** use the official `--agent-prompt` → model JSON → `--llm-results` flow for agent-side Deep Review.
- **MUST** ask before enabling domain expert review when not using the wizard; for finance, pass the same `--domain finance --scenario <scenario-id>` in prompt generation and merge.
- **MUST NOT** paste or synthesize a new `python3 <<'PYEOF' ...` scoring script to replace the official scorer.
- **MUST NOT** claim "全面检测"、"Deep Review 完成"、"43 项全部通过" 或 "100/100" unless those exact values appear in official SkillLens output.
- **MUST NOT** call a result official full Deep Review unless `deepReviewCertificate.status` is exactly `verified`.
- **MUST** preserve `llmComplete=false` / `llmCoverage` in the rendered report. If LLM checks are skipped, say so clearly.
- **MUST** include the scoring source in every report, for example: `source: official SkillLens CLI` or `source: SkillLens Web Deep Review`.
- **MUST** treat `rubric/rubric.yaml` as read-only scoring data. Do not alter weights, thresholds, or pass/partial/fail mapping during evaluation.

## Guardrails

- 规则分必须**确定性**且 **跨语言一致**（TS 前端与 Python CLI 行为等价）。
- LLM 评审仅用于 `type: llm` 的细则，**不得覆盖或改写**规则分结果。
- 报告语言始终跟随被测 skill 的主语言，除非用户在 Web 端手动切换。
- 不在报告中回显原 skill 中可能的密钥/凭证字符串。
- 如果无法运行官方 CLI 或访问官方 Web/API，必须停止并说明原因；不得退回到自制评分器。

## Files

- `rubric/rubric.yaml` — 评分细则（**Web 端与 CLI 共用的单一事实源**）
- `domains/finance/rubric.yaml` — 金融专家版评分细则（通用分之外的附加专家报告）
- `scripts/score.py` — 官方本地 CLI 打分脚本（规则分预览；不会伪造 LLM Deep Review）
- `USAGE.md` — 给 Cursor / WorkBuddy / Hermes / 小龙虾等 code agent 的官方调用契约
- `references/best-practices.md` — Skill 写作最佳实践（供 LLM few-shot 与人类阅读）

## Report Rendering Rules

Render the official JSON into a concise report. Do not use a fixed sample score. Use this shape:

```markdown
# SkillLens Report

source: official SkillLens CLI | SkillLens Web Deep Review
mode: rule-only preview | full deep review
llmComplete: true | false

**Total**: <score from JSON> / 100 · **Grade**: <grade from JSON>

## Pillars
| Pillar | Score | LLM coverage |
|---|---:|---:|
| <pillar.name_zh/name_en> | <pillar.score>/<pillar.weight> | <evaluated>/<total> |

## Top Improvements
1. <suggestion.title from JSON>
   - 现状/Why: <suggestion.why>
   - 改法/How: <suggestion.how>
```

If the CLI output says `llmComplete=false`, explicitly call the result a rule-only preview. Never upgrade it to a full deep review.
