import json

import app


def test_coerce_agent_json_payload_parses_envelope_content():
    envelope = {
        "id": "resp_123",
        "choices": [
            {
                "message": {
                    "content": "```json\n{\"status\":\"error\",\"errors\":[\"x\"],\"warnings\":[]}\n```"
                }
            }
        ],
    }

    parsed = app._coerce_agent_json_payload(json.dumps(envelope))
    assert parsed is not None
    assert parsed["status"] == "error"
    assert parsed["errors"] == ["x"]


def test_parse_agent_json_from_run_dir_prefers_raw_response(tmp_path):
    # Transcript has misleading/invalid payload.
    (tmp_path / "ReviewGate.txt").write_text(
        "OpenAI call succeeded\n{\"errors\":[\"missing status\"]}",
        encoding="utf-8",
    )
    # Raw response has canonical content and should be preferred.
    (tmp_path / "ReviewGate_raw_response.json").write_text(
        json.dumps(
            {
                "choices": [
                    {"message": {"content": "{\"status\":\"passed\",\"errors\":[],\"warnings\":[]}"}}
                ]
            }
        ),
        encoding="utf-8",
    )

    parsed = app._parse_agent_json_from_run_dir(tmp_path, "ReviewGate")
    assert parsed is not None
    assert parsed["status"] == "passed"


def test_parse_agent_json_from_run_dir_supports_reviewgate_alias(tmp_path):
    (tmp_path / "review_gate.json").write_text(
        json.dumps({"status": "failed", "errors": ["e1"], "warnings": []}),
        encoding="utf-8",
    )

    parsed = app._parse_agent_json_from_run_dir(tmp_path, "ReviewGate")
    assert parsed is not None
    assert parsed["status"] == "failed"
    assert parsed["errors"] == ["e1"]


def test_derive_final_status_rules():
    assert (
        app._derive_final_status(
            "error:CalledProcessError(1, ...)",
            {"A": "complete", "B": "complete"},
            True,
            True,
        )
        == "completed_with_errors"
    )
    assert (
        app._derive_final_status(
            "running",
            {"A": "complete", "B": "error"},
            False,
            False,
        )
        == "failed"
    )
    assert (
        app._derive_final_status(
            "running",
            {"A": "complete", "B": "complete"},
            True,
            False,
        )
        == "completed"
    )
    assert (
        app._derive_final_status(
            "",
            {},
            False,
            False,
        )
        == "running"
    )
