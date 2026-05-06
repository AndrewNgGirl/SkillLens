/**
 * 最小 i18n 词条表。跟随 skill language 使用。
 */
export type Lang = "zh" | "en";

type Dict = {
  appName: string;
  tagline: string;
  uploadHint: string;
  uploadCta: string;
  pasteHint: string;
  pasteCta: string;
  sampleLabel: string;
  runEval: string;
  evalRunning: string;
  resetWeights: string;
  weights: string;
  weightsHint: string;
  totalScore: string;
  grade: string;
  spec: string;
  generatedAt: string;
  dimensions: string;
  checks: string;
  evidence: string;
  suggestions: string;
  suggestionsEmpty: string;
  statusPass: string;
  statusPartial: string;
  statusFail: string;
  statusNA: string;
  checkTypeRule: string;
  checkTypeLLM: string;
  llmDisabledNote: string;
  llmEnable: string;
  llmRunning: string;
  llmDone: string;
  llmFailed: string;
  llmRateLimited: string;
  llmMockBanner: string;
  llmCached: string;
  llmProvider: string;
  exportPdf: string;
  exportJson: string;
  copyReport: string;
  dropFile: string;
  langToggle: string;
  bonus: string;
  nowLabel: string;
  fixLabel: string;
  evidenceSourceLabel: string;
  evidenceSourceNames: Record<string, string>;
  confidenceLabel: string;
  confidencePolicyNames: Record<string, string>;
  showExample: string;
  severityHigh: string;
  severityMedium: string;
  suggestionsIntro: string;
  llmErrorTitle: Record<string, string>;
  llmErrorHint: Record<string, string>;
  llmErrorDetail: string;
  llmRetry: string;
  // ---- v3 新增 ----
  pillarsTitle: string;
  pillarRoleDecidesCeiling: string;
  pillarRoleDecidesBreakout: string;
  pillarRoleDecidesScale: string;
  pillarRoleDecidesDeploy: string;
  pillarRoleBaseline: string;
  pillarLlmCoverage: string;       // "需要 LLM 评测才能给分"
  pillarLlmPartial: string;        // "已评 X / Y"
  pillarLlmComplete: string;       // "完整评测"
  startFullEval: string;           // "启动完整评测"
  fullEvalNote: string;            // 深度评测耗时说明
  ruleScoreOnly: string;           // 基础规则分说明
  llmEvalPending: string;          // 占位文案
  // ---- v3.1 新增：LLM 推断的 skill 价值类型 ----
  valueTypeLabel: string;                       // "skill 类型"
  valueTypeNames: Record<string, string>;       // productivity → "生产力工具型"
  valueTypeHints: Record<string, string>;       // 一行 hint
  valueTypeReason: string;                      // "判定依据"前缀
  webSearchDisclaimer: string;                  // 顶部提示：本工具不联网搜索
  // ---- v3.2 新增：GitHub 市场调研 ----
  marketSurveyTitle: string;                    // "同类项目调研 (GitHub)"
  marketSurveyLoading: string;                  // "正在调用 GitHub Search..."
  marketSurveyQuery: string;                    // "搜索查询"
  marketSurveyKeywordSourceLlm: string;         // "关键词由 LLM 翻译生成"
  marketSurveyTotal: string;                    // "共 {n} 个匹配仓库，展示 top {shown}"
  marketSurveyEmpty: string;                    // "查询 {q} 没找到任何同类仓库..."
  marketSurveyEmptyHint: string;                // "...这通常意味着..."
  marketSurveyOpenOnGithub: string;             // "在 GitHub 上打开"
  marketSurveyLlmNote: string;                  // "LLM 已基于以上结果评估市场竞争力"
  marketSurveyFallbackNote: string;             // 失败时的兜底说明
  marketSurveyErrors: Record<string, string>;
};

