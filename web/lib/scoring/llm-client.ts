/**
 * 浏览器端辅助：把 CanonicalSkill + rubric 的 LLM 细则清单
 * 包装成 /api/llm 的请求，调用后把响应转为 CheckResult map，
 * 喂给 aggregateScore 的 llmResults 参数。
 */
import type { CanonicalSkill } from "@/lib/spec/canonical";
import type { CheckResult, Rubric } from "@/lib/rubric/types";
import type { LlmCheckItem, LlmReviewRequest, LlmReviewResponse } from "@/lib/llm/types";
import type { MarketSurvey } from "@/lib/market/types";

export function collectLlmChecks(rubric: Rubric, opts: { pillarIds?: string[] } = {}): LlmCheckItem[] {
  const out: LlmCheckItem[] = [];
  const push = (c: { id: string; type: "rule" | "llm"; desc_zh: string; desc_en: string }) => {
    if (c.type === "llm") out.push({ id: c.id, desc_zh: c.desc_zh, desc_en: c.desc_en });
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
  opts: { signal?: AbortSignal; pillarIds?: string[]; marketSurvey?: MarketSurvey; lang?: "zh" | "en" } = {},
): Promise<{ response: LlmReviewResponse; results: Map<string, CheckResult> }> {
  const checks = collectLlmChecks(rubric, { pillarIds: opts.pillarIds });
  const req: LlmReviewRequest = {
    lang: opts.lang ?? skill.language,
    spec: skill.spec,
    skillBody: skill.body,
    meta: skill.meta,
    supportingFiles: skill.files
      .filter((f) => f.preview && f.path !== skill.entryFile)
      .map((f) => ({ path: f.path, preview: f.preview })),
    checks,
    marketSurvey: opts.marketSurvey,
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
