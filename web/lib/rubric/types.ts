import type { SpecType } from "../spec/canonical";

export type CheckType = "rule" | "llm";
/** Status semantics:
 *   pass / partial / fail — normally evaluated.
 *   n_a — would have been evaluated, but the run was rule-only or the LLM
 *         result was missing (waiting for Deep Review).
 *   not_applicable — explicitly filtered out by the rubric's `applies_to`
 *         field for this skill_type (e.g. `script_fallback` is scoped to
 *         atomic/composite, so pipeline skills mark it not_applicable and
 *         exclude it from the dimension denominator). */
export type CheckStatus = "pass" | "partial" | "fail" | "n_a" | "not_applicable";
/** Skill structural type matching CLI's resolve_skill_type. */
export type SkillStructuralType = "atomic" | "pipeline" | "composite";
export type EvidenceSource = "doc_check" | "llm_judgment" | "external_data" | "runtime_probe";
export type ConfidencePolicy = "high" | "medium" | "low";

/** 5 大支柱的色调编号；UI 用作主题色映射。 */
export type PillarColor = "indigo" | "violet" | "emerald" | "amber" | "slate";

export interface CheckDef {
  id: string;
  type: CheckType;
  weight: number;
  desc_zh: string;
  desc_en: string;
  /** 评分依据来源：用于 UI 透明展示"这个分数是怎么来的" */
  evidence_source?: EvidenceSource;
  /** 该类判断的默认可信度策略；LLM 可再给单条 confidence */
  confidence_policy?: ConfidencePolicy;
  fix_zh?: string;
  fix_en?: string;
  example_zh?: string;
  example_en?: string;
  /**
   * Optional scope: when set, the check is only evaluated for the listed
   * skill structural types. Filtered checks are emitted with status
   * "not_applicable" and excluded from the dimension denominator. Mirrors
   * rubric.yaml's `applies_to` field. Default (omitted) = applies to all.
   */
  applies_to?: SkillStructuralType[];
}

export interface DimensionDef {
  id: string;
  name_zh: string;
  name_en: string;
  /** 一句通俗"这个维度到底在考察什么"（v3：可选，主要 tagline 上移到 pillar） */
  tagline_zh?: string;
  tagline_en?: string;
  weight: number;
  /**
   * Optional dim-level scope. Mirrors `applies_to` on each child check and is
   * primarily a *documentation hint* — the actual filtering still happens per
   * check. UIs can use it to render "this dim is exclusive to skill_type X"
   * and to short-circuit rendering for fully-filtered dims.
   */
  applies_to?: SkillStructuralType[];
  checks: CheckDef[];
}

/** v3 新增：5 大支柱定义。每个支柱包多个 dimension。 */
export interface PillarDef {
  id: string;
  name_zh: string;
  name_en: string;
  weight: number;
  /** 一句"这个支柱在用户视角上回答什么问题" */
  tagline_zh: string;
  tagline_en: string;
  /** 角色定位，比如"决定天花板""基础门槛" */
  role_zh: string;
  role_en: string;
  /** UI 主题色 */
  color: PillarColor;
  dimensions: DimensionDef[];
}

export interface BonusDef {
  id: string;
  max: number;
  checks: CheckDef[];
}

export interface SpecConfig {
  entry_file: string | string[];
  required_fields: string[];
  recommended_fields: string[];
  desc_budget_chars: number;
}

export interface GradeThreshold {
  min: number;
  grade: "S" | "A" | "B" | "C" | "D";
  label_zh: string;
  label_en: string;
}

export interface Rubric {
  schema_version: number;
  total_score: number;
  specs: Record<SpecType, SpecConfig>;
  grades: GradeThreshold[];
  pillars: PillarDef[];
  bonus: BonusDef[];
}

// ---- 运行时产物 ----

