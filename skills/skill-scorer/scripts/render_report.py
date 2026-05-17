"""SkillLens report renderer: JSON -> self-contained HTML / Markdown.

Visual language mirrors `web/` (Tailwind brand palette, glass cards, amber overlay
for finance, recharts-style radar). Output HTML is dependency-free: inline CSS,
inline SVG radar, light + dark mode, optimized @media print so users can simply
hit Cmd+P in the browser to export a polished PDF.

Public entry points:
    render_html(report: dict) -> str
    render_markdown(report: dict) -> str

Both functions accept the JSON produced by `score.py::score_skill()`.
"""
from __future__ import annotations

import html as _html
import math
from datetime import datetime, timezone
from typing import Any, Iterable


# ---------------- i18n labels ----------------

LABELS: dict[str, dict[str, str]] = {
    "zh": {
        "header_eyebrow": "claude · openclaw",
        "app_name": "SkillLens",
        "tagline": "Agent Skill 量化评测报告",
        "general_score": "通用版评分",
        "finance_score": "金融专家版评分",
        "of_100": "/ 100",
        "value_type_label": "Value type",
        "general_radar": "通用版雷达",
        "finance_radar": "金融专家雷达",
        "spec": "规范",
        "language": "语言",
        "skill_type": "skill 类型",
        "skill_type_atomic": "单一职责 atomic",
        "skill_type_pipeline": "多 skill 编排 pipeline",
        "skill_type_composite": "工具集合 composite",
        "skill_type_auto_suffix": "（自动识别）",
        "skill_type_user_suffix": "（用户指定）",
        "sub_skills_label": "子 SKILL.md",
        "sub_skills_count": "{count} 个子 skill",
        "engine": "评测引擎",
        "rubric_hash": "Rubric hash",
        "rubric_version": "Rubric 版本",
        "mode": "模式",
        "generated_at": "生成时间",
        "llm_complete": "LLM 评测完整",
        "llm_partial": "仅规则分预览",
        "scenario": "场景",
        "risk": "风险等级",
        "commercial": "商业成熟度",
        "pillars_general": "通用版 · 5 大支柱",
        "pillars_finance": "金融专家版 · 7 个支柱",
        "expand": "展开细则",
        "collapse": "收起",
        "evidence": "现状",
        "evaluates": "评什么",
        "fix": "改法",
        "evidence_source": "证据来源",
        "confidence": "置信度",
        "weight": "权重",
        "type_llm": "LLM 评估",
        "type_rule": "规则",
        "status_pass": "通过",
        "status_partial": "部分",
        "status_fail": "未过",
        "status_n_a": "未评",
        "status_not_applicable": "不适用",
        "not_applicable_hint": "已按 applies_to 过滤，不计分母",
        "not_applicable_evidence": "对当前 skill 类型 {skill_type} 不适用（仅适用于：{scope}）",
        "dim_not_applicable_hint": "本维度所有细则对当前 skill 类型不适用，权重已按比例分摊到其他维度。",
        "dim_na_fold_show": "查看 {n} 个对当前 skill 类型不适用的维度",
        "dim_na_fold_hint": "（不影响打分，仅供参考）",
        "suggestions_general": "通用 Top 改进建议",
        "suggestions_finance": "金融 Top 改进建议",
        "suggestions_intro": "按影响排序，建议从 Top 1 开始处理。",
        "suggestions_empty": "暂无明显短板，继续保持。",
        "suggestion_recommendation": "建议 / 改法",
        "suggestion_addresses": "对应内容",
        "severity_high": "高优先级",
        "severity_medium": "中优先级",
        "severity_low": "低优先级",
        "certificate_title": "Deep Review 证书",
        "certificate_verified": "已验证",
        "certificate_incomplete": "未完成",
        "certificate_workflow": "工作流",
        "certificate_engine": "引擎",
        "certificate_engine_version": "引擎版本",
        "certificate_rubric_hash": "通用 rubric hash",
        "certificate_domain_rubric_hash": "金融 rubric hash",
        "certificate_llm_results_hash": "LLM 结果 hash",
        "certificate_domain": "领域",
        "certificate_scenario": "场景",
        "footer_note": "由 SkillLens 官方 CLI 生成 · 浏览器 Cmd+P 可导出 PDF",
        "footer_print_hint": "本报告样式已优化打印效果。",
        "theme_toggle": "切换主题",
        "lang_toggle": "EN",
        "lang_toggle_aria": "切换为英文",
        "tab_finance": "金融专家版",
        "tab_general": "通用版",
        "tab_print_finance": "金融专家版报告",
        "tab_print_general": "通用版报告",
        "value_type_productivity": "生产力工具型",
        "value_type_decision_support": "决策辅助型",
        "value_type_learning": "学习成长型",
        "value_type_emotion_expression": "情绪表达型",
        "value_type_utility": "小工具型",
        "evidence_source_doc_check": "文档规则",
        "evidence_source_llm_judgment": "LLM 判断",
        "evidence_source_external_data": "外部数据",
        "confidence_high": "高",
        "confidence_medium": "中",
        "confidence_low": "低",
        "no_finance": "本次评测未启用金融专家版。",
        "skill_value": "选题价值",
        "rule_only_banner": "提示：当前是规则分预览，未运行 LLM 深度评测。完整 Deep Review 请运行带 --llm-results 的合并步骤。",
    },
    "en": {
        "header_eyebrow": "claude · openclaw",
        "app_name": "SkillLens",
        "tagline": "Agent Skill quantitative evaluation report",
        "general_score": "General Score",
        "finance_score": "Finance Expert Score",
        "of_100": "/ 100",
        "value_type_label": "Value type",
        "general_radar": "General Radar",
        "finance_radar": "Finance Radar",
        "spec": "Spec",
        "language": "Language",
        "skill_type": "Skill type",
        "skill_type_atomic": "atomic (single-purpose)",
        "skill_type_pipeline": "pipeline (multi-sub-skill)",
        "skill_type_composite": "composite (toolkit bundle)",
        "skill_type_auto_suffix": " (auto-detected)",
        "skill_type_user_suffix": " (user-specified)",
        "sub_skills_label": "Sub SKILL.md",
        "sub_skills_count": "{count} sub-skills",
        "engine": "Engine",
        "rubric_hash": "Rubric hash",
        "rubric_version": "Rubric version",
        "mode": "Mode",
        "generated_at": "Generated",
        "llm_complete": "LLM review complete",
        "llm_partial": "Rule-only preview",
        "scenario": "Scenario",
        "risk": "Risk level",
        "commercial": "Commercial readiness",
        "pillars_general": "General · 5 pillars",
        "pillars_finance": "Finance Expert · 7 pillars",
        "expand": "expand",
        "collapse": "hide",
        "evidence": "Evidence",
        "evaluates": "Evaluates",
        "fix": "Fix",
        "evidence_source": "Source",
        "confidence": "Confidence",
        "weight": "weight",
        "type_llm": "LLM scored",
        "type_rule": "Rule",
        "status_pass": "Pass",
        "status_partial": "Partial",
        "status_fail": "Fail",
        "status_n_a": "N/A",
        "status_not_applicable": "N/A by scope",
        "not_applicable_hint": "Filtered by applies_to; excluded from denominator",
        "not_applicable_evidence": "Not applicable for skill_type={skill_type} (scoped to: {scope})",
        "dim_not_applicable_hint": "All checks in this dimension are out of scope for the current skill type; its weight has been redistributed to the other dimensions.",
        "dim_na_fold_show": "Show {n} dimension(s) not applicable to this skill type",
        "dim_na_fold_hint": "(does not affect scoring; for reference only)",
        "suggestions_general": "General Top Improvements",
        "suggestions_finance": "Finance Top Improvements",
        "suggestions_intro": "Ordered by impact. Start from #1.",
        "suggestions_empty": "No major gaps detected.",
        "suggestion_recommendation": "Recommendation",
        "suggestion_addresses": "What this addresses",
        "severity_high": "High priority",
        "severity_medium": "Medium priority",
        "severity_low": "Low priority",
        "certificate_title": "Deep Review Certificate",
        "certificate_verified": "verified",
        "certificate_incomplete": "incomplete",
        "certificate_workflow": "Workflow",
        "certificate_engine": "Engine",
        "certificate_engine_version": "Engine version",
        "certificate_rubric_hash": "General rubric hash",
        "certificate_domain_rubric_hash": "Finance rubric hash",
        "certificate_llm_results_hash": "LLM results hash",
        "certificate_domain": "Domain",
        "certificate_scenario": "Scenario",
        "footer_note": "Generated by the official SkillLens CLI · Press Cmd+P in browser to export PDF",
        "footer_print_hint": "Print stylesheet is optimized for PDF export.",
        "theme_toggle": "Toggle theme",
        "lang_toggle": "中",
        "lang_toggle_aria": "Switch to Chinese",
        "tab_finance": "Finance Expert",
        "tab_general": "General",
        "tab_print_finance": "Finance Expert Report",
        "tab_print_general": "General Report",
        "value_type_productivity": "Productivity",
        "value_type_decision_support": "Decision support",
        "value_type_learning": "Learning",
        "value_type_emotion_expression": "Emotion / expression",
        "value_type_utility": "Utility",
        "evidence_source_doc_check": "Doc rule",
        "evidence_source_llm_judgment": "LLM judgment",
        "evidence_source_external_data": "External data",
        "confidence_high": "high",
        "confidence_medium": "medium",
        "confidence_low": "low",
        "no_finance": "Finance Expert overlay not enabled in this run.",
        "skill_value": "Skill Value",
        "rule_only_banner": "Note: this is a rule-only preview; LLM Deep Review has not run. Use the --llm-results merge step for full Deep Review.",
    },
}


# ---------------- pillar / status / grade tones ----------------

# Map rubric pillar id -> visual tone reused from web PillarSection.tsx.
# Each tone defines: ring color, gradient stops, accent text, mini pill bg.
PILLAR_TONES: dict[str, dict[str, str]] = {
    "business_value": {
        "ring": "rgba(248, 220, 138, 0.7)",
        "gradient_from": "rgba(255, 248, 231, 0.92)",
        "accent": "#78350f",
        "pill_bg": "rgba(255, 239, 194, 0.85)",
        "bar_from": "#92400e",
        "bar_to": "#f8dc8a",
    },
    "market": {
        "ring": "rgba(254, 215, 170, 0.75)",
        "gradient_from": "rgba(255, 247, 237, 0.92)",
        "accent": "#c2410c",
        "pill_bg": "rgba(255, 237, 213, 0.85)",
        "bar_from": "#f97316",
        "bar_to": "#fde68a",
    },
    "runtime_cost": {
        "ring": "rgba(217, 249, 157, 0.75)",
        "gradient_from": "rgba(247, 254, 231, 0.92)",
        "accent": "#4d7c0f",
        "pill_bg": "rgba(236, 252, 203, 0.85)",
        "bar_from": "#65a30d",
        "bar_to": "#d9f99d",
    },
    "reliability": {
        "ring": "rgba(253, 230, 138, 0.85)",
        "gradient_from": "rgba(255, 251, 235, 0.92)",
        "accent": "#b45309",
        "pill_bg": "rgba(254, 243, 199, 0.85)",
        "bar_from": "#f59e0b",
        "bar_to": "#fde68a",
    },
    "writeup": {
        "ring": "rgba(231, 229, 228, 0.85)",
        "gradient_from": "rgba(250, 250, 249, 0.92)",
        "accent": "#44403c",
        "pill_bg": "rgba(245, 245, 244, 0.85)",
        "bar_from": "#78716c",
        "bar_to": "#e7e5e4",
    },
}

DEFAULT_PILLAR_TONE = PILLAR_TONES["writeup"]

# Finance pillars all share the amber tone (matches web FinanceExpertPanel).
FINANCE_PILLAR_TONE = {
    "ring": "rgba(253, 230, 138, 0.9)",
    "gradient_from": "rgba(255, 251, 235, 0.95)",
    "accent": "#b45309",
    "pill_bg": "rgba(254, 243, 199, 0.9)",
    "bar_from": "#f59e0b",
    "bar_to": "#fef08a",
}

