# Changelog

## 0.4.1 — Truly Bilingual Deep Review

Fixes a long-standing mismatch in the HTML report: the ZH/EN toggle used to only switch UI chrome (pillar labels, dimension tags, status badges) while the LLM-generated `evidence` and `fix` content stayed in whichever language the LLM was asked to write. A Chinese reader looking at the default Chinese UI would still see English diagnosis text inside the Finance Expert section, because the finance pillars are 100% LLM-evaluated.

### Highlights

- **Bilingual LLM output is the new default.** The agent-side Deep Review prompt now asks the LLM to emit BOTH Chinese and English for every result (`evidence_zh` + `evidence_en`, `fix_zh` + `fix_en`, `value_type_reason_zh` + `value_type_reason_en`). The HTML report's ZH/EN toggle now actually switches body content, not just labels.
- **No breaking change for old reports.** `score.py --llm-results` still accepts single-language LLM JSON (legacy `evidence` / `fix`); the CLI mirrors it into both languages so old reports keep rendering. `evidence` and `fix` remain in the output schema as the primary-language alias.
- **Token-budget escape hatch.** Pass `--llm-language zh` or `--llm-language en` to force single-language output (≈ half the LLM output tokens). Both panes of the HTML report fall back to the chosen language.

### What's new

- New JSON schema fields on every check: `evidence_zh`, `evidence_en`, and (when a fix is present) `fix_zh`, `fix_en`. `evidence` / `fix` are preserved and equal the English side by default for back-compat consumers.
- New JSON schema fields on `llmMeta`: `value_type_reason_zh`, `value_type_reason_en`. The legacy `value_type_reason` is preserved.
- New JSON schema fields on every entry under `suggestions` and `domainExpert.suggestions`: `title_zh`, `title_en`, `why_zh`, `why_en`, `how_zh`, `how_en`. Legacy `title` / `why` / `how` are preserved (set to the primary language).
- `--llm-language {auto,bilingual,zh,en}` — `auto` is now an alias for `bilingual` (was: "follow SKILL.md source language"). Behavior is documented in `--help`.
- `engineVersion` bumped to `0.4.1`.
- `render_report.py` reads `<field>_<lang>` first and falls back to legacy `<field>`, so the same renderer handles old and new JSON transparently.
- Markdown export (`*-report.md`) is also bilingual-aware.

### Migration

- **Re-running an existing skill on the new CLI**: just re-run the three-step workflow (`--agent-prompt` → LLM produces JSON → `--llm-results`). The new prompt automatically asks for bilingual output and the new merge step preserves it end-to-end.
- **Reusing old `agent-llm-results.json`**: works as-is; the report will show the same single-language content in both panes (graceful degradation).
- **Third-party consumers of the JSON**: continue to read `evidence` / `fix` as before; opt into bilingual when ready by reading `evidence_zh` / `evidence_en` instead.

## 0.4.0 — Type-Aware Rubric & Shareable Offline Reports

Two independent shifts land together. **First**, the rubric is now skill-type-aware: pipeline orchestrators and composite toolkits are no longer scored as if they were atomic single-purpose skills, so reports stop nagging pipelines to "rewrite the schema in the root SKILL.md" and start asking the questions that actually matter for that shape. **Second**, the CLI now produces a polished offline report — JSON, GitHub-flavored Markdown, and a self-contained HTML that visually matches the web UI and exports to PDF via the browser's Cmd+P — so evaluation results are easy to share without standing up the web app.

### Highlights

- **Fair scores across shapes**: atomic / pipeline / composite each activate the dimensions that fit their structure; the pillar caps (20 / 25 / etc.) stay constant, so totals are directly comparable across types.
- **Pipeline & composite get the right questions**: 9 new reliability dimensions ask about routing design, sub-agent boundaries, IO protocol, partial-failure handling, sub-skill self-containment (pipeline), and tool index, orthogonality, consistency, discoverability (composite).
- **No more type-mismatched suggestions**: pipeline reports stop demanding `scripts/` fallback or a root-level schema rewrite; composite reports stop demanding a single linear workflow.
- **Cleaner dashboards**: each pillar shows only the dimensions applicable to the current skill type by default; the rest fold into a "show N dimensions not applicable" toggle at the bottom.
- **Shareable offline reports from the CLI**: `--output-dir` writes JSON + self-contained HTML + Markdown side by side. The HTML matches the web UI visually (brand colors, radar, dimension cards, ZH/EN toggle, dark mode) and **exports to PDF via the browser's Cmd+P** — zero extra dependency, no headless Chrome, no Pandoc.

### What's new

