# Changelog

## 0.2.0

- Added official agent-side Deep Review for code agents via `--agent-prompt` and `--llm-results`.
- Added verified `deepReviewCertificate` output so full Deep Review results can be distinguished from rule-only previews.
- Added direct `.zip` support to the official SkillLens CLI, matching the Web upload flow.
- Added `skills/skill-scorer/USAGE.md` as the single detailed contract for Cursor, WorkBuddy, Hermes, and similar code agents.
- Added browser-origin protection for `/api/llm` so public Web deployments can protect server-side model keys from direct tool calls.
- Reorganized README files so root docs describe the two entry points, Web docs stay focused on Web deployment, and agent workflow details live in `USAGE.md`.
