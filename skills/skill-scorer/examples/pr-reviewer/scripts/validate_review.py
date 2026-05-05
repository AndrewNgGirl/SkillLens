"""Validate a review JSON object against assets/review.schema.json.

Returns exit code 0 on pass, 1 on fail. Prints structured errors to stderr.
"""
import json
import sys
from pathlib import Path

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "assets" / "review.schema.json"


def validate(obj: dict) -> list[str]:
    schema = json.loads(SCHEMA_PATH.read_text())
    errors: list[str] = []
    for field in schema.get("required", []):
        if field not in obj:
            errors.append(f"missing required field: {field}")
    sev_enum = schema["properties"]["comments"]["items"]["properties"]["severity"]["enum"]
    for i, c in enumerate(obj.get("comments", [])):
        if c.get("severity") not in sev_enum:
            errors.append(f"comments[{i}].severity must be one of {sev_enum}")
    return errors


if __name__ == "__main__":
    errs = validate(json.loads(sys.stdin.read()))
    if errs:
        print("\n".join(errs), file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
