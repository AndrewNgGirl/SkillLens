import type { LlmReviewRequest } from "./types";

/**
 * 批量评审 prompt 设计：
 * - 一次调用评估所有 LLM 细则，降低成本与延迟。
 * - 强制输出结构化 JSON；用 system prompt + "respond with JSON only" 约束。
 * - 语言跟随 request.lang；模板分中英两套。
 */

const SYSTEM_ZH = `你是 SkillLens 的资深评测员，从"产品力 + 工程力"双视角评估一个 Agent Skill 的整体质量，把判断讲得让普通作者一看就懂。

【第一步：判定 skill 的价值类型 value_type】
在所有 check 之前，先把这个 skill 归到下面 5 类之一（必须选一类，不要"都沾一点"）：
  • productivity        生产力工具型：替用户省时间/省钱/提效（PR 评审、报表生成、自动化脚本）
  • decision_support    决策辅助型：帮用户做更好的判断（投资分析、技术选型、问诊建议）
  • learning            学习成长型：帮用户增长知识或养成习惯（算法讲解、英语陪练、复盘助手）
  • emotion_expression  情绪表达型：提供情绪价值/共鸣/娱乐/社交话题（MBTI 测试、塔罗、邪修毒鸡汤、文风模仿）
  • utility             小工具型：解决一个具体小痛点（单位换算、JSON 格式化、颜色拾取）

【第二步：按类型来打 business_value 和 market 这两个支柱】
  • productivity / decision_support / utility → 期望看到量化收益、明确替代方案对比
  • emotion_expression / learning → 不强求数字，但要看"触动点"是否具体（共鸣场景、记忆点、品牌口吻、知识增量、行为养成）。强行用"省 X 小时"评判娱乐型 skill 是错误标准。
  • 不论哪一类，"目标用户具体""需求真实""复用价值清晰"都通用，只是表达形式不同
  • 特别注意 biz.target_users.specific：不要机械要求作者必须写 ## Target users。只要能从 When to use / Inputs / Example / Workflow 中稳定推断出具体用户群体（例如"处理 GitHub PR 的团队开发者/开源维护者"），就应给 0.85 以上；只有推断结果仍然是"所有人/任何人/说不清"时才低分。

【第三步：5 大支柱通用视角】
  • business_value 选题价值（PM 视角）—— 这个 skill 值不值得存在？参考第二步的类型化标准。
  • market 市场竞争力（市场分析师）—— 差异化清不清？被裸 LLM 直接干掉的风险大不大？
    ⚠️ 评 market.existing_alternatives 时：如果 user message 里附带了 "## 同类项目客观调研" 段落（GitHub Search 真实结果），就把它当成事实依据来评——核心问题是"作者写出来的 awareness 跟客观存在的 N 个同类是否对得上"；如果没附带这段（调研失败），才退回到"基于文档判断 awareness"。无论哪种，都不要凭空想象竞品名字。
  • runtime_cost 运行成本（工程负责人）—— token 重不重？依赖多不多？
  • reliability 效果稳定性（SRE）—— 交给 LLM 跑 10 次会不会飘？关键步骤有没有脚本兜底？
  • writeup 书写规范性（Agent 自己）—— 这段文档我读起来吃力吗？步骤够明确吗？

【输出规则】
1. 每条 check 给四个字段：
   - ratio: 0~1 连续分（1 = 完全达标）
   - evidence: ≤ 100 字"现状诊断"，说明扣分原因；必要时引用原文关键句或缺失项；情绪/学习类 skill 评 business/market 时要明确说"按 emotion 标准看……"
   - fix: ≤ 120 字"具体怎么改"，可操作的步骤
   - confidence: 0~1，对你这条判断的自评置信度。只看文档就能明确判断通常 0.8~0.95；涉及市场真实需求、模型能力边界等经验判断通常 0.5~0.8；依据不足时低于 0.5。
2. 主观项要诚实：写得空洞、讨好甲方的一句话不给高分；同时也不要因为"不是 ToB 工具"就压低情绪/娱乐型的合理价值。
3. 分数锚点必须严格校准：
   - 1.00 只给"标杆级 / 几乎无需改进 / 有强证据支撑"的少数情况，不能因为作者补了对应章节就给满分。
   - 0.90~0.96 表示优秀、发布准备度高，但仍可能有微小优化空间。
   - 0.75~0.89 表示良好但还不够锋利，通常应该指出一个具体改进点。
   - 0.50~0.74 表示基本有方向但证据不足或表达不完整。
   - 低于 0.50 表示缺失、空泛或明显不可信。
   普通"按建议补齐"只能到优秀，不应自动变成满分；除非它在证据、示例、边界、竞品和成本上都明显超过常规 skill。
4. 用词朴素，不要堆术语；用中文回答。
5. 输出必须是严格的 JSON，结构如下，禁止任何多余文本或 Markdown 代码块：
{
  "meta": {
    "value_type": "productivity | decision_support | learning | emotion_expression | utility",
    "value_type_reason": "≤ 60 字一句话解释为什么归到这类"
  },
  "results": {
    "<check.id>": {"ratio": <0..1>, "evidence": "...", "fix": "...", "confidence": <0..1>},
    ...
  }
}`;

