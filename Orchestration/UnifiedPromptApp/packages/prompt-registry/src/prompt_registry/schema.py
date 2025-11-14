"""
Schema generation utilities for the Unified Prompt Registry.

The canonical specification is defined in docs/consolidation/02_canonical_schema.md
and this module keeps the JSON Schema representation in sync. The helper exposes
`build_prompt_schema()` for in-memory validation and `write_prompt_schema()` to
persist the schema under `packages/prompt-registry/schemas`.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict

SCHEMA_VERSION = "https://unified-prompt-app/schemas/prompt.schema.json"


def _string_or_string_array() -> Dict[str, Any]:
    return {
        "oneOf": [
            {"type": "string"},
            {"type": "array", "items": {"type": "string"}},
        ]
    }


def build_prompt_schema() -> Dict[str, Any]:
    """Return the canonical JSON Schema for a prompt definition."""

    schema: Dict[str, Any] = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": SCHEMA_VERSION,
        "title": "Unified Prompt Specification",
        "type": "object",
        "additionalProperties": False,
        "required": ["id", "version", "blocks", "variables"],
        "properties": {
            "id": {
                "type": "string",
                "pattern": r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$",
                "description": "Dot-delimited identifier (analytics.divisions.performance.summary).",
            },
            "version": {
                "type": "string",
                "pattern": r"^[0-9]+\.[0-9]+\.[0-9]+$",
                "description": "Semantic version that increments on breaking text/schema changes.",
            },
            "locale": {
                "type": "string",
                "pattern": r"^[a-z]{2}-[A-Z]{2}$",
            },
            "status": {
                "type": "string",
                "enum": ["active", "draft", "deprecated"],
            },
            "owners": {
                "type": "array",
                "items": {
                    "type": "string",
                    "format": "email",
                },
            },
            "provenance": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "source": {
                        "type": "string",
                        "enum": ["ideal", "react-ui", "workbench", "imported"],
                    },
                    "created_at": {
                        "type": "string",
                        "format": "date-time",
                    },
                    "notes": {"type": "string"},
                },
            },
            "risk_tier": {
                "type": "string",
                "enum": ["low", "med", "medium", "high", "critical"],
            },
            "models": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "recommended": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "compatible": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "temperature": {"type": "number"},
                    "top_p": {"type": "number"},
                    "max_tokens": {"type": "integer"},
                },
            },
            "variables": {
                "type": "object",
                "minProperties": 1,
                "additionalProperties": False,
                "patternProperties": {
                    r"^[A-Za-z_][A-Za-z0-9_]*$": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["type"],
                        "properties": {
                            "label": {"type": "string"},
                            "description": {"type": "string"},
                            "type": {
                                "type": "string",
                                "enum": ["string", "number", "boolean", "enum", "list", "json", "array"],
                            },
                            "required": {"type": "boolean"},
                            "default": {},
                            "validators": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "regex": {"type": "string"},
                                        "enum": {"type": "array"},
                                        "min": {"type": "number"},
                                        "max": {"type": "number"},
                                    },
                                },
                            },
                        },
                    }
                },
            },
            "blocks": {
                "type": "object",
                "additionalProperties": False,
                "required": ["system", "instructions"],
                "properties": {
                    "system": _string_or_string_array(),
                    "instructions": _string_or_string_array(),
                    "constraints": _string_or_string_array(),
                    "style": _string_or_string_array(),
                    "examples": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "input": {"type": "object"},
                                "output": {"type": "string"},
                            },
                            "required": ["output"],
                        },
                    },
                },
            },
            "outputs": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["text", "markdown", "json"],
                    },
                    "schema": {"type": "string"},
                },
            },
            "telemetry": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "pii": {
                        "type": "string",
                        "enum": ["none", "low", "medium", "high", "may_contain"],
                    },
                    "audit": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "last_validated": {"type": "string", "format": "date-time"},
                            "runs": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "timestamp": {"type": "string", "format": "date-time"},
                                        "status": {"type": "string"},
                                        "reviewers": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                        "notes": {"type": "string"},
                                        "manifest": {
                                            "type": ["string", "null"],
                                        },
                                    },
                                    "required": ["timestamp", "status"],
                                },
                            },
                            "tests": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "mode": {"type": "string"},
                                        "asserts": {"type": "object"},
                                    },
                                    "required": ["mode"],
                                },
                            },
                        },
                    },
                },
            },
            "integrations": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "ui": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "title": {"type": "string"},
                            "category": {"type": "string"},
                            "context": {"type": "string"},
                            "tags": {"type": "array", "items": {"type": "string"}},
                        },
                    },
                    "workbench": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "endpoint": {"type": "string"},
                            "notes": {"type": "string"},
                        },
                    },
                    "orchestration": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "review_policy": {"type": "string", "enum": ["none", "standard", "critical"]},
                        },
                    },
                },
            },
        },
    }
    return schema


def write_prompt_schema(destination: Path) -> Path:
    """Write the generated schema to disk."""

    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(build_prompt_schema(), indent=2)
    destination.write_text(payload, encoding="utf-8")
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the canonical prompt JSON Schema.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "schemas" / "prompt.schema.json",
        help="Path where the schema should be written.",
    )
    args = parser.parse_args(argv)
    path = write_prompt_schema(args.output)
    print(f"[prompt-registry] wrote schema to {path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
