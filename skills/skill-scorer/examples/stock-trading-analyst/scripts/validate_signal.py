#!/usr/bin/env python3
"""Validate stock signal reports against the bundled JSON schema."""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    sys.stderr.write("missing dependency: pip install jsonschema\n")
    sys.exit(2)


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("usage: validate_signal.py <report.json>\n")
        return 2

    root = Path(__file__).resolve().parents[1]
    schema = json.loads((root / "assets" / "stock_signal.schema.json").read_text(encoding="utf-8"))
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))

    jsonschema.validate(payload, schema)

    disclaimer = str(payload.get("risk_disclaimer", "")).lower()
    if "not personalized investment advice" not in disclaimer:
        raise ValueError("risk_disclaimer must state that this is not personalized investment advice")

    for item in payload.get("watchlist", []):
        if item.get("risk_level") in {"high", "critical"} and not item.get("human_review_required"):
            raise ValueError(f"{item.get('code')} high-risk item must require human review")

    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
