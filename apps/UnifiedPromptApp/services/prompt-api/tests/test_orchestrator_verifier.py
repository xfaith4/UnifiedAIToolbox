import json

import app as app_module
import orchestrator_verifier
from orchestrator_verifier import OrchestratorVerifier


def test_detects_package_manager_and_build_command(tmp_path):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "generated-app",
                "packageManager": "pnpm@9.0.0",
                "scripts": {
                    "build": "vite build",
                    "dev": "vite",
                },
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)

    assert verifier._detect_node_package_manager() == "pnpm"
    assert verifier._get_install_command() == ["pnpm", "install"]
    assert verifier._get_package_script_command("build") == ["pnpm", "run", "build"]


def test_verify_dev_server_reports_success_with_bounded_process(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "generated-app",
                "scripts": {
                    "dev": "vite",
                },
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)

    class FakeProcess:
        def __init__(self, command, cwd=None, stdout=None, stderr=None, text=None, env=None):
            self.command = command
            self.returncode = None
            if stdout is not None:
                stdout.write("VITE v5 ready in 321 ms\n")
                stdout.flush()

        def poll(self):
            return self.returncode

        def terminate(self):
            self.returncode = 0

        def wait(self, timeout=None):
            self.returncode = 0
            return 0

        def kill(self):
            self.returncode = -9

    monkeypatch.setattr(verifier, "_find_available_port", lambda host="127.0.0.1": 43123)
    monkeypatch.setattr(verifier, "_wait_for_any_http_server", lambda urls, process, timeout=45: urls[0])
    monkeypatch.setattr(orchestrator_verifier.subprocess, "Popen", FakeProcess)

    result = verifier.verify_dev_server()

    assert result is not None
    assert result["passed"] is True
    assert result["command"].startswith("npm run dev -- --host 127.0.0.1 --port 43123")
    assert result["log_path"].endswith("dev_server.log")


def test_run_all_verifications_skips_dependent_checks_after_install_failure(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "generated-app",
                "scripts": {
                    "dev": "react-scripts start",
                    "build": "react-scripts build",
                    "lint": "eslint src",
                },
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)

    monkeypatch.setattr(
        verifier,
        "verify_install",
        lambda: {
            "passed": False,
            "output": "npm ci failed",
            "command": "npm install --no-audit --no-fund",
            "exit_code": 1,
        },
    )
    monkeypatch.setattr(verifier, "verify_lint", lambda: {"passed": True, "output": "should not run"})
    monkeypatch.setattr(verifier, "verify_build", lambda: {"passed": True, "output": "should not run"})
    monkeypatch.setattr(verifier, "verify_unit_tests", lambda: {"passed": True, "output": "should not run"})
    monkeypatch.setattr(verifier, "verify_smoke_tests", lambda: {"passed": True, "output": "should not run"})
    monkeypatch.setattr(verifier, "verify_dev_server", lambda: {"passed": True, "output": "should not run"})
    monkeypatch.setattr(verifier, "verify_docker_compose", lambda: None)
    monkeypatch.setattr(verifier, "run_normalization", lambda: None)

    results = verifier.run_all_verifications()

    assert results["install_result"]["passed"] is False
    assert results["lint_result"]["status"] == "skipped"
    assert results["build_result"]["status"] == "skipped"
    assert results["dev_server_result"]["status"] == "skipped"


def test_dev_server_plan_uses_env_fallback_for_non_flag_script(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "generated-app",
                "scripts": {
                    "start": "react-scripts start",
                },
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)
    monkeypatch.setattr(verifier, "_find_available_port", lambda host="127.0.0.1": 43123)
    monkeypatch.setattr(
        verifier,
        "_is_port_available",
        lambda port, host="127.0.0.1": port in {3000, 43123},
    )

    plan = verifier._resolve_dev_server_plan("start")

    assert plan["command"] == ["npm", "run", "start"]
    assert plan["env"]["PORT"] == "43123"
    assert "http://127.0.0.1:43123" in plan["probe_urls"]
    assert "http://127.0.0.1:3000" in plan["probe_urls"]


def test_summarize_app_production_counts_install_failure_and_skips(tmp_path):
    out_dir = tmp_path / "run"
    out_dir.mkdir()
    app_dir = out_dir / "generated_app"
    app_dir.mkdir()

    summary = app_module._summarize_app_production_gates(
        {
            "install_result": {
                "passed": False,
                "output": "npm ci failed because package-lock.json was invalid.",
                "command": "npm ci --no-audit --no-fund",
                "exit_code": 1,
            },
            "lint_result": {
                "status": "skipped",
                "summary": "Lint skipped because dependency installation failed.",
            },
            "build_result": {
                "status": "skipped",
                "summary": "Build skipped because dependency installation failed.",
            },
            "unit_test_result": {
                "status": "skipped",
                "summary": "Unit tests skipped because dependency installation failed.",
            },
            "smoke_test_result": None,
            "dev_server_result": {
                "status": "skipped",
                "summary": "Dev server proof skipped because dependency installation failed.",
            },
            "docker_compose_valid": None,
        },
        out_dir,
        app_dir,
    )

    assert summary["status"] == "repair_needed"
    assert summary["failed_count"] == 1
    assert summary["skipped_count"] == 6
    checks = {check["name"]: check for check in summary["checks"]}
    assert checks["install"]["status"] == "failed"
    assert checks["lint"]["status"] == "skipped"
    assert checks["build"]["status"] == "skipped"
    assert checks["dev_server"]["status"] == "skipped"
