"use client";
import { useState } from "react";
import type { PillarResult, PillarColor } from "@/lib/rubric/types";
import type { GeneralWeightOverrides } from "@/lib/scoring/aggregate";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import { RUBRIC } from "@/lib/rubric/rubric";
import DimensionCard from "./DimensionCard";

interface Props {
  pillar: PillarResult;
  lang: Lang;
  /** 父组件控制：当前是否还没有任何 LLM 数据 */
  llmIdle: boolean;
  /** 可选附加内容；总是渲染在 header 之下、子维度之上。
   *  目前用于在 market 支柱里嵌入 GitHub 调研卡片。 */
  extra?: React.ReactNode;
  weights?: GeneralWeightOverrides;
  onWeightsChange?: (weights: GeneralWeightOverrides) => void;
  onResetWeights?: () => void;
}

const COLOR_RING: Record<PillarColor, string> = {
  indigo:  "ring-brand-200/70 bg-gradient-to-br from-brand-50/90 to-white",
  violet:  "ring-orange-200/70 bg-gradient-to-br from-orange-50/80 to-white",
  emerald: "ring-lime-200/70 bg-gradient-to-br from-lime-50/70 to-white",
  amber:   "ring-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white",
  slate:   "ring-stone-200/80 bg-gradient-to-br from-stone-50/80 to-white",
};
const COLOR_BAR: Record<PillarColor, string> = {
  indigo:  "from-brand-600 to-brand-200",
  violet:  "from-orange-500 to-amber-200",
  emerald: "from-lime-600 to-lime-200",
  amber:   "from-amber-500 to-yellow-200",
  slate:   "from-stone-500 to-stone-200",
};
const COLOR_TEXT: Record<PillarColor, string> = {
  indigo:  "text-brand-700",
  violet:  "text-orange-700",
  emerald: "text-lime-700",
  amber:   "text-amber-700",
  slate:   "text-stone-700",
};
const COLOR_PILL: Record<PillarColor, string> = {
  indigo:  "bg-brand-100/80 text-brand-700",
  violet:  "bg-orange-100/80 text-orange-700",
  emerald: "bg-lime-100/80 text-lime-700",
  amber:   "bg-amber-100/80 text-amber-700",
  slate:   "bg-stone-100/80 text-stone-700",
};

