#!/usr/bin/env python3
"""
skill-scorer CLI —— MVP 版（仅规则分）

用法:
    python scripts/score.py <path/to/SKILL.md>
    python scripts/score.py <path/to/skill_dir>
    python scripts/score.py --agent-prompt <path/to/skill_dir> > agent-deep-review-prompt.md
    python scripts/score.py --llm-results agent-llm-results.json <path/to/skill_dir>

输出: JSON 格式评分报告到 stdout。
依赖: PyYAML (pip install pyyaml)

注意: 默认模式仅给出规则分预览。agent-side Deep Review 使用 --agent-prompt
     生成官方提示词，由 code agent 使用自己的模型套餐产出 JSON，再用 --llm-results
     交回本 CLI 校验与聚合。规则实现应与 web/lib/scoring/rules.ts 保持逻辑等价。
"""
from __future__ import annotations

import argparse
import contextlib
import json
import re
import sys
import tempfile
import zipfile
from hashlib import sha256
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

try:
    import yaml
except ImportError:
    sys.stderr.write("需要 pyyaml: pip install pyyaml\n")
    sys.exit(1)

# Local renderer for HTML / Markdown export (script directory is on sys.path).
sys.path.insert(0, str(Path(__file__).parent))
import render_report  # noqa: E402  # type: ignore[import-not-found]


RUBRIC_PATH = Path(__file__).parent.parent / "rubric" / "rubric.yaml"
DOMAINS_DIR = Path(__file__).parent.parent / "domains"
ENGINE_NAME = "skilllens-python-cli"
ENGINE_VERSION = "0.3.0"
VALUE_TYPES = {"productivity", "decision_support", "learning", "emotion_expression", "utility"}


# --------- 解析 ---------

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


@dataclass
class SubSkill:
    """A child SKILL.md discovered inside a multi-skill / pipeline package."""

    path: str  # relative path inside the package, e.g. "agents/reviewer/SKILL.md"
    name: str = ""
    description: str = ""
    body_chars: int = 0
    # Full body text (frontmatter stripped). Kept in memory so rule-class checks
    # such as `rel.pipeline_subskill_quality.self_contained` can scan section
    # headings without re-reading the file. Bounded by sub-skill count, not size.
    body: str = ""


@dataclass
class CanonicalSkill:
    spec: str = "claude"
    language: str = "en"
    meta: dict = field(default_factory=dict)
    body: str = ""
    sections: list[tuple[int, str]] = field(default_factory=list)  # (level, title)
    files: list[str] = field(default_factory=list)
    raw_path: Path | None = None
    sub_skills: list[SubSkill] = field(default_factory=list)
    # "atomic" | "pipeline" | "composite" — heuristic guess based on layout.
    # Final report uses skill_type (see score_skill) which can be overridden by the user.
    auto_detected_type: str = "atomic"


def parse_skill(path: Path) -> CanonicalSkill:
    sub_skills: list[SubSkill] = []
    if path.is_dir():
        md = path / "SKILL.md"
        if not md.exists():
            raise FileNotFoundError(f"未找到 {md}")
        files = [str(p.relative_to(path)) for p in path.rglob("*") if p.is_file()]
        # Discover child SKILL.md (excluding the root) so pipeline packages
        # are treated as a first-class concept by the downstream prompt + report.
        for sub_md in sorted(path.rglob("SKILL.md")):
            if sub_md.resolve() == md.resolve():
                continue
            try:
                rel = str(sub_md.relative_to(path))
                sub_meta, sub_body = _parse_frontmatter(sub_md.read_text(encoding="utf-8"))
                sub_skills.append(
                    SubSkill(
                        path=rel,
                        name=str(sub_meta.get("name", "")) if isinstance(sub_meta, dict) else "",
                        description=str(sub_meta.get("description", "")) if isinstance(sub_meta, dict) else "",
                        body_chars=len(sub_body),
                        body=sub_body,
                    )
                )
            except (OSError, UnicodeDecodeError):
                # Best effort — never block scoring on a malformed sub SKILL.md.
                continue
    else:
        md = path
        files = [md.name]

    raw = md.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(raw)

    sections = [(len(h.group(1)), h.group(2).strip()) for h in re.finditer(r"^(#{1,6})\s+(.+)$", body, re.M)]
    skill = CanonicalSkill(
        meta=meta,
        body=body,
        sections=sections,
        files=files,
        raw_path=md,
        sub_skills=sub_skills,
        auto_detected_type="pipeline" if sub_skills else "atomic",
    )
    skill.spec = detect_spec(skill)
    skill.language = detect_language(body)
    return skill


def _parse_frontmatter(raw: str) -> tuple[dict, str]:
    """Return (meta, body). Tolerates malformed YAML frontmatter."""
    m = FRONTMATTER_RE.match(raw)
    meta: dict[str, Any] = {}
    body = raw
    if m:
        try:
            meta = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            meta = {"__parse_error__": True}
        body = m.group(2)
    return meta, body


def detect_spec(s: CanonicalSkill) -> str:
    if s.raw_path and (s.raw_path.parent / "skill.yaml").exists():
        return "openclaw"
    return "claude"


def detect_language(text: str) -> str:
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return "zh" if cjk / max(len(text), 1) > 0.05 else "en"


# --------- 规则引擎 ---------

