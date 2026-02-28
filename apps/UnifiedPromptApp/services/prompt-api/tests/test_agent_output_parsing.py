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


def test_parse_agent_json_from_run_dir_supports_conceptual_contract_alias(tmp_path):
    (tmp_path / "conceptual_model_contract.json").write_text(
        json.dumps(
            {
                "interpretation": "Track motion",
                "representation": "canvas",
                "objects": [],
                "interactions": [],
                "dynamics": [],
                "data": [],
                "non_goals": [],
                "acceptance_tests": [{"testName": "t1", "steps": ["s1"], "assertions": ["a1"], "failureCondition": "f1"}],
            }
        ),
        encoding="utf-8",
    )

    parsed = app._parse_agent_json_from_run_dir(tmp_path, "ConceptualModelContract")
    assert parsed is not None
    assert parsed["representation"] == "canvas"


def test_validate_conceptual_model_contract_passes_for_grounded_payload():
    payload = {
        "interpretation": "Render moving points",
        "representation": "canvas",
        "objects": [
            {
                "id": "obj_points",
                "description": "point cloud",
                "mustBeVisible": True,
                "observableEvidence": {"type": "canvas", "probe": "pixel buffer has non-background pixels"},
            }
        ],
        "interactions": [
            {
                "id": "int_pause",
                "trigger": "button click",
                "userAction": "click pause",
                "expectedVisibleEffect": "motion stops",
                "verification": {
                    "actionProbe": "dispatch click on #pause-btn",
                    "expectedChangeProbe": "velocity magnitude changes to 0",
                },
            }
        ],
        "dynamics": [
            {
                "id": "dyn_motion",
                "name": "point motion",
                "whatChangesOverTime": "x position",
                "observableSignal": "state.points[0].x",
                "temporalEvidence": {
                    "durationMs": 250,
                    "probe": "sample x at t0 and t1",
                    "expectedDelta": "x(t1) != x(t0)",
                },
            }
        ],
        "data": [{"name": "seed", "source": "config", "usedFor": "deterministic init"}],
        "non_goals": ["3D rendering"],
        "acceptance_tests": [
            {
                "testName": "motion updates",
                "steps": ["start app", "sample state"],
                "assertions": ["state.points.length > 0", "state.points[0].x changes over 250ms"],
                "failureCondition": "x does not change",
            }
        ],
    }

    errors = app._validate_conceptual_model_contract(payload)
    assert errors == []


def test_validate_conceptual_model_contract_rejects_non_falsifiable_probe():
    payload = {
        "interpretation": "Render",
        "representation": "dom-graphics",
        "objects": [
            {
                "id": "obj1",
                "description": "chart",
                "mustBeVisible": True,
                "observableEvidence": {"type": "dom", "probe": "user can see the chart"},
            }
        ],
        "interactions": [],
        "dynamics": [],
        "data": [],
        "non_goals": [],
        "acceptance_tests": [{"testName": "t1", "steps": ["s1"], "assertions": ["a1"], "failureCondition": "f1"}],
    }

    errors = app._validate_conceptual_model_contract(payload)
    assert any("not machine-falsifiable" in e for e in errors)


def test_validate_engineer_contract_traceability_requires_full_coverage():
    contract = {
        "objects": [{"id": "obj_a"}],
        "interactions": [{"id": "int_a"}],
        "dynamics": [{"id": "dyn_a"}],
    }
    engineer = {
        "implementation": "\n".join(
            [
                "Overview",
                "### Contract Traceability",
                "obj_a -> src/a.ts : renderObjA : querySelector('#a') returns element",
                "int_a -> src/a.ts : onClickA : click event toggles state.a",
            ]
        )
    }

    errors = app._validate_engineer_contract_traceability(engineer, contract)
    assert any("dyn_a" in e for e in errors)


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