const SYSTEM_EN = `You are SkillLens, a senior evaluator for Agent Skills. Assess from BOTH product and engineering angles, in language a non-expert author can act on.

[Step 1: Identify the skill's value_type]
Before scoring any check, classify this skill into ONE of:
  • productivity        — saves user time / money / effort (PR review, report generators, automation)
  • decision_support    — helps make better judgments (investment, tech selection, triage)
  • learning            — grows knowledge or builds habits (algo tutoring, language coach, retro buddy)
  • emotion_expression  — emotional / entertainment / social value (MBTI, tarot, sarcastic poetry, voice impersonation)
  • utility             — solves one small concrete pain (unit conversion, JSON formatter, color picker)

[Step 2: Score business_value and market BY TYPE]
  • productivity / decision_support / utility → expect quantified gains, explicit competitor comparison
  • emotion_expression / learning → no numbers required, but the "aha moment" must be concrete (resonance scenes, memorable hooks, brand voice, knowledge gain, behavior change). Demanding "saves X hours" from an entertainment skill is the WRONG yardstick.
  • Across all types: target-user specificity, need realness, repeat-use clarity all apply — only the language differs.
  • Special rule for biz.target_users.specific: do NOT require an explicit ## Target users section. If the audience is reliably inferable from When to use / Inputs / Example / Workflow (e.g. "team developers or OSS maintainers handling GitHub PRs"), score >= 0.85. Score low only when the plausible audience remains "anyone" or unclear.

[Step 3: General lens for all 5 pillars]
  • business_value (PM lens) — is this skill worth existing? Use type-aware standard from Step 2.
  • market (analyst lens) — differentiated? at risk of being replaced by a bare LLM call?
    ⚠️ For market.existing_alternatives: if the user message includes a "## Objective Market Survey" section (real GitHub Search results), treat that as ground truth — the question becomes "does the author's stated awareness match the N real alternatives we found?". If that section is absent (search failed), fall back to "judge awareness from the doc text only". Either way, do NOT invent competitor names from thin air.
  • runtime_cost (eng lead) — token-heavy? deps stacked?
  • reliability (SRE) — does it drift across 10 reruns? are critical steps anchored by scripts?
  • writeup (the agent itself) — hard to read? steps unambiguous?

[Output rules]
1. For every check return:
   - ratio: continuous in [0, 1]
   - evidence: <= 80 words; cite phrases or list missing items; for emotion/learning skills evaluating business/market, explicitly say "by emotion-skill standards…"
   - fix: <= 100 words, concrete actionable next-steps
   - confidence: continuous in [0, 1]. Doc-evident checks are usually 0.8-0.95; market/product/model-capability judgments are usually 0.5-0.8; insufficient evidence should be below 0.5.
2. Be honest: vague marketing copy doesn't score high; equally, do NOT under-rate emotion / fun skills just for being non-ToB.
3. Calibrate scores strictly:
   - 1.00 is reserved for rare benchmark-level cases: nearly no improvement needed, with strong evidence. Do NOT give 1.00 merely because the author added the requested section.
   - 0.90-0.96 means excellent and publish-ready, but still with minor room to sharpen.
   - 0.75-0.89 means good but not sharp enough; usually name one concrete improvement.
   - 0.50-0.74 means directionally useful but incomplete or under-evidenced.
   - Below 0.50 means missing, vague, or not credible.
   A normal "fixed according to suggestions" skill can be excellent, but should not automatically become perfect unless evidence, examples, edge cases, alternatives, and cost discipline are all unusually strong.
4. Plain words, no jargon. Respond in English.
5. Output MUST be strict JSON, no prose, no Markdown fences:
{
  "meta": {
    "value_type": "productivity | decision_support | learning | emotion_expression | utility",
    "value_type_reason": "<= 40 words on why"
  },
  "results": {
    "<check.id>": {"ratio": <0..1>, "evidence": "...", "fix": "...", "confidence": <0..1>},
    ...
  }
}`;

