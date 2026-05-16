---
name: pr-reviewer-agent
description: Use when the parent pipeline routes a PR review request. Reads diff and produces a Pydantic ReviewReport.
---

# PR Reviewer Sub-Agent

## Inputs
- diff_text (str)

## Outputs (defined in scripts/schemas.py)
ReviewReport(BaseModel) with fields: comments, severity, suggestions

## Examples
```python
from scripts.schemas import ReviewReport
report = ReviewReport(comments=[...], severity="medium")
```
