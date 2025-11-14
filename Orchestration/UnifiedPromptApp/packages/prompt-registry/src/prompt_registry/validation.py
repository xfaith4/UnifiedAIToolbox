"""
Validation helpers that enforce the canonical JSON Schema across the registry.

Exposed helpers:
- `load_schema`  -> returns the prompt schema dict (reads from disk or regenerates).
- `validate_prompt_spec` -> yields jsonschema errors for a single PromptSpec.
- `lint_prompts` -> validates every prompt file and returns an error summary.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

from jsonschema import Draft202012Validator, ValidationError

from . import PROMPT_ROOT, PromptSpec, iter_prompt_files, load_prompt
from .schema import build_prompt_schema

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "prompt.schema.json"


def load_schema(path: Path | None = None) -> Dict:
    """Load the JSON Schema from disk or rebuild it if missing."""

    schema_path = (path or SCHEMA_PATH).resolve()
    if schema_path.exists():
        return json.loads(schema_path.read_text(encoding="utf-8"))
    return build_prompt_schema()


def _build_validator(schema: Dict | None = None) -> Draft202012Validator:
    payload = schema or load_schema()
    Draft202012Validator.check_schema(payload)
    return Draft202012Validator(payload)


def validate_prompt_spec(spec: PromptSpec, validator: Draft202012Validator | None = None) -> List[ValidationError]:
    """Return validation errors for a single PromptSpec."""

    active_validator = validator or _build_validator()
    return list(active_validator.iter_errors(spec.raw))


@dataclass
class LintResult:
    path: Path
    errors: Sequence[ValidationError]


def lint_prompts(root: Path = PROMPT_ROOT, schema: Dict | None = None) -> List[LintResult]:
    """Validate every prompt file and return any failures."""

    validator = _build_validator(schema)
    failures: List[LintResult] = []
    for path in iter_prompt_files(root):
        spec = load_prompt(path)
        errors = validate_prompt_spec(spec, validator)
        if errors:
            failures.append(LintResult(path=path, errors=errors))
    return failures


def _format_error(error: ValidationError) -> str:
    path = ".".join(str(p) for p in error.path) or "<root>"
    return f"{path}: {error.message}"


def run_cli(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate prompts against the canonical schema.")
    parser.add_argument("--root", type=Path, default=PROMPT_ROOT, help="Override the prompt directory.")
    parser.add_argument("--json", action="store_true", help="Emit results as JSON.")
    args = parser.parse_args(argv)

    failures = lint_prompts(root=args.root)
    if args.json:
        serialized = [
            {
                "path": str(result.path),
                "errors": [_format_error(err) for err in result.errors],
            }
            for result in failures
        ]
        print(json.dumps(serialized, indent=2))
    else:
        if failures:
            print("[prompt-registry] validation failures detected:")
            for result in failures:
                print(f"- {result.path}:")
                for err in result.errors:
                    print(f"    · {_format_error(err)}")
        else:
            print("[prompt-registry] all prompts validated successfully.")

    return 0 if not failures else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run_cli())
