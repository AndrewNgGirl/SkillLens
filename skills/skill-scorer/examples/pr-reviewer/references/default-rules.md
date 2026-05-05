# Default team conventions

These are the fallback rules used when the user does not supply their own `team_rules` file.
Feel free to fork and customize for your own team.

## §1. Naming

- §1.1 Functions are `snake_case` in Python, `camelCase` in TS, `PascalCase` for types/classes.
- §1.2 Boolean variables start with `is_`, `has_`, or `should_`.
- §1.3 No abbreviations except well-known ones (`db`, `req`, `cfg`).

## §2. Function shape

- §2.1 Functions over 50 lines should be split or commented with a "why this is long" note.
- §2.2 Functions with 4+ positional parameters should use a dataclass / interface / kwargs object.
- §2.3 Public functions in libraries always have docstrings; private helpers do not need one.

## §3. Errors and logging

- §3.1 Never `except: pass` — log the exception and re-raise, or handle it explicitly.
- §3.2 Log lines should be parseable: prefer `logger.info("event=foo bar=%s", x)` over f-strings.
- §3.3 User-facing errors should not leak stack traces.

## §4. Tests

- §4.1 Every bug fix PR should include a regression test.
- §4.2 New public APIs should ship with at least one test demonstrating intended use.
- §4.3 Test names follow `test_<unit>_<scenario>_<expectation>` pattern.

## §5. Imports

- §5.1 No wildcard imports (`from foo import *`).
- §5.2 Standard library, third-party, local — separated by a blank line.
- §5.3 No unused imports (rely on `ruff`/`eslint` to catch these automatically).
