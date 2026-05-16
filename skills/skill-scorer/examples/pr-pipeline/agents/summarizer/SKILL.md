---
name: pr-summarizer-agent
description: Use when the pipeline needs to compress reviewer output into a digest. Pure function over ReviewReport.
---

# PR Summarizer Sub-Agent

## Inputs
- review_report (ReviewReport from sibling reviewer)

## Outputs
DigestReport(BaseModel)
