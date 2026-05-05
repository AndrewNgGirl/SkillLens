"use client";
import type { Rubric } from "@/lib/rubric/types";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";

interface Props {
  rubric: Rubric;
  weights: Record<string, number>;
  onChange: (w: Record<string, number>) => void;
  lang: Lang;
}

export default function WeightEditor({ rubric, weights, onChange, lang }: Props) {
  const t = MESSAGES[lang];
  const dimensions = rubric.pillars.flatMap((p) => p.dimensions);
  const sum = dimensions.reduce((s, d) => s + (weights[d.id] ?? d.weight), 0);

  const defaults = () =>
    Object.fromEntries(dimensions.map((d) => [d.id, d.weight]));

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t.weights}</h3>
        <button
          onClick={() => onChange(defaults())}
          className="text-xs text-brand-600 hover:underline"
        >
          {t.resetWeights}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {lang === "zh"
          ? "可调整每个子维度权重，评分会自动重算并归一化为 100。"
          : "Tune each sub-dimension weight. Scores are automatically normalized to 100."}
      </p>

      <div className="mt-4 space-y-4">
        {rubric.pillars.map((p) => {
          const pillarSum = p.dimensions.reduce((s, d) => s + (weights[d.id] ?? d.weight), 0);
          return (
            <section key={p.id} className="rounded-xl bg-white/55 ring-1 ring-brand-100 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-brand-900">{lang === "zh" ? p.name_zh : p.name_en}</h4>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {lang === "zh" ? "小计" : "Subtotal"} {pillarSum}
                </span>
              </div>
              <ul className="mt-3 space-y-3">
                {p.dimensions.map((d) => {
                  const w = weights[d.id] ?? d.weight;
                  return (
                    <li key={d.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{lang === "zh" ? d.name_zh : d.name_en}</span>
                        <span className="tabular-nums text-slate-500">{w}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        step={0.5}
                        value={w}
                        onChange={(e) =>
                          onChange({ ...weights, [d.id]: Number(e.target.value) })
                        }
                        className="w-full accent-brand-500"
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Σ = {sum} {sum !== 100 ? "→ auto-normalized to 100" : ""}
      </div>
    </div>
  );
}
