/**
 * 聚合：把 check 结果 + 权重 → 总分、等级、5 大支柱、维度细则、Top-N 建议。
 *
 * v3：顶层从 dimensions 改为 pillars[]。
 *      - dimension.score = (∑ ratio*w over evaluated checks) / (∑ w over evaluated) * normalized dimension.weight
 *      - pillar.score = ∑ dimension.score
 *      - total = ∑ pillar.score
 *      - n_a 不进分母（避免关 LLM 时被冤枉拉低）
 */
import type { CanonicalSkill } from "../spec/canonical";
import type {
  CheckDef,
  CheckResult,
  ConfidencePolicy,
  DimensionResult,
  EvidenceSource,
  PillarResult,
  Rubric,
  ScoreReport,
  Suggestion,
} from "../rubric/types";
import type { SkillType } from "../llm/types";
import { resolveSubSkills } from "../spec/sub-skills";
import { scoreAllRules } from "./rules";

export interface AggregateOptions {
  /** 通用版两级权重覆盖：先归一化支柱，再在支柱内归一化子维度。 */
  weightOverrides?: GeneralWeightOverrides;
  /** LLM 检查项结果（id → CheckResult），未提供则跳过（记 n_a）。 */
  llmResults?: Map<string, CheckResult>;
  /** 改进建议条目数 */
  topSuggestions?: number;
  /** 展示语言：默认跟随 skill，但 Web UI 可强制中文/英文 */
  language?: "zh" | "en";
  /**
   * v3.4：用户在 Uploader 上显式选的 skill 结构类型（"auto" / 不传 = 自动检测）。
   * 决定 ScoreReport 上 skillType / skillTypeAutoDetected / subSkills 的取值，
   * 让 web 端 dashboard 也能展示 HTML 报告里的 "skill 类型 / 子 SKILL.md" 卡片。
   */
  skillType?: SkillType | "auto";
}

export interface GeneralWeightOverrides {
  pillars?: Record<string, number>;
  dimensions?: Record<string, number>;
}

