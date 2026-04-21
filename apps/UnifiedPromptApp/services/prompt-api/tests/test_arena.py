"""Tests for the arena module (canonical multi-lane adjudication).

These tests exercise arena.py directly against fixture manifests so they
don't need a running orchestration. They cover:
- internal lane translation (empty / passing / failing / repaired)
- adjudication (single lane low-confidence; multi-lane winner selection)
- end-to-end arena record build
- artifact persistence (arena.json + arena.md)
"""
from __future__ import annotations

import json

import pytest

import arena


# ── Fixture builders ─────────────────────────────────────────────────────────

def _passing_app_production(passed: int = 4, failed: int = 0, skipped: int = 0):
    return {
        "status": "ready",
        "delivery_readiness": "ready_for_delivery",
        "passed_count": passed,
        "failed_count": failed,
        "skipped_count": skipped,
        "report_artifact": "app_production_report.json",
        "summary_artifact": "app_production_report.md",
        "checks": [
            {"name": "build", "status": "passed"},
            {"name": "dev_server", "status": "passed"},
            {"name": "unit_tests", "status": "passed"},
            {"name": "lint", "status": "passed"},
        ],
    }


def _failing_app_production():
    return {
        "status": "needs_repair",
        "delivery_readiness": "repair_needed",
        "passed_count": 1,
        "failed_count": 2,
        "skipped_count": 1,
        "checks": [
            {"name": "build", "status": "passed"},
            {"name": "dev_server", "status": "failed"},
            {"name": "unit_tests", "status": "failed"},
            {"name": "lint", "status": "skipped"},
        ],
    }


def _repaired_plan(attempts: int = 1, status: str = "verified"):
    return {
        "status": "completed",
        "execution_status": status,
        "report_artifact": "app_production_repairs.json",
        "summary_artifact": "app_production_repairs.md",
        "items": [{"id": "fix-1", "gate": "dev_server", "agent": "qa", "priority": "high", "summary": "x"}],
        "attempts": [
            {"attempt": i + 1, "gate": "dev_server", "status": "verified" if i == attempts - 1 else "retry"}
            for i in range(attempts)
        ],
    }


# ── build_internal_lane_record ───────────────────────────────────────────────

def test_internal_lane_empty_manifest_is_safe():
    lane = arena.build_internal_lane_record({})
    assert lane["lane_id"] == arena.INTERNAL_LANE_ID
    assert lane["provider"] == arena.INTERNAL_LANE_PROVIDER
    assert lane["status"] == "insufficient_evidence"
    assert lane["evidence"]["gates"] == {"passed": 0, "failed": 0, "skipped": 0, "verdicts": []}
    assert lane["evidence"]["repair"]["status"] == "not_needed"
    # Score is bounded to [0, 1].
    assert 0.0 <= lane["score"]["total"] <= 1.0


def test_internal_lane_passing_evidence_scores_high():
    manifest = {
        "verification_status": "passed",
        "app_production": _passing_app_production(),
        "generated_app_files": ["src/foo.ts", "src/bar.ts"],
        "events": [{"type": "x"}, {"type": "y"}],
    }
    lane = arena.build_internal_lane_record(manifest)
    assert lane["status"] in {"verified", "ready_for_delivery"}
    assert lane["evidence"]["gates"]["passed"] == 4
    assert lane["evidence"]["gates"]["failed"] == 0
    assert lane["evidence"]["delivery_readiness"] == "ready_for_delivery"
    # Should be a strong score: high pass rate + ready_for_delivery + verification bonus.
    assert lane["score"]["total"] >= 0.8
    assert lane["score"]["components"]["gate_pass_rate"] == 1.0
    assert lane["score"]["components"]["verification_bonus"] == 0.05


def test_internal_lane_failing_evidence_scores_lower_and_marks_repair_needed():
    manifest = {
        "verification_status": "failed",
        "app_production": _failing_app_production(),
        "generated_app_files": [],
    }
    lane = arena.build_internal_lane_record(manifest)
    assert lane["status"] == "repair_needed"
    assert lane["score"]["total"] < 0.5
    assert lane["score"]["components"]["verification_bonus"] == -0.10


def test_internal_lane_with_repair_attempts_records_repair_block():
    manifest = {
        "verification_status": "passed",
        "app_production": _passing_app_production(),
        "app_production_repairs": _repaired_plan(attempts=2, status="verified"),
    }
    lane = arena.build_internal_lane_record(manifest)
    assert lane["evidence"]["repair"]["targets"] == 1
    assert lane["evidence"]["repair"]["attempts"] == 2
    assert lane["evidence"]["repair"]["status"] == "verified"
    assert lane["artifacts"]["repair_report"] == "app_production_repairs.json"


def test_internal_lane_files_changed_capped_at_50():
    files = [f"src/file_{i}.ts" for i in range(120)]
    lane = arena.build_internal_lane_record({"generated_app_files": files})
    assert lane["evidence"]["files_changed_count"] == 120
    assert len(lane["evidence"]["files_changed"]) == 50


# ── adjudicate_lanes ─────────────────────────────────────────────────────────

def test_adjudicate_requires_at_least_one_lane():
    with pytest.raises(ValueError):
        arena.adjudicate_lanes([])


