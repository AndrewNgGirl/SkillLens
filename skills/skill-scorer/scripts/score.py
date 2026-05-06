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


RUBRIC_PATH = Path(__file__).parent.parent / "rubric" / "rubric.yaml"
ENGINE_NAME = "skilllens-python-cli"
ENGINE_VERSION = "0.2.0"
VALUE_TYPES = {"productivity", "decision_support", "learning", "emotion_expression", "utility"}


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


def score_skill(path: Path, llm_payload: dict | None = None) -> dict:
    rubric_text = RUBRIC_PATH.read_text(encoding="utf-8")
    rubric = yaml.safe_load(rubric_text)
    rubric_hash = sha256(rubric_text.encode("utf-8")).hexdigest()[:16]
    skill = parse_skill(path)
    llm_results, llm_meta = normalize_llm_payload(llm_payload, rubric) if llm_payload else ({}, None)
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
    return report


def normalize_llm_payload(payload: dict, rubric: dict) -> tuple[dict[str, dict], dict | None]:
    if not isinstance(payload, dict):
        raise ValueError("llm results must be a JSON object")
    raw_results = payload.get("results")
    if not isinstance(raw_results, dict):
        raise ValueError("llm results JSON must contain object field: results")

    expected = {c["id"] for c in iter_checks(rubric) if c["type"] == "llm"}
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


def render_agent_prompt(path: Path) -> str:
    rubric = yaml.safe_load(RUBRIC_PATH.read_text(encoding="utf-8"))
    skill = parse_skill(path)
    lang = skill.language
    checks = [c for c in iter_checks(rubric) if c["type"] == "llm"]
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
    final_instruction = (
        "请严格返回 JSON；不要输出 Markdown 代码块；不要解释。保存为 agent-llm-results.json 后运行官方 CLI 合并。"
        if lang == "zh"
        else "Return strict JSON only; no Markdown fences; no explanation. Save as agent-llm-results.json, then run the official CLI merge step."
    )
    return f"""{system}

---

{body_label}: {skill.spec}

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

{checks_heading}
{checks_block}

{final_instruction}
"""


def render_supporting_files(skill: CanonicalSkill) -> str:
    if not skill.raw_path or not skill.raw_path.parent.exists() or not skill.raw_path.parent.is_dir():
        return ""
    root = skill.raw_path.parent
    blocks = []
    for rel in skill.files:
        if rel == skill.raw_path.name or rel == "SKILL.md":
            continue
        if len(blocks) >= 20:
            break
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


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Official SkillLens scorer. Default: rule-only preview; --agent-prompt/--llm-results enable agent-side Deep Review.",
    )
    parser.add_argument("path", type=Path, help="Path to SKILL.md, a skill directory, or a .zip package")
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
    args = parser.parse_args(argv)

    try:
        with prepared_skill_path(args.path) as skill_path:
            if args.agent_prompt:
                if args.llm_results:
                    parser.error("--agent-prompt cannot be combined with --llm-results")
                print(render_agent_prompt(skill_path))
                return 0

            payload = None
            if args.llm_results:
                payload = json.loads(args.llm_results.read_text(encoding="utf-8"))
            print(json.dumps(score_skill(skill_path, payload), ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        sys.stderr.write(f"skilllens error: {exc}\n")
        return 1


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
