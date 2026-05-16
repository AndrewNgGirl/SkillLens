# SkillLens

> Upload an Agent Skill → get a quantitative, rubric-based audit.
> Compatible with **Claude / OpenClaw** style skill packages.

SkillLens helps skill authors evaluate whether a skill is clear, valuable, reliable, lightweight, and ready to publish. It combines deterministic rule checks with optional LLM-based Deep Review and GitHub market research.

The Web UI also includes a Finance Expert Review MVP. Users can choose a finance scenario before uploading, then full Deep Review adds `domainExpert.score`, finance risk level, and commercial readiness on top of the general SkillLens score.

## Scope Of This README

This file is only for running and configuring the Web app. For the full product overview, read `../README.md`. For Cursor, WorkBuddy, Hermes, or other code-agent workflows, use the official Agent CLI contract in `../skills/skill-scorer/USAGE.md`.

## What You Can Upload

- A single `SKILL.md`
- A skill folder with `scripts/`, `references/`, `assets/`, tests, or schemas
- A zipped skill package
- Claude-style, OpenClaw-style, or Cursor-compatible skill projects

The built-in sample comes from `../skills/skill-scorer/examples/pr-reviewer`.

## Scoring Model

The 100-point rubric has 5 pillars (Skill Value · Market Competitiveness · Runtime Cost · Reliability · Writeup Quality). Sub-dimensions are activated per skill structure:

- **atomic** — single-purpose skill; uses the full shared backbone (script fallback, output validation, etc.)
- **pipeline** — orchestrator over multiple sub SKILL.md; adds 5 type-specific dimensions (routing, sub-agent boundaries, IO protocol, partial-failure handling, sub-skill self-containment)
- **composite** — independent toolkit bundle; adds 4 type-specific dimensions (tool index, orthogonality, consistency, discoverability)

The Uploader has 4 type cards above the upload area (Auto / Atomic / Pipeline / Composite) so users can override the auto-detection. Out-of-scope dimensions are folded into a "show N dimensions not applicable" toggle at the bottom of each pillar to keep the dashboard clean.

The rubric source is `../skills/skill-scorer/rubric/rubric.yaml` (single source of truth, mirrored into `lib/rubric/rubric.ts` by `sync_rubric_to_ts.py`).

The finance expert overlay source is `../skills/skill-scorer/domains/finance/rubric.yaml`.

For the full rubric backbone, type-specific dimension table, and `applies_to` mechanism, see the root [`README.md`](../README.md) ("What It Evaluates" section) or [`USAGE.md`](../skills/skill-scorer/USAGE.md).

## Quick Start

```bash
cd web
npm install
cp .env.example .env.local
# edit .env.local and add your own model API key
npm run dev
# open http://localhost:3000
```

## Self-Hosted Model Configuration

SkillLens is designed for open-source self-hosting. API keys are read only from server-side environment variables and are never required in the browser.

1. Copy the example env file:

```bash
cp .env.example .env.local
```

2. Add at least one provider key:

```env
DEEPSEEK_API_KEY=
# or
ANTHROPIC_API_KEY=
```

3. Start the app:

```bash
npm run dev
```

If no model key is configured, SkillLens falls back to mock scores so the UI can still be previewed.

## Web Features

- Upload a single `SKILL.md`, a skill folder, or a zipped skill package.
- Choose `General Review` or a supported expert domain before upload.
- Finance Expert Review currently supports fundraising, quant trading, stock trading, securities research, banking workflow, financial education, financial data analysis, and other finance scenarios.
- Load built-in examples. Finance examples are mapped to the selected finance scenario.
- Run optional LLM Deep Review when a provider key is configured.
- View score KPI cards, radar charts, pillar/check details, top suggestions, and editable weights.
- Export JSON, copy Markdown, or generate PDF.

## Code Agent / CLI Usage

This README is only for the Web app. For Cursor, WorkBuddy, Hermes, or other code-agent workflows, use the official agent contract in `../skills/skill-scorer/USAGE.md`.

For a public deployment, keep the browser-origin guard enabled so visitors cannot spend your model key by calling `/api/llm` directly from tools:

```env
LLM_REQUIRE_BROWSER_REQUEST=1
```

With this setting, users can still click Deep Review in the web UI without entering a token. `/api/llm` only accepts same-origin browser requests from the SkillLens page. If you also need private server-to-server access, set `LLM_ACCESS_TOKEN` and pass it in `x-skilllens-llm-token` or `Authorization: Bearer ...`.

### Security Notes

- Do not commit `.env.local`, `.env`, or any real API key.
- Do not put secrets in `NEXT_PUBLIC_*` variables. Those are bundled into client-side JavaScript.
- Keep `LLM_REQUIRE_BROWSER_REQUEST=1` before exposing a server that has `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY`.
- Use `web/.env.example` for documentation only; keep real values in your local machine or deployment platform secrets.
- If a real key was ever committed, pasted into an issue, shared in a screenshot, or included in logs, rotate it in the provider dashboard before publishing.

### Optional Environment Variables

```env
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
DEEPSEEK_MODEL=deepseek-v4-flash
LLM_THINKING_MODE=disabled
LLM_TIMEOUT_MS=180000
DAILY_SCORE_LIMIT=20
LLM_REQUIRE_BROWSER_REQUEST=1
LLM_ACCESS_TOKEN=
GITHUB_TOKEN=
MARKET_CACHE_TTL_MS=1800000
```

`GITHUB_TOKEN` is optional. It only increases the GitHub Search API rate limit for market research.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- `gray-matter` for frontmatter, `yaml` for rubric, `jszip` for archives
- Recharts for the radar chart, `html2canvas` + `jsPDF` for PDF export
- General rubric source of truth: `../skills/skill-scorer/rubric/rubric.yaml`
- Finance expert rubric source: `../skills/skill-scorer/domains/finance/rubric.yaml`
- TypeScript rubric mirror: `lib/rubric/rubric.ts`

## Important Directories

```text
web/
├── app/                  # Pages and API routes
│   └── api/
│       ├── llm/          # Server-side LLM review endpoint
│       ├── market/       # GitHub market survey endpoint
│       └── sample/[id]/  # Built-in sample loader
├── components/           # Upload, report, radar, pillar/check UI
├── lib/
│   ├── domain/           # Finance expert domain logic
│   ├── llm/              # Provider, prompt, cache, and types
│   ├── market/           # Keyword extraction and market client
│   ├── rubric/           # TS mirror of the general rubric
│   ├── scoring/          # Rule scoring, aggregation, LLM client
│   └── spec/             # Skill loading and parsing
└── .env.example
```

## Scripts

- `npm run dev` — 启动本地开发服务器
- `npm run lint` — 运行 ESLint
- `npm run build` — 生产构建
- `npm run typecheck` — TS 类型检查

## Before Publishing

Run a quick secret scan before publishing. For example, use a dedicated tool such as `gitleaks`:

```bash
gitleaks detect --source .
```

The scan may find variable names in docs or code. It should not find real secret values.
