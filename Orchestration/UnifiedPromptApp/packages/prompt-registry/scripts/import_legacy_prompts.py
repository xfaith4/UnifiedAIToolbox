#!/usr/bin/env python3
"""
Utility for migrating legacy prompt sources into the canonical registry.

Supported source formats:
    - prompt-library (React/Vite app: prompt-library.json)
    - prompt-service (FastAPI templates/*.yaml)
    - ideal (Ideal Prompt Library canonical YAML files)

Each import path normalizes IDs, injects provenance metadata, and validates the
resulting YAML against the canonical schema before writing to prompts/catalog.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import yaml
from jsonschema import Draft202012Validator


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PACKAGE_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from prompt_registry.validation import load_schema  # type: ignore  # pylint: disable=wrong-import-position

DEFAULT_DEST = PACKAGE_ROOT / "prompts" / "catalog"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_id(raw: str, prefix: Optional[str] = None) -> str:
    slug = re.sub(r"[^a-zA-Z0-9._-]+", ".", raw.strip())
    slug = re.sub(r"\.{2,}", ".", slug).strip(".").lower()
    if prefix and not slug.startswith(prefix):
        slug = f"{prefix}.{slug}"
    return slug


def _normalize_var_name(raw: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_]", "_", raw.strip())
    slug = re.sub(r"_+", "_", slug).strip("_")
    if not slug:
        slug = "var"
    if slug[0].isdigit():
        slug = f"var_{slug}"
    return slug


def _infer_format_hint(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    stripped = value.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        return "json"
    return "text"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _write_yaml(target: Path, payload: Dict[str, Any], dry_run: bool) -> None:
    if dry_run:
        print(f"[dry-run] would write {target}")
        return
    _ensure_dir(target.parent)
    target.write_text(yaml.safe_dump(payload, sort_keys=False, allow_unicode=True), encoding="utf-8")
    print(f"[import] wrote {target}")


def _validate_spec(payload: Dict[str, Any], validator: Draft202012Validator) -> None:
    validator.validate(payload)


def _build_examples(entries: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for entry in entries:
        if not entry:
            continue
        output = entry.get("output")
        if not output:
            continue
        input_payload = entry.get("input")
        if isinstance(input_payload, str):
            example = {"input": {"raw": input_payload}, "output": output}
        elif isinstance(input_payload, dict):
            example = {"input": input_payload, "output": output}
        else:
            example = {"output": output}
        results.append(example)
    return results


def _render_section(name: str, value: Any) -> str:
    serialized = yaml.safe_dump(value, sort_keys=False, allow_unicode=True).strip()
    return f"{name}:\n{serialized}"


def _find_braced_tokens(*chunks: str) -> List[str]:
    pattern = re.compile(r"{([A-Za-z0-9_]+)}")
    found: List[str] = []
    for chunk in chunks:
        if not chunk:
            continue
        found.extend(pattern.findall(chunk))
    return sorted(set(found))


def _dest_path(args: argparse.Namespace, prompt_id: str, version: Optional[str] = None) -> Path:
    catalog = Path(args.catalog_subdir)
    filename = prompt_id if not version else f"{prompt_id}.{version}"
    return (args.dest / catalog / f"{filename}.prompt.yaml").resolve()


def _create_variable_entry(name: str, description: Optional[str] = None, required: bool = False, var_type: str = "string") -> Dict[str, Any]:
    entry: Dict[str, Any] = {"type": var_type}
    if description:
        entry["description"] = description
    if required:
        entry["required"] = True
    return entry


BLOCK_SCALAR_PATTERN = re.compile(r"^\s*[A-Za-z0-9_.-]+:\s*[|>]\s*$")
BARE_MULTILINE_KEY_PATTERN = re.compile(r"^\s*([A-Za-z0-9_.-]+):\s*$")


def _fix_legacy_block_scalars(text: str) -> str:
    """
    Some legacy YAML files omit indentation for block scalars (e.g., `system: |` followed by
    lines starting at column 0). This helper indents those sections so PyYAML can parse them.
    """

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        match = BARE_MULTILINE_KEY_PATTERN.match(line)
        is_block_scalar = BLOCK_SCALAR_PATTERN.match(line)
        if match and not is_block_scalar:
            lookahead = i + 1
            while lookahead < len(lines) and lines[lookahead].strip() == "":
                lookahead += 1
            if lookahead >= len(lines):
                i += 1
                continue
            next_line = lines[lookahead]
            # New top-level key means this was just an empty mapping; leave as-is.
            if re.match(r"^[A-Za-z0-9_.-]+\s*:", next_line):
                i += 1
                continue
            # Handle immediate list entries (legacy style `key:` followed by `- item`).
            if next_line.startswith("- "):
                j = lookahead
                while j < len(lines) and lines[j].startswith("- "):
                    lines[j] = "  " + lines[j]
                    j += 1
                i = j
                continue
            # Otherwise treat as a block scalar.
            lines[i] = f"{line} |"
            is_block_scalar = True

        if is_block_scalar:
            j = i + 1
            # Skip blank/comment lines immediately after the block scalar indicator.
            while j < len(lines) and (lines[j].strip() == "" or lines[j].lstrip().startswith("#")):
                j += 1
            while j < len(lines):
                current = lines[j]
                stripped = current.strip()
                if stripped == "" or current.startswith(" "):
                    # Blank or already indented -> stop when blank; otherwise leave as-is.
                    if stripped == "":
                        break
                    j += 1
                    continue
                # Stop when we detect a new top-level key (word + colon) or list marker.
                if re.match(r"^[A-Za-z0-9_.-]+\s*:", current):
                    break
                if current.lstrip().startswith("- "):
                    break
                lines[j] = "  " + current
                j += 1
            i = j
        else:
            i += 1
    return "\n".join(lines) + ("\n" if text.endswith("\n") else "")


@dataclass
class LegacyTemplateText:
    template_id: str
    system: Optional[str]
    instructions: str


LEGACY_ID_RE = re.compile(r"^id:\s*([A-Za-z0-9._-]+)", re.MULTILINE)


def _parse_prompt_service_text(text: str) -> Optional[LegacyTemplateText]:
    match = LEGACY_ID_RE.search(text)
    if not match:
        return None
    template_id = match.group(1).strip()
    lines = text.splitlines()
    system_lines: List[str] = []
    instructions_start = 0
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("system:"):
            if stripped == "system:" or stripped.endswith("|"):
                j = idx + 1
                while j < len(lines) and lines[j].strip() == "":
                    j += 1
                while j < len(lines):
                    nxt = lines[j]
                    if re.match(r"^[A-Za-z0-9_.-]+\s*[:]", nxt):
                        break
                    system_lines.append(nxt)
                    j += 1
                instructions_start = j
            else:
                system_lines.append(line.split(":", 1)[1].strip())
                instructions_start = idx + 1
            break
    system_text = "\n".join(system_lines).strip() if system_lines else None
    instructions = "\n".join(lines[instructions_start:]).strip()
    return LegacyTemplateText(template_id=template_id, system=system_text, instructions=instructions)


# --------------------------------------------------------------------------- #
# Prompt Library (React app, prompt-library.json)
# --------------------------------------------------------------------------- #
def run_prompt_library(args: argparse.Namespace, validator: Draft202012Validator) -> None:
    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("Expected prompt-library.json to contain a list.")

    for record in data:
        prompt_id = _normalize_id(record["id"], prefix=args.id_prefix)
        version = args.default_version
        system_msg = record.get("description") or f"You are an assistant for {record.get('title', prompt_id)}."
        instructions = record.get("template") or ""
        style = record.get("style") or ""
        constraints = None
        output_hint = _infer_format_hint(record.get("outputFormat"))
        if record.get("outputFormat"):
            constraints = f"Output {output_hint or 'text'} matching:\n{record['outputFormat']}"

        variables: Dict[str, Any] = {}
        for var in record.get("variables", []):
            name = _normalize_var_name(var["name"])
            entry = {
                "type": {
                    "string": "string",
                    "multiline": "string",
                    "number": "number",
                    "integer": "number",
                    "boolean": "boolean",
                    "json": "json",
                }.get(str(var.get("type", "string")).lower(), "string"),
            }
            if var.get("label"):
                entry["label"] = var["label"]
            if var.get("description"):
                entry["description"] = var["description"]
            if var.get("required"):
                entry["required"] = True
            if var.get("options"):
                entry["enum"] = var["options"]
            variables[name] = entry

        if not variables:
            variables["input"] = _create_variable_entry("input", "Free-form input payload.", required=True, var_type="string")

        examples = _build_examples(record.get("fewShot", []))

        spec: Dict[str, Any] = {
            "id": prompt_id,
            "version": version,
            "status": args.status,
            "provenance": {
                "source": "react-ui",
                "notes": f"Imported via prompt-library ({args.json})",
                "created_at": record.get("createdAt") or record.get("updatedAt") or _now_iso(),
            },
            "blocks": {
                "system": system_msg,
                "instructions": instructions,
            },
            "variables": variables,
            "telemetry": {
                "tags": record.get("tags", []),
            },
            "integrations": {
                "ui": {
                    "title": record.get("title"),
                    "category": args.category,
                    "context": record.get("description"),
                    "tags": record.get("tags", []),
                }
            },
            "models": {
                "temperature": record.get("temperature"),
                "top_p": record.get("top_p"),
                "recommended": args.models or [],
            },
        }
        if style:
            spec["blocks"]["style"] = style
        if constraints:
            spec["blocks"]["constraints"] = constraints
        if examples:
            spec["blocks"]["examples"] = examples
        if args.tags:
            spec["telemetry"]["tags"] = sorted(set(spec["telemetry"].get("tags", []) + args.tags))
        if record.get("outputFormat"):
            spec["outputs"] = {"format": output_hint or "text", "schema": record["outputFormat"]}

        _validate_spec(spec, validator)
        dest = _dest_path(args, prompt_id, version)
        if dest.exists() and not args.overwrite:
            print(f"[skip] {dest} already exists (use --overwrite).")
            continue
        _write_yaml(dest, spec, args.dry_run)


# --------------------------------------------------------------------------- #
# Prompt Service (FastAPI templates/*.yaml)
# --------------------------------------------------------------------------- #
def _split_prompt_service_id(raw_id: str, default_version: str) -> Dict[str, str]:
    match = re.match(r"^(?P<slug>.+?)_v(?P<version>[0-9]+\.[0-9]+\.[0-9]+)$", raw_id)
    if match:
        slug = match.group("slug")
        version = match.group("version")
    else:
        slug = raw_id
        version = default_version
    normalized = slug.replace("_", ".").lower()
    return {"id": normalized, "version": version}


def _compose_instructions(data: Dict[str, Any]) -> str:
    sections: List[str] = []
    for key in [
        "task",
        "conventions",
        "terminology",
        "thresholds",
        "language_style",
        "dataset_contract",
        "output_contract",
        "measures_dax",
        "visuals_catalog",
    ]:
        value = data.get(key)
        if value:
            sections.append(_render_section(key, value))
    return "\n\n".join(sections) or "Follow the dataset, output, and language contracts defined in this file."


def run_prompt_service(args: argparse.Namespace, validator: Draft202012Validator) -> None:
    templates_dir = Path(args.templates).resolve()
    files = sorted(templates_dir.glob("*.yaml"))
    if args.include:
        patterns = [re.compile(pattern) for pattern in args.include]
        files = [path for path in files if any(p.search(path.name) for p in patterns)]
    if not files:
        raise ValueError(f"No YAML templates found under {templates_dir}")

    for path in files:
        raw_text = path.read_text(encoding="utf-8")
        legacy_text: Optional[LegacyTemplateText] = None
        try:
            raw = yaml.safe_load(raw_text)
        except yaml.YAMLError:
            fixed = _fix_legacy_block_scalars(raw_text)
            try:
                raw = yaml.safe_load(fixed)
                print(f"[warn] applied legacy block-scalar fix to {path}")
            except yaml.YAMLError as exc:
                legacy_text = _parse_prompt_service_text(raw_text)
                if not legacy_text:
                    print(f"[error] unable to parse {path}: {exc}")
                    continue
                raw = {}
        id_parts = _split_prompt_service_id(raw.get("id") or path.stem, args.default_version)
        prompt_id = id_parts["id"]
        version = id_parts["version"]

        system_msg = legacy_text.system if legacy_text else raw.get("system")
        if not system_msg:
            system_msg = "You are an incident-ready analysis assistant."
        instructions = legacy_text.instructions if legacy_text else _compose_instructions(raw)
        examples_source = raw.get("few_shot")
        if isinstance(examples_source, dict):
            examples_source = [examples_source]
        examples = _build_examples(examples_source or [])

        tokens = _find_braced_tokens(system_msg, instructions)
        variables: Dict[str, Any] = {name: _create_variable_entry(name, required=False) for name in tokens}
        variables["input_data"] = _create_variable_entry(
            "input_data",
            "JSON payload expected by the legacy PromptService template.",
            required=True,
            var_type="json",
        )
        if not variables:
            variables["context"] = _create_variable_entry("context", "General context string.", required=True)

        outputs: Dict[str, Any] = {"format": "json"}
        if raw.get("output_contract"):
            outputs["schema"] = yaml.safe_dump(raw["output_contract"], sort_keys=False, allow_unicode=True)

        telemetry_tags = list(args.tags or [])

        spec: Dict[str, Any] = {
            "id": prompt_id,
            "version": version,
            "status": args.status,
            "provenance": {
                "source": "workbench",
                "notes": f"Imported from {path}",
                "created_at": _now_iso(),
            },
            "blocks": {
                "system": system_msg,
                "instructions": instructions,
            },
            "variables": variables,
            "telemetry": {
                "tags": telemetry_tags,
            },
            "integrations": {
                "ui": {
                    "category": args.category,
                    "title": raw.get("title") or prompt_id.split(".")[-1].replace("_", " ").title(),
                    "context": raw.get("summary") or "Migrated PromptService template.",
                    "tags": telemetry_tags,
                },
                "orchestration": {
                    "review_policy": args.review_policy,
                },
            },
            "models": {
                "recommended": args.models,
                "temperature": raw.get("temperature") or args.temperature,
                "top_p": args.top_p,
                "max_tokens": raw.get("max_tokens"),
            },
            "outputs": outputs,
        }

        if examples:
            spec["blocks"]["examples"] = examples

        if spec["models"].get("max_tokens") is None:
            spec["models"].pop("max_tokens", None)

        _validate_spec(spec, validator)
        dest = _dest_path(args, prompt_id, version)
        if dest.exists() and not args.overwrite:
            print(f"[skip] {dest} already exists (use --overwrite).")
            continue
        _write_yaml(dest, spec, args.dry_run)


# --------------------------------------------------------------------------- #
# Ideal Prompt Library mirror
# --------------------------------------------------------------------------- #
def run_ideal(args: argparse.Namespace, validator: Draft202012Validator) -> None:
    source = Path(args.prompts_root).resolve()
    files = sorted(source.rglob("*.yaml"))
    if not files:
        raise ValueError(f"No YAML files found under {source}")

    for path in files:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            print(f"[skip] {path} is not a prompt record.")
            continue
        prompt_id = data.get("id")
        version = data.get("version")
        if not prompt_id or not version:
            print(f"[skip] {path} missing id/version.")
            continue
        if args.tag:
            telemetry = data.setdefault("telemetry", {})
            tags = telemetry.setdefault("tags", [])
            telemetry["tags"] = sorted(set(tags + [args.tag]))
        _validate_spec(data, validator)
        dest = _dest_path(args, prompt_id)
        if dest.exists() and not args.overwrite:
            print(f"[skip] {dest} already exists (use --overwrite).")
            continue
        _write_yaml(dest, data, args.dry_run)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Import legacy prompt sources into the canonical registry.")
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="Destination prompts/catalog directory.")
    parser.add_argument("--catalog-subdir", default="imported", help="Relative directory under prompts/catalog.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without writing files.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite prompts when destination exists.")

    sub = parser.add_subparsers(dest="command", required=True)

    pl = sub.add_parser("prompt-library", help="Import prompt-library.json records.")
    pl.add_argument("--json", required=True, help="Path to prompt-library.json.")
    pl.add_argument("--default-version", default="1.0.0", help="Version to stamp on imported prompts.")
    pl.add_argument("--status", default="draft", help="Status to apply to imported prompts.")
    pl.add_argument("--category", default="Imported", help="UI category label.")
    pl.add_argument("--models", nargs="*", default=["gpt-4o-mini"], help="Default recommended models.")
    pl.add_argument("--tags", nargs="*", help="Extra telemetry tags to append.")
    pl.add_argument("--id-prefix", help="Optional prefix prepended to each prompt ID.")
    pl.set_defaults(handler=run_prompt_library)

    ps = sub.add_parser("prompt-service", help="Import PromptService templates/*.yaml.")
    ps.add_argument("--templates", required=True, help="Directory containing PromptService template YAML files.")
    ps.add_argument("--include", nargs="*", help="Regex filters applied to template filenames.")
    ps.add_argument("--default-version", default="1.0.0", help="Fallback version when template ID lacks suffix.")
    ps.add_argument("--status", default="draft", help="Status to apply.")
    ps.add_argument("--category", default="Operations", help="UI category.")
    ps.add_argument("--models", nargs="*", default=["gpt-4o-mini"], help="Recommended models list.")
    ps.add_argument("--tags", nargs="*", help="Telemetry tags.")
    ps.add_argument("--review-policy", default="manual", help="Default orchestration review policy.")
    ps.add_argument("--temperature", type=float, default=0.2, help="Default temperature when missing.")
    ps.add_argument("--top_p", type=float, default=1.0, help="Default top_p when missing.")
    ps.set_defaults(handler=run_prompt_service)

    ideal = sub.add_parser("ideal", help="Mirror the Ideal Prompt Library YAML into this registry.")
    ideal.add_argument("--prompts-root", required=True, help="Path to Ideal Prompt Library prompts directory.")
    ideal.add_argument("--tag", help="Optional telemetry tag to append to every prompt.")
    ideal.set_defaults(handler=run_ideal)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.dest = Path(args.dest).resolve()
    validator = Draft202012Validator(load_schema())
    args.handler(args, validator)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
