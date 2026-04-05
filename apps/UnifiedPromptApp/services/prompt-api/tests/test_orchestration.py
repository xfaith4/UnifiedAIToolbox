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
        assert run_payload.get("status") == "stuck"

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
