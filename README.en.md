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

- A single `SKILL.md`
- A skill folder containing files such as `scripts/`, `references/`, `assets/`, tests, schemas, or examples
- A zipped skill package
- Claude-style skills
- OpenClaw-style skills
- Cursor-compatible skill projects

Built-in examples live in `skills/skill-scorer/examples/`:

- `pr-reviewer`: general PR review sample.
- `stock-trading-analyst`: high-fidelity stock trading / watchlist finance sample with schema, scripts, tests, and references.
- Additional finance scenario samples: fundraising, quant trading, securities research, banking workflow, financial education, financial data analysis, and other finance scenarios.

## Two Usage Paths

SkillLens now has two clear entry points:

- **Web UI**: for humans. Upload `SKILL.md`, a skill folder, or a `.zip`, then review the report in the browser. See `web/README.md`.
- **Agent CLI**: for Cursor, WorkBuddy, Hermes, and similar code agents. Use the official CLI and certificate workflow for agent-side Deep Review; Finance Expert Review is available through `--domain finance --scenario <scenario-id>`. See `skills/skill-scorer/USAGE.md`.

## Agent CLI

Code agents such as Cursor, WorkBuddy, Hermes, and similar tools can call SkillLens as an official local tool. The Agent CLI accepts `.zip` / directories / `SKILL.md`; full agent-side Deep Review uses the code agent's own model plan and does not spend your SkillLens server API key.

Detailed commands, the three-step workflow, certificate verification, Finance Expert parameters, and the copy-paste prompt for code agents all live in `skills/skill-scorer/USAGE.md`. Code agents should start with `--agent-wizard` so the CLI guides the user through general vs. Finance Expert Review; if finance is selected, the wizard also asks for the scenario.

```bash
python3 skills/skill-scorer/scripts/score.py --agent-wizard <path-to-skill>
```

For a fast rule-only preview:

```bash
python3 skills/skill-scorer/scripts/score.py <path-to-skill>
```

## Output

SkillLens produces:

- Overall score and grade: `S / A / B / C / D`
- Radar chart and pillar-level breakdown
- Rule-based checks with pass / partial / fail statuses
- Optional LLM-powered Deep Review
- Optional Finance Expert overlay: `domainExpert.score`, `riskLevel`, `commercialReadiness`
- Market research signals from GitHub search
- Top improvement suggestions
- Exportable report (JSON / HTML / Markdown)

If no model key is configured, SkillLens still runs in preview mode with mock scores so you can explore the UI.

### One-Shot HTML / Markdown Export from CLI

The CLI prints JSON to stdout by default. Pass `--output-dir` to also write a self-contained HTML and a GitHub-flavored Markdown alongside the JSON:

```bash
python3 skills/skill-scorer/scripts/score.py \
  --llm-results agent-llm-results.json \
  --domain finance --scenario stock_trading \
  --output-dir ./out \
  <path-to-skill>

# ./out/<skill-name>-report.json
# ./out/<skill-name>-report.html   ← matches the web UI: brand colors, glass cards, inline SVG radar, dark/print modes
# ./out/<skill-name>-report.md
```

Open the HTML in a browser and press Cmd+P for a polished PDF (no extra dependency). Both Finance Expert and General reports are rendered in switchable tabs (default: Finance) when `--domain finance` is set.

### Pipeline / Multi-sub-skill Packages

When the package is not a single SKILL.md but a bundle of multiple sub SKILL.md files ("pipeline" or "toolkit"), SkillLens auto-detects the structure and switches the evaluation lens, so you don't get atomic-style noise like "rewrite the schema in the root SKILL.md".

Core mechanism:

