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
3. 用词朴素，不要堆术语；用中文回答。
4. 输出必须是严格的 JSON，结构如下，禁止任何多余文本或 Markdown 代码块：
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
3. Plain words, no jargon. Respond in English.
4. Output MUST be strict JSON, no prose, no Markdown fences:
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

  const user = req.lang === "zh"
    ? `被测 skill 所属规范: ${req.spec}

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
## 需要你评估的细则
${checksBlock}

请严格返回 JSON（必须包含 meta.value_type 字段；后续所有 business_value / market 类的 check 都按你识别出的类型来评判）：
{
  "meta": {"value_type": "productivity|decision_support|learning|emotion_expression|utility", "value_type_reason": "..."},
  "results": {"<check.id>": {"ratio": <0..1>, "evidence": "<中文现状>", "fix": "<中文改法>", "confidence": <0..1>}, ...}
}`
    : `Target skill spec: ${req.spec}

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
