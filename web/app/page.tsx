"use client";
import { useEffect, useMemo, useState } from "react";
import Uploader, { type SkillTypeChoice, type SampleEntry } from "@/components/Uploader";
import ScoreRadar from "@/components/ScoreRadar";
import PillarSection from "@/components/PillarSection";
import SuggestionCard from "@/components/SuggestionCard";
import MarketSurveyCard from "@/components/MarketSurveyCard";
import SubSkillsCard from "@/components/SubSkillsCard";
import { RUBRIC } from "@/lib/rubric/rubric";
import { parseSkill } from "@/lib/spec/parser";
import { aggregateScore, type GeneralWeightOverrides } from "@/lib/scoring/aggregate";
import { runLlmReview } from "@/lib/scoring/llm-client";
import { fetchMarketSurvey } from "@/lib/market/client";
import { isMarketSurvey } from "@/lib/market/types";
import { MESSAGES, type Lang } from "@/lib/i18n/messages";
import type { CheckResult, PillarResult, ScoreReport, ValueType } from "@/lib/rubric/types";
import type { LlmReviewResponse } from "@/lib/llm/types";
import type { MarketSurveyResult } from "@/lib/market/types";
import type { LoadedSkill } from "@/lib/spec/loader";
import { FINANCE_SCENARIOS, getFinancePillarsForScenario, type FinanceScenarioId } from "@/lib/domain/finance";
import {
  buildFinanceExpertReport,
  type FinanceExpertReport,
  type FinanceWeightOverrides,
} from "@/lib/domain/finance-score";

type LlmErrorReason =
  | "provider_no_balance"
  | "provider_auth"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_network"
  | "rate_limited"
  | "llm_browser_required"
  | "llm_failed"
  | "unknown";

type LlmState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; response: LlmReviewResponse }
  | { status: "error"; message: string; reason: LlmErrorReason; httpStatus?: number };

type ReviewMode = "general" | "finance";

interface DomainReviewOption {
  id: ReviewMode;
  eyebrowZh: string;
  eyebrowEn: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  featuresZh: string[];
  featuresEn: string[];
  statusZh: string;
  statusEn: string;
  tone: "general" | "finance";
}

const DOMAIN_REVIEW_OPTIONS: DomainReviewOption[] = [
  {
    id: "general",
    eyebrowZh: "默认推荐",
    eyebrowEn: "Default",
    titleZh: "通用评测",
    titleEn: "General Review",
    descZh: "适合所有 Agent Skill，先评估选题价值、市场竞争力、运行成本、效果稳定性和书写规范。",
    descEn: "Works for every Agent Skill. Scores value, market, runtime cost, reliability, and documentation.",
    featuresZh: ["全品类可用", "基础总分", "通用改进建议"],
    featuresEn: ["All skills", "General score", "Broad fixes"],
    statusZh: "已支持",
    statusEn: "Available",
    tone: "general",
  },
  {
    id: "finance",
    eyebrowZh: "专业增强",
    eyebrowEn: "Expert overlay",
    titleZh: "金融专家版",
    titleEn: "Finance Expert",
    descZh: "额外评估投资建议边界、数据证据、风控合规、可解释性和商业可用性。",
    descEn: "Adds stricter checks for advice boundaries, evidence, risk controls, explainability, and commercial readiness.",
    featuresZh: ["场景专属 rubric", "专业风险识别", "金融样例联动"],
    featuresEn: ["Scenario rubric", "Risk detection", "Finance samples"],
    statusZh: "已支持",
    statusEn: "Available",
    tone: "finance",
  },
];

const FINANCE_SAMPLE_BY_SCENARIO: Record<FinanceScenarioId, { id: string; nameZh: string; nameEn: string }> = {
  startup_fundraising: {
    id: "startup-fundraising-advisor",
    nameZh: "投融资",
    nameEn: "startup fundraising",
  },
  quant_trading: {
    id: "quant-trading-researcher",
    nameZh: "量化交易",
    nameEn: "quant trading",
  },
  stock_trading: {
    id: "stock-trading-analyst",
    nameZh: "炒股金融",
    nameEn: "stock trading",
  },
  securities_research: {
    id: "securities-research-analyst",
    nameZh: "证券研究",
    nameEn: "securities research",
  },
  banking_workflow: {
    id: "banking-workflow-assistant",
    nameZh: "银行流程",
    nameEn: "banking workflow",
  },
  financial_education: {
    id: "financial-education-coach",
    nameZh: "金融教育",
    nameEn: "financial education",
  },
  financial_data_analysis: {
    id: "financial-data-analysis-agent",
    nameZh: "金融数据分析",
    nameEn: "financial data analysis",
  },
  other: {
    id: "finance-scenario-advisor",
    nameZh: "其他金融场景",
    nameEn: "finance scenario",
  },
};