def run_rule(check_id: str, skill: CanonicalSkill, rubric: dict) -> tuple[str, str]:
    """返回 (status, evidence)。status ∈ pass / partial / fail / n_a。
    注意：本函数与 web/lib/scoring/rules.ts 必须保持行为等价。"""
    meta, body = skill.meta, skill.body
    spec_cfg = rubric["specs"][skill.spec]
    desc = str(meta.get("description", "")) if isinstance(meta, dict) else ""

    if check_id == "meta.frontmatter_valid":
        ok = isinstance(meta, dict) and not meta.get("__parse_error__") and bool(meta)
        return ("pass" if ok else "fail", "frontmatter parsed" if ok else "missing or invalid")

    if check_id == "meta.required_fields":
        req = spec_cfg["required_fields"]
        missing = [f for f in req if f not in meta]
        if not missing:
            return ("pass", f"all present: {req}")
        return ("partial" if len(missing) < len(req) else "fail", f"missing: {missing}")

    if check_id == "meta.recommended_fields":
        rec = spec_cfg.get("recommended_fields", [])
        if not rec:
            return ("pass", "n/a")
        present = [f for f in rec if f in meta]
        if len(present) == len(rec):
            return ("pass", f"all present: {rec}")
        return ("partial" if present else "fail",
                f"present: {present}; missing: {[f for f in rec if f not in meta]}")

    if check_id == "meta.name_format":
        name = meta.get("name", "")
        ok = bool(re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(name)))
        return ("pass" if ok else "fail", f"name={name!r}")

    if check_id == "disc.length_ok":
        budget = spec_cfg["desc_budget_chars"]
        n = len(desc)
        if n == 0:
            return ("fail", "empty description")
        if n > budget:
            return ("partial", f"{n} > {budget} chars")
        if n < 40:
            return ("partial", f"only {n} chars, likely too short")
        return ("pass", f"{n} chars (<= {budget})")

    if check_id == "disc.has_trigger_cue":
        cues = [r"use when", r"用于", r"当用户", r"适用于", r"triggered when", r"when the user"]
        hit = any(re.search(c, desc, re.I) for c in cues)
        return ("pass" if hit else "fail", "trigger cue " + ("found" if hit else "missing"))

    if check_id == "disc.third_person":
        bad = re.search(r"\b(I will|I'll)\b|我将|我会", desc, re.I)
        return ("fail", f"first-person found: {bad.group(0)}") if bad else ("pass", "third-person ok")

    if check_id == "struct.has_headings":
        h2 = sum(1 for lvl, _ in skill.sections if lvl == 2)
        return ("pass" if h2 >= 2 else ("partial" if h2 == 1 else "fail"), f"{h2} H2 sections")

    if check_id == "struct.has_workflow":
        titles = " | ".join(t.lower() for _, t in skill.sections)
        hit = any(k in titles for k in ["workflow", "步骤", "流程", "steps", "how it works"])
        return ("pass" if hit else "fail", "workflow section " + ("found" if hit else "missing"))

    if check_id == "struct.md_well_formed":
        fences = body.count("```")
        ok = fences % 2 == 0
        return ("pass" if ok else "fail", f"{fences} code fences, {'balanced' if ok else 'UNBALANCED'}")

    if check_id == "act.tool_calls_clear":
        has_code = "```" in body
        return ("pass" if has_code else "partial", "code blocks present" if has_code else "no code blocks")

    if check_id == "act.has_examples":
        titles = " | ".join(t.lower() for _, t in skill.sections)
        hit = bool(re.search(r"example|示例|样例|usage|用法", body, re.I)) or \
              bool(re.search(r"example|示例|usage|用法", titles, re.I))
        return ("pass" if hit else "fail", "example keyword " + ("found" if hit else "missing"))

    # ---- runtime_cost ----
    if check_id == "cost.context_budget.skill_md_size":
        n = len(body)
        if n <= 6000:
            return ("pass", f"{n} chars (~{n // 3} tokens)")
        if n <= 12000:
            return ("partial", f"{n} chars (recommend <= 6000)")
        return ("fail", f"{n} chars is too long; every call pays this")

    if check_id == "cost.reference_layering.has_dirs":
        has_sub = any(d in f for f in skill.files for d in ["references/", "scripts/", "assets/"])
        single = len(skill.files) <= 1
        if single:
            return ("partial", "single-file upload; cannot verify layered dirs")
        return ("pass" if has_sub else "partial", "layered dirs " + ("detected" if has_sub else "not used"))

    if check_id == "cost.external_dependencies.declared":
        dep_files = ["requirements.txt", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"]
        has_manifest = any(any(f.lower().endswith(d.lower()) for d in dep_files) for f in skill.files)
        has_dep_heading = any(re.match(r"^(dependenc|依赖|requirements?|external|api keys?|cost)", t.strip(), re.I)
                              for _, t in skill.sections)
        if has_manifest and has_dep_heading:
            return ("pass", "manifest + dependencies section found")
        if has_manifest or has_dep_heading:
            return ("partial", "manifest only" if has_manifest else "doc only")
        return ("fail", "no dependencies declared")

    # ---- reliability ----
    if check_id == "rel.script_fallback.has_scripts":
        has_scripts_dir = any(f.startswith("scripts/") for f in skill.files)
        has_code_files = any(re.search(r"\.(py|js|ts|sh|rb|go|rs)$", f, re.I) for f in skill.files)
        single = len(skill.files) <= 1
        if single:
            return ("partial", "single-file upload; cannot verify scripts/")
        if has_scripts_dir:
            return ("pass", "scripts/ directory present")
        if has_code_files:
            return ("partial", "some code files present, no dedicated scripts/")
        return ("fail", "no scripts; pure prose skill")

    if check_id == "rel.output_validation.declared":
        titles = " | ".join(t.lower() for _, t in skill.sections)
        has_outputs = bool(re.search(r"output|输出|returns?|结果", titles, re.I))
        has_schema_hint = bool(re.search(r"\bjson schema\b|jsonschema|pydantic|zod|interface\s+\w+|\"type\":\s*\"|字段[:：]", body, re.I))
        if has_outputs and has_schema_hint:
            return ("pass", "outputs section + schema-like declaration")
        if has_outputs:
            return ("partial", "outputs section but no schema")
        return ("fail", "no outputs section, no schema")

    if check_id == "safe.dangerous_ops_flagged":
        dangers = re.findall(r"rm -rf|git push --force|DROP TABLE|--no-verify", body, re.I)
        if not dangers:
            return ("pass", "no destructive ops")
        flagged = bool(re.search(r"warning|警告|危险|caution|confirm", body, re.I))
        return ("pass" if flagged else "partial", f"{len(dangers)} destructive ops; flagged={flagged}")

    if check_id == "safe.secrets_policy":
        leak = re.search(r"(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,})", body)
        return ("fail", f"potential key: {leak.group(0)[:10]}...") if leak else ("pass", "no literal keys")

    if check_id == "maint.has_version":
        return ("pass" if "version" in meta else "fail", f"version={meta.get('version')}")

    if check_id == "maint.declares_deps":
        dep_files = ["requirements.txt", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"]
        hit = any(any(f.lower().endswith(d.lower()) for d in dep_files) for f in skill.files)
        in_body = bool(re.search(r"depend|依赖|requirement|环境", body, re.I))
        return ("pass" if hit else ("partial" if in_body else "fail"),
                "dep file found" if hit else ("mentioned in body" if in_body else "none"))

    if check_id == "maint.has_tests":
        hit = any("test" in f.lower() for f in skill.files)
        single = len(skill.files) <= 1
        if single:
            return ("partial", "single-file upload; cannot verify tests")
        return ("pass" if hit else "fail", "test file " + ("found" if hit else "missing"))

    # ---- pipeline-only rule checks (skipped by check_applies for atomic/composite) ----
    if check_id == "rel.pipeline_subskill_quality.self_contained":
        # A sub-SKILL.md is "self-contained" when it carries the basic atomic skill
        # sections itself, so it can be reviewed and called independently of the
        # root. We look for: (a) at least one of When-to-use/Trigger and (b) at
        # least one of Workflow/Steps. These are the minimal contract a sub-agent
        # must declare; without them the root is doing all the work and the
        # sub-skill is just a label.
        if not skill.sub_skills:
            # Should not happen — applies_to=[pipeline] guarantees we have subs.
            return ("n_a", "no sub-skills detected")
        section_pat = re.compile(
            r"^#{1,6}\s+(.+)$", re.M
        )
        when_pat = re.compile(r"when to use|trigger|何时使用|触发|适用", re.I)
        flow_pat = re.compile(r"workflow|steps?|流程|步骤|how it works", re.I)
        weak: list[str] = []
        for s in skill.sub_skills:
            content = s.body or ""
            heads = [m.group(1).strip() for m in section_pat.finditer(content)]
            head_blob = " | ".join(heads)
            has_when = bool(when_pat.search(head_blob)) or bool(when_pat.search(content[:400]))
            has_flow = bool(flow_pat.search(head_blob))
            if not (has_when and has_flow):
                missing = []
                if not has_when:
                    missing.append("when-to-use")
                if not has_flow:
                    missing.append("workflow")
                weak.append(f"{s.path} (missing {','.join(missing)})")
        total = len(skill.sub_skills)
        ok = total - len(weak)
        if not weak:
            return ("pass", f"all {total} sub-skills carry when-to-use + workflow sections")
        if ok == 0:
            return ("fail", f"0/{total} sub-skills self-contained; e.g. {weak[0]}")
        ratio = ok / total
        sample = "; ".join(weak[:3]) + (f"; +{len(weak) - 3} more" if len(weak) > 3 else "")
        if ratio >= 0.6:
            return ("partial", f"{ok}/{total} self-contained; weak: {sample}")
        return ("fail", f"{ok}/{total} self-contained; weak: {sample}")

    if check_id == "maint.has_changelog":
        hit = any("changelog" in f.lower() for f in skill.files) \
              or bool(re.search(r"changelog|更新日志", body, re.I))
        return ("pass" if hit else "fail", "changelog " + ("found" if hit else "missing"))

    if check_id == "port.spec_agnostic_frontmatter":
        known = {"name", "description", "version", "license", "tags", "author"}
        weird = [k for k in meta if k not in known and not str(k).startswith("__")]
        return ("pass" if not weird else "partial", f"extra fields: {weird}" if weird else "clean")

    return ("n_a", "rule not implemented (LLM check expected)")


# --------- 聚合 ---------

STATUS_SCORE = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "n_a": None, "not_applicable": None}


def check_applies(c: dict, skill_type: str) -> bool:
    """Whether a check should be evaluated for the given skill_type.

    A check declares its scope via the optional ``applies_to`` field
    (e.g. ``[atomic, composite]``). Without that field the check applies
    universally. When a check is filtered out we emit it with
    ``status="not_applicable"``, ``ratio=None`` and exclude it from
    earned/denom — so the dimension score auto-renormalizes over the
    remaining checks, and the filtered check never makes it into the
    Top suggestions list.
    """
    scope = c.get("applies_to")
    if not scope:
        return True
    return skill_type in scope


def not_applicable_evidence(c: dict, skill_type: str, lang: str = "en") -> str:
    """Human-readable reason for a skipped check."""
    scope = c.get("applies_to") or []
    if lang == "zh":
        return f"对 skill_type={skill_type} 不适用（仅适用于 {', '.join(scope)}）"
    return f"Not applicable for skill_type={skill_type} (scoped to {', '.join(scope)})"


def check_transparency(c: dict) -> dict:
    """与 web/lib/scoring/aggregate.ts 的 inferTransparency 保持语义一致。"""
    if c.get("evidence_source") and c.get("confidence_policy"):
        return {"evidenceSource": c["evidence_source"], "confidencePolicy": c["confidence_policy"]}

    cid = c["id"]
    if c["type"] == "rule":
        return {"evidenceSource": "doc_check", "confidencePolicy": "high"}
    if cid == "market.existing_alternatives.surveyed":
        return {"evidenceSource": "external_data", "confidencePolicy": "medium"}
    if (
        cid.startswith("biz.")
        or cid in {
            "market.differentiation.clear",
            "market.scope_focus.disciplined",
            "market.llm_replaceable.has_edge",
            "rel.task_model_fit.in_zone",
            "disc.keyword_coverage",
        }
    ):
        return {"evidenceSource": "llm_judgment", "confidencePolicy": "medium"}
    return {"evidenceSource": "doc_check", "confidencePolicy": "high"}


SKILL_TYPE_CHOICES = ("auto", "atomic", "pipeline", "composite")
LLM_LANGUAGE_CHOICES = ("auto", "zh", "en")


def resolve_llm_language(skill_lang: str, requested: str | None) -> str:
    """Decide the language LLM should use for evidence / fix / value_type_reason.

    'auto' (default) follows the skill's detected language so a Chinese
    SKILL.md gets Chinese feedback and an English one gets English. An
    explicit 'zh' or 'en' overrides this — useful when reviewers want a
    Chinese report on an English skill, etc.
    """
    if not requested or requested == "auto":
        return "zh" if skill_lang == "zh" else "en"
    if requested not in LLM_LANGUAGE_CHOICES:
        raise ValueError(f"invalid llm_language: {requested}; expected one of {LLM_LANGUAGE_CHOICES}")
    return requested


def resolve_skill_type(skill: CanonicalSkill, requested: str | None) -> tuple[str, bool]:
    """Resolve final skill_type and whether it was auto-detected.

    Returns (skill_type, auto_detected_bool).
      requested == None / "auto"  -> use skill.auto_detected_type
      requested == "atomic" / "pipeline" / "composite" -> use as-is
    """
    if not requested or requested == "auto":
        return skill.auto_detected_type, True
    if requested not in SKILL_TYPE_CHOICES:
        raise ValueError(f"invalid skill_type: {requested}; expected one of {SKILL_TYPE_CHOICES}")
    return requested, False


def score_skill(
    path: Path,
    llm_payload: dict | None = None,
    domain: str | None = None,
    scenario: str | None = None,
    skill_type: str | None = None,
) -> dict:
    rubric_text = RUBRIC_PATH.read_text(encoding="utf-8")
    rubric = yaml.safe_load(rubric_text)
    rubric_hash = sha256(rubric_text.encode("utf-8")).hexdigest()[:16]
    domain_cfg, domain_hash = load_domain_config(domain) if domain else (None, None)
    scenario_id = normalize_domain_scenario(domain_cfg, scenario) if domain_cfg else None
    skill = parse_skill(path)
    resolved_type, auto_detected = resolve_skill_type(skill, skill_type)
    llm_results, llm_meta = normalize_llm_payload(llm_payload, rubric, domain_cfg, scenario_id) if llm_payload else ({}, None)
    out_pillars = []
    total = 0.0
    llm_total = 0
    llm_evaluated = 0

    for pillar in rubric["pillars"]:
        pillar_id = pillar["id"]
        pillar_target_weight = pillar["weight"]
        # applies_to renormalization: a dim whose checks are *all* filtered out
        # for this skill_type must NOT keep its weight in the pillar denominator
        # (otherwise it silently caps the pillar score at "missing 4 points"
        # forever). We exclude such dims from sum_dim_weights so the remaining
        # dims auto-renormalize to fill the full pillar budget.
        applicable_dim_weights = [
            d["weight"] for d in pillar["dimensions"]
            if any(check_applies(c, resolved_type) for c in d["checks"])
        ]
        sum_dim_weights = sum(applicable_dim_weights) or 1
        scale = pillar_target_weight / sum_dim_weights

        out_dims = []
        pillar_score_internal = 0.0
        llm_in_pillar = 0
        llm_eval_in_pillar = 0

        for dim in pillar["dimensions"]:
            dim_weight = dim["weight"]
            earned = 0.0
            denom = 0.0
            checks_out = []
            applicable_check_count = 0
            for c in dim["checks"]:
                # applies_to: filter out checks that don't apply to this skill_type
                # before doing any rule/LLM work. Emit a visible "not_applicable"
                # entry so the report can show which checks were filtered.
                if not check_applies(c, resolved_type):
                    transparency = check_transparency(c)
                    checks_out.append({
                        "id": c["id"], "type": c["type"], "status": "not_applicable",
                        "evidence": not_applicable_evidence(c, resolved_type, skill.language),
                        "weight": c["weight"], "ratio": None,
                        "appliesTo": list(c.get("applies_to") or []),
                        **transparency,
                    })
                    continue
                applicable_check_count += 1
                if c["type"] == "llm":
                    llm_in_pillar += 1
                    llm_total += 1
                if c["type"] == "rule":
                    status, evidence = run_rule(c["id"], skill, rubric)
                    ratio = STATUS_SCORE[status]
                    fix = None
                    confidence = None
                else:
                    llm_result = llm_results.get(c["id"])
                    if llm_result:
                        status = llm_result["status"]
                        evidence = llm_result["evidence"]
                        ratio = llm_result["ratio"]
                        fix = llm_result.get("fix")
                        confidence = llm_result.get("confidence")
                    else:
                        status, evidence = "n_a", "LLM check (skipped in CLI)"
                        ratio = None
                        fix = None
                        confidence = None
                transparency = check_transparency(c)
                check_out = {"id": c["id"], "type": c["type"], "status": status,
                             "evidence": evidence, "weight": c["weight"], "ratio": ratio, **transparency}
                if fix:
                    check_out["fix"] = fix
                if confidence is not None:
                    check_out["confidence"] = confidence
                checks_out.append(check_out)
                if c["type"] == "llm" and ratio is not None:
                    llm_eval_in_pillar += 1
                    llm_evaluated += 1
                if ratio is not None:
                    earned += ratio * c["weight"]
                    denom += c["weight"]
            if applicable_check_count == 0:
                # All checks in this dim were filtered out by applies_to —
                # the dim itself is "not applicable for this skill_type".
                # weight=0 + score=None means: visible in UI, marked as "—",
                # but contributes nothing to the pillar (already excluded above).
                out_dims.append({
                    "id": dim["id"], "name_zh": dim["name_zh"], "name_en": dim["name_en"],
                    "weight": 0, "score": None,
                    "notApplicable": True,
                    "originalWeight": dim_weight,
                    "checks": checks_out,
                })
                continue
            dim_score = (earned / denom) * dim_weight if denom else 0.0
            pillar_score_internal += dim_score
            out_dims.append({"id": dim["id"], "name_zh": dim["name_zh"], "name_en": dim["name_en"],
                             "weight": dim_weight, "score": round(dim_score, 2), "checks": checks_out})

        pillar_final = pillar_score_internal * scale
        total += pillar_final
        out_pillars.append({
            "id": pillar_id,
            "name_zh": pillar["name_zh"],
            "name_en": pillar["name_en"],
            "weight": pillar_target_weight,
            "score": round(pillar_final, 2),
            "evaluated": llm_in_pillar == 0 or llm_eval_in_pillar == llm_in_pillar,
            "llmCoverage": {"evaluated": llm_eval_in_pillar, "total": llm_in_pillar},
            "dimensions": out_dims,
        })

    bonus_total = 0.0
    bonus_out = []
    for bonus in rubric.get("bonus", []):
        earned = 0.0
        denom = 0.0
        checks_out = []
        llm_in_bonus = 0
        llm_eval_in_bonus = 0
        for c in bonus.get("checks", []):
            if not check_applies(c, resolved_type):
                transparency = check_transparency(c)
                checks_out.append({
                    "id": c["id"], "type": c["type"], "status": "not_applicable",
                    "evidence": not_applicable_evidence(c, resolved_type, skill.language),
                    "weight": c["weight"], "ratio": None,
                    "appliesTo": list(c.get("applies_to") or []),
                    **transparency,
                })
                continue
            if c["type"] == "llm":
                llm_in_bonus += 1
                llm_total += 1
            if c["type"] == "rule":
                status, evidence = run_rule(c["id"], skill, rubric)
                ratio = STATUS_SCORE[status]
                fix = None
                confidence = None
            else:
                llm_result = llm_results.get(c["id"])
                if llm_result:
                    status = llm_result["status"]
                    evidence = llm_result["evidence"]
                    ratio = llm_result["ratio"]
                    fix = llm_result.get("fix")
                    confidence = llm_result.get("confidence")
                else:
                    status, evidence = "n_a", "LLM check (skipped in CLI)"
                    ratio = None
                    fix = None
                    confidence = None
            transparency = check_transparency(c)
            check_out = {"id": c["id"], "type": c["type"], "status": status,
                         "evidence": evidence, "weight": c["weight"], "ratio": ratio, **transparency}
            if fix:
                check_out["fix"] = fix
            if confidence is not None:
                check_out["confidence"] = confidence
            checks_out.append(check_out)
            if c["type"] == "llm" and ratio is not None:
                llm_eval_in_bonus += 1
                llm_evaluated += 1
            if ratio is not None:
                earned += ratio * c["weight"]
                denom += c["weight"]
        bonus_score = (earned / denom) * bonus.get("max", 0) if denom else 0.0
        bonus_total += bonus_score
        bonus_out.append({
            "id": bonus["id"],
            "max": bonus.get("max", 0),
            "score": round(bonus_score, 2),
            "llmCoverage": {"evaluated": llm_eval_in_bonus, "total": llm_in_bonus},
            "checks": checks_out,
        })

    grade = next(g["grade"] for g in rubric["grades"] if total >= g["min"])
    llm_complete = llm_total == 0 or llm_evaluated == llm_total
    report = {
        "engine": ENGINE_NAME,
        "engineVersion": ENGINE_VERSION,
        "source": "official SkillLens CLI",
        "mode": "agent-side deep review" if llm_payload else "rule-only preview",
        "rubricSchemaVersion": rubric.get("schema_version"),
        "rubricHash": rubric_hash,
        "spec": skill.spec,
        "language": skill.language,
        "skillType": resolved_type,
        "skillTypeAutoDetected": auto_detected,
        "subSkills": [
            {
                "path": s.path,
                "name": s.name,
                "description": s.description,
                "bodyChars": s.body_chars,
            }
            for s in skill.sub_skills
        ],
        "score": round(total, 2),
        "grade": grade,
        "pillars": out_pillars,
        "bonus": round(bonus_total, 2),
        "bonusChecks": bonus_out,
        "llmComplete": llm_complete,
        "suggestions": _build_suggestions(out_pillars, rubric, skill.language),
    }
    if llm_meta:
        report["llmMeta"] = llm_meta
    if domain_cfg:
        report["domainExpert"] = score_domain_expert(domain_cfg, llm_results, scenario_id or "other", skill.language)
    if llm_payload:
        report["deepReviewCertificate"] = {
            "status": "verified" if llm_complete else "incomplete",
            "workflow": "agent-prompt -> agent-llm-results -> official-cli-merge",
            "source": "official SkillLens CLI",
            "engine": ENGINE_NAME,
            "engineVersion": ENGINE_VERSION,
            "rubricHash": rubric_hash,
            "llmResultsHash": hash_json(llm_payload),
            "llmComplete": llm_complete,
        }
        if domain_cfg:
            report["deepReviewCertificate"]["domain"] = domain_cfg.get("domain")
            report["deepReviewCertificate"]["scenario"] = scenario_id
            report["deepReviewCertificate"]["domainRubricHash"] = domain_hash
    return report


def normalize_llm_payload(
    payload: dict,
    rubric: dict,
    domain_cfg: dict | None = None,
    scenario: str | None = None,
) -> tuple[dict[str, dict], dict | None]:
    if not isinstance(payload, dict):
        raise ValueError("llm results must be a JSON object")
    raw_results = payload.get("results")
    if not isinstance(raw_results, dict):
        raise ValueError("llm results JSON must contain object field: results")

    expected = {c["id"] for c in iter_checks(rubric) if c["type"] == "llm"}
    if domain_cfg:
        expected.update(c["id"] for c in iter_domain_checks(domain_cfg, scenario))
    missing = sorted(expected - set(raw_results))
    if missing:
        raise ValueError(f"llm results missing {len(missing)} checks: {', '.join(missing[:8])}")

    normalized: dict[str, dict] = {}
    for check_id in sorted(expected):
        raw = raw_results.get(check_id)
        if not isinstance(raw, dict):
            raise ValueError(f"llm result for {check_id} must be an object")
        ratio = clamp01(raw.get("ratio"))
        evidence = str(raw.get("evidence") or "").strip()[:400]
        if not evidence:
            raise ValueError(f"llm result for {check_id} missing evidence")
        confidence_raw = raw.get("confidence")
        confidence = clamp01(confidence_raw) if confidence_raw is not None else None
        ratio = normalize_ratio(check_id, ratio, evidence, confidence)
        out = {
            "ratio": ratio,
            "status": ratio_to_status(ratio),
            "evidence": evidence,
        }
        fix = str(raw.get("fix") or "").strip()[:500]
        if fix:
            out["fix"] = fix
        if confidence is not None:
            out["confidence"] = confidence
        normalized[check_id] = out

    raw_meta = payload.get("meta")
    meta = None
    if isinstance(raw_meta, dict):
        vt = str(raw_meta.get("value_type") or "").strip()
        reason = str(raw_meta.get("value_type_reason") or "").strip()[:200]
        meta = {}
        if vt in VALUE_TYPES:
            meta["value_type"] = vt
        if reason:
            meta["value_type_reason"] = reason
        if not meta:
            meta = None
    return normalized, meta


def hash_json(payload: Any) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()[:16]


def iter_checks(rubric: dict):
    for pillar in rubric.get("pillars", []):
        for dim in pillar.get("dimensions", []):
            for check in dim.get("checks", []):
                yield check
    for bonus in rubric.get("bonus", []):
        for check in bonus.get("checks", []):
            yield check


def load_domain_config(domain: str | None) -> tuple[dict | None, str | None]:
    if not domain:
        return None, None
    if domain != "finance":
        raise ValueError(f"unsupported domain expert mode: {domain}")
    path = DOMAINS_DIR / domain / "rubric.yaml"
    text = path.read_text(encoding="utf-8")
    return yaml.safe_load(text), sha256(text.encode("utf-8")).hexdigest()[:16]


def normalize_domain_scenario(domain_cfg: dict | None, scenario: str | None) -> str:
    scenarios = (domain_cfg or {}).get("scenarios", {})
    if not scenario:
        return "other" if "other" in scenarios else next(iter(scenarios), "other")
    if scenario not in scenarios:
        raise ValueError(f"unsupported scenario for {domain_cfg.get('domain')}: {scenario}")
    return scenario


def domain_pillars_for_scenario(domain_cfg: dict, scenario: str | None) -> list[dict]:
    profile = (domain_cfg.get("scenario_profiles") or {}).get(scenario or "", {})
    pillar_weights = profile.get("pillar_weights") or {}
    extra_checks = profile.get("extra_checks") or {}
    out = []
    for pillar in domain_cfg.get("pillars", []):
        cloned = dict(pillar)
        cloned["weight"] = pillar_weights.get(pillar["id"], pillar.get("weight", 0))
        cloned["checks"] = [
            *pillar.get("checks", []),
            *extra_checks.get(pillar["id"], []),
        ]
        out.append(cloned)
    return out


def iter_domain_checks(domain_cfg: dict, scenario: str | None = None):
    for pillar in domain_pillars_for_scenario(domain_cfg, scenario):
        for check in pillar.get("checks", []):
            yield check


def score_domain_expert(domain_cfg: dict, llm_results: dict[str, dict], scenario: str, lang: str) -> dict:
    pillars_out = []
    total = 0.0
    evaluated = 0
    total_checks = 0
    suggestions = []
    for pillar in domain_pillars_for_scenario(domain_cfg, scenario):
        earned = 0.0
        denom = 0.0
        checks_out = []
        for c in pillar.get("checks", []):
            total_checks += 1
            result = llm_results.get(c["id"])
            if result:
                evaluated += 1
                ratio = result["ratio"]
                status = result["status"]
                evidence = result["evidence"]
                fix = result.get("fix")
                confidence = result.get("confidence")
                earned += ratio * c["weight"]
                denom += c["weight"]
            else:
                ratio = None
                status = "n_a"
                evidence = "LLM check (skipped in CLI)"
                fix = None
                confidence = None
            item = {
                "id": c["id"],
                "status": status,
                "weight": c["weight"],
                "ratio": ratio,
                "evidence": evidence,
            }
            if fix:
                item["fix"] = fix
            if confidence is not None:
                item["confidence"] = confidence
            checks_out.append(item)
            if status in {"fail", "partial"}:
                suggestions.append({
                    "checkId": c["id"],
                    "pillarId": pillar["id"],
                    "severity": "high" if status == "fail" else "medium",
                    "title": c.get("desc_zh" if lang == "zh" else "desc_en", c["id"]),
                    "why": evidence,
                    "how": fix or ("补充可验证的金融证据、边界和风控流程" if lang == "zh" else "Add verifiable finance evidence, boundaries, and risk controls"),
                    "weight": c["weight"],
                })
        pillar_score = (earned / denom) * pillar["weight"] if denom else 0.0
        total += pillar_score
        pillars_out.append({
            "id": pillar["id"],
            "name_zh": pillar["name_zh"],
            "name_en": pillar["name_en"],
            "weight": pillar["weight"],
            "score": round(pillar_score, 2),
            "checks": checks_out,
        })

    scenario_meta = domain_cfg.get("scenarios", {}).get(scenario, {})
    risk_score = next((p["score"] for p in pillars_out if p["id"] == "finance.risk_compliance"), 0.0)
    risk_level = finance_risk_level(total, risk_score)
    return {
        "domain": domain_cfg.get("domain"),
        "schemaVersion": domain_cfg.get("schema_version"),
        "scenario": scenario,
        "scenarioNameZh": scenario_meta.get("name_zh", scenario),
        "scenarioNameEn": scenario_meta.get("name_en", scenario),
        "score": round(total, 2),
        "grade": finance_grade(total),
        "riskLevel": risk_level,
        "commercialReadiness": finance_commercial_readiness(total),
        "llmComplete": evaluated == total_checks,
        "llmCoverage": {"evaluated": evaluated, "total": total_checks},
        "pillars": pillars_out,
        "suggestions": sorted(suggestions, key=lambda s: -s["weight"])[:6],
    }


def finance_grade(score: float) -> str:
    if score >= 90:
        return "Expert-Ready"
    if score >= 80:
        return "Strong"
    if score >= 65:
        return "Promising"
    if score >= 50:
        return "Needs Review"
    return "High Risk"


def finance_risk_level(score: float, risk_score: float) -> str:
    if risk_score < 8 or score < 50:
        return "critical"
    if risk_score < 13 or score < 65:
        return "high"
    if risk_score < 16 or score < 80:
        return "medium"
    return "low"


def finance_commercial_readiness(score: float) -> str:
    if score >= 85:
        return "paid-ready"
    if score >= 70:
        return "pilot-ready"
    if score >= 55:
        return "internal-preview"
    return "not-ready"


def clamp01(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if n != n:
        return 0.0
    return max(0.0, min(1.0, n))


def ratio_to_status(ratio: float) -> str:
    if ratio >= 0.85:
        return "pass"
    if ratio >= 0.4:
        return "partial"
    return "fail"


def normalize_ratio(check_id: str, ratio: float, evidence: str, confidence: float | None = None) -> float:
    calibrated = ratio
    if check_id == "biz.target_users.specific":
        lower = evidence.lower()
        inferable = bool(re.search(r"可推断|推断出|inferable|inferred|can infer", evidence)) or "target users can be inferred" in lower
        unclear = bool(re.search(r"不清晰|不明确|所有人|任何人|unclear|anyone|everyone", evidence))
        if inferable and not unclear:
            calibrated = max(calibrated, 0.85)

    calibrated = min(calibrated, 0.96)
    if confidence is not None:
        if confidence < 0.5:
            calibrated = min(calibrated, 0.72)
        elif confidence < 0.65:
            calibrated = min(calibrated, 0.82)
        elif confidence < 0.8:
            calibrated = min(calibrated, 0.9)
    return round(calibrated, 2)


def render_agent_prompt(
    path: Path,
    domain: str | None = None,
    scenario: str | None = None,
    skill_type: str | None = None,
    llm_language: str | None = None,
) -> str:
    rubric = yaml.safe_load(RUBRIC_PATH.read_text(encoding="utf-8"))
    domain_cfg, _domain_hash = load_domain_config(domain) if domain else (None, None)
    scenario_id = normalize_domain_scenario(domain_cfg, scenario) if domain_cfg else None
    skill = parse_skill(path)
    resolved_type, _auto = resolve_skill_type(skill, skill_type)
    lang = skill.language
    output_lang = resolve_llm_language(lang, llm_language)
    # applies_to: skip LLM checks that don't apply to this skill_type so the
    # model isn't asked to evaluate (and isn't tempted to fabricate evidence
    # for) checks that will be marked not_applicable downstream.
    checks = [c for c in iter_checks(rubric) if c["type"] == "llm" and check_applies(c, resolved_type)]
    if domain_cfg:
        checks.extend(iter_domain_checks(domain_cfg, scenario_id))
    checks_block = "\n".join(
        f"- id: {c['id']}\n  criterion: {c['desc_zh'] if lang == 'zh' else c['desc_en']}"
        for c in checks
    )
    meta_json = json.dumps(skill.meta, ensure_ascii=False, indent=2)
    files_block = render_supporting_files(skill)
    system = SYSTEM_PROMPT_ZH if lang == "zh" else SYSTEM_PROMPT_EN
    body_label = "被测 skill 所属规范" if lang == "zh" else "Target skill spec"
    files_heading = "## 附属文件预览" if lang == "zh" else "## Supporting file previews"
    checks_heading = "## 需要你评估的细则" if lang == "zh" else "## Checks to evaluate"
    domain_block = render_domain_prompt_block(domain_cfg, scenario_id, lang)
    skill_type_block = render_skill_type_block(resolved_type, skill.sub_skills, lang)
    language_block = render_language_block(output_lang)
    final_instruction = (
        "请严格返回 JSON；不要输出 Markdown 代码块；不要解释。保存为 agent-llm-results.json 后运行官方 CLI 合并。"
        if lang == "zh"
        else "Return strict JSON only; no Markdown fences; no explanation. Save as agent-llm-results.json, then run the official CLI merge step."
    )
    return f"""{system}

---

{body_label}: {skill.spec}

{skill_type_block}
{language_block}
## frontmatter
```yaml
{meta_json}
```

## SKILL.md body
```markdown
{skill.body}
```

{files_heading}
{files_block or "(none)"}

{domain_block}

{checks_heading}
{checks_block}

{final_instruction}
"""


def render_skill_type_block(skill_type: str, sub_skills: list[SubSkill], lang: str) -> str:
    """Tell the LLM whether it's evaluating an atomic skill, pipeline, or composite bundle.

    A pipeline orchestrator typically delegates real workflow / schema / examples to
    child SKILL.md or to companion code. Without this signal the model defaults to
    'atomic doc' standards and unfairly penalizes legitimate pipeline structure.
    """
    if lang == "zh":
        if skill_type == "pipeline":
            sub_lines = "\n".join(
                f"  - `{s.path}` · {s.name or '(未命名)'} · {len(s.description)} 字描述 · {s.body_chars} 字 body"
                for s in sub_skills[:10]
            )
            return f"""## skill 类型上下文
当前评测包是 **pipeline / 多子 skill 编排型**：根目录 SKILL.md 是编排器（router / orchestrator），具体业务逻辑分布在 {len(sub_skills)} 个子 SKILL.md 里。
子 SKILL.md 列表（按发现顺序，正文已附在下面"附属文件预览"章节）：
{sub_lines or "  (无)"}

请按以下方式调整你的评估：
1. **不要**因为根 SKILL.md 没写完整 schema / outputs / examples / detailed workflow 就扣分——这些通常下沉在子 SKILL.md 或代码（scripts/*.py, *.schema.json, pydantic.BaseModel 等）里；先去附属文件预览中查找证据，再下结论。
2. `cost.context_budget.skill_md_size` 等针对单文档体积的标准对编排器可适当放宽：编排器写得克制更好，业务细节本来就该拆出去。
3. `biz.target_users.specific` / `act.has_examples` 这类来自根 body 的判断，请综合所有 SKILL.md 一起看；只要任何一份 SKILL.md 写清楚了就算成立。
4. 你会看到 5 个 **pipeline 专属**的 dim（applies_to=[pipeline]），评估时请严格对照 desc 给证据：
   - `rel.pipeline_routing.*`：路由表 / 决策树 / 关键词映射是否显式；路由是否便宜（规则优先 vs 每次 LLM 路由）。
   - `rel.pipeline_boundaries.*`：子 agent 是否避免重叠 + 是否覆盖完整（请用真实输入做心智测试）。
   - `rel.pipeline_io_protocol.*`：子 agent IO 协议 + 主 skill 聚合策略（concat / vote / rank）写没写清。
   - `rel.pipeline_partial_failure.*`：部分子 agent 失败时是 partial / fail-all / retry。
   - `rel.pipeline_subskill_quality.*`（rule 类，会先扫子 SKILL.md 章节齐备性）。
   evidence 引用具体子 SKILL.md 路径或缺失章节；fix 给出可粘贴的章节骨架。
"""
        if skill_type == "composite":
            return """## skill 类型上下文
当前评测包是 **composite / 工具集合型**：包含多个相互独立的子 skill，没有强编排关系（用户可单独调用任何一个）。
请按以下方式调整你的评估：
1. 不要要求"统一的 workflow / 串行步骤"，composite 是并列工具，**单一职责**和**互不耦合**才是优点。
2. 主 SKILL.md 不需要写所有功能细节，只要做好"导航 + 适用边界"即可。
3. 你会看到 4 个 **composite 专属**的 dim（applies_to=[composite]），严格对照 desc 评估：
   - `rel.composite_tool_index.*`：主 SKILL.md 是否给每个工具列入口 + 用途 + when-to-use（理想是 ## Tools 表格）。
   - `rel.composite_orthogonality.*`：工具之间避免功能冗余；如有重叠，主 skill 是否说清"用哪个不用哪个"。
   - `rel.composite_consistency.*`：命名 / 输出格式 / 错误码 / 版本号语义跨工具一致。
   - `rel.composite_discoverability.*`：是否有 decision tree / checklist 让 caller 5 行内挑对工具。
   evidence 应引用具体工具路径 or 缺失章节；fix 给可粘贴的章节骨架（例如 ## Tools 表格列名）。
"""
        return """## skill 类型上下文
当前评测包是 **atomic / 单一职责型 skill**：一个 SKILL.md 解决一件事。按常规标准评估即可。
"""
    # English
    if skill_type == "pipeline":
        sub_lines = "\n".join(
            f"  - `{s.path}` · {s.name or '(unnamed)'} · {len(s.description)}-char desc · {s.body_chars}-char body"
            for s in sub_skills[:10]
        )
        return f"""## Skill type context
This package is a **pipeline / multi-sub-skill orchestration**: the root SKILL.md is the orchestrator (router) and the actual business logic is split across {len(sub_skills)} child SKILL.md files.
Child SKILL.md (their bodies are attached below in "Supporting file previews"):
{sub_lines or "  (none)"}

Adjust your evaluation accordingly:
1. **Do NOT** penalize the root SKILL.md for missing complete schema / outputs / examples / detailed workflow — those usually live in the child SKILL.md or in companion code (scripts/*.py, *.schema.json, pydantic.BaseModel). Look there first before scoring low.
2. Standards for single-document size (e.g. `cost.context_budget.skill_md_size`) can be relaxed for an orchestrator — being concise is correct.
3. For root-body checks like `biz.target_users.specific`, `act.has_examples` — read across ALL SKILL.md files; if any SKILL.md establishes the answer, count it as satisfied.
4. You will see 5 **pipeline-specific** dims (applies_to=[pipeline]). Score each strictly per its desc:
   - `rel.pipeline_routing.*`: explicit routing table / decision tree / keyword map; routing is cheap (rules first, LLM only for ambiguous cases).
   - `rel.pipeline_boundaries.*`: sub-agents don't overlap AND coverage is complete (mentally route 5–10 realistic inputs).
   - `rel.pipeline_io_protocol.*`: per-sub-agent IO contract + how the root aggregates (concat / vote / rank).
   - `rel.pipeline_partial_failure.*`: behavior when some sub-agents fail (partial / fail-all / retry).
   - `rel.pipeline_subskill_quality.*` (rule check, scans sub-SKILL.md sections).
   Cite specific sub-SKILL.md paths or missing sections in evidence; ship a paste-ready section skeleton in fix.
"""
    if skill_type == "composite":
        return """## Skill type context
This package is a **composite / toolkit bundle**: multiple independent sub-skills with no strong orchestration (any one can be invoked separately).
Adjust your evaluation:
1. Do NOT demand a unified workflow or serial steps; composite means parallel tools where single-responsibility and decoupling are virtues.
2. The root SKILL.md only needs to do "navigation + usage boundaries", not full feature documentation.
3. You will see 4 **composite-specific** dims (applies_to=[composite]). Score each strictly per its desc:
   - `rel.composite_tool_index.*`: root SKILL.md lists every tool with entry point + when-to-use (ideally a ## Tools table).
   - `rel.composite_orthogonality.*`: tools don't overlap; if they do, root explains "use this, not that".
   - `rel.composite_consistency.*`: naming / output format / error codes / version semantics consistent across tools.
   - `rel.composite_discoverability.*`: a decision tree / checklist that lets callers pick the right tool in 5 lines.
   Cite specific tool paths or missing sections in evidence; ship a paste-ready section skeleton in fix.
"""
    return """## Skill type context
This is an **atomic / single-purpose skill** — one SKILL.md doing one thing. Apply standard evaluation.
"""


def render_language_block(output_lang: str) -> str:
    """Tell the LLM which language to write evidence / fix / reason in.

    Without this signal the LLM tends to mirror the SKILL.md's language —
    which means an English skill yields English feedback that then has to be
    translated for a Chinese reader (and vice versa). Pinning the output
    language explicitly removes that ambiguity for the reviewer reading the
    final report.
    """
    if output_lang == "zh":
        return """## 输出语言要求
请用**简体中文**填写 `evidence`、`fix`、`value_type_reason` 字段。
- 即使被测 SKILL.md 正文、附属文件或 frontmatter 是英文，仍然用简体中文回答。
- 检查项 ID（JSON key 中的 `<check.id>`）保持英文原样，不要翻译。
- 专有名词（API、JSON、schema、Pydantic 等）、文件路径、命令名保持原文。
- 引用 SKILL.md / 子 SKILL.md 中的英文术语时，可在中文里直接保留原文（不需要翻译为生硬的中文）。
"""
    return """## Output language
Write the `evidence`, `fix`, and `value_type_reason` fields in **English**.
- Use English even when SKILL.md, supporting files, or frontmatter are in another language.
- Keep check IDs (the `<check.id>` JSON keys) untranslated.
- Keep proper nouns (API, JSON, schema, Pydantic, etc.), file paths, and command names in their original form.
"""


def render_domain_prompt_block(domain_cfg: dict | None, scenario: str | None, lang: str) -> str:
    if not domain_cfg:
        return ""
    scenario_meta = domain_cfg.get("scenarios", {}).get(scenario, {})
    profile = (domain_cfg.get("scenario_profiles") or {}).get(scenario or "", {})
    if lang == "zh":
        focus = "\n".join(f"- {item}" for item in profile.get("prompt_focus_zh", []))
        return f"""## 领域专家版要求
domain: {domain_cfg.get("domain")}
schema_version: {domain_cfg.get("schema_version")}
scenario: {scenario}
scenario_name: {scenario_meta.get("name_zh", scenario)}

## 当前子场景专属评测重点
{focus or "- 按当前金融子场景的真实业务流程、风险和商业模式评估。"}

请额外从金融专家视角评估 finance.* 检查项。金融专家版不是普通文档规范检查，也不是奖励作者把假设写完整；你必须进行客观判断：
- 不要因为 SKILL.md 自称“有商业价值 / 有付费用户 / 风控完善”就给高分，必须看证据、工作流、场景真实度和可落地性；
- 商业可用性要由你判断真实市场潜力、可复用价值、付费意愿和产品化难度；如果有潜力，请在 fix 里给出后续商业化模式、目标客群、定价或交付路径建议；
- 数据、风控、可解释性、工程落地也要按“是否足以支撑真实金融决策/流程”评分，不只看是否写了对应章节；
- evidence 写当前客观判断和扣分原因，fix 写你作为评审给出的专业改进建议。
"""
    focus = "\n".join(f"- {item}" for item in profile.get("prompt_focus_en", []))
    return f"""## Domain Expert Requirements
domain: {domain_cfg.get("domain")}
schema_version: {domain_cfg.get("schema_version")}
scenario: {scenario}
scenario_name: {scenario_meta.get("name_en", scenario)}

## Scenario-Specific Evaluation Focus
{focus or "- Evaluate against this finance sub-scenario's real workflow, risks, and business model."}

Also evaluate all finance.* checks from a finance expert perspective. This is not a generic documentation check and should not reward the author for merely writing assumptions. Make objective judgments:
- Do not score high just because the SKILL.md claims "commercial value", "paid users", or "complete risk controls"; require evidence, workflow realism, scenario fit, and feasibility.
- For commercial readiness, you judge real market potential, repeat-use value, willingness to pay, and productization difficulty. If potential exists, use fix to propose monetization models, target customers, pricing, or delivery paths.
- For data, risk, explainability, and engineering, score by whether the skill can support real finance decisions or workflows, not by whether it has matching section headings.
- evidence should state your objective diagnosis and reasons; fix should be your professional recommendation as the evaluator.
"""


def render_supporting_files(skill: CanonicalSkill) -> str:
    """Build the "## Supporting file previews" block for the agent prompt.

    Two-stage selection so pipeline / multi-skill packages are not starved by
    the 20-attachment cap:
      Stage 1: every child SKILL.md gets a guaranteed slot, with a bigger
               8000-char budget. These are the core evidence for pipeline
               evaluation and must never be dropped.
      Stage 2: other supporting files (refs, scripts, schemas) follow the
               original rules — text-like extension, <= 30KB on disk,
               truncated to 4000 chars, total cap of 25 blocks (5-slot
               headroom over the previous 20 to accommodate sub SKILL.md).
    """
    if not skill.raw_path or not skill.raw_path.parent.exists() or not skill.raw_path.parent.is_dir():
        return ""
    root = skill.raw_path.parent
    root_md_name = skill.raw_path.name
    blocks: list[str] = []
    skill_md_paths = {s.path for s in skill.sub_skills}

    # --- Stage 1: child SKILL.md (full priority, generous truncation) ---
    for rel in sorted(skill_md_paths):
        p = root / rel
        if not p.is_file():
            continue
        try:
            preview = p.read_text(encoding="utf-8", errors="replace")[:8000]
        except OSError:
            continue
        blocks.append(f"### {rel}\n{preview}")

    # --- Stage 2: everything else, capped at 25 total blocks ---
    cap = 25
    for rel in skill.files:
        if len(blocks) >= cap:
            break
        if rel == root_md_name or rel == "SKILL.md":
            continue
        if rel in skill_md_paths:
            continue  # already emitted in stage 1
        p = root / rel
        if not p.is_file() or p.stat().st_size > 30_000:
            continue
        if not re.search(r"\.(md|txt|json|ya?ml|toml|py|js|ts|sh|schema)$|requirements\.txt$|package\.json$", rel, re.I):
            continue
        try:
            preview = p.read_text(encoding="utf-8", errors="replace")[:4000]
        except OSError:
            continue
        blocks.append(f"### {rel}\n{preview}")
    return "\n\n".join(blocks)


SYSTEM_PROMPT_ZH = """你是 SkillLens 的 agent-side Deep Review 评测员。你正在使用 code agent 自己的模型套餐执行评测，但评分标准必须完全遵守 SkillLens 官方 rubric。

【第一步：判定 skill 的价值类型 value_type】
在所有 check 之前，先把这个 skill 归到下面 5 类之一（必须选一类）：
  • productivity        生产力工具型：替用户省时间/省钱/提效
  • decision_support    决策辅助型：帮用户做更好的判断
  • learning            学习成长型：帮用户增长知识或养成习惯
  • emotion_expression  情绪表达型：提供情绪价值/共鸣/娱乐/社交话题
  • utility             小工具型：解决一个具体小痛点

【评分校准】
- ratio 为 0~1 连续分；1.00 只给极少数标杆级案例，普通补齐章节不能满分。
- 0.90~0.96 表示优秀但仍可微调；0.75~0.89 表示良好但不够锋利；0.50~0.74 表示方向对但证据不足；低于 0.50 表示缺失、空泛或不可信。
- confidence 为你对该判断的置信度。依据不足时 confidence 必须低，低置信度高分会被官方 CLI 校准压低。
- biz.target_users.specific 不要求显式写 ## Target users；能从场景、输入输出或 workflow 稳定推断具体用户时可高分。

【硬性输出】
只返回严格 JSON，禁止 Markdown 代码块、解释或额外文字：
{
  "meta": {
    "value_type": "productivity | decision_support | learning | emotion_expression | utility",
    "value_type_reason": "≤ 60 字一句话解释"
  },
  "results": {
    "<check.id>": {"ratio": <0..1>, "evidence": "≤100字现状诊断", "fix": "≤120字具体改法", "confidence": <0..1>}
  }
}
"""


SYSTEM_PROMPT_EN = """You are SkillLens agent-side Deep Review evaluator. You are using the code agent's own model plan, but the standard MUST follow the official SkillLens rubric.

[Step 1: Identify value_type]
Before scoring checks, classify the skill into exactly one:
  • productivity        — saves time / money / effort
  • decision_support    — helps users make better judgments
  • learning            — grows knowledge or habits
  • emotion_expression  — emotional, entertainment, resonance, social value
  • utility             — solves one small concrete pain

[Score calibration]
- ratio is continuous in [0, 1]. Reserve 1.00 for rare benchmark-level cases; normal "section added" compliance is not perfect.
- 0.90-0.96 means excellent with minor room to sharpen; 0.75-0.89 good but not sharp; 0.50-0.74 directionally useful but under-evidenced; below 0.50 missing, vague, or not credible.
- confidence is your confidence in this judgment. Insufficient evidence must have low confidence; the official CLI will calibrate high scores with low confidence downward.
- biz.target_users.specific does not require an explicit ## Target users section; score high if concrete users are reliably inferable from scenario, inputs/outputs, or workflow.

[Hard output]
Return strict JSON only. No Markdown fences, explanations, or extra text:
{
  "meta": {
    "value_type": "productivity | decision_support | learning | emotion_expression | utility",
    "value_type_reason": "<= 40 words"
  },
  "results": {
    "<check.id>": {"ratio": <0..1>, "evidence": "<=80 words diagnosis", "fix": "<=100 words concrete fix", "confidence": <0..1>}
  }
}
"""


def _build_suggestions(pillars: list[dict], rubric: dict, lang: str, top_n: int = 6) -> list[dict]:
    """输出结构化建议：title + why + how + example + pillarId，web/CLI 共用格式。"""
    def_lookup: dict[str, dict] = {}
    for p in rubric.get("pillars", []):
        for d in p.get("dimensions", []):
            for c in d.get("checks", []):
                def_lookup[c["id"]] = {"def": c, "dim_id": d["id"], "pillar_id": p["id"]}
    for b in rubric.get("bonus", []):
        for c in b.get("checks", []):
            def_lookup[c["id"]] = {"def": c, "dim_id": b["id"], "pillar_id": "bonus"}

    failed: list[tuple[dict, str, str]] = []
    for p in pillars:
        for d in p["dimensions"]:
            for c in d["checks"]:
                if c["status"] in {"fail", "partial"}:
                    failed.append((c, d["id"], p["id"]))

    def impact(item: tuple[dict, str, str]) -> float:
        c = item[0]
        return (1.0 if c["status"] == "fail" else 0.5) * c["weight"]

    failed.sort(key=impact, reverse=True)

    out: list[dict] = []
    for c, dim_id, pillar_id in failed[:top_n]:
        entry = def_lookup.get(c["id"])
        cdef = entry["def"] if entry else None
        title = (cdef or {}).get("desc_zh" if lang == "zh" else "desc_en", c["id"])
        fallback_fix = (cdef or {}).get("fix_zh" if lang == "zh" else "fix_en")
        fallback_example = (cdef or {}).get("example_zh" if lang == "zh" else "example_en")
        out.append({
            "checkId": c["id"],
            "dimensionId": entry["dim_id"] if entry else dim_id,
            "pillarId": entry["pillar_id"] if entry else pillar_id,
            "severity": "high" if c["status"] == "fail" else "medium",
            "title": title,
            "why": c.get("evidence") or ("机器未给出具体原因" if lang == "zh" else "no machine reason"),
            "how": c.get("fix") or fallback_fix or ("请根据维度说明调整" if lang == "zh" else "refer to dimension tagline"),
            "example": c.get("example") or fallback_example,
            "weight": c["weight"],
        })
    return out


def render_agent_wizard(path: Path) -> str:
    """Interactive helper for agents: choose review mode, then print official commands."""
    domain_cfg, _domain_hash = load_domain_config("finance")
    scenarios = list((domain_cfg or {}).get("scenarios", {}).items())
    skill_arg = str(path)

    print("SkillLens Agent Wizard")
    print("======================")
    print("Choose the review mode before generating the official Deep Review prompt.")
    print("")
    print("1) General review")
    print("2) Finance expert review")
    mode = prompt_choice("Select mode [1-2]: ", {"1", "2"})

    domain_args = ""
    selected_label = "general"
    if mode == "2":
        print("")
        print("Finance scenarios:")
        for idx, (scenario_id, scenario_meta) in enumerate(scenarios, start=1):
            name = scenario_meta.get("name_zh") or scenario_meta.get("name_en") or scenario_id
            print(f"{idx}) {scenario_id} - {name}")
        selected = prompt_choice(f"Select finance scenario [1-{len(scenarios)}]: ", {str(i) for i in range(1, len(scenarios) + 1)})
        scenario_id = scenarios[int(selected) - 1][0]
        domain_args = f" --domain finance --scenario {shell_quote(scenario_id)}"
        selected_label = f"finance / {scenario_id}"

    prompt_cmd = (
        f"python3 skills/skill-scorer/scripts/score.py --agent-prompt{domain_args} "
        f"{shell_quote(skill_arg)} > agent-deep-review-prompt.md"
    )
    merge_cmd = (
        f"python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json{domain_args} "
        f"{shell_quote(skill_arg)}"
    )
    return f"""

Selected review mode: {selected_label}

Run the official agent-side Deep Review workflow:

1. Generate the official prompt:
{prompt_cmd}

2. Send the entire agent-deep-review-prompt.md content to the agent/model.
   The model must return strict JSON only. Save it as:
agent-llm-results.json

3. Merge and verify through the official CLI:
{merge_cmd}

The final report must include deepReviewCertificate.status="verified".
"""


def prompt_choice(prompt: str, allowed: set[str]) -> str:
    while True:
        value = input(prompt).strip()
        if value in allowed:
            return value
        print(f"Invalid choice. Expected one of: {', '.join(sorted(allowed))}")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Official SkillLens scorer. Default: rule-only preview; --agent-wizard/--agent-prompt/--llm-results enable agent-side Deep Review.",
    )
    parser.add_argument("path", type=Path, help="Path to SKILL.md, a skill directory, or a .zip package")
    parser.add_argument(
        "--agent-wizard",
        action="store_true",
        help="Interactively choose general vs domain expert review, then print the official agent-side Deep Review commands.",
    )
    parser.add_argument(
        "--agent-prompt",
        action="store_true",
        help="Emit the official prompt that a code agent should send to its own model for Deep Review.",
    )
    parser.add_argument(
        "--llm-results",
        type=Path,
        help="Path to the strict JSON returned by the code agent's model; merges it into the official score.",
    )
    parser.add_argument(
        "--domain",
        choices=["finance"],
        help="Enable a domain expert overlay. MVP currently supports: finance.",
    )
    parser.add_argument(
        "--scenario",
        help="Domain scenario id, e.g. quant_trading, stock_trading, securities_research, banking_workflow.",
    )
    parser.add_argument(
        "--skill-type",
        choices=list(SKILL_TYPE_CHOICES),
        default="auto",
        help=(
            "Skill structure hint. 'auto' (default) detects pipeline vs atomic by counting child "
            "SKILL.md files. Override to 'atomic' (single-purpose), 'pipeline' (orchestrator + "
            "sub-skills), or 'composite' (independent toolkit bundle). The chosen type is "
            "injected into the agent-side Deep Review prompt so the LLM evaluates by the right "
            "lens and avoids 'rewrite schema in SKILL.md' style fixes for pipelines."
        ),
    )
    parser.add_argument(
        "--llm-language",
        choices=list(LLM_LANGUAGE_CHOICES),
        default="auto",
        help=(
            "Language the LLM should write evidence / fix / value_type_reason in. "
            "'auto' (default) follows the SKILL.md detected language; 'zh' or 'en' forces "
            "Chinese / English output regardless of source language. Use 'zh' to get a "
            "Chinese-language Deep Review report from an English skill (or vice versa)."
        ),
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="When provided, write report.json + report.html + report.md (and the agent prompt in --agent-prompt mode) into this directory instead of stdout.",
    )
    args = parser.parse_args(argv)

    try:
        with prepared_skill_path(args.path) as skill_path:
            if args.agent_wizard:
                if args.agent_prompt or args.llm_results or args.domain or args.scenario or args.output_dir:
                    parser.error("--agent-wizard cannot be combined with --agent-prompt, --llm-results, --domain, --scenario, or --output-dir")
                print(render_agent_wizard(args.path))
                return 0

            if args.agent_prompt:
                if args.llm_results:
                    parser.error("--agent-prompt cannot be combined with --llm-results")
                prompt_text = render_agent_prompt(
                    skill_path,
                    domain=args.domain,
                    scenario=args.scenario,
                    skill_type=args.skill_type,
                    llm_language=args.llm_language,
                )
                if args.output_dir:
                    base = report_basename(skill_path, args.path)
                    out_dir = ensure_dir(args.output_dir)
                    prompt_file = out_dir / f"{base}-agent-deep-review-prompt.md"
                    prompt_file.write_text(prompt_text, encoding="utf-8")
                    sys.stderr.write(f"skilllens: wrote {prompt_file}\n")
                else:
                    print(prompt_text)
                return 0

            payload = None
            if args.llm_results:
                payload = json.loads(args.llm_results.read_text(encoding="utf-8"))
            report = score_skill(
                skill_path,
                payload,
                domain=args.domain,
                scenario=args.scenario,
                skill_type=args.skill_type,
            )
            if args.output_dir:
                rubric = yaml.safe_load(RUBRIC_PATH.read_text(encoding="utf-8"))
                emit_reports(report, rubric, ensure_dir(args.output_dir), report_basename(skill_path, args.path))
            else:
                print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        sys.stderr.write(f"skilllens error: {exc}\n")
        return 1


SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def report_basename(skill_path: Path, original_arg: Path) -> str:
    """Pick a stable, filesystem-safe basename for output files.

    Prefers SKILL.md frontmatter `name`; falls back to the user-supplied path stem.
    """
    candidate: str | None = None
    md = skill_path / "SKILL.md" if skill_path.is_dir() else skill_path
    if md.is_file():
        try:
            raw = md.read_text(encoding="utf-8")
            m = FRONTMATTER_RE.match(raw)
            if m:
                meta = yaml.safe_load(m.group(1)) or {}
                if isinstance(meta, dict) and isinstance(meta.get("name"), str):
                    candidate = meta["name"].strip()
        except (OSError, yaml.YAMLError):
            pass
    if not candidate:
        candidate = original_arg.stem or "skilllens-report"
    candidate = SAFE_NAME_RE.sub("-", candidate).strip("-") or "skilllens-report"
    return candidate


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def emit_reports(report: dict, rubric: dict, out_dir: Path, base: str) -> None:
    """Write report.json + report.html + report.md into out_dir."""
    json_path = out_dir / f"{base}-report.json"
    html_path = out_dir / f"{base}-report.html"
    md_path = out_dir / f"{base}-report.md"

    # Load the matching domain rubric (if any) so the renderer can show
    # localized check descriptions instead of bare dotted ids.
    domain_rubric = None
    scenario = None
    domain_expert = report.get("domainExpert") or {}
    domain_name = domain_expert.get("domain") or (report.get("deepReviewCertificate") or {}).get("domain")
    if domain_name:
        try:
            domain_rubric, _ = load_domain_config(domain_name)
        except (FileNotFoundError, ValueError, OSError):
            domain_rubric = None
        scenario = domain_expert.get("scenario")

    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    html_path.write_text(
        render_report.render_html(
            report,
            rubric=rubric,
            domain_rubric=domain_rubric,
            scenario=scenario,
        ),
        encoding="utf-8",
    )
    md_path.write_text(
        render_report.render_markdown(
            report,
            domain_rubric=domain_rubric,
            scenario=scenario,
        ),
        encoding="utf-8",
    )
    sys.stderr.write(
        f"skilllens: wrote {json_path}\n"
        f"skilllens: wrote {html_path}\n"
        f"skilllens: wrote {md_path}\n"
    )


@contextlib.contextmanager
def prepared_skill_path(path: Path) -> Iterator[Path]:
    if path.suffix.lower() != ".zip":
        yield path
        return

    with tempfile.TemporaryDirectory(prefix="skilllens-zip-") as tmp:
        root = Path(tmp)
        with zipfile.ZipFile(path) as zf:
            for info in zf.infolist():
                target = (root / info.filename).resolve()
                if not str(target).startswith(str(root.resolve())):
                    raise ValueError(f"unsafe zip entry: {info.filename}") from None
            zf.extractall(root)
        yield locate_extracted_skill(root)


def locate_extracted_skill(root: Path) -> Path:
    if (root / "SKILL.md").exists():
        return root

    top_dirs = [p for p in root.iterdir() if p.is_dir()]
    if len(top_dirs) == 1 and (top_dirs[0] / "SKILL.md").exists():
        return top_dirs[0]

    matches = sorted(root.rglob("SKILL.md"))
    if not matches:
        raise FileNotFoundError("zip package does not contain SKILL.md")
    return matches[0].parent


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