def test_adjudicate_single_lane_is_low_confidence():
    lane = arena.build_internal_lane_record({
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    })
    verdict = arena.adjudicate_lanes([lane])
    assert verdict["winner_lane_id"] == arena.INTERNAL_LANE_ID
    assert verdict["confidence"] == "low"
    assert verdict["loser_reasons"] == []
    assert any("one candidate" in r.lower() or "only one" in r.lower() for r in verdict["reasons"])
    assert "Add a second candidate lane" in " ".join(verdict["follow_up"])


def test_adjudicate_two_lanes_clear_winner_high_confidence():
    winner_lane = arena.build_internal_lane_record({
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    })
    loser_manifest_lane = arena.build_internal_lane_record({
        "verification_status": "failed",
        "app_production": _failing_app_production(),
    })
    loser_lane = dict(loser_manifest_lane)
    loser_lane["lane_id"] = "frontier-A"
    loser_lane["provider"] = "frontier"
    loser_lane["label"] = "Frontier A"

    verdict = arena.adjudicate_lanes([winner_lane, loser_lane], intent="ship a working dashboard")
    assert verdict["winner_lane_id"] == arena.INTERNAL_LANE_ID
    assert verdict["confidence"] == "high"
    assert verdict["winner_score"] > 0.8
    assert verdict["criteria"]["intent"] == "ship a working dashboard"
    assert verdict["criteria"]["must_have"] == list(arena.DEFAULT_MUST_HAVE_GATES)
    assert len(verdict["loser_reasons"]) == 1
    assert verdict["loser_reasons"][0]["lane_id"] == "frontier-A"


def test_adjudicate_ties_break_deterministically_by_lane_order():
    # Two identical lanes — the first one in the list wins.
    base_manifest = {
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    }
    lane_a = arena.build_internal_lane_record(base_manifest)
    lane_a["lane_id"] = "a"
    lane_b = arena.build_internal_lane_record(base_manifest)
    lane_b["lane_id"] = "b"
    verdict_ab = arena.adjudicate_lanes([lane_a, lane_b])
    verdict_ba = arena.adjudicate_lanes([lane_b, lane_a])
    assert verdict_ab["winner_lane_id"] == "a"
    assert verdict_ba["winner_lane_id"] == "b"


# ── build_arena_record / artifact persistence ────────────────────────────────

def test_build_arena_record_end_to_end():
    manifest = {
        "run_id": "run_test_123",
        "goal": "build a web app",
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    }
    record = arena.build_arena_record(manifest)
    assert record["schema_version"] == arena.ARENA_SCHEMA_VERSION
    assert record["run_id"] == "run_test_123"
    assert record["intent"] == "build a web app"
    assert len(record["lanes"]) == 1
    assert record["verdict"]["winner_lane_id"] == arena.INTERNAL_LANE_ID
    assert "generated_at" in record


def test_build_arena_record_accepts_extra_lanes():
    manifest = {"verification_status": "passed", "app_production": _passing_app_production()}
    extra = {
        "lane_id": "browser-evidence",
        "provider": "browser",
        "label": "Browser Evidence",
        "status": "verified",
        "evidence": {
            "files_changed_count": 0,
            "files_changed": [],
            "commands_run_count": 0,
            "checkpoints_triggered": 0,
            "events_recorded": 0,
            "gates": {"passed": 0, "failed": 0, "skipped": 0, "verdicts": []},
            "repair": {"targets": 0, "attempts": 0, "status": "not_needed"},
            "verification_status": "passed",
            "delivery_readiness": "verified",
        },
        "score": {"total": 0.50, "components": {"gate_pass_rate": 0.0}},
    }
    record = arena.build_arena_record(manifest, extra_lanes=[extra])
    assert len(record["lanes"]) == 2
    # Internal lane has full evidence and should still win against the stub.
    assert record["verdict"]["winner_lane_id"] == arena.INTERNAL_LANE_ID
    assert any(lr["lane_id"] == "browser-evidence" for lr in record["verdict"]["loser_reasons"])


def test_write_arena_artifacts_writes_json_and_md(tmp_path):
    manifest = {
        "run_id": "run_artifacts_1",
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    }
    record = arena.build_arena_record(manifest)
    json_path, md_path = arena.write_arena_artifacts(tmp_path, record)
    assert json_path.name == "arena.json"
    assert md_path.name == "arena.md"
    assert json_path.exists()
    assert md_path.exists()
    parsed = json.loads(json_path.read_text(encoding="utf-8"))
    assert parsed["run_id"] == "run_artifacts_1"
    md_text = md_path.read_text(encoding="utf-8")
    assert "# Arena Adjudication" in md_text
    assert arena.INTERNAL_LANE_ID in md_text


def test_attach_arena_returns_dict_with_artifact_names(tmp_path):
    manifest = {
        "run_id": "run_attach_1",
        "verification_status": "passed",
        "app_production": _passing_app_production(),
    }
    record = arena.attach_arena_to_manifest(manifest, tmp_path)
    assert record["report_artifact"] == "arena.json"
    assert record["summary_artifact"] == "arena.md"
    assert (tmp_path / "arena.json").exists()
    assert (tmp_path / "arena.md").exists()