export interface CheckResult {
  id: string;
  type: CheckType;
  status: CheckStatus;
  evidence: string;
  fix?: string;
  example?: string;
  weight: number;
  /** 0..1 连续得分（n_a / not_applicable 记 null）。LLM 项可给出 partial 以外的精细值。 */
  ratio: number | null;
  /** v3.3：这项分数主要来自哪里 */
  evidenceSource?: EvidenceSource;
  /** v3.3：该依据类型的默认可信度 */
  confidencePolicy?: ConfidencePolicy;
  /** v3.3：LLM 对本条判断的自评置信度，0..1；rule 项通常为空 */
  confidence?: number;
  /** Echoed scope from rubric when status="not_applicable", so the UI can
   *  explain why the check was skipped. */
  appliesTo?: SkillStructuralType[];
}

export interface DimensionResult {
  id: string;
  name_zh: string;
  name_en: string;
  /** Effective weight in the pillar; for not_applicable dims this is 0 (the
   *  budget has been redistributed to the remaining applicable dims). UI
   *  should show originalWeight (struck through) when notApplicable is true. */
  weight: number;
  /** 0..weight 的维度得分。null when the dim is fully filtered out by
   *  applies_to (CLI surfaces it as "—" instead of 0/4 to avoid suggesting
   *  the dim "failed"). */
  score: number | null;
  /** True when every check in this dim was filtered by applies_to for the
   *  current skill_type; the dim contributes nothing to the pillar score. */
  notApplicable?: boolean;
  /** What the dim weight would have been if it wasn't filtered — UI shows
   *  this struck-through next to "—" so reviewers see the redistribution. */
  originalWeight?: number;
  checks: CheckResult[];
}

/** v3 新增：支柱级运行时结果。 */
export interface PillarResult {
  id: string;
  name_zh: string;
  name_en: string;
  weight: number;
  /** 0..weight 的支柱得分 */
  score: number;
  /** 是否所有子维度都被评估了（非 n_a）；UI 用来显示"等待 LLM"占位 */
  evaluated: boolean;
  /** 全部被 LLM 评的维度数量 / 全部维度数量 */
  llmCoverage: { evaluated: number; total: number };
  dimensions: DimensionResult[];
}

/** 一条结构化的改进建议 —— 用来渲染卡片，而不再是纯字符串 */
export interface Suggestion {
  checkId: string;
  /** 所属维度 id */
  dimensionId: string;
  /** v3 新增：所属支柱 id（决定 UI 着色） */
  pillarId: string;
  severity: "high" | "medium";
  title: string;
  why: string;
  how: string;
  example?: string;
  weight: number;
}

/** v3.1：LLM 推断的 skill 价值类型，用来上下文化"商业价值/市场"评判 */
export type ValueType =
  | "productivity"
  | "decision_support"
  | "learning"
  | "emotion_expression"
  | "utility";

export interface ScoreReport {
  spec: SpecType;
  language: "zh" | "en";
  total: number;              // 0..100
  grade: "S" | "A" | "B" | "C" | "D";
  pillars: PillarResult[];    // v3：以 pillar 为顶层组织
  bonus: number;              // 0..5
  suggestions: Suggestion[];
  entryFile: string;
  generatedAt: string;
  /** 是否包含完整 LLM 评测；false 时商业/市场/稳定性 等支柱可能空缺 */
  llmComplete: boolean;
  /** v3.1 新增：LLM 给出的 skill 价值类型 + 一句话理由（rule-only 阶段为空） */
  valueType?: ValueType;
  valueTypeReason?: string;
  /**
   * v3.4 新增：skill 结构类型（与 CLI 报告完全对齐）。
   * 让 web UI 在 dashboard 区也能展示和 HTML 报告一致的 "skill 类型 / 子 SKILL.md" 视图。
   */
  skillType?: SkillStructuralType;
  /** true 表示 skillType 是按 child SKILL.md 数量自动推断；false 表示用户在 Uploader 显式指定 */
  skillTypeAutoDetected?: boolean;
  /** 发现的子 SKILL.md 列表；atomic 包通常为空数组 */
  subSkills?: SubSkillSummary[];
}

export interface SubSkillSummary {
  path: string;            // 相对 skill 根目录的路径，例如 "agents/reviewer/SKILL.md"
  name?: string;           // 子 skill frontmatter 的 name
  description?: string;    // 子 skill frontmatter 的 description
  bodyChars?: number;      // SKILL.md body 字符数（去掉 frontmatter 之后）
}
