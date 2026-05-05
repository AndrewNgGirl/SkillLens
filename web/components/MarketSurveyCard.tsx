"use client";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import type { MarketSurveyResult } from "@/lib/market/types";
import { isMarketSurvey } from "@/lib/market/types";

interface Props {
  lang: Lang;
  result: MarketSurveyResult | null;
  loading?: boolean;
}

/** 友好相对时间："3 个月前" / "3 months ago"。简易实现，无需 dayjs。 */
function relativeTime(iso: string, lang: Lang): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "?";
  const days = Math.max(0, Math.floor((Date.now() - t) / 86400_000));
  if (lang === "zh") {
    if (days < 7) return `${days} 天前`;
    if (days < 60) return `${Math.floor(days / 7)} 周前`;
    if (days < 365) return `${Math.floor(days / 30)} 个月前`;
    return `${Math.floor(days / 365)} 年前`;
  }
  if (days < 7) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} w ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} y ago`;
}

export default function MarketSurveyCard({ lang, result, loading }: Props) {
  const t = MESSAGES[lang];

  if (loading) {
    return (
      <div className="rounded-xl bg-brand-50/80 ring-1 ring-brand-100 p-4 text-sm text-brand-700">
        <div className="font-medium">{t.marketSurveyTitle}</div>
        <div className="mt-1 text-xs text-brand-600/80 animate-pulse">{t.marketSurveyLoading}</div>
      </div>
    );
  }

  if (!result) return null;

  if (!isMarketSurvey(result)) {
    const errMsg = t.marketSurveyErrors[result.error] ?? t.marketSurveyErrors.unknown;
    return (
      <div className="rounded-xl bg-amber-50 ring-1 ring-amber-100 p-4 text-sm">
        <div className="font-medium text-amber-800">{t.marketSurveyTitle}</div>
        <div className="mt-1 text-xs text-amber-700">{errMsg}</div>
        {result.detail && <div className="mt-1 text-[11px] text-amber-600/80 font-mono">{result.detail}</div>}
        <div className="mt-2 text-[11px] text-amber-700/80">{t.marketSurveyFallbackNote}</div>
      </div>
    );
  }

  if (result.repos.length === 0) {
    return (
      <div className="rounded-xl bg-brand-50 ring-1 ring-brand-100 p-4 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-medium text-brand-700">{t.marketSurveyTitle}</div>
          <span className="text-[11px] text-brand-600 font-mono">github.com</span>
        </div>
        <div className="mt-1 text-xs text-brand-700">
          {t.marketSurveyEmpty.replace("{q}", result.query)}
        </div>
        <div className="mt-2 text-[11px] text-brand-600/80">{t.marketSurveyEmptyHint}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-brand-50 to-white ring-1 ring-brand-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-brand-900 text-sm">{t.marketSurveyTitle}</div>
        <a
          href={`https://github.com/search?type=repositories&q=${encodeURIComponent(result.query)}&s=stars&o=desc`}
          target="_blank" rel="noreferrer"
          className="text-[11px] font-mono text-brand-700 hover:underline"
        >
          {t.marketSurveyOpenOnGithub} ↗
        </a>
      </div>
      <div className="mt-1 text-xs text-brand-700/90">
        {t.marketSurveyQuery}：<code className="bg-white/60 rounded px-1 py-0.5 font-mono text-[11px]">{result.query}</code>
      </div>
      {result.keyword_source === "llm" && (
        <div className="mt-1 text-[11px] text-brand-700 bg-white/70 ring-1 ring-brand-100 rounded-md px-2 py-1 leading-snug">
          {t.marketSurveyKeywordSourceLlm}
          {result.keyword_reason && (
            <span className="ml-1 text-brand-600/80">{result.keyword_reason}</span>
          )}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-brand-600/70">
        {t.marketSurveyTotal.replace("{n}", String(result.total_count)).replace("{shown}", String(result.repos.length))}
      </div>

      <ul className="mt-3 divide-y divide-brand-100">
        {result.repos.map((r) => (
          <li key={r.full_name} className="py-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <a href={r.html_url} target="_blank" rel="noreferrer"
                 className="font-mono text-sm text-brand-900 hover:underline truncate">
                {r.full_name}
              </a>
              <span className="text-xs text-amber-600">★ {r.stars.toLocaleString()}</span>
              <span className="text-[11px] text-slate-500">{relativeTime(r.pushed_at, lang)}</span>
              {r.language && <span className="text-[11px] text-slate-500">· {r.language}</span>}
            </div>
            {r.description && (
              <div className="mt-0.5 text-xs text-slate-600 line-clamp-2 leading-snug">
                {r.description}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 text-[11px] text-brand-700/80 leading-snug border-t border-brand-100 pt-2">
        {t.marketSurveyLlmNote}
      </div>
    </div>
  );
}