- New `applies_to: [atomic | pipeline | composite]` field on every rubric check and dimension, gating which skill types each criterion participates in.
- 5 pipeline-only dimensions under `reliability`: `pipeline_routing`, `pipeline_boundaries`, `pipeline_io_protocol`, `pipeline_partial_failure`, `pipeline_subskill_quality` (a rule-class scanner that walks every child SKILL.md for when-to-use and workflow sections).
- 4 composite-only dimensions under `reliability`: `composite_tool_index`, `composite_orthogonality`, `composite_consistency`, `composite_discoverability`.
- 8 existing checks scoped atomic-only (`scope_focus`, `steps_atomic`, `io_explicit`, `has_workflow`, `output_validation.*`); 2 scoped atomic + composite (`reference_layering`, `script_fallback`).
- CLI Agent prompt and web Deep Review prompt both inject pipeline / composite lens paragraphs that point the LLM at the new dimension IDs and the right evaluation standards.
- New CLI flag `--output-dir <dir>` writes three artifacts: `<skill-name>-report.{json,html,md}`. Under `--agent-prompt`, the prompt itself is also written as `<skill-name>-agent-deep-review-prompt.md` for easy hand-off to a code agent. Default stdout behavior is preserved when the flag is absent (no breaking change).
- HTML report features: tabbed General / Finance Expert view (Finance shown first when `--domain finance` is set), inline SVG radar, ZH/EN toggle persisted to `localStorage`, `?lang=zh|en` URL override, `@media print` styles tuned so Cmd+P produces a clean PDF without a headless browser pipeline.
- New CLI flag `--llm-language {auto,zh,en}` decouples the LLM answer language from the SKILL.md source language, so e.g. an English skill can still produce Chinese `evidence` / `fix` for a Chinese reviewer.
- Two pipeline example skills shipped: `pr-pipeline` (2 sub-agents, minimal) and `mega-pipeline` (53 sub-agents, realistic-scale stress test).
- **JSON schema additions** (relevant if you parse the output yourself or in CI): each check / dimension now carries `appliesTo`, `notApplicable`, and `originalWeight`. Existing fields are unchanged.

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

## 0.4.1 — 真双语 Deep Review

修复 HTML 报告里一个长期存在的错位：之前的中英切换只切 UI 标签（pillar 名、维度 tag、状态徽章），而 LLM 生成的 `evidence` 和 `fix` 文本一直停留在 LLM 当时被要求输出的那一种语言里。因此默认中文界面的读者在金融专家版里仍会看到大量英文诊断——因为金融专家版的支柱 100% 由 LLM 评估。

### 亮点

- **LLM 输出默认双语**。agent-side Deep Review prompt 现在要求 LLM 为每条结果同时输出中英两份（`evidence_zh` + `evidence_en`、`fix_zh` + `fix_en`、`value_type_reason_zh` + `value_type_reason_en`）。HTML 报告的中英切换现在真正切换正文，而不仅是标签。
- **不破坏旧报告**。`score.py --llm-results` 仍接受单语 LLM JSON（旧 `evidence` / `fix`）；CLI 会把它镜像到两种语言，旧报告继续可渲染。`evidence` 和 `fix` 仍保留在输出 schema 里，作为主语言别名。
- **token 预算逃生通道**。加 `--llm-language zh` 或 `--llm-language en` 强制单语输出（约省一半 LLM 输出 token）。HTML 报告两个 pane 都会回退到所选语言。

### 新增功能

- 每个 check 新增 JSON 字段：`evidence_zh`、`evidence_en`，以及（存在 fix 时）`fix_zh`、`fix_en`。`evidence` / `fix` 仍保留，默认等同英文版本，供向后兼容的下游消费方使用。
- `llmMeta` 新增字段：`value_type_reason_zh`、`value_type_reason_en`。旧 `value_type_reason` 保留。
- `suggestions` 与 `domainExpert.suggestions` 中的每一条建议新增字段：`title_zh`、`title_en`、`why_zh`、`why_en`、`how_zh`、`how_en`。旧 `title` / `why` / `how` 保留（值为主语言）。
- `--llm-language {auto,bilingual,zh,en}` —— `auto` 现在等同 `bilingual`（旧语义是"跟随 SKILL.md 源语言"）。`--help` 已同步说明。
- `engineVersion` 升到 `0.4.1`。
- `render_report.py` 优先读 `<field>_<lang>`，缺失时回退到旧 `<field>`，同一个 renderer 同时透明处理新旧两套 JSON。
- Markdown 导出（`*-report.md`）也已支持双语。

### 迁移说明

