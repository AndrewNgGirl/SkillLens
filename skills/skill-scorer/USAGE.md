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

Use the final JSON output from step 3 as the only source of truth for:

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
4. 运行：
   python3 skills/skill-scorer/scripts/score.py --agent-prompt <path-to-skill-zip-dir-or-SKILL.md> > agent-deep-review-prompt.md
5. 用你自己的模型严格按 agent-deep-review-prompt.md 输出 JSON，并保存为 agent-llm-results.json。
6. 运行：
   python3 skills/skill-scorer/scripts/score.py --llm-results agent-llm-results.json <path-to-skill-zip-dir-or-SKILL.md>
7. 最终报告必须展示 deepReviewCertificate.status="verified"。如果没有 verified 证书，不要声称完成 SkillLens Deep Review。
```
