/**
 * 浏览器端辅助：把 CanonicalSkill + rubric 的 LLM 细则清单
 * 包装成 /api/llm 的请求，调用后把响应转为 CheckResult map，
 * 喂给 aggregateScore 的 llmResults 参数。
 */
import type { CanonicalSkill } from "@/lib/spec/canonical";
import type { CheckResult, Rubric } from "@/lib/rubric/types";
import type {
  LlmCheckItem,
  LlmReviewRequest,
  LlmReviewResponse,
  SkillType,
  SkillTypeContext,
} from "@/lib/llm/types";
import type { MarketSurvey } from "@/lib/market/types";
import { FINANCE_DOMAIN_VERSION, getFinancePillarsForScenario, type FinanceScenarioId } from "@/lib/domain/finance";
import { resolveSubSkills } from "@/lib/spec/sub-skills";

/** Build a SkillTypeContext from a parsed skill, honoring an optional user override.
 *
 * Delegates to `resolveSubSkills` so the "skill 类型 / 子 SKILL.md" data that
 * reaches the LLM (via prompt) is identical to what the UI renders in the
 * dashboard — single source of truth, no drift.
 */
export function inferSkillTypeContext(
  skill: CanonicalSkill,
  override?: SkillType | "auto",
): SkillTypeContext {
  const r = resolveSubSkills(skill, override);
  return {
    skillType: r.skillType,
    autoDetected: r.autoDetected,
    subSkills: r.subSkills.map((s) => ({
      path: s.path,
      name: s.name,
      description: s.description,
      bodyChars: s.bodyChars,
    })),
  };
}

export function collectLlmChecks(
  rubric: Rubric,
  opts: { pillarIds?: string[]; skillType?: SkillType } = {},
): LlmCheckItem[] {
  const out: LlmCheckItem[] = [];
  // applies_to: skip checks scoped to other skill types so the LLM doesn't
  // waste tokens (and risk fabricating evidence) on checks that downstream
  // aggregateScore will mark not_applicable anyway. Mirrors CLI behavior.
  const push = (c: {
    id: string;
    type: "rule" | "llm";
    desc_zh: string;
    desc_en: string;
    applies_to?: SkillType[];
  }) => {
    if (c.type !== "llm") return;
    if (opts.skillType && c.applies_to && !c.applies_to.includes(opts.skillType)) return;
    out.push({ id: c.id, desc_zh: c.desc_zh, desc_en: c.desc_en });
  };
  for (const p of rubric.pillars) {
    if (opts.pillarIds && !opts.pillarIds.includes(p.id)) continue;
    p.dimensions.forEach((d) => d.checks.forEach(push));
  }
  // bonus 总是包含（除非显式指定 pillarIds 时不带 bonus）
  if (!opts.pillarIds) rubric.bonus.forEach((b) => b.checks.forEach(push));
  return out;
}

