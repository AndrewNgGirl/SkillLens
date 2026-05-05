/**
 * LLM provider 适配层：Anthropic 主、DeepSeek 兜底。
 * 不引 SDK，直接 fetch，更容易跨 Edge / Node runtime 部署。
 */
import type { LlmCheckResult, LlmMeta, LlmReviewRequest, LlmReviewResponse, ValueType } from "./types";

const VALUE_TYPES: ValueType[] = [
  "productivity",
  "decision_support",
  "learning",
  "emotion_expression",
  "utility",
];
import { ratioToStatus, renderPrompt } from "./prompts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VER = "2023-06-01";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
/**
 * DeepSeek 默认走 V4-flash —— 与 v3 评测的多 check 一次性 JSON 输出场景最匹配：
 * 速度快、JSON Output 稳定、价格几乎没涨。
 * 想换 V4-pro（更准但更贵）：在 .env.local 设 DEEPSEEK_MODEL=deepseek-v4-pro
 */
const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

/**
 * V4 默认开启 thinking 模式（更聪明但更慢更贵）。
 * 我们的评测一次要出 17 个 check 的 JSON，倾向走 non-thinking（快 2-3x，便宜）。
 * 设 LLM_THINKING_MODE=enabled 切到 thinking 模式（适合需要深度商业判断时）。
 */
const DEEPSEEK_THINKING_MODE: "enabled" | "disabled" =
  process.env.LLM_THINKING_MODE === "enabled" ? "enabled" : "disabled";

export interface ProviderResult {
  provider: "anthropic" | "deepseek" | "mock";
  model: string;
  raw: string;
  usage?: LlmReviewResponse["usage"];
}

/** 主入口：先 Anthropic，失败降级 DeepSeek；都没 Key 时走 mock（返回全 0.5）。 */
export async function runLlm(req: LlmReviewRequest): Promise<LlmReviewResponse> {
  const { system, user } = renderPrompt(req);

  let result: ProviderResult;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      result = await callAnthropic(system, user);
    } catch (e) {
      if (process.env.DEEPSEEK_API_KEY) {
        console.warn("[llm] anthropic failed, falling back to deepseek:", (e as Error).message);
        result = await callDeepseek(system, user);
      } else {
        throw e;
      }
    }
  } else if (process.env.DEEPSEEK_API_KEY) {
    result = await callDeepseek(system, user);
  } else {
    result = mockResult(user);
  }

  const parsed = parseModelJson(result.raw);
  const results: Record<string, LlmCheckResult> = {};
  for (const c of req.checks) {
    const raw = parsed?.results?.[c.id];
    if (raw && typeof raw.ratio === "number") {
      const evidence = String(raw.evidence ?? "").slice(0, 400);
      const r = normalizeRatio(c.id, clamp01(raw.ratio), evidence);
      results[c.id] = {
        id: c.id,
        ratio: r,
        status: ratioToStatus(r),
        evidence,
        fix: raw.fix ? String(raw.fix).slice(0, 500) : undefined,
        confidence: typeof raw.confidence === "number" ? clamp01(raw.confidence) : undefined,
      };
    } else {
      results[c.id] = {
        id: c.id, ratio: 0, status: "fail",
        evidence: req.lang === "zh" ? "LLM 未给出有效评分" : "no valid score from LLM",
      };
    }
  }

  const meta = parseMeta(parsed?.meta);

  return {
    provider: result.provider,
    model: result.model,
    cached: false,
    results,
    meta,
    usage: result.usage,
  };
}

function parseMeta(raw: unknown): LlmMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { value_type?: unknown; value_type_reason?: unknown };
  const vt = typeof r.value_type === "string" ? r.value_type.trim().toLowerCase() : "";
  const valueType = (VALUE_TYPES as string[]).includes(vt) ? (vt as ValueType) : undefined;
  const reason = typeof r.value_type_reason === "string" ? r.value_type_reason.slice(0, 200) : undefined;
  if (!valueType && !reason) return undefined;
  return { value_type: valueType, value_type_reason: reason };
}

// ---------- Anthropic ----------

async function callAnthropic(system: string, user: string): Promise<ProviderResult> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": ANTHROPIC_VER,
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`anthropic ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = await resp.json();
  const text = (json?.content ?? [])
    .filter((p: { type: string }) => p.type === "text")
    .map((p: { text: string }) => p.text)
    .join("");
  return {
    provider: "anthropic",
    model: json?.model ?? DEFAULT_ANTHROPIC_MODEL,
    raw: text,
    usage: {
      prompt_tokens: json?.usage?.input_tokens,
      completion_tokens: json?.usage?.output_tokens,
    },
  };
}

// ---------- DeepSeek (OpenAI-compatible) ----------

async function callDeepseek(system: string, user: string): Promise<ProviderResult> {
  const ctl = new AbortController();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 180_000);
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.DEEPSEEK_API_KEY!}`,
      },
      body: JSON.stringify({
        model: DEFAULT_DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 2048,
        // V4 专属字段，旧模型会忽略；默认 disabled 走最快/最便宜路径
        thinking: { type: DEEPSEEK_THINKING_MODE },
      }),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`deepseek ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = await resp.json();
  return {
    provider: "deepseek",
    model: json?.model ?? DEFAULT_DEEPSEEK_MODEL,
    raw: json?.choices?.[0]?.message?.content ?? "",
    usage: {
      prompt_tokens: json?.usage?.prompt_tokens,
      completion_tokens: json?.usage?.completion_tokens,
    },
  };
}

// ---------- Mock（未配置 Key 时） ----------

function mockResult(user: string): ProviderResult {
  const idRegex = /- id: ([\w.]+)/g;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRegex.exec(user))) ids.push(m[1]);
  const results: Record<string, { ratio: number; evidence: string; confidence: number }> = {};
  for (const id of ids) {
    results[id] = { ratio: 0.5, evidence: "[mock] LLM not configured; returning neutral 0.5 for all checks.", confidence: 0.3 };
  }
  return {
    provider: "mock", model: "mock-0",
    raw: JSON.stringify({ results }),
    usage: { prompt_tokens: 0, completion_tokens: 0 },
  };
}

// ---------- helpers ----------

function parseModelJson(raw: string): {
  results?: Record<string, { ratio: number; evidence?: string; fix?: string; confidence?: number }>;
  meta?: unknown;
} | null {
  if (!raw) return null;
  // 尝试直接 parse
  try { return JSON.parse(raw); } catch { /* noop */ }
  // 模型有时会裹 ```json ... ``` 或 prose
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* noop */ }
  }
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeRatio(checkId: string, ratio: number, evidence: string): number {
  // 产品规则：目标用户不必显式写 ## Target users；只要能从场景/输入输出稳定推断，就应视为清晰。
  // 某些模型会因为“未显式写出团队规模/角色”保守给 partial，这里做一个窄范围校正。
  if (checkId === "biz.target_users.specific") {
    const lower = evidence.toLowerCase();
    const inferable = /可推断|推断出|inferable|inferred|can infer/.test(evidence) || lower.includes("target users can be inferred");
    const unclear = /不清晰|不明确|所有人|任何人|unclear|anyone|everyone/.test(evidence);
    if (inferable && !unclear) return Math.max(ratio, 0.85);
  }
  return ratio;
}
