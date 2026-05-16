"use client";
import { useState } from "react";
import type { DimensionResult } from "@/lib/rubric/types";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import { RUBRIC } from "@/lib/rubric/rubric";

interface Props {
  dim: DimensionResult;
  lang: Lang;
  /** compact 模式：嵌套在 PillarSection 里时去掉外层 glass / 缩小字号 */
  compact?: boolean;
  weightValue?: number;
  onWeightChange?: (weight: number) => void;
}

function findDimDef(dimId: string) {
  for (const p of RUBRIC.pillars) {
    const d = p.dimensions.find((x) => x.id === dimId);
    if (d) return d;
  }
  return undefined;
}

const STATUS_STYLES: Record<string, string> = {
  pass:    "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-amber-50  text-amber-700  ring-amber-200",
  fail:    "bg-rose-50   text-rose-700   ring-rose-200",
  n_a:     "bg-stone-50  text-stone-500  ring-stone-200",
  // not_applicable = explicitly filtered by applies_to (different from n_a
  // which is "would have been LLM-evaluated but no result yet"). Slate to
  // visually mark "out of scope, not counted."
  not_applicable: "bg-slate-50 text-slate-500 ring-slate-200",
};

const STATUS_ICON: Record<string, string> = {
  pass: "✓", partial: "~", fail: "✕", n_a: "·", not_applicable: "—",
};

function confidenceText(c: { confidence?: number; confidencePolicy?: string }, lang: Lang): string {
  const base = c.confidence !== undefined
    ? `${Math.round(c.confidence * 100)}%`
    : c.confidencePolicy
      ? (MESSAGES[lang].confidencePolicyNames[c.confidencePolicy] ?? c.confidencePolicy)
      : "-";
  return base;
}