export function aggregateScore(
  skill: CanonicalSkill,
  rubric: Rubric,
  opts: AggregateOptions = {},
): ScoreReport {
  const ruleResults = scoreAllRules(skill, rubric);
  const llmResults = opts.llmResults ?? new Map<string, CheckResult>();
  const displayLang = opts.language ?? skill.language;

  // Resolve skill structural type up front so applies_to filtering can
  // happen inside the main scoring loop. Mirrors the CLI's
  // resolve_skill_type() ordering.
  const subSkillResolution = resolveSubSkills(skill, opts.skillType);
  const resolvedSkillType = subSkillResolution.skillType;

  const dimensionWeights = normalizeDimensionWeights(
    rubric,
    opts.weightOverrides,
    resolvedSkillType,
  );

  const pillarResults: PillarResult[] = [];
  let total = 0;
  let totalLlmEvaluated = 0;
  let totalLlmExpected = 0;

  for (const pillar of rubric.pillars) {
    const dimsOut: DimensionResult[] = [];
    let pillarScore = 0;
    let pillarWeight = 0;
    let llmEvaluatedInPillar = 0;
    let llmExpectedInPillar = 0;

    for (const dim of pillar.dimensions) {
      const scaledDimWeight = dimensionWeights[dim.id] ?? dim.weight;
      // Pre-filter checks for effective-weight calc: not_applicable checks
      // shouldn't dilute the dimension's per-check weight share.
      const applicableChecks = dim.checks.filter((c) => checkApplies(c, resolvedSkillType));
      const dimAllNa = applicableChecks.length === 0;

      // Dim entirely filtered out: emit a notApplicable record with weight=0
      // and score=null so the dim is visible in the report but contributes
      // nothing to the pillar. The pillar's denominator was already
      // recomputed inside normalizeDimensionWeights so the remaining dims
      // pick up the slack — no double counting needed here.
      if (dimAllNa) {
        const checksOut: CheckResult[] = dim.checks.map((c) => {
          const transparency = getCheckTransparency(c);
          return {
            id: c.id,
            type: c.type,
            status: "not_applicable" as const,
            evidence: notApplicableEvidence(c, resolvedSkillType, displayLang),
            ratio: null,
            weight: c.weight,
            evidenceSource: transparency.evidenceSource,
            confidencePolicy: transparency.confidencePolicy,
            appliesTo: c.applies_to,
          };
        });
        dimsOut.push({
          id: dim.id,
          name_zh: dim.name_zh,
          name_en: dim.name_en,
          weight: 0,
          score: null,
          notApplicable: true,
          originalWeight: round2(scaledDimWeight),
          checks: checksOut,
        });
        continue;
      }

      pillarWeight += scaledDimWeight;
      let earned = 0;
      let denom = 0;
      const checksOut: CheckResult[] = [];
      for (const c of dim.checks) {
        if (!checkApplies(c, resolvedSkillType)) {
          // Partial filter (some applicable, some not): keep the visible
          // not_applicable row but skip rule/LLM evaluation and earned/denom.
          const transparency = getCheckTransparency(c);
          checksOut.push({
            id: c.id,
            type: c.type,
            status: "not_applicable",
            evidence: notApplicableEvidence(c, resolvedSkillType, displayLang),
            ratio: null,
            weight: round2(checkWeightWithinDimension(c, applicableChecks, scaledDimWeight)),
            evidenceSource: transparency.evidenceSource,
            confidencePolicy: transparency.confidencePolicy,
            appliesTo: c.applies_to,
          });
          continue;
        }
        if (c.type === "llm") {
          llmExpectedInPillar++;
          totalLlmExpected++;
        }
        const r =
          c.type === "rule"
            ? ruleResults.get(c.id)
            : llmResults.get(c.id) ?? {
                id: c.id, type: "llm" as const, weight: c.weight,
                status: "n_a" as const,
                evidence: displayLang === "zh" ? "等待 SkillLens 深度评测" : "SkillLens Deep Review skipped",
                ratio: null,
              };
        if (c.type === "llm" && r && r.ratio !== null) {
          llmEvaluatedInPillar++;
          totalLlmEvaluated++;
        }
        const base = r ?? {
          id: c.id, type: c.type, weight: c.weight,
          status: "n_a" as const,
          evidence: displayLang === "zh" ? "暂无评测结果" : "no result",
          ratio: null,
        };
        const transparency = getCheckTransparency(c);
        const fix = base.fix ?? pickLang(c, "fix", displayLang);
        const example = base.example ?? pickLang(c, "example", displayLang);
        const effectiveCheckWeight = checkWeightWithinDimension(c, applicableChecks, scaledDimWeight);
        checksOut.push({
          ...base,
          weight: round2(effectiveCheckWeight),
          fix,
          example,
          evidenceSource: base.evidenceSource ?? transparency.evidenceSource,
          confidencePolicy: base.confidencePolicy ?? transparency.confidencePolicy,
        });
        if (base.ratio !== null) {
          earned += base.ratio * c.weight;
          denom += c.weight;
        }
      }
      const dimScore = denom > 0 ? (earned / denom) * scaledDimWeight : 0;
      pillarScore += dimScore;
      dimsOut.push({
        id: dim.id, name_zh: dim.name_zh, name_en: dim.name_en,
        weight: round2(scaledDimWeight), score: round2(dimScore), checks: checksOut,
      });
    }

    total += pillarScore;
    pillarResults.push({
      id: pillar.id,
      name_zh: pillar.name_zh,
      name_en: pillar.name_en,
      weight: round2(pillarWeight),
      score: round2(pillarScore),
      evaluated: llmExpectedInPillar === 0 || llmEvaluatedInPillar === llmExpectedInPillar,
      llmCoverage: { evaluated: llmEvaluatedInPillar, total: llmExpectedInPillar },
      dimensions: dimsOut,
    });
  }

  // Bonus（不占主池，+max 封顶）
  let bonusTotal = 0;
  for (const b of rubric.bonus) {
    let earned = 0;
    let denom = 0;
    for (const c of b.checks) {
      if (!checkApplies(c, resolvedSkillType)) continue;
      const r =
        c.type === "rule" ? ruleResults.get(c.id) : llmResults.get(c.id);
      if (r && r.ratio !== null) {
        earned += r.ratio * c.weight;
        denom += c.weight;
      }
    }
    if (denom > 0) bonusTotal += (earned / denom) * b.max;
  }

  const grade = rubric.grades.find((g) => total >= g.min)?.grade ?? "D";

  const suggestions = buildSuggestions(
    pillarResults,
    rubric,
    displayLang,
    opts.topSuggestions ?? 6,
  );

  return {
    spec: skill.spec,
    language: displayLang,
    total: round2(total),
    grade,
    pillars: pillarResults,
    bonus: round2(Math.min(bonusTotal, sumBonusMax(rubric))),
    suggestions,
    entryFile: skill.entryFile,
    generatedAt: new Date().toISOString(),
    llmComplete: totalLlmExpected === 0 || totalLlmEvaluated === totalLlmExpected,
    skillType: subSkillResolution.skillType,
    skillTypeAutoDetected: subSkillResolution.autoDetected,
    subSkills: subSkillResolution.subSkills,
  };
}

