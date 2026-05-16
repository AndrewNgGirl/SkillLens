"use client";
import type { Suggestion } from "@/lib/rubric/types";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import { RUBRIC } from "@/lib/rubric/rubric";

interface Props {
  suggestion: Suggestion;
  index: number;
  lang: Lang;
}

const PILLAR_BADGE: Record<string, string> = {
  business_value: "bg-brand-100 text-brand-700",
  market:         "bg-orange-100 text-orange-700",
  runtime_cost:   "bg-lime-100 text-lime-700",
  reliability:    "bg-amber-100 text-amber-700",
  writeup:        "bg-stone-100 text-stone-700",
  bonus:          "bg-rose-100 text-rose-700",
};

function pillarName(id: string, lang: Lang): string {
  const p = RUBRIC.pillars.find((x) => x.id === id);
  if (p) return lang === "zh" ? p.name_zh : p.name_en;
  if (id === "bonus") return lang === "zh" ? "Bonus" : "Bonus";
  return id;
}

function dimensionName(id: string, lang: Lang): string {
  for (const p of RUBRIC.pillars) {
    const dim = p.dimensions.find((x) => x.id === id);
    if (dim) return lang === "zh" ? dim.name_zh : dim.name_en;
  }
  return id;
}

export default function SuggestionCard({ suggestion: s, index, lang }: Props) {
  const t = MESSAGES[lang];
  const isHigh = s.severity === "high";
  const pillarBadgeCls = PILLAR_BADGE[s.pillarId] ?? "bg-slate-100 text-slate-700";
  return (
    <article
      className={[
        "rounded-xl ring-1 p-4 transition",
        isHigh ? "ring-rose-200 bg-rose-50/50" : "ring-brand-200 bg-brand-50/70",
      ].join(" ")}
    >
      <header className="flex items-start gap-3">
        <span
          className={[
            "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0",
            isHigh ? "bg-rose-500 text-white" : "bg-brand-500 text-white",
          ].join(" ")}
          aria-hidden
        >
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-slate-400">
            {lang === "zh" ? "建议 / 改法" : "Recommendation"}
          </div>
          <h4 className="mt-1 text-base font-semibold text-slate-900 leading-snug">{s.how}</h4>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className={["text-[10px] rounded-full px-1.5 py-0.5 font-medium", pillarBadgeCls].join(" ")}>
              {pillarName(s.pillarId, lang)}
            </span>
            <span className="text-[11px] text-slate-400">{dimensionName(s.dimensionId, lang)}</span>
            <span className="text-[11px] text-slate-400 font-mono">{s.checkId}</span>
          </div>
        </div>
        <span
          className={[
            "shrink-0 rounded-full text-[11px] px-2 py-0.5 font-medium",
            isHigh ? "bg-rose-100 text-rose-700" : "bg-brand-100 text-brand-700",
          ].join(" ")}
        >
          {isHigh ? t.severityHigh : t.severityMedium}
        </span>
      </header>

      <div className="mt-3 space-y-2 leading-relaxed">
        <div className="rounded-lg bg-white/75 ring-1 ring-white/80 px-2.5 py-2 text-xs">
          <div className="text-slate-400 font-medium">
            {lang === "zh" ? "对应内容" : "What this addresses"}
          </div>
          <div className="mt-0.5 text-slate-600">{s.title}</div>
        </div>
        <p className="text-xs">
          <span className="inline-block text-slate-400 font-medium mr-1.5">{t.nowLabel}</span>
          <span className="text-slate-600">{s.why}</span>
        </p>
        {s.example && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
              {t.showExample}
            </summary>
            <pre className="mt-2 text-[11px] bg-white/85 ring-1 ring-brand-100 text-slate-700 rounded-md p-2 overflow-x-auto font-mono">
              {s.example}
            </pre>
          </details>
        )}
      </div>
    </article>
  );
}
