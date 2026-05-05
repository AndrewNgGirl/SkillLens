# SkillLens

[简体中文](README.md) | [English](README.en.md)

## Product Demo

https://github.com/user-attachments/assets/8bc9bfce-bfe5-4c3a-a915-9aaf1520969e

SkillLens is an open-source, self-hosted web tool for evaluating **Agent Skills**. Upload a `SKILL.md`, a skill folder, or a skill package, and SkillLens turns it into a quantitative report with rubric scores, evidence, Deep Review feedback, market signals, and concrete improvement suggestions.

It is designed for people building skills for Cursor, Claude, OpenClaw, or similar agent ecosystems who want to answer one simple question:

> Is this skill actually useful, reliable, discoverable, and worth publishing?

## Why It Is Worth Trying

SkillLens is not just a `SKILL.md` format checker. It treats a skill as an early-stage AI product artifact and evaluates whether it is clear, useful, commercially valuable, differentiated, affordable to run, stable, and maintainable. In other words, it helps you tell the difference between "this skill is formatted correctly" and "this skill is worth installing and using repeatedly".

- **Moves beyond "well-written" to "worth building"**: it checks metadata, structure, and examples, but also evaluates target users, usage frequency, value proposition, and long-term memorability.
- **Turns subjective review into a weighted report**: the default rubric has 5 pillars and 24 sub-dimensions, and all weights can be customized for your team's standards.
- **Looks at market context and replacement risk**: it asks not only "does this skill run?", but also "why is it better than generic LLM usage, Copilot, CodeQL, or existing open-source alternatives?"
- **Accounts for real operating cost**: it reviews context budget, reference layering, dependency weight, and cache friendliness, so a skill does not just look powerful while being slow, expensive, or fragile.
- **Produces actionable improvement paths**: reports include evidence, scores, grades, and top suggestions, making it useful before open-sourcing, internal review, or marketplace submission.
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

SkillLens uses a 100-point rubric with 5 pillars and 24 sub-dimensions. These are the default weights:

| Pillar | Default Weight | Sub-dimensions |
|---|---:|---|
| Skill Value | 25 | Target User Clarity 5; User Need Realness 6; Value Articulation 5; Repeat-use Value 5; Moat / Memorability Potential 4 |
| Market Competitiveness | 15 | Differentiation 5; Scope Focus 4; LLM Replaceability Risk 3; Competitor Awareness 3 |
| Runtime Cost | 15 | Context Budget 4; Reference Layering 4; External Dependency Weight 4; Cache Friendliness 3 |
| Reliability | 20 | Task–Model Fit 5; Script Fallback 4; Output Validation 4; Idempotency 3; Failure Path 2; Edge Cases 2 |
| Writeup Quality | 25 | Metadata Conformance 4; Discoverability 5; Structure & Readability 3; Actionability 6; Safety & Compliance 3; Maintainability 4 |

All pillar and sub-dimension weights can be customized in the web UI. The defaults are tuned for general open-source skill evaluation, but teams can rebalance the rubric for business value, runtime cost, internal reliability, or other priorities.

The rubric lives in `skills/skill-scorer/rubric/rubric.yaml` and is the single source of truth for both the web app and the skill-scorer workflow.

## Supported Inputs

SkillLens can evaluate:

- A single `SKILL.md`
- A skill folder containing files such as `scripts/`, `references/`, `assets/`, tests, schemas, or examples
- A zipped skill package
- Claude-style skills
- OpenClaw-style skills
- Cursor-compatible skill projects

The included demo skill is `skills/skill-scorer/examples/pr-reviewer`, a PR review skill used to demonstrate what a strong, well-structured skill looks like.

## Output

SkillLens produces:

- Overall score and grade: `S / A / B / C / D`
- Radar chart and pillar-level breakdown
- Rule-based checks with pass / partial / fail statuses
- Optional LLM-powered Deep Review
- Market research signals from GitHub search
- Top improvement suggestions
- Exportable report

If no model key is configured, SkillLens still runs in preview mode with mock scores so you can explore the UI.

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

## Repository Structure

```text
.
├── README.md
├── README.en.md
├── LICENSE
├── skills/
│   └── skill-scorer/
│       ├── SKILL.md
│       ├── rubric/rubric.yaml
│       ├── scripts/
│       ├── references/
│       └── examples/pr-reviewer/
└── web/
    ├── app/
    ├── components/
    ├── lib/
    ├── .env.example
    └── README.md
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
- Rotate any key that was ever committed, pasted into an issue, shared in a screenshot, or included in logs.
- Run a secret scan before publishing, for example with `gitleaks detect --source .`.

## License

MIT
