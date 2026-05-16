---
name: pr-pipeline
description: Use when the user wants to review a GitHub pull request through a multi-stage pipeline. Routes through reviewer, summarizer, and final report stages.
version: 1.0.0
license: MIT
---

# PR Pipeline Orchestrator

When to use: PR review automation for OSS maintainers handling weekly batches.

## Workflow
1. agents/reviewer — line-by-line code review
2. agents/summarizer — summarize findings into a digest
3. Final stage — emit JSON report

## Sub-skills
- agents/reviewer/SKILL.md
- agents/summarizer/SKILL.md
