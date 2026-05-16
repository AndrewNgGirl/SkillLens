# SkillLens Agent Usage

This file is for code agents such as Cursor, WorkBuddy, Hermes, and similar tools.

## Rule-Only Preview

For a fast deterministic preview, run the official SkillLens scorer:

```bash
python3 skills/skill-scorer/scripts/score.py <path-to-skill-zip-dir-or-SKILL.md>
```

This mode does not run LLM checks. It must be reported as `mode: rule-only preview`.

## Agent-Side Deep Review

For full Deep Review without spending the SkillLens server API key, use the code agent's own model plan through this official three-step workflow.

### Recommended Entry: Agent Wizard

Start with the wizard so the CLI itself guides the user through the available review modes and prints the exact official commands:

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill-zip-dir-or-SKILL.md>
```

The wizard asks:

1. General review or Finance Expert Review
2. If Finance Expert Review is selected, the finance scenario

Then it prints the correct `--agent-prompt` and `--llm-results` commands. This is the safest entry point for Cursor, WorkBuddy, Hermes, and other agents because it does not rely on the agent remembering all domain flags.

### Manual Three-Step Workflow

Use this when the agent or user already knows whether this is a general review or a domain expert review.

1. Generate the official Deep Review prompt:

```bash
python3 skills/skill-scorer/scripts/score.py --agent-prompt <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
```

2. Send the entire `agent-deep-review-prompt.md` content to the code agent's own model. The model must return strict JSON only. Save that JSON as:

```text
agent-llm-results.json
```

3. Merge and score through the official CLI:

```bash
python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json <path-to-skill-zip-dir-or-SKILL.md>
```

### Optional: One-Shot Export to HTML + Markdown

Add `--output-dir <dir>` to any non-wizard invocation to write `report.json`, `report.html`, and `report.md` (and the prompt file in `--agent-prompt` mode) into a directory instead of stdout. The HTML report matches the SkillLens web UI style: brand-colored glass cards, double KPI panels, inline SVG radar charts, dark-mode aware, `@media print` optimized so the user can press Cmd+P in the browser to export a polished PDF without any additional dependency.

```bash
python3 skills/skill-scorer/scripts/score.py \
  --llm-results agent-llm-results.json \
  --domain finance --scenario stock_trading \
  --output-dir ./out \
  <path-to-skill-zip-dir-or-SKILL.md>

# ./out/<skill-name>-report.json
# ./out/<skill-name>-report.html
# ./out/<skill-name>-report.md
```

When `--output-dir` is omitted, the original stdout behavior is preserved (no breaking change for existing scripts).

### Pipeline / Multi-sub-skill Packages

Add `--skill-type {auto,atomic,pipeline,composite}` to any non-wizard invocation when the skill being evaluated is a multi-skill bundle:

- `auto` (default) — counts child `SKILL.md` files via `rglob` and picks `pipeline` if any are found, otherwise `atomic`.
- `pipeline` — root SKILL.md is an orchestrator; real workflow / schema / examples live in child SKILL.md or companion code (Python, Pydantic, JSON schema). The agent prompt switches to a pipeline lens and tells the LLM to read across all SKILL.md, relax single-document size standards, and surface fixes about sub-agent boundaries / IO contracts / error propagation / observability instead of "rewrite schema in main SKILL.md".
- `composite` — independent toolkit bundle; the LLM is told not to require a unified workflow.
- `atomic` — explicit override for "single-purpose, single SKILL.md" packages.

The CLI also reorders supporting-file previews so every child SKILL.md is included with an 8000-char budget (instead of being dropped when there are 20+ attachments). The chosen type and the discovered sub-skill list are surfaced in the final report (`skillType`, `skillTypeAutoDetected`, `subSkills`) and shown in the HTML / Markdown export's meta card.

#### Rubric scope filter (`applies_to`)

Some checks only make sense for certain skill types. A check in `rubric.yaml` may declare:

```yaml
- id: rel.script_fallback.has_scripts
  type: rule
  applies_to: [atomic, composite]   # skipped for skill_type=pipeline
  ...
