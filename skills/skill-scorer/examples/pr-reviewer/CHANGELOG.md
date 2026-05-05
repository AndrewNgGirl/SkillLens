# Changelog

## 0.3.0
- Added `scripts/validate_review.py` + `assets/review.schema.json` for output validation.
- Multi-language linter support (Python / TypeScript / Go).
- Cache key now includes `team_rules_hash` so rule-set changes invalidate cache.

## 0.2.0
- Switched dedup to deterministic `(file, line, message_first_30_chars)` tuple.
- Added cache key.

## 0.1.0
- Initial release (Python only).
