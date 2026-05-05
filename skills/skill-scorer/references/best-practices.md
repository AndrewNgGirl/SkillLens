# Skill 写作最佳实践（三规范通用）

> 本文件作为 `skill-scorer` 评分时的参考锚点，也可独立阅读。所有要点均同时适用于 Cursor、Claude(Anthropic)、OpenClaw 三套规范。

## 1. Frontmatter：少而准

- **必填**：`name`（kebab-case）、`description`。
- **推荐**：`version`、`license`、`tags`。
- `description` 是模型"该不该触发你"的唯一依据：
  - **第三人称**、避免"I/我"；
  - 明确写 **"Use when ..."**（中文版："用于…"/"当用户…"）；
  - 覆盖同义触发词（例如 "grade / rate / score / audit / 评分 / 审计"）；
  - 控制在规范上限内（Cursor/Claude ≤ 1024 chars；OpenClaw ≤ 512 chars）。

## 2. 结构：workflow 是灵魂

- 顶层 H1 = skill 名。
- 建议二级标题：`When to use` / `Inputs` / `Outputs` / `Workflow` / `Guardrails` / `Files`。
- `Workflow` 必须有 **编号步骤**，每步一个原子动作，能被 Agent 直接执行。

## 3. 可执行性：让 Agent 不用猜

- 明确每一步的：**输入、输出、前置条件、调用的工具/命令**。
- 工具调用用 fenced code block 包裹，含完整参数示例。
- 避免"也许"、"可能"、"看情况"等模糊副词堆积。

## 4. 上下文效率：分层加载

- `SKILL.md` 只放"决定是否触发 + 顶层流程"。
- 细节下沉到：
  - `references/`（长文档、规范节选）
  - `scripts/`（确定性子程序）
  - `assets/`（模板、示意图、配置）
- 经验阈值：`SKILL.md` 不超过 ~500 行 / ~2000 tokens。

## 5. 完备性

- 至少一个 **端到端示例**（输入 → 步骤 → 输出）。
- 显式声明 **边界**（"不适用于…"）。
- 常见失败模式 & 兜底策略。

## 6. 安全与合规

- 破坏性动作（`rm -rf` / `git push --force` / SQL `DROP` / 文件删除等）必须**显式标红**并要求二次确认。
- 凭证/密钥：**只从环境变量读取**，严禁嵌入示例。
- 最小权限：只声明真正用得到的工具/域名。

## 7. 可维护性

- `version` 跟随 semver 或日期版本。
- 有 `CHANGELOG.md` 或 SKILL 内显式更新记录。
- 提供 1 条以上可验证的样例（输入 + 期望输出），供自测。

## 8. 跨规范可移植性（Bonus）

- 避免使用仅某一家支持的 frontmatter 字段。
- 不硬编码某一家的工具名、路径或模型名；必要时通过抽象层调用。
- 在 `## When to use` 中用自然语言描述触发条件，而非依赖特定平台的 trigger 机制。
