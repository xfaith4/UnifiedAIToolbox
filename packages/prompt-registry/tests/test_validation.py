from pathlib import Path

import yaml

from prompt_registry import PROMPT_ROOT, PromptSpec, load_prompt
from prompt_registry.schema import build_prompt_schema
from prompt_registry.validation import lint_prompts, validate_prompt_spec


def test_schema_includes_expected_required_fields():
    schema = build_prompt_schema()
    required = set(schema["required"])
    assert {"id", "version", "blocks", "variables"}.issubset(required)


def test_lint_prompts_passes_current_repo():
    failures = lint_prompts(PROMPT_ROOT)
    assert failures == []


def test_validate_prompt_spec_flags_invalid_payload():
    sample = load_prompt(
        PROMPT_ROOT
        / "examples"
        / "analytics"
        / "divisions.performance.summary.prompt.yaml"
    )
    broken = PromptSpec(
        id="broken.prompt",
        version="0.0.1",
        path=Path("broken.prompt.yaml"),
        raw={"id": sample.id, "version": sample.version, "blocks": {}, "variables": {}},
    )
    errors = validate_prompt_spec(broken)
    assert errors, "expected validation errors for missing required fields"


def _minimal_prompt(**overrides):
    payload = {
        "id": "example.prompt",
        "version": "1.2.3",
        "blocks": {
            "system": "System context",
            "instructions": "Follow directions",
        },
        "variables": {
            "input_text": {
                "type": "string",
                "required": True,
            }
        },
    }
    payload.update(overrides)
    return payload


def _write_prompt(tmp_path, payload, name="example.prompt.yaml"):
    path = tmp_path / name
    path.write_text(yaml.safe_dump(payload, sort_keys=False), encoding="utf-8")
    return path


def test_lint_prompts_detects_missing_variables(tmp_path):
    broken = _minimal_prompt()
    broken.pop("variables", None)
    path = _write_prompt(tmp_path, broken)
    failures = lint_prompts(root=tmp_path)
    assert len(failures) == 1
    assert failures[0].path == path
    messages = [error.message for error in failures[0].errors]
    assert any("variables" in message for message in messages)


def test_lint_prompts_flags_additional_properties(tmp_path):
    broken = _minimal_prompt(extra_field="not allowed")
    path = _write_prompt(tmp_path, broken, name="extra.prompt.yaml")
    failures = lint_prompts(root=tmp_path)
    assert len(failures) == 1
    assert failures[0].path == path
    assert any(error.validator == "additionalProperties" for error in failures[0].errors)
