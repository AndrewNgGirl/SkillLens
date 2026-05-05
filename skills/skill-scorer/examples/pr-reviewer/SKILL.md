---
name: pr-reviewer
description: Use when the user asks to review, audit, comment on, or 评审 / 审查 a GitHub Pull Request. Generates structured review comments covering team-specific code style, naming, and structural conventions — complements (not replaces) bug-finding tools like Copilot Code Review or CodeQL.
version: 0.3.0
license: MIT
tags: [code-review, github, ci]
author: SkillLens Demo Team
---

# pr-reviewer

## When to use

When the user asks to review / audit / comment / 评审 / 审查 a GitHub PR by URL or local diff. Trigger phrases include:

- "帮我 review 这个 PR"
- "review https://github.com/.../pull/123"
- "check this diff before I merge"

**Not suitable for**: bug-hunting (use Copilot Code Review), security scans (use CodeQL), runtime performance review.

## Target users

- Open-source maintainers handling 5–20 PRs/week
- Small dev teams (3–8 engineers) without a dedicated reviewer
- Solo developers who want a second pair of eyes on style and structure

Estimated frequency: per-PR (high-frequency, daily for active repos).

## Why this skill

Unlike GitHub Copilot Code Review (focuses on bugs) or CodeQL (focuses on security), `pr-reviewer` focuses on **team-specific style and structural conventions** — the kind of rules that are written down in your team handbook but no off-the-shelf tool knows about.

Quantified value: cuts the average human "first-pass review" from ~30 min to ~5 min per PR — saves about 25 min/PR × 10 PRs/week ≈ 4 h/week per reviewer.

## Inputs

| Field | Type | Required | Notes |
|---|---|---|---|
| `pr_url` | string | yes | e.g. `https://github.com/owner/repo/pull/123` |
| `team_rules` | string | optional | path to team convention markdown; defaults to `references/default-rules.md` |
| `language` | enum | optional | one of `python`, `typescript`, `go`; auto-detect if omitted |

Cache key: SHA-256 of `(pr_url, head_sha, team_rules_hash)` — same PR + same head SHA reuses cached review without re-calling the LLM.

## Workflow

1. **Fetch diff**: call `scripts/fetch_pr.py` with `pr_url` → returns unified diff + file list.
2. **Static lint**: run language-specific linter (`ruff` / `eslint` / `golangci-lint`) for objective issues.
3. **Style review (LLM)**: feed diff + `team_rules` to the LLM, ask for ≤ 5 most impactful style issues with line refs.
4. **Compose comments**: merge linter issues + LLM issues into JSON, deduplicated by `(file, line, message_first_30_chars)`.
5. **Validate output**: pass through `scripts/validate_review.py` against `assets/review.schema.json`; on fail, regenerate once, then escalate to user.
6. **Output**: structured JSON ready for `gh pr review --comment` or copy-paste into a GitHub review.

## Outputs

```json
{
  "summary": "string, ≤ 200 chars",
  "comments": [
    { "file": "path/to/file.py", "line": 42, "severity": "info|warn|error", "message": "string" }
  ],
  "approve": "comment | request_changes | approve"
}
```

Schema lives at `assets/review.schema.json`; `comments[].severity` must be one of the three enum values.

## Dependencies

| Name | Type | Paid? | Approx cost / call |
|---|---|---|---|
| GitHub API (read-only) | API | free (60 req/h unauth, 5000/h with token) | $0 |
| `ruff` / `eslint` / `golangci-lint` | CLI | free | $0 |
| Skill's underlying LLM provider | API | yes | ~$0.005 / PR |

## Determinism

- Steps 1, 2, 5 are fully deterministic (scripts only).
- Step 3 (LLM) uses `temperature=0.2`; same diff + same rules produces ≈ same output across reruns.
- Step 4 deduplicates by `(file, line, message_first_30_chars)` so result order doesn't matter.

## Failure handling

- GitHub API 403 / 404 → tell user "PR not accessible; check URL or auth token"; do not retry.
- Linter binary missing → skip step 2 with a warning, continue with LLM-only review.
- LLM output schema validation fails twice → return raw LLM output verbatim with a `_schema_failed: true` flag and surface the validation error to the user.
- Rate limit hit → exponential backoff up to 3 retries; if all fail, return the partial review with `_partial: true`.

## Privacy

Diff content is sent to the LLM provider configured by the host (e.g. DeepSeek / Anthropic). Do **NOT** use this skill on PRs containing secrets, credentials, or internal-only code without first checking your provider's data retention policy. See `references/privacy.md` for per-provider notes. No PR data is persisted by this skill itself.

## Example

```bash
# input
pr-reviewer review https://github.com/octocat/hello-world/pull/42

# output (truncated)
{
  "summary": "3 minor style issues; safe to merge after fixes.",
  "comments": [
    {"file": "src/utils.py", "line": 18, "severity": "warn",
     "message": "Function process_data has 4 params; consider grouping into a dataclass per team rule §2.3."},
    {"file": "src/utils.py", "line": 45, "severity": "info",
     "message": "Magic number 0.85 — extract to a named constant THRESHOLD."}
  ],
  "approve": "comment"
}
```

## Files

- `scripts/fetch_pr.py` — GitHub API client for diff fetching
- `scripts/validate_review.py` — JSON schema validator
- `references/default-rules.md` — fallback team conventions if user doesn't supply one
- `references/privacy.md` — per-LLM-provider data handling notes (read before reviewing PRs containing secrets)
- `assets/review.schema.json` — JSON schema for output validation
- `tests/sample_inputs.json` — sample PR diffs for regression testing
- `tests/expected_outputs.json` — expected reviews for those diffs

## Changelog

- `0.3.0` — added schema validation step, multi-language linter support
- `0.2.0` — switched to deterministic dedup; added cache key
- `0.1.0` — initial release (Python only)
