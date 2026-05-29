import json

import app as app_module
import orchestrator_verifier
from orchestrator_verifier import OrchestratorVerifier


def test_resolve_command_executable_uses_full_path_when_shim_present(tmp_path, monkeypatch):
    """On Windows, ``subprocess.run(["npm", ...])`` raises FileNotFoundError when
    npm is installed as ``npm.CMD`` even though ``shutil.which`` finds it.
    Pin the resolution behavior so the install/build/test gates can actually
    execute the package manager they detected."""
    verifier = OrchestratorVerifier(tmp_path)
    monkeypatch.setattr(orchestrator_verifier.shutil, "which", lambda name: r"C:\Program Files\nodejs\npm.CMD")
    resolved = verifier._resolve_command_executable(["npm", "install", "--no-audit"])
    assert resolved == [r"C:\Program Files\nodejs\npm.CMD", "install", "--no-audit"]


def test_resolve_command_executable_passes_through_when_not_found(tmp_path, monkeypatch):
    """If shutil.which can't locate the command, return the command unchanged
    so the existing exception path in _run_command produces a meaningful error."""
    verifier = OrchestratorVerifier(tmp_path)
    monkeypatch.setattr(orchestrator_verifier.shutil, "which", lambda name: None)
    resolved = verifier._resolve_command_executable(["mystery-tool", "--flag"])
    assert resolved == ["mystery-tool", "--flag"]


def test_resolve_command_executable_passes_through_absolute_path(tmp_path):
    """Already-absolute paths should not be re-resolved (avoid pointless work
    and avoid the case where a caller passes a path that shutil.which might
    map to something else with the same basename)."""
    verifier = OrchestratorVerifier(tmp_path)
    resolved = verifier._resolve_command_executable([r"C:\custom\npm.CMD", "install"])
    assert resolved == [r"C:\custom\npm.CMD", "install"]


def test_resolve_command_executable_handles_empty_command(tmp_path):
    verifier = OrchestratorVerifier(tmp_path)
    assert verifier._resolve_command_executable([]) == []


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
    monkeypatch.setattr(verifier, "_probe_http_page", lambda url, timeout=5: (True, f"ok {url}"))
    monkeypatch.setattr(orchestrator_verifier.subprocess, "Popen", FakeProcess)

    result = verifier.verify_dev_server()

    assert result is not None
    assert result["passed"] is True
    assert result["command"].startswith("npm run dev -- --host 127.0.0.1 --port 43123")
    assert result["log_path"].endswith("dev_server.log")
    assert result["runtime_probe_ok"] is True


def test_verify_dev_server_fails_on_post_startup_runtime_errors(tmp_path, monkeypatch):
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
            self.returncode = None
            if stdout is not None:
                stdout.write("ready\nRuntime Error: Cannot read properties of undefined\n")
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

    monkeypatch.setattr(verifier, "_wait_for_any_http_server", lambda urls, process, timeout=45: urls[0])
    monkeypatch.setattr(verifier, "_probe_http_page", lambda url, timeout=5: (True, f"ok {url}"))
    monkeypatch.setattr(orchestrator_verifier.subprocess, "Popen", FakeProcess)

    result = verifier.verify_dev_server()

    assert result is not None
    assert result["passed"] is False
    assert "Detected runtime errors after startup" in result["output"]
    assert result["runtime_errors"]


def test_verify_dev_server_fails_when_page_probe_fails(tmp_path, monkeypatch):
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
            self.returncode = None
            if stdout is not None:
                stdout.write("ready\n")
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

    monkeypatch.setattr(verifier, "_wait_for_any_http_server", lambda urls, process, timeout=45: urls[0])
    monkeypatch.setattr(
        verifier,
        "_probe_http_page",
        lambda url, timeout=5: (False, f"HTTP probe to {url} failed with status 500"),
    )
    monkeypatch.setattr(orchestrator_verifier.subprocess, "Popen", FakeProcess)

    result = verifier.verify_dev_server()

    assert result is not None
    assert result["passed"] is False
    assert result["runtime_probe_ok"] is False
    assert "HTTP probe" in result["output"]


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


