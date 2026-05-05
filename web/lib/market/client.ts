/**
 * 浏览器端：用 SKILL.md 摘要触发 /api/market，拿回客观的同类项目调研结果。
 * 失败时返回 MarketSurveyError，调用方应继续走 LLM 评测，不阻塞。
 */
import type { MarketSurveyResult } from "./types";

export interface MarketProbeInput {
  name?: string;
  description?: string;
  tags?: string[];
  body?: string;
}

export async function fetchMarketSurvey(
  input: MarketProbeInput,
  opts: { signal?: AbortSignal } = {},
): Promise<MarketSurveyResult> {
  try {
    const r = await fetch("/api/market", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: opts.signal,
    });
    if (!r.ok) {
      return { error: "unknown", detail: `HTTP ${r.status}` };
    }
    return (await r.json()) as MarketSurveyResult;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { error: "network", detail: (e as Error).message };
  }
}