STATUS_TONES: dict[str, dict[str, str]] = {
    "pass": {"bg": "#ecfdf5", "fg": "#047857", "ring": "#a7f3d0", "icon": "✓"},
    "partial": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a", "icon": "~"},
    "fail": {"bg": "#fff1f2", "fg": "#be123c", "ring": "#fecdd3", "icon": "✕"},
    "n_a": {"bg": "#fafaf9", "fg": "#78716c", "ring": "#e7e5e4", "icon": "·"},
    # not_applicable = explicitly filtered by applies_to (e.g. pipeline-class
    # skill skips checks scoped to atomic only). Different from "n_a" which
    # means "would have been LLM-evaluated but the run was rule-only."
    "not_applicable": {"bg": "#f1f5f9", "fg": "#64748b", "ring": "#cbd5e1", "icon": "—"},
}

GRADE_TONES: dict[str, dict[str, str]] = {
    "S": {"bg": "#ecfdf5", "fg": "#047857", "ring": "#a7f3d0"},
    "A": {"bg": "#ecfdf5", "fg": "#059669", "ring": "#bbf7d0"},
    "B": {"bg": "#eff6ff", "fg": "#1d4ed8", "ring": "#bfdbfe"},
    "C": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a"},
    "D": {"bg": "#fff1f2", "fg": "#be123c", "ring": "#fecdd3"},
    # finance grades
    "Expert-Ready": {"bg": "#ecfdf5", "fg": "#047857", "ring": "#a7f3d0"},
    "Strong": {"bg": "#ecfdf5", "fg": "#059669", "ring": "#bbf7d0"},
    "Promising": {"bg": "#eff6ff", "fg": "#1d4ed8", "ring": "#bfdbfe"},
    "Needs Review": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a"},
    "High Risk": {"bg": "#fff1f2", "fg": "#be123c", "ring": "#fecdd3"},
}

RISK_TONES: dict[str, dict[str, str]] = {
    "low": {"bg": "#ecfdf5", "fg": "#047857", "ring": "#a7f3d0", "label_zh": "低", "label_en": "Low"},
    "medium": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a", "label_zh": "中", "label_en": "Medium"},
    "high": {"bg": "#fff7ed", "fg": "#c2410c", "ring": "#fed7aa", "label_zh": "高", "label_en": "High"},
    "critical": {"bg": "#fff1f2", "fg": "#be123c", "ring": "#fecdd3", "label_zh": "极高", "label_en": "Critical"},
}

READINESS_TONES: dict[str, dict[str, str]] = {
    "paid-ready": {"bg": "#ecfdf5", "fg": "#047857", "ring": "#a7f3d0"},
    "pilot-ready": {"bg": "#eff6ff", "fg": "#1d4ed8", "ring": "#bfdbfe"},
    "internal-preview": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a"},
    "not-ready": {"bg": "#fafaf9", "fg": "#78716c", "ring": "#e7e5e4"},
}

SEVERITY_TONES: dict[str, dict[str, str]] = {
    "high": {"bg": "#fff1f2", "fg": "#be123c", "ring": "#fecdd3"},
    "medium": {"bg": "#fffbeb", "fg": "#b45309", "ring": "#fde68a"},
    "low": {"bg": "#eff6ff", "fg": "#1d4ed8", "ring": "#bfdbfe"},
}


# ---------------- HTML CSS ----------------

