# Changelog

## 0.2.0

### Agent CLI

- Added official Agent CLI support for Cursor, WorkBuddy, Hermes, and similar code agents.
- Added the agent-side Deep Review workflow: `--agent-prompt` generates the official review prompt, the code agent uses its own model plan to produce JSON, and `--llm-results` validates and merges the final score through the SkillLens CLI.
- Added verified `deepReviewCertificate` output so official full Deep Review results can be distinguished from rule-only previews or ad hoc agent-generated reports.
- Added direct `.zip` input support to the SkillLens CLI, matching the Web upload flow for user-provided skill packages.
- Added `skills/skill-scorer/USAGE.md` as the single detailed contract for Agent CLI usage, including the three-step workflow, certificate requirements, and copy-paste prompts for code agents.

### Web

- Added browser-origin protection for `/api/llm` so public Web deployments can protect server-side model keys from direct tool calls.
- Reorganized README files so root docs describe the two entry points, Web docs stay focused on Web deployment, and Agent CLI workflow details live in `USAGE.md`.

# 更新日志

## 0.2.0

### Agent CLI

- 新增官方 Agent CLI 调用支持，面向 Cursor、WorkBuddy、Hermes、小龙虾等 code agent。
- 新增 agent-side Deep Review 三步工作流：`--agent-prompt` 生成官方评测提示词，code agent 使用自己的模型套餐产出 JSON，`--llm-results` 再通过 SkillLens CLI 校验并合并最终评分。
- 新增可验证的 `deepReviewCertificate` 输出，用于区分官方完整 Deep Review、规则分预览，以及 agent 临时生成的非官方报告。
- SkillLens CLI 新增直接支持 `.zip` 输入，对齐 Web 端用户上传 skill 压缩包的体验。
- 新增 `skills/skill-scorer/USAGE.md`，作为 Agent CLI 的唯一详细调用契约，包含三步工作流、证书要求和可复制给 code agent 的提示词。

### Web

- 为 `/api/llm` 新增浏览器来源保护，公网 Web 部署时可避免工具直连消耗服务端模型 key。
- 重新整理 README 结构：根文档说明 Web / Agent CLI 两种入口，Web 文档聚焦部署，Agent CLI 工作流细节集中到 `USAGE.md`。
