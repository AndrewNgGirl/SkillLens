# Changelog

## 0.4.0

### Pipeline / Composite Differentiated Rubric

- Added skill-type-aware rubric: every check now declares `applies_to: [atomic | pipeline | composite]`. Out-of-scope checks are emitted as `not_applicable`, kept out of the LLM prompt, kept out of Top Improvements, and kept out of the pillar denominator. When all checks in a dimension are filtered, the whole dimension is dropped from renormalization so pillar scores stay on the same 0–20 / 0–25 scale across types.
- Added 5 pipeline-only dimensions under `reliability`: routing design, sub-agent boundaries, IO protocol, partial-failure handling, and a rule-class sub-skill self-containment scanner that walks every child SKILL.md for `when-to-use` and `workflow` sections.
- Added 4 composite-only dimensions under `reliability`: tool index, orthogonality, consistency, and discoverability — for skill bundles that are toolkits rather than orchestrators.
- Added `applies_to=[atomic]` on `market.scope_focus.disciplined`, `act.steps_atomic`, `act.io_explicit`, `struct.has_workflow`, and `rel.output_validation.*`; `applies_to=[atomic, composite]` on `cost.reference_layering.has_dirs` and `rel.script_fallback.has_scripts`. Pipeline reports stop suggesting "rewrite the schema in the root SKILL.md" or "add scripts/ for fallback".
- Updated the Agent CLI prompt and web LLM prompt with explicit pipeline / composite lens paragraphs that point the model at the new dimension IDs.
- Updated CLI `render_report.py` and web `PillarSection.tsx` to fold fully-N/A dimensions into a "show N dimensions not applicable to this skill type" toggle at the bottom of each pillar (default collapsed).
- Updated `score.py` to surface `appliesTo`, `notApplicable`, and `originalWeight` on every check / dimension so downstream renderers have everything needed for the new UX.
- Mirrored the rubric expansion into `web/lib/rubric/rubric.ts` via `sync_rubric_to_ts.py`; added the `rel.pipeline_subskill_quality.self_contained` rule to `web/lib/scoring/rules.ts` so web-side rule scoring stays in lockstep with Python CLI.

## 0.3.0

### Domain Expert Review

- Added the first domain expert review MVP: Finance Expert Review.
- Added finance scenarios for startup fundraising, quant trading, stock trading, securities research, banking workflows, financial education, financial data analysis, and other finance use cases.
- Added a finance expert rubric covering scenario fit, financial professionalism, data and evidence quality, risk and compliance, explainability, engineering readiness, and commercial readiness.
- Upgraded Finance Expert Review to scenario-specific rubrics: each finance scenario can now have its own pillar weights, extra checks, and LLM prompt focus.
- Deepened scenario-specific finance checks, including trading position discipline, quant live monitoring, fundraising traction evidence, research thesis sensitivity, banking exception/SLA handling, education feedback loops, and data-analysis statistical validity.
- Added Web upload-page mode selection so users can choose General Review or Finance Expert Review before uploading a skill.
- Added Agent CLI parameters `--domain finance --scenario <scenario-id>` for official agent-side finance expert workflows.
- Added `--agent-wizard` so agents can ask users to choose General Review vs. Finance Expert Review and print the exact official prompt/merge commands.
- Added `domainExpert` output with finance score, grade, risk level, commercial readiness, pillar scores, and LLM coverage.
- Extended `deepReviewCertificate` with domain, scenario, and domain rubric hash when finance expert review is enabled.
- Added scenario-specific finance examples so each finance sub-scenario has a matching sample skill in the Web loader.
- Reworked documentation structure around the two entry points: Web UI for humans and Agent CLI for code agents.

## 0.2.0

### Agent CLI

- Added official Agent CLI support for Cursor, WorkBuddy, Hermes, and similar code agents.
- Added the agent-side Deep Review workflow: `--agent-prompt` generates the official review prompt, the code agent uses its own model plan to produce JSON, and `--llm-results` validates and merges the final score through the SkillLens CLI.
- Added stricter score calibration for Agent CLI Deep Review: perfect scores are reserved for rare benchmark-level cases, high scores are soft-capped, and low-confidence judgments are downgraded.
- Added verified `deepReviewCertificate` output so official full Deep Review results can be distinguished from rule-only previews or ad hoc agent-generated reports.
- Added direct `.zip` input support to the SkillLens CLI, matching the Web upload flow for user-provided skill packages.
- Added `skills/skill-scorer/USAGE.md` as the single detailed contract for Agent CLI usage, including the three-step workflow, certificate requirements, and copy-paste prompts for code agents.

### Web

- Added browser-origin protection for `/api/llm` so public Web deployments can protect server-side model keys from direct tool calls.
- Added stricter Web Deep Review prompt and score calibration so regular "meets the checklist" outputs are not inflated into easy 100/100 scores.
- Reorganized README files so root docs describe the two entry points, Web docs stay focused on Web deployment, and Agent CLI workflow details live in `USAGE.md`.

# 更新日志

## 0.4.0

### Pipeline / Composite 差异化 rubric