CSS = r"""
:root {
  --bg-page: #fffaf0;
  --bg-page-radial-1: rgba(255, 232, 168, 0.55);
  --bg-page-radial-2: rgba(255, 245, 214, 0.9);
  --bg-page-from: #fff8e7;
  --bg-page-mid: #fffaf0;
  --bg-page-to: #fffef8;
  --fg: #4b2a0c;
  --fg-muted: #7c6b5a;
  --fg-subtle: #a89580;
  --card-bg: rgba(255, 253, 246, 0.78);
  --card-border: rgba(210, 135, 24, 0.16);
  --card-shadow: 0 18px 48px rgba(146, 91, 16, 0.08);
  --kpi-from: #fff8e7;
  --kpi-to: #ffffff;
  --kpi-finance-from: #fffbeb;
  --kpi-finance-to: #ffffff;
  --brand-50: #fff8e7;
  --brand-100: #ffefc2;
  --brand-200: #f8dc8a;
  --brand-500: #b45309;
  --brand-600: #92400e;
  --brand-700: #78350f;
  --brand-900: #4b2a0c;
  --amber-50: #fffbeb;
  --amber-100: #fef3c7;
  --amber-200: #fde68a;
  --amber-500: #f59e0b;
  --amber-700: #b45309;
  --slate-400: #94a3b8;
  --slate-500: #64748b;
  --slate-600: #475569;
  --slate-700: #334155;
  --code-bg: rgba(255, 255, 255, 0.7);
  --code-border: rgba(180, 83, 9, 0.15);
}

[data-theme="dark"] {
  --bg-page: #1a120b;
  --bg-page-radial-1: rgba(146, 91, 16, 0.35);
  --bg-page-radial-2: rgba(120, 53, 15, 0.35);
  --bg-page-from: #1a120b;
  --bg-page-mid: #211611;
  --bg-page-to: #261a13;
  --fg: #fdf2d8;
  --fg-muted: #c8b291;
  --fg-subtle: #8b7c66;
  --card-bg: rgba(43, 28, 17, 0.7);
  --card-border: rgba(248, 220, 138, 0.18);
  --card-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  --kpi-from: rgba(120, 53, 15, 0.45);
  --kpi-to: rgba(43, 28, 17, 0.6);
  --kpi-finance-from: rgba(180, 83, 9, 0.4);
  --kpi-finance-to: rgba(43, 28, 17, 0.6);
  --slate-400: #cbd5e1;
  --slate-500: #d4dceb;
  --slate-600: #e2e8f0;
  --slate-700: #f1f5f9;
  --code-bg: rgba(255, 255, 255, 0.05);
  --code-border: rgba(248, 220, 138, 0.18);
}

* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica", "Arial", sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
body {
  background:
    radial-gradient(circle at top left, var(--bg-page-radial-1), transparent 34rem),
    radial-gradient(circle at top right, var(--bg-page-radial-2), transparent 30rem),
    linear-gradient(180deg, var(--bg-page-from) 0%, var(--bg-page-mid) 46%, var(--bg-page-to) 100%);
}

main.report {
  max-width: 1200px;
  margin: 0 auto;
  padding: 56px 28px 80px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--brand-700);
  background: rgba(255, 239, 194, 0.85);
  border: 1px solid rgba(248, 220, 138, 0.7);
  border-radius: 999px;
  padding: 4px 12px;
  letter-spacing: 0.02em;
}

h1.title {
  margin: 14px 0 8px;
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--brand-900);
  line-height: 1.1;
}
[data-theme="dark"] h1.title { color: #fdf2d8; }

p.tagline {
  color: var(--fg-muted);
  max-width: 640px;
  margin: 0;
  font-size: 15px;
}

header.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.theme-toggle {
  background: var(--card-bg);
  color: var(--brand-700);
  border: 1px solid var(--card-border);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  backdrop-filter: saturate(150%) blur(14px);
}
.theme-toggle:hover { background: rgba(255, 255, 255, 0.9); }
[data-theme="dark"] .theme-toggle { color: var(--brand-200); }
[data-theme="dark"] .theme-toggle:hover { background: rgba(43, 28, 17, 0.9); }
.lang-toggle {
  background: var(--card-bg);
  color: var(--brand-700);
  border: 1px solid var(--card-border);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 600;
  letter-spacing: 0.4px;
  min-width: 44px;
  backdrop-filter: saturate(150%) blur(14px);
}
.lang-toggle:hover { background: rgba(255, 255, 255, 0.9); }
[data-theme="dark"] .lang-toggle { color: var(--brand-200); }
[data-theme="dark"] .lang-toggle:hover { background: rgba(43, 28, 17, 0.9); }

/* Language pane: show one of two pre-rendered language versions */
.lang-pane[data-lang-pane="en"] { display: none; }
html[data-lang="en"] .lang-pane[data-lang-pane="en"] { display: block; }
html[data-lang="en"] .lang-pane[data-lang-pane="zh"] { display: none; }

.glass {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
  backdrop-filter: saturate(150%) blur(14px);
}

section { margin-top: 28px; }
section.dashboard {
  display: grid;
  grid-template-columns: 1.1fr 1.4fr;
  gap: 20px;
  align-items: start; /* let columns size to their own content; long sub-skills no longer stretch the radar column */
}
@media (max-width: 960px) { section.dashboard { grid-template-columns: 1fr; } }

.kpi-stack { display: flex; flex-direction: column; gap: 14px; }

.kpi {
  border-radius: 16px;
  padding: 22px;
  border: 1px solid var(--card-border);
  background: linear-gradient(135deg, var(--kpi-from), var(--kpi-to));
  box-shadow: var(--card-shadow);
}
.kpi.finance {
  background: linear-gradient(135deg, var(--kpi-finance-from), var(--kpi-finance-to));
  border-color: rgba(245, 158, 11, 0.35);
}
.kpi-label {
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: var(--brand-700);
}
.kpi.finance .kpi-label { color: var(--amber-700); }
.kpi-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 12px; }
.kpi-score {
  font-size: 52px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
  color: var(--brand-900);
}
[data-theme="dark"] .kpi-score { color: #fff5d8; }
.kpi-of { color: var(--slate-400); font-size: 16px; margin-left: 6px; }

.grade-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 12px;
  padding: 6px 12px;
  border: 1px solid;
  background: white;
}
[data-theme="dark"] .grade-pill { background: rgba(43, 28, 17, 0.85); }

.kpi-subtitle { color: var(--fg-muted); font-size: 13px; margin-top: 8px; line-height: 1.55; }
.kpi-badge {
  display: inline-flex;
  margin-top: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid;
}

.meta-card { padding: 16px; border-radius: 16px; }
.meta-card dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 12px; }
.meta-card dt { color: var(--fg-muted); }
.meta-card dd { margin: 0; color: var(--slate-700); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11.5px; }
.meta-card .value-type {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 239, 194, 0.6);
  border: 1px solid rgba(248, 220, 138, 0.7);
  color: var(--brand-900);
  font-size: 12.5px;
}
[data-theme="dark"] .meta-card .value-type { background: rgba(120, 53, 15, 0.35); color: #fdf2d8; }

.sub-skills {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(238, 234, 224, 0.55);
  border: 1px solid rgba(180, 167, 130, 0.35);
  /* Cap height so 100+ sub-skills never stretch the column past the radar; the
     inner list scrolls instead. The +20px buffer accounts for header + padding. */
  display: flex;
  flex-direction: column;
  min-height: 0;
}
[data-theme="dark"] .sub-skills { background: rgba(0, 0, 0, 0.22); border-color: rgba(248, 220, 138, 0.18); }
.sub-skills-head {
  display: flex; align-items: baseline; justify-content: space-between;
  font-size: 12px; color: var(--fg-muted); margin-bottom: 6px;
  flex-shrink: 0;
}
.sub-skills-head strong { color: var(--brand-900); font-size: 12.5px; }
[data-theme="dark"] .sub-skills-head strong { color: #fdf2d8; }
.sub-skills-count { font-size: 11px; color: var(--fg-subtle); }

.sub-skills-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 11.5px;
  line-height: 1.45;
  /* Inner scroll: kicks in once the list exceeds ~10 items at the default
     single-column density, or ~20 items when grid-mode (data-many) is on. */
  max-height: 320px;
  overflow-y: auto;
  /* Custom thin scrollbar to keep the 11px-typography vibe */
  scrollbar-width: thin;
}
.sub-skills-list::-webkit-scrollbar { width: 6px; }
.sub-skills-list::-webkit-scrollbar-thumb { background: rgba(146, 91, 16, 0.25); border-radius: 4px; }
.sub-skills-list::-webkit-scrollbar-thumb:hover { background: rgba(146, 91, 16, 0.45); }
.sub-skills-list[data-many="true"] {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
  max-height: 360px;
}
/* Wide variant: full-width banner under the dashboard. Reclaims the empty
   space below the radar by using 3–4 columns instead of squeezing into the
   left column. */
.sub-skills-wide {
  margin: 18px 0 4px;
  padding: 14px 18px;
  border-radius: 16px;
}
.sub-skills-wide .sub-skills-head { font-size: 13px; }
.sub-skills-wide .sub-skills-head strong { font-size: 14px; }
.sub-skills-list[data-variant="wide"] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 14px;
  max-height: 420px;
}
@media (min-width: 1280px) {
  .sub-skills-list[data-variant="wide"] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 720px) {
  .sub-skills-list[data-variant="wide"] {
    grid-template-columns: 1fr;
  }
}
.sub-skills-list li {
  position: relative;
  padding: 5px 8px 5px 28px;
  border-radius: 8px;
  counter-increment: sub-skill;
  min-width: 0;
}
.sub-skills-list li::before {
  content: counter(sub-skill);
  position: absolute;
  left: 8px; top: 5px;
  font-size: 10px;
  color: var(--fg-subtle);
  font-variant-numeric: tabular-nums;
}
.sub-skills-list { counter-reset: sub-skill; }
.sub-skills-list li:hover { background: rgba(255, 255, 255, 0.55); }
[data-theme="dark"] .sub-skills-list li:hover { background: rgba(255, 245, 216, 0.06); }
/* Compact line: path and name share one row; description on a second clipped row */
.sub-skill-row {
  display: flex; align-items: baseline; gap: 8px;
  min-width: 0;
}
.sub-skill-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px; color: var(--brand-900);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 1; min-width: 0;
}
[data-theme="dark"] .sub-skill-path { color: #f3e0b1; }
.sub-skill-name {
  font-weight: 600;
  color: var(--slate-700);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex-shrink: 0; max-width: 50%;
}
[data-theme="dark"] .sub-skill-name { color: #f0d997; }
.sub-skill-desc {
  color: var(--fg-subtle);
  font-size: 11px;
  margin-top: 1px;
  /* Single-line ellipsis; full text available via hover tooltip (title attr) */
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.radar-card { padding: 18px; }
.radar-card .radar-head { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 8px; }
.radar-card h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--brand-900); }
.radar-card.finance h3 { color: var(--amber-700); }
.radar-card .pill-count { font-size: 11px; color: var(--fg-subtle); }
.radar-svg { width: 100%; height: 320px; display: block; }

.banner {
  border-radius: 14px;
  padding: 14px 18px;
  margin-top: 24px;
  font-size: 13px;
}
.banner.amber {
  background: rgba(254, 243, 199, 0.7);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--amber-700);
}

.tabs {
  margin-top: 28px;
  display: flex;
  gap: 8px;
  padding: 8px;
  flex-wrap: wrap;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
  backdrop-filter: saturate(150%) blur(14px);
}
.tab-btn {
  cursor: pointer;
  border-radius: 12px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--slate-600);
  font-family: inherit;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.tab-btn:hover { background: rgba(255, 255, 255, 0.65); }
[data-theme="dark"] .tab-btn { color: #d6c298; }
[data-theme="dark"] .tab-btn:hover { background: rgba(255, 255, 255, 0.06); }
.tab-btn.active {
  color: white;
  box-shadow: 0 4px 14px rgba(146, 91, 16, 0.22);
}
.tab-btn.active.finance {
  background: var(--amber-500);
  border-color: var(--amber-500);
}
.tab-btn.active.general {
  background: var(--brand-500);
  border-color: var(--brand-500);
}
.tab-content[hidden] { display: none; }
.tab-print-heading { display: none; }
@media print {
  .tabs { display: none !important; }
  .tab-content[hidden] { display: block !important; }
  .tab-content { page-break-before: always; }
  .tab-content:first-of-type { page-break-before: auto; }
  .tab-print-heading {
    display: block;
    margin: 24px 0 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e7e5e4;
    font-size: 22px;
    font-weight: 700;
    color: #1a120b;
  }
}

.section-title {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin: 8px 4px 16px;
}
.section-title h2 { margin: 0; font-size: 20px; color: var(--brand-900); font-weight: 700; }
[data-theme="dark"] .section-title h2 { color: #fff5d8; }
.section-title .meta { font-size: 12px; color: var(--fg-subtle); }

.pillar-grid { display: flex; flex-direction: column; gap: 14px; }

.pillar {
  border-radius: 16px;
  padding: 22px;
  border: 1px solid var(--pillar-ring, var(--card-border));
  background: linear-gradient(135deg, var(--pillar-from, var(--card-bg)), white);
  box-shadow: var(--card-shadow);
  break-inside: avoid;
  page-break-inside: avoid;
}
[data-theme="dark"] .pillar {
  background: linear-gradient(135deg, rgba(67, 41, 18, 0.78), rgba(38, 26, 19, 0.85));
  border-color: var(--card-border);
}
[data-theme="dark"] .pillar .pillar-tagline { color: #c8b291; }
[data-theme="dark"] .pillar .pillar-progress { background: rgba(0, 0, 0, 0.4); }
[data-theme="dark"] .pillar details.dim { background: rgba(0, 0, 0, 0.28); border-color: rgba(248, 220, 138, 0.12); }
[data-theme="dark"] .pillar details.dim .check { background: rgba(255, 255, 255, 0.04); border-color: rgba(248, 220, 138, 0.12); }
.pillar-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.pillar-name { font-size: 18px; font-weight: 700; color: var(--pillar-accent, var(--brand-700)); margin: 0 0 4px; }
.pillar-tagline { font-size: 13px; color: var(--fg-muted); margin: 6px 0 0; max-width: 640px; }
.pillar-score-block { text-align: right; min-width: 110px; }
.pillar-score { font-size: 30px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--pillar-accent, var(--brand-700)); }
.pillar-score-of { font-size: 14px; color: var(--fg-subtle); font-weight: 400; margin-left: 4px; }
.pillar-pct { font-size: 11px; color: var(--fg-subtle); }
.pillar-progress {
  margin-top: 14px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--card-border);
  overflow: hidden;
}
[data-theme="dark"] .pillar-progress { background: rgba(0, 0, 0, 0.25); }
.pillar-progress > div {
  height: 100%;
  background: linear-gradient(90deg, var(--bar-from, var(--brand-600)), var(--bar-to, var(--brand-200)));
}

.pillar-pills { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
.tag {
  font-size: 10.5px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 9px;
  background: var(--pillar-pill-bg, rgba(255, 239, 194, 0.85));
  color: var(--pillar-accent, var(--brand-700));
}
.muted-tag { font-size: 11px; color: var(--fg-subtle); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

.dim-list { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
details.dim {
  border-radius: 12px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.65);
  padding: 12px 14px;
}
[data-theme="dark"] details.dim { background: rgba(0, 0, 0, 0.18); }
details.dim summary { display: flex; align-items: center; justify-content: space-between; cursor: pointer; gap: 12px; list-style: none; }
details.dim summary::-webkit-details-marker { display: none; }
.dim-name { font-size: 14.5px; font-weight: 600; color: var(--slate-700); }
[data-theme="dark"] .dim-name { color: #f5e8c6; }
.dim-id { font-size: 10.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg-subtle); }
.dim-tagline { font-size: 12.5px; color: var(--fg-muted); margin-top: 6px; line-height: 1.55; }
.dim-score { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--slate-700); }
[data-theme="dark"] .dim-score { color: #f5e8c6; }
.dim-score-of { font-size: 12px; color: var(--fg-subtle); font-weight: 400; margin-left: 3px; }
.dim-progress {
  margin-top: 10px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 239, 194, 0.5);
  overflow: hidden;
}
.dim-progress > div { height: 100%; background: linear-gradient(90deg, var(--brand-600), #fde68a); }

/* Dim entirely filtered by applies_to (notApplicable=true) — visually softened. */
details.dim[data-na="true"] {
  opacity: 0.62;
  border-style: dashed;
  background: rgba(241, 245, 249, 0.55);
}
[data-theme="dark"] details.dim[data-na="true"] { background: rgba(255, 255, 255, 0.025); }
.dim-score.na { color: var(--fg-subtle); font-variant-numeric: normal; }
.dim-score.na s { color: var(--fg-subtle); }
.dim-na-pill {
  display: inline-flex; align-items: center;
  font-size: 10px; font-weight: 600;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(100, 116, 139, 0.12);
  color: var(--fg-subtle);
  border: 1px solid rgba(100, 116, 139, 0.22);
}
.dim-na-explain {
  margin-top: 4px;
  font-size: 11px;
  color: var(--fg-subtle);
  font-style: italic;
}

/* Pillar-level "show N skipped dims" footer fold. Default: collapsed so the
 * dashboard isn't cluttered with N/A cards; expanding reveals them for full
 * audit transparency. */
details.dim-na-fold {
  margin-top: 16px;
  border-top: 1px dashed var(--border);
  padding-top: 12px;
}
details.dim-na-fold > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg-subtle);
  user-select: none;
  padding: 4px 0;
}
details.dim-na-fold > summary::-webkit-details-marker { display: none; }
details.dim-na-fold > summary::before {
  content: "▸";
  display: inline-block;
  transition: transform 0.15s ease;
  color: var(--fg-subtle);
}
details.dim-na-fold[open] > summary::before { transform: rotate(90deg); }
.dim-na-fold-label {
  font-weight: 500;
  color: var(--fg);
}
.dim-na-fold-hint {
  color: var(--fg-subtle);
  font-size: 11px;
}
details.dim-na-fold > .dim-list {
  margin-top: 12px;
  padding-top: 4px;
}

.check-list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; padding-left: 0; list-style: none; }
.check {
  border-radius: 10px;
  border: 1px solid var(--card-border);
  background: rgba(255, 255, 255, 0.6);
  padding: 10px 12px;
}
[data-theme="dark"] .check { background: rgba(255, 255, 255, 0.04); }
/* applies_to filter: visually de-emphasize so it's clearly "not counted" */
.check[data-status="not_applicable"] {
  opacity: 0.62;
  border-style: dashed;
  background: rgba(241, 245, 249, 0.5);
}
[data-theme="dark"] .check[data-status="not_applicable"] { background: rgba(255, 255, 255, 0.025); }
.check-na-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--fg-subtle);
  font-style: italic;
}
.check-head { display: flex; gap: 10px; align-items: flex-start; }
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600;
  border-radius: 6px; padding: 3px 8px;
  border: 1px solid;
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.check-body { flex: 1; min-width: 0; }
.check-title { font-size: 13.5px; font-weight: 500; color: var(--slate-700); }
[data-theme="dark"] .check-title { color: #f3e0b1; }
.check-subtitle {
  font-size: 11.5px;
  color: var(--fg-subtle);
  margin-top: 2px;
  line-height: 1.5;
  font-style: italic;
}
[data-theme="dark"] .check-subtitle { color: #b8a37a; }
.check-evidence { font-size: 12px; color: var(--fg-muted); margin-top: 4px; line-height: 1.55; }
.check-evidence .label, .check-fix .label, .check-evaluates .label {
  color: var(--fg-subtle); font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 6px;
}
.check-fix {
  margin-top: 6px;
  font-size: 12px;
  background: rgba(255, 239, 194, 0.55);
  border: 1px solid rgba(248, 220, 138, 0.65);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--slate-700);
  line-height: 1.55;
}
[data-theme="dark"] .check-fix { background: rgba(120, 53, 15, 0.32); color: #fbe7b8; }
.check-fix .label { color: var(--brand-600); }
[data-theme="dark"] .check-fix .label { color: var(--brand-200); }
.check-meta {
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  margin-top: 8px; font-size: 10.5px; color: var(--fg-subtle);
}
.check-meta .chip {
  background: rgba(255, 239, 194, 0.5);
  border: 1px solid rgba(248, 220, 138, 0.55);
  border-radius: 6px;
  padding: 1.5px 7px;
}
.check-meta .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
[data-theme="dark"] .check-meta .chip { background: rgba(120, 53, 15, 0.4); }

.suggestions {
  display: flex; flex-direction: column; gap: 12px;
  margin-top: 16px;
}
article.suggestion {
  border-radius: 14px;
  border: 1px solid;
  padding: 16px;
  position: relative;
}
.suggestion .num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  font-weight: 700; font-size: 13px; flex-shrink: 0;
  color: white;
}
.suggestion .row { display: flex; gap: 12px; align-items: flex-start; }
.suggestion .body { flex: 1; min-width: 0; }
.suggestion .eyebrow-text { font-size: 10.5px; font-weight: 600; color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.06em; }
.suggestion h4 {
  margin: 4px 0 0;
  font-size: 15px; font-weight: 600; color: var(--brand-900); line-height: 1.35;
}
[data-theme="dark"] .suggestion h4 { color: #fdf2d8; }
.suggestion .severity-pill {
  font-size: 11px; padding: 3px 9px; border-radius: 999px; font-weight: 600;
  border: 1px solid;
}
[data-theme="dark"] article.suggestion {
  background: rgba(67, 41, 18, 0.7) !important;
  border-color: rgba(248, 220, 138, 0.18) !important;
}
[data-theme="dark"] article.suggestion h4 { color: #fff5d8; }
[data-theme="dark"] .suggestion .what-card { background: rgba(0, 0, 0, 0.25); }
[data-theme="dark"] .suggestion .severity-pill { background: rgba(120, 53, 15, 0.5) !important; color: #fde68a !important; border-color: rgba(248, 220, 138, 0.35) !important; }
.suggestion .meta-row {
  margin-top: 8px;
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
  font-size: 11px; color: var(--fg-subtle);
}
.suggestion .meta-row .pillar-tag {
  background: rgba(255, 239, 194, 0.6);
  border: 1px solid var(--card-border);
  padding: 2px 8px; border-radius: 999px;
  font-weight: 600; color: var(--brand-700);
}
[data-theme="dark"] .suggestion .meta-row .pillar-tag { color: var(--brand-200); background: rgba(120, 53, 15, 0.4); }
.suggestion .what-card {
  margin-top: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--card-border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--fg-muted);
}
[data-theme="dark"] .suggestion .what-card { background: rgba(0, 0, 0, 0.15); }
.suggestion .what-card .label { color: var(--fg-subtle); font-weight: 600; }
.suggestion .why-line { margin-top: 8px; font-size: 12px; color: var(--fg-muted); }
.suggestion .why-line .label { color: var(--fg-subtle); font-weight: 600; }

.finance-block {
  margin-top: 32px;
  background: linear-gradient(135deg, rgba(255, 251, 235, 0.92), rgba(255, 247, 237, 0.7));
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 18px;
  padding: 26px;
  box-shadow: var(--card-shadow);
}
[data-theme="dark"] .finance-block {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.35), rgba(43, 28, 17, 0.6));
}
.finance-block h2 { margin: 0; color: var(--amber-700); font-size: 22px; font-weight: 700; }
.finance-block .scenario { margin-top: 4px; font-size: 14px; color: var(--fg-muted); }
.finance-pills {
  display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;
}
.finance-pill {
  display: inline-flex; gap: 6px; align-items: center;
  border-radius: 999px;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid;
}
[data-theme="dark"] .finance-block {
  background: linear-gradient(135deg, rgba(120, 53, 15, 0.55), rgba(43, 28, 17, 0.85));
  border-color: rgba(245, 158, 11, 0.3);
}
[data-theme="dark"] .finance-block h2 { color: #fde68a; }
[data-theme="dark"] .finance-block .scenario { color: #d6b373; }

.finance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.finance-pillar-mini {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(245, 158, 11, 0.25);
  padding: 12px;
}
[data-theme="dark"] .finance-pillar-mini { background: rgba(0, 0, 0, 0.2); }
.finance-pillar-mini .name { font-size: 13px; font-weight: 600; color: var(--brand-900); }
[data-theme="dark"] .finance-pillar-mini .name { color: #fdf2d8; }
.finance-pillar-mini .score { margin-top: 4px; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.finance-pillar-mini .of { font-size: 11px; color: var(--fg-subtle); font-weight: 400; }

.finance-pillars { margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }

.cert {
  margin-top: 32px;
  border-radius: 16px;
  padding: 22px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
}
.cert-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cert h2 { margin: 0; font-size: 18px; color: var(--brand-900); }
[data-theme="dark"] .cert h2 { color: #fdf2d8; }
.cert .verified-pill {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 700;
  background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;
}
.cert .verified-pill.incomplete {
  background: #fffbeb; color: #b45309; border-color: #fde68a;
}
.cert dl { margin: 16px 0 0; display: grid; grid-template-columns: 200px 1fr; gap: 8px 16px; font-size: 13px; }
.cert dt { color: var(--fg-muted); }
.cert dd { margin: 0; color: var(--slate-700); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; font-size: 12px; }
[data-theme="dark"] .cert dd { color: #f3e0b1; }

footer.app-footer {
  margin-top: 56px; padding-top: 24px;
  border-top: 1px solid var(--card-border);
  font-size: 12px;
  color: var(--fg-subtle);
  display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap;
}

.no-print { }

@media print {
  body {
    background: white;
    color: #1a120b;
  }
  .no-print { display: none !important; }
  main.report { padding: 0; max-width: none; }
  .pillar, .finance-block, .cert, .glass, .kpi { box-shadow: none; }
  details.dim, details.cert-details { page-break-inside: avoid; }
  details.dim:not([open]) { /* keep collapsed details visible in print */ }
  details.dim { open: ""; }
  details:not([open]) > *:not(summary) { display: block; }
  .pillar { page-break-inside: avoid; }
  article.suggestion { page-break-inside: avoid; }
  .finance-pillar-mini { page-break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}
"""


