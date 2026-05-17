# SkillLens

[简体中文](README.md) | [English](README.en.md)

## Product Demo

https://github.com/user-attachments/assets/8bc9bfce-bfe5-4c3a-a915-9aaf1520969e

SkillLens is an open-source, self-hosted web tool for evaluating **Agent Skills**. Upload a `SKILL.md`, a skill folder, or a skill package, and SkillLens turns it into a quantitative report with rubric scores, evidence, Deep Review feedback, market signals, and concrete improvement suggestions.

It is designed for people building skills for Cursor, Claude, OpenClaw, or similar agent ecosystems who want to answer one simple question:

> Is this skill actually useful, reliable, discoverable, and worth publishing?

## Capability Map

| Capability | Entry Point | For | Notes |
|---|---|---|---|
| General quantitative review | Web UI / CLI | All skill authors | 5 pillars, 100-point score; sub-dimensions are activated per skill structure (atomic / pipeline / composite) |
| SkillLens Deep Review | Web UI / Agent CLI | Teams that need LLM judgment | LLM evaluates subjective checks; deterministic rules still come from the official scorer |
| Finance Expert Review | Web UI / Agent CLI | Finance, research, quant, banking, and education scenarios | Adds a `domainExpert` overlay without replacing the general score |
| Agent-side official review | CLI | Cursor / WorkBuddy / Hermes and similar code agents | `--agent-wizard` guides mode selection and certificate-based verification |

## Why It Is Worth Trying

SkillLens is not just a `SKILL.md` format checker. It treats a skill as an early-stage AI product artifact and evaluates whether it is clear, useful, commercially valuable, differentiated, affordable to run, stable, and maintainable. In other words, it helps you tell the difference between "this skill is formatted correctly" and "this skill is worth installing and using repeatedly".

- **Moves beyond "well-written" to "worth building"**: it checks metadata, structure, and examples, but also evaluates target users, usage frequency, value proposition, and long-term memorability.
- **Turns subjective review into a weighted report**: the rubric has 5 pillars with transparent default weights; sub-dimensions activate per skill type and every weight can be customized.
- **Three-type differentiated standards**: atomic / pipeline / composite each get type-specific dimensions — pipelines are scored on routing, sub-agent boundaries, and IO protocols; composites on tool index, orthogonality, and consistency. No more single-doc-only standards mis-judging pipelines and toolkits.
- **Looks at market context and replacement risk**: it asks not only "does this skill run?", but also "why is it better than generic LLM usage, Copilot, CodeQL, or existing open-source alternatives?"
- **Accounts for real operating cost**: it reviews context budget, reference layering, dependency weight, and cache friendliness, so a skill does not just look powerful while being slow, expensive, or fragile.
- **Produces actionable improvement paths**: reports include evidence, scores, grades, and top suggestions, making it useful before open-sourcing, internal review, or marketplace submission.
- **Adds Finance Expert Review**: the upload flow can add a finance scenario overlay with Finance Expert Score, risk level, and commercial readiness across fundraising, startup finance, quant, stock trading, securities research, and banking workflows.
- **Supports Chinese / English switching**: the UI and reports can switch between Chinese and English, making it easier for Chinese teams and international open-source users to collaborate.
- **Self-hosted, previewable, and extensible**: you can explore the UI with mock scores without a model key, then enable full Deep Review with your own provider key.

## Why SkillLens

Agent Skills are becoming reusable software artifacts: they package instructions, workflows, scripts, references, schemas, and examples so an AI agent can perform a specialized task more reliably.

But a skill can look polished and still fail in practice. Common problems include vague trigger conditions, unclear target users, missing inputs and outputs, no failure handling, weak examples, excessive context cost, or a value proposition that is hard to understand.

SkillLens helps skill authors and teams:

