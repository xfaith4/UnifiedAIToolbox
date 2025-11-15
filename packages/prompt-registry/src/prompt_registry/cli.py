"""
Command-line entry point for interacting with the prompt registry.

Subcommands:
    list         - List prompt IDs (optionally filter by prefix).
    export       - Emit a prompt in canonical YAML or simplified JSON format.
    roundtrip    - Validate that every prompt can convert to the UI payload.
    schema       - Regenerate the canonical JSON Schema.
    lint         - Validate prompt files against the canonical schema.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from pathlib import Path
from typing import Iterable, List, Optional

from jsonschema import ValidationError

from . import PromptSpec, find_prompt_by_id, list_prompts
from .schema import write_prompt_schema
from .validation import lint_prompts, load_schema


def perform_roundtrip(prefix: Optional[str] = None) -> List[str]:
    """
    Convert every prompt to the UI payload and JSON-serialize it.

    Returns a list of prompt IDs that were validated.
    """

    checked: List[str] = []
    for spec in list_prompts():
        if prefix and not spec.id.startswith(prefix):
            continue
        payload = spec.to_ui_payload()
        # Ensure the payload can be serialized cleanly.
        json.loads(json.dumps(payload, ensure_ascii=False))
        checked.append(spec.id)
    return checked


def _cmd_list(args: argparse.Namespace) -> int:
    prompts: Iterable[PromptSpec] = list_prompts()
    for spec in prompts:
        if args.prefix and not spec.id.startswith(args.prefix):
            continue
        print(spec.id)
    return 0


def _cmd_export(args: argparse.Namespace) -> int:
    spec = find_prompt_by_id(args.prompt_id)
    if not spec:
        print(f"[prompt-registry] Prompt '{args.prompt_id}' not found.", file=sys.stderr)
        return 1

    if args.format == "raw":
        data = spec.raw
    elif args.format == "ui":
        data = spec.to_ui_payload()
    else:
        print(f"[prompt-registry] Unknown export format '{args.format}'.", file=sys.stderr)
        return 1

    serialized = json.dumps(data, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(serialized, encoding="utf-8")
    else:
        print(serialized)

    return 0


def _cmd_roundtrip(args: argparse.Namespace) -> int:
    checked = perform_roundtrip(prefix=args.prefix)
    if args.verbose:
        for prompt_id in checked:
            print(f"[prompt-registry] roundtrip ok :: {prompt_id}")
    print(f"[prompt-registry] validated {len(checked)} prompts.")
    return 0


def _cmd_schema(args: argparse.Namespace) -> int:
    target = Path(args.output)
    write_prompt_schema(target)
    print(f"[prompt-registry] wrote schema to {target}")
    return 0


def _cmd_lint(args: argparse.Namespace) -> int:
    schema = load_schema()
    failures = lint_prompts(schema=schema)
    if not failures:
        print("[prompt-registry] all prompts validated successfully.")
        return 0

    print("[prompt-registry] validation failures detected:")

    def fmt(error: ValidationError) -> str:
        fragment = ".".join(str(p) for p in error.path) or "<root>"
        return f"{fragment}: {error.message}"

    for result in failures:
        print(f"- {result.path}:")
        for error in result.errors:
            print(f"    · {fmt(error)}")
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="prompt-registry",
        description="Utilities for inspecting the Unified Prompt Registry.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List prompt IDs.")
    list_parser.add_argument("--prefix", help="Filter IDs by prefix.")
    list_parser.set_defaults(func=_cmd_list)

    export_parser = sub.add_parser("export", help="Export a prompt definition.")
    export_parser.add_argument("prompt_id", help="Semantic prompt identifier.")
    export_parser.add_argument(
        "--format",
        choices=["raw", "ui"],
        default="ui",
        help="Export canonical raw YAML payload or simplified JSON view (default).",
    )
    export_parser.add_argument(
        "--output",
        help="Write to file instead of stdout.",
    )
    export_parser.set_defaults(func=_cmd_export)

    roundtrip_parser = sub.add_parser("roundtrip", help="Validate YAML -> UI payload conversions.")
    roundtrip_parser.add_argument("--prefix", help="Restrict validation to IDs with this prefix.")
    roundtrip_parser.add_argument("--verbose", action="store_true", help="Print each validated ID.")
    roundtrip_parser.set_defaults(func=_cmd_roundtrip)

    schema_parser = sub.add_parser("schema", help="Regenerate the canonical prompt JSON Schema.")
    schema_parser.add_argument(
        "--output",
        default=Path(__file__).resolve().parents[2] / "schemas" / "prompt.schema.json",
        help="Where to write the schema file.",
    )
    schema_parser.set_defaults(func=_cmd_schema)

    lint_parser = sub.add_parser("lint", help="Validate prompts against the canonical schema.")
    lint_parser.set_defaults(func=_cmd_lint)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