def test_execute_app_production_repairs_marks_blocked_without_api_key(tmp_path, monkeypatch):
    out_dir = tmp_path / "run"
    out_dir.mkdir()
    app_dir = out_dir / "generated_app"
    app_dir.mkdir()
    (app_dir / "package.json").write_text(json.dumps({"name": "generated-app"}), encoding="utf-8")

    monkeypatch.setattr(app_module, "OPENAI_API_KEY", "")

    app_production = {
        "status": "repair_needed",
        "delivery_readiness": "repair_needed",
        "app_dir": "generated_app",
        "checks": [
            {"name": "install", "status": "failed", "summary": "npm ci failed"},
        ],
        "passed_count": 0,
        "failed_count": 1,
        "skipped_count": 0,
    }
    repair_plan = {
        "status": "actionable",
        "items": [
            {
                "id": "app-production-install",
                "gate": "install",
                "agent": "Engineer",
                "priority": "high",
                "summary": "Fix install",
            }
        ],
    }

    updated_production, updated_plan = app_module._execute_app_production_repairs(
        out_dir,
        app_dir,
        app_production,
        repair_plan,
        model="gpt-test",
    )

    assert updated_production["status"] == "repair_needed"
    assert updated_plan["execution_status"] == "blocked_missing_api_key"
    assert updated_plan["attempts"] == []
    assert updated_plan["execution_report_artifact"] == "generated_app_repair_execution.json"