JS_TOGGLE = r"""
(function() {
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('skilllens-theme', t); } catch (e) {}
  }
  function initialTheme() {
    try {
      var saved = localStorage.getItem('skilllens-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }
  function applyLang(l) {
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('data-lang', l);
    try { localStorage.setItem('skilllens-lang', l); } catch (e) {}
    var titleEl = document.querySelector('title');
    if (titleEl) {
      var t = titleEl.dataset['title' + l.charAt(0).toUpperCase() + l.slice(1)];
      if (t) titleEl.textContent = t;
    }
  }
  function initialLang() {
    // URL ?lang=zh|en overrides any saved choice (handy for testing / sharing).
    try {
      var url = new URL(window.location.href);
      var q = url.searchParams.get('lang');
      if (q === 'zh' || q === 'en') return q;
    } catch (e) {}
    try {
      var saved = localStorage.getItem('skilllens-lang');
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (e) {}
    var def = document.documentElement.getAttribute('data-default-lang');
    return (def === 'en') ? 'en' : 'zh';
  }
  applyTheme(initialTheme());
  applyLang(initialLang());
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.theme-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cur = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      });
    });
    document.querySelectorAll('.lang-toggle').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var cur = document.documentElement.getAttribute('data-lang') || 'zh';
        applyLang(cur === 'zh' ? 'en' : 'zh');
      });
    });
    var tabBtns = document.querySelectorAll('.tab-btn');
    if (tabBtns.length) {
      tabBtns.forEach(function(b) {
        b.addEventListener('click', function() {
          var target = b.dataset.target;
          tabBtns.forEach(function(x) {
            var on = x.dataset.target === target;
            x.classList.toggle('active', on);
            x.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          document.querySelectorAll('.tab-content').forEach(function(tc) {
            tc.hidden = tc.dataset.tab !== target;
          });
        });
      });
    }
    // Auto-expand all dimension/cert details before printing so PDF is complete
    window.addEventListener('beforeprint', function() {
      document.querySelectorAll('details').forEach(function(d) { d.dataset.printPrev = d.open ? '1' : '0'; d.open = true; });
    });
    window.addEventListener('afterprint', function() {
      document.querySelectorAll('details').forEach(function(d) { d.open = d.dataset.printPrev === '1'; });
    });
  });
})();
"""


# ---------------- helpers ----------------

def esc(value: Any) -> str:
    if value is None:
        return ""
    return _html.escape(str(value), quote=True)


def fmt_score(value: Any, digits: int = 1) -> str:
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def pick_lang(report: dict) -> str:
    return "zh" if report.get("language") == "zh" else "en"


def pick_bilingual(obj: dict, base: str, lang: str) -> str:
    """Return ``obj[base_lang]`` if present, else legacy ``obj[base]``, else ''.

    Bilingual schema (≥ 0.5.0): score.py emits ``evidence_zh`` + ``evidence_en``
    (and ``fix_zh`` + ``fix_en``, ``why_zh`` + ``why_en``, ``how_zh`` + ``how_en``,
    ``title_zh`` + ``title_en``, ``value_type_reason_zh`` + ``value_type_reason_en``).
    Older single-language JSON only has the bare field — this helper keeps both
    formats rendering.
    """
    if not isinstance(obj, dict):
        return ""
    val = obj.get(f"{base}_{lang}")
    if val:
        return val
    return obj.get(base) or ""


def label(L: dict, key: str, fallback: str = "") -> str:
    return L.get(key, fallback or key)


def grade_tone(grade: str) -> dict[str, str]:
    return GRADE_TONES.get(grade, GRADE_TONES["D"])


def status_tone(status: str) -> dict[str, str]:
    return STATUS_TONES.get(status, STATUS_TONES["n_a"])


def pillar_tone(pillar_id: str) -> dict[str, str]:
    return PILLAR_TONES.get(pillar_id, DEFAULT_PILLAR_TONE)


def pct(score: Any, weight: Any) -> int:
    try:
        s = float(score)
        w = float(weight)
        if w <= 0:
            return 0
        return max(0, min(100, round((s / w) * 100)))
    except (TypeError, ValueError):
        return 0


def value_type_label(L: dict, vt: str | None) -> str:
    if not vt:
        return ""
    return label(L, f"value_type_{vt}", vt)


# ---------------- SVG radar ----------------

def render_radar_svg(items: list[dict[str, Any]], lang: str, accent_stroke: str = "#d97706", accent_fill: str = "#fbbf24") -> str:
    """items: list of { name, pct } where pct is 0..100."""
    if not items:
        return ""
    n = len(items)
    cx, cy = 220, 200
    r_max = 130
    rings = [0.2, 0.4, 0.6, 0.8, 1.0]

    def point(angle_deg: float, radius: float) -> tuple[float, float]:
        a = math.radians(angle_deg - 90.0)
        return cx + radius * math.cos(a), cy + radius * math.sin(a)

    angles = [i * (360.0 / n) for i in range(n)]

    grid_lines = []
    for ring in rings:
        pts = [point(a, r_max * ring) for a in angles]
        path = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        grid_lines.append(
            f'<polygon points="{path}" fill="none" stroke="rgba(241,217,168,0.65)" stroke-width="1" />'
        )
    axes = []
    for a in angles:
        x, y = point(a, r_max)
        axes.append(
            f'<line x1="{cx}" y1="{cy}" x2="{x:.1f}" y2="{y:.1f}" stroke="rgba(241,217,168,0.55)" stroke-width="1" />'
        )

    data_pts = []
    for i, item in enumerate(items):
        ratio = max(0.0, min(1.0, float(item.get("pct", 0)) / 100.0))
        data_pts.append(point(angles[i], r_max * ratio))
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y in data_pts)
    data_polygon = (
        f'<polygon points="{poly}" fill="{accent_fill}" fill-opacity="0.28" '
        f'stroke="{accent_stroke}" stroke-width="2" stroke-linejoin="round" />'
    )
    data_dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="{accent_stroke}" />'
        for x, y in data_pts
    )

    labels = []
    for i, item in enumerate(items):
        a = angles[i]
        lx, ly = point(a, r_max + 24)
        anchor = "middle"
        if 30 < a < 150:
            anchor = "start"
        elif 210 < a < 330:
            anchor = "end"
        baseline = "central"
        if a < 20 or a > 340:
            baseline = "auto"
        elif 160 < a < 200:
            baseline = "hanging"
        name = esc(item.get("name", ""))
        score_text = esc(item.get("pct_text", f"{int(item.get('pct', 0))}%"))
        labels.append(
            f'<g><text x="{lx:.1f}" y="{ly:.1f}" text-anchor="{anchor}" '
            f'dominant-baseline="{baseline}" fill="#6b4423" font-size="11" font-weight="600" '
            f'font-family="ui-sans-serif, system-ui">{name}</text>'
            f'<text x="{lx:.1f}" y="{ly + 14:.1f}" text-anchor="{anchor}" '
            f'fill="#a89580" font-size="10" font-family="ui-sans-serif, system-ui">{score_text}</text></g>'
        )

    return (
        '<svg viewBox="0 0 440 400" class="radar-svg" xmlns="http://www.w3.org/2000/svg" role="img" '
        f'aria-label="{esc(lang)}">'
        + "".join(grid_lines)
        + "".join(axes)
        + data_polygon
        + data_dots
        + "".join(labels)
        + "</svg>"
    )


