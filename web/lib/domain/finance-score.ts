import type { CheckResult } from "@/lib/rubric/types";
import { FINANCE_DOMAIN_VERSION, getFinancePillarsForScenario, getFinanceScenario } from "./finance";

export interface FinanceExpertReport {
  domain: "finance";
  schemaVersion: string;
  scenario: string;
  scenarioNameZh: string;
  scenarioNameEn: string;
  score: number;
  grade: "Expert-Ready" | "Strong" | "Promising" | "Needs Review" | "High Risk";
  riskLevel: "low" | "medium" | "high" | "critical";
  commercialReadiness: "paid-ready" | "pilot-ready" | "internal-preview" | "not-ready";
  llmComplete: boolean;
  llmCoverage: { evaluated: number; total: number };
  pillars: Array<{
    id: string;
    name_zh: string;
    name_en: string;
    weight: number;
    score: number;
    checks: CheckResult[];
  }>;
}

export interface FinanceWeightOverrides {
  pillars?: Record<string, number>;
  checks?: Record<string, number>;
}

export function buildFinanceExpertReport(
  results: Map<string, CheckResult> | null,
  scenarioId: string,
  weightOverrides: FinanceWeightOverrides = {},
): FinanceExpertReport {
  const scenario = getFinanceScenario(scenarioId);
  const scenarioPillars = getFinancePillarsForScenario(scenario.id);
  let total = 0;
  let evaluated = 0;
  let totalChecks = 0;
  const rawPillarWeights = scenarioPillars.map((pillar) => weightOverrides.pillars?.[pillar.id] ?? pillar.weight);
  const pillarWeightSum = rawPillarWeights.reduce((sum, weight) => sum + weight, 0) || 1;

  const pillars = scenarioPillars.map((pillar, pillarIndex) => {
    const pillarWeight = (rawPillarWeights[pillarIndex] / pillarWeightSum) * 100;
    const rawCheckWeights = pillar.checks.map((check) => Math.max(0, weightOverrides.checks?.[check.id] ?? check.weight));
    const checkWeightSum = rawCheckWeights.reduce((sum, weight) => sum + weight, 0) || 1;
    let score = 0;
    const checks = pillar.checks.map((check) => {
      totalChecks += 1;
      const rawCheckWeight = Math.max(0, weightOverrides.checks?.[check.id] ?? check.weight);
      const effectiveCheckWeight = (rawCheckWeight / checkWeightSum) * pillarWeight;
      const result = results?.get(check.id);
      if (result?.ratio != null) {
        evaluated += 1;
        score += result.ratio * effectiveCheckWeight;
        return { ...result, weight: round(effectiveCheckWeight) };
      }
      return {
        id: check.id,
        type: "llm" as const,
        weight: round(effectiveCheckWeight),
        status: "n_a" as const,
        evidence: "LLM check skipped",
        ratio: null,
      };
    });
    total += score;
    return {
      id: pillar.id,
      name_zh: pillar.name_zh,
      name_en: pillar.name_en,
      weight: round(pillarWeight),
      score: round(score),
      checks,
    };
  });

  const riskPillar = pillars.find((p) => p.id === "finance.risk_compliance");
  const riskRatio = riskPillar?.weight ? riskPillar.score / riskPillar.weight : 0;

  return {
    domain: "finance",
    schemaVersion: FINANCE_DOMAIN_VERSION,
    scenario: scenario.id,
    scenarioNameZh: scenario.name_zh,
    scenarioNameEn: scenario.name_en,
    score: round(total),
    grade: financeGrade(total),
    riskLevel: financeRiskLevel(total, riskRatio),
    commercialReadiness: commercialReadiness(total),
    llmComplete: evaluated === totalChecks,
    llmCoverage: { evaluated, total: totalChecks },
    pillars,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function financeGrade(score: number): FinanceExpertReport["grade"] {
  if (score >= 90) return "Expert-Ready";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Promising";
  if (score >= 50) return "Needs Review";
  return "High Risk";
}

function financeRiskLevel(score: number, riskRatio: number): FinanceExpertReport["riskLevel"] {
  if (riskRatio < 0.4 || score < 50) return "critical";
  if (riskRatio < 0.65 || score < 65) return "high";
  if (riskRatio < 0.8 || score < 80) return "medium";
  return "low";
}

function commercialReadiness(score: number): FinanceExpertReport["commercialReadiness"] {
  if (score >= 85) return "paid-ready";
  if (score >= 70) return "pilot-ready";
  if (score >= 55) return "internal-preview";
  return "not-ready";
}
