/**
 * 内容 hash 缓存（内存 LRU）。
 * - 线上冷启后失效，但仍可避免同会话内的重复调用。
 * - 预留 get/set 异步接口，后续可无痛切到 Upstash / Supabase / Redis。
 */
import { createHash } from "node:crypto";
import type { LlmReviewRequest, LlmReviewResponse } from "./types";

const MAX_ENTRIES = 512;
const MEM = new Map<string, LlmReviewResponse>();

export function hashRequest(req: LlmReviewRequest): string {
  const shape = {
    lang: req.lang,
    spec: req.spec,
    skillBody: req.skillBody,
    meta: req.meta,
    checks: req.checks.map((c) => c.id).sort(),
    // v3.2: marketSurvey 影响 LLM 评分，必须计入 hash 否则换了 survey 还命中旧缓存
    marketKey: req.marketSurvey
      ? `${req.marketSurvey.query}::${req.marketSurvey.repos.map((r) => r.full_name).sort().join(",")}`
      : "",
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex").slice(0, 32);
}

export async function cacheGet(key: string): Promise<LlmReviewResponse | null> {
  const hit = MEM.get(key);
  if (hit) {
    // LRU：访问即提前
    MEM.delete(key);
    MEM.set(key, hit);
    return { ...hit, cached: true };
  }
  return null;
}

export async function cacheSet(key: string, value: LlmReviewResponse): Promise<void> {
  if (MEM.size >= MAX_ENTRIES) {
    const oldest = MEM.keys().next().value;
    if (oldest) MEM.delete(oldest);
  }
  MEM.set(key, { ...value, cached: false });
}
