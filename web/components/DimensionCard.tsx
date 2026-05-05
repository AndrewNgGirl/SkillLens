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
};

const STATUS_ICON: Record<string, string> = {
  pass: "✓", partial: "~", fail: "✕", n_a: "·",
};

function confidenceText(c: { confidence?: number; confidencePolicy?: string }, lang: Lang): string {
  const base = c.confidence !== undefined
    ? `${Math.round(c.confidence * 100)}%`
    : c.confidencePolicy
      ? (MESSAGES[lang].confidencePolicyNames[c.confidencePolicy] ?? c.confidencePolicy)
      : "-";
  return base;
}

export default function DimensionCard({ dim, lang, compact = false }: Props) {
  const t = MESSAGES[lang];
  const [open, setOpen] = useState(false);

  const def = findDimDef(dim.id);
  const name = lang === "zh" ? dim.name_zh : dim.name_en;
  const tagline = def ? (lang === "zh" ? def.tagline_zh : def.tagline_en) : "";
  const checkDefs = new Map(
    (def?.checks ?? []).map((c) => [c.id, c]),
  );
  const pct = dim.weight === 0 ? 0 : Math.round((dim.score / dim.weight) * 100);
  const wrapperCls = compact
    ? "rounded-xl ring-1 ring-brand-100 bg-white/75 p-4"
    : "glass rounded-2xl p-5";

  return (
    <div className={wrapperCls}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{name}</span>
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">{dim.id}</span>
          </div>
          {tagline && (
            <p className="mt-1 text-sm text-slate-500 leading-relaxed">{tagline}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums">
            {dim.score.toFixed(1)}
            <span className="text-sm font-normal text-slate-400"> / {dim.weight}</span>
          </div>
          <div className="text-xs text-slate-500">
            {pct}% · {open ? (lang === "zh" ? "收起" : "hide") : (lang === "zh" ? "展开细则" : "expand")}
          </div>
        </div>
      </button>

      <div className="mt-3 h-1.5 rounded-full bg-brand-100/70 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-600 to-yellow-300 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <ul className="mt-4 space-y-3">
          {dim.checks.map((c) => {
            const cdef = checkDefs.get(c.id);
            const criterionTitle = cdef ? (lang === "zh" ? cdef.desc_zh : cdef.desc_en) : c.id;
            const showFix = (c.status === "fail" || c.status === "partial") && !!c.fix;
            const showExample = (c.status === "fail" || c.status === "partial") && !!c.example;

            return (
              <li key={c.id} className="rounded-xl ring-1 ring-brand-100/80 bg-white/60 p-3">
                <div className="flex items-start gap-3">
                  <span
                    className={[
                      "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 shrink-0",
                      STATUS_STYLES[c.status] ?? STATUS_STYLES.n_a,
                    ].join(" ")}
                    title={c.status}
                  >
                    <span className="font-mono mr-1">{STATUS_ICON[c.status] ?? "·"}</span>
                    {c.status === "pass" ? t.statusPass
                      : c.status === "partial" ? t.statusPartial
                      : c.status === "fail" ? t.statusFail
                      : t.statusNA}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-sm font-medium text-slate-800">{criterionTitle}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                      <span className="text-slate-400 mr-1.5">{t.nowLabel}</span>
                      {c.evidence}
                    </div>
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