# ---------------- HTML sections ----------------

def _kpi_card(title: str, score: Any, grade: str, subtitle: str, badge: str | None, finance: bool, L: dict) -> str:
    grade_t = grade_tone(grade)
    score_text = fmt_score(score) if score is not None else "—"
    badge_html = ""
    if badge:
        readiness = READINESS_TONES.get(badge, RISK_TONES.get(badge, GRADE_TONES.get("B", {"bg": "#eff6ff", "fg": "#1d4ed8", "ring": "#bfdbfe"})))
        badge_html = (
            f'<span class="kpi-badge" style="background:{readiness["bg"]}; color:{readiness["fg"]}; '
            f'border-color:{readiness["ring"]};">{esc(badge)}</span>'
        )
    return f'''
<article class="kpi {"finance" if finance else ""}">
  <div class="kpi-label">{esc(title)}</div>
  <div class="kpi-row">
    <div>
      <span class="kpi-score">{esc(score_text)}</span>
      <span class="kpi-of">{esc(L["of_100"])}</span>
    </div>
    <span class="grade-pill" style="color:{grade_t["fg"]}; border-color:{grade_t["ring"]}; background:{grade_t["bg"]};">{esc(grade)}</span>
  </div>
  <p class="kpi-subtitle">{esc(subtitle)}</p>
  {badge_html}
</article>'''


SUB_SKILLS_INLINE_MAX = 12  # > N → render as wide banner under dashboard, not inside meta card


