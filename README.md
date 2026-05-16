# SkillLens

[简体中文](README.md) | [English](README.en.md)

## 产品演示

https://github.com/user-attachments/assets/8bc9bfce-bfe5-4c3a-a915-9aaf1520969e

SkillLens 是一个开源、自托管的 Web 工具，用来评测 **Agent Skills**。你可以上传一个 `SKILL.md`、一个 skill 文件夹，或一个 skill 压缩包，SkillLens 会生成量化报告，包括评分细则、证据、SkillLens Deep Review、市场信号和可执行的改进建议。

它面向正在为 Cursor、Claude、OpenClaw 或类似 Agent 生态构建 skill 的开发者，帮助你回答一个核心问题：

这个 skill 是否真的有用、可靠、容易被发现，并且值得发布？

## 当前能力地图

| 能力 | 入口 | 适合谁 | 说明 |
|---|---|---|---|
| 通用量化评测 | Web UI / CLI | 所有 skill 作者 | 5 大支柱、100 分制总分；按 skill 结构（atomic / pipeline / composite）启用差异化子维度 |
| SkillLens Deep Review | Web UI / Agent CLI | 需要 LLM 深度判断的团队 | LLM 只评估主观项，规则项仍由官方 scorer 决定 |
| 金融专家版 | Web UI / Agent CLI | 金融、投研、量化、银行、投教场景 | 在通用总分之外增加 `domainExpert` 专业附加报告 |
| Agent-side 官方评测 | CLI | Cursor / WorkBuddy / Hermes 等 code agent | 通过 `--agent-wizard` 引导选择版本，并用证书确认结果可信 |

## 最值得一试的地方

SkillLens 不只是检查 `SKILL.md` 写没写对，而是把一个 skill 当成“可发布的 AI 产品雏形”来评估。它会同时看清晰度、真实需求、商业价值、差异化、运行成本、稳定性和可维护性，帮你判断这个 skill 是“格式合格”，还是“真的值得别人安装和反复使用”。

- **从“写得规范”提升到“值不值得做”**：不仅看 frontmatter、章节和示例，也会评估目标用户、使用频率、价值主张和沉淀潜力。
- **把主观评审变成可调权重的量化报告**：5 大支柱的默认权重透明，子维度按 skill 类型自动启用，并可以按你的团队标准自定义。
- **三类型差异化标准**：atomic / pipeline / composite 三种结构形态各自有专属维度——pipeline 评估路由设计、子 agent 边界、IO 协议；composite 评估工具索引、正交性、一致性。不会再用单一文档型标准误判流水线和工具集。
- **同时考虑市场和替代风险**：不仅问“这个 skill 能不能跑”，还会问“它和通用 LLM、Copilot、CodeQL、现有开源工具相比有什么独特价值”。
- **关注真实落地成本**：会检查上下文预算、分层加载、外部依赖、缓存友好度，避免 skill 看起来很强但每次运行都很贵、很慢或很脆弱。
- **输出可执行改进建议**：报告会给出证据、分数、等级和 Top 改进项，适合开源发布前自检、团队内部评审或 marketplace 提交前打磨。
- **新增金融专家版**：上传页可以选择金融场景，额外生成 Finance Expert Score、风险等级和商业成熟度，覆盖投融资、创业、量化、炒股、证券研究、银行流程等场景。
- **支持中英文切换**：界面和报告可在中文 / English 之间切换，方便中文团队和国际开源用户共同使用。
- **自托管、可预览、可扩展**：没有模型 key 也能用 mock 模式体验 UI；配置自己的 key 后可启用完整 Deep Review。

## 为什么需要 SkillLens

Agent Skills 正在变成一种可复用的软件资产：它们把指令、工作流、脚本、参考资料、schema 和示例封装在一起，让 AI Agent 更稳定地完成某类专门任务。

但一个 skill 看起来完整，不代表实际好用。常见问题包括触发条件模糊、目标用户不清、输入输出没写明、缺少异常处理、示例薄弱、上下文成本过高，或者价值主张让人看不懂。

SkillLens 可以帮助 skill 作者和团队：

- **量化评估 skill 质量**：使用透明的 100 分制评分标准。
- **定位具体短板**：避免只得到“再优化一下”这种模糊反馈。
- **一致地比较不同 skill**：兼容 Cursor / Claude / OpenClaw 风格的 skill 包。
- **提升发布准备度**：适合提交市场、团队内共享或开源前自检。
- **生成可导出的评测报告**：便于复盘、迭代和文档沉淀。

## 评测什么

SkillLens 用 5 大支柱、100 分制评分。rubric 共 34 个子维度，按 skill 结构通过 `applies_to` 字段自动启停：atomic 启用 25 个，pipeline 启用 26 个（含 5 个 pipeline 专属），composite 启用 27 个（含 4 个 composite 专属）。