def test_execute_app_production_repairs_applies_model_edits_and_reverifies(tmp_path, monkeypatch):
    out_dir = tmp_path / "run"
    out_dir.mkdir()
    app_dir = out_dir / "generated_app"
    app_dir.mkdir()
    (app_dir / "package.json").write_text(
        json.dumps({"name": "generated-app", "scripts": {"build": "vite build"}}),
        encoding="utf-8",
    )
    (app_dir / "src").mkdir()
    (app_dir / "src" / "main.tsx").write_text("console.log('broken')\n", encoding="utf-8")

    monkeypatch.setattr(app_module, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(app_module, "APP_PRODUCTION_REPAIR_MAX_ATTEMPTS", 1)

    def fake_call_provider_chat(model, messages):
        assert model == "gpt-test"
        assert any("Repair gate: build" in message["content"] for message in messages if message["role"] == "user")
        return (
            {
                "summary": "Fixed the generated entrypoint.",
                "files": [
                    {
                        "path": "src/main.tsx",
                        "content": "console.log('fixed')",
                        "reason": "Resolve the build error in the generated entrypoint.",
                    }
                ],
                "notes": ["Repaired the generated app entrypoint."],
            },
            {},
        )

    class FakeVerifier:
        def __init__(self, run_dir, log_dir=None):
            self.run_dir = run_dir
            self.log_dir = log_dir

        def run_all_verifications(self):
            return {
                "install_result": {
                    "passed": True,
                    "output": "install ok",
                    "command": "npm ci --no-audit --no-fund",
                    "exit_code": 0,
                },
                "lint_result": None,
                "build_result": {
                    "passed": True,
                    "output": "build ok",
                    "command": "npm run build",
                    "exit_code": 0,
                },
                "unit_test_result": None,
                "smoke_test_result": None,
                "dev_server_result": None,
                "docker_compose_valid": None,
            }

    monkeypatch.setattr(app_module, "call_provider_chat", fake_call_provider_chat)
    monkeypatch.setattr(app_module, "OrchestratorVerifier", FakeVerifier)

    app_production = {
        "status": "repair_needed",
        "delivery_readiness": "repair_needed",
        "app_dir": "generated_app",
        "checks": [
            {
                "name": "build",
                "status": "failed",
                "summary": "Build failed",
                "command": "npm run build",
                "log_artifact": "logs/generated_app/build.log",
            },
        ],
        "passed_count": 0,
        "failed_count": 1,
        "skipped_count": 0,
    }
    repair_plan = {
        "status": "actionable",
        "items": [
            {
                "id": "app-production-build",
                "gate": "build",
                "agent": "Engineer",
                "priority": "high",
                "summary": "Fix the build",
                "failure_summary": "Build failed",
                "command": "npm run build",
            }
        ],
    }

    updated_production, updated_plan = app_module._execute_app_production_repairs(
        out_dir,
        app_dir,
        app_production,
        repair_plan,
        model="gpt-test",
    )

    assert (app_dir / "src" / "main.tsx").read_text(encoding="utf-8") == "console.log('fixed')\n"
    assert updated_production["status"] == "verified"
    assert updated_plan["status"] == "not_needed"
    assert updated_plan["execution_status"] == "verified"
    assert len(updated_plan["attempts"]) == 1
    assert updated_plan["attempts"][0]["status"] == "verified"


def test_verify_install_skips_non_node_project(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "system-dashboard",
                "private": True,
                "scripts": {"start": "node -e \"console.log('stub')\""},
                "dependencies": {},
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "requirements.txt").write_text("flask\n", encoding="utf-8")
    (tmp_path / "Start-SystemDashboard.ps1").write_text("# launcher\n", encoding="utf-8")

    verifier = OrchestratorVerifier(tmp_path)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("verify_install must not shell out for a non-Node project")

    monkeypatch.setattr(verifier, "_run_command", _fail_if_called)

    result = verifier.verify_install()

    assert result is not None
    assert result["status"] == "skipped"
    assert "Non-Node project" in result["summary"]
    assert result["exit_code"] is None


def test_verify_install_skips_when_package_manager_missing(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "real-node-app",
                "dependencies": {"react": "18.0.0"},
                "scripts": {"build": "vite build"},
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)

    monkeypatch.setattr(orchestrator_verifier.shutil, "which", lambda _: None)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("verify_install must not shell out when toolchain missing")

    monkeypatch.setattr(verifier, "_run_command", _fail_if_called)

    result = verifier.verify_install()

    assert result is not None
    assert result["status"] == "skipped"
    assert "not found on PATH" in result["summary"]
    assert result["command"] == "npm install --no-audit --no-fund"


def test_verify_dev_server_skips_when_package_manager_missing(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "real-node-app",
                "dependencies": {"react": "18.0.0"},
                "scripts": {"dev": "vite"},
            }
        ),
        encoding="utf-8",
    )

    verifier = OrchestratorVerifier(tmp_path)

    monkeypatch.setattr(orchestrator_verifier.shutil, "which", lambda _: None)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("verify_dev_server must not spawn when toolchain missing")

    monkeypatch.setattr(orchestrator_verifier.subprocess, "Popen", _fail_if_called)

    result = verifier.verify_dev_server()

    assert result is not None
    assert result["status"] == "skipped"
    assert "not found on PATH" in result["summary"]


def test_run_all_verifications_cascades_skipped_install_as_skipped(tmp_path, monkeypatch):
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "system-dashboard",
                "private": True,
                "scripts": {
                    "start": "node -e \"console.log('stub')\"",
                    "build": "node -e \"console.log('stub')\"",
                    "lint": "node -e \"console.log('stub')\"",
                },
                "dependencies": {},
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "requirements.txt").write_text("flask\n", encoding="utf-8")

    verifier = OrchestratorVerifier(tmp_path)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("no dependent gate should shell out when install is skipped")

    monkeypatch.setattr(verifier, "_run_command", _fail_if_called)
    monkeypatch.setattr(verifier, "run_normalization", lambda: None)
    monkeypatch.setattr(verifier, "verify_docker_compose", lambda: None)

    results = verifier.run_all_verifications()

    assert results["install_result"]["status"] == "skipped"
    for key in ("lint_result", "build_result", "unit_test_result", "smoke_test_result", "dev_server_result"):
        assert results[key]["status"] == "skipped"
        assert "install gate was skipped" in results[key]["summary"]
