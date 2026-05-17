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

**包形态**（自动识别 + 可手动指定 `--skill-type`）：

- **atomic**：单个 `SKILL.md`，或一个 SKILL.md + `scripts/` `references/` `assets/` `tests/` `*.schema.json` `requirements.txt` 等附属文件的目录。
- **pipeline**：含多个子 SKILL.md 的"编排器"包，根 SKILL.md 是 router，业务逻辑下沉在 `agents/<sub-agent>/SKILL.md` 或子目录里。CLI 与 Web 都会自动识别（≥1 个子 SKILL.md 即视为 pipeline），并切换到 pipeline lens 评测视角。
- **composite**：含多个独立 SKILL.md 的"工具集"包（每个子 SKILL.md 是一件独立工具，根 SKILL.md 主要负责索引与路由说明）。需要通过 `--skill-type composite`（CLI）或 Uploader 上方"Composite"卡片（Web）显式指定。
- **打包格式**：以上三种都支持 `.zip` 上传——压缩包会被解压、按目录原样评测。

**兼容的 Skill 生态**：Claude / OpenClaw / Cursor 三套 frontmatter 与目录约定都能正确解析；只要根目录有 `SKILL.md` 且含基本 frontmatter（`name` + `description`），SkillLens 就能跑评分。

**输入来源**：本地路径（CLI / Web 拖拽）、`.zip` 上传、Web 端的"载入示例"。Web UI 暂不直接支持 GitHub URL 拉取，code agent 路径下可以由 agent 先 clone 再传本地路径。

**内置示例**：`skills/skill-scorer/examples/` 下共 11 个示例——1 个通用 atomic（`pr-reviewer`）、2 个 pipeline（`pr-pipeline` / `mega-pipeline`，含 53 子 agent 的大规模压测样本）、8 个金融场景 atomic（每个对应金融专家版的一个 `--scenario`，其中 `stock-trading-analyst` 是最完整、含 schema/scripts/tests/references 的金融示例）。Web 端"载入示例"按钮会按当前评测模式自动映射对应的 skill。

## 两种使用入口

SkillLens 现在分成两条清晰路径：

- **Web UI**：给人使用。上传 `SKILL.md`、skill 文件夹或 `.zip`，在浏览器里生成报告。详见 `web/README.md`。
- **Agent CLI**：给 Cursor、WorkBuddy、Hermes、小龙虾等 code agent 使用。通过官方 CLI 和证书机制完成 agent-side Deep Review，也支持 `--domain finance --scenario <scenario-id>` 金融专家版。详见 `skills/skill-scorer/USAGE.md`。

## 输出结果

无论从 Web UI 还是 CLI 进入，评分逻辑和 rubric 都是同一套；差异在于"看到的形态"。

### Web UI 上你会看到

- **总分卡 + 等级**：100 分制总分、`S / A / B / C / D` 等级、5 维雷达图
- **5 大支柱与维度证据卡**：每个 check 的 pass / partial / fail / not_applicable 状态、证据引用、fix 建议
- **Top 改进建议**：按权重影响排序的可执行清单
- **金融专家版 tab**（启用时）：通用 / 金融两个 tab 切换，金融视图默认在前，含风险等级与商业成熟度
- **市场调研信号**：基于 GitHub Search 的同类 skill 与替代品提示
- **导出**：JSON / 复制 Markdown / 生成 PDF
- **中英双语切换**：界面与报告内容都支持

未配置模型 key 时，自动用 mock 分数进入预览模式，UI 仍可完整体验。

### CLI 输出

默认把 JSON 评分写到 stdout。加 `--output-dir <dir>` 同时落盘三份产物（视觉与 Web 一致，**浏览器打开后 Cmd+P 即可导出 PDF**，无需任何额外依赖）：

```text
<skill-name>-report.json   原始评分 JSON（与 stdout 同内容）
<skill-name>-report.html   自包含单文件 HTML（含 ZH/EN 切换、@media print 打印样式）
<skill-name>-report.md     GitHub-flavored Markdown
```

`--agent-prompt` 模式下，`--output-dir` 还会落盘 `<skill-name>-agent-deep-review-prompt.md`。

报告语言默认跟随 SKILL.md 主语言；`--llm-language {auto,zh,en}` 可强制 LLM 答复语言（例如英文 skill 让 LLM 出中文 evidence / fix）。

## 快速开始

两条路径平行存在，按需选择即可。

### Web UI（给人用）

```bash
cd web
npm install
cp .env.example .env.local      # 可选：填模型 key
npm run dev                     # 打开 http://localhost:3000
```

填模型 key 才能跑完整 Deep Review，至少填一个：

```env
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
```

公网部署时保留浏览器同源保护，避免外部工具直接打 `/api/llm` 消耗你的额度：

```env
LLM_REQUIRE_BROWSER_REQUEST=1
```

需要服务端到服务端调用可额外设置 `LLM_ACCESS_TOKEN`。其他可选环境变量、安全注意事项见 [`web/README.md`](web/README.md)。

### CLI（给 code agent 用）

不需要任何 key 就能跑规则分预览：

```bash
# 规则分预览（rule-only）
python3 skills/skill-scorer/scripts/score.py <path-to-skill>

# 大型 / 多子 skill 包：可显式指定类型（默认自动识别）
python3 skills/skill-scorer/scripts/score.py --skill-type pipeline <path-to-package>

# 导出 HTML + Markdown + JSON 三件套
python3 skills/skill-scorer/scripts/score.py --output-dir ./out <path-to-skill>
```

需要完整 Deep Review 时用交互式向导，由 CLI 引导选择通用 / 金融专家版并打印官方三步命令：

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill>
```

完整调用契约（`--agent-prompt` → 模型 JSON → `--llm-results` 三步流、`deepReviewCertificate` 证书校验、金融专家版 `--domain finance --scenario <id>` 参数、可粘贴给 code agent 的提示词）见 [`skills/skill-scorer/USAGE.md`](skills/skill-scorer/USAGE.md)。

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

**Web 端**（Next.js / TypeScript）：

```bash
cd web
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run build       # 生产构建
```

**CLI / rubric 端**（Python，无虚拟环境，仅依赖 `pyyaml`）：

```bash
# 改完 rubric.yaml 后必跑：检查 web/lib/rubric/rubric.ts 镜像是否同步
python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py --check

# 镜像不同步时直接重新生成
python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py

# 跑某个 example skill 的规则分回归（不耗 LLM 额度，秒级返回）
python3 skills/skill-scorer/scripts/score.py skills/skill-scorer/examples/pr-reviewer
```

修改 rubric 后请同时回归 atomic / pipeline / composite 三种类型的样例（`pr-reviewer` / `pr-pipeline` / 自建 composite fixture），确保 `applies_to` 过滤和 pillar 归一化没被破坏。Web 部署细节见 [`web/README.md`](web/README.md)。

## 安全注意事项

- 不要提交 `.env.local`、`.env` 或任何真实 API Key。
- 不要通过 `NEXT_PUBLIC_*` 环境变量暴露密钥。
- 公网部署且服务端有模型 key 时，请保持 `LLM_REQUIRE_BROWSER_REQUEST=1`。
- 如果某个 key 曾经被提交、贴到 issue、出现在截图或日志中，请立即在服务商后台轮换。
- 发布前建议做一次密钥扫描，例如运行 `gitleaks detect --source .`。

## License

MIT