export default function HomePage() {
  const [loaded, setLoaded] = useState<LoadedSkill | null>(null);
  const [lang, setLang] = useState<Lang>("zh");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [weights, setWeights] = useState<GeneralWeightOverrides>(() => defaultGeneralWeights());
  /** 用户主动点"启动完整评测"才会变 true（v3 分两层流程） */
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmResults, setLlmResults] = useState<Map<string, CheckResult> | null>(null);
  const [llmMeta, setLlmMeta] = useState<{ valueType?: ValueType; reason?: string } | null>(null);
  const [llmState, setLlmState] = useState<LlmState>({ status: "idle" });
  const [retryNonce, setRetryNonce] = useState(0);
  const [marketSurvey, setMarketSurvey] = useState<MarketSurveyResult | null>(null);
  const [reviewMode, setReviewMode] = useState<ReviewMode>("general");
  const [financeScenario, setFinanceScenario] = useState<FinanceScenarioId>("stock_trading");
  const [financeWeights, setFinanceWeights] = useState<FinanceWeightOverrides>({});
  const [activeReportTab, setActiveReportTab] = useState<"finance" | "general">("finance");
  const [skillTypeChoice, setSkillTypeChoice] = useState<SkillTypeChoice>("auto");

  const skill = useMemo(() => {
    if (!loaded) return null;
    return parseSkill({
      rawText: loaded.rawText,
      files: loaded.files,
      entryFile: loaded.entryFile,
    });
  }, [loaded]);

  // 切换 skill 时重置所有 LLM / market 状态
  useEffect(() => {
    setLlmResults(null);
    setLlmMeta(null);
    setLlmState({ status: "idle" });
    setLlmEnabled(false);
    setMarketSurvey(null);
  }, [loaded]);

  useEffect(() => {
    if (!llmEnabled) {
      setLlmResults(null);
      setLlmMeta(null);
      setLlmState({ status: "idle" });
      setMarketSurvey(null);
    }
  }, [llmEnabled]);

  useEffect(() => {
    setFinanceWeights({});
  }, [financeScenario]);

  useEffect(() => {
    if (!skill || !llmEnabled) return;
    let cancelled = false;
    const ctl = new AbortController();
    setLlmState({ status: "running" });
    setMarketSurvey(null);
    (async () => {
      try {
        // 1) 先做 GitHub 市场调研（失败不阻塞，软降级为 null）
        const survey = await fetchMarketSurvey(
          {
            name: typeof skill.meta.name === "string" ? skill.meta.name : undefined,
            description: typeof skill.meta.description === "string" ? skill.meta.description : undefined,
            tags: Array.isArray(skill.meta.tags) ? (skill.meta.tags as string[]) : undefined,
            body: skill.body,
          },
          { signal: ctl.signal },
        ).catch((e) => {
          if ((e as Error).name === "AbortError") throw e;
          return { error: "network" as const, detail: (e as Error).message };
        });
        if (cancelled) return;
        setMarketSurvey(survey);

        // 2) 再调 LLM，把 survey（成功时）塞进去
        const surveyForLlm = isMarketSurvey(survey) && survey.repos.length > 0 ? survey : undefined;
        const { response, results } = await runLlmReview(skill, RUBRIC, {
          signal: ctl.signal,
          marketSurvey: surveyForLlm,
          lang,
          expertReview: reviewMode === "finance"
            ? { domain: "finance", scenario: financeScenario }
            : undefined,
          skillType: skillTypeChoice,
        });
        if (cancelled) return;
        setLlmResults(results);
        setLlmMeta({
          valueType: response.meta?.value_type,
          reason: response.meta?.value_type_reason,
        });
        setLlmState({ status: "ok", response });
      } catch (e) {
        if (cancelled) return;
        if ((e as Error).name === "AbortError") return;
        const msg = (e as Error).message || "unknown";
        const m = msg.match(/^(\d+)::([a-z_]+)::(.*)$/s);
        const httpStatus = m ? Number(m[1]) : undefined;
        const reason = (m?.[2] as LlmErrorReason | undefined) ??
          (httpStatus === 429 ? "rate_limited" : "unknown");
        const detail = m?.[3] ?? msg;
        setLlmState({ status: "error", message: detail, reason, httpStatus });
      }
    })();
    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [skill, llmEnabled, retryNonce, lang, reviewMode, financeScenario, skillTypeChoice]);

  const report: ScoreReport | null = useMemo(() => {
    if (!skill) return null;
    const base = aggregateScore(skill, RUBRIC, {
      weightOverrides: weights,
      llmResults: llmResults ?? undefined,
      language: lang,
      skillType: skillTypeChoice,
    });
    return {
      ...base,
      valueType: llmMeta?.valueType,
      valueTypeReason: llmMeta?.reason,
    };
  }, [skill, weights, llmResults, llmMeta, lang, skillTypeChoice]);

  const t = MESSAGES[lang];
  const llmIdle = llmState.status === "idle" || llmState.status === "error";
  const showFullEvalCta = report && !report.llmComplete && llmState.status !== "running";
  const financeSample = FINANCE_SAMPLE_BY_SCENARIO[financeScenario];
  const sampleId = reviewMode === "finance" ? financeSample.id : "pr-reviewer";
  const sampleLabel = reviewMode === "finance"
    ? (lang === "zh" ? `载入${financeSample.nameZh}示例` : `Load ${financeSample.nameEn} sample`)
    : undefined;
  // Showcase samples for the general (non-finance) flow. pr-pipeline yields the
  // inline sub-skills layout (≤ 12 children); mega-pipeline yields the wide
  // banner layout (53 children) — together they let visitors preview both
  // without running their own SKILL.md upload.
  const generalSamples: SampleEntry[] = useMemo(
    () => [
      {
        id: "pr-pipeline",
        label: lang === "zh" ? "示例：PR Pipeline (3 子 skill)" : "Sample: PR Pipeline (3 sub-skills)",
        hint:
          lang === "zh"
            ? "三个子 SKILL.md，演示 inline 紧凑布局。"
            : "Three child SKILL.md, demonstrates the inline density layout.",
        skillType: "pipeline",
      },
      {
        id: "mega-pipeline",
        label: lang === "zh" ? "示例：Mega Pipeline (53 子 skill)" : "Sample: Mega Pipeline (53 sub-skills)",
        hint:
          lang === "zh"
            ? "53 个子 SKILL.md，演示下方全宽 4 列网格。"
            : "53 child SKILL.md, demonstrates the full-width 4-column overflow grid.",
        skillType: "pipeline",
      },
    ],
    [lang],
  );
  const financeExpertReport = useMemo<FinanceExpertReport | null>(() => {
    if (reviewMode !== "finance" || !llmResults) return null;
    return buildFinanceExpertReport(llmResults, financeScenario, financeWeights);
  }, [reviewMode, llmResults, financeScenario, financeWeights]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-10 md:py-14 space-y-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs text-brand-700 bg-brand-100/80 ring-1 ring-brand-200 rounded-full px-3 py-1">
            claude · openclaw
          </div>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-brand-900">
            {t.appName}
          </h1>
          <p className="mt-2 text-stone-600 max-w-2xl">{t.tagline}</p>
        </div>
        <button
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="glass rounded-full px-3 py-1.5 text-sm text-brand-700 hover:bg-white"
        >
          {t.langToggle}
        </button>
      </header>

      {!report && (
        <div className="space-y-5">
          <ExpertModeSelector
            lang={lang}
            reviewMode={reviewMode}
            financeScenario={financeScenario}
            onReviewModeChange={setReviewMode}
            onFinanceScenarioChange={setFinanceScenario}
          />
          <Uploader
            lang={lang}
            onLoad={setLoaded}
            sampleId={sampleId}
            sampleLabel={sampleLabel}
            samples={reviewMode === "finance" ? undefined : generalSamples}
            skillTypeChoice={skillTypeChoice}
            onSkillTypeChange={setSkillTypeChoice}
          />
        </div>
      )}

      {report && skill && (
        <div className="space-y-8">
          {/* ===== Dashboard header: 通用模式只展示通用；垂类模式展示通用基线 + 当前垂类 ===== */}
          <section className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-stretch">
            <div className={reviewMode === "finance"
              ? "xl:col-span-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4"
              : "xl:col-span-2 grid grid-cols-1 gap-4"}
            >
              <ScoreKpiCard
                label={lang === "zh" ? "通用版评分" : "General Score"}
                score={report.total}
                grade={report.grade}
                subtitle={RUBRIC.grades.find((g) => g.grade === report.grade)?.[lang === "zh" ? "label_zh" : "label_en"] ?? ""}
                tone="general"
                badge={!report.llmComplete ? (lang === "zh" ? "规则分初步" : "rule-only") : undefined}
              />
              {reviewMode === "finance" && (
                <ScoreKpiCard
                  label={lang === "zh" ? "金融专家版评分" : "Finance Expert Score"}
                  score={financeExpertReport?.score}
                  grade={financeExpertReport?.grade ?? (lang === "zh" ? "待评测" : "Pending")}
                  subtitle={financeExpertReport
                    ? `${lang === "zh" ? financeExpertReport.scenarioNameZh : financeExpertReport.scenarioNameEn} · ${lang === "zh" ? "风险" : "Risk"}: ${financeExpertReport.riskLevel}`
                    : (lang === "zh" ? "启动完整评测后生成专业分" : "Run Deep Review to generate expert score")}
                  tone="finance"
                  badge={financeExpertReport?.commercialReadiness}
                />
              )}
              <div className="glass rounded-2xl p-4 text-xs text-slate-500 space-y-2 md:col-span-2 xl:col-span-1">
                <dl className="grid grid-cols-2 gap-y-2">
                  <dt>{t.spec}</dt>
                  <dd className="font-mono text-slate-700">{formatSpec(report.spec, lang)}</dd>
                  <dt>{t.generatedAt}</dt>
                  <dd className="font-mono text-[11px] text-slate-700">{new Date(report.generatedAt).toLocaleString()}</dd>
                  {llmState.status === "ok" && (
                    <>
                      <dt>{t.llmProvider}</dt>
                      <dd className="font-mono text-slate-700">
                        {llmState.response.provider}
                        {llmState.response.cached && <span className="ml-1 text-emerald-600">({t.llmCached})</span>}
                      </dd>
                    </>
                  )}
                  {report.skillType && (
                    <>
                      <dt>{lang === "zh" ? "skill 类型" : "Skill type"}</dt>
                      <dd className="font-mono text-[11px] text-slate-700">
                        {formatSkillType(report.skillType, lang)}
                        <span className="ml-1 text-slate-400">
                          {report.skillTypeAutoDetected
                            ? lang === "zh" ? "(自动识别)" : "(auto-detected)"
                            : lang === "zh" ? "(用户指定)" : "(user-specified)"}
                        </span>
                      </dd>
                    </>
                  )}
                </dl>
                {report.valueType && (
                  <div className="rounded-xl bg-brand-50 ring-1 ring-brand-100 px-3 py-2">
                    <span className="text-brand-600">{t.valueTypeLabel}</span>
                    <span className="ml-1 font-semibold text-brand-900">{t.valueTypeNames[report.valueType] ?? report.valueType}</span>
                  </div>
                )}
                {report.subSkills && report.subSkills.length > 0 && report.subSkills.length <= 12 && (
                  <SubSkillsCard subSkills={report.subSkills} lang={lang} variant="inline" />
                )}
                <button
                  onClick={() => { setLoaded(null); }}
                  className="text-xs text-brand-600 hover:underline"
                >
                  ← {lang === "zh" ? "重新上传" : "Upload another"}
                </button>
              </div>
            </div>

            <div className={reviewMode === "finance" ? "xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4" : "xl:col-span-3 grid grid-cols-1 gap-4"}>
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-semibold text-brand-900">{lang === "zh" ? "通用版雷达" : "General Radar"}</h3>
                  <span className="text-xs text-slate-400">{report.pillars.length} pillars</span>
                </div>
                <ScoreRadar pillars={report.pillars} lang={lang} />
              </div>
              {reviewMode === "finance" && (
                <div className="glass rounded-2xl p-4 ring-amber-200/80">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-semibold text-amber-800">{lang === "zh" ? "金融专家雷达" : "Finance Radar"}</h3>
                    <span className="text-xs text-slate-400">{financeExpertReport ? `${financeExpertReport.llmCoverage.evaluated}/${financeExpertReport.llmCoverage.total}` : "pending"}</span>
                  </div>
                  {financeExpertReport ? (
                    <ScoreRadar pillars={financeRadarPillars(financeExpertReport)} lang={lang} />
                  ) : (
                    <div className="h-72 flex items-center justify-center text-sm text-slate-400">
                      {lang === "zh" ? "启动金融专家版完整评测后显示" : "Run Finance Expert Deep Review to display"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ===== Sub-skills overflow (>12) — full width to reclaim the empty space under the radar ===== */}
          {report.subSkills && report.subSkills.length > 12 && (
            <SubSkillsCard subSkills={report.subSkills} lang={lang} variant="wide" />
          )}

          {/* ===== 启动完整评测 / LLM 状态 ===== */}
          {showFullEvalCta && (
            <section className="rounded-2xl ring-1 ring-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 space-y-3 shadow-[0_18px_44px_rgba(146,91,16,0.08)]">
              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-brand-700">{t.startFullEval}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t.ruleScoreOnly}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{t.fullEvalNote}</p>
                </div>
                <button
                  onClick={() => setLlmEnabled(true)}
                  className="rounded-xl bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 text-sm font-medium shrink-0"
                >
                  {t.startFullEval}
                </button>
              </div>
              {t.webSearchDisclaimer && (
                <p className="text-[11px] text-slate-500 italic leading-snug border-t border-brand-100 pt-2">
                  {t.webSearchDisclaimer}
                </p>
              )}
            </section>
          )}

          {llmState.status === "running" && (
            <section className="rounded-2xl ring-1 ring-brand-200 bg-brand-50/70 p-4">
              <div className="text-sm text-brand-700 inline-flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                {t.llmRunning}
              </div>
            </section>
          )}

          {llmState.status === "ok" && (
            <section className="rounded-2xl ring-1 ring-emerald-200 bg-emerald-50/40 p-4 text-sm">
              <span className="text-emerald-700 font-medium">{t.llmDone}</span>
              {llmState.response.provider === "mock" && (
                <span className="ml-3 text-amber-700">{t.llmMockBanner}</span>
              )}
            </section>
          )}

          {llmState.status === "error" && (
            <section className="rounded-2xl ring-1 ring-rose-200 bg-rose-50/40 p-4 text-sm space-y-2">
              <div className="text-rose-700 font-medium">{t.llmErrorTitle[llmState.reason] ?? t.llmFailed}</div>
              <div className="text-xs text-rose-500">{t.llmErrorHint[llmState.reason] ?? ""}</div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="text-[12px] rounded-md bg-rose-500 hover:bg-rose-600 text-white px-3 py-1"
                >
                  {t.llmRetry}
                </button>
                <details>
                  <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
                    {t.llmErrorDetail}
                  </summary>
                  <pre className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap break-all">
                    {llmState.message.slice(0, 300)}
                  </pre>
                </details>
              </div>
            </section>
          )}

          {/* ===== Tabbed report body ===== */}
          <section className="space-y-5">
            {reviewMode === "finance" && financeExpertReport && (
              <div className="glass rounded-2xl p-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveReportTab("finance")}
                  className={tabClass(activeReportTab === "finance", "finance")}
                >
                  {lang === "zh" ? "金融专家版" : "Finance Expert"}
                </button>
                <button
                  onClick={() => setActiveReportTab("general")}
                  className={tabClass(activeReportTab === "general", "general")}
                >
                  {lang === "zh" ? "通用版" : "General"}
                </button>
              </div>
            )}

            {reviewMode === "finance" && financeExpertReport && activeReportTab === "finance" ? (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2">
                  <FinanceExpertPanel
                    report={financeExpertReport}
                    lang={lang}
                    scenario={financeScenario}
                    weights={financeWeights}
                    onWeightsChange={setFinanceWeights}
                  />
                </div>
                <aside className="space-y-6 lg:sticky lg:top-6">
                  <FinanceTopAdvice report={financeExpertReport} lang={lang} />
                  <ExportActions
                    report={report}
                    financeExpertReport={financeExpertReport}
                    lang={lang}
                    filename={loaded?.rootName || "report"}
                    pdfBusy={pdfBusy}
                    setPdfBusy={setPdfBusy}
                  />
                </aside>
              </section>
            ) : (
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                  {report.pillars.map((p) => (
                    <PillarSection
                      key={p.id}
                      pillar={p}
                      lang={lang}
                      llmIdle={llmIdle}
                      weights={weights}
                      onWeightsChange={setWeights}
                      onResetWeights={() => setWeights(defaultGeneralWeights())}
                      extra={
                        p.id === "market" && (llmState.status === "running" || marketSurvey)
                          ? (
                            <MarketSurveyCard
                              lang={lang}
                              result={marketSurvey}
                              loading={llmState.status === "running" && !marketSurvey}
                            />
                          )
                          : undefined
                      }
                    />
                  ))}
                </div>
                <aside className="space-y-6 lg:sticky lg:top-6">
                  <GeneralSuggestions report={report} lang={lang} />
                  <ExportActions
                    report={report}
                    financeExpertReport={financeExpertReport}
                    lang={lang}
                    filename={loaded?.rootName || "report"}
                    pdfBusy={pdfBusy}
                    setPdfBusy={setPdfBusy}
                  />
                </aside>
              </section>
            )}
          </section>
        </div>
      )}

      <footer className="pt-10 border-t border-brand-100 text-xs text-stone-400">
        SkillLens · M3 · rubric v{RUBRIC.schema_version} · 5 pillars × {countDimensions()} dimensions
      </footer>
    </main>
  );
}

function ScoreKpiCard({
  label,
  score,
  grade,
  subtitle,
  tone,
  badge,
}: {
  label: string;
  score?: number;
  grade: string;
  subtitle: string;
  tone: "general" | "finance";
  badge?: string;
}) {
  const isFinance = tone === "finance";
  return (
    <article className={[
      "rounded-2xl p-5 ring-1 shadow-[0_18px_44px_rgba(146,91,16,0.08)]",
      isFinance
        ? "bg-gradient-to-br from-amber-50 to-white ring-amber-200"
        : "bg-gradient-to-br from-brand-50 to-white ring-brand-200",
    ].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={["text-xs font-semibold uppercase tracking-wide", isFinance ? "text-amber-700" : "text-brand-700"].join(" ")}>
            {label}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-5xl font-bold tabular-nums text-brand-950">
              {score === undefined ? "--" : score.toFixed(1)}
            </div>
            <div className="text-slate-400 text-lg">/ 100</div>
          </div>
        </div>
        <span className={[
          "rounded-xl px-3 py-1 text-xs font-semibold ring-1",
          isFinance ? "bg-white text-amber-700 ring-amber-200" : "bg-white text-brand-700 ring-brand-200",
        ].join(" ")}>
          {grade}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{subtitle}</p>
      {badge && (
        <span className={[
          "mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] ring-1",
          isFinance ? "bg-amber-100/70 text-amber-700 ring-amber-200" : "bg-brand-100/70 text-brand-700 ring-brand-200",
        ].join(" ")}>
          {badge}
        </span>
      )}
    </article>
  );
}

function tabClass(active: boolean, tone: "finance" | "general"): string {
  if (active) {
    return [
      "cursor-pointer rounded-xl px-4 py-2 text-sm font-medium ring-1 transition",
      tone === "finance"
        ? "bg-amber-500 text-white ring-amber-500 shadow-sm"
        : "bg-brand-500 text-white ring-brand-500 shadow-sm",
    ].join(" ");
  }
  return "cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white/80 ring-1 ring-transparent transition";
}

function financeRadarPillars(report: FinanceExpertReport): PillarResult[] {
  return report.pillars.map((pillar) => ({
    id: pillar.id,
    name_zh: pillar.name_zh,
    name_en: pillar.name_en,
    weight: pillar.weight,
    score: pillar.score,
    evaluated: report.llmComplete,
    llmCoverage: {
      evaluated: pillar.checks.filter((check) => check.ratio !== null).length,
      total: pillar.checks.length,
    },
    dimensions: [],
  }));
}

function GeneralSuggestions({ report, lang }: { report: ScoreReport; lang: Lang }) {
  const t = MESSAGES[lang];
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{t.suggestions}</h3>
        <span className="rounded-full bg-brand-50 ring-1 ring-brand-100 px-2 py-0.5 text-[11px] text-brand-700">
          Top {Math.min(report.suggestions.length, 6)}
        </span>
      </div>
      {report.suggestions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t.suggestionsEmpty}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">{t.suggestionsIntro}</p>
          <div className="mt-3 space-y-3">
            {report.suggestions.map((s, i) => (
              <SuggestionCard key={s.checkId} suggestion={s} index={i} lang={lang} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FinanceTopAdvice({ report, lang }: { report: FinanceExpertReport; lang: Lang }) {
  const items = financeAdviceItems(report, lang);
  return (
    <div className="rounded-2xl p-5 ring-1 ring-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-[0_18px_44px_rgba(146,91,16,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-brand-900">
          {lang === "zh" ? "金融 Top 建议" : "Finance Top Advice"}
        </h3>
        <span className="rounded-full bg-white ring-1 ring-amber-200 px-2 py-0.5 text-[11px] text-amber-700">
          Top {items.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500 leading-relaxed">
        {lang === "zh"
          ? "优先展示金融专家版里最影响专业分、商业化和风控可信度的问题。"
          : "Prioritized by impact on expert score, commercialization, and risk credibility."}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white/80 ring-1 ring-amber-100 p-3 text-sm text-slate-500">
          {lang === "zh" ? "暂无明显短板，建议继续补充真实案例和数据证据。" : "No major gaps. Continue adding real cases and evidence."}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item, index) => (
            <article key={item.check.id} className="rounded-xl bg-white/85 ring-1 ring-amber-100 p-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-amber-700">
                    {lang === "zh" ? "建议 / 改法" : "Recommendation"}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-brand-900 leading-snug">
                    {item.check.fix || item.title}
                  </div>
                  <div className="mt-2 rounded-lg bg-amber-50/70 ring-1 ring-amber-100 px-2.5 py-2 text-xs leading-relaxed">
                    <div className="text-slate-400 font-medium">
                      {lang === "zh" ? "对应维度 / 内容" : "Pillar / check"}
                    </div>
                    <div className="mt-0.5 text-slate-600">
                      {item.pillarName} · {item.title}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                    <span className="text-slate-400 mr-1">{lang === "zh" ? "现状" : "Evidence"}:</span>
                    {item.check.evidence}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 font-mono">
                    {item.check.id} · effective w={item.check.weight.toFixed(1)}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function financeAdviceItems(report: FinanceExpertReport, lang: Lang): Array<{
  pillarName: string;
  title: string;
  check: CheckResult;
}> {
  const defMap = new Map(getFinancePillarsForScenario(report.scenario).flatMap((p) => p.checks.map((c) => [c.id, c])));
  const candidates = report.pillars.flatMap((pillar) =>
    pillar.checks
      .filter((check) => check.status === "fail" || check.status === "partial" || (check.ratio ?? 1) < 0.85)
      .map((check) => ({
        pillarName: lang === "zh" ? pillar.name_zh : pillar.name_en,
        title: (lang === "zh" ? defMap.get(check.id)?.desc_zh : defMap.get(check.id)?.desc_en) ?? check.id,
        check,
      })),
  );
  return candidates
    .sort((a, b) => {
      const ar = a.check.ratio ?? 0;
      const br = b.check.ratio ?? 0;
      return (b.check.weight * (1 - br)) - (a.check.weight * (1 - ar));
    })
    .slice(0, 5);
}

function ExportActions({
  report,
  financeExpertReport,
  lang,
  filename,
  pdfBusy,
  setPdfBusy,
}: {
  report: ScoreReport;
  financeExpertReport?: FinanceExpertReport | null;
  lang: Lang;
  filename: string;
  pdfBusy: boolean;
  setPdfBusy: (busy: boolean) => void;
}) {
  const t = MESSAGES[lang];
  return (
    <div className="glass rounded-2xl p-5 space-y-2">
      <button
        onClick={async () => {
          setPdfBusy(true);
          try {
            await exportPdf(report, lang, filename);
          } finally {
            setPdfBusy(false);
          }
        }}
        disabled={pdfBusy}
        className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-wait text-white px-3 py-2 text-sm"
      >
        {pdfBusy ? (lang === "zh" ? "正在生成 PDF…" : "Generating PDF…") : t.exportPdf}
      </button>
      <button
        onClick={() => exportJson(report, filename, financeExpertReport)}
        className="w-full rounded-lg border border-brand-200 hover:bg-brand-50 px-3 py-2 text-sm text-brand-700"
      >
        {t.exportJson}
      </button>
      <button
        onClick={() => copyMarkdown(report, lang, financeExpertReport)}
        className="w-full rounded-lg border border-brand-200 hover:bg-brand-50 px-3 py-2 text-sm text-brand-700"
      >
        {t.copyReport}
      </button>
    </div>
  );
}

function ExpertModeSelector(props: {
  lang: Lang;
  reviewMode: ReviewMode;
  financeScenario: FinanceScenarioId;
  onReviewModeChange: (mode: ReviewMode) => void;
  onFinanceScenarioChange: (scenario: FinanceScenarioId) => void;
}) {
  const { lang, reviewMode, financeScenario, onReviewModeChange, onFinanceScenarioChange } = props;
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const selectedScenario = FINANCE_SCENARIOS.find((scenario) => scenario.id === financeScenario) ?? FINANCE_SCENARIOS[0];

  return (
    <section className="glass relative z-30 rounded-2xl p-5 ring-1 ring-brand-100">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-brand-900">
            {lang === "zh" ? "选择评测模式" : "Choose Review Mode"}
            </h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
              {lang === "zh" ? "更多专业领域即将接入" : "More expert domains coming"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {lang === "zh"
              ? "先选择通用基线或专业领域。专业领域会替换为当前垂类，不会把所有垂类都铺出来。"
              : "Choose a general baseline or one expert domain. The selected domain owns the expert overlay area."}
          </p>
        </div>
        <div className="rounded-full bg-white/65 px-3 py-1 text-xs text-slate-500 ring-1 ring-brand-100">
          {reviewMode === "finance"
            ? (lang === "zh" ? "当前：金融专家版" : "Current: Finance Expert")
            : (lang === "zh" ? "当前：通用评测" : "Current: General")}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {DOMAIN_REVIEW_OPTIONS.map((option) => {
          const active = reviewMode === option.id;
          const isFinance = option.id === "finance";
          const activeTone = option.tone === "finance"
            ? "ring-amber-300 bg-gradient-to-br from-amber-50 to-white shadow-[0_18px_44px_rgba(146,91,16,0.12)]"
            : "ring-brand-300 bg-gradient-to-br from-brand-50 to-white shadow-[0_18px_44px_rgba(146,91,16,0.10)]";
          const idleTone = "ring-brand-100 bg-white/65 hover:bg-white hover:ring-brand-200";
          return (
            <article
              key={option.id}
              className={[
                "relative rounded-2xl p-4 ring-1 transition",
                active ? activeTone : idleTone,
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => {
                  setScenarioMenuOpen(false);
                  onReviewModeChange(option.id);
                }}
                className="w-full cursor-pointer text-left focus:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={[
                      "text-[11px] font-semibold uppercase tracking-wide",
                      option.tone === "finance" ? "text-amber-700" : "text-brand-700",
                    ].join(" ")}
                    >
                      {lang === "zh" ? option.eyebrowZh : option.eyebrowEn}
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-brand-900">
                      {lang === "zh" ? option.titleZh : option.titleEn}
                    </h3>
                  </div>
                  <span className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                    active
                      ? option.tone === "finance"
                        ? "bg-amber-500 text-white ring-amber-500"
                        : "bg-brand-500 text-white ring-brand-500"
                      : "bg-white/70 text-slate-500 ring-brand-100",
                  ].join(" ")}
                  >
                    {active ? (lang === "zh" ? "已选择" : "Selected") : (lang === "zh" ? option.statusZh : option.statusEn)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {lang === "zh" ? option.descZh : option.descEn}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(lang === "zh" ? option.featuresZh : option.featuresEn).map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full bg-white/75 px-2 py-1 text-[11px] text-slate-600 ring-1 ring-brand-100"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </button>

              {active && isFinance && (
                <div className="mt-4 border-t border-amber-100 pt-4">
                  <label className="text-xs font-medium text-slate-500">
                    {lang === "zh" ? "选择金融子场景" : "Choose finance scenario"}
                  </label>
                  <div
                    className="relative z-40 mt-2"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setScenarioMenuOpen(false);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setScenarioMenuOpen((open) => !open)}
                      className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3 text-left text-sm text-brand-900 ring-1 ring-amber-200 shadow-[0_12px_30px_rgba(146,91,16,0.08)] backdrop-blur transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
                      aria-haspopup="listbox"
                      aria-expanded={scenarioMenuOpen}
                    >
                      <span className="min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-amber-700">
                          {lang === "zh" ? "当前金融场景" : "Selected scenario"}
                        </span>
                        <span className="mt-0.5 block truncate font-semibold">
                          {lang === "zh" ? selectedScenario.name_zh : selectedScenario.name_en}
                        </span>
                      </span>
                      <svg
                        className={`h-4 w-4 shrink-0 text-brand-500 transition-transform ${scenarioMenuOpen ? "rotate-180" : ""}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {scenarioMenuOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white/95 p-1.5 ring-1 ring-brand-200 shadow-[0_22px_60px_rgba(67,45,24,0.18)] backdrop-blur" role="listbox">
                        <div className="max-h-72 overflow-y-auto pr-1">
                          {FINANCE_SCENARIOS.map((scenario) => {
                            const activeScenario = scenario.id === financeScenario;
                            return (
                              <button
                                key={scenario.id}
                                type="button"
                                onClick={() => {
                                  onFinanceScenarioChange(scenario.id);
                                  setScenarioMenuOpen(false);
                                }}
                                className={[
                                  "flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                                  activeScenario
                                    ? "bg-brand-500 text-white shadow-sm"
                                    : "text-brand-900 hover:bg-brand-50",
                                ].join(" ")}
                                role="option"
                                aria-selected={activeScenario}
                              >
                                <span className="font-medium">{lang === "zh" ? scenario.name_zh : scenario.name_en}</span>
                                {activeScenario && (
                                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.32a1 1 0 0 1-1.42.002L3.29 9.236a1 1 0 1 1 1.42-1.408l4.04 4.073 6.54-6.604a1 1 0 0 1 1.414-.006Z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-100 rounded-xl px-3 py-2">
                    {lang === "zh"
                      ? "金融专家分是附加专业报告，不替代通用 SkillLens 总分；涉及投资、交易、授信、客户数据时会更严格。"
                      : "Finance score is an expert overlay, not a replacement for the general SkillLens score. Investment, trading, credit, and customer-data cases are stricter."}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FinanceExpertPanel({
  report,
  lang,
  scenario,
  weights,
  onWeightsChange,
}: {
  report: FinanceExpertReport;
  lang: Lang;
  scenario: FinanceScenarioId;
  weights: FinanceWeightOverrides;
  onWeightsChange: (weights: FinanceWeightOverrides) => void;
}) {
  const [openPillars, setOpenPillars] = useState<Record<string, boolean>>({});
  const riskText = {
    low: lang === "zh" ? "低风险" : "Low",
    medium: lang === "zh" ? "中风险" : "Medium",
    high: lang === "zh" ? "高风险" : "High",
    critical: lang === "zh" ? "极高风险" : "Critical",
  }[report.riskLevel];
  const scenarioPillars = getFinancePillarsForScenario(report.scenario);
  const checkDefs = new Map(scenarioPillars.flatMap((p) => p.checks.map((c) => [c.id, c])));
  const currentPillars = weights.pillars ?? {};
  const currentChecks = weights.checks ?? {};
  const defaults = defaultFinanceWeights(scenario);
  return (
    <section className="rounded-2xl ring-1 ring-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            {lang === "zh" ? "金融专家版" : "Finance Expert"}
          </div>
          <h2 className="mt-1 text-2xl font-bold text-brand-900">
            {report.score.toFixed(1)} / 100
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {lang === "zh" ? report.scenarioNameZh : report.scenarioNameEn} · {report.grade}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white ring-1 ring-amber-200 px-3 py-1 text-amber-700">
            {lang === "zh" ? "风险等级" : "Risk"}: {riskText}
          </span>
          <span className="rounded-full bg-white ring-1 ring-amber-200 px-3 py-1 text-amber-700">
            {lang === "zh" ? "商业成熟度" : "Commercial"}: {report.commercialReadiness}
          </span>
        </div>
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">
        {lang === "zh"
          ? "金融专家版由 LLM 按金融专用 rubric 逐项评估，重点看场景专业性、数据证据、风控合规、可解释性和商业可用性。下面可以展开查看每项评了什么、当前证据、问题和改正建议。"
          : "Finance Expert Review is scored by the LLM against a finance-specific rubric. Expand each pillar to see what was evaluated, evidence, issues, and fixes."}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {report.pillars.map((pillar) => (
          <div key={pillar.id} className="rounded-xl bg-white/80 ring-1 ring-amber-100 p-3">
            <div className="text-sm font-medium text-brand-900">
              {lang === "zh" ? pillar.name_zh : pillar.name_en}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {pillar.score.toFixed(1)}
              <span className="text-xs font-normal text-slate-400"> / {pillar.weight}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {report.pillars.map((pillar) => {
          const open = Boolean(openPillars[pillar.id]);
          const pct = pillar.weight === 0 ? 0 : Math.round((pillar.score / pillar.weight) * 100);
          const pillarDef = scenarioPillars.find((p) => p.id === pillar.id);
          const pillarWeight = currentPillars[pillar.id] ?? pillarDef?.weight ?? pillar.weight;
          return (
            <article key={pillar.id} className="rounded-xl bg-white/80 ring-1 ring-amber-100 p-4">
              <button
                onClick={() => setOpenPillars((old) => ({ ...old, [pillar.id]: !open }))}
                className="w-full text-left flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-brand-900">
                      {lang === "zh" ? pillar.name_zh : pillar.name_en}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">{pillar.id}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {financePillarExplanation(pillar.id, lang)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums text-brand-900">
                    {pillar.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> / {pillar.weight.toFixed(1)}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {pct}% · {open ? (lang === "zh" ? "收起" : "hide") : (lang === "zh" ? "展开细则" : "expand")}
                  </div>
                </div>
              </button>
              <div className="mt-3 h-1.5 rounded-full bg-amber-100 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-200 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 rounded-lg bg-white/70 ring-1 ring-amber-100 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-amber-700">
                    {lang === "zh" ? "支柱权重" : "Pillar weight"}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onWeightsChange(defaults)}
                      className="text-[11px] text-brand-600 hover:underline"
                    >
                      {lang === "zh" ? "恢复默认" : "Reset"}
                    </button>
                    <span className="tabular-nums text-slate-500">
                      {pillarWeight.toFixed(1)} → {pillar.weight.toFixed(1)}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={0.5}
                  value={pillarWeight}
                  onChange={(e) =>
                    onWeightsChange({
                      ...weights,
                      pillars: { ...currentPillars, [pillar.id]: Number(e.target.value) },
                    })
                  }
                  className="mt-1 w-full accent-amber-500"
                />
              </div>
              {open && (
                <ul className="mt-4 space-y-3">
                  {pillar.checks.map((check) => {
                    const cdef = checkDefs.get(check.id);
                    const criterion = cdef ? (lang === "zh" ? cdef.desc_zh : cdef.desc_en) : check.id;
                    const showFix = (check.status === "fail" || check.status === "partial") && Boolean(check.fix);
                    const checkWeight = currentChecks[check.id] ?? cdef?.weight ?? check.weight;
                    return (
                      <li key={check.id} className="rounded-xl ring-1 ring-amber-100 bg-amber-50/40 p-3">
                        <div className="flex items-start gap-3">
                          <span className={["inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 shrink-0", statusClass(check.status)].join(" ")}>
                            {statusName(check.status, lang)}
                          </span>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="text-sm font-medium text-slate-800">{criterion}</div>
                            <div className="text-xs text-slate-500 leading-relaxed">
                              <span className="text-slate-400 mr-1.5">{lang === "zh" ? "评什么" : "Evaluates"}</span>
                              {financeCheckExplanation(check.id, lang)}
                            </div>
                            <div className="text-xs text-slate-500 leading-relaxed">
                              <span className="text-slate-400 mr-1.5">{lang === "zh" ? "现状" : "Evidence"}</span>
                              {check.evidence}
                            </div>
                            {showFix && (
                              <div className="text-xs text-slate-700 leading-relaxed bg-white/80 rounded-md px-2.5 py-1.5 ring-1 ring-amber-100">
                                <span className="text-amber-700 font-medium mr-1.5">{lang === "zh" ? "改法" : "Fix"}</span>
                                {check.fix}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                              <span className="rounded bg-white/70 ring-1 ring-amber-100 px-1.5 py-0.5">
                                {lang === "zh" ? "由 LLM 评估" : "LLM scored"}
                              </span>
                              {check.confidence !== undefined && (
                                <span className="rounded bg-white/70 ring-1 ring-amber-100 px-1.5 py-0.5">
                                  {lang === "zh" ? "置信度" : "Confidence"}: {Math.round(check.confidence * 100)}%
                                </span>
                              )}
                              <span className="font-mono">{check.id} · effective w={check.weight.toFixed(1)}</span>
                            </div>
                            <div className="mt-2 rounded-lg bg-white/70 ring-1 ring-amber-100 px-2.5 py-2">
                              <div className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="font-medium text-amber-700">
                                  {lang === "zh" ? "检查项权重" : "Check weight"}
                                </span>
                                <span className="tabular-nums text-slate-500">
                                  {checkWeight.toFixed(1)} → {check.weight.toFixed(1)}
                                </span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={10}
                                step={0.5}
                                value={checkWeight}
                                onChange={(e) =>
                                  onWeightsChange({
                                    ...weights,
                                    checks: { ...currentChecks, [check.id]: Number(e.target.value) },
                                  })
                                }
                                className="mt-1 w-full accent-amber-500"
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {pillarDef && pillarDef.checks.length !== pillar.checks.length && (
                    <li className="text-xs text-slate-400">
                      {lang === "zh" ? "部分检查项未返回，请重新运行完整评测。" : "Some checks are missing; rerun Deep Review."}
                    </li>
                  )}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function defaultFinanceWeights(scenario?: FinanceScenarioId): FinanceWeightOverrides {
  const pillars = getFinancePillarsForScenario(scenario);
  return {
    pillars: Object.fromEntries(pillars.map((pillar) => [pillar.id, pillar.weight])),
    checks: Object.fromEntries(
      pillars.flatMap((pillar) => pillar.checks.map((check) => [check.id, check.weight])),
    ),
  };
}

function defaultGeneralWeights(): GeneralWeightOverrides {
  return {
    pillars: Object.fromEntries(RUBRIC.pillars.map((pillar) => [pillar.id, pillar.weight])),
    dimensions: Object.fromEntries(
      RUBRIC.pillars.flatMap((pillar) => pillar.dimensions.map((dimension) => [dimension.id, dimension.weight])),
    ),
  };
}

function statusClass(status: CheckResult["status"]): string {
  if (status === "pass") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "partial") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "fail") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-stone-50 text-stone-500 ring-stone-200";
}

function statusName(status: CheckResult["status"], lang: Lang): string {
  if (status === "pass") return lang === "zh" ? "通过" : "Pass";
  if (status === "partial") return lang === "zh" ? "部分" : "Partial";
  if (status === "fail") return lang === "zh" ? "未过" : "Fail";
  return lang === "zh" ? "未评" : "N/A";
}

function financePillarExplanation(id: string, lang: Lang): string {
  const zh: Record<string, string> = {
    "finance.scenario_fit": "评估 skill 是否真的对准某个金融业务场景，而不是泛泛地做金融问答。",
    "finance.professionalism": "评估金融概念、分析框架、指标口径和判断边界是否专业准确。",
    "finance.data_evidence": "客观评估数据来源、时间戳、口径和证据链是否足以支撑金融结论。",
    "finance.risk_compliance": "主动识别投资建议、交易诱导、隐私数据和高风险操作问题，不只看免责声明。",
    "finance.explainability": "评估输出是否真正便于金融决策复核，而不是只列出解释性标题。",
    "finance.engineering": "评估数据处理、计算、校验、日志和异常路径是否真能工程化落地。",
    "finance.commercial_readiness": "由 LLM 客观判断真实付费潜力和商业化路径，并给出后续模式建议。",
  };
  const en: Record<string, string> = {
    "finance.scenario_fit": "Checks whether the skill targets a concrete finance workflow instead of generic finance Q&A.",
    "finance.professionalism": "Checks accuracy of finance concepts, analysis frameworks, metrics, and judgment boundaries.",
    "finance.data_evidence": "Checks data sources, freshness, measurement conventions, and traceable evidence.",
    "finance.risk_compliance": "Checks advice boundaries, trade inducement, privacy, and high-risk operation controls.",
    "finance.explainability": "Checks whether conclusions, evidence, assumptions, counter-evidence, risks, and confidence are separated.",
    "finance.engineering": "Checks whether data handling, calculation, validation, logs, and failure paths are operationalized.",
    "finance.commercial_readiness": "Objectively judges real paid potential and commercialization paths, then proposes next-step models.",
  };
  return (lang === "zh" ? zh[id] : en[id]) ?? id;
}

function financeCheckExplanation(id: string, lang: Lang): string {
  const zh: Record<string, string> = {
    "finance.scenario_fit.user_and_boundary": "LLM 客观判断目标用户、边界和任务类型是否真实成立，而不只是作者有没有写。",
    "finance.scenario_fit.scenario_specificity": "LLM 判断是否真正匹配所选金融场景的真实流程、输入输出和决策节点。",
    "finance.professionalism.concepts": "LLM 校验金融术语、指标和市场机制是否准确，而不接受自称专业。",
    "finance.professionalism.framework": "LLM 判断分析框架是否完整适配，并指出缺失的专业环节。",
    "finance.professionalism.bias_and_assumptions": "看是否区分事实、假设、相关性和因果，避免确定性预测。",
    "finance.data_evidence.sources": "LLM 判断数据来源、更新时间和字段口径是否足以支撑结论，声明不足会降分。",
    "finance.data_evidence.traceability": "LLM 检查结论能否回溯到具体数据、公告、财报、新闻或用户上传字段。",
    "finance.data_evidence.failure_modes": "LLM 判断缺数据、延迟、限流、口径冲突时是否有可用降级方案。",
    "finance.risk_compliance.advice_boundary": "LLM 主动识别个性化投资建议、收益承诺和交易诱导风险，不只看免责声明。",
    "finance.risk_compliance.risk_disclosure": "LLM 判断市场、流动性、信用、模型、政策和波动风险是否被实质覆盖。",
    "finance.risk_compliance.privacy_and_controls": "看是否处理账户、交易、客户、征信、财报等敏感数据边界。",
    "finance.risk_compliance.human_review": "看高风险判断、交易、审批是否保留人工复核和审计记录。",
    "finance.explainability.structure": "LLM 判断输出结构是否真正便于复核，而不只是把标题列出来。",
    "finance.explainability.sensitivity": "LLM 判断置信度、情景分析、关键变量敏感性或失效条件是否有实际帮助。",
    "finance.engineering.scripted_controls": "LLM 判断关键数据抓取、计算、回测或校验是否具备可落地兜底。",
    "finance.engineering.auditability": "看是否支持结构化输出、日志、版本、审计和异常处理。",
    "finance.commercial_readiness.workflow_value": "LLM 客观判断它是否真的解决高频或高价值金融工作，而不是复述作者设想。",
    "finance.commercial_readiness.paid_potential": "LLM 判断真实付费潜力；如果有潜力，改法里应给出商业化模式、目标客群或产品化路径。",
  };
  const en: Record<string, string> = {
    "finance.scenario_fit.user_and_boundary": "Evaluates target users, usage boundaries, and suitable / unsuitable scenarios.",
    "finance.scenario_fit.scenario_specificity": "Evaluates understanding of the selected finance workflow, inputs, outputs, and decision points.",
    "finance.professionalism.concepts": "Evaluates whether finance terms, metrics, and market mechanisms are accurate.",
    "finance.professionalism.framework": "Evaluates whether the analysis framework fits fundraising, quant, trading, research, or banking.",
    "finance.professionalism.bias_and_assumptions": "Evaluates whether facts, assumptions, correlation, and causality are separated.",
    "finance.data_evidence.sources": "Evaluates data sources, freshness, field conventions, and credibility.",
    "finance.data_evidence.traceability": "Evaluates whether conclusions trace back to data, filings, reports, news, or uploaded fields.",
    "finance.data_evidence.failure_modes": "Evaluates degradation paths for missing data, latency, rate limits, and inconsistent definitions.",
    "finance.risk_compliance.advice_boundary": "Evaluates avoidance of personalized advice, return promises, and direct trade instructions.",
    "finance.risk_compliance.risk_disclosure": "Evaluates disclosure of market, liquidity, credit, model, policy, and volatility risks.",
    "finance.risk_compliance.privacy_and_controls": "Evaluates boundaries for account, trade, customer, credit, and financial-statement data.",
    "finance.risk_compliance.human_review": "Evaluates human review and audit records for high-risk decisions, trades, or approvals.",
    "finance.explainability.structure": "Evaluates whether conclusions, evidence, assumptions, counter-evidence, and risks are separated.",
    "finance.explainability.sensitivity": "Evaluates confidence, scenario analysis, sensitivity, and invalidation conditions.",
    "finance.engineering.scripted_controls": "Evaluates scripted or structured fallbacks for data, calculations, backtests, and validation.",
    "finance.engineering.auditability": "Evaluates structured outputs, logs, versions, auditability, and error handling.",
    "finance.commercial_readiness.workflow_value": "Objectively judges whether it solves high-frequency or high-value finance work, not just the author's idea.",
    "finance.commercial_readiness.paid_potential": "Judges real paid potential; if promising, fixes should propose monetization, target customers, or productization paths.",
  };
  return (lang === "zh" ? zh[id] : en[id]) ?? id;
}

function countDimensions(): number {
  return RUBRIC.pillars.reduce((s, p) => s + p.dimensions.length, 0);
}

function exportJson(report: ScoreReport, filename: string, financeExpertReport?: FinanceExpertReport | null) {
  const payload = financeExpertReport ? { ...report, domainExpert: financeExpertReport } : report;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `skilllens-${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPdf(report: ScoreReport, lang: Lang, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const node = document.createElement("div");
  node.style.position = "fixed";
  node.style.left = "-10000px";
  node.style.top = "0";
  node.style.width = "794px";
  node.style.background = "#fffaf0";
  node.innerHTML = buildPdfHtml(report, lang);
  document.body.appendChild(node);

  try {
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#fffaf0",
      useCORS: true,
      windowWidth: 794,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const sliceHeight = Math.floor((pageHeight * canvas.width) / pageWidth);
    let y = 0;
    let pageIndex = 0;

    while (y < canvas.height) {
      const pageCanvas = document.createElement("canvas");
      const h = Math.min(sliceHeight, canvas.height - y);
      pageCanvas.width = canvas.width;
      pageCanvas.height = h;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

      if (pageIndex > 0) pdf.addPage();
      const imgHeight = (h * pageWidth) / canvas.width;
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, imgHeight);
      y += h;
      pageIndex += 1;
    }

    pdf.save(`skilllens-${filename}.pdf`);
  } finally {
    document.body.removeChild(node);
  }
}

function copyMarkdown(report: ScoreReport, lang: Lang, financeExpertReport?: FinanceExpertReport | null) {
  const lines: string[] = [];
  lines.push(`# SkillLens Report — ${formatSpec(report.spec, lang)} / ${report.grade}`);
  lines.push(``);
  lines.push(`**Total**: ${report.total} / 100  ·  **Bonus**: +${report.bonus}`);
  if (!report.llmComplete) {
    lines.push(`> ${lang === "zh" ? "注意：仅含规则分，未跑 SkillLens 深度评测。" : "Note: rule-only score, SkillLens Deep Review not run."}`);
  }
  if (financeExpertReport) {
    lines.push(``);
    lines.push(`## ${lang === "zh" ? "金融专家版" : "Finance Expert"}`);
    lines.push(`**Score**: ${financeExpertReport.score} / 100 · **Risk**: ${financeExpertReport.riskLevel} · **Scenario**: ${lang === "zh" ? financeExpertReport.scenarioNameZh : financeExpertReport.scenarioNameEn}`);
  }
  lines.push(``);
  for (const pillar of report.pillars) {
    lines.push(`## ${lang === "zh" ? pillar.name_zh : pillar.name_en} — ${pillar.score.toFixed(1)} / ${pillar.weight}`);
    for (const d of pillar.dimensions) {
      const dimScoreText = d.notApplicable
        ? `— / ${d.originalWeight ?? d.weight} (N/A by scope)`
        : `${(d.score ?? 0).toFixed(1)}/${d.weight}`;
      lines.push(`### ${lang === "zh" ? d.name_zh : d.name_en} (${dimScoreText})`);
      for (const c of d.checks) {
        lines.push(`- \`${c.id}\` [${c.status}] ${c.evidence}`);
      }
    }
    lines.push(``);
  }
  if (report.suggestions.length) {
    lines.push(`## Top improvements`);
    report.suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.title}** _(${s.severity}, ${s.pillarId}/${s.checkId})_`);
      lines.push(`   - ${lang === "zh" ? "现状" : "What's wrong"}: ${s.why}`);
      lines.push(`   - ${lang === "zh" ? "改法" : "How to fix"}: ${s.how}`);
      if (s.example) {
        lines.push("   ```");
        s.example.split("\n").forEach((ln) => lines.push(`   ${ln}`));
        lines.push("   ```");
      }
    });
  }
  navigator.clipboard.writeText(lines.join("\n"));
}

function formatSpec(spec: ScoreReport["spec"], lang: Lang): string {
  if (spec === "openclaw") return lang === "zh" ? "OpenClaw" : "OpenClaw";
  return lang === "zh" ? "Claude" : "Claude";
}

/**
 * Localised label for the three skill structure types. Mirrors the CLI's
 * render_report.py:LABELS["skill_type_*"] so the web meta card and the
 * exported HTML report show identical wording.
 */
function formatSkillType(type: NonNullable<ScoreReport["skillType"]>, lang: Lang): string {
  if (lang === "zh") {
    if (type === "pipeline") return "多 skill 编排 pipeline";
    if (type === "composite") return "工具集合 composite";
    return "单一职责 atomic";
  }
  if (type === "pipeline") return "pipeline (multi-sub-skill)";
  if (type === "composite") return "composite (toolkit bundle)";
  return "atomic (single-purpose)";
}

function buildPdfHtml(report: ScoreReport, lang: Lang): string {
  const statusText = (status: string) => {
    if (lang !== "zh") return status;
    if (status === "pass") return "通过";
    if (status === "partial") return "部分";
    if (status === "fail") return "未过";
    return "未评";
  };

  const suggestions = report.suggestions.length
    ? report.suggestions.map((s, i) => `
      <article class="suggestion">
        <div class="suggestion-title">${i + 1}. ${escapeHtml(s.title)}</div>
        <div><b>${lang === "zh" ? "现状" : "Current"}：</b>${escapeHtml(s.why)}</div>
        <div><b>${lang === "zh" ? "改法" : "Fix"}：</b>${escapeHtml(s.how)}</div>
      </article>
    `).join("")
    : `<p class="muted">${lang === "zh" ? "暂无严重问题，继续保持。" : "No major issues found."}</p>`;

  const pillars = report.pillars.map((p) => `
    <section class="pillar">
      <div class="pillar-head">
        <div>
          <h2>${escapeHtml(lang === "zh" ? p.name_zh : p.name_en)}</h2>
          <span class="muted">${escapeHtml(p.id)}</span>
        </div>
        <div class="score">${p.score.toFixed(1)} / ${p.weight}</div>
      </div>
      ${p.dimensions.map((d) => `
        <div class="dimension">
          <div class="dimension-head">
            <b>${escapeHtml(lang === "zh" ? d.name_zh : d.name_en)}</b>
            <span>${d.notApplicable
              ? `— / ${d.originalWeight ?? d.weight} (${lang === "zh" ? "不适用" : "N/A by scope"})`
              : `${(d.score ?? 0).toFixed(1)} / ${d.weight}`}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>${lang === "zh" ? "细则" : "Check"}</th>
                <th>${lang === "zh" ? "状态" : "Status"}</th>
                <th>${lang === "zh" ? "现状" : "Evidence"}</th>
                <th>${lang === "zh" ? "改进建议" : "Fix"}</th>
              </tr>
            </thead>
            <tbody>
              ${d.checks.map((c) => `
                <tr>
                  <td><code>${escapeHtml(c.id)}</code></td>
                  <td>${statusText(c.status)}</td>
                  <td>${escapeHtml(c.evidence)}</td>
                  <td>${escapeHtml(c.fix ?? "-")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `).join("")}
    </section>
  `).join("");

  return `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; }
      .report {
        width: 794px;
        padding: 44px;
        color: #4b2a0c;
        background: #fffaf0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        line-height: 1.55;
      }
      .hero, .pillar, .suggestions {
        background: rgba(255, 253, 246, 0.92);
        border: 1px solid #f4d9a5;
        border-radius: 18px;
        padding: 22px;
        margin-bottom: 18px;
      }
      h1 { margin: 0; font-size: 32px; }
      h2 { margin: 0; font-size: 20px; }
      .muted { color: #7c6b5a; font-size: 12px; }
      .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
      .metric { border-radius: 14px; background: #fff3cf; padding: 12px; }
      .metric b { display: block; font-size: 22px; color: #78350f; }
      .pillar-head, .dimension-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
      }
      .score { font-size: 20px; font-weight: 800; color: #92400e; }
      .dimension { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f3dfb8; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
      th, td { border: 1px solid #f1dfbd; padding: 7px; vertical-align: top; text-align: left; }
      th { background: #fff3cf; color: #78350f; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; }
      .suggestion { border-top: 1px solid #f1dfbd; padding-top: 10px; margin-top: 10px; font-size: 13px; }
      .suggestion-title { font-weight: 800; color: #78350f; margin-bottom: 4px; }
    </style>
    <main class="report">
      <section class="hero">
        <p class="muted">SkillLens ${lang === "zh" ? "完整报告" : "Full Report"}</p>
        <h1>${formatSpec(report.spec, lang)} / ${report.grade}</h1>
        <div class="meta">
          <div class="metric"><span>${lang === "zh" ? "总分" : "Total"}</span><b>${report.total.toFixed(1)} / 100</b></div>
          <div class="metric"><span>${lang === "zh" ? "Bonus" : "Bonus"}</span><b>+${report.bonus.toFixed(1)}</b></div>
          <div class="metric"><span>${lang === "zh" ? "生成时间" : "Generated"}</span><b style="font-size: 13px;">${escapeHtml(new Date(report.generatedAt).toLocaleString())}</b></div>
        </div>
        ${!report.llmComplete ? `<p class="muted">${lang === "zh" ? "注意：仅含规则分，未跑 SkillLens 深度评测。" : "Rule-only score. SkillLens Deep Review has not run."}</p>` : ""}
      </section>
      <section class="suggestions">
        <h2>${lang === "zh" ? "Top 改进建议" : "Top Improvements"}</h2>
        ${suggestions}
      </section>
      ${pillars}
    </main>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