通用骨架：

| 支柱 | 默认权重 | 通用子维度 |
|---|---:|---|
| Skill 价值 | 25 | 目标用户清晰度 5；用户需求真实度 6；价值主张清晰度 5；复用价值 5；沉淀 / 记忆点潜力 4 |
| 市场竞争力 | 15 | 差异化 5；聚焦度 4 ⓐ；通用模型可替代风险 3；竞品调研意识 3 |
| 运行成本 | 15 | 上下文预算 4；分层加载 4 ⓐⓒ；外部依赖重量 4；可缓存性 3 |
| 效果稳定性 | 20 | 任务模型匹配度 5；脚本兜底 4 ⓐⓒ；输出校验 4 ⓐ；幂等性 3；异常路径 2；边界情况 2 |
| 书写质量 | 25 | 元数据规范性 4；可发现性 5；结构与可读性 3（含 ## Workflow ⓐ）；可执行性 6（含 steps_atomic ⓐ + io_explicit ⓐ）；安全合规 3；可维护性 4 |

ⓐ = 仅 atomic 适用 · ⓒ = atomic + composite 适用 · 未标注 = 三类型通用。

按 skill 类型新增的专属维度（reliability pillar 内）：

| 类型 | 专属维度 | 总权重 |
|---|---|---:|
| **atomic** | 仅使用通用骨架（脚本兜底、输出校验等都生效） | — |
| **pipeline** | `pipeline_routing` 5 · `pipeline_boundaries` 4 · `pipeline_io_protocol` 3 · `pipeline_partial_failure` 2 · `pipeline_subskill_quality` 2（rule） | 16 raw |
| **composite** | `composite_tool_index` 4 · `composite_orthogonality` 3 · `composite_consistency` 2 · `composite_discoverability` 2 | 11 raw |

`applies_to` 归一化机制会把 pipeline 的 raw 28 weight 和 composite 的 raw 27 weight 都映射回 reliability pillar 的 20 分上限，让三种类型的 pillar 满分仍是 20。

所有支柱和子维度权重都可以在 Web 界面里自定义。默认值对一般开源 skill 已经够用；要按团队标准调整就调。

评分标准位于 `skills/skill-scorer/rubric/rubric.yaml`——Web 应用与 CLI 共用的单一事实源。改动后跑 `python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py` 就能把镜像同步到 `web/lib/rubric/rubric.ts`。

金融专家版的领域评分标准位于 `skills/skill-scorer/domains/finance/rubric.yaml`。它作为通用总分之外的专家附加报告，不替代默认 100 分通用评分。不同金融子场景会使用不同的权重、专属检查项和 LLM 评测重点。

## 支持的输入

SkillLens 可以评测：

- 单个 `SKILL.md`
- 包含 `scripts/`、`references/`、`assets/`、测试、schema 或示例的 skill 文件夹
- 打包后的 skill `.zip`
- Claude 风格 skill
- OpenClaw 风格 skill
- Cursor 兼容的 skill 项目

仓库内置示例位于 `skills/skill-scorer/examples/`：

- `pr-reviewer`：通用 PR 评审示例。
- `stock-trading-analyst`：高完整度炒股 / 短线 / 盯盘金融示例，包含 schema、脚本、测试和参考资料。
- 其他金融子场景示例：投融资、量化交易、证券研究、银行流程、金融教育、金融数据分析和其他金融场景。

## 两种使用入口

SkillLens 现在分成两条清晰路径：

- **Web UI**：给人使用。上传 `SKILL.md`、skill 文件夹或 `.zip`，在浏览器里生成报告。详见 `web/README.md`。
- **Agent CLI**：给 Cursor、WorkBuddy、Hermes、小龙虾等 code agent 使用。通过官方 CLI 和证书机制完成 agent-side Deep Review，也支持 `--domain finance --scenario <scenario-id>` 金融专家版。详见 `skills/skill-scorer/USAGE.md`。

## Agent CLI

Cursor、WorkBuddy、Hermes、小龙虾等 code agent 可以把 SkillLens 当作本地官方工具调用。Agent CLI 支持 `.zip` / 目录 / `SKILL.md`，完整 agent-side Deep Review 使用 code agent 自己的模型套餐，不消耗 SkillLens 服务端 key。