```

When the resolved `skill_type` isn't in the list, the CLI emits the check with `status: "not_applicable"`, `ratio: null`, and `appliesTo: [...]`. It is excluded from earned/denom (so the dimension auto-renormalizes), filtered out of the agent prompt (no LLM tokens wasted), and never surfaces in `Top Improvements`. When **all** checks in a dimension are filtered out, the dimension itself is marked `notApplicable` with `score: null`, `weight: 0`, and `originalWeight` echoed back — its weight is dropped from the pillar's denominator so the remaining dims renormalize to fill the full pillar budget (no silent points leakage).

The HTML / web reports render filtered checks as dashed slate rows with an "已按 applies_to 过滤，不计分母" hint, and fully-N/A dims show as a muted card with score `— / <s>{originalWeight}</s>` plus a "本维度所有细则对当前 skill 类型不适用" note.

Currently scoped general-rubric checks (rubric v3.6 / SkillLens 0.4.0):

| Check | applies_to | Why |
| --- | --- | --- |
| `market.scope_focus.disciplined` | `[atomic]` | "does one thing well" applies only to atomic; pipelines/composites aggregate by design |
| `act.steps_atomic` | `[atomic]` | pipelines are routing decisions, composites are tool indexes — neither is linear |
| `act.io_explicit` | `[atomic]` | root-level ## Inputs/## Outputs assumes a single IO contract (atomic) |
| `cost.reference_layering.has_dirs` | `[atomic, composite]` | pipelines layer as `agents/`, not `references/scripts/assets` |
| `rel.script_fallback.has_scripts` | `[atomic, composite]` | pipelines are pure-LLM orchestrators; no scripts/ fallback path |
| `rel.output_validation.declared` | `[atomic]` | pipeline routers / composite bundles have no single root schema |
| `rel.output_validation.enforced` | `[atomic]` | tied to `.declared` — only meaningful for atomic |
| `struct.has_workflow` | `[atomic]` | pipelines flow through routing, composites are tool indexes |

Pipeline-only dims (`applies_to=[pipeline]` on every child check):

| Dim | Weight | What it checks |
| --- | ---: | --- |
| `rel.pipeline_routing` | 5 | Explicit routing table / decision tree / keyword map; routing is cheap (rules first) |
| `rel.pipeline_boundaries` | 4 | Sub-agents don't overlap AND coverage is complete |
| `rel.pipeline_io_protocol` | 3 | IO contract between sub-agents + root's aggregation strategy |
| `rel.pipeline_partial_failure` | 2 | Behavior when some sub-agents fail (partial / fail-all / retry) |
| `rel.pipeline_subskill_quality` | 2 | Rule check: every sub-SKILL.md ships when-to-use + workflow sections |

Composite-only dims (`applies_to=[composite]` on every child check):

| Dim | Weight | What it checks |
| --- | ---: | --- |
| `rel.composite_tool_index` | 4 | Root SKILL.md lists every tool with entry + when-to-use (ideally ## Tools table) |
| `rel.composite_orthogonality` | 3 | Tools don't overlap; if they do, root explains "use this, not that" |
| `rel.composite_consistency` | 2 | Naming / output format / error codes / version semantics consistent across tools |
| `rel.composite_discoverability` | 2 | Decision tree / checklist letting callers pick the right tool in 5 lines |

The reliability pillar's raw weights add to ~20 for atomic, ~28 for pipeline, ~27 for composite. The applies_to renormalization rescales each type back to the pillar's 20-point cap, so 1 dim is "worth more" in pipeline/composite than in atomic — exactly because pipelines/composites have more dims to cover.

To add new scoping: edit `rubric.yaml`, then run `python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py` to regenerate the web mirror at `web/lib/rubric/rubric.ts`. New pipeline/composite-only dims should also get a paragraph in `scripts/score.py::render_skill_type_block` and `web/lib/llm/prompts.ts::renderSkillTypeBlock` so the LLM has a lens hint pointing at them.

```bash
# Force pipeline lens, regardless of how many child SKILL.md exist
python3 skills/skill-scorer/scripts/score.py \
  --skill-type pipeline \
  --llm-results agent-llm-results.json \
  --output-dir ./out \
  ./my-pipeline-package

# Auto-detect (default), no flag needed
python3 skills/skill-scorer/scripts/score.py --output-dir ./out ./my-skill
```

### LLM Output Language

By default the agent-side LLM mirrors the SKILL.md's detected language: a Chinese skill yields Chinese `evidence` / `fix` / `value_type_reason`, an English skill yields English. Pass `--llm-language {auto,zh,en}` to decouple the two:

- `auto` (default) — follow SKILL.md detection.
- `zh` — force Simplified Chinese answers regardless of source language. Useful when a Chinese reviewer evaluates an English skill and wants the report to be readable in Chinese.
- `en` — force English answers regardless of source language.

The flag injects an explicit `## Output language` block into the agent prompt next to the skill-type lens, so `code-agent` will obey when it forwards the prompt to its LLM. The HTML / Markdown report's `Top Improvements` and per-check `evidence` / `fix` will then appear in the chosen language. (HTML report's UI chrome — pillar names, dimension labels, etc. — has its own ZH/EN toggle and is unrelated to this flag.)

```bash
# English skill, Chinese review answers
python3 skills/skill-scorer/scripts/score.py \
  --agent-prompt --llm-language zh \
  ./my-english-skill > deep-review-prompt.md
```

### Domain Expert Review

Finance Expert Review adds a professional overlay on top of the normal SkillLens score. It is designed for fundraising, startup finance, quant trading, stock trading, securities research, banking workflows, financial education, and financial data analysis.