- **用新 CLI 重跑现有 skill**：照常跑三步流程（`--agent-prompt` → LLM 产出 JSON → `--llm-results`）。新 prompt 自动要求 LLM 双语输出，新 merge 步骤端到端保留。
- **复用旧 `agent-llm-results.json`**：开箱即用；报告会在两个 pane 显示同一份单语内容（优雅降级）。
- **第三方 JSON 消费方**：可继续读 `evidence` / `fix`；准备好后切换到 `evidence_zh` / `evidence_en` 即可启用双语。

## 0.4.0 — 类型感知评分标准 & 可分享离线报告

这一版同时落地两件相对独立的事。**其一**，评分标准（rubric）改为 skill 类型感知：pipeline 编排器与 composite 工具集不再被按 atomic 单体 skill 评分，报告不再出现"在根 SKILL.md 里把 schema 重写一遍"这种类型错配建议，转而问每种形态真正应该回答的问题。**其二**，CLI 现在能一键产出可分享的离线报告——JSON、GitHub-flavored Markdown，再加一份视觉对齐 Web UI、浏览器 Cmd+P 即可导出 PDF 的自包含 HTML——评测结果不必再起 web 应用就能直接分发。

### 亮点

- **三种形态分数公平可比**：atomic / pipeline / composite 各自启用一组适配的维度；pillar 上限（20 / 25 等）保持不变，三种类型的总分可以直接对比。
- **pipeline 与 composite 终于被问对问题**：reliability 下新增 9 个维度，针对 pipeline 评估路由设计、子 agent 边界、IO 协议、部分失败处理、子 skill 自洽性；针对 composite 评估工具索引、正交性、一致性、可发现性。
- **告别类型错配建议**：pipeline 报告不再要求加 `scripts/` 兜底或在根 SKILL.md 重写 schema；composite 报告不再要求一条线性 workflow。
- **报告默认只看相关项**：每个 pillar 默认只展示当前类型适用的维度，其余折叠在底部"查看 N 个不适用维度"按钮里，避免噪声。
- **CLI 一键导出可分享离线报告**：加 `--output-dir` 即可同时落盘 JSON + 自包含 HTML + GitHub-flavored Markdown 三件套。HTML 视觉与 Web UI 一致（品牌色、雷达图、维度卡、中英切换、暗色模式），**用浏览器打开后 Cmd+P 直接出 PDF**——零额外依赖，不需要 headless Chrome、不需要 Pandoc。

### 新增功能

- rubric 的每个 check 与 dimension 都新增 `applies_to: [atomic | pipeline | composite]` 字段，控制哪些 skill 类型参与该项评分。
- `reliability` pillar 新增 5 个 pipeline 专属维度：`pipeline_routing`、`pipeline_boundaries`、`pipeline_io_protocol`、`pipeline_partial_failure`、`pipeline_subskill_quality`（rule 类，自动扫描每个子 SKILL.md 是否含 when-to-use 与 workflow 章节）。
- `reliability` pillar 新增 4 个 composite 专属维度：`composite_tool_index`、`composite_orthogonality`、`composite_consistency`、`composite_discoverability`。
- 8 条已有 check 标记为 atomic-only（`scope_focus`、`steps_atomic`、`io_explicit`、`has_workflow`、`output_validation.*`）；2 条标记为 atomic + composite（`reference_layering`、`script_fallback`）。
- CLI Agent prompt 与 web Deep Review prompt 都注入 pipeline / composite lens 段落，把新维度 ID 与对应评估标准直接告诉 LLM。
- CLI 新增 `--output-dir <dir>` 参数，一次输出 `<skill-name>-report.{json,html,md}` 三份产物；`--agent-prompt` 模式下还会落盘 `<skill-name>-agent-deep-review-prompt.md`，方便直接交给 code agent。不加该参数时保留原有 stdout 行为，向后兼容。
- HTML 报告新特性：通用 / 金融专家版 tab 切换（启用 `--domain finance` 时金融视图默认在前）、内联 SVG 雷达图、中英切换并写入 `localStorage`、`?lang=zh|en` URL 覆盖、`@media print` 样式调优——Cmd+P 出的 PDF 不需要任何无头浏览器流水线。
- CLI 新增 `--llm-language {auto,zh,en}`，把 LLM 答复语言与 SKILL.md 源语言解耦——英文 skill 也能让 LLM 输出中文 `evidence` / `fix`，方便中文 reviewer 阅读。
- 新增 2 个 pipeline 示例：`pr-pipeline`（2 子 agent，最小演示）与 `mega-pipeline`（53 子 agent，真实规模压测）。
- **JSON schema 新增字段**（自定义解析输出 / CI 集成方需关注）：每个 check / dimension 上新增 `appliesTo`、`notApplicable`、`originalWeight`。原有字段保持不变。

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
