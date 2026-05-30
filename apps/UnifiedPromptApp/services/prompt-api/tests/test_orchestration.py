"""
Integration tests for orchestration endpoints, particularly testing
filesystem-safe path creation with various goal/title inputs.
"""
import json
import pathlib
import shutil
from fastapi.testclient import TestClient
import pytest

import app


client = TestClient(app.app)


@pytest.fixture
def cleanup_test_runs():
    """Cleanup any test run directories after tests."""
    yield
    # Clean up any test run directories created during tests
    if app.BRIDGE_RUN_DIR.exists():
        for item in app.BRIDGE_RUN_DIR.glob("test_*"):
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            elif item.is_file():
                item.unlink(missing_ok=True)


class TestOrchestrateRun:
    """Test suite for /orchestrate/run endpoint."""

    def test_orchestrate_run_with_newline_in_goal(self, cleanup_test_runs):
        """
        Test that orchestration runs can be created even when the goal contains
        newlines, which previously caused WinError 123 on Windows.

        This is a regression test for the bug where:
        OSError: [WinError 123] The filename, directory name, or volume label
        syntax is incorrect: 'G:\\...\\runs\\Will_orchestration_work_under_pressure\\n...'
        """
        # This is the exact scenario that caused the original bug
        payload = {
            "goal": "Will orchestration work under pressure\n",
            "model": "gpt-4o-mini",
            "run_mode": "default"
        }

        response = client.post("/orchestrate/run", json=payload)

        # Should succeed (status 200)
        assert response.status_code == 200

        # Check the response contains the expected fields
        result = response.json()
        assert "run_id" in result
        assert "manifest" in result
        assert "status" in result["manifest"]

        # Verify the run_id doesn't contain a newline
        run_id = result["run_id"]
        assert "\n" not in run_id
        assert "\r" not in run_id

        # Verify the directory was actually created without error
        # The run_id should be safe for filesystem use
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists(), f"Run directory should exist: {expected_dir}"

    def test_orchestrate_run_with_multiline_goal(self, cleanup_test_runs):
        """Test with multiple newlines in the goal."""
        payload = {
            "goal": "Test\nmulti\nline\ngoal",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]

        # Should have replaced newlines with underscores
        assert "\n" not in run_id
        assert "Test_multi_line_goal" in run_id

        # Directory should exist
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()

    def test_orchestrate_run_with_invalid_windows_chars(self, cleanup_test_runs):
        """Test with various invalid Windows path characters in goal."""
        # Test with characters that are invalid in Windows paths
        payload = {
            "goal": "test<goal>with:invalid*chars?",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]

        # Should have sanitized all invalid characters
        for invalid_char in '<>:"/\\|?*':
            assert invalid_char not in run_id

        # Directory should exist without error
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()

    def test_orchestrate_run_with_windows_newlines(self, cleanup_test_runs):
        """Test with Windows-style CRLF newlines."""
        payload = {
            "goal": "Test\r\nWindows\r\nNewlines",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]

        # Should have cleaned CRLF
        assert "\r\n" not in run_id
        assert "\n" not in run_id
        assert "\r" not in run_id

        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()

    def test_orchestrate_run_normal_goal(self, cleanup_test_runs):
        """Test that normal goals still work correctly."""
        payload = {
            "goal": "Normal test goal",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]

        # Should have a clean run_id with underscores for spaces
        assert "Normal_test_goal" in run_id

        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()

    def test_orchestrate_run_with_prompt_id(self, cleanup_test_runs):
        """Test using prompt_id instead of goal."""
        payload = {
            "prompt_id": "test.prompt.id",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]

        # prompt_id should be used and sanitized
        assert "test.prompt.id" in run_id

        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()

    def test_orchestrate_run_dir_matches_manifest(self, cleanup_test_runs):
        """
        Test that run_dir in manifest matches the actual output directory
        where artifacts should be written.

        This is a regression test for the bug where -OutputDir was passed
        as BRIDGE_RUN_DIR instead of the per-run directory.
        """
        payload = {
            "goal": "Test run_dir consistency",
            "model": "gpt-4o-mini"
        }

        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]
        manifest = result["manifest"]

        # Verify run_dir is set in manifest
        assert "run_dir" in manifest
        run_dir = pathlib.Path(manifest["run_dir"])

        # Verify run_dir points to the per-run subdirectory, not the root runs folder
        assert run_dir.name == run_id
        assert run_dir.parent == app.BRIDGE_RUN_DIR

        # Verify the directory exists
        assert run_dir.exists()

        # Simulate orchestration completion by creating orchestration-summary.json
        summary_data = {
            "Goal": "Test run_dir consistency",
            "Status": "completed",
            "Model": "gpt-4o-mini",
            "DurationSeconds": 1.5,
            "MilestonesCount": 2,
            "CompletedMilestones": 2
        }
        summary_path = run_dir / "orchestration-summary.json"
        summary_path.write_text(json.dumps(summary_data, indent=2))

        # Test that artifacts would be written to run_dir, not BRIDGE_RUN_DIR
        # This verifies the -OutputDir fix
        assert summary_path.exists()
        assert summary_path.parent == run_dir
        assert summary_path.parent != app.BRIDGE_RUN_DIR

        # Clean up the created file
        summary_path.unlink(missing_ok=True)

    def test_orchestrate_run_preserves_long_concierge_prompt(self, cleanup_test_runs):
        """
        Regression test for Concierge prompt truncation.

        A full Concierge product spec (multi-section markdown with feature lists,
        acceptance criteria, etc.) must round-trip end-to-end without truncation.
        Previously the goal was passed via `-Goal` on the PowerShell command line
        and PowerShell argument parsing truncated long values, so contract agents
        only saw the first ~150 chars and blocked on missing required sections.

        The marker `UNIQUE_END_MARKER_PIXEL_BURROW_ACCEPTANCE_CRITERIA` is placed
        deliberately near the end of the prompt — if it survives, late-section
        acceptance criteria are no longer being lost.
        """
        marker = "UNIQUE_END_MARKER_PIXEL_BURROW_ACCEPTANCE_CRITERIA"
        # Build a realistic ~4 KB Concierge spec with the marker near the end.
        long_goal = (
            "# Concierge Request: Build a Simple Web Arcade Game Inspired by Classic Centipede\n\n"
            "## Goal\n\nCreate a simple, polished, browser-based arcade game.\n\n"
            "## Features\n"
            + "\n".join(f"- Feature {i}: " + ("x" * 80) for i in range(20))
            + "\n\n## Inputs\n- keyboard\n- mouse\n\n## Outputs\n- canvas\n- audio\n\n"
            "## Constraints\n- runs in modern browsers\n- no backend\n\n"
            "## Deliverables\n- index.html\n- game.js\n\n"
            "## Acceptance Criteria\n"
            "- The game starts on page load.\n"
            "- The player can move with arrow keys.\n"
            "- Score is displayed.\n"
            f"- {marker}\n"
        )
        assert len(long_goal) > 1000, "test prompt should be long enough to have a late-section marker"
        assert marker in long_goal[-500:], "marker must be in the late section of the prompt"

        payload = {"goal": long_goal, "model": "gpt-4o-mini"}
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200

        result = response.json()
        run_id = result["run_id"]
        manifest = result["manifest"]

        # Manifest must store the full prompt, never a truncated preview.
        assert manifest.get("goal") == long_goal, (
            "Manifest stored a truncated goal — Concierge spec must be preserved verbatim. "
            f"Stored length={len(manifest.get('goal') or '')}, expected={len(long_goal)}."
        )
        assert marker in manifest["goal"]

        # The persisted manifest file must also preserve the full prompt.
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        assert manifest_path.exists()
        on_disk = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert on_disk.get("goal") == long_goal
        assert marker in on_disk["goal"]

    def test_cancel_single_queued_orchestration_run(self, cleanup_test_runs):
        """Queued runs should cancel immediately via single-run cancel endpoint."""
        payload = {
            "goal": "test cancel single queued",
            "model": "gpt-4o-mini",
        }
        create_res = client.post("/orchestrate/run", json=payload)
        assert create_res.status_code == 200
        run_id = create_res.json()["run_id"]

        cancel_res = client.post(f"/orchestrate/run/{run_id}/cancel")
        assert cancel_res.status_code == 200
        cancelled = cancel_res.json()
        assert cancelled.get("cancelled") is True
        assert cancelled.get("status") == "cancelled"

        run_res = client.get(f"/orchestrate/run/{run_id}")
        assert run_res.status_code == 200
        assert run_res.json().get("status") == "cancelled"

    def test_bulk_cancel_all_queued_runs(self, cleanup_test_runs):
        """Bulk cancel should cancel all queued runs when requested."""
        first = client.post("/orchestrate/run", json={"goal": "test bulk cancel a", "model": "gpt-4o-mini"})
        second = client.post("/orchestrate/run", json={"goal": "test bulk cancel b", "model": "gpt-4o-mini"})
        assert first.status_code == 200
        assert second.status_code == 200

        bulk_res = client.post(
            "/orchestrate/runs/cancel",
            json={"cancel_all_queued": True},
        )
        assert bulk_res.status_code == 200
        payload = bulk_res.json()
        assert payload["requested"] >= 2
        assert payload["cancelled"] >= 2

    def test_orchestration_queue_limits_endpoint(self):
        """Queue limits endpoint should expose configured safeguards."""
        res = client.get("/orchestrate/runs/limits")
        assert res.status_code == 200
        payload = res.json()
        assert "max_concurrent" in payload
        assert "max_queued" in payload
        assert "running" in payload
        assert "queued" in payload

    def test_api_alias_cancel_supports_force_query(self, cleanup_test_runs):
        payload = {"goal": "test api alias cancel", "model": "gpt-4o-mini"}
        create_res = client.post("/orchestrate/run", json=payload)
        assert create_res.status_code == 200
        run_id = create_res.json()["run_id"]

        cancel_res = client.post(f"/api/runs/{run_id}/cancel?force=1")
        assert cancel_res.status_code == 200
        body = cancel_res.json()
        assert body.get("status") == "cancelled"
        assert body.get("cancelled") is True

    def test_get_run_derives_stuck_when_lease_expired(self, cleanup_test_runs):
        run_id = f"test_stale_{app.now_iso().replace(':', '-')}"
        path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        now = app.now_iso()
        stale = "2000-01-01T00:00:00+00:00"
        manifest = {
            "run_id": run_id,
            "status": "running",
            "requested_at": now,
            "events": [{"ts": now, "type": "status", "message": "running"}],
            "lease": {
                "worker_id": "worker-x",
                "acquired_at": now,
                "heartbeat_at": stale,
                "expires_at": stale,
                "ttl_seconds": 45,
            },
        }
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        payload = res.json()
        assert payload.get("status") == "stuck"
        assert payload.get("heartbeat_stale") is True

    def test_release_stale_leases_endpoint_marks_stuck(self, cleanup_test_runs):
        run_id = f"test_release_stale_{app.now_iso().replace(':', '-')}"
        path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        now = app.now_iso()
        stale = "2000-01-01T00:00:00+00:00"
        manifest = {
            "run_id": run_id,
            "status": "running",
            "requested_at": now,
            "events": [],
            "lease": {
                "worker_id": "worker-y",
                "acquired_at": now,
                "heartbeat_at": stale,
                "expires_at": stale,
                "ttl_seconds": 45,
            },
        }
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        res = client.post("/api/runs/release-stale-leases")
        assert res.status_code == 200
        payload = res.json()
        assert payload["released"] >= 1
        assert run_id in payload["run_ids"]

        run_res = client.get(f"/orchestrate/run/{run_id}")
        assert run_res.status_code == 200
        run_payload = run_res.json()
        assert run_payload.get("status") == "failed"
        assert "stalled" in str(run_payload.get("error_detail") or "").lower() or "lease" in str(run_payload.get("error_detail") or "").lower()

    def test_requeue_endpoint_sets_queued(self, cleanup_test_runs):
        run_id = f"test_requeue_{app.now_iso().replace(':', '-')}"
        path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        now = app.now_iso()
        manifest = {
            "run_id": run_id,
            "status": "cancelled",
            "requested_at": now,
            "events": [],
            "lease": None,
        }
        path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        res = client.post(f"/api/runs/{run_id}/requeue")
        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "queued"
        assert body.get("requeued") is True

        run_res = client.get(f"/orchestrate/run/{run_id}")
        assert run_res.status_code == 200
        assert run_res.json().get("status") == "queued"

    def test_checkpoint_response_resumes_blocked_requirements_run(self, cleanup_test_runs):
        run_id = f"test_checkpoint_resume_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        requirements_request = {
            "summary": "ConceptualModelContract requires more detail.",
            "blockers": [
                {
                    "id": "req_1",
                    "question": "Which frontend stack should be used?",
                    "why": "Needed to produce a valid implementation contract.",
                    "defaults": ["React + Vite"],
                }
            ],
            "proposed_acceptance_tests": ["App loads locally with npm run dev."],
        }
        checkpoint_pending = {
            "checkpoint_id": "requirements-test-1",
            "run_id": run_id,
            "kind": "requirements",
            "agent": "ConceptualModelContract",
            "summary": "ConceptualModelContract requires additional requirements before implementation can continue.",
            "question": "Which frontend stack should be used?",
            "options": ["Provide explicit requirements answers", "Revise the goal and resume"],
            "default_option": "Provide explicit requirements answers",
            "requested_at": now,
            "requirements_request": requirements_request,
        }
        (out_dir / "checkpoint_pending.json").write_text(json.dumps(checkpoint_pending, indent=2), encoding="utf-8")

        manifest = {
            "run_id": run_id,
            "status": "blocked_requirements",
            "requested_at": now,
            "run_dir": str(out_dir),
            "events": [],
            "requirements_request": requirements_request,
            "verification_status": "needs_requirements",
            "checkpoints": [
                {
                    "id": "requirements-test-1",
                    "agent": "ConceptualModelContract",
                    "question": "Which frontend stack should be used?",
                    "options": ["Provide explicit requirements answers", "Revise the goal and resume"],
                    "default_option": "Provide explicit requirements answers",
                    "requested_at": now,
                    "response": None,
                    "responded_at": None,
                    "resolved_by": None,
                }
            ],
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        res = client.post(
            f"/orchestrate/run/{run_id}/checkpoint",
            json={
                "agent": "ConceptualModelContract",
                "answers": [
                    {
                        "blocker_id": "req_1",
                        "question": "Which frontend stack should be used?",
                        "answer": "Use React with Vite and plain CSS.",
                    }
                ],
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "queued"
        assert "same run id" in str(body.get("message") or "")

        updated = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert updated.get("status") == "queued"
        assert updated.get("verification_status") == "pending"
        assert updated.get("sandbox_report") is None
        assert updated.get("requirements_request") is None
        assert "resume_context" in updated
        assert "Use React with Vite and plain CSS." in updated["resume_context"]
        assert updated["checkpoints"][0]["resolved_by"] == "human"
        assert updated["checkpoints"][0]["status"] == "answered"
        assert updated["checkpoints"][0]["response"].startswith("Requirements answers:")

        assert (out_dir / "requirements_answers.json").exists()
        assert not (out_dir / "checkpoint_pending.json").exists()

    def test_get_run_exposes_corrective_actions_and_agent_improvements(self, cleanup_test_runs):
        run_id = f"test_run_history_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest = {
            "run_id": run_id,
            "status": "completed",
            "requested_at": now,
            "run_dir": str(out_dir),
            "events": [],
            "verification_status": "passed",
            "checkpoints": [
                {
                    "id": "requirements-test-2",
                    "agent": "ConceptualModelContract",
                    "question": "Which metrics should the comparison emphasize?",
                    "requested_at": now,
                    "response": "Requirements answers: Focus on workflow depth, reuse, and validation rigor.",
                    "responded_at": now,
                    "resolved_by": "human",
                    "status": "answered",
                    "answers": [
                        {
                            "blocker_id": "req_metrics",
                            "question": "Which metrics should the comparison emphasize?",
                            "answer": "Focus on workflow depth, reuse, and validation rigor.",
                        }
                    ],
                }
            ],
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (out_dir / "agent_improvements.json").write_text(
            json.dumps(
                [
                    {
                        "agent": "ConceptualModelContract",
                        "suggestion": "Ask for comparison metrics and target interactions before drafting the contract.",
                        "timestamp": now,
                    }
                ],
                indent=2,
            ),
            encoding="utf-8",
        )

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        body = res.json()
        assert len(body.get("corrective_actions") or []) == 1
        assert (body.get("corrective_actions") or [])[0]["agent"] == "ConceptualModelContract"
        assert len(body.get("agent_improvements") or []) == 1
        assert (body.get("agent_improvements") or [])[0]["suggestion"].startswith("Ask for comparison metrics")

    def test_get_run_exposes_app_production_summary(self, cleanup_test_runs):
        run_id = f"test_app_production_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest = {
            "run_id": run_id,
            "status": "completed",
            "requested_at": now,
            "run_dir": str(out_dir),
            "events": [],
            "verification_status": "passed",
            "generated_app_files": ["generated_app/package.json", "generated_app/src/main.jsx"],
            "app_production": {
                "status": "repair_needed",
                "delivery_readiness": "repair_needed",
                "app_dir": "generated_app",
                "report_artifact": "generated_app_verification.json",
                "summary_artifact": "generated_app_verification.md",
                "passed_count": 1,
                "failed_count": 1,
                "skipped_count": 3,
                "checks": [
                    {
                        "name": "build",
                        "status": "failed",
                        "summary": "Build failed because dependencies were not installed.",
                        "command": "npm run build",
                        "exit_code": 1,
                        "log_artifact": "logs/generated_app/build.log",
                    }
                ],
            },
            "app_production_repairs": {
                "status": "actionable",
                "report_artifact": "generated_app_repairs.json",
                "summary_artifact": "generated_app_repairs.md",
                "items": [
                    {
                        "id": "app-production-build",
                        "gate": "build",
                        "agent": "Engineer",
                        "priority": "high",
                        "summary": "Repair compile-time failures before rerunning the build gate.",
                        "failure_summary": "Build failed because dependencies were not installed.",
                        "command": "npm run build",
                        "exit_code": 1,
                        "log_artifact": "logs/generated_app/build.log",
                        "blocked_checks": [],
                        "recommended_actions": [
                            "Inspect the failing build log.",
                        ],
                    }
                ],
            },
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        body = res.json()
        assert (body.get("app_production") or {}).get("status") == "repair_needed"
        checks = (body.get("app_production") or {}).get("checks") or []
        assert len(checks) == 1
        assert checks[0]["name"] == "build"
        repairs = (body.get("app_production_repairs") or {}).get("items") or []
        assert len(repairs) == 1
        assert repairs[0]["gate"] == "build"
        assert repairs[0]["agent"] == "Engineer"

    def test_get_run_hydrates_from_disk_without_overriding_terminal_manifest_status(self, cleanup_test_runs):
        run_id = f"test_hydrate_disk_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest_path.write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "status": "completed",
                    "requested_at": now,
                    "run_dir": str(out_dir),
                    "events": [],
                    "lease": None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (out_dir / "run_state.json").write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "status": "running",
                    "goal": "Hydrate finished run details from disk",
                    "job_type": "build_new_app",
                    "app_type": "web",
                    "current_stage": "completed",
                    "warnings": ["state file was not finalized previously"],
                    "started_at": now,
                    "ended_at": now,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (out_dir / "events.ndjson").write_text(
            "\n".join(
                [
                    json.dumps({"ts": now, "type": "status", "message": "running"}),
                    json.dumps({"ts": now, "type": "status", "message": "completed"}),
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "completed"
        assert body.get("goal") == "Hydrate finished run details from disk"
        assert body.get("job_type") == "build_new_app"
        assert body.get("app_type") == "web"
        assert body.get("current_stage") == "completed"
        assert body.get("completed_at") == now
        assert len(body.get("events") or []) == 2
        assert (body.get("warnings") or [])[0] == "state file was not finalized previously"

    def test_get_run_hydrates_from_canonical_events_jsonl(self, cleanup_test_runs):
        run_id = f"test_hydrate_canonical_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest_path.write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "status": "completed",
                    "requested_at": now,
                    "run_dir": str(out_dir),
                    "events": [],
                    "lease": None,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (out_dir / "events.jsonl").write_text(
            "\n".join(
                [
                    json.dumps({
                        "event_id": "e1",
                        "run_id": run_id,
                        "timestamp": now,
                        "event_type": "run_started",
                        "severity": "info",
                        "message": "running",
                    }),
                    json.dumps({
                        "event_id": "e2",
                        "run_id": run_id,
                        "timestamp": now,
                        "event_type": "run_completed",
                        "severity": "info",
                        "message": "completed",
                    }),
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "completed"
        assert len(body.get("events") or []) == 2
        assert (body.get("events") or [])[0].get("event_type") == "run_started"

    def test_shared_runtime_event_helper_updates_manifest_and_canonical_log(self, cleanup_test_runs):
        run_id = f"test_runtime_helper_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)

        manifest = {"run_id": run_id, "events": []}
        runtime_events = [
            {"ts": app.now_iso(), "type": "info", "message": "run created"},
            {"ts": app.now_iso(), "type": "status", "message": "queued"},
        ]

        app._append_runtime_events_to_manifest(manifest, out_dir, run_id, runtime_events)

        assert len(manifest.get("events") or []) == 2
        assert manifest["events"][0]["message"] == "run created"
        assert manifest["events"][1]["message"] == "queued"

        canonical_path = out_dir / "events.jsonl"
        assert canonical_path.exists()
        rows = [json.loads(line) for line in canonical_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        assert len(rows) == 2
        assert rows[0].get("run_id") == run_id
        assert rows[0].get("event_type") == "run_created"
        assert rows[1].get("event_type") == "run_queued"

    def test_run_evidence_viewer_minimum_success_profile_requires_smoke_proof(self):
        profile = app._evaluate_minimum_success_profile(
            goal_text=(
                "Build a small polished Run Evidence Viewer web app that reads a local run folder "
                "and displays events, artifacts, final summary, status, and verification evidence."
            ),
            verification_status="passed",
            generated_app_files=["generated_app/src/main.tsx"],
            app_production={
                "checks": [
                    {"name": "smoke_tests", "status": "failed"},
                    {"name": "dev_server", "status": "failed"},
                ]
            },
        )
        assert profile["required"] is True
        assert profile["passed"] is False
        assert "minimal_smoke_proof" in str(profile.get("failure_reason") or "")

        passing_profile = app._evaluate_minimum_success_profile(
            goal_text=(
                "Build a small polished Run Evidence Viewer web app that reads a local run folder "
                "and displays events, artifacts, final summary, status, and verification evidence."
            ),
            verification_status="passed",
            generated_app_files=["generated_app/src/main.tsx"],
            app_production={
                "checks": [
                    {"name": "smoke_tests", "status": "passed"},
                ]
            },
        )
        assert passing_profile["required"] is True
        assert passing_profile["passed"] is True

    def test_terminal_summary_blocked_requirements_has_clarification_blocker_and_failure_artifact(self, cleanup_test_runs):
        run_id = f"test_blocked_requirements_summary_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "run_id": run_id,
            "status": "blocked_requirements",
            "verification_status": "needs_requirements",
            "goal": "Build a Run Evidence Viewer web app.",
            "requirements_request": {
                "summary": "Need stack and runtime clarifications.",
                "blockers": [
                    {
                        "id": "req_1",
                        "question": "Which frontend stack should be used?",
                        "why": "Needed to produce a machine-verifiable implementation contract.",
                    }
                ],
            },
        }

        artifact_path = app._write_failure_visibility_artifact(
            out_dir,
            "Requirements clarification needed",
            "Need stack and runtime clarifications.",
        )
        assert artifact_path.exists()

        summary = app._build_terminal_summary_from_manifest(
            run_id,
            manifest,
            out_dir,
        )
        assert summary.get("outcome") == "completed_with_warnings"
        blockers = summary.get("blockers") or []
        assert len(blockers) >= 1
        assert blockers[0].get("severity") == "clarification_needed"
        assert "clarifications" in str(blockers[0].get("summary") or "").lower()

    def test_terminal_summary_build_lane_failure_downgrades_and_blocks(self, cleanup_test_runs):
        """A run that 'completed' but whose generated-app build lane failed
        (delivery_readiness repair_needed + a failed install gate) must not be
        reported as a clean 'completed', and must surface the failure as a
        blocker instead of an empty blockers array."""
        run_id = f"test_build_lane_failure_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "run_id": run_id,
            "status": "completed",
            "verification_status": "partial",
            "goal": "Build a 3D visualization web app.",
            "app_production": {
                "status": "repair_needed",
                "delivery_readiness": "repair_needed",
                "checks": [
                    {"name": "install", "status": "failed", "summary": "npm ci EUSAGE: lockfile out of sync"},
                    {"name": "lint", "status": "skipped", "summary": "Lint skipped because install failed."},
                ],
            },
        }

        summary = app._build_terminal_summary_from_manifest(run_id, manifest, out_dir)

        assert summary.get("outcome") == "completed_with_warnings"
        blockers = summary.get("blockers") or []
        assert any(b.get("severity") == "verification_failed" for b in blockers)
        assert any("install" in str(b.get("summary") or "").lower() for b in blockers)

    def test_write_terminal_summary_reconciles_run_state_status(self, cleanup_test_runs):
        """run_state.json must be reconciled to the same terminal outcome the
        final summary reports, eliminating the dual-status split."""
        run_id = f"test_run_state_reconcile_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        state_path = out_dir / "run_state.json"
        state_path.write_text(
            json.dumps({"run_id": run_id, "status": "completed", "app_type": "web"}),
            encoding="utf-8",
        )

        summary = {"run_id": run_id, "outcome": "completed_with_warnings"}
        app._write_terminal_summary(out_dir, summary)

        reconciled = json.loads(state_path.read_text(encoding="utf-8"))
        assert reconciled.get("status") == "completed_with_warnings"
        assert reconciled.get("outcome") == "completed_with_warnings"
        assert reconciled.get("status_reconciled_from") == "completed"

    def test_critic_blocker_overridden_when_contract_valid(self, cleanup_test_runs):
        """A Critic blocker that claims the conceptual model contract has an
        invalid schema is discarded when the deterministic validator accepts
        the contract; a genuine blocker is never discarded."""
        hallucinated = "Invalid JSON schema for conceptual_model_contract."
        genuine = "Engineer output missing required error handling."

        # Contract proven valid -> the schema-claim blocker is contradicted...
        assert app._critic_blocker_contradicted_by_contract(hallucinated, True) is True
        # ...but an unrelated, substantiated blocker is not.
        assert app._critic_blocker_contradicted_by_contract(genuine, True) is False
        # When the contract is NOT proven valid, nothing is overridden.
        assert app._critic_blocker_contradicted_by_contract(hallucinated, False) is False

    def test_terminal_evidence_self_heals_completed_status_with_needs_requirements(self, cleanup_test_runs):
        run_id = f"test_terminal_evidence_self_heal_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest = {
            "run_id": run_id,
            "status": "completed",
            "verification_status": "needs_requirements",
            "requirements_request": {
                "summary": "Need platform/runtime clarifications.",
                "blockers": [
                    {
                        "id": "req_1",
                        "question": "Should this target Vite or Next.js?",
                        "why": "Framework choice affects generated output and smoke proof checks.",
                    }
                ],
            },
            "run_dir": str(out_dir),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        healed = app._ensure_terminal_evidence_artifacts(run_id, manifest_path, dict(manifest), out_dir)
        assert healed.get("status") == "blocked_requirements"
        assert healed.get("failure_artifact")
        assert (out_dir / "run_failure.md").exists()
        assert (out_dir / "final_summary.json").exists()

        summary = json.loads((out_dir / "final_summary.json").read_text(encoding="utf-8"))
        assert summary.get("outcome") == "completed_with_warnings"
        blockers = summary.get("blockers") or []
        assert blockers and blockers[0].get("severity") == "clarification_needed"

    def test_terminal_evidence_self_heals_stuck_status_to_failed(self, cleanup_test_runs):
        run_id = f"test_terminal_evidence_stuck_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest = {
            "run_id": run_id,
            "status": "stuck",
            "verification_status": "pending",
            "run_dir": str(out_dir),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        healed = app._ensure_terminal_evidence_artifacts(run_id, manifest_path, dict(manifest), out_dir)
        assert healed.get("status") == "failed"
        assert healed.get("failure_artifact") == "run_failure.md"
        assert (out_dir / "run_failure.md").exists()
        assert (out_dir / "final_summary.json").exists()

        summary = json.loads((out_dir / "final_summary.json").read_text(encoding="utf-8"))
        assert summary.get("outcome") == "failed"

    def test_terminal_evidence_self_heals_running_with_overseer_critical(self, cleanup_test_runs):
        run_id = f"test_terminal_evidence_overseer_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest = {
            "run_id": run_id,
            "status": "running",
            "verification_status": "pending",
            "run_dir": str(out_dir),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (out_dir / "overseer_advisory.json").write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "observations": [
                        {
                            "ts": app.now_iso(),
                            "severity": "critical",
                            "finding": "stuck_working_critical",
                            "agent": "Engineer",
                            "duration_s": 181.0,
                        }
                    ],
                    "commissioner_directives": [],
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        healed = app._ensure_terminal_evidence_artifacts(run_id, manifest_path, dict(manifest), out_dir)
        assert healed.get("status") == "failed"
        assert "Engineer" in str(healed.get("error_detail") or "")
        assert healed.get("failure_artifact") == "run_failure.md"
        assert (out_dir / "run_failure.md").exists()
        assert (out_dir / "final_summary.json").exists()

        summary = json.loads((out_dir / "final_summary.json").read_text(encoding="utf-8"))
        assert summary.get("outcome") == "failed"

    def test_terminal_evidence_self_heals_completed_status_with_failed_verification(self, cleanup_test_runs):
        run_id = f"test_terminal_evidence_failed_verification_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest = {
            "run_id": run_id,
            "status": "completed",
            "verification_status": "failed",
            "run_dir": str(out_dir),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        healed = app._ensure_terminal_evidence_artifacts(run_id, manifest_path, dict(manifest), out_dir)
        assert healed.get("status") == "failed"
        assert healed.get("failure_artifact") == "run_failure.md"
        assert (out_dir / "run_failure.md").exists()
        assert (out_dir / "final_summary.json").exists()

        summary = json.loads((out_dir / "final_summary.json").read_text(encoding="utf-8"))
        assert summary.get("outcome") == "failed"

    def test_terminal_evidence_relaxes_failed_traceability_when_app_verified(self, cleanup_test_runs):
        run_id = f"test_terminal_evidence_relax_traceability_{app.now_iso().replace(':', '-')}"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest = {
            "run_id": run_id,
            "status": "completed",
            "verification_status": "failed",
            "minimum_success_profile": {"required": True, "passed": True},
            "app_production": {"status": "verified"},
            "sandbox_report": {
                "checks": [
                    {
                        "evaluator": "conceptual_model_contract",
                        "result": "failed",
                        "details": "Engineer Contract Traceability invalid: Missing traceability coverage for contract IDs: folder-selection",
                    }
                ]
            },
            "run_dir": str(out_dir),
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        healed = app._ensure_terminal_evidence_artifacts(run_id, manifest_path, dict(manifest), out_dir)
        assert healed.get("status") == "completed_with_errors"
        assert healed.get("verification_status") == "partial"
        assert healed.get("failure_artifact") is None

        summary = json.loads((out_dir / "final_summary.json").read_text(encoding="utf-8"))
        assert summary.get("outcome") == "completed_with_warnings"

    def test_should_relax_failed_verification_when_only_traceability_failed_and_app_verified(self):
        manifest = {
            "verification_status": "failed",
            "sandbox_report": {
                "checks": [
                    {
                        "evaluator": "conceptual_model_contract",
                        "result": "failed",
                        "details": "Engineer Contract Traceability invalid: Missing traceability coverage for contract IDs: folder-selection",
                    },
                    {
                        "evaluator": "deferred_code_execution",
                        "result": "deferred",
                        "details": "Requires code execution",
                    },
                ]
            },
        }
        minimum_success = {"required": True, "passed": True}
        app_production = {"status": "verified"}

        should_relax, reason = app._should_relax_failed_verification(manifest, minimum_success, app_production)
        assert should_relax is True
        assert "traceability" in reason

    def test_checkpoint_resume_dispatches_to_executor(self, cleanup_test_runs):
        """
        Regression test for the requirements resume path stuck at queued(resume_requirements).

        After responding to a requirements checkpoint, _execute_orchestration_run must be
        submitted to the thread-pool executor (unless PYTEST_CURRENT_TEST suppresses it).
        This test verifies that:
          1. The manifest is transitioned from blocked_requirements → queued
          2. _orch_run_state holds a cancel_event for the run
          3. When execution IS enabled, _execute_orchestration_run is called via executor
        """
        import unittest.mock as mock
        run_id = f"test_cp_dispatch_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        requirements_request = {
            "summary": "ConceptualModelContract requires more detail.",
            "blockers": [
                {
                    "id": "req_1",
                    "question": "Which frontend stack should be used?",
                    "why": "Needed to produce a valid implementation contract.",
                    "defaults": ["React + Vite"],
                }
            ],
            "proposed_acceptance_tests": ["App loads locally with npm run dev."],
        }
        checkpoint_pending = {
            "checkpoint_id": "requirements-dispatch-test",
            "run_id": run_id,
            "kind": "requirements",
            "agent": "ConceptualModelContract",
            "summary": "needs requirements",
            "question": "Which frontend stack should be used?",
            "options": ["Provide explicit requirements answers"],
            "default_option": "Provide explicit requirements answers",
            "requested_at": now,
            "requirements_request": requirements_request,
        }
        (out_dir / "checkpoint_pending.json").write_text(json.dumps(checkpoint_pending), encoding="utf-8")

        manifest = {
            "run_id": run_id,
            "status": "blocked_requirements",
            "requested_at": now,
            "run_dir": str(out_dir),
            "goal": "Build a Tic-Tac-Toe app",
            "model": "gpt-4o-mini",
            "events": [],
            "requirements_request": requirements_request,
            "verification_status": "needs_requirements",
            "checkpoints": [
                {
                    "id": "requirements-dispatch-test",
                    "agent": "ConceptualModelContract",
                    "question": "Which frontend stack should be used?",
                    "options": ["Provide explicit requirements answers"],
                    "default_option": "Provide explicit requirements answers",
                    "requested_at": now,
                    "response": None,
                    "responded_at": None,
                    "resolved_by": None,
                }
            ],
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        submitted_args = []
        original_submit = app._orch_run_executor.submit

        def mock_submit(fn, *args, **kwargs):
            submitted_args.append((fn, args))
            # Return a real Future that is already done so cleanup works
            import concurrent.futures
            f = concurrent.futures.Future()
            f.set_result(None)
            return f

        # Temporarily disable the PYTEST suppression and patch the executor
        import os
        env_backup = os.environ.pop("PYTEST_CURRENT_TEST", None)
        try:
            with mock.patch.object(app._orch_run_executor, "submit", side_effect=mock_submit):
                res = client.post(
                    f"/orchestrate/run/{run_id}/checkpoint",
                    json={
                        "agent": "ConceptualModelContract",
                        "answers": [
                            {
                                "blocker_id": "req_1",
                                "question": "Which frontend stack should be used?",
                                "answer": "Use React with Vite.",
                            }
                        ],
                    },
                )
        finally:
            if env_backup is not None:
                os.environ["PYTEST_CURRENT_TEST"] = env_backup

        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "queued"

        # _execute_orchestration_run must have been submitted to the executor
        assert len(submitted_args) == 1, f"Expected 1 executor submit, got {len(submitted_args)}"
        submitted_fn = submitted_args[0][0]
        assert submitted_fn is app._execute_orchestration_run, (
            f"Expected _execute_orchestration_run to be submitted, got {submitted_fn}"
        )
        submitted_run_id = submitted_args[0][1][0]
        assert submitted_run_id == run_id, f"Wrong run_id submitted: {submitted_run_id}"

        # Manifest should be queued with resume_context
        updated = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert updated.get("status") == "queued"
        assert "resume_context" in updated
        assert "Use React with Vite." in updated["resume_context"]

    def test_requeue_dispatches_to_executor(self, cleanup_test_runs):
        """
        Regression test: After requeueing a stuck/cancelled run, _execute_orchestration_run
        must be submitted to the thread-pool executor (unless suppressed in test env).
        """
        import unittest.mock as mock, os
        run_id = f"test_rq_dispatch_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest = {
            "run_id": run_id,
            "status": "stuck",
            "requested_at": now,
            "run_dir": str(out_dir),
            "goal": "Build a Tic-Tac-Toe app",
            "model": "gpt-4o-mini",
            "events": [],
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        submitted_args = []

        def mock_submit(fn, *args, **kwargs):
            submitted_args.append((fn, args))
            import concurrent.futures
            f = concurrent.futures.Future()
            f.set_result(None)
            return f

        env_backup = os.environ.pop("PYTEST_CURRENT_TEST", None)
        try:
            with mock.patch.object(app._orch_run_executor, "submit", side_effect=mock_submit):
                res = client.post(f"/api/runs/{run_id}/requeue")
        finally:
            if env_backup is not None:
                os.environ["PYTEST_CURRENT_TEST"] = env_backup

        assert res.status_code == 200
        body = res.json()
        assert body.get("status") == "queued"
        assert body.get("requeued") is True

        assert len(submitted_args) == 1, f"Expected 1 executor submit, got {len(submitted_args)}"
        submitted_fn = submitted_args[0][0]
        assert submitted_fn is app._execute_orchestration_run

    def test_startup_recovery_dispatches_orphaned_queued_runs(self, cleanup_test_runs):
        """
        Queued manifests can survive API shutdown because pending futures are cancelled
        during executor shutdown. Startup recovery must resubmit those orphaned queued runs.
        """
        import unittest.mock as mock, os

        run_id = f"test_recover_queued_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest = {
            "run_id": run_id,
            "status": "queued",
            "requested_at": now,
            "run_dir": str(out_dir),
            "goal": "Recover an orphaned queued run",
            "model": "gpt-4o-mini",
            "events": [{"ts": now, "type": "status", "message": "queued"}],
            "lease": None,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        submitted_args = []

        def mock_submit(fn, *args, **kwargs):
            submitted_args.append((fn, args))
            import concurrent.futures
            f = concurrent.futures.Future()
            f.set_result(None)
            return f

        env_backup = os.environ.pop("PYTEST_CURRENT_TEST", None)
        try:
            with app._orch_run_state_lock:
                app._orch_run_state.pop(run_id, None)
            with mock.patch.object(app._orch_run_executor, "submit", side_effect=mock_submit):
                result = app._recover_orphaned_queued_orchestration_runs()
        finally:
            if env_backup is not None:
                os.environ["PYTEST_CURRENT_TEST"] = env_backup
            with app._orch_run_state_lock:
                app._orch_run_state.pop(run_id, None)

        assert result.get("recovered") == 1
        assert run_id in (result.get("run_ids") or [])
        assert len(submitted_args) == 1, f"Expected 1 executor submit, got {len(submitted_args)}"
        submitted_fn = submitted_args[0][0]
        assert submitted_fn is app._execute_orchestration_run, (
            f"Expected _execute_orchestration_run to be submitted, got {submitted_fn}"
        )
        submitted_run_id = submitted_args[0][1][0]
        assert submitted_run_id == run_id, f"Wrong run_id submitted: {submitted_run_id}"

    def test_derive_run_clears_checkpoint_stage_on_resume(self, cleanup_test_runs):
        """
        After a requirements checkpoint is answered and the run is re-queued,
        _derive_run_runtime_fields should clear the stale current_stage='checkpoint'
        so the blocking banner is hidden.
        """
        run_id = f"test_stage_reset_{app.now_iso().replace(':', '-')}"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        out_dir = app.BRIDGE_RUN_DIR / run_id
        out_dir.mkdir(parents=True, exist_ok=True)
        now = app.now_iso()

        manifest = {
            "run_id": run_id,
            "status": "queued",
            "requested_at": now,
            "run_dir": str(out_dir),
            "events": [
                {"ts": now, "type": "status", "message": "blocked_requirements"},
                {"ts": now, "type": "checkpoint:resolved", "message": "checkpoint resolved"},
                # A new queued status event that should clear the checkpoint stage
                {"ts": now, "type": "status", "message": "queued (resume_requirements)"},
            ],
            "checkpoints": [
                {
                    "id": "cp-1",
                    "agent": "ConceptualModelContract",
                    "question": "Which stack?",
                    "response": "Use React.",
                    "responded_at": now,
                    "resolved_by": "human",
                    "status": "answered",
                }
            ],
            "lease": None,
            "verification_status": "pending",
        }
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        res = client.get(f"/orchestrate/run/{run_id}")
        assert res.status_code == 200
        body = res.json()

        # After re-queuing the stage should NOT be 'checkpoint'
        assert body.get("current_stage") != "checkpoint", (
            f"current_stage should not be 'checkpoint' after re-queue, got: {body.get('current_stage')!r}"
        )
        # The run is queued, not blocked
        assert body.get("status") == "queued"