- 新增 skill 类型感知的 rubric：每个 check 都声明 `applies_to: [atomic | pipeline | composite]`。不在名单的 check 直接 `not_applicable`：不送 LLM、不进 Top 改进建议、也不进 pillar 分母。当一个 dim 下所有 check 都被过滤时，整个 dim 退出归一化（剩余 dim 自动重分布权重），保证 pillar 分数仍维持 0–20 / 0–25 的统一刻度。
- 在 `reliability` pillar 新增 5 个 pipeline 专属维度：路由设计、子 agent 边界、IO 协议、部分失败处理、子 skill 自洽性（rule 类，会自动扫描每个子 SKILL.md 是否含 when-to-use 与 workflow 章节）。
- 在 `reliability` pillar 新增 4 个 composite 专属维度：工具索引、正交性、一致性、可发现性，专门面向"工具集型"而非"编排器型"的 skill 包。
- 给 `market.scope_focus.disciplined`、`act.steps_atomic`、`act.io_explicit`、`struct.has_workflow`、`rel.output_validation.*` 标记 `applies_to=[atomic]`；给 `cost.reference_layering.has_dirs` 与 `rel.script_fallback.has_scripts` 标记 `applies_to=[atomic, composite]`。pipeline 报告不再出现"在主 SKILL.md 重写 schema"或"加 scripts/ 兜底"这种类型错配建议。
- Agent CLI prompt 与 web LLM prompt 都加了明确的 pipeline / composite lens 段落，把新维度 ID 直接告诉 LLM。
- CLI `render_report.py` 与 web `PillarSection.tsx` 都改为：默认只展示当前类型适用的 dim，fully N/A 的 dim 折叠到底部 "查看 N 个对当前 skill 类型不适用的维度" 按钮里。
- `score.py` 在每个 check / dimension 上回传 `appliesTo`、`notApplicable`、`originalWeight`，让所有渲染层都拿得到重组所需信息。
- `sync_rubric_to_ts.py` 已把新 rubric 同步到 `web/lib/rubric/rubric.ts`；同时在 `web/lib/scoring/rules.ts` 实现了 `rel.pipeline_subskill_quality.self_contained` 规则，保证 web rule scoring 与 Python CLI 行为一致。

## 0.3.0

### 领域专家版

- 新增第一个领域专家版 MVP：金融专家评测。
- 新增金融场景：投融资 / 创业融资、量化交易、炒股 / 短线 / 盯盘、证券研究 / 投研、银行业务流程、金融知识教育、金融数据分析和其他金融场景。
- 新增金融专家 rubric，覆盖场景适配度、金融专业性、数据与证据质量、风险控制与合规、决策可解释性、工程落地性和商业可用性。
- Web 上传页新增模式选择，用户上传前可以选择通用评测或金融专家版。
- Agent CLI 新增 `--domain finance --scenario <scenario-id>` 参数，支持官方 agent-side 金融专家评测工作流。
- Agent CLI 新增 `--agent-wizard`，由 CLI 引导用户选择通用评测或金融专家版，并输出准确的官方 prompt / merge 命令。
- 新增 `domainExpert` 输出，包含金融专家分、等级、风险等级、商业成熟度、支柱分和 LLM 覆盖率。
- 启用金融专家版时，`deepReviewCertificate` 会额外包含 domain、scenario 和 domain rubric hash。
- 金融专家版升级为子场景差异化 rubric：不同金融场景现在可以拥有不同支柱权重、专属检查项和 LLM 评测重点。
- 深化金融子场景专属检查项，新增短线仓位纪律、量化实盘监控、融资牵引力证据、投研假设敏感性、银行异常/SLA、投教反馈闭环、数据分析统计有效性等评估。
- 新增每个金融子场景对应的示例 skill，Web 端会随子场景自动切换“载入示例”。
- 重整 README / Web README / Agent CLI USAGE 的职责边界，让 Web UI 和 Agent CLI 两条路径更清楚。

## 0.2.0

### Agent CLI

- 新增官方 Agent CLI 调用支持，面向 Cursor、WorkBuddy、Hermes、小龙虾等 code agent。
- 新增 agent-side Deep Review 三步工作流：`--agent-prompt` 生成官方评测提示词，code agent 使用自己的模型套餐产出 JSON，`--llm-results` 再通过 SkillLens CLI 校验并合并最终评分。
- 新增更严格的 Agent CLI 评分校准：满分只保留给少数标杆级案例，高分会软封顶，低置信度判断会被降权。
- 新增可验证的 `deepReviewCertificate` 输出，用于区分官方完整 Deep Review、规则分预览，以及 agent 临时生成的非官方报告。
- SkillLens CLI 新增直接支持 `.zip` 输入，对齐 Web 端用户上传 skill 压缩包的体验。
- 新增 `skills/skill-scorer/USAGE.md`，作为 Agent CLI 的唯一详细调用契约，包含三步工作流、证书要求和可复制给 code agent 的提示词。

### Web

- 为 `/api/llm` 新增浏览器来源保护，公网 Web 部署时可避免工具直连消耗服务端模型 key。
- 新增更严格的 Web Deep Review 提示词与分数校准，避免普通“符合清单”的结果被轻易抬到 100/100。
- 重新整理 README 结构：根文档说明 Web / Agent CLI 两种入口，Web 文档聚焦部署，Agent CLI 工作流细节集中到 `USAGE.md`。