详细命令、三步工作流、证书验真、金融专家版参数和可复制给 code agent 的提示词，都集中在 `skills/skill-scorer/USAGE.md`。Code agent 使用时建议先运行 `--agent-wizard`，由 CLI 引导用户选择通用评测或金融专家版；如果选择金融专家版，还会继续确认具体金融场景。

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill>
```

如果只是想快速看规则分，可以直接运行：

```bash
python3 skills/skill-scorer/scripts/score.py <path-to-skill>
```

## 输出结果

SkillLens 会生成：

- 总分和等级：`S / A / B / C / D`
- 雷达图和支柱维度拆解
- 规则检查结果：pass / partial / fail
- 可选的 LLM 深度评审
- 可选的金融专家版附加报告：`domainExpert.score`、`riskLevel`、`commercialReadiness`
- 基于 GitHub Search 的市场调研信号
- Top 改进建议
- 可导出的评测报告

如果没有配置模型 API Key，SkillLens 仍然可以用 mock 分数进入预览模式，方便先体验 UI。

### CLI 一键导出 HTML / Markdown 报告

CLI 默认会把 JSON 评分写到 stdout。如果要给团队、客户或开源 README 看，加一个 `--output-dir` 就能在指定目录里同时生成 **三份产物**：

```bash
python3 skills/skill-scorer/scripts/score.py \
  --llm-results agent-llm-results.json \
  --domain finance --scenario stock_trading \
  --output-dir ./out \
  <path-to-skill>

# ./out/<skill-name>-report.json   ← 原始 JSON（同 stdout 输出）
# ./out/<skill-name>-report.html   ← 自包含单文件 HTML，零依赖
# ./out/<skill-name>-report.md     ← GitHub-flavored markdown
```

HTML 报告的视觉风格与 `web/` 端完全一致：暖色调 brand 主色、glass 卡片、5 大支柱配色、双 KPI 卡（通用 + 金融）、内联 SVG 雷达图、暗色模式、`@media print` 优化样式。启用了金融专家版时，详细报告会以 **「金融专家版 / 通用版」 tab** 切换展示，默认进入金融视图（与 web 端 `activeReportTab` 行为一致）；hero 摘要和证书永远在 tab 之外作为全局信息。**用浏览器打开后按 Cmd+P 即可导出漂亮 PDF**——打印时会自动同时输出金融和通用两份完整章节，不需要装额外依赖。

`--agent-prompt` 模式同样支持 `--output-dir`，会把 deep review 提示词写成 `<skill-name>-agent-deep-review-prompt.md`。

### Pipeline / 多子 skill 包评测

当被测的 skill 包不是单一 SKILL.md 而是含多个子 SKILL.md 的"流水线"或"工具集"时，SkillLens 自动识别结构并切换评测视角，避免给出"在主 SKILL.md 里把 schema / workflow 重写一遍"这种 atomic-style 噪声建议。

**核心机制**：

- **自动检测 + 显式覆盖**：CLI 用 `--skill-type {auto,atomic,pipeline,composite}`（默认 `auto`）；Web Uploader 上方提供 4 选项卡片。`auto` 会数子 SKILL.md 数量，≥1 个就标记为 pipeline。
- **三类型差异化 rubric**：见上文「评测什么」。每条 check 通过 `applies_to: [atomic|pipeline|composite]` 字段声明适用范围，不在名单里的直接 `not_applicable`、不送 LLM、不进 Top 改进建议、也不进 pillar 分母。一个 dim 下所有 check 都被过滤时，整个 dim 退出归一化（剩余 dim 自动重分布权重）。
- **pipeline / composite lens prompt**：CLI 与 Web 都会在 system prompt 里注入一段"不要按 atomic 标准扣分；评估重点是路由清晰度 / 子 agent 边界 / IO 协议 / 部分失败处理 / 子 skill 自洽"等指令，引导 LLM 在新维度上给出有意义的 evidence 和 fix。
- **附件优先级**：所有子 SKILL.md 优先打包给 LLM（每份 8000 字符配额，永不被挤掉），其他附件维持 4000 字符。
- **报告展示**：HTML / Markdown / Web 三端的 meta 卡片显示 `Skill type: pipeline (auto-detected)`，下方独立卡片列出全部子 SKILL.md。每个 pillar 默认只展开当前类型适用的 dim；fully N/A 的 dim 折叠到底部一个"查看 N 个对当前 skill 类型不适用的维度"按钮里，避免噪声。

```bash
# CLI: 指定为 pipeline，强制用 pipeline lens
python3 skills/skill-scorer/scripts/score.py \
  --skill-type pipeline \
  --output-dir ./out \
  ./my-pipeline-package

