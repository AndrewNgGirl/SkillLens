/**
 * POST /api/llm
 * body: LlmReviewRequest
 * returns: LlmReviewResponse
 *
 * - 自托管 Key：env.ANTHROPIC_API_KEY / env.DEEPSEEK_API_KEY
 * - 未配置 Key 时走 mock（全 0.5），前端显示 provider=mock
 * - 浏览器同源保护 + 可选访问令牌 + IP 限流 + 内容 hash 缓存
 */
import type { NextRequest } from "next/server";
import { runLlm } from "@/lib/llm/provider";
import { cacheGet, cacheSet, hashRequest } from "@/lib/llm/cache";
import { getClientKey, isLocalBypass, limiter } from "@/lib/llm/limiter";
import type { LlmReviewRequest } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 45; // seconds (for Vercel)

const MAX_BODY_CHARS = Number(process.env.MAX_INPUT_CHARS ?? 50000);
const ACCESS_TOKEN = process.env.LLM_ACCESS_TOKEN?.trim();
const REQUIRE_BROWSER_REQUEST = process.env.LLM_REQUIRE_BROWSER_REQUEST !== "0";

export async function POST(req: NextRequest) {
  const hasTokenAccess = ACCESS_TOKEN ? hasValidAccessToken(req, ACCESS_TOKEN) : false;
  if (!hasTokenAccess && hasProviderKey() && REQUIRE_BROWSER_REQUEST && !isLikelyBrowserSameOrigin(req)) {
    return json(
      {
        error: "llm_browser_required",
        detail: "Deep review must be started from the SkillLens web page.",
      },
      403,
    );
  }

  let body: LlmReviewRequest;
  try {
    body = (await req.json()) as LlmReviewRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  // 基本 schema 校验
  if (!body?.skillBody || !Array.isArray(body?.checks) || body.checks.length === 0) {
    return json({ error: "missing_fields" }, 400);
  }

  // 输入长度上限（超长时降级仅评 SKILL.md body）
  if (body.skillBody.length > MAX_BODY_CHARS) {
    body = { ...body, skillBody: body.skillBody.slice(0, MAX_BODY_CHARS), supportingFiles: [] };
  } else if (body.supportingFiles && body.supportingFiles.length > 30) {
    body = { ...body, supportingFiles: body.supportingFiles.slice(0, 30) };
  }

  // 限流（本地回环 IP 跳过）
  const clientKey = getClientKey(req);
  if (!isLocalBypass(clientKey)) {
    const rl = await limiter.check(clientKey);
    if (!rl.ok) {
      return json(
        { error: "rate_limited", remaining: 0, resetMs: rl.resetMs },
        429,
        { "retry-after": String(Math.ceil(rl.resetMs / 1000)) },
      );
    }
  }

  // 缓存
  const key = hashRequest(body);
  const hit = await cacheGet(key);
  if (hit) return json(hit, 200, { "x-cache": "hit" });

  // 调模型
  try {
    const out = await runLlm(body);
    await cacheSet(key, out);
    return json(out, 200, { "x-cache": "miss", "x-provider": out.provider });
  } catch (e) {
    const msg = (e as Error).message || "unknown";
    console.error("[api/llm] error:", msg);
    const reason = classifyProviderError(msg);
    return json({ error: reason, detail: msg.slice(0, 400) }, 502);
  }
}

/** 把上游 provider 报错归一成前端能渲染的 reason code。 */
function classifyProviderError(m: string): string {
  const lower = m.toLowerCase();
  if (/insufficient\s*balance|余额不足|credit.*exhaust/i.test(m)) return "provider_no_balance";
  if (/401|unauthor|invalid.*api.*key/i.test(lower)) return "provider_auth";
  if (/429|rate.?limit|too.*many/i.test(lower)) return "provider_rate_limited";
  if (/aborted|timeout|timed.*out/i.test(lower)) return "provider_timeout";
  if (/enotfound|econnrefused|network/i.test(lower)) return "provider_network";
  return "llm_failed";
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

function hasValidAccessToken(req: NextRequest, expected: string): boolean {
  const headerToken = req.headers.get("x-skilllens-llm-token")?.trim();
  const auth = req.headers.get("authorization")?.trim();
  const bearerToken = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : undefined;
  return headerToken === expected || bearerToken === expected;
}

function hasProviderKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY);
}

function isLikelyBrowserSameOrigin(req: NextRequest): boolean {
  const expectedOrigin = new URL(req.url).origin;
  const origin = req.headers.get("origin");
  if (origin) return origin === expectedOrigin;

  const referer = req.headers.get("referer");
  if (referer?.startsWith(`${expectedOrigin}/`)) return true;

  const secFetchSite = req.headers.get("sec-fetch-site");
  return secFetchSite === "same-origin" || secFetchSite === "same-site";
}