/**
 * Mirrors CLI's check_applies(): a check declares its scope via the optional
 * `applies_to` array (e.g. `[atomic, composite]`). Without that field the
 * check applies universally. Filtered checks become `not_applicable` rows
 * and are excluded from earned/denom so dimension scores auto-renormalize.
 */
function checkApplies(c: CheckDef, skillType: SkillType): boolean {
  if (!c.applies_to || c.applies_to.length === 0) return true;
  return c.applies_to.includes(skillType);
}

/** Localized boilerplate for the not_applicable status row. */
function notApplicableEvidence(c: CheckDef, skillType: SkillType, lang: "zh" | "en"): string {
  const scope = (c.applies_to ?? []).join(", ") || "—";
  if (lang === "zh") {
    return `对当前 skill 类型 ${skillType} 不适用（仅适用于：${scope}）`;
  }
  return `Not applicable for skill_type=${skillType} (scoped to: ${scope})`;
}

function pickLang(c: CheckDef, kind: "fix" | "example", lang: "zh" | "en"): string | undefined {
  const zh = kind === "fix" ? c.fix_zh : c.example_zh;
  const en = kind === "fix" ? c.fix_en : c.example_en;
  if (!zh && !en) return undefined;
  return lang === "zh" ? (zh ?? en) : (en ?? zh);
}

function getCheckTransparency(c: CheckDef): {
  evidenceSource: EvidenceSource;
  confidencePolicy: ConfidencePolicy;
} {
  if (c.evidence_source && c.confidence_policy) {
    return { evidenceSource: c.evidence_source, confidencePolicy: c.confidence_policy };
  }

  const inferred = inferTransparency(c);
  return {
    evidenceSource: c.evidence_source ?? inferred.evidenceSource,
    confidencePolicy: c.confidence_policy ?? inferred.confidencePolicy,
  };
}

function inferTransparency(c: CheckDef): { evidenceSource: EvidenceSource; confidencePolicy: ConfidencePolicy } {
  if (c.type === "rule") {
    return { evidenceSource: "doc_check", confidencePolicy: "high" };
  }

  // 有外部 GitHub Search 数据辅助；若数据源失败，LLM prompt 会说明降级为 doc-only。
  if (c.id === "market.existing_alternatives.surveyed") {
    return { evidenceSource: "external_data", confidencePolicy: "medium" };
  }

  // 这些是产品/市场/模型能力的经验判断：有价值，但不应伪装成真实市场验证。
  if (
    c.id.startsWith("biz.") ||
    c.id === "market.differentiation.clear" ||
    c.id === "market.scope_focus.disciplined" ||
    c.id === "market.llm_replaceable.has_edge" ||
    c.id === "rel.task_model_fit.in_zone" ||
    c.id === "disc.keyword_coverage"
  ) {
    return { evidenceSource: "llm_judgment", confidencePolicy: "medium" };
  }

  // 其余 LLM 项主要是在读文档：是否写了校验、失败路径、边界、权限、隐私等。
  return { evidenceSource: "doc_check", confidencePolicy: "high" };
}