const zh: Dict = {
  appName: "SkillLens",
  tagline: "上传你的 Agent Skill，获得量化评测与改进建议",
  uploadHint: "拖拽 SKILL.md 到此处，或点击选择文件",
  uploadCta: "选择 SKILL.md",
  pasteHint: "也可以直接粘贴 SKILL.md 的内容",
  pasteCta: "粘贴并评测",
  sampleLabel: "载入示例",
  runEval: "开始评测",
  evalRunning: "评测中…",
  resetWeights: "重置权重",
  weights: "维度权重",
  weightsHint: "滑动调整各维度权重，评分会自动重算（总和自动归一化为 100）",
  totalScore: "总分",
  grade: "等级",
  spec: "规范",
  generatedAt: "生成时间",
  dimensions: "维度得分",
  checks: "细则",
  evidence: "依据",
  suggestions: "Top 改进建议",
  suggestionsEmpty: "暂无严重问题，继续保持！",
  statusPass: "通过",
  statusPartial: "部分",
  statusFail: "未过",
  statusNA: "未评",
  checkTypeRule: "规则",
  checkTypeLLM: "深度评测",
  llmDisabledNote: "SkillLens 深度评测未启动，深度评测项暂记为“未评”。",
  llmEnable: "启动 SkillLens 深度评测",
  llmRunning: "SkillLens 深度评测中…（1–2 分钟，请稍候）",
  llmDone: "SkillLens 深度评测完成",
  llmFailed: "SkillLens 深度评测失败",
  llmRateLimited: "今日额度已用尽，请稍后再试",
  llmMockBanner: "服务端未配置深度评测 API Key，返回的是 mock 分数（全 0.5）。",
  llmCached: "命中缓存",
  llmProvider: "深度评测引擎",
  exportPdf: "导出完整报告 PDF",
  exportJson: "导出 JSON",
  copyReport: "复制 Markdown",
  dropFile: "松开以上传",
  langToggle: "EN",
  bonus: "Bonus",
  nowLabel: "现状：",
  fixLabel: "改法：",
  evidenceSourceLabel: "评分依据",
  evidenceSourceNames: {
    doc_check: "基于文档",
    llm_judgment: "SkillLens 经验判断",
    external_data: "外部数据辅助",
    runtime_probe: "运行验证",
  },
  confidenceLabel: "置信度",
  confidencePolicyNames: {
    high: "高",
    medium: "中",
    low: "低",
  },
  showExample: "查看示例",
  severityHigh: "优先修",
  severityMedium: "建议修",
  suggestionsIntro: "每条都按「现状 + 改法」写好了，照着改即可；红色最重要，黄色可以排在后面。",
  llmErrorTitle: {
    provider_no_balance: "深度评测账户余额不足",
    provider_auth: "API Key 无效或已过期",
    provider_rate_limited: "深度评测上游限流",
    provider_timeout: "深度评测响应超时",
    provider_network: "无法连接到深度评测服务",
    rate_limited: "今日评测额度已用尽",
    llm_browser_required: "请从网页启动深度评测",
    llm_failed: "SkillLens 深度评测失败",
    unknown: "SkillLens 深度评测失败",
  },
  llmErrorHint: {
    provider_no_balance: "请给 DeepSeek 账户充值，或把 ANTHROPIC_API_KEY 加进 .env.local 切到 Claude；完全没 key 时会走 mock 模式。",
    provider_auth: "请检查 .env.local 里的 API Key 是否正确、是否被吊销。",
    provider_rate_limited: "深度评测上游限流，请稍后再试（不是本站限制）。",
    provider_timeout: "深度评测生成超时。可以缩短 skill 内容再试，或提高 LLM_TIMEOUT_MS。",
    provider_network: "请检查服务器能否访问 api.deepseek.com / api.anthropic.com。",
    rate_limited: "本站内存限流 24h 内仅放行 DAILY_SCORE_LIMIT 次，重启服务即可清空。",
    llm_browser_required: "为了保护服务端模型 key，深度评测接口只接受来自 SkillLens 网页的同源浏览器请求。",
    llm_failed: "请查看详情，或稍后重试。",
    unknown: "未知错误，请查看详情。",
  },
  llmErrorDetail: "查看详情",
  llmRetry: "重试",
  pillarsTitle: "量化评测",
  pillarRoleDecidesCeiling: "决定天花板",
  pillarRoleDecidesBreakout: "决定能否跑出",
  pillarRoleDecidesScale: "决定能否规模化",
  pillarRoleDecidesDeploy: "决定能否落地",
  pillarRoleBaseline: "基础门槛",
  pillarLlmCoverage: "需要 SkillLens 深度评测才能给出此项分数",
  pillarLlmPartial: "已评 {evaluated} / {total} 项",
  pillarLlmComplete: "已完成 SkillLens 深度评测",
  startFullEval: "启动 SkillLens 深度评测",
  fullEvalNote: "预计 1–2 分钟，会补充商业、市场、稳定性等评估。",
  ruleScoreOnly: "当前是基础规则分。开启后可获得更完整的语义评估。",
  llmEvalPending: "等待 SkillLens 深度评测…",
  valueTypeLabel: "Skill 类型",
  valueTypeNames: {
    productivity: "生产力工具型",
    decision_support: "决策辅助型",
    learning: "学习成长型",
    emotion_expression: "情绪表达型",
    utility: "小工具型",
  },
  valueTypeHints: {
    productivity: "按「省时间 / 提效率」标准评估商业价值",
    decision_support: "按「决策质量 / 信息密度」标准评估",
    learning: "按「知识增量 / 行为养成」标准评估",
    emotion_expression: "按「共鸣 / 记忆点 / 传播性」标准评估，不强求量化数字",
    utility: "按「精准解决一个小痛点」标准评估",
  },
  valueTypeReason: "判定依据",
  webSearchDisclaimer: "",
  marketSurveyTitle: "同类项目客观调研（GitHub）",
  marketSurveyLoading: "正在调用 GitHub Search 抽取同类仓库……",
  marketSurveyQuery: "搜索查询",
  marketSurveyKeywordSourceLlm: "关键词由 SkillLens 智能翻译生成（规则抽取无命中或 GitHub 0 结果后触发）",
  marketSurveyTotal: "GitHub 报告共有 {n} 个匹配仓库，下面展示按 stars 排序的前 {shown} 个",
  marketSurveyEmpty: "查询 `{q}` 在 GitHub 上没有找到任何匹配仓库。",
  marketSurveyEmptyHint: "这通常意味着这是一个非常新的赛道，或者关键词太特殊；SkillLens 评 existing_alternatives 时会把这个事实纳入考虑。",
  marketSurveyOpenOnGithub: "在 GitHub 上查看完整结果",
  marketSurveyLlmNote: "👉 SkillLens 已基于以上客观数据评估「竞品调研意识」一项；分数反映的是「作者写出的 awareness 是否覆盖到这些真实存在的同类」。",
  marketSurveyFallbackNote: "调研失败不影响其他维度，SkillLens 会回退到「仅基于文档判断 awareness」的旧模式。",
  marketSurveyErrors: {
    rate_limited: "GitHub Search API 限流（无 token 时 60 次/小时）。请稍后再试，或在 .env.local 配置 GITHUB_TOKEN 提升到 5000 次/小时。",
    auth: "GITHUB_TOKEN 无效或权限不足，请检查 .env.local。",
    network: "无法连接到 api.github.com，请检查网络。",
    no_keywords: "未能从 SKILL.md 抽出可搜索的英文关键词。建议在 frontmatter 加几个英文 tags。",
    unknown: "GitHub Search 调用失败。",
  },
};

