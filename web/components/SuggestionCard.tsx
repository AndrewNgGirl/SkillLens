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
          <h4 className="font-semibold text-slate-800 leading-snug">{s.title}</h4>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className={["text-[10px] rounded-full px-1.5 py-0.5 font-medium", pillarBadgeCls].join(" ")}>
              {pillarName(s.pillarId, lang)}
            </span>
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

      <div className="mt-3 space-y-2 text-sm leading-relaxed">
        <p>
          <span className="inline-block text-slate-400 font-medium mr-1.5">{t.nowLabel}</span>
          <span className="text-slate-700">{s.why}</span>
        </p>
        <p>
          <span className="inline-block text-brand-600 font-medium mr-1.5">{t.fixLabel}</span>
          <span className="text-slate-800">{s.how}</span>
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
