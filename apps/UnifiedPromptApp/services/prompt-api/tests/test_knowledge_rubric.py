import app
import json


def test_knowledge_status_pass_when_learning_is_complete():
    entry = {
        "learning": {
            "classification": "verification_gate_failure",
            "what_broke": "Gate failed",
            "root_cause": "Schema mismatch",
            "evidence": ["failed_check:reviewgate"],
            "prevention_patches": [{"target": "prompt", "change": "enforce json only"}],
            "regression_checks": ["reviewgate schema check should fail on prose"],
        }
    }
    status, score = app._derive_knowledge_status_for_entry(entry)
    assert status == "pass"
    assert score is not None and score >= 7


def test_knowledge_status_needs_info_when_evidence_missing():
    entry = {
        "learning": {
            "classification": "verification_gate_failure",
            "what_broke": "Gate failed",
            "root_cause": "Unknown",
            "evidence": [],
            "prevention_patches": [{"target": "prompt", "change": "tighten schema"}],
            "regression_checks": ["check should fail on malformed json"],
        }
    }
    status, score = app._derive_knowledge_status_for_entry(entry)
    assert status == "needs_info"
    assert score is not None


def test_legacy_entry_is_migrated_without_data_loss():
    legacy = {
        "run_id": "legacy-1",
        "verification_status": "failed",
        "overseer_warnings": ["warn: something happened"],
        "learning": {
            "classification": "verification_gate_failure",
            "what_broke": "Gate failed",
            "root_cause": "Schema mismatch",
            "evidence": ["failed_check:reviewgate"],
            "prevention_patches": [{"target": "prompt", "change": "json only"}],
            "regression_checks": ["schema gate test"],
        },
    }
    migrated, changed = app._migrate_knowledge_entry(legacy)
    assert changed is True
    assert migrated["run_id"] == "legacy-1"
    assert migrated["verification_status"] == "failed"
    assert migrated["knowledge_status"] == "pass"
    assert isinstance(migrated.get("knowledge_score"), (int, float))


def test_missing_requirements_returns_structured_packet_not_failure():
    decision, _details, data = app._evaluate_commissioner_decision(
        {
            "value_score": 4,
            "recommendation": "Need requirements before proceeding",
            "missing_requirements": [
                {
                    "id": "interactions_measurable",
                    "question": "Define 4 interactions and measurable state changes.",
                    "why": "Needed for machine-verifiable tests.",
                    "defaults": ["toggle mode", "increment metric", "reset state", "switch panel"],
                }
            ],
        }
    )
    assert decision == "needs_requirements"
    packet = data.get("requirements_request")
    assert isinstance(packet, dict)
    blockers = packet.get("blockers")
    assert isinstance(blockers, list) and len(blockers) >= 1
    assert blockers[0].get("question")


def test_blocked_requirements_run_ingests_learning_as_pass(tmp_path, monkeypatch):
    kb_path = tmp_path / "knowledge_base.json"
    monkeypatch.setattr(app, "KNOWLEDGE_DB_PATH", kb_path)

    run_id = "sim-missing-req"
    run_dir = tmp_path / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = tmp_path / f"{run_id}.json"
    manifest = {
        "run_id": run_id,
        "goal": "Build an interactive visual app",
        "status": "blocked_requirements",
        "verification_status": "needs_requirements",
        "requirements_request": {
            "summary": "Need interaction + perf requirements",
            "blockers": [{"id": "b1", "question": "Define interactions", "why": "tests", "defaults": ["a", "b"]}],
        },
        "events": [{"ts": app.now_iso(), "type": "overseer:warn", "message": "requirements incomplete"}],
        "sandbox_report": {
            "passed_count": 0,
            "failed_count": 0,
            "deferred_count": 0,
            "verification_status": "needs_requirements",
            "checks": [],
        },
        "agents": ["Commissioner", "Critic"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    # Minimal commissioner output so ingestion has richer source data
    (run_dir / "Commissioner.json").write_text(
        json.dumps({"value_score": 4, "recommendation": "needs_requirements", "rationale": "Missing details"}, indent=2),
        encoding="utf-8",
    )

    app.ingest_run_knowledge(run_id, run_dir, manifest_path)
    entries = app._kb_load()
    assert entries
    entry = entries[0]
    assert entry.get("run_id") == run_id
    assert entry.get("knowledge_status") == "pass"
    assert entry.get("verification_status") == "needs_requirements"
    learning = entry.get("learning") or {}
    assert isinstance(learning.get("prevention_patches"), list) and len(learning["prevention_patches"]) >= 1
    assert isinstance(learning.get("regression_checks"), list) and len(learning["regression_checks"]) >= 1


def test_failed_run_can_still_have_learning_pass(tmp_path, monkeypatch):
    kb_path = tmp_path / "knowledge_base.json"
    monkeypatch.setattr(app, "KNOWLEDGE_DB_PATH", kb_path)

    run_id = "sim-build-failed"
    run_dir = tmp_path / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = tmp_path / f"{run_id}.json"
    manifest = {
        "run_id": run_id,
        "goal": "Build app from sketch",
        "status": "failed",
        "verification_status": "failed",
        "events": [{"ts": app.now_iso(), "type": "overseer:warn", "message": "lint failed"}],
        "sandbox_report": {
            "passed_count": 0,
            "failed_count": 1,
            "deferred_count": 0,
            "verification_status": "failed",
            "checks": [
                {"check": "lint passes", "evaluator": "reviewgate_status", "result": "failed", "details": "lint failed"}
            ],
        },
        "agents": ["Engineer", "ReviewGate"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    app.ingest_run_knowledge(run_id, run_dir, manifest_path)
    entry = app._kb_load()[0]
    assert entry.get("status") == "failed"
    assert entry.get("knowledge_status") == "pass"
    learning = entry.get("learning") or {}
    assert len(learning.get("prevention_patches") or []) >= 1
    assert len(learning.get("regression_checks") or []) >= 1
