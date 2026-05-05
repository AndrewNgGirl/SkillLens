"use client";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { PillarResult } from "@/lib/rubric/types";
import type { Lang } from "@/lib/i18n/messages";

interface Props {
  pillars: PillarResult[];
  lang: Lang;
}

export default function ScoreRadar({ pillars, lang }: Props) {
  const data = pillars.map((p) => ({
    dim: lang === "zh" ? p.name_zh : p.name_en,
    score: p.weight === 0 ? 0 : Math.round((p.score / p.weight) * 100),
    raw: p.score,
    weight: p.weight,
    awaiting: p.llmCoverage.total > 0 && p.llmCoverage.evaluated < p.llmCoverage.total,
  }));

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#f1d9a8" />
          <PolarAngleAxis dataKey="dim" tick={{ fill: "#6b4423", fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name={lang === "zh" ? "支柱得分率" : "Pillar score rate"}
            dataKey="score"
            stroke="#d97706"
            fill="#fbbf24"
            fillOpacity={0.28}
          />
          <Tooltip
            formatter={(v: number, _n, p) => {
              const payload = p?.payload as { raw: number; weight: number; awaiting: boolean } | undefined;
              if (payload?.awaiting) {
                return [lang === "zh" ? "等待 SkillLens 深度评测…" : "Awaiting SkillLens Deep Review…", lang === "zh" ? "状态" : "Status"];
              }
              if (payload) return [`${v}%  (${payload.raw.toFixed(1)}/${payload.weight})`, lang === "zh" ? "得分" : "Score"];
              return [v, "-"];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