export async function runLlmReview(
  skill: CanonicalSkill,
  rubric: Rubric,
  opts: {
    signal?: AbortSignal;
    pillarIds?: string[];
    marketSurvey?: MarketSurvey;
    lang?: "zh" | "en";
    expertReview?: { domain: "finance"; scenario: FinanceScenarioId };
    /**
     * v3.3 新增：用户在 Uploader 里显式选择的 skill 类型；"auto" 等同未传，
     * 由 inferSkillTypeContext 根据子 SKILL.md 数量自动决定。
     */
    skillType?: SkillType | "auto";
    /**
     * v3.4 新增：LLM 输出语言。指定后 evidence / fix / value_type_reason 强制
     * 用该语言书写；不传时跟随 opts.lang（即 prompt 主体语言）。
     * 用法：英文 SKILL.md 想要中文报告时传 "zh"；反之传 "en"。
     */
    outputLang?: "zh" | "en";
  } = {},
): Promise<{ response: LlmReviewResponse; results: Map<string, CheckResult> }> {
  // Resolve skill type once so it can be reused for both LLM check filtering
  // and the SkillTypeContext we pass to the prompt.
  const skillContext = inferSkillTypeContext(skill, opts.skillType);
  const checks = collectLlmChecks(rubric, {
    pillarIds: opts.pillarIds,
    skillType: skillContext.skillType,
  });
  if (opts.expertReview?.domain === "finance") {
    checks.push(...collectFinanceChecks(opts.expertReview.scenario));
  }
  // Reorder previews so child SKILL.md always lead — mirrors the CLI's
  // render_supporting_files two-stage strategy. Without this, large pipeline
  // packages can starve sub SKILL.md off the supporting-files window.
  const supportingFiles = orderSupportingFiles(skill);
  const req: LlmReviewRequest = {
    lang: opts.lang ?? skill.language,
    spec: skill.spec,
    skillBody: skill.body,
    meta: skill.meta,
    supportingFiles,
    checks,
    marketSurvey: opts.marketSurvey,
    expertReview: opts.expertReview
      ? {
          ...opts.expertReview,
          schemaVersion: FINANCE_DOMAIN_VERSION,
        }
      : undefined,
    skillContext,
    outputLang: opts.outputLang,
  };

  const resp = await fetch("/api/llm", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(req),
    signal: opts.signal,
  });
  if (!resp.ok) {
    // 尝试解出结构化的 error code，让 UI 层能翻译成人话；非 JSON 就回退旧行为
    let body: string;
    let code: string | undefined;
    try {
      const j = (await resp.json()) as { error?: string; detail?: string };
      code = j.error;
      body = j.detail ?? JSON.stringify(j);
    } catch {
      body = await resp.text();
    }
    const err = new Error(`${resp.status}::${code ?? "llm_failed"}::${body.slice(0, 200)}`);
    throw err;
  }
  const response = (await resp.json()) as LlmReviewResponse;

  const weightMap = new Map<string, number>();
  rubric.pillars.forEach((p) =>
    p.dimensions.forEach((d) => d.checks.forEach((c) => weightMap.set(c.id, c.weight))),
  );
  rubric.bonus.forEach((b) => b.checks.forEach((c) => weightMap.set(c.id, c.weight)));
  if (opts.expertReview?.domain === "finance") {
    getFinancePillarsForScenario(opts.expertReview.scenario)
      .forEach((p) => p.checks.forEach((c) => weightMap.set(c.id, c.weight)));
  }

  const results = new Map<string, CheckResult>();
  for (const [id, r] of Object.entries(response.results)) {
    results.set(id, {
      id,
      type: "llm",
      weight: weightMap.get(id) ?? 0,
      status: r.status,
      evidence: r.evidence,
      fix: r.fix,
      ratio: r.ratio,
      confidence: r.confidence,
    });
  }
  return { response, results };
}

/**
 * Mirror of CLI render_supporting_files: child SKILL.md first (high priority),
 * then everything else, capped at 25 entries. Preview text is left intact —
 * the prompt template handles the per-block size budget on render.
 */
function orderSupportingFiles(skill: CanonicalSkill): Array<{ path: string; preview?: string }> {
  const others: Array<{ path: string; preview?: string }> = [];
  const skillMds: Array<{ path: string; preview?: string }> = [];
  for (const f of skill.files) {
    if (!f.preview || f.path === skill.entryFile) continue;
    const item = { path: f.path, preview: f.preview };
    if (/(^|\/)SKILL\.md$/i.test(f.path)) {
      skillMds.push(item);
    } else {
      others.push(item);
    }
  }
  skillMds.sort((a, b) => a.path.localeCompare(b.path));
  return [...skillMds, ...others].slice(0, 25);
}

function collectFinanceChecks(scenario: FinanceScenarioId): LlmCheckItem[] {
  return getFinancePillarsForScenario(scenario).flatMap((p) =>
    p.checks.map((c) => ({
      id: c.id,
      desc_zh: c.desc_zh,
      desc_en: c.desc_en,
    })),
  );
}

const ACCESS_TOKEN_STORAGE_KEY = "skilllens.llmAccessToken";

export function saveLlmAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (typeof window === "undefined") return headers;

  const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)?.trim();
  if (token) headers["x-skilllens-llm-token"] = token;
  return headers;
}
