"use client";
import { useEffect, useMemo, useState } from "react";
import Uploader from "@/components/Uploader";
import ScoreRadar from "@/components/ScoreRadar";
import PillarSection from "@/components/PillarSection";
import SuggestionCard from "@/components/SuggestionCard";
import WeightEditor from "@/components/WeightEditor";
import MarketSurveyCard from "@/components/MarketSurveyCard";
import { RUBRIC } from "@/lib/rubric/rubric";
import { parseSkill } from "@/lib/spec/parser";
import { aggregateScore } from "@/lib/scoring/aggregate";
import { runLlmReview } from "@/lib/scoring/llm-client";
import { fetchMarketSurvey } from "@/lib/market/client";
import { isMarketSurvey } from "@/lib/market/types";
import { MESSAGES, type Lang } from "@/lib/i18n/messages";
import type { CheckResult, ScoreReport, ValueType } from "@/lib/rubric/types";
import type { LlmReviewResponse } from "@/lib/llm/types";
import type { MarketSurveyResult } from "@/lib/market/types";
import type { LoadedSkill } from "@/lib/spec/loader";

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

export default function HomePage() {
  const [loaded, setLoaded] = useState<LoadedSkill | null>(null);
  const [lang, setLang] = useState<Lang>("zh");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(RUBRIC.pillars.flatMap((p) => p.dimensions.map((d) => [d.id, d.weight]))),
  );
  /** 用户主动点"启动完整评测"才会变 true（v3 分两层流程） */
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [llmResults, setLlmResults] = useState<Map<string, CheckResult> | null>(null);
  const [llmMeta, setLlmMeta] = useState<{ valueType?: ValueType; reason?: string } | null>(null);
  const [llmState, setLlmState] = useState<LlmState>({ status: "idle" });
  const [retryNonce, setRetryNonce] = useState(0);
  const [marketSurvey, setMarketSurvey] = useState<MarketSurveyResult | null>(null);

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
  }, [skill, llmEnabled, retryNonce, lang]);

  const report: ScoreReport | null = useMemo(() => {
    if (!skill) return null;
    const base = aggregateScore(skill, RUBRIC, {
      weightOverrides: weights,
      llmResults: llmResults ?? undefined,
      language: lang,
    });
    return {
      ...base,
      valueType: llmMeta?.valueType,
      valueTypeReason: llmMeta?.reason,
    };
  }, [skill, weights, llmResults, llmMeta, lang]);

  const t = MESSAGES[lang];
  const llmIdle = llmState.status === "idle" || llmState.status === "error";
  const showFullEvalCta = report && !report.llmComplete && llmState.status !== "running";

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

      {!report && <Uploader lang={lang} onLoad={setLoaded} />}

      {report && skill && (
        <div className="space-y-8">
          {/* ===== 总分卡 + 雷达 ===== */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass rounded-2xl p-6 lg:col-span-1">
              <div className="text-sm text-slate-500">{t.totalScore}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-6xl font-bold tabular-nums">
                  {report.total.toFixed(1)}
                </div>
                <div className="text-slate-400 text-xl">/ 100</div>
              </div>
              <div className="mt-2 inline-flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center justify-center rounded-lg bg-brand-500 text-white w-8 h-8 font-bold">
                  {report.grade}
                </span>
                <span className="text-sm text-slate-600">
                  {RUBRIC.grades.find((g) => g.grade === report.grade)?.[lang === "zh" ? "label_zh" : "label_en"]}
                </span>
                {report.bonus > 0 && (
                  <span className="text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">
                    {t.bonus} +{report.bonus.toFixed(1)}
                  </span>
                )}
                {!report.llmComplete && (
                  <span className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded-full">
                    {lang === "zh" ? "规则分初步" : "rule-only preview"}
                  </span>
                )}
              </div>
              {report.valueType && (
                <div className="mt-4 rounded-xl bg-brand-50 ring-1 ring-brand-100 px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-600">{t.valueTypeLabel}</span>
                    <span className="font-semibold text-brand-900">
                      {t.valueTypeNames[report.valueType] ?? report.valueType}
                    </span>
                  </div>
                  <div className="mt-1 text-brand-700/80 leading-snug">
                    {t.valueTypeHints[report.valueType] ?? ""}
                  </div>
                  {report.valueTypeReason && (
                    <div className="mt-1.5 text-brand-700/70 leading-snug">
                      <span className="text-brand-600/80">{t.valueTypeReason}：</span>
                      {report.valueTypeReason}
                    </div>
                  )}
                </div>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-slate-500">{t.spec}</dt>
                <dd className="font-mono">{formatSpec(report.spec, lang)}</dd>
                <dt className="text-slate-500">{t.generatedAt}</dt>
                <dd className="font-mono text-xs">{new Date(report.generatedAt).toLocaleString()}</dd>
                {llmState.status === "ok" && (
                  <>
                    <dt className="text-slate-500">{t.llmProvider}</dt>
                    <dd className="font-mono text-xs">
                      {llmState.response.provider}
                      {llmState.response.cached && <span className="ml-1 text-emerald-600">({t.llmCached})</span>}
                    </dd>
                  </>
                )}
              </dl>
              <button
                onClick={() => { setLoaded(null); }}
                className="mt-5 text-xs text-brand-600 hover:underline"
              >
                ← {lang === "zh" ? "重新上传" : "Upload another"}
              </button>
            </div>

            <div className="glass rounded-2xl p-4 lg:col-span-2">
              <ScoreRadar pillars={report.pillars} lang={lang} />
            </div>
          </section>

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

          {/* ===== 量化评测区 ===== */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
              <div className="min-h-[2.25rem] flex items-end">
                <h2 className="text-xl font-semibold text-brand-900">{t.pillarsTitle}</h2>
              </div>
              {report.pillars.map((p) => (
                <PillarSection
                  key={p.id}
                  pillar={p}
                  lang={lang}
                  llmIdle={llmIdle}
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
              <div className="min-h-[2.25rem] flex items-end justify-between">
                <h2 className="text-xl font-semibold text-brand-900">
                  {lang === "zh" ? "优化与权重" : "Tuning"}
                </h2>
                <span className="text-xs text-stone-400">
                  {lang === "zh" ? "建议 / 权重 / 导出" : "Suggestions / weights / export"}
                </span>
              </div>
              <div className="glass rounded-2xl p-5">
                <h3 className="font-semibold">{t.suggestions}</h3>
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

              <WeightEditor
                rubric={RUBRIC}
                weights={weights}
                onChange={setWeights}
                lang={lang}
              />

              <div className="glass rounded-2xl p-5 space-y-2">
                <button
                  onClick={async () => {
                    setPdfBusy(true);
                    try {
                      await exportPdf(report, lang, loaded?.rootName || "report");
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
                  onClick={() => exportJson(report, loaded?.rootName || "report")}
                  className="w-full rounded-lg border border-brand-200 hover:bg-brand-50 px-3 py-2 text-sm text-brand-700"
                >
                  {t.exportJson}
                </button>
                <button
                  onClick={() => copyMarkdown(report, lang)}
                  className="w-full rounded-lg border border-brand-200 hover:bg-brand-50 px-3 py-2 text-sm text-brand-700"
                >
                  {t.copyReport}
                </button>
              </div>
            </aside>
          </section>
        </div>
      )}

      <footer className="pt-10 border-t border-brand-100 text-xs text-stone-400">
        SkillLens · M3 · rubric v{RUBRIC.schema_version} · 5 pillars × {countDimensions()} dimensions
      </footer>
    </main>
  );
}

function countDimensions(): number {
  return RUBRIC.pillars.reduce((s, p) => s + p.dimensions.length, 0);
}

function exportJson(report: ScoreReport, filename: string) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
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

function copyMarkdown(report: ScoreReport, lang: Lang) {
  const lines: string[] = [];
  lines.push(`# SkillLens Report — ${formatSpec(report.spec, lang)} / ${report.grade}`);
  lines.push(``);
  lines.push(`**Total**: ${report.total} / 100  ·  **Bonus**: +${report.bonus}`);
  if (!report.llmComplete) {
    lines.push(`> ${lang === "zh" ? "注意：仅含规则分，未跑 SkillLens 深度评测。" : "Note: rule-only score, SkillLens Deep Review not run."}`);
  }
  lines.push(``);
  for (const pillar of report.pillars) {
    lines.push(`## ${lang === "zh" ? pillar.name_zh : pillar.name_en} — ${pillar.score.toFixed(1)} / ${pillar.weight}`);
    for (const d of pillar.dimensions) {
      lines.push(`### ${lang === "zh" ? d.name_zh : d.name_en} (${d.score.toFixed(1)}/${d.weight})`);
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
            <span>${d.score.toFixed(1)} / ${d.weight}</span>
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