function normalizeDimensionWeights(
  rubric: Rubric,
  overrides?: GeneralWeightOverrides,
  skillType?: SkillType,
): Record<string, number> {
  const scaled: Record<string, number> = {};
  const rawPillarWeights = rubric.pillars.map((p) => Math.max(0, overrides?.pillars?.[p.id] ?? p.weight));
  const pillarWeightSum = rawPillarWeights.reduce((s, v) => s + v, 0) || 1;

  // applies_to renormalization: a dim whose checks are *all* filtered out for
  // this skill_type contributes 0 to the pillar denominator, so the
  // remaining dims auto-scale to fill the full pillar budget instead of
  // silently leaking points.
  const dimAllFiltered = (d: { checks: CheckDef[] }): boolean =>
    skillType !== undefined && d.checks.every((c) => c.applies_to && !c.applies_to.includes(skillType));

  for (const p of rubric.pillars) {
    const rawPillarWeight = Math.max(0, overrides?.pillars?.[p.id] ?? p.weight);
    const scaledPillarWeight = (rawPillarWeight / pillarWeightSum) * rubric.total_score;
    const rawDimensionWeights = p.dimensions.map((d) =>
      dimAllFiltered(d) ? 0 : Math.max(0, overrides?.dimensions?.[d.id] ?? d.weight),
    );
    const dimensionWeightSum = rawDimensionWeights.reduce((s, v) => s + v, 0) || 1;

    for (const d of p.dimensions) {
      const rawDimensionWeight = dimAllFiltered(d)
        ? 0
        : Math.max(0, overrides?.dimensions?.[d.id] ?? d.weight);
      scaled[d.id] = (rawDimensionWeight / dimensionWeightSum) * scaledPillarWeight;
    }
  }
  return scaled;
}

function checkWeightWithinDimension(
  check: CheckDef,
  checks: CheckDef[],
  scaledDimWeight: number,
): number {
  const total = checks.reduce((s, c) => s + c.weight, 0) || 1;
  return (check.weight / total) * scaledDimWeight;
}

function buildSuggestions(
  pillars: PillarResult[],
  rubric: Rubric,
  lang: "zh" | "en",
  topN: number,
): Suggestion[] {
  // 构建 check.id -> {def, dimensionId, pillarId} 索引
  type DefEntry = { def: CheckDef; dimensionId: string; pillarId: string };
  const defLookup = new Map<string, DefEntry>();
  rubric.pillars.forEach((p) =>
    p.dimensions.forEach((d) =>
      d.checks.forEach((c) => defLookup.set(c.id, { def: c, dimensionId: d.id, pillarId: p.id })),
    ),
  );
  rubric.bonus.forEach((b) =>
    b.checks.forEach((c) => defLookup.set(c.id, { def: c, dimensionId: b.id, pillarId: "bonus" })),
  );

  const failed = pillars
    .flatMap((p) =>
      p.dimensions.flatMap((d) =>
        d.checks.map((c) => ({ res: c, dimId: d.id, pillarId: p.id })),
      ),
    )
    .filter((x) => x.res.status === "fail" || x.res.status === "partial")
    .sort((a, b) => {
      const impact = (x: typeof a) => (x.res.status === "fail" ? 1 : 0.5) * x.res.weight;
      return impact(b) - impact(a);
    });

  return failed.slice(0, topN).map(({ res, dimId, pillarId }) => {
    const entry = defLookup.get(res.id);
    const title = entry ? (lang === "zh" ? entry.def.desc_zh : entry.def.desc_en) : res.id;
    const fallbackFix = entry ? pickLang(entry.def, "fix", lang) : undefined;
    const fallbackExample = entry ? pickLang(entry.def, "example", lang) : undefined;
    return {
      checkId: res.id,
      dimensionId: entry?.dimensionId ?? dimId,
      pillarId: entry?.pillarId ?? pillarId,
      severity: res.status === "fail" ? "high" : "medium",
      title,
      why: res.evidence || (lang === "zh" ? "机器未给出具体原因" : "no machine reason"),
      how: res.fix || fallbackFix || (lang === "zh" ? "请根据维度说明调整" : "refer to dimension tagline"),
      example: res.example || fallbackExample,
      weight: res.weight,
    } satisfies Suggestion;
  });
}

function sumBonusMax(rubric: Rubric): number {
  return rubric.bonus.reduce((s, b) => s + b.max, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
