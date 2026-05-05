#!/usr/bin/env python3
"""
skill-scorer CLI —— MVP 版（仅规则分）

用法:
    python scripts/score.py <path/to/SKILL.md>
    python scripts/score.py <path/to/skill_dir>

输出: JSON 格式评分报告到 stdout。
依赖: PyYAML (pip install pyyaml)

注意: LLM 评审在 Web 端启用；此 CLI 仅给出规则分骨架，供本地快速自测。
     规则实现应与 web/lib/scoring/rules.ts 保持逻辑等价。
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    sys.stderr.write("需要 pyyaml: pip install pyyaml\n")
    sys.exit(1)


RUBRIC_PATH = Path(__file__).parent.parent / "rubric" / "rubric.yaml"


# --------- 解析 ---------

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


@dataclass
class CanonicalSkill:
    spec: str = "claude"
    language: str = "en"
    meta: dict = field(default_factory=dict)
    body: str = ""
    sections: list[tuple[int, str]] = field(default_factory=list)  # (level, title)
    files: list[str] = field(default_factory=list)
    raw_path: Path | None = None


def parse_skill(path: Path) -> CanonicalSkill:
    if path.is_dir():
        md = path / "SKILL.md"
        if not md.exists():
            raise FileNotFoundError(f"未找到 {md}")
        files = [str(p.relative_to(path)) for p in path.rglob("*") if p.is_file()]
    else:
        md = path
        files = [md.name]

    raw = md.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(raw)
    meta: dict[str, Any] = {}
    body = raw
    if m:
        try:
            meta = yaml.safe_load(m.group(1)) or {}
        except yaml.YAMLError:
            meta = {"__parse_error__": True}
        body = m.group(2)

    sections = [(len(h.group(1)), h.group(2).strip()) for h in re.finditer(r"^(#{1,6})\s+(.+)$", body, re.M)]
    skill = CanonicalSkill(meta=meta, body=body, sections=sections, files=files, raw_path=md)
    skill.spec = detect_spec(skill)
    skill.language = detect_language(body)
    return skill


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

STATUS_SCORE = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "n_a": None}


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


def score_skill(path: Path) -> dict:
    rubric = yaml.safe_load(RUBRIC_PATH.read_text(encoding="utf-8"))
    skill = parse_skill(path)
    out_pillars = []
    total = 0.0
    llm_total = 0
    llm_evaluated = 0

    for pillar in rubric["pillars"]:
        pillar_id = pillar["id"]
        pillar_target_weight = pillar["weight"]
        sum_dim_weights = sum(d["weight"] for d in pillar["dimensions"]) or 1
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
            for c in dim["checks"]:
                if c["type"] == "llm":
                    llm_in_pillar += 1
                    llm_total += 1
                if c["type"] == "rule":
                    status, evidence = run_rule(c["id"], skill, rubric)
                else:
                    status, evidence = "n_a", "LLM check (skipped in CLI MVP)"
                transparency = check_transparency(c)
                checks_out.append({"id": c["id"], "type": c["type"], "status": status,
                                   "evidence": evidence, "weight": c["weight"], **transparency})
                if c["type"] == "llm" and status != "n_a":
                    llm_eval_in_pillar += 1
                    llm_evaluated += 1
                s = STATUS_SCORE.get(status)
                if s is not None:
                    earned += s * c["weight"]
                    denom += c["weight"]
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

    grade = next(g["grade"] for g in rubric["grades"] if total >= g["min"])
    return {
        "spec": skill.spec,
        "language": skill.language,
        "score": round(total, 2),
        "grade": grade,
        "pillars": out_pillars,
        "bonus": 0,
        "llmComplete": llm_total == 0 or llm_evaluated == llm_total,
        "suggestions": _build_suggestions(out_pillars, rubric, skill.language),
    }


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


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write(__doc__ or "")
        sys.exit(2)
    p = Path(sys.argv[1])
    print(json.dumps(score_skill(p), ensure_ascii=False, indent=2))
