import type { CheckStatus } from "../rubric/types";
import type { MarketSurvey } from "../market/types";

export interface LlmCheckItem {
  id: string;                  // e.g. "act.steps_atomic"
  desc_zh: string;
  desc_en: string;
}

export interface LlmReviewRequest {
  lang: "zh" | "en";
  spec: string;                // skill spec name
  skillBody: string;           // SKILL.md body (已去 frontmatter)
  meta: Record<string, unknown>;
  supportingFiles?: Array<{ path: string; preview?: string }>;
  checks: LlmCheckItem[];
  /**
   * v3.2 新增：客观市场调研结果（GitHub Search）。
   * 当存在时，LLM 会基于真实 repo 列表来评 market.existing_alternatives，
   * 而不是盲猜文档。失败/空结果时省略此字段，prompt 会回退到旧行为。
   */
  marketSurvey?: MarketSurvey;
}

/** 单条检查的 LLM 评审结果 */
export interface LlmCheckResult {
  id: string;
  ratio: number;               // 0..1 连续得分
  status: CheckStatus;         // 由 ratio 推导：>=0.85 pass, >=0.4 partial, else fail
  evidence: string;            // 简短诊断，跟随 request.lang
  fix?: string;                // 怎么改的建议，跟随 request.lang
  confidence?: number;         // LLM 对本条判断的自评置信度，0..1
}

/** LLM 推断出的 skill 价值类型；用来上下文化"商业价值/市场"评判 */
export type ValueType =
  | "productivity"
  | "decision_support"
  | "learning"
  | "emotion_expression"
  | "utility";

export interface LlmMeta {
  value_type?: ValueType;
  value_type_reason?: string;
}

export interface LlmReviewResponse {
  provider: "anthropic" | "deepseek" | "mock";
  model: string;
  cached: boolean;
  results: Record<string, LlmCheckResult>;
  /** v3.1 新增：LLM 给出的 skill 整体定性（价值类型 + 一句话解释） */
  meta?: LlmMeta;
  /** 仅服务端日志使用，不给前端；这里保留字段以便调试 */
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