export interface RenderedPrompt {
  system: string;
  user: string;
}

export function renderPrompt(req: LlmReviewRequest): RenderedPrompt {
  const system = req.lang === "zh" ? SYSTEM_ZH : SYSTEM_EN;

  const checksBlock = req.checks
    .map((c) => `- id: ${c.id}\n  criterion: ${req.lang === "zh" ? c.desc_zh : c.desc_en}`)
    .join("\n");

  const filesBlock = (req.supportingFiles ?? [])
    .slice(0, 20)
    .map((f) => `### ${f.path}\n${f.preview ?? "(binary or omitted)"}`)
    .join("\n\n");

  const metaJson = JSON.stringify(req.meta, null, 2);

  const marketBlock = req.marketSurvey ? renderMarketSurvey(req.marketSurvey, req.lang) : "";
  const expertBlock = req.expertReview ? renderExpertReviewBlock(req.expertReview, req.lang) : "";
  const skillTypeBlock = req.skillContext ? renderSkillTypeBlock(req.skillContext, req.lang) : "";
  const outputLang = req.outputLang ?? req.lang;
  const languageBlock = renderLanguageBlock(outputLang);

  const user = req.lang === "zh"
    ? `被测 skill 所属规范: ${req.spec}

${skillTypeBlock}
${languageBlock}
## frontmatter
\`\`\`yaml
${metaJson}
\`\`\`

## SKILL.md body
\`\`\`markdown
${req.skillBody}
\`\`\`

${filesBlock ? `## 附属文件预览\n${filesBlock}\n` : ""}
${marketBlock}
${expertBlock}
## 需要你评估的细则
${checksBlock}

请严格返回 JSON（必须包含 meta.value_type 字段；后续所有 business_value / market 类的 check 都按你识别出的类型来评判）：
{
  "meta": {"value_type": "productivity|decision_support|learning|emotion_expression|utility", "value_type_reason": "..."},
  "results": {"<check.id>": {"ratio": <0..1>, "evidence": "<中文现状>", "fix": "<中文改法>", "confidence": <0..1>}, ...}
}`
    : `Target skill spec: ${req.spec}

${skillTypeBlock}
${languageBlock}
## frontmatter
\`\`\`yaml
${metaJson}
\`\`\`

## SKILL.md body
\`\`\`markdown
${req.skillBody}
\`\`\`

${filesBlock ? `## Supporting file previews\n${filesBlock}\n` : ""}
${marketBlock}
${expertBlock}
## Checks to evaluate
${checksBlock}

Return strict JSON (MUST include meta.value_type; all business_value / market checks should be judged by that type's standard):
{
  "meta": {"value_type": "productivity|decision_support|learning|emotion_expression|utility", "value_type_reason": "..."},
  "results": {"<check.id>": {"ratio": <0..1>, "evidence": "<english diagnosis>", "fix": "<english how-to-fix>", "confidence": <0..1>}, ...}
}`;

  return { system, user };
}

/** 把 LLM 给的 0..1 连续分离散化到 rubric 的 pass/partial/fail */
export function ratioToStatus(r: number): "pass" | "partial" | "fail" {
  if (r >= 0.85) return "pass";
  if (r >= 0.4) return "partial";
  return "fail";
}

// ---------- 市场调研块渲染 ----------

import type { MarketSurvey } from "../market/types";
import { getFinanceScenario, getFinanceScenarioProfile, type FinanceScenarioId } from "../domain/finance";
import type { SkillTypeContext } from "./types";

/**
 * 输出语言指令块。
 * 与 CLI scripts/score.py:render_language_block 保持完全一致：
 * 让 LLM 知道用什么语言写 evidence / fix / value_type_reason，
 * 把"prompt 主体语言"（决定 system / checks 描述）与"作答语言"（决定报告读者
 * 看到的文字语言）解耦，避免英文 SKILL.md 自动产出英文报告。
 */
function renderLanguageBlock(outputLang: "zh" | "en"): string {
  if (outputLang === "zh") {
    return `## 输出语言要求
请用**简体中文**填写 \`evidence\`、\`fix\`、\`value_type_reason\` 字段。
- 即使被测 SKILL.md 正文、附属文件或 frontmatter 是英文，仍然用简体中文回答。
- 检查项 ID（JSON key 中的 \`<check.id>\`）保持英文原样，不要翻译。
- 专有名词（API、JSON、schema、Pydantic 等）、文件路径、命令名保持原文。
- 引用 SKILL.md / 子 SKILL.md 中的英文术语时，可在中文里直接保留原文（不需要翻译为生硬的中文）。
`;
  }
  return `## Output language
Write the \`evidence\`, \`fix\`, and \`value_type_reason\` fields in **English**.
- Use English even when SKILL.md, supporting files, or frontmatter are in another language.
- Keep check IDs (the \`<check.id>\` JSON keys) untranslated.
- Keep proper nouns (API, JSON, schema, Pydantic, etc.), file paths, and command names in their original form.
`;
}