- **Score skill quality** with a transparent 100-point rubric.
- **Find concrete gaps** instead of relying on vague feedback like "make it better".
- **Compare skills consistently** across Cursor / Claude / OpenClaw style packages.
- **Improve publish-readiness** before submitting to a marketplace, sharing internally, or open-sourcing.
- **Generate exportable reports** for review, iteration, or documentation.

## What It Evaluates

SkillLens uses a 100-point rubric with 5 pillars and 34 sub-dimensions in total. The active set per skill structure is gated by the `applies_to` field: atomic activates 25, pipeline activates 26 (including 5 pipeline-only), composite activates 27 (including 4 composite-only).

Shared backbone:

| Pillar | Default Weight | Shared Sub-dimensions |
|---|---:|---|
| Skill Value | 25 | Target User Clarity 5; User Need Realness 6; Value Articulation 5; Repeat-use Value 5; Moat / Memorability Potential 4 |
| Market Competitiveness | 15 | Differentiation 5; Scope Focus 4 ⓐ; LLM Replaceability Risk 3; Competitor Awareness 3 |
| Runtime Cost | 15 | Context Budget 4; Reference Layering 4 ⓐⓒ; External Dependency Weight 4; Cache Friendliness 3 |
| Reliability | 20 | Task–Model Fit 5; Script Fallback 4 ⓐⓒ; Output Validation 4 ⓐ; Idempotency 3; Failure Path 2; Edge Cases 2 |
| Writeup Quality | 25 | Metadata Conformance 4; Discoverability 5; Structure & Readability 3 (incl. ## Workflow ⓐ); Actionability 6 (incl. steps_atomic ⓐ + io_explicit ⓐ); Safety & Compliance 3; Maintainability 4 |

ⓐ = atomic-only · ⓒ = atomic + composite · unmarked = applies to all three types.

Type-specific dimensions added on top of the backbone (under the reliability pillar):

| Type | Type-only Dimensions | Raw Total |
|---|---|---:|
| **atomic** | Uses only the shared backbone (script fallback, output validation, etc. all active) | — |
| **pipeline** | `pipeline_routing` 5 · `pipeline_boundaries` 4 · `pipeline_io_protocol` 3 · `pipeline_partial_failure` 2 · `pipeline_subskill_quality` 2 (rule) | 16 raw |
| **composite** | `composite_tool_index` 4 · `composite_orthogonality` 3 · `composite_consistency` 2 · `composite_discoverability` 2 | 11 raw |

The `applies_to` renormalization re-maps pipeline's raw 28 weight and composite's raw 27 weight back to reliability's 20-point cap, so the pillar maximum stays 20 across all three types.

All pillar and sub-dimension weights can be customized in the web UI. The defaults work for general open-source skills; teams can rebalance for business value, runtime cost, internal reliability, or other priorities.

The rubric lives in `skills/skill-scorer/rubric/rubric.yaml` — the single source of truth shared by the web app and the CLI. Run `python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py` after any edit to mirror it into `web/lib/rubric/rubric.ts`.

The Finance Expert overlay lives in `skills/skill-scorer/domains/finance/rubric.yaml`. It produces an additional domain expert report and does not replace the default general 100-point score. Different finance scenarios use different weights, extra checks, and LLM prompt focus.

## Supported Inputs

SkillLens can evaluate:

**Package shapes** (auto-detected; can be overridden with `--skill-type`):

- **atomic** — a single `SKILL.md`, or a SKILL.md plus a folder of `scripts/`, `references/`, `assets/`, `tests/`, `*.schema.json`, `requirements.txt`, and similar companion files.
- **pipeline** — an orchestrator package with multiple child SKILL.md files: the root SKILL.md is the router and the real business logic lives under `agents/<sub-agent>/SKILL.md` or similar sub-directories. CLI and web auto-detect this (≥1 child SKILL.md ⇒ pipeline) and switch to the pipeline lens.
- **composite** — a toolkit bundle where each child SKILL.md is an independent tool and the root SKILL.md is mostly an index / decision tree. Mark it explicitly with `--skill-type composite` (CLI) or the "Composite" card above the Uploader (Web).
- **Archives** — all three shapes work as `.zip` uploads: SkillLens unpacks and evaluates the directory tree as-is.

**Skill ecosystems**: Claude, OpenClaw, and Cursor frontmatter / directory conventions are all parsed correctly. As long as the root has a `SKILL.md` with at least `name` + `description` in the frontmatter, SkillLens can score it.

**Input sources**: local path (CLI / Web drag-and-drop), `.zip` upload, and the web "Load Sample" button. The web UI does not yet pull skills from a GitHub URL directly — for the agent path, the code agent should clone the repo first and pass the local path.

**Built-in examples**: `skills/skill-scorer/examples/` ships 11 examples — 1 general atomic (`pr-reviewer`), 2 pipelines (`pr-pipeline` and `mega-pipeline` with 53 sub-agents for realistic-scale stress testing), and 8 finance-scenario atomic skills (one per Finance Expert `--scenario`; `stock-trading-analyst` is the most complete, shipping schema, scripts, tests, and references). The web "Load Sample" button maps each entry to the currently selected review mode.

## Two Usage Paths

SkillLens now has two clear entry points:

- **Web UI**: for humans. Upload `SKILL.md`, a skill folder, or a `.zip`, then review the report in the browser. See `web/README.md`.
- **Agent CLI**: for Cursor, WorkBuddy, Hermes, and similar code agents. Use the official CLI and certificate workflow for agent-side Deep Review; Finance Expert Review is available through `--domain finance --scenario <scenario-id>`. See `skills/skill-scorer/USAGE.md`.

## Output

The scoring logic and rubric are identical whether you run via the Web UI or the CLI; only the *form* of the output differs.

### What you see in the Web UI

- **Total score + grade**: 100-point total, `S / A / B / C / D` grade, 5-axis radar chart
- **5 pillars and dimension evidence cards**: each check shows pass / partial / fail / not_applicable status, evidence, and a fix suggestion
- **Top improvement suggestions**: actionable list ranked by weighted impact
- **Finance Expert tab** (when enabled): switchable General / Finance tabs (Finance shown first), with risk level and commercial readiness
- **Market research signals**: similar skills and alternatives from GitHub search
- **Export**: JSON, copy-as-Markdown, or generate PDF
- **Bilingual UI and report content**

Without a model key, SkillLens runs in mock-score preview mode so the full UI is still usable.

### What the CLI emits

By default the CLI prints the scoring JSON to stdout. Add `--output-dir <dir>` to also write three artifacts (visually identical to the web UI; **open the HTML in a browser and press Cmd+P for a polished PDF**, no extra dependency required):

```text
<skill-name>-report.json   raw scoring JSON (same as stdout)
<skill-name>-report.html   self-contained single-file HTML (with ZH/EN toggle and @media print)
<skill-name>-report.md     GitHub-flavored Markdown
```

Under `--agent-prompt`, `--output-dir` also writes `<skill-name>-agent-deep-review-prompt.md`.

The report language follows the source SKILL.md by default; pass `--llm-language {auto,zh,en}` to force a specific LLM answer language (e.g. an English skill with Chinese evidence / fix).

## Quick Start

Two parallel paths — pick whichever fits your context.

### Web UI (for humans)

```bash
cd web
npm install
cp .env.example .env.local      # optional: add a model key (see below)
npm run dev                     # http://localhost:3000
```

A model key is required for full Deep Review. At least one of:

```env
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
```

For public deployments, keep the browser-origin guard on so external tools cannot drain your quota through `/api/llm`:

```env
LLM_REQUIRE_BROWSER_REQUEST=1
```

For private server-to-server access, also set `LLM_ACCESS_TOKEN`. Other optional env vars and security notes live in [`web/README.md`](web/README.md).

### CLI (for code agents)

No key needed for a rule-only preview:

```bash
# Rule-only preview
python3 skills/skill-scorer/scripts/score.py <path-to-skill>

# Multi-sub-skill bundle: explicit type override (default is auto-detect)
python3 skills/skill-scorer/scripts/score.py --skill-type pipeline <path-to-package>

# Export HTML + Markdown + JSON in one go
python3 skills/skill-scorer/scripts/score.py --output-dir ./out <path-to-skill>
```

For full Deep Review, use the interactive wizard. It walks the user through general vs. Finance Expert Review and prints the official three-step commands:

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill>
```

The full contract — the `--agent-prompt` → model JSON → `--llm-results` three-step flow, `deepReviewCertificate` verification, Finance Expert `--domain finance --scenario <id>` parameters, and a copy-paste prompt for code agents — lives in [`skills/skill-scorer/USAGE.md`](skills/skill-scorer/USAGE.md).

## Repository Structure

```text
.
├── README.md / README.en.md / CHANGELOG.md / LICENSE
├── skills/
│   └── skill-scorer/                # the skill package consumed by code agents / CLI
│       ├── SKILL.md                 # entry description (when-to-use / outputs / workflow)
│       ├── USAGE.md                 # official Agent CLI contract
│       ├── rubric/rubric.yaml       # general scoring source of truth (with applies_to)
│       ├── domains/finance/         # Finance Expert rubric + 8 sub-scenarios
│       ├── scripts/
│       │   ├── score.py             # official CLI (rule + agent-prompt + merge)
│       │   ├── render_report.py     # HTML / Markdown rendering (matches web UI)
│       │   └── sync_rubric_to_ts.py # rubric.yaml → web/lib/rubric/rubric.ts mirror
│       ├── references/              # best-practices and other reference material
│       └── examples/                # general + finance scenario samples
└── web/                             # Next.js App Router frontend
    ├── app/
    │   ├── page.tsx                 # main report page (dashboard / pillars / suggestions)
    │   └── api/                     # /api/llm · /api/market · /api/sample
    ├── components/                  # Uploader / PillarSection / SubSkillsCard etc.
    ├── lib/
    │   ├── rubric/                  # rubric.ts (YAML mirror) + types.ts
    │   ├── scoring/                 # rule engine / aggregation / LLM client
    │   ├── llm/                     # provider / prompts / cache / types
    │   ├── domain/                  # Finance Expert logic
    │   ├── market/                  # market research (GitHub Search)
    │   └── spec/                    # SKILL.md / sub SKILL.md parsing
    ├── .env.example
    └── README.md                    # web deployment / configuration only
```

## Development

**Web side** (Next.js / TypeScript):

```bash
cd web
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run build       # production build
```

**CLI / rubric side** (Python, no virtualenv required, only `pyyaml`):

```bash
# After editing rubric.yaml — required: verify the web/lib/rubric/rubric.ts mirror is in sync
python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py --check

# Re-generate the mirror when out of sync
python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py

# Rule-only regression on an example skill (no LLM credits, returns in seconds)
python3 skills/skill-scorer/scripts/score.py skills/skill-scorer/examples/pr-reviewer
```

After any rubric change, please regress on all three skill shapes (`pr-reviewer` / `pr-pipeline` / a self-made composite fixture) to make sure the `applies_to` filtering and pillar renormalization still hold. Web deployment details live in [`web/README.md`](web/README.md).

## Security

- Never commit `.env.local`, `.env`, or real API keys.
- Do not expose secrets through `NEXT_PUBLIC_*` variables.
- Keep `LLM_REQUIRE_BROWSER_REQUEST=1` before exposing a server with `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`.
- Rotate any key that was ever committed, pasted into an issue, shared in a screenshot, or included in logs.
- Run a secret scan before publishing, for example with `gitleaks detect --source .`.

## License

MIT