const en: Dict = {
  appName: "SkillLens",
  tagline: "Upload your Agent Skill — get a rubric-based audit.",
  uploadHint: "Drop SKILL.md here, or click to choose a file",
  uploadCta: "Choose SKILL.md",
  pasteHint: "Or paste the content of a SKILL.md directly",
  pasteCta: "Paste & Evaluate",
  sampleLabel: "Load example",
  runEval: "Evaluate",
  evalRunning: "Evaluating…",
  resetWeights: "Reset weights",
  weights: "Dimension weights",
  weightsHint: "Adjust weights — score re-computes instantly (total auto-normalized to 100).",
  totalScore: "Total",
  grade: "Grade",
  spec: "Spec",
  generatedAt: "Generated at",
  dimensions: "Dimensions",
  checks: "Checks",
  evidence: "Evidence",
  suggestions: "Top improvements",
  suggestionsEmpty: "No major issues. Nice work!",
  statusPass: "pass",
  statusPartial: "partial",
  statusFail: "fail",
  statusNA: "n/a",
  checkTypeRule: "rule",
  checkTypeLLM: "SkillLens Deep Review",
  llmDisabledNote: "SkillLens Deep Review is disabled. Deep-review checks are marked n/a.",
  llmEnable: "Run SkillLens Deep Review",
  llmRunning: "Running SkillLens Deep Review… (expect 1–2 min)",
  llmDone: "SkillLens Deep Review done",
  llmFailed: "SkillLens Deep Review failed",
  llmRateLimited: "Daily quota exhausted. Try again later.",
  llmMockBanner: "Server has no deep-review API key configured. Results are mock (all 0.5).",
  llmCached: "cached",
  llmProvider: "review engine",
  exportPdf: "Export full PDF report",
  exportJson: "Export JSON",
  copyReport: "Copy Markdown",
  dropFile: "Release to upload",
  langToggle: "中文",
  bonus: "Bonus",
  nowLabel: "What's wrong:",
  fixLabel: "How to fix:",
  evidenceSourceLabel: "Evidence source",
  evidenceSourceNames: {
    doc_check: "Doc-based",
    llm_judgment: "SkillLens judgment",
    external_data: "External data",
    runtime_probe: "Runtime probe",
  },
  confidenceLabel: "Confidence",
  confidencePolicyNames: {
    high: "high",
    medium: "medium",
    low: "low",
  },
  showExample: "Show example",
  severityHigh: "Fix first",
  severityMedium: "Nice to fix",
  suggestionsIntro: "Each item ships with a diagnosis and a how-to. Red items first, amber when you have time.",
  llmErrorTitle: {
    provider_no_balance: "Deep-review provider out of credits",
    provider_auth: "API key invalid or expired",
    provider_rate_limited: "Deep-review provider is rate-limiting",
    provider_timeout: "SkillLens Deep Review timed out",
    provider_network: "Can't reach the deep-review provider",
    rate_limited: "Daily review quota exhausted",
    llm_browser_required: "Start Deep Review from the web page",
    llm_failed: "SkillLens Deep Review failed",
    unknown: "SkillLens Deep Review failed",
  },
  llmErrorHint: {
    provider_no_balance: "Top up your DeepSeek account, OR add ANTHROPIC_API_KEY to .env.local to switch to Claude. With no key the app falls back to mock mode.",
    provider_auth: "Check the API key in .env.local — typo, revoked, or wrong project?",
    provider_rate_limited: "The provider is throttling. Wait a minute and retry (not your rate limit).",
    provider_timeout: "SkillLens Deep Review took too long. Trim SKILL.md or bump LLM_TIMEOUT_MS.",
    provider_network: "Can the server reach api.deepseek.com / api.anthropic.com?",
    rate_limited: "Local in-memory limiter hit DAILY_SCORE_LIMIT. Restart the server to reset.",
    llm_browser_required: "To protect the server-side model key, /api/llm only accepts same-origin browser requests from SkillLens.",
    llm_failed: "Open details, or retry shortly.",
    unknown: "Unknown error. Expand details below.",
  },
  llmErrorDetail: "Show raw detail",
  llmRetry: "Retry",
  pillarsTitle: "Quantitative Review",
  pillarRoleDecidesCeiling: "Sets the ceiling",
  pillarRoleDecidesBreakout: "Determines breakout odds",
  pillarRoleDecidesScale: "Decides scalability",
  pillarRoleDecidesDeploy: "Determines deployability",
  pillarRoleBaseline: "Baseline threshold",
  pillarLlmCoverage: "Needs SkillLens Deep Review to score this",
  pillarLlmPartial: "{evaluated} / {total} evaluated",
  pillarLlmComplete: "SkillLens Deep Review complete",
  startFullEval: "Run SkillLens Deep Review",
  fullEvalNote: "Takes about 1–2 minutes and adds business, market, and reliability judgment.",
  ruleScoreOnly: "This is a rule-based preview. Run deep review for fuller semantic evaluation.",
  llmEvalPending: "Awaiting SkillLens Deep Review…",
  valueTypeLabel: "Skill type",
  valueTypeNames: {
    productivity: "Productivity tool",
    decision_support: "Decision support",
    learning: "Learning / growth",
    emotion_expression: "Emotion / expression",
    utility: "Small utility",
  },
  valueTypeHints: {
    productivity: "Judged by 'time / cost saved'",
    decision_support: "Judged by 'decision quality / signal density'",
    learning: "Judged by 'knowledge gain / habit change'",
    emotion_expression: "Judged by 'resonance / memorability / shareability' — no quantification required",
    utility: "Judged by 'precise fit for one specific small pain'",
  },
  valueTypeReason: "Why",
  webSearchDisclaimer: "",
  marketSurveyTitle: "Objective Market Survey (GitHub)",
  marketSurveyLoading: "Calling GitHub Search for similar repositories…",
  marketSurveyQuery: "Query",
  marketSurveyKeywordSourceLlm: "Keywords translated by SkillLens (triggered after rule extraction failed or GitHub returned 0 results)",
  marketSurveyTotal: "GitHub reports {n} matching repositories; showing the top {shown} by stars",
  marketSurveyEmpty: "Query `{q}` returned zero matches on GitHub.",
  marketSurveyEmptyHint: "This usually means a very new niche or unusual keywords; SkillLens will factor that into the existing_alternatives score.",
  marketSurveyOpenOnGithub: "Open full results on GitHub",
  marketSurveyLlmNote: "👉 SkillLens scored 'competitor awareness' against the data above — the score reflects whether the author's stated awareness covers the real alternatives we found.",
  marketSurveyFallbackNote: "Survey failure won't affect other dimensions; SkillLens falls back to judging awareness from the doc text only.",
  marketSurveyErrors: {
    rate_limited: "GitHub Search rate limit hit (60/h without a token). Try again later, or add GITHUB_TOKEN to .env.local for 5000/h.",
    auth: "GITHUB_TOKEN invalid or insufficient permissions; check .env.local.",
    network: "Can't reach api.github.com — check network.",
    no_keywords: "Couldn't extract searchable English keywords from SKILL.md. Try adding English tags to the frontmatter.",
    unknown: "GitHub Search call failed.",
  },
};

export const MESSAGES: Record<Lang, Dict> = { zh, en };
