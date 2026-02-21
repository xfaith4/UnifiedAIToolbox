from fastapi.testclient import TestClient

import app


client = TestClient(app.app)


def test_orchestrate_run_rejects_without_token_when_insecure_local_disabled(monkeypatch):
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "false")
    monkeypatch.delenv("PROMPT_API_EXECUTION_TOKEN", raising=False)
    monkeypatch.setattr(app.settings, "admin_token", None)

    response = client.post("/orchestrate/run", json={"goal": "secure test"})

    assert response.status_code == 401
    assert "Execution token" in response.text


def test_orchestrate_run_accepts_with_execution_token(monkeypatch):
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "false")
    monkeypatch.setenv("PROMPT_API_EXECUTION_TOKEN", "exec-secret")
    monkeypatch.setattr(app.settings, "admin_token", None)

    response = client.post(
        "/orchestrate/run",
        headers={"X-Execution-Token": "exec-secret"},
        json={"goal": "secure test"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert "run_id" in payload


def test_admin_cost_summary_rejects_without_token_when_insecure_local_disabled(monkeypatch):
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "false")
    monkeypatch.setattr(app.settings, "admin_token", "admin-secret")

    response = client.get("/admin/costs/summary")

    assert response.status_code == 401


def test_admin_cost_summary_accepts_with_admin_token(monkeypatch):
    monkeypatch.setenv("ALLOW_INSECURE_LOCAL", "false")
    monkeypatch.setattr(app.settings, "admin_token", "admin-secret")

    response = client.get(
        "/admin/costs/summary",
        headers={"X-Admin-Token": "admin-secret"},
    )

    assert response.status_code == 200