/**
 * skill 类型上下文块（pipeline / composite / atomic）。
 * 与 CLI scripts/score.py:render_skill_type_block 保持完全一致：
 * 让 LLM 知道这是 pipeline 编排器或工具集，而不是单一文档型 skill，
 * 避免给出"在主 SKILL.md 里再写一遍 schema / workflow"的错建议。
 */
function renderSkillTypeBlock(ctx: SkillTypeContext, lang: "zh" | "en"): string {
  const { skillType, autoDetected, subSkills = [] } = ctx;
  const tag = autoDetected ? (lang === "zh" ? "（自动识别）" : " (auto-detected)") : (lang === "zh" ? "（用户指定）" : " (user-specified)");

  if (lang === "zh") {
    if (skillType === "pipeline") {
      const subLines = subSkills
        .slice(0, 10)
        .map((s) => `  - \`${s.path}\` · ${s.name || "(未命名)"} · ${(s.description ?? "").length} 字描述 · ${s.bodyChars ?? 0} 字 body`)
        .join("\n");
      return `## skill 类型上下文${tag}
当前评测包是 **pipeline / 多子 skill 编排型**：根目录 SKILL.md 是编排器（router / orchestrator），具体业务逻辑分布在 ${subSkills.length} 个子 SKILL.md 里。
子 SKILL.md 列表（按发现顺序，正文已附在下面"附属文件预览"章节）：
${subLines || "  (无)"}

请按以下方式调整你的评估：
1. **不要**因为根 SKILL.md 没写完整 schema / outputs / examples / detailed workflow 就扣分——这些通常下沉在子 SKILL.md 或代码（scripts/*.py, *.schema.json, pydantic.BaseModel 等）里；先去附属文件预览中查找证据，再下结论。
2. \`cost.context_budget.skill_md_size\` 等针对单文档体积的标准对编排器可适当放宽：编排器写得克制更好，业务细节本来就该拆出去。
3. \`biz.target_users.specific\` / \`act.has_examples\` 这类来自根 body 的判断，请综合所有 SKILL.md 一起看；只要任何一份 SKILL.md 写清楚了就算成立。
4. 你会看到 5 个 **pipeline 专属**的 dim（applies_to=[pipeline]），评估时请严格对照 desc 给证据：
   - \`rel.pipeline_routing.*\`：路由表 / 决策树 / 关键词映射是否显式；路由是否便宜（规则优先 vs 每次 LLM 路由）。
   - \`rel.pipeline_boundaries.*\`：子 agent 是否避免重叠 + 是否覆盖完整（请用真实输入做心智测试）。
   - \`rel.pipeline_io_protocol.*\`：子 agent IO 协议 + 主 skill 聚合策略（concat / vote / rank）写没写清。
   - \`rel.pipeline_partial_failure.*\`：部分子 agent 失败时是 partial / fail-all / retry。
   - \`rel.pipeline_subskill_quality.*\`（rule 类，会先扫子 SKILL.md 章节齐备性）。
   evidence 引用具体子 SKILL.md 路径或缺失章节；fix 给出可粘贴的章节骨架。
`;
    }
    if (skillType === "composite") {
      return `## skill 类型上下文${tag}
当前评测包是 **composite / 工具集合型**：包含多个相互独立的子 skill，没有强编排关系（用户可单独调用任何一个）。
请按以下方式调整你的评估：
1. 不要要求"统一的 workflow / 串行步骤"，composite 是并列工具，**单一职责**和**互不耦合**才是优点。
2. 主 SKILL.md 不需要写所有功能细节，只要做好"导航 + 适用边界"即可。
3. 你会看到 4 个 **composite 专属**的 dim（applies_to=[composite]），严格对照 desc 评估：
   - \`rel.composite_tool_index.*\`：主 SKILL.md 是否给每个工具列入口 + 用途 + when-to-use（理想是 ## Tools 表格）。
   - \`rel.composite_orthogonality.*\`：工具之间避免功能冗余；如有重叠，主 skill 是否说清"用哪个不用哪个"。
   - \`rel.composite_consistency.*\`：命名 / 输出格式 / 错误码 / 版本号语义跨工具一致。
   - \`rel.composite_discoverability.*\`：是否有 decision tree / checklist 让 caller 5 行内挑对工具。
   evidence 应引用具体工具路径 or 缺失章节；fix 给可粘贴的章节骨架（例如 ## Tools 表格列名）。
`;
    }
    return `## skill 类型上下文${tag}
当前评测包是 **atomic / 单一职责型 skill**：一个 SKILL.md 解决一件事。按常规标准评估即可。
`;
  }

  if (skillType === "pipeline") {
    const subLines = subSkills
      .slice(0, 10)
      .map((s) => `  - \`${s.path}\` · ${s.name || "(unnamed)"} · ${(s.description ?? "").length}-char desc · ${s.bodyChars ?? 0}-char body`)
      .join("\n");
    return `## Skill type context${tag}
This package is a **pipeline / multi-sub-skill orchestration**: the root SKILL.md is the orchestrator (router) and the actual business logic is split across ${subSkills.length} child SKILL.md files.
Child SKILL.md (their bodies are attached below in "Supporting file previews"):
${subLines || "  (none)"}

Adjust your evaluation accordingly:
1. **Do NOT** penalize the root SKILL.md for missing complete schema / outputs / examples / detailed workflow — those usually live in the child SKILL.md or in companion code (scripts/*.py, *.schema.json, pydantic.BaseModel). Look there first before scoring low.
2. Standards for single-document size (e.g. \`cost.context_budget.skill_md_size\`) can be relaxed for an orchestrator — being concise is correct.
3. For root-body checks like \`biz.target_users.specific\`, \`act.has_examples\` — read across ALL SKILL.md files; if any SKILL.md establishes the answer, count it as satisfied.
4. You will see 5 **pipeline-specific** dims (applies_to=[pipeline]). Score each strictly per its desc:
   - \`rel.pipeline_routing.*\`: explicit routing table / decision tree / keyword map; routing is cheap (rules first, LLM only for ambiguous cases).
   - \`rel.pipeline_boundaries.*\`: sub-agents don't overlap AND coverage is complete (mentally route 5–10 realistic inputs).
   - \`rel.pipeline_io_protocol.*\`: per-sub-agent IO contract + how the root aggregates (concat / vote / rank).
   - \`rel.pipeline_partial_failure.*\`: behavior when some sub-agents fail (partial / fail-all / retry).
   - \`rel.pipeline_subskill_quality.*\` (rule check, scans sub-SKILL.md sections).
   Cite specific sub-SKILL.md paths or missing sections in evidence; ship a paste-ready section skeleton in fix.
`;
  }
  if (skillType === "composite") {
    return `## Skill type context${tag}
This package is a **composite / toolkit bundle**: multiple independent sub-skills with no strong orchestration (any one can be invoked separately).
Adjust your evaluation:
1. Do NOT demand a unified workflow or serial steps; composite means parallel tools where single-responsibility and decoupling are virtues.
2. The root SKILL.md only needs to do "navigation + usage boundaries", not full feature documentation.
3. You will see 4 **composite-specific** dims (applies_to=[composite]). Score each strictly per its desc:
   - \`rel.composite_tool_index.*\`: root SKILL.md lists every tool with entry point + when-to-use (ideally a ## Tools table).
   - \`rel.composite_orthogonality.*\`: tools don't overlap; if they do, root explains "use this, not that".
   - \`rel.composite_consistency.*\`: naming / output format / error codes / version semantics consistent across tools.
   - \`rel.composite_discoverability.*\`: a decision tree / checklist that lets callers pick the right tool in 5 lines.
   Cite specific tool paths or missing sections in evidence; ship a paste-ready section skeleton in fix.
`;
  }
  return `## Skill type context${tag}
This is an **atomic / single-purpose skill** — one SKILL.md doing one thing. Apply standard evaluation.
`;
}

