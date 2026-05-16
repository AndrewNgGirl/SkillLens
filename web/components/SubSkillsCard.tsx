"use client";

import type { SubSkillSummary } from "@/lib/rubric/types";

/**
 * SubSkillsCard
 *
 * Mirrors the "子 SKILL.md" card in the CLI HTML report (render_report.py).
 *
 * Two variants control where this card sits:
 *
 *   - "inline" (default) — lives inside the left meta card (KPI column).
 *     Density is single column for ≤ 12 entries, 2 columns above. Capped
 *     height with internal scroll keeps it from stretching the radar.
 *
 *   - "wide" — full-width banner placed below the dashboard. Used when the
 *     package has many sub-skills (> 12). The card spans the full content
 *     width and uses a 3–4 column responsive grid so the right-side empty
 *     space under the radar is reclaimed instead of wasted.
 *
 * Visually identical to the CLI HTML so the local web view and the exported
 * report stay 1:1 — only Tailwind classes are used.
 */
export interface SubSkillsCardProps {
  subSkills: SubSkillSummary[];
  lang: "zh" | "en";
  variant?: "inline" | "wide";
}

export default function SubSkillsCard({
  subSkills,
  lang,
  variant = "inline",
}: SubSkillsCardProps) {
  if (!subSkills || subSkills.length === 0) return null;

  const headLabel = lang === "zh" ? "子 SKILL.md" : "Sub SKILL.md";
  const countText =
    lang === "zh" ? `${subSkills.length} 个子 skill` : `${subSkills.length} sub-skills`;

  // Inline variant — stays inside the left meta card.
  // Threshold mirrors render_report.py:_sub_skills_block (data-many="true" when > 12).
  const many = subSkills.length > 12;

  let listClass: string;
  if (variant === "wide") {
    // Wide variant: 3 columns at lg, 4 at xl — fills the previously empty
    // space under the radar. Slightly taller cap because horizontal real
    // estate is much larger here.
    listClass =
      "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-1 max-h-[420px] overflow-y-auto";
  } else if (many) {
    listClass =
      "grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1 max-h-[360px] overflow-y-auto";
  } else {
    listClass = "flex flex-col gap-1 max-h-[320px] overflow-y-auto";
  }

  const containerClass =
    variant === "wide"
      ? "rounded-2xl bg-stone-100/70 ring-1 ring-stone-300/60 p-4 shadow-inner"
      : "rounded-xl bg-stone-100/70 ring-1 ring-stone-300/60 p-3 shadow-inner";

  return (
    <div className={containerClass}>
      <div className="flex items-baseline justify-between mb-2">
        <strong
          className={
            variant === "wide"
              ? "text-sm font-semibold text-brand-900"
              : "text-[12.5px] font-semibold text-brand-900"
          }
        >
          {headLabel}
        </strong>
        <span className="text-[11px] text-stone-500">{countText}</span>
      </div>
      <ol className={listClass}>
        {subSkills.map((s, i) => (
          <li
            key={s.path}
            title={s.description ?? ""}
            className="group relative pl-7 pr-2 py-1 rounded-md hover:bg-white/60 min-w-0"
          >
            <span className="absolute left-2 top-1 text-[10px] tabular-nums text-stone-400">
              {i + 1}
            </span>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-mono text-[10.5px] text-brand-800 truncate min-w-0 shrink">
                {s.path}
              </span>
              <span className="text-[11px] font-semibold text-stone-700 truncate shrink-0 max-w-[50%]">
                {s.name ?? "—"}
              </span>
            </div>
            {s.description ? (
              <div className="text-[11px] text-stone-500 truncate">
                {s.description}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