def _meta_card(report: dict, L: dict, lang: str, *, embed_sub_skills: bool = True) -> str:
    detected = report.get("language")
    if lang == "zh":
        fmt_lang = "中文" if detected == "zh" else "英文"
    else:
        fmt_lang = "Chinese" if detected == "zh" else "English"
    spec_label = "Claude" if report.get("spec") != "openclaw" else "OpenClaw"
    mode = report.get("mode", "rule-only preview")
    cert = report.get("deepReviewCertificate") or {}
    llm_state = (
        L["llm_complete"]
        if report.get("llmComplete")
        else L["llm_partial"]
    )
    rows = [
        (L["spec"], spec_label),
        (L["language"], fmt_lang),
        (L["mode"], mode),
        (L["engine"], f'{report.get("engine", "")} {report.get("engineVersion", "")}'),
        (L["rubric_version"], f'v{report.get("rubricSchemaVersion", "?")}'),
        (L["rubric_hash"], report.get("rubricHash", "")),
        (L["generated_at"], datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")),
    ]
    skill_type = report.get("skillType")
    if skill_type:
        type_text = L.get(f"skill_type_{skill_type}", skill_type)
        suffix = L["skill_type_auto_suffix"] if report.get("skillTypeAutoDetected") else L["skill_type_user_suffix"]
        rows.append((L["skill_type"], f"{type_text}{suffix}"))
    rows_html = "".join(f"<dt>{esc(k)}</dt><dd>{esc(v)}</dd>" for k, v in rows)
    value_type = report.get("llmMeta", {}).get("value_type") if isinstance(report.get("llmMeta"), dict) else None
    llm_meta = report.get("llmMeta") if isinstance(report.get("llmMeta"), dict) else {}
    reason = pick_bilingual(llm_meta, "value_type_reason", lang) if llm_meta else None
    vt_html = ""
    if value_type:
        reason_html = ""
        if reason:
            reason_html = (
                '<br><span style="color:var(--fg-muted);font-size:12px;">'
                + esc(reason)
                + "</span>"
            )
        vt_html = (
            f'<div class="value-type">'
            f'<strong>{esc(L["value_type_label"])}:</strong> {esc(value_type_label(L, value_type))}'
            f'{reason_html}'
            f'</div>'
        )
    sub_skills = report.get("subSkills") or []
    sub_skills_html = _sub_skills_block(sub_skills, L) if embed_sub_skills else ""
    return f'''
<article class="glass meta-card">
  <dl>{rows_html}</dl>
  <div style="margin-top:10px;font-size:11px;color:var(--fg-subtle);">{esc(llm_state)}</div>
  {vt_html}
  {sub_skills_html}
</article>'''


def _sub_skills_wide_block(sub_skills: list[dict], L: dict) -> str:
    """Wide-variant card placed BELOW the dashboard.

    Used when a package has > SUB_SKILLS_INLINE_MAX child SKILL.md files.
    Spans the full content width with a 3–4 column responsive grid so the
    space below the radar (which would otherwise be empty when the inline
    sub-skills card stretches the left column) gets reclaimed for actual
    content.
    """
    if not sub_skills:
        return ""
    count_text = L["sub_skills_count"].format(count=len(sub_skills))
    items_html = "".join(
        (
            f'<li title="{esc(s.get("description") or "")}">'
            f'<div class="sub-skill-row">'
            f'<span class="sub-skill-path">{esc(s.get("path", ""))}</span>'
            f'<span class="sub-skill-name">{esc(s.get("name") or "—")}</span>'
            f'</div>'
            f'<div class="sub-skill-desc">{esc(s.get("description") or "")}</div>'
            f'</li>'
        )
        for s in sub_skills
    )
    return f'''
<section class="sub-skills sub-skills-wide">
  <div class="sub-skills-head">
    <strong>{esc(L["sub_skills_label"])}</strong>
    <span class="sub-skills-count">{esc(count_text)}</span>
  </div>
  <ol class="sub-skills-list" data-many="true" data-variant="wide" data-count="{len(sub_skills)}">{items_html}</ol>
</section>'''


def _sub_skills_block(sub_skills: list[dict], L: dict) -> str:
    """Render the list of child SKILL.md (only when present, i.e. pipeline / composite packages).

    Layout strategy (handles 1 to 100+ sub-skills without stretching the page):
      * All entries are emitted (no [:N] truncation); inner scrollbar handles overflow.
      * Each <li> is two compact lines (path · name on top, description ellipsis below)
        so density stays high even with hundreds of children.
      * data-many="true" toggles a 2-column grid once we have > 12 entries, doubling
        visual density and keeping the card height within the radar height envelope.
    """
    if not sub_skills:
        return ""
    count_text = L["sub_skills_count"].format(count=len(sub_skills))
    items_html = "".join(
        (
            f'<li title="{esc(s.get("description") or "")}">'
            f'<div class="sub-skill-row">'
            f'<span class="sub-skill-path">{esc(s.get("path", ""))}</span>'
            f'<span class="sub-skill-name">{esc(s.get("name") or "—")}</span>'
            f'</div>'
            f'<div class="sub-skill-desc">{esc(s.get("description") or "")}</div>'
            f'</li>'
        )
        for s in sub_skills
    )
    many = "true" if len(sub_skills) > 12 else "false"
    return f'''
<div class="sub-skills">
  <div class="sub-skills-head">
    <strong>{esc(L["sub_skills_label"])}</strong>
    <span class="sub-skills-count">{esc(count_text)}</span>
  </div>
  <ol class="sub-skills-list" data-many="{many}" data-count="{len(sub_skills)}">{items_html}</ol>
</div>'''


def _radar_card(title: str, items: list[dict[str, Any]], finance: bool, lang: str, coverage_text: str = "") -> str:
    accent_stroke = "#f59e0b" if finance else "#d97706"
    accent_fill = "#fde68a" if finance else "#fbbf24"
    return f'''
<article class="glass radar-card {"finance" if finance else ""}">
  <div class="radar-head">
    <h3>{esc(title)}</h3>
    <span class="pill-count">{esc(coverage_text)}</span>
  </div>
  {render_radar_svg(items, lang, accent_stroke=accent_stroke, accent_fill=accent_fill)}
</article>'''


def _hero(report: dict, L: dict, lang: str) -> str:
    score = report.get("score")
    grade = report.get("grade", "D")
    grade_label_zh = {"S": "卓越", "A": "优秀", "B": "良好", "C": "及格", "D": "待改进"}
    grade_label_en = {"S": "Exceptional", "A": "Excellent", "B": "Good", "C": "Pass", "D": "Needs Work"}
    grade_label = (grade_label_zh if lang == "zh" else grade_label_en).get(grade, grade)
    badge = None
    if not report.get("llmComplete"):
        badge = "规则分初步" if lang == "zh" else "rule-only"

    finance = report.get("domainExpert")

    kpi_html = _kpi_card(L["general_score"], score, grade, grade_label, badge, finance=False, L=L)
    if finance:
        finance_score = finance.get("score")
        finance_grade = finance.get("grade", "Promising")
        scenario_name = finance.get("scenarioNameZh" if lang == "zh" else "scenarioNameEn", "")
        risk_tone = RISK_TONES.get(finance.get("riskLevel", "medium"), RISK_TONES["medium"])
        risk_label = risk_tone.get(f"label_{lang}", finance.get("riskLevel"))
        finance_subtitle = f'{scenario_name} · {L["risk"]}: {risk_label}'
        kpi_html += _kpi_card(
            L["finance_score"],
            finance_score,
            finance_grade,
            finance_subtitle,
            finance.get("commercialReadiness"),
            finance=True,
            L=L,
        )

    sub_skills = report.get("subSkills") or []
    inline_sub_skills = 0 < len(sub_skills) <= SUB_SKILLS_INLINE_MAX
    meta_html = _meta_card(report, L, lang, embed_sub_skills=inline_sub_skills)

    radar_items = [
        {
            "name": p.get("name_zh" if lang == "zh" else "name_en", p.get("id", "")),
            "pct": pct(p.get("score"), p.get("weight")),
        }
        for p in report.get("pillars", [])
    ]
    coverage = ""
    cov = next(
        (p.get("llmCoverage") for p in report.get("pillars", []) if p.get("llmCoverage")),
        None,
    )
    if cov:
        total = sum(p.get("llmCoverage", {}).get("total", 0) for p in report.get("pillars", []))
        evald = sum(p.get("llmCoverage", {}).get("evaluated", 0) for p in report.get("pillars", []))
        if total > 0:
            coverage = f"{evald}/{total}"
    general_radar = _radar_card(L["general_radar"], radar_items, finance=False, lang=lang, coverage_text=coverage)

    finance_radar_html = ""
    if finance:
        f_items = [
            {
                "name": p.get("name_zh" if lang == "zh" else "name_en", p.get("id", "")),
                "pct": pct(p.get("score"), p.get("weight")),
            }
            for p in finance.get("pillars", [])
        ]
        f_cov = finance.get("llmCoverage", {})
        f_coverage_text = f'{f_cov.get("evaluated", 0)}/{f_cov.get("total", 0)}' if f_cov else ""
        finance_radar_html = _radar_card(L["finance_radar"], f_items, finance=True, lang=lang, coverage_text=f_coverage_text)

    overflow_block = ""
    if len(sub_skills) > SUB_SKILLS_INLINE_MAX:
        overflow_block = _sub_skills_wide_block(sub_skills, L)

    return f'''
<section class="dashboard">
  <div class="kpi-stack">
    {kpi_html}
    {meta_html}
  </div>
  <div class="kpi-stack">
    {general_radar}
    {finance_radar_html}
  </div>
</section>
{overflow_block}'''


def _check_item(check: dict, L: dict, lang: str, def_lookup: dict[str, dict] | None = None,
                report_skill_type: str | None = None) -> str:
    status = check.get("status", "n_a")
    tone = status_tone(status)
    cdef = (def_lookup or {}).get(check.get("id", ""), {})
    title = cdef.get("desc_zh" if lang == "zh" else "desc_en", check.get("id", ""))
    evidence = pick_bilingual(check, "evidence", lang)
    # For not_applicable checks: rewrite the evidence in the current report
    # language so a Chinese pane never shows English boilerplate (and vice
    # versa). The author-written `evidence` is replaced because not_applicable
    # evidence is fully boilerplate generated by score.py.
    if status == "not_applicable":
        scope = ", ".join(check.get("appliesTo") or [])
        skill_type_label = report_skill_type or "?"
        evidence = L["not_applicable_evidence"].format(
            skill_type=skill_type_label, scope=scope or "—"
        )
    fix = pick_bilingual(check, "fix", lang)
    confidence = check.get("confidence")
    weight = check.get("weight", 0)
    type_label = L["type_llm"] if check.get("type") == "llm" else L["type_rule"]
    confidence_html = ""
    if confidence is not None:
        confidence_html = f'<span class="chip">{esc(L["confidence"])}: {int(round(float(confidence) * 100))}%</span>'
    fix_html = ""
    if fix:
        fix_html = (
            f'<div class="check-fix"><span class="label">{esc(L["fix"])}</span>{esc(fix)}</div>'
        )
    evidence_source_label = ""
    es = check.get("evidenceSource")
    if es:
        evidence_source_label = (
            f'<span class="chip">{esc(L["evidence_source"])}: '
            f'{esc(label(L, f"evidence_source_{es}", es))}</span>'
        )
    na_hint_html = ""
    if status == "not_applicable":
        na_hint_html = f'<div class="check-na-hint">↳ {esc(L["not_applicable_hint"])}</div>'
    return f'''
<li class="check" data-status="{esc(status)}">
  <div class="check-head">
    <span class="status-badge" style="background:{tone["bg"]}; color:{tone["fg"]}; border-color:{tone["ring"]};">
      <span>{esc(tone["icon"])}</span>{esc(L[f"status_{status}"])}
    </span>
    <div class="check-body">
      <div class="check-title">{esc(title)}</div>
      <div class="check-evidence"><span class="label">{esc(L["evidence"])}</span>{esc(evidence)}</div>
      {fix_html}
      {na_hint_html}
      <div class="check-meta">
        {evidence_source_label}
        {confidence_html}
        <span class="chip mono">{esc(check.get("id", ""))}</span>
        <span class="chip">{esc(type_label)} · w={esc(weight)}</span>
      </div>
    </div>
  </div>
</li>'''


def _dimension_card(dim: dict, L: dict, lang: str, def_lookup: dict[str, dict],
                    report_skill_type: str | None = None) -> str:
    name = dim.get("name_zh" if lang == "zh" else "name_en", dim.get("id", ""))
    cdef = def_lookup.get(dim.get("id"), {})
    tagline = cdef.get("tagline_zh" if lang == "zh" else "tagline_en", "")
    checks_html = "".join(
        _check_item(c, L, lang, def_lookup, report_skill_type=report_skill_type)
        for c in dim.get("checks", [])
    )

    # Dim entirely filtered by applies_to: render as a muted, opacity-reduced
    # card with a "—" score so reviewers know it exists but isn't being scored
    # for this skill_type. The original dim weight is shown as struck-through
    # to make the renormalization visible.
    if dim.get("notApplicable"):
        original_weight = dim.get("originalWeight", dim.get("weight", 0))
        score_block = (
            f'<div class="dim-score na">— '
            f'<span class="dim-score-of"><s> / {esc(original_weight)}</s></span></div>'
            f'<div style="font-size:11px;color:var(--fg-subtle);">'
            f'{esc(L["status_not_applicable"])}</div>'
        )
        return f'''
<details class="dim" data-na="true">
  <summary>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="dim-name">{esc(name)}</span>
        <span class="dim-id">{esc(dim.get("id", ""))}</span>
        <span class="dim-na-pill">{esc(L["status_not_applicable"])}</span>
      </div>
      {f'<div class="dim-tagline">{esc(tagline)}</div>' if tagline else ''}
      <div class="dim-na-explain">{esc(L["dim_not_applicable_hint"])}</div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      {score_block}
    </div>
  </summary>
  <ul class="check-list">{checks_html}</ul>
</details>'''

    pct_v = pct(dim.get("score"), dim.get("weight"))
    return f'''
<details class="dim">
  <summary>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="dim-name">{esc(name)}</span>
        <span class="dim-id">{esc(dim.get("id", ""))}</span>
      </div>
      {f'<div class="dim-tagline">{esc(tagline)}</div>' if tagline else ''}
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div class="dim-score">{esc(fmt_score(dim.get("score")))}<span class="dim-score-of"> / {esc(dim.get("weight", 0))}</span></div>
      <div style="font-size:11px;color:var(--fg-subtle);">{pct_v}%</div>
    </div>
  </summary>
  <div class="dim-progress"><div style="width:{pct_v}%;"></div></div>
  <ul class="check-list">{checks_html}</ul>
</details>'''


def _pillar_section(pillar: dict, L: dict, lang: str, def_lookup: dict[str, dict],
                    report_skill_type: str | None = None) -> str:
    pid = pillar.get("id", "")
    tone = pillar_tone(pid)
    name = pillar.get("name_zh" if lang == "zh" else "name_en", pid)
    pct_v = pct(pillar.get("score"), pillar.get("weight"))
    pdef = def_lookup.get(pid, {})
    tagline = pdef.get("tagline_zh" if lang == "zh" else "tagline_en", "")
    role = pdef.get("role_zh" if lang == "zh" else "role_en", "")
    cov = pillar.get("llmCoverage", {})
    cov_text = f'LLM {cov.get("evaluated", 0)}/{cov.get("total", 0)}' if cov.get("total") else ""

    style = (
        f'--pillar-from:{tone["gradient_from"]};'
        f'--pillar-ring:{tone["ring"]};'
        f'--pillar-accent:{tone["accent"]};'
        f'--pillar-pill-bg:{tone["pill_bg"]};'
        f'--bar-from:{tone["bar_from"]};'
        f'--bar-to:{tone["bar_to"]};'
    )
    dim_defs: dict[str, dict] = {}
    for d in pdef.get("dimensions", []):
        dim_defs[d["id"]] = d
        for c in d.get("checks", []):
            dim_defs[c["id"]] = c
    # also expose pillar-level def_lookup for nested check defs
    merged_lookup = {**def_lookup, **dim_defs}

    # Split applicable vs fully-N/A dims so reviewers see only the relevant
    # ones by default. Fully-N/A dims are collapsed into a footer block per
    # pillar with a "show N skipped dims" toggle.
    applicable_dims = [d for d in pillar.get("dimensions", []) if not d.get("notApplicable")]
    na_dims = [d for d in pillar.get("dimensions", []) if d.get("notApplicable")]

    dims_html = "".join(
        _dimension_card(d, L, lang, merged_lookup, report_skill_type=report_skill_type)
        for d in applicable_dims
    )
    na_dims_html = "".join(
        _dimension_card(d, L, lang, merged_lookup, report_skill_type=report_skill_type)
        for d in na_dims
    )

    pills = []
    if role:
        pills.append(f'<span class="tag">{esc(role)}</span>')
    if cov_text:
        pills.append(f'<span class="muted-tag">{esc(cov_text)}</span>')
    pills_html = " ".join(pills)

    na_block = ""
    if na_dims:
        na_block = f'''
  <details class="dim-na-fold">
    <summary>
      <span class="dim-na-fold-label">{esc(L["dim_na_fold_show"]).format(n=len(na_dims))}</span>
      <span class="dim-na-fold-hint">{esc(L["dim_na_fold_hint"])}</span>
    </summary>
    <div class="dim-list">{na_dims_html}</div>
  </details>'''

    return f'''
<article class="pillar" style="{style}">
  <div class="pillar-head">
    <div style="flex:1;min-width:0;">
      <div class="pillar-name">{esc(name)}</div>
      <div class="pillar-pills">{pills_html}</div>
      {f'<p class="pillar-tagline">{esc(tagline)}</p>' if tagline else ''}
    </div>
    <div class="pillar-score-block">
      <div class="pillar-score">{esc(fmt_score(pillar.get("score")))}<span class="pillar-score-of"> / {esc(pillar.get("weight", 0))}</span></div>
      <div class="pillar-pct">{pct_v}%</div>
    </div>
  </div>
  <div class="pillar-progress"><div style="width:{pct_v}%;"></div></div>
  <div class="dim-list">{dims_html}</div>{na_block}
</article>'''


def _suggestion_card(s: dict, idx: int, L: dict, lang: str, finance: bool = False) -> str:
    severity = s.get("severity", "medium")
    sev_tone = SEVERITY_TONES.get(severity, SEVERITY_TONES["medium"])
    sev_label = label(L, f"severity_{severity}", severity)
    fg = sev_tone["fg"]
    bg = sev_tone["bg"]
    ring = sev_tone["ring"]
    finance_class = " finance" if finance else ""
    pillar_label = s.get("pillarId", "")
    pillar_id = s.get("pillarId", "")
    if pillar_id and not finance:
        # try to give a friendly name
        pillar_label = s.get("pillarId", "")
    why = pick_bilingual(s, "why", lang)
    title = pick_bilingual(s, "title", lang) or s.get("checkId", "")
    how = pick_bilingual(s, "how", lang) or title
    return f'''
<article class="suggestion{finance_class}" style="background:{bg}; border-color:{ring};">
  <div class="row">
    <span class="num" style="background:{fg};">{idx + 1}</span>
    <div class="body">
      <div class="eyebrow-text">{esc(L["suggestion_recommendation"])}</div>
      <h4>{esc(how)}</h4>
      <div class="meta-row">
        <span class="pillar-tag">{esc(pillar_id)}</span>
        <span class="mono" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">{esc(s.get("checkId", ""))}</span>
        <span>w={esc(s.get("weight", 0))}</span>
      </div>
      <div class="what-card">
        <span class="label">{esc(L["suggestion_addresses"])}</span>
        <span style="margin-left:6px;">{esc(title)}</span>
      </div>
      <div class="why-line"><span class="label">{esc(L["evidence"])}:</span> {esc(why)}</div>
    </div>
    <span class="severity-pill" style="background:{bg}; color:{fg}; border-color:{ring};">{esc(sev_label)}</span>
  </div>
</article>'''


def _suggestions_block(suggestions: list[dict], title: str, L: dict, lang: str, finance: bool = False) -> str:
    if not suggestions:
        return f'''
<section>
  <div class="section-title"><h2>{esc(title)}</h2></div>
  <p style="color:var(--fg-muted);">{esc(L["suggestions_empty"])}</p>
</section>'''
    cards = "".join(_suggestion_card(s, i, L, lang, finance=finance) for i, s in enumerate(suggestions))
    return f'''
<section>
  <div class="section-title">
    <h2>{esc(title)}</h2>
    <span class="meta">Top {len(suggestions)} · {esc(L["suggestions_intro"])}</span>
  </div>
  <div class="suggestions">{cards}</div>
</section>'''


def _finance_block(finance: dict, L: dict, lang: str, def_lookup: dict[str, dict] | None = None) -> str:
    score = finance.get("score")
    grade = finance.get("grade", "")
    risk = finance.get("riskLevel", "medium")
    risk_tone = RISK_TONES.get(risk, RISK_TONES["medium"])
    risk_label = risk_tone.get(f"label_{lang}", risk)
    readiness = finance.get("commercialReadiness", "not-ready")
    readiness_tone = READINESS_TONES.get(readiness, READINESS_TONES["not-ready"])
    scenario_name = finance.get("scenarioNameZh" if lang == "zh" else "scenarioNameEn", finance.get("scenario", ""))

    pillars = finance.get("pillars", [])
    grid_html = "".join(
        f'''<div class="finance-pillar-mini">
  <div class="name">{esc(p.get("name_zh" if lang == "zh" else "name_en", p.get("id", "")))}</div>
  <div class="score">{esc(fmt_score(p.get("score")))}<span class="of"> / {esc(p.get("weight", 0))}</span></div>
</div>'''
        for p in pillars
    )

    pillars_full = "".join(_finance_pillar_card(p, L, lang, def_lookup) for p in pillars)

    return f'''
<section class="finance-block">
  <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start;">
    <div>
      <div class="kpi-label" style="color:var(--amber-700);">{esc(L["finance_score"])}</div>
      <h2>{esc(fmt_score(score))} <span style="font-size:14px;color:var(--fg-subtle);font-weight:400;">{esc(L["of_100"])}</span></h2>
      <div class="scenario">{esc(scenario_name)} · {esc(grade)}</div>
    </div>
    <div class="finance-pills">
      <span class="finance-pill" style="background:{risk_tone["bg"]}; color:{risk_tone["fg"]}; border-color:{risk_tone["ring"]};">
        {esc(L["risk"])}: {esc(risk_label)}
      </span>
      <span class="finance-pill" style="background:{readiness_tone["bg"]}; color:{readiness_tone["fg"]}; border-color:{readiness_tone["ring"]};">
        {esc(L["commercial"])}: {esc(readiness)}
      </span>
    </div>
  </div>
  <div class="finance-grid">{grid_html}</div>
  <div class="finance-pillars">{pillars_full}</div>
</section>'''


def _finance_pillar_card(pillar: dict, L: dict, lang: str, def_lookup: dict[str, dict] | None = None) -> str:
    name = pillar.get("name_zh" if lang == "zh" else "name_en", pillar.get("id", ""))
    pct_v = pct(pillar.get("score"), pillar.get("weight"))
    tone = FINANCE_PILLAR_TONE
    style = (
        f'--pillar-from:{tone["gradient_from"]};'
        f'--pillar-ring:{tone["ring"]};'
        f'--pillar-accent:{tone["accent"]};'
        f'--pillar-pill-bg:{tone["pill_bg"]};'
        f'--bar-from:{tone["bar_from"]};'
        f'--bar-to:{tone["bar_to"]};'
    )

    checks_html = "".join(_finance_check_item(c, L, lang, def_lookup) for c in pillar.get("checks", []))

    return f'''
<article class="pillar" style="{style}">
  <div class="pillar-head">
    <div style="flex:1;min-width:0;">
      <div class="pillar-name">{esc(name)}</div>
      <div class="pillar-pills"><span class="muted-tag">{esc(pillar.get("id", ""))}</span></div>
    </div>
    <div class="pillar-score-block">
      <div class="pillar-score">{esc(fmt_score(pillar.get("score")))}<span class="pillar-score-of"> / {esc(pillar.get("weight", 0))}</span></div>
      <div class="pillar-pct">{pct_v}%</div>
    </div>
  </div>
  <div class="pillar-progress"><div style="width:{pct_v}%;"></div></div>
  <details class="dim" open>
    <summary>
      <div style="flex:1;"><span class="dim-name">{esc(L["expand"])} · {len(pillar.get("checks", []))} checks</span></div>
      <div class="dim-id">finance.*</div>
    </summary>
    <ul class="check-list">{checks_html}</ul>
  </details>
</article>'''


def _finance_check_item(check: dict, L: dict, lang: str, def_lookup: dict[str, dict] | None = None) -> str:
    status = check.get("status", "n_a")
    tone = status_tone(status)
    cdef = (def_lookup or {}).get(check.get("id", ""), {})
    cid = check.get("id", "")
    desc_zh = cdef.get("desc_zh", "")
    desc_en = cdef.get("desc_en", "")
    if lang == "zh":
        title = desc_zh or desc_en or cid
        subtitle = desc_en if desc_zh and desc_en else ""
    else:
        title = desc_en or desc_zh or cid
        subtitle = desc_zh if desc_zh and desc_en else ""
    subtitle_html = (
        f'<div class="check-subtitle">{esc(subtitle)}</div>' if subtitle else ""
    )
    confidence = check.get("confidence")
    confidence_html = ""
    if confidence is not None:
        confidence_html = f'<span class="chip">{esc(L["confidence"])}: {int(round(float(confidence) * 100))}%</span>'
    evidence = pick_bilingual(check, "evidence", lang)
    fix = pick_bilingual(check, "fix", lang)
    fix_html = ""
    if fix:
        fix_html = f'<div class="check-fix"><span class="label">{esc(L["fix"])}</span>{esc(fix)}</div>'
    return f'''
<li class="check">
  <div class="check-head">
    <span class="status-badge" style="background:{tone["bg"]}; color:{tone["fg"]}; border-color:{tone["ring"]};">
      <span>{esc(tone["icon"])}</span>{esc(L[f"status_{status}"])}
    </span>
    <div class="check-body">
      <div class="check-title">{esc(title)}</div>
      {subtitle_html}
      <div class="check-evidence"><span class="label">{esc(L["evidence"])}</span>{esc(evidence)}</div>
      {fix_html}
      <div class="check-meta">
        {confidence_html}
        <span class="chip mono">{esc(cid)}</span>
        <span class="chip">w={esc(check.get("weight", 0))}</span>
      </div>
    </div>
  </div>
</li>'''


def _certificate_section(report: dict, L: dict) -> str:
    cert = report.get("deepReviewCertificate")
    if not cert:
        return ""
    verified = cert.get("status") == "verified"
    pill_class = "verified-pill" if verified else "verified-pill incomplete"
    pill_text = L["certificate_verified"] if verified else L["certificate_incomplete"]
    rows = [
        (L["certificate_workflow"], cert.get("workflow", "")),
        (L["certificate_engine"], cert.get("engine", "")),
        (L["certificate_engine_version"], cert.get("engineVersion", "")),
        (L["certificate_rubric_hash"], cert.get("rubricHash", "")),
        (L["certificate_llm_results_hash"], cert.get("llmResultsHash", "")),
    ]
    if cert.get("domain"):
        rows.append((L["certificate_domain"], cert.get("domain")))
        rows.append((L["certificate_scenario"], cert.get("scenario", "")))
        rows.append((L["certificate_domain_rubric_hash"], cert.get("domainRubricHash", "")))
    rows_html = "".join(f"<dt>{esc(k)}</dt><dd>{esc(v)}</dd>" for k, v in rows)
    return f'''
<section class="cert">
  <div class="cert-head">
    <h2>{esc(L["certificate_title"])}</h2>
    <span class="{pill_class}">● {esc(pill_text)}</span>
  </div>
  <dl>{rows_html}</dl>
</section>'''


# ---------------- main render ----------------

def _build_finance_def_lookup(domain_rubric: dict | None, scenario: str | None) -> dict[str, dict]:
    """Map finance check id → its rubric definition (desc_zh / desc_en / weight).

    Includes both base pillar checks and the scenario-specific ``extra_checks``.
    """
    lookup: dict[str, dict] = {}
    if not domain_rubric:
        return lookup
    for p in domain_rubric.get("pillars", []) or []:
        lookup[p.get("id", "")] = p
        for c in p.get("checks", []) or []:
            cid = c.get("id")
            if cid:
                lookup[cid] = c
    if scenario:
        prof = (domain_rubric.get("scenario_profiles") or {}).get(scenario) or {}
        for _pid, extras in (prof.get("extra_checks") or {}).items():
            for c in extras or []:
                cid = c.get("id")
                if cid:
                    lookup[cid] = c
    return lookup


def _render_pane(
    report: dict,
    lang: str,
    *,
    def_lookup: dict[str, dict],
    finance: dict | None,
    finance_def_lookup: dict[str, dict],
) -> str:
    """Render the full visible report (header → footer) for a single language."""
    L = LABELS[lang]
    parts: list[str] = []

    parts.append(f'''
<header class="app-header">
  <div>
    <span class="eyebrow">{esc(L["header_eyebrow"])}</span>
    <h1 class="title">{esc(L["app_name"])}</h1>
    <p class="tagline">{esc(L["tagline"])}</p>
  </div>
  <div class="header-actions no-print">
    <button class="lang-toggle" type="button" aria-label="{esc(L["lang_toggle_aria"])}" title="{esc(L["lang_toggle_aria"])}">{esc(L["lang_toggle"])}</button>
    <button class="theme-toggle" type="button">{esc(L["theme_toggle"])}</button>
  </div>
</header>''')

    parts.append(_hero(report, L, lang))

    if not report.get("llmComplete"):
        parts.append(f'<div class="banner amber">{esc(L["rule_only_banner"])}</div>')

    report_skill_type = report.get("skillType")
    pillars_html = "".join(
        _pillar_section(p, L, lang, def_lookup, report_skill_type=report_skill_type)
        for p in report.get("pillars", [])
    )
    general_section = (
        f'''<section>
  <div class="section-title"><h2>{esc(L["pillars_general"])}</h2></div>
  <div class="pillar-grid">{pillars_html}</div>
</section>'''
        + _suggestions_block(report.get("suggestions", []), L["suggestions_general"], L, lang, finance=False)
    )

    if finance:
        finance_section = (
            _finance_block(finance, L, lang, finance_def_lookup)
            + _suggestions_block(finance.get("suggestions", []), L["suggestions_finance"], L, lang, finance=True)
        )
        parts.append(f'''
<nav class="tabs no-print" role="tablist" aria-label="{esc(L["app_name"])}">
  <button type="button" class="tab-btn finance active" role="tab" aria-selected="true" data-target="finance">{esc(L["tab_finance"])}</button>
  <button type="button" class="tab-btn general" role="tab" aria-selected="false" data-target="general">{esc(L["tab_general"])}</button>
</nav>
<div class="tab-content" data-tab="finance" role="tabpanel">
  <h2 class="tab-print-heading">{esc(L["tab_print_finance"])}</h2>
  {finance_section}
</div>
<div class="tab-content" data-tab="general" role="tabpanel" hidden>
  <h2 class="tab-print-heading">{esc(L["tab_print_general"])}</h2>
  {general_section}
</div>''')
    else:
        parts.append(general_section)

    parts.append(_certificate_section(report, L))

    parts.append(f'''
<footer class="app-footer">
  <div>{esc(L["footer_note"])}</div>
  <div>{esc(L["footer_print_hint"])}</div>
</footer>''')

    return "\n".join(parts)


def render_html(
    report: dict,
    *,
    rubric: dict | None = None,
    domain_rubric: dict | None = None,
    scenario: str | None = None,
) -> str:
    def_lookup: dict[str, dict] = {}
    if rubric:
        for p in rubric.get("pillars", []):
            def_lookup[p["id"]] = p
            for d in p.get("dimensions", []):
                def_lookup[d["id"]] = d
                for c in d.get("checks", []):
                    def_lookup[c["id"]] = c
        for b in rubric.get("bonus", []):
            def_lookup[b["id"]] = b
            for c in b.get("checks", []):
                def_lookup[c["id"]] = c

    finance = report.get("domainExpert")
    finance_def_lookup = _build_finance_def_lookup(
        domain_rubric,
        scenario or (finance or {}).get("scenario"),
    )

    pane_kwargs = dict(
        def_lookup=def_lookup,
        finance=finance,
        finance_def_lookup=finance_def_lookup,
    )
    zh_pane = _render_pane(report, "zh", **pane_kwargs)
    en_pane = _render_pane(report, "en", **pane_kwargs)

    # Default to Chinese UI; users can switch via the in-page toggle.
    default_lang = "zh"
    score_str = esc(report.get("score", "—"))
    title_zh = f'SkillLens · {score_str} / 100'
    title_en = f'SkillLens · {score_str} / 100'

    return f'''<!doctype html>
<html lang="{default_lang}" data-default-lang="{default_lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="SkillLens CLI">
<title data-title-zh="{esc(title_zh)}" data-title-en="{esc(title_en)}">{esc(title_zh)}</title>
<style>{CSS}</style>
</head>
<body>
<main class="report">
<div class="lang-pane" data-lang-pane="zh" lang="zh">
{zh_pane}
</div>
<div class="lang-pane" data-lang-pane="en" lang="en">
{en_pane}
</div>
</main>
<script>{JS_TOGGLE}</script>
</body>
</html>'''


# ---------------- markdown ----------------

def _md_meta_table(report: dict, L: dict) -> str:
    rows = [
        (L["spec"], "Claude" if report.get("spec") != "openclaw" else "OpenClaw"),
        (L["language"], "中文" if report.get("language") == "zh" else "English"),
        (L["mode"], report.get("mode", "")),
        (L["engine"], f'{report.get("engine", "")} {report.get("engineVersion", "")}'),
        (L["rubric_version"], f'v{report.get("rubricSchemaVersion", "?")}'),
        (L["rubric_hash"], f'`{report.get("rubricHash", "")}`'),
        (L["llm_complete"] if report.get("llmComplete") else L["llm_partial"], "✓" if report.get("llmComplete") else "—"),
    ]
    skill_type = report.get("skillType")
    if skill_type:
        type_text = L.get(f"skill_type_{skill_type}", skill_type)
        suffix = L["skill_type_auto_suffix"] if report.get("skillTypeAutoDetected") else L["skill_type_user_suffix"]
        rows.append((L["skill_type"], f"{type_text}{suffix}"))
    out = ["| Key | Value |", "|---|---|"]
    for k, v in rows:
        out.append(f"| {k} | {_md_escape(str(v))} |")
    return "\n".join(out)


def _md_sub_skills(sub_skills: list[dict], L: dict) -> list[str]:
    if not sub_skills:
        return []
    out = [
        "",
        f"### {L['sub_skills_label']} ({L['sub_skills_count'].format(count=len(sub_skills))})",
        "",
    ]
    for s in sub_skills[:20]:
        path = s.get("path", "")
        name = s.get("name") or "—"
        desc = s.get("description") or ""
        out.append(f"- `{path}` · **{_md_escape(name)}** — {_md_escape(desc)}")
    if len(sub_skills) > 20:
        out.append(f"- _(+{len(sub_skills) - 20} more)_")
    out.append("")
    return out


def _md_escape(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _md_pillar(pillar: dict, L: dict, lang: str, level: int = 3) -> list[str]:
    name = pillar.get("name_zh" if lang == "zh" else "name_en", pillar.get("id", ""))
    pct_v = pct(pillar.get("score"), pillar.get("weight"))
    cov = pillar.get("llmCoverage", {})
    cov_text = f' · LLM {cov.get("evaluated", 0)}/{cov.get("total", 0)}' if cov.get("total") else ""
    out = [
        f"{'#' * level} {name} — {fmt_score(pillar.get('score'))} / {pillar.get('weight', 0)} ({pct_v}%){cov_text}",
        "",
    ]
    for d in pillar.get("dimensions", []):
        d_name = d.get("name_zh" if lang == "zh" else "name_en", d.get("id", ""))
        out.append(f"{'#' * (level + 1)} {d_name} ({fmt_score(d.get('score'))} / {d.get('weight', 0)})")
        out.append("")
        out.append("| Status | Check | Evidence | Fix | Confidence |")
        out.append("|---|---|---|---|---|")
        for c in d.get("checks", []):
            status = c.get("status", "n_a")
            icon = STATUS_TONES.get(status, STATUS_TONES["n_a"])["icon"]
            status_text = f'{icon} {L[f"status_{status}"]}'
            cid = c.get("id", "")
            evidence = _md_escape(pick_bilingual(c, "evidence", lang) or "—")
            fix = _md_escape(pick_bilingual(c, "fix", lang)) or "—"
            conf_v = c.get("confidence")
            conf = f"{int(round(float(conf_v) * 100))}%" if conf_v is not None else "—"
            out.append(f"| {status_text} | `{cid}` (w={c.get('weight', 0)}) | {evidence} | {fix} | {conf} |")
        out.append("")
    return out


def _md_finance(finance: dict, L: dict, lang: str, def_lookup: dict[str, dict] | None = None) -> list[str]:
    out = [
        "",
        f"## {L['finance_score']} — {fmt_score(finance.get('score'))} / 100 ({finance.get('grade', '')})",
        "",
    ]
    risk = finance.get("riskLevel", "medium")
    risk_label = RISK_TONES.get(risk, {}).get(f"label_{lang}", risk)
    out.extend([
        f"- **{L['scenario']}**: {finance.get('scenarioNameZh' if lang == 'zh' else 'scenarioNameEn', finance.get('scenario', ''))} (`{finance.get('scenario', '')}`)",
        f"- **{L['risk']}**: {risk_label} (`{risk}`)",
        f"- **{L['commercial']}**: {finance.get('commercialReadiness', '')}",
        f"- **LLM coverage**: {finance.get('llmCoverage', {}).get('evaluated', 0)}/{finance.get('llmCoverage', {}).get('total', 0)}",
        "",
    ])
    out.append("### " + L["pillars_finance"])
    out.append("")
    out.append("| Pillar | Score / Weight | Pct |")
    out.append("|---|---|---|")
    for p in finance.get("pillars", []):
        name = p.get("name_zh" if lang == "zh" else "name_en", p.get("id", ""))
        pct_v = pct(p.get("score"), p.get("weight"))
        out.append(f"| {name} (`{p.get('id', '')}`) | {fmt_score(p.get('score'))} / {p.get('weight', 0)} | {pct_v}% |")
    out.append("")

    for p in finance.get("pillars", []):
        name = p.get("name_zh" if lang == "zh" else "name_en", p.get("id", ""))
        out.append(f"#### {name} — {fmt_score(p.get('score'))} / {p.get('weight', 0)}")
        out.append("")
        out.append("| Status | Check | Evidence | Fix | Confidence |")
        out.append("|---|---|---|---|---|")
        for c in p.get("checks", []):
            status = c.get("status", "n_a")
            icon = STATUS_TONES.get(status, STATUS_TONES["n_a"])["icon"]
            status_text = f'{icon} {L[f"status_{status}"]}'
            cid = c.get("id", "")
            cdef = (def_lookup or {}).get(cid, {})
            desc_zh = cdef.get("desc_zh", "")
            desc_en = cdef.get("desc_en", "")
            if lang == "zh":
                primary = desc_zh or desc_en or cid
                aux = desc_en if desc_zh and desc_en else ""
            else:
                primary = desc_en or desc_zh or cid
                aux = desc_zh if desc_zh and desc_en else ""
            cell_parts = [f"**{_md_escape(primary)}**"]
            if aux:
                cell_parts.append(f"<sub>{_md_escape(aux)}</sub>")
            cell_parts.append(f"<sub>`{cid}` · w={c.get('weight', 0)}</sub>")
            check_cell = "<br>".join(cell_parts)
            evidence = _md_escape(pick_bilingual(c, "evidence", lang) or "—")
            fix = _md_escape(pick_bilingual(c, "fix", lang)) or "—"
            conf_v = c.get("confidence")
            conf = f"{int(round(float(conf_v) * 100))}%" if conf_v is not None else "—"
            out.append(f"| {status_text} | {check_cell} | {evidence} | {fix} | {conf} |")
        out.append("")

    sugg = finance.get("suggestions", [])
    if sugg:
        out.append(f"### {L['suggestions_finance']}")
        out.append("")
        for i, s in enumerate(sugg):
            how_text = pick_bilingual(s, "how", lang) or pick_bilingual(s, "title", lang) or s.get("checkId", "")
            title_text = pick_bilingual(s, "title", lang)
            why_text = pick_bilingual(s, "why", lang)
            out.append(f"{i+1}. **{_md_escape(how_text)}** _(`{s.get('checkId', '')}`, w={s.get('weight', 0)})_")
            if title_text:
                out.append(f"   - {L['suggestion_addresses']}: {_md_escape(title_text)}")
            if why_text:
                out.append(f"   - {L['evidence']}: {_md_escape(why_text)}")
        out.append("")
    return out


def _md_certificate(report: dict, L: dict) -> list[str]:
    cert = report.get("deepReviewCertificate")
    if not cert:
        return []
    verified = cert.get("status") == "verified"
    out = [
        f"## {L['certificate_title']}",
        "",
        f"- **Status**: {'verified' if verified else cert.get('status', 'unknown')}",
        f"- **{L['certificate_workflow']}**: `{cert.get('workflow', '')}`",
        f"- **{L['certificate_engine']}**: {cert.get('engine', '')} {cert.get('engineVersion', '')}",
        f"- **{L['certificate_rubric_hash']}**: `{cert.get('rubricHash', '')}`",
        f"- **{L['certificate_llm_results_hash']}**: `{cert.get('llmResultsHash', '')}`",
    ]
    if cert.get("domain"):
        out.extend([
            f"- **{L['certificate_domain']}**: {cert.get('domain')}",
            f"- **{L['certificate_scenario']}**: {cert.get('scenario', '')}",
            f"- **{L['certificate_domain_rubric_hash']}**: `{cert.get('domainRubricHash', '')}`",
        ])
    out.append("")
    return out


def render_markdown(
    report: dict,
    *,
    domain_rubric: dict | None = None,
    scenario: str | None = None,
) -> str:
    L = LABELS[pick_lang(report)]
    lang = pick_lang(report)
    finance = report.get("domainExpert")
    finance_def_lookup = _build_finance_def_lookup(
        domain_rubric,
        scenario or (finance or {}).get("scenario"),
    )

    out: list[str] = []
    out.append(f"# {L['app_name']} · {fmt_score(report.get('score'))} / 100 ({report.get('grade', '')})")
    out.append("")
    out.append(f"_{L['tagline']}_")
    out.append("")
    out.append(_md_meta_table(report, L))
    out.append("")

    out.extend(_md_sub_skills(report.get("subSkills") or [], L))

    vt = (report.get("llmMeta") or {}).get("value_type")
    if vt:
        reason = pick_bilingual(report.get("llmMeta") or {}, "value_type_reason", lang)
        out.append(f"**{L['value_type_label']}**: {value_type_label(L, vt)}")
        if reason:
            out.append(f"> {_md_escape(reason)}")
        out.append("")

    if not report.get("llmComplete"):
        out.append(f"> {L['rule_only_banner']}")
        out.append("")

    out.append(f"## {L['pillars_general']}")
    out.append("")
    out.append("| Pillar | Score / Weight | Pct | LLM coverage |")
    out.append("|---|---|---|---|")
    for p in report.get("pillars", []):
        name = p.get("name_zh" if lang == "zh" else "name_en", p.get("id", ""))
        cov = p.get("llmCoverage", {})
        cov_text = f"{cov.get('evaluated', 0)}/{cov.get('total', 0)}" if cov.get("total") else "—"
        pct_v = pct(p.get("score"), p.get("weight"))
        out.append(f"| {name} (`{p.get('id', '')}`) | {fmt_score(p.get('score'))} / {p.get('weight', 0)} | {pct_v}% | {cov_text} |")
    out.append("")

    for p in report.get("pillars", []):
        out.extend(_md_pillar(p, L, lang, level=3))

    sugg = report.get("suggestions", [])
    if sugg:
        out.append(f"## {L['suggestions_general']}")
        out.append("")
        for i, s in enumerate(sugg):
            how_text = pick_bilingual(s, "how", lang) or pick_bilingual(s, "title", lang) or s.get("checkId", "")
            title_text = pick_bilingual(s, "title", lang)
            why_text = pick_bilingual(s, "why", lang)
            out.append(f"{i+1}. **{_md_escape(how_text)}** _({s.get('severity', '')}, `{s.get('checkId', '')}`, w={s.get('weight', 0)})_")
            if title_text:
                out.append(f"   - {L['suggestion_addresses']}: {_md_escape(title_text)}")
            if why_text:
                out.append(f"   - {L['evidence']}: {_md_escape(why_text)}")
        out.append("")

    if finance:
        out.extend(_md_finance(finance, L, lang, finance_def_lookup))

    out.extend(_md_certificate(report, L))

    out.append("---")
    out.append(f"_{L['footer_note']}_")
    out.append("")
    return "\n".join(out)