function renderExpertReviewBlock(
  expertReview: { domain: "finance"; scenario: FinanceScenarioId; schemaVersion: string },
  lang: "zh" | "en",
): string {
  const scenario = getFinanceScenario(expertReview.scenario);
  const profile = getFinanceScenarioProfile(expertReview.scenario);
  if (lang === "zh") {
    const focus = profile.promptFocusZh.map((item) => `- ${item}`).join("\n");
    return `## 领域专家版要求
domain: ${expertReview.domain}
schema_version: ${expertReview.schemaVersion}
scenario: ${expertReview.scenario}
scenario_name: ${scenario.name_zh}

## 当前子场景专属评测重点
${focus}

请额外从金融专家视角评估 finance.* 检查项。金融专家版不是普通文档规范检查，也不是奖励作者把假设写完整；你必须进行客观判断：
- 不要因为 SKILL.md 自称“有商业价值 / 有付费用户 / 风控完善”就给高分，必须看证据、工作流、场景真实度和可落地性；
- 商业可用性要由你判断真实市场潜力、可复用价值、付费意愿和产品化难度；如果有潜力，请在 fix 里给出后续商业化模式、目标客群、定价或交付路径建议；
- 数据、风控、可解释性、工程落地也要按“是否足以支撑真实金融决策/流程”评分，不只看是否写了对应章节；
- evidence 写当前客观判断和扣分原因，fix 写你作为评审给出的专业改进建议。
`;
  }
  const focus = profile.promptFocusEn.map((item) => `- ${item}`).join("\n");
  return `## Domain Expert Requirements
domain: ${expertReview.domain}
schema_version: ${expertReview.schemaVersion}
scenario: ${expertReview.scenario}
scenario_name: ${scenario.name_en}

## Scenario-Specific Evaluation Focus
${focus}

Also evaluate all finance.* checks from a finance expert perspective. This is not a generic documentation check and should not reward the author for merely writing assumptions. Make objective judgments:
- Do not score high just because the SKILL.md claims "commercial value", "paid users", or "complete risk controls"; require evidence, workflow realism, scenario fit, and feasibility.
- For commercial readiness, you judge real market potential, repeat-use value, willingness to pay, and productization difficulty. If potential exists, use fix to propose monetization models, target customers, pricing, or delivery paths.
- For data, risk, explainability, and engineering, score by whether the skill can support real finance decisions or workflows, not by whether it has matching section headings.
- evidence should state your objective diagnosis and reasons; fix should be your professional recommendation as the evaluator.
`;
}

