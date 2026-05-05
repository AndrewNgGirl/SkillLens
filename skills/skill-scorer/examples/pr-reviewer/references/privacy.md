# Per-provider data handling notes

Read this before reviewing PRs that contain anything sensitive.

## DeepSeek

- Free tier: prompts may be used to improve models — do not send private code.
- Paid API: zero-retention, but read the latest TOS.

## Anthropic Claude

- API requests are not used for training by default.
- Inputs/outputs are retained for up to 30 days for trust & safety; can be opted out via Zero Data Retention agreement.

## OpenAI

- API requests are not used for training by default since March 2023.
- Standard 30-day retention applies; ZDR available for enterprise.

## Local / self-hosted

- If using a local model (Ollama, vLLM, etc.) no data leaves the host. Recommended for proprietary code.

## Recommendation

- If the diff contains anything you would not paste into a public Slack channel, use a local model or skip the LLM step entirely (linter-only mode).