export default function PillarSection({ pillar, lang, llmIdle, extra, weights, onWeightsChange, onResetWeights }: Props) {
  const t = MESSAGES[lang];
  const [open, setOpen] = useState(false);
  const [showNa, setShowNa] = useState(false);
  const def = RUBRIC.pillars.find((p) => p.id === pillar.id);
  const color = (def?.color ?? "slate") as PillarColor;
  const name = lang === "zh" ? pillar.name_zh : pillar.name_en;
  const tagline = def ? (lang === "zh" ? def.tagline_zh : def.tagline_en) : "";
  const role = def ? (lang === "zh" ? def.role_zh : def.role_en) : "";
  const rawPillarWeight = weights?.pillars?.[pillar.id] ?? def?.weight ?? pillar.weight;

  const pct = pillar.weight === 0 ? 0 : Math.round((pillar.score / pillar.weight) * 100);
  const llmTotal = pillar.llmCoverage.total;
  const llmEvaluated = pillar.llmCoverage.evaluated;
  const llmIncomplete = llmTotal > 0 && llmEvaluated < llmTotal;
  const isAwaiting = llmIncomplete && llmIdle;

  // Split applicable vs fully-N/A dims so reviewers see only relevant ones by
  // default. Fully-N/A dims (filtered out by applies_to for the current
  // skill_type) are tucked behind a footer toggle so the dashboard stays clean.
  const applicableDims = pillar.dimensions.filter((d) => !d.notApplicable);
  const naDims = pillar.dimensions.filter((d) => d.notApplicable);

  return (
    <article className={["rounded-2xl ring-1 p-5 transition", COLOR_RING[color]].join(" ")}>
      <header className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={["text-lg font-bold", COLOR_TEXT[color]].join(" ")}>{name}</h3>
            {role && (
              <span className={["text-[11px] rounded-full px-2 py-0.5 font-medium", COLOR_PILL[color]].join(" ")}>
                {role}
              </span>
            )}
            {llmTotal > 0 && (
              <span className="text-[11px] text-slate-400">
                {isAwaiting
                  ? t.pillarLlmCoverage
                  : llmIncomplete
                    ? t.pillarLlmPartial.replace("{evaluated}", String(llmEvaluated)).replace("{total}", String(llmTotal))
                    : t.pillarLlmComplete}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{tagline}</p>
          {onWeightsChange && (
            <div className="mt-3 rounded-lg bg-white/65 ring-1 ring-brand-100 px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-brand-700">
                  {lang === "zh" ? "支柱权重" : "Pillar weight"}
                </span>
                <div className="flex items-center gap-3">
                  {onResetWeights && (
                    <button
                      onClick={onResetWeights}
                      className="text-[11px] text-brand-600 hover:underline"
                    >
                      {lang === "zh" ? "恢复默认" : "Reset"}
                    </button>
                  )}
                  <span className="tabular-nums text-slate-500">
                    {rawPillarWeight.toFixed(1)} → {pillar.weight.toFixed(1)}
                  </span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={0.5}
                value={rawPillarWeight}
                onChange={(e) =>
                  onWeightsChange({
                    ...weights,
                    pillars: { ...(weights?.pillars ?? {}), [pillar.id]: Number(e.target.value) },
                  })
                }
                className="mt-1 w-full accent-brand-500"
              />
              <div className="mt-1 text-[11px] text-slate-400">
                {lang === "zh"
                  ? "调整支柱会按比例联动下方子维度；右侧为归一化后的有效权重。"
                  : "Changing the pillar updates dimension impact below; the right value is normalized impact."}
              </div>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          {isAwaiting ? (
            <div className="text-xs text-slate-400 italic">{t.llmEvalPending}</div>
          ) : (
            <>
              <div className={["text-3xl font-bold tabular-nums", COLOR_TEXT[color]].join(" ")}>
                {pillar.score.toFixed(1)}
                <span className="text-sm font-normal text-slate-400"> / {pillar.weight.toFixed(0)}</span>
              </div>
              <div className="text-xs text-slate-500">{pct}%</div>
            </>
          )}
        </div>
      </header>

      {!isAwaiting && (
        <div className="mt-3 h-2 rounded-full bg-white/70 overflow-hidden ring-1 ring-brand-100/70">
          <div
            className={["h-full bg-gradient-to-r transition-[width] duration-500", COLOR_BAR[color]].join(" ")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {extra && <div className="mt-4">{extra}</div>}

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 text-xs text-slate-500 hover:text-slate-800"
      >
        {open
          ? (lang === "zh" ? "收起子维度" : "hide dimensions")
          : (lang === "zh" ? `展开 ${applicableDims.length} 个子维度` : `expand ${applicableDims.length} dimensions`)}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {applicableDims.map((d) => (
            <DimensionCard
              key={d.id}
              dim={d}
              lang={lang}
              compact
              weightValue={weights?.dimensions?.[d.id] ?? d.weight}
              onWeightChange={onWeightsChange ? (weight) =>
                onWeightsChange({
                  ...weights,
                  dimensions: { ...(weights?.dimensions ?? {}), [d.id]: weight },
                }) : undefined}
            />
          ))}

          {naDims.length > 0 && (
            <div className="mt-2 border-t border-dashed border-slate-300 pt-3">
              <button
                onClick={() => setShowNa(!showNa)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-800 select-none"
              >
                <span className={`inline-block transition-transform ${showNa ? "rotate-90" : ""}`}>▸</span>
                <span className="font-medium text-slate-600">
                  {lang === "zh"
                    ? `查看 ${naDims.length} 个对当前 skill 类型不适用的维度`
                    : `Show ${naDims.length} dimension${naDims.length === 1 ? "" : "s"} not applicable to this skill type`}
                </span>
                <span className="text-[11px] text-slate-400">
                  {lang === "zh" ? "（不影响打分，仅供参考）" : "(does not affect scoring; for reference only)"}
                </span>
              </button>
              {showNa && (
                <div className="mt-3 space-y-3">
                  {naDims.map((d) => (
                    <DimensionCard
                      key={d.id}
                      dim={d}
                      lang={lang}
                      compact
                      weightValue={weights?.dimensions?.[d.id] ?? d.weight}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