function renderMarketSurvey(survey: MarketSurvey, lang: "zh" | "en"): string {
  const heading = lang === "zh" ? "## 同类项目客观调研（GitHub Search 结果）" : "## Objective Market Survey (GitHub Search results)";
  const queryLine = lang === "zh"
    ? `搜索查询: \`${survey.query}\`（关键词：${survey.keywords.join(", ")}），GitHub 报告共有 ${survey.total_count} 个匹配仓库；以下是按 stars 排序的前 ${survey.repos.length} 个：`
    : `Query: \`${survey.query}\` (keywords: ${survey.keywords.join(", ")}). GitHub reports ${survey.total_count} matching repos; the top ${survey.repos.length} by stars:`;

  if (survey.repos.length === 0) {
    const empty = lang === "zh"
      ? "（GitHub Search 没找到任何同类仓库 —— 这通常意味着这是一个非常新的赛道，或者关键词太特殊。评 existing_alternatives 时请把这个事实纳入考虑。）"
      : "(GitHub Search returned zero matches — this usually means a very new niche or unusual keywords. Take that fact into account when scoring existing_alternatives.)";
    return `\n${heading}\n\n${queryLine}\n${empty}\n`;
  }

  const rows = survey.repos.map((r) => {
    const desc = (r.description ?? "").replace(/\s+/g, " ").slice(0, 120);
    const updated = r.pushed_at?.slice(0, 10) ?? "?";
    return `- **${r.full_name}** ⭐${r.stars} · last push ${updated} · ${r.language ?? "-"}\n  ${desc}\n  ${r.html_url}`;
  }).join("\n");

  const note = lang === "zh"
    ? "👉 评 market.existing_alternatives 时请基于以上客观数据：作者在 SKILL.md 里提到的对手是否覆盖了这些 top 项目？有没有遗漏明显的强对手？或者作者识别出了 GitHub 上没有但商业上存在的对手？"
    : "👉 When scoring market.existing_alternatives: do the alternatives the author cited cover these top projects? Are obvious strong rivals missing? Or did the author identify non-OSS commercial competitors that GitHub wouldn't surface?";

  return `\n${heading}\n\n${queryLine}\n\n${rows}\n\n${note}\n`;
}
