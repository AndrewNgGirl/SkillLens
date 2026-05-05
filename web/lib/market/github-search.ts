/**
 * GitHub Search Repositories API 客户端。
 *
 * - 无 token: 60 req/h（够 demo）
 * - 有 token: 5000 req/h
 * - 不引 SDK，直接 fetch；server-side only。
 */
import type { MarketRepo } from "./types";

const SEARCH_URL = "https://api.github.com/search/repositories";

interface RawRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  language: string | null;
  topics?: string[];
}

interface RawSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: RawRepo[];
}

export interface SearchOptions {
  /** 取 top N（按 stars 排），默认 8 */
  perPage?: number;
  /** 超时 ms，默认 10s */
  timeoutMs?: number;
  /** AbortSignal pass-through */
  signal?: AbortSignal;
}

export interface SearchResult {
  total_count: number;
  repos: MarketRepo[];
}

export class GithubSearchError extends Error {
  constructor(
    public reason: "rate_limited" | "auth" | "network" | "unknown",
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "GithubSearchError";
  }
}

/**
 * 对**多个独立 query 并发执行 search**，round-robin 合并 dedupe。
 * 比单个 OR 表达式更准（GitHub Search 不支持括号 OR）也更全。
 *
 * **关键**：合并时按 round-robin 而非全局 stars 排序 —— 否则某个泛用关键词拉回的
 * 巨型项目（如 git/git, postgres）会霸榜，把更精准 query 的好结果挤掉。
 *
 * @returns 各 query 的总匹配数之和（去重前），以及 round-robin 合并后的 top N。
 */
export async function searchReposMulti(
  queries: string[],
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const perPage = Math.min(Math.max(opts.perPage ?? 8, 1), 30);
  // 每个 query 多取一些（覆盖 dedupe 损失），最终截断到 perPage
  const subPage = Math.min(perPage + 2, 12);
  const results = await Promise.allSettled(
    queries.map((q) => searchRepos(q, { ...opts, perPage: subPage })),
  );

  // 收集每个 query 的 repo 列表（已经按 stars 降序）
  const lists: MarketRepo[][] = [];
  let totalCount = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    totalCount += r.value.total_count;
    if (r.value.repos.length > 0) lists.push(r.value.repos);
  }

  if (lists.length === 0) {
    const firstFail = results.find((r) => r.status === "rejected");
    if (firstFail && firstFail.status === "rejected") throw firstFail.reason;
    return { total_count: 0, repos: [] };
  }

  // Round-robin 取：第一轮各 query 各取 top1，第二轮各取 top2，依此类推；同名跳过
  const seen = new Set<string>();
  const merged: MarketRepo[] = [];
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen && merged.length < perPage; i++) {
    for (const list of lists) {
      if (i >= list.length) continue;
      const repo = list[i];
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);
      merged.push(repo);
      if (merged.length >= perPage) break;
    }
  }

  return { total_count: totalCount, repos: merged };
}

export async function searchRepos(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const perPage = Math.min(Math.max(opts.perPage ?? 8, 1), 30);
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "skilllens-evaluator/0.1",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  // 把外层 signal 也桥接进来
  if (opts.signal) {
    if (opts.signal.aborted) ctl.abort();
    else opts.signal.addEventListener("abort", () => ctl.abort(), { once: true });
  }

  let resp: Response;
  try {
    resp = await fetch(url.toString(), { headers, signal: ctl.signal });
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error).message || "fetch failed";
    if (/abort/i.test(msg)) throw new GithubSearchError("network", "github search timeout");
    throw new GithubSearchError("network", msg);
  }
  clearTimeout(timer);

  if (resp.status === 401 || resp.status === 403) {
    const body = await resp.text();
    // GitHub 把 rate limit 也归在 403
    if (/rate.limit|api.rate/i.test(body)) {
      throw new GithubSearchError("rate_limited", body.slice(0, 200), resp.status);
    }
    throw new GithubSearchError("auth", body.slice(0, 200), resp.status);
  }
  if (!resp.ok) {
    throw new GithubSearchError("unknown", `github ${resp.status}: ${(await resp.text()).slice(0, 200)}`, resp.status);
  }

  const json = (await resp.json()) as RawSearchResponse;
  const repos: MarketRepo[] = (json.items ?? []).slice(0, perPage).map((r) => ({
    full_name: r.full_name,
    html_url: r.html_url,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    pushed_at: r.pushed_at,
    language: r.language,
    topics: r.topics ?? [],
  }));
  return { total_count: json.total_count ?? 0, repos };
}
