"""Verify the staged-context behavior of the app-production repair message
builder. The repair loop's effectiveness depends on each attempt being
materially smarter than the last; these tests pin that behavior.
"""

import pathlib

from app import (
    APP_PRODUCTION_REPAIR_MAX_ATTEMPTS,
    _build_app_production_repair_messages,
)


def _make_app_production():
    return {
        "checks": [
            {"name": "install", "status": "failed", "summary": "npm install failed"},
            {"name": "lint", "status": "skipped", "summary": "skipped after install failed"},
        ],
    }


def _make_repair_target():
    return {
        "gate": "install",
        "priority": "high",
        "agent": "Engineer",
        "summary": "Fix install gate",
        "failure_summary": "Command failed: file not found",
        "command": "npm install --no-audit --no-fund",
        "blocked_checks": ["lint", "build"],
    }


def test_default_max_attempts_is_at_least_three():
    """Repair budget must be high enough to clear the common
    shape-then-enum-then-pass pattern. A single attempt was the dominant
    cause of run loss; raising the default to >=3 is the structural fix."""
    assert APP_PRODUCTION_REPAIR_MAX_ATTEMPTS >= 3


def test_attempt_one_does_not_inject_history_or_critical_guidance(tmp_path):
    out_dir = tmp_path
    app_dir = tmp_path / "generated_app"
    app_dir.mkdir()

    messages = _build_app_production_repair_messages(
        out_dir, app_dir, _make_app_production(), _make_repair_target(),
        attempt_number=1, max_attempts=3, prior_attempts=[],
    )
    user_content = messages[1]["content"]

    assert "This is repair attempt 1 of 3" in user_content
    assert "Prior repair attempts" not in user_content
    assert "FINAL ATTEMPT" not in user_content
    assert "CANNOT be fixed by editing" not in user_content


def test_attempt_two_includes_prior_history_and_softer_reframe(tmp_path):
    out_dir = tmp_path
    app_dir = tmp_path / "generated_app"
    app_dir.mkdir()

    prior = [
        {
            "attempt": 1,
            "summary": "Rewrote package.json scripts",
            "verification_status": "repair_needed",
            "files_written": ["package.json"],
        }
    ]
    messages = _build_app_production_repair_messages(
        out_dir, app_dir, _make_app_production(), _make_repair_target(),
        attempt_number=2, max_attempts=3, prior_attempts=prior,
    )
    user_content = messages[1]["content"]

    assert "This is repair attempt 2 of 3" in user_content
    assert "previous attempt did not pass verification" in user_content
    assert "Prior repair attempts" in user_content
    assert "Attempt 1:" in user_content
    assert "Rewrote package.json scripts" in user_content
    assert "verification=repair_needed" in user_content
    # Critical guidance for environmental failures should NOT yet be present
    # — that's reserved for the final attempt.
    assert "CANNOT be fixed by editing" not in user_content


def test_final_attempt_warns_and_offers_environmental_escape_hatch(tmp_path):
    out_dir = tmp_path
    app_dir = tmp_path / "generated_app"
    app_dir.mkdir()

    prior = [
        {"attempt": 1, "summary": "Edited package.json", "verification_status": "repair_needed",
         "files_written": ["package.json"]},
        {"attempt": 2, "summary": "Edited scripts again", "verification_status": "repair_needed",
         "files_written": ["package.json"]},
    ]
    messages = _build_app_production_repair_messages(
        out_dir, app_dir, _make_app_production(), _make_repair_target(),
        attempt_number=3, max_attempts=3, prior_attempts=prior,
    )
    user_content = messages[1]["content"]

    assert "This is repair attempt 3 of 3 (FINAL ATTEMPT)" in user_content
    assert "Environment failures" in user_content
    assert "CANNOT be fixed by editing" in user_content
    assert "Wrong-project-type failures" in user_content
    assert "return an empty files array and explain in notes" in user_content
    # Full history should still be visible
    assert "Attempt 1:" in user_content
    assert "Attempt 2:" in user_content


def test_single_attempt_mode_does_not_inject_staged_guidance(tmp_path):
    """When max_attempts=1 (legacy/explicit single-shot mode), the prompt
    should not pretend there's staged context to draw on."""
    out_dir = tmp_path
    app_dir = tmp_path / "generated_app"
    app_dir.mkdir()

    messages = _build_app_production_repair_messages(
        out_dir, app_dir, _make_app_production(), _make_repair_target(),
        attempt_number=1, max_attempts=1, prior_attempts=[],
    )
    user_content = messages[1]["content"]

    assert "This is repair attempt" not in user_content
    assert "FINAL ATTEMPT" not in user_content
    assert "Prior repair attempts" not in user_content