- **Auto-detect + explicit override**: CLI takes `--skill-type {auto,atomic,pipeline,composite}` (default `auto`); the web Uploader has 4 type cards above the upload area. `auto` counts sub SKILL.md files; ≥1 marks the package as `pipeline`.
- **Three-type differentiated rubric** (see "What It Evaluates" above). Each check declares `applies_to: [atomic|pipeline|composite]`. Out-of-scope checks are emitted as `not_applicable`, never sent to the LLM, never surface in Top Improvements, and never enter the pillar denominator. When all checks in a dimension are filtered out, the whole dimension is dropped from renormalization.
- **Pipeline / composite lens prompts**: Both CLI and web inject a system-prompt section telling the LLM not to apply atomic standards and to focus on routing clarity / sub-agent boundaries / IO protocols / partial-failure handling / sub-skill self-containment.
- **Attachment priority**: Every sub SKILL.md is packaged for the LLM with an 8000-char budget (so they're never bumped out by long supporting files); other attachments stay at 4000 chars.
- **Report rendering**: The HTML / Markdown / web meta card shows `Skill type: pipeline (auto-detected)` and lists every sub SKILL.md. Each pillar shows only the dimensions applicable to the current type by default; fully-N/A dims fold into a "show N dimensions not applicable to this skill type" toggle at the bottom.

```bash
# CLI: force pipeline lens regardless of structure heuristic
python3 skills/skill-scorer/scripts/score.py \
  --skill-type pipeline \
  --output-dir ./out \
  ./my-pipeline-package

# CLI: default auto, picks pipeline if any sub SKILL.md is found
python3 skills/skill-scorer/scripts/score.py --output-dir ./out ./my-skill
```

To extend: edit `applies_to` in `rubric.yaml`, run `python3 skills/skill-scorer/scripts/sync_rubric_to_ts.py` to mirror to `web/lib/rubric/rubric.ts`, and add a lens paragraph in `scripts/score.py::render_skill_type_block` and `web/lib/llm/prompts.ts::renderSkillTypeBlock` if introducing a new type-only dimension. The full applies_to table and extension guide live in [`skills/skill-scorer/USAGE.md`](skills/skill-scorer/USAGE.md#rubric-scope-filter-applies_to).

### Report UI Language Toggle

The HTML report ships a built-in ZH / EN toggle (defaults to Chinese; the choice is persisted to `localStorage`). `?lang=zh` / `?lang=en` in the URL forces a single language for sharing. Cmd+P only prints the currently selected language.

The LLM-generated `evidence` / `fix` / sub SKILL.md descriptions are author / model output and the renderer doesn't translate them. To control the LLM output language independent of the source SKILL.md language:

- **CLI**: `--llm-language {auto,zh,en}` (default `auto`, follows SKILL.md detection).
- **Web**: `runLlmReview(skill, rubric, { lang, outputLang: "zh" })` — `req.lang` controls prompt body language, `outputLang` controls LLM answer language.

```bash
# English skill, Chinese Deep Review answers
python3 skills/skill-scorer/scripts/score.py \
  --agent-prompt --llm-language zh ./my-english-skill > prompt.md
```

## Quick Start

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Configure Model Keys

To enable full Deep Review, put at least one provider key in `web/.env.local`:

```env
DEEPSEEK_API_KEY=
ANTHROPIC_API_KEY=
```

Real keys must stay in `.env.local` or your deployment platform's secret manager. Do not commit them.

For public deployments, keep the browser-origin guard enabled so tools cannot directly spend your model quota through `/api/llm`:

```env
LLM_REQUIRE_BROWSER_REQUEST=1
```

With this setting, normal web users can still click Deep Review without entering a token. The API only accepts same-origin browser requests from the SkillLens page. If you also need private server-to-server access, set `LLM_ACCESS_TOKEN` and pass it in `x-skilllens-llm-token` or `Authorization: Bearer ...`.

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

```bash
cd web
npm run lint
npm run typecheck
npm run build
```

More setup details are in `web/README.md`.

## Security

- Never commit `.env.local`, `.env`, or real API keys.
- Do not expose secrets through `NEXT_PUBLIC_*` variables.
- Keep `LLM_REQUIRE_BROWSER_REQUEST=1` before exposing a server with `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`.
- Rotate any key that was ever committed, pasted into an issue, shared in a screenshot, or included in logs.
- Run a secret scan before publishing, for example with `gitleaks detect --source .`.

## License

MIT
