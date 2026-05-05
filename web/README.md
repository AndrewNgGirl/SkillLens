# SkillLens

> Upload an Agent Skill → get a quantitative, rubric-based audit.
> Compatible with **Claude / OpenClaw** style skill packages.

SkillLens helps skill authors evaluate whether a skill is clear, valuable, reliable, lightweight, and ready to publish. It combines deterministic rule checks with optional LLM-based Deep Review and GitHub market research.

## What You Can Upload

- A single `SKILL.md`
- A skill folder with `scripts/`, `references/`, `assets/`, tests, or schemas
- A zipped skill package
- Claude-style, OpenClaw-style, or Cursor-compatible skill projects

The built-in sample comes from `../skills/skill-scorer/examples/pr-reviewer`.

## Scoring Model

The 100-point rubric has 5 pillars:

- Skill Value — target users, real need, value proposition, repeat use
- Market Competitiveness — differentiation, focus, replaceability, alternatives
- Runtime Cost — context size, dependency weight, layering, cacheability
- Reliability — task fit, deterministic fallback, output validation, edge cases
- Writeup Quality — metadata, discoverability, structure, safety, maintainability

The rubric source is `../skills/skill-scorer/rubric/rubric.yaml`.

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

### Security Notes

- Do not commit `.env.local`, `.env`, or any real API key.
- Do not put secrets in `NEXT_PUBLIC_*` variables. Those are bundled into client-side JavaScript.
- Use `web/.env.example` for documentation only; keep real values in your local machine or deployment platform secrets.
- If a real key was ever committed, pasted into an issue, shared in a screenshot, or included in logs, rotate it in the provider dashboard before publishing.

### Optional Environment Variables

```env
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
DEEPSEEK_MODEL=deepseek-v4-flash
LLM_THINKING_MODE=disabled
LLM_TIMEOUT_MS=180000
DAILY_SCORE_LIMIT=20
GITHUB_TOKEN=
MARKET_CACHE_TTL_MS=1800000
```

`GITHUB_TOKEN` is optional. It only increases the GitHub Search API rate limit for market research.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- `gray-matter` for frontmatter, `yaml` for rubric, `jszip` for archives
- Recharts for the radar chart, `html2canvas` + `jsPDF` for PDF export
- Rubric 单一事实源：`../skills/skill-scorer/rubric/rubric.yaml`（通过 `lib/rubric/rubric.ts` 镜像到 TS）

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