Each finance scenario uses a scenario-specific standard: shared core pillars plus scenario-specific pillar weights, extra checks, and prompt focus. For example, `stock_trading` emphasizes real-time data, liquidity, volatility, and trade-advice boundaries, while `quant_trading` emphasizes backtest validity, bias control, slippage, and reproducibility.

Supported finance scenarios:

```text
startup_fundraising
quant_trading
stock_trading
securities_research
banking_workflow
financial_education
financial_data_analysis
other
```

Use the same three-step workflow, but pass `--domain finance --scenario <scenario-id>` in both prompt generation and merge steps:

```bash
python3 skills/skill-scorer/scripts/score.py --agent-prompt --domain finance --scenario stock_trading <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
```

```bash
python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json --domain finance --scenario stock_trading <path-to-skill-zip-dir-or-SKILL.md>
```

The final JSON will include `domainExpert` with:

- `score`
- `grade`
- `riskLevel`
- `commercialReadiness`
- `scenario`
- `pillars`
- `llmCoverage`

For full finance expert review, the certificate also includes `domain`, `scenario`, and `domainRubricHash`.

## Output Contract

Use the final JSON output from the merge step as the only source of truth.

Required fields to preserve in downstream reports:

- `score`
- `grade`
- `pillars`
- `llmComplete`
- `llmCoverage`
- `suggestions`
- `source`
- `mode`
- `engine`
- `engineVersion`
- `rubricHash`
- `deepReviewCertificate`

The final report must include this certificate when step 3 succeeds:

```json
{
  "deepReviewCertificate": {
    "status": "verified",
    "workflow": "agent-prompt -> agent-llm-results -> official-cli-merge",
    "source": "official SkillLens CLI",
    "engine": "skilllens-python-cli",
    "engineVersion": "<from JSON>",
    "rubricHash": "<from JSON>",
    "llmResultsHash": "<from JSON>",
    "llmComplete": true
  }
}
```

Only reports with `deepReviewCertificate.status="verified"` count as official SkillLens agent-side Deep Review.

## Forbidden Usage

Do not generate an ad hoc scoring script such as:

```bash
python3 <<'PYEOF'
# custom scoring code
PYEOF
```

Do not reimplement the rubric in the agent response. Do not change weights, thresholds, or pass / partial / fail mapping. Do not claim `100/100`, "full deep review", "all checks passed", or "SkillLens complete review" unless those exact results appear in step 3 official SkillLens output with a verified `deepReviewCertificate`.

## Reporting Rules

Every report must include:

```text
source: official SkillLens CLI
mode: rule-only preview | agent-side deep review
engine: skilllens-python-cli
engineVersion: <from JSON>
rubricHash: <from JSON>
llmComplete: <from JSON>
deepReviewCertificate.status: verified (required for full Deep Review)
```

If `llmComplete=false`, clearly say this is a rule-only preview and that LLM checks were skipped. It is not a full SkillLens Deep Review.
If `deepReviewCertificate` is absent, clearly say this is not an official full SkillLens Deep Review.

## Copy-Paste Prompt For Code Agents

Copy the full prompt below into Cursor, WorkBuddy, Hermes, or a similar code agent after uploading a skill zip:

```text
请使用当前仓库里的 SkillLens 官方 agent-side Deep Review 工作流评测我上传的 skill zip。

要求：
1. 先阅读 skills/skill-scorer/USAGE.md。
2. 不要自己写评分脚本，不要伪造分数。
3. 直接把我上传的 zip 路径作为 <path-to-skill-zip-dir-or-SKILL.md>。
4. 先运行 CLI 向导，让我选择通用评测或金融专家版；如果我选择金融专家版，继续按向导选择金融场景。
5. 运行：
   python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill-zip-dir-or-SKILL.md>
   按 CLI 向导选择通用评测或金融专家版；如果选择金融专家版，再选择金融场景。向导会输出下面两条官方命令。
6. 生成官方 prompt：
   python3 skills/skill-scorer/scripts/score.py --agent-prompt <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
   如果我选择金融专家版，改用：
   python3 skills/skill-scorer/scripts/score.py --agent-prompt --domain finance --scenario <scenario-id> <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
7. 用你自己的模型严格按 agent-deep-review-prompt.md 输出 JSON，并保存为 agent-llm-results.json。
8. 运行：
   python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json <path-to-skill-zip-dir-or-SKILL.md>
   如果我选择金融专家版，改用：
   python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json --domain finance --scenario <scenario-id> <path-to-skill-zip-dir-or-SKILL.md>
9. 最终报告必须展示 deepReviewCertificate.status="verified"。如果没有 verified 证书，不要声称完成 SkillLens Deep Review；如果启用了金融专家版，还必须展示 domainExpert.score、domainExpert.riskLevel 和 deepReviewCertificate.domain="finance"。
```
