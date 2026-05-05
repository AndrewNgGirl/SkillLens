/**
 * 市场调研（GitHub Search）相关类型。
 * 这是把"作者声明的竞品"升级成"客观的同类项目数据"的基础。
 */

/** 单个同类 repo 的精简信息 */
export interface MarketRepo {
  full_name: string;        // owner/repo
  html_url: string;
  description: string | null;
  stars: number;
  forks: number;
  /** 最后 push 时间（ISO 8601）—— 比 updated_at 更能反映"项目还活着没" */
  pushed_at: string;
  /** 主语言；可空 */
  language: string | null;
  topics: string[];
}

/** 一次市场调研的完整结果 */
export interface MarketSurvey {
  /** 实际用于搜索的 query 字符串（透明展示给用户） */
  query: string;
  /** 抽取出来的关键词（用于解释 query 是怎么拼出来的） */
  keywords: string[];
  /** 关键词来源：rules = 本地规则/词典；llm = 规则无命中或搜索 0 结果后由 LLM 翻译生成 */
  keyword_source?: "rules" | "llm";
  /** LLM 翻译关键词时的一句话理由（可选） */
  keyword_reason?: string;
  /** GitHub 报告的总匹配数；可能远大于 repos.length */
  total_count: number;
  /** 按 stars 降序的 top N */
  repos: MarketRepo[];
  /** 调研结果时间戳（用于缓存可视化） */
  fetched_at: string;
  /** 数据源标识，方便未来加多个源 */
  source: "github";
}

/** 调研失败时返回；不阻塞 LLM 评测 */
export interface MarketSurveyError {
  error: "rate_limited" | "auth" | "network" | "no_keywords" | "unknown";
  detail?: string;
}

export type MarketSurveyResult = MarketSurvey | MarketSurveyError;

export function isMarketSurvey(r: MarketSurveyResult | null | undefined): r is MarketSurvey {
  return !!r && "repos" in r;
}
