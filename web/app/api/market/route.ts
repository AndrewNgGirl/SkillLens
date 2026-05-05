/**
 * POST /api/market
 * body: { name?: string; description?: string; tags?: string[]; body?: string }
 * returns: MarketSurvey | MarketSurveyError
 *
 * 把 SKILL.md 的 frontmatter + 正文摘要发过来，server 抽关键词、查 GitHub Search、返回客观的同类项目数据。
 * 失败时返回 200 + error 字段（不阻塞前端继续做 LLM 评测）。
 */
import type { NextRequest } from "next/server";
import { extractKeywords, buildGithubQuery, summarizeQueries } from "@/lib/market/keywords";
import { searchReposMulti, GithubSearchError } from "@/lib/market/github-search";
import { hashMarketKey, marketCacheGet, marketCacheSet } from "@/lib/market/cache";
import { translateMarketKeywords } from "@/lib/market/llm-keywords";
import type { MarketSurvey, MarketSurveyError } from "@/lib/market/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ReqBody {
  name?: string;
  description?: string;
  tags?: string[];
  body?: string;
}

export async function POST(req: NextRequest) {
  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return json({ error: "unknown", detail: "invalid json" } satisfies MarketSurveyError, 400);
  }

  const input = {
    name: body.name?.trim(),
    description: body.description?.trim(),
    tags: body.tags?.filter(Boolean),
    body: body.body,
  };
  const keywords = extractKeywords(input);

  try {
    // 1) 本地规则/词典优先（免费、快、稳定）
    if (keywords.length > 0) {
      const first = await runGithubSurvey(keywords, "rules");
      // 搜到结果就直接返回；0 命中才启用 LLM fallback。
      if (first.survey.repos.length > 0) {
        return json(first.survey, 200, { "x-cache": first.cached ? "hit" : "miss" });
      }

      const fallback = await llmFallbackSurvey(input, "zero_results", keywords);
      if (fallback) {
        return json(fallback.survey, 200, {
          "x-cache": fallback.cached ? "hit" : "miss",
          "x-keyword-source": "llm",
        });
      }

      // LLM fallback 不可用/失败时，仍返回规则的 0 结果，前端可解释为"没找到同类"。
      return json(first.survey, 200, { "x-cache": first.cached ? "hit" : "miss" });
    }

    // 2) 规则完全抽不到关键词：用 LLM 翻译 3 个 search phrases
    const fallback = await llmFallbackSurvey(input, "no_keywords", []);
    if (fallback) {
      return json(fallback.survey, 200, {
        "x-cache": fallback.cached ? "hit" : "miss",
        "x-keyword-source": "llm",
      });
    }

    return json({ error: "no_keywords" } satisfies MarketSurveyError);
  } catch (e) {
    if (e instanceof GithubSearchError) {
      const payload: MarketSurveyError = { error: e.reason, detail: e.message.slice(0, 200) };
      // 返回 200 让前端按"软失败"处理，不打断主流程
      return json(payload, 200, { "x-market-error": e.reason });
    }
    return json({ error: "unknown", detail: (e as Error).message?.slice(0, 200) } satisfies MarketSurveyError, 200);
  }
}

async function llmFallbackSurvey(
  input: ReqBody,
  reason: "no_keywords" | "zero_results",
  previousKeywords: string[],
): Promise<{ survey: MarketSurvey; cached: boolean } | null> {
  const translated = await translateMarketKeywords({
    ...input,
    reason,
    previousKeywords,
  });
  if (translated.keywords.length === 0) return null;
  const result = await runGithubSurvey(translated.keywords, "llm", translated.reason);
  return result;
}

async function runGithubSurvey(
  keywords: string[],
  keywordSource: "rules" | "llm",
  keywordReason?: string,
): Promise<{ survey: MarketSurvey; cached: boolean }> {
  // 对每个关键词独立 build query；多个 query 并发 search 后 merge
  const queries = keywords.map(buildGithubQuery).filter(Boolean);
  const displayQuery = summarizeQueries(keywords);
  const key = hashMarketKey(`${keywordSource}|${queries.join("|")}`);

  const cached = marketCacheGet(key);
  if (cached) {
    return { survey: cached, cached: true };
  }

  const r = await searchReposMulti(queries, { perPage: 8, timeoutMs: 10_000 });
  const survey: MarketSurvey = {
    query: displayQuery,
    keywords,
    keyword_source: keywordSource,
    keyword_reason: keywordReason,
    total_count: r.total_count,
    repos: r.repos,
    fetched_at: new Date().toISOString(),
    source: "github",
  };
  marketCacheSet(key, survey);
  return { survey, cached: false };
}

function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}