export default function DimensionCard({ dim, lang, compact = false, weightValue, onWeightChange }: Props) {
  const t = MESSAGES[lang];
  const [open, setOpen] = useState(false);

  const def = findDimDef(dim.id);
  const name = lang === "zh" ? dim.name_zh : dim.name_en;
  const tagline = def ? (lang === "zh" ? def.tagline_zh : def.tagline_en) : "";
  const checkDefs = new Map(
    (def?.checks ?? []).map((c) => [c.id, c]),
  );
  const isDimNotApplicable = dim.notApplicable === true;
  const pct = dim.score === null || dim.weight === 0
    ? 0
    : Math.round((dim.score / dim.weight) * 100);
  const baseWrapperCls = compact
    ? "rounded-xl ring-1 ring-brand-100 bg-white/75 p-4"
    : "glass rounded-2xl p-5";
  const wrapperCls = isDimNotApplicable
    ? `${baseWrapperCls} opacity-65 border border-dashed border-slate-300 bg-slate-50/60`
    : baseWrapperCls;

  return (
    <div className={wrapperCls}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold">{name}</span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">{dim.id}</span>
            {isDimNotApplicable && (
              <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 ring-1 ring-slate-300">
                {lang === "zh" ? "不适用" : "N/A by scope"}
              </span>
            )}
          </div>
          {tagline && (
            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{tagline}</p>
          )}
          {isDimNotApplicable && (
            <p className="mt-1 text-xs text-slate-400 italic">
              {lang === "zh"
                ? "本维度所有细则对当前 skill 类型不适用，权重已按比例分摊到其他维度。"
                : "All checks in this dimension are out of scope for the current skill type; its weight has been redistributed."}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {isDimNotApplicable ? (
            <>
              <div className="text-2xl font-bold tabular-nums text-slate-400">
                —
                {dim.originalWeight !== undefined && (
                  <span className="text-sm font-normal text-slate-400 line-through ml-1">
                    / {dim.originalWeight}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                {lang === "zh" ? "不适用" : "out of scope"}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold tabular-nums">
                {(dim.score ?? 0).toFixed(1)}
                <span className="text-sm font-normal text-slate-400"> / {dim.weight}</span>
              </div>
              <div className="text-xs text-slate-500">
                {pct}% · {open ? (lang === "zh" ? "收起" : "hide") : (lang === "zh" ? "展开细则" : "expand")}
              </div>
            </>
          )}
        </div>
      </button>

      {!isDimNotApplicable && (
        <div className="mt-3 h-1.5 rounded-full bg-brand-100/70 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-600 to-yellow-300 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {onWeightChange && (
        <div className="mt-3 rounded-lg bg-white/65 ring-1 ring-brand-100 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-brand-700">
              {lang === "zh" ? "子维度权重" : "Dimension weight"}
            </span>
            <span className="tabular-nums text-slate-500">
              {(weightValue ?? dim.weight).toFixed(1)} → {dim.weight.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            step={0.5}
            value={weightValue ?? dim.weight}
            onChange={(e) => onWeightChange(Number(e.target.value))}
            className="mt-1 w-full accent-brand-500"
          />
        </div>
      )}

      {open && (
        <ul className="mt-4 space-y-3">
          {dim.checks.map((c) => {
            const cdef = checkDefs.get(c.id);
            const criterionTitle = cdef ? (lang === "zh" ? cdef.desc_zh : cdef.desc_en) : c.id;
            const showFix = (c.status === "fail" || c.status === "partial") && !!c.fix;
            const showExample = (c.status === "fail" || c.status === "partial") && !!c.example;
            const isNotApplicable = c.status === "not_applicable";
            const liClass = [
              "rounded-xl p-3",
              isNotApplicable
                ? "border border-dashed border-slate-300 bg-slate-50/60 opacity-65"
                : "ring-1 ring-brand-100/80 bg-white/60",
            ].join(" ");
            const statusLabel =
              c.status === "pass" ? t.statusPass
                : c.status === "partial" ? t.statusPartial
                  : c.status === "fail" ? t.statusFail
                    : isNotApplicable
                      ? (lang === "zh" ? "不适用" : "N/A by scope")
                      : t.statusNA;

            return (
              <li key={c.id} className={liClass}>
                <div className="flex items-start gap-3">
                  <span
                    className={[
                      "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 shrink-0",
                      STATUS_STYLES[c.status] ?? STATUS_STYLES.n_a,
                    ].join(" ")}
                    title={c.status}
                  >
                    <span className="font-mono mr-1">{STATUS_ICON[c.status] ?? "·"}</span>
                    {statusLabel}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-sm font-medium text-slate-800">{criterionTitle}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                      <span className="text-slate-400 mr-1.5">{t.nowLabel}</span>
                      {c.evidence}
                    </div>
                    {isNotApplicable && (
                      <div className="text-[11px] text-slate-400 italic">
                        ↳ {lang === "zh"
                          ? "已按 applies_to 过滤，不计分母"
                          : "Filtered by applies_to; excluded from denominator"}
                      </div>
                    )}
                    {showFix && (
                      <div className="text-xs text-slate-700 leading-relaxed bg-brand-50/90 rounded-md px-2.5 py-1.5 ring-1 ring-brand-100/70">
                        <span className="text-brand-600 font-medium mr-1.5">{t.fixLabel}</span>
                        {c.fix}
                      </div>
                    )}
                    {showExample && (
                      <pre className="text-[11px] bg-stone-50 text-slate-700 rounded-md p-2 overflow-x-auto font-mono">
                        {c.example}
                      </pre>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                      {c.evidenceSource && (
                        <span className="rounded bg-brand-50/70 ring-1 ring-brand-100 px-1.5 py-0.5">
                          {t.evidenceSourceLabel}: {t.evidenceSourceNames[c.evidenceSource] ?? c.evidenceSource}
                        </span>
                      )}
                      {(c.confidence !== undefined || c.confidencePolicy) && (
                        <span className="rounded bg-brand-50/70 ring-1 ring-brand-100 px-1.5 py-0.5">
                          {t.confidenceLabel}: {confidenceText(c, lang)}
                        </span>
                      )}
                      <span className="font-mono">
                        {c.id} · {c.type === "llm" ? t.checkTypeLLM : t.checkTypeRule} · w={c.weight}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
