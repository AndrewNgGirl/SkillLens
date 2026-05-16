import type { CheckStatus } from "../rubric/types";
import type { MarketSurvey } from "../market/types";
import type { FinanceScenarioId } from "../domain/finance";

export interface LlmCheckItem {
  id: string;                  // e.g. "act.steps_atomic"
  desc_zh: string;
  desc_en: string;
}

/**
 * v3.3 新增：skill 结构提示。
 *  - "atomic"    单一职责 SKILL.md
 *  - "pipeline"  根 SKILL.md 是编排器，业务逻辑分布在多个子 SKILL.md / scripts / schema 里
 *  - "composite" 多个互不耦合的子 skill 工具集，根 SKILL.md 只做导航
 *
 * `skillTypeAutoDetected = true` 表示该值由前端 / CLI 自动推断（数子 SKILL.md 数量），
 * 用户没有显式选择；prompt 端可据此调整语气（比如显式说"自动识别为 pipeline"）。
 */
export type SkillType = "atomic" | "pipeline" | "composite";

export interface SkillTypeContext {
  skillType: SkillType;
  autoDetected: boolean;
  subSkills?: Array<{
    path: string;
    name?: string;
    description?: string;
    bodyChars?: number;
  }>;
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
  expertReview?: {
    domain: "finance";
    scenario: FinanceScenarioId;
    schemaVersion: string;
  };
  /** v3.3：skill 结构上下文，pipeline / composite 评估时给 LLM 不同的 lens。 */
  skillContext?: SkillTypeContext;
  /**
   * v3.4：LLM 输出语言。指定后 LLM 会把 evidence / fix / value_type_reason
   * 用该语言书写，与 request.lang（决定 prompt 主体 / checks 描述语言）解耦：
   *   - 不传：跟随 request.lang
   *   - "zh"：始终用简体中文回答（即使 SKILL.md 是英文）
   *   - "en"：始终用英文回答
   */
  outputLang?: "zh" | "en";
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
