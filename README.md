# SkillLens

[简体中文](README.md) | [English](README.en.md)

## 产品演示

https://github.com/user-attachments/assets/8bc9bfce-bfe5-4c3a-a915-9aaf1520969e

SkillLens 是一个开源、自托管的 Web 工具，用来评测 **Agent Skills**。你可以上传一个 `SKILL.md`、一个 skill 文件夹，或一个 skill 压缩包，SkillLens 会生成量化报告，包括评分细则、证据、SkillLens Deep Review、市场信号和可执行的改进建议。

它面向正在为 Cursor、Claude、OpenClaw 或类似 Agent 生态构建 skill 的开发者，帮助你回答一个核心问题：

这个 skill 是否真的有用、可靠、容易被发现，并且值得发布？

## 最值得一试的地方

SkillLens 不只是检查 `SKILL.md` 写没写对，而是把一个 skill 当成“可发布的 AI 产品雏形”来评估。它会同时看清晰度、真实需求、商业价值、差异化、运行成本、稳定性和可维护性，帮你判断这个 skill 是“格式合格”，还是“真的值得别人安装和反复使用”。

- **从“写得规范”提升到“值不值得做”**：不仅看 frontmatter、章节和示例，也会评估目标用户、使用频率、价值主张和沉淀潜力。
- **把主观评审变成可调权重的量化报告**：5 大支柱、24 个子维度都有默认权重，也可以按你的团队标准自定义。
- **同时考虑市场和替代风险**：不仅问“这个 skill 能不能跑”，还会问“它和通用 LLM、Copilot、CodeQL、现有开源工具相比有什么独特价值”。
- **关注真实落地成本**：会检查上下文预算、分层加载、外部依赖、缓存友好度，避免 skill 看起来很强但每次运行都很贵、很慢或很脆弱。
- **输出可执行改进建议**：报告会给出证据、分数、等级和 Top 改进项，适合开源发布前自检、团队内部评审或 marketplace 提交前打磨。
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

SkillLens 使用 5 大支柱、24 个子维度的 100 分制评分模型。下面是默认权重：

| 支柱 | 默认权重 | 子维度 |
|---|---:|---|
| Skill 价值 | 25 | 目标用户清晰度 5；用户需求真实度 6；价值主张清晰度 5；复用价值 5；沉淀 / 记忆点潜力 4 |
| 市场竞争力 | 15 | 差异化 5；聚焦度 4；通用模型可替代风险 3；竞品调研意识 3 |
| 运行成本 | 15 | 上下文预算 4；分层加载 4；外部依赖重量 4；可缓存性 3 |
| 效果稳定性 | 20 | 任务模型匹配度 5；脚本兜底 4；输出校验 4；幂等性 3；异常路径 2；边界情况 2 |
| 书写质量 | 25 | 元数据规范性 4；可发现性 5；结构与可读性 3；可执行性 6；安全合规 3；可维护性 4 |

所有支柱和子维度的权重都可以在 Web 界面中自定义。默认权重适合通用开源 skill 评测；如果你更关心商业价值、运行成本或内部交付稳定性，可以按自己的场景调整。

评分标准位于 `skills/skill-scorer/rubric/rubric.yaml`，它是 Web 应用和 skill-scorer 工作流共用的单一事实源。

## 支持的输入

SkillLens 可以评测：

- 单个 `SKILL.md`
- 包含 `scripts/`、`references/`、`assets/`、测试、schema 或示例的 skill 文件夹
- 打包后的 skill `.zip`
- Claude 风格 skill
- OpenClaw 风格 skill
- Cursor 兼容的 skill 项目

仓库内置了一个示例 skill：`skills/skill-scorer/examples/pr-reviewer`。它是一个 PR 评审 skill，用来展示结构良好的 skill 应该长什么样。

## 输出结果

SkillLens 会生成：

- 总分和等级：`S / A / B / C / D`
- 雷达图和支柱维度拆解
- 规则检查结果：pass / partial / fail
- 可选的 LLM 深度评审
- 基于 GitHub Search 的市场调研信号
- Top 改进建议
- 可导出的评测报告

如果没有配置模型 API Key，SkillLens 仍然可以用 mock 分数进入预览模式，方便先体验 UI。

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

真实 key 必须只保存在 `.env.local` 或部署平台的 Secret Manager 中，不要提交到 GitHub。

## 仓库结构

```text
.
├── README.md
├── README.en.md
├── LICENSE
├── skills/
│   └── skill-scorer/
│       ├── SKILL.md
│       ├── rubric/rubric.yaml
│       ├── scripts/
│       ├── references/
│       └── examples/pr-reviewer/
└── web/
    ├── app/
    ├── components/
    ├── lib/
    ├── .env.example
    └── README.md
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
- 如果某个 key 曾经被提交、贴到 issue、出现在截图或日志中，请立即在服务商后台轮换。
- 发布前建议做一次密钥扫描，例如运行 `gitleaks detect --source .`。

## License

MIT