# CLI: 默认 auto，按子 SKILL.md 数量自动判断
python3 skills/skill-scorer/scripts/score.py --output-dir ./out ./my-skill
```

**扩展指南**：要给更多 check 设置 scope，在 `rubric.yaml` 加 `applies_to` 字段，再跑 `python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py` 同步到 web 镜像。新增 pipeline / composite 专属维度还需要在 `scripts/score.py::render_skill_type_block` 与 `web/lib/llm/prompts.ts::renderSkillTypeBlock` 里给 LLM 一段 lens 提示，让 LLM 知道有这条新 dim 该如何评估。完整的 applies_to 清单与扩展示例见 [`skills/skill-scorer/USAGE.md`](skills/skill-scorer/USAGE.md#rubric-scope-filter-applies_to)。

### 报告 UI 中英文切换

HTML 报告内置中英双语视图：默认中文，header 右上角的 `EN / 中` 按钮一键切换，选择会写入 localStorage 记忆；URL 加 `?lang=zh` / `?lang=en` 可强制覆盖（适合分享单语版本）。打印 PDF 时只会输出当前选中的那一份语言。

但 LLM 返回的 `evidence` / `fix` 文字以及子 SKILL.md 的 description 是 **作者 / 模型原始内容**，HTML 渲染层不会改写——它们的语言由生成时决定：

- **CLI**：`--llm-language {auto,zh,en}`（默认 `auto`，跟随 SKILL.md 检测语言）。想让英文 skill 出中文 evidence/fix，加 `--llm-language zh` 即可——CLI 会在 agent prompt 里注入一段"用简体中文回答"的指令，code agent 调 LLM 时自动遵循。
- **Web**：`runLlmReview(skill, rubric, { lang, outputLang: "zh" })` 透传 `outputLang`；`req.lang` 控制 prompt 主体（system / checks 描述）的语言，`outputLang` 单独控制 LLM 作答语言。

```bash
# 英文 skill，但要中文 Deep Review 报告
python3 skills/skill-scorer/scripts/score.py \
  --agent-prompt --llm-language zh ./my-english-skill > prompt.md
```

## 快速开始

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:3000`。

## 配置模型 Key

如果要启用完整的 Deep Review，请在 `web/.env.local` 中至少填写一个模型服务商 key：

```env
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
```

如果部署到公网，建议开启浏览器同源保护，避免陌生用户或工具直接调用 `/api/llm` 消耗你的模型额度：

```env
LLM_REQUIRE_BROWSER_REQUEST=1
```

设置后，正常网页按钮无需输入令牌；接口只接受来自 SkillLens 页面发起的同源浏览器请求。若你还需要私有的服务端到服务端调用，可以额外设置 `LLM_ACCESS_TOKEN`，并在请求里携带 `x-skilllens-llm-token` 或 `Authorization: Bearer ...`。

真实 key 必须只保存在 `.env.local` 或部署平台的 Secret Manager 中，不要提交到 GitHub。

## 仓库结构

```text
.
├── README.md / README.en.md / CHANGELOG.md / LICENSE
├── skills/
│   └── skill-scorer/                # 给 code agent / CLI 使用的 skill 包
│       ├── SKILL.md                 # 入口描述（when-to-use / outputs / workflow）
│       ├── USAGE.md                 # Agent CLI 官方调用契约
│       ├── rubric/rubric.yaml       # 通用评分单一事实源（含 applies_to）
│       ├── domains/finance/         # 金融专家版 rubric + 8 个子场景
│       ├── scripts/
│       │   ├── score.py             # 官方 CLI（rule + agent-prompt + merge）
│       │   ├── render_report.py     # HTML / Markdown 渲染（与 web 视觉对齐）
│       │   └── sync_rubric_to_ts.py # 同步 rubric.yaml → web/lib/rubric/rubric.ts
│       ├── references/              # 最佳实践等参考资料
│       └── examples/                # 通用 + 金融子场景示例
└── web/                             # Next.js App Router 前端
    ├── app/
    │   ├── page.tsx                 # 主报告页面（dashboard / pillar / suggestions）
    │   └── api/                     # /api/llm · /api/market · /api/sample
    ├── components/                  # Uploader / PillarSection / SubSkillsCard 等
    ├── lib/
    │   ├── rubric/                  # rubric.ts（YAML 镜像）+ types.ts
    │   ├── scoring/                 # 规则引擎 / 聚合 / LLM 客户端
    │   ├── llm/                     # provider / prompts / cache / types
    │   ├── domain/                  # 金融专家版逻辑
    │   ├── market/                  # 市场调研（GitHub Search）
    │   └── spec/                    # SKILL.md / 子 SKILL.md 解析
    ├── .env.example
    └── README.md                    # 仅讲 Web 部署 / 配置
```

## 开发

```bash
cd web
npm run lint
npm run typecheck
npm run build
```

更多运行和配置细节见 `web/README.md`。

## 安全注意事项

- 不要提交 `.env.local`、`.env` 或任何真实 API Key。
- 不要通过 `NEXT_PUBLIC_*` 环境变量暴露密钥。
- 公网部署且服务端有模型 key 时，请保持 `LLM_REQUIRE_BROWSER_REQUEST=1`。
- 如果某个 key 曾经被提交、贴到 issue、出现在截图或日志中，请立即在服务商后台轮换。
- 发布前建议做一次密钥扫描，例如运行 `gitleaks detect --source .`。

## License

MIT
