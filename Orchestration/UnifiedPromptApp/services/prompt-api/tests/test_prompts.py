import json
import sqlite3
from fastapi.testclient import TestClient
import pytest
import textwrap
import yaml

import app
from prompt_registry import find_prompt_by_id, load_prompt


client = TestClient(app.app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert "time" in payload


def test_prompts_collection():
    response = client.get("/prompts")
    assert response.status_code == 200
    prompts = response.json()
    assert isinstance(prompts, list)
    assert prompts, "registry should return at least one prompt"
    assert "id" in prompts[0]


def test_single_prompt_lookup():
    sample_id = "analytics.divisions.performance.summary"
    response = client.get(f"/prompts/{sample_id}")
    assert response.status_code == 200
    prompt = response.json()
    assert prompt["id"] == sample_id
    assert "prompt" in prompt


def test_prompt_render_replaces_variables():
    sample_id = "analytics.divisions.performance.summary"
    payload = {
        "prompt_id": sample_id,
        "variables": {
            "division": "Medicare",
            "month": "2025-10",
            "include_mos_detail": True,
        },
    }
    response = client.post("/prompts/render", json=payload)
    assert response.status_code == 200
    rendered = response.json()["rendered_blocks"]
    assert "Medicare" in rendered["instructions"]
    assert "2025-10" in rendered["instructions"]


def test_generate_dry_run_uses_registry_prompt():
    sample_id = "analytics.divisions.performance.summary"
    spec = find_prompt_by_id(sample_id)
    assert spec is not None
    payload = {
        "template_id": sample_id,
        "role": "Analytics Narrator",
        "task": "Summarize KPIs",
        "context": {"audience": "executives"},
        "input_data": {"log_snippet": "n/a"},
        "desired_output": ["executive_summary"],
        "modes": ["exec"],
    }
    response = client.post("/api/generate/dry-run", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == app.DEFAULT_MODEL
    messages = body["messages"]
    assert messages[0]["content"] == spec.raw["blocks"]["system"]


def test_record_prompt_review_appends_run(tmp_path, monkeypatch):
    sample_yaml = tmp_path / "tests.prompt.review.prompt.yaml"
    sample_yaml.write_text(
        textwrap.dedent(
            """
            id: tests.prompt.review
            version: 0.0.1
            blocks:
              system: Sample system
              instructions: Say hello to ${name}
            variables:
              name:
                type: string
            telemetry:
              audit:
                runs: []
            """
        ).strip(),
        encoding="utf-8",
    )
    spec = load_prompt(sample_yaml)

    def fake_find(prompt_id: str):
        if prompt_id == spec.id:
            return spec
        return None

    monkeypatch.setattr(app, "registry_find_prompt", fake_find)

    payload = {
        "status": "approved",
        "reviewers": ["CriticBot"],
        "notes": "Looks good",
        "manifest": "runs/tests.prompt.review.json",
        "runbook": {
            "summary": "Quick summary",
            "references": [{"type": "manifest", "value": "runs/tests.prompt.review.json"}],
            "reasoning": ["Validated outputs."],
            "next_steps": ["Share with owner."],
        },
    }
    response = client.post(f"/prompts/{spec.id}/reviews", json=payload)
    assert response.status_code == 200
    stored = yaml.safe_load(sample_yaml.read_text(encoding="utf-8"))
    runs = stored["telemetry"]["audit"]["runs"]
    assert runs, "expected review run to be appended"
    last_run = runs[-1]
    assert last_run["status"] == "approved"
    assert last_run["reviewers"] == ["CriticBot"]
    assert last_run["manifest"] == "runs/tests.prompt.review.json"
    assert last_run["runbook"]["summary"] == "Quick summary"


def test_agent_sync_roundtrip(tmp_path, monkeypatch):
    temp_store = tmp_path / "agents.json"
    monkeypatch.setattr(app, "AGENT_SYNC_FILE", temp_store)

    initial = client.get("/agents")
    assert initial.status_code == 200
    assert initial.json() == []

    payload = [
        {
            "id": "agent.telemetry.watch",
            "name": "Telemetry Watch",
            "purpose": "Monitor prompt telemetry for anomalies.",
            "mission": "Detect drift and escalate to owners.",
            "status": "ready",
            "triggers": ["render_success_rate < 97%"],
            "tags": ["monitoring"],
            "createdAt": "2025-11-10T12:00:00Z",
            "updatedAt": "2025-11-10T12:00:00Z",
        }
    ]
    response = client.post("/agents:sync", json={"agents": payload})
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 1

    after = client.get("/agents")
    assert after.status_code == 200
    agents = after.json()
    assert len(agents) == 1
    assert agents[0]["name"] == "Telemetry Watch"


def test_orchestrator_task_ingest(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    temp_db = tmp_path / "workbench.db"
    original_data_dir = app.DATA_DIR
    original_db_path = app.DB_PATH
    try:
        app.DATA_DIR = data_dir
        app.DB_PATH = temp_db
        app.init_db()
        response = client.post(
            "/orchestrator/tasks",
            json={
                "supervisor": {
                    "task": "Telemetry sweep",
                    "objective": "Detect drift",
                    "priority": "High",
                },
                "agents": [{"agentId": "agent.telemetry.watch"}],
                "prompts": [{"id": "analytics.divisions.performance.summary"}],
            },
        )
        assert response.status_code == 200
        with sqlite3.connect(app.DB_PATH) as conn:
            rows = conn.execute("SELECT payload FROM orchestrator_tasks").fetchall()
        assert len(rows) == 1
        payload = json.loads(rows[0][0])
        assert payload["supervisor"]["task"] == "Telemetry sweep"
        assert payload["status"] == "queued"
    finally:
        app.DATA_DIR = original_data_dir
        app.DB_PATH = original_db_path


def test_orchestrator_task_list_and_update(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    temp_db = tmp_path / "workbench.db"
    original_data_dir = app.DATA_DIR
    original_db_path = app.DB_PATH
    try:
        app.DATA_DIR = data_dir
        app.DB_PATH = temp_db
        app.init_db()
        client.post(
            "/orchestrator/tasks",
            json={
                "supervisor": {"task": "Bridge test", "objective": "Evaluate workflow"},
                "agents": [],
                "prompts": [],
            },
        )
        resp = client.get("/orchestrator/tasks")
        assert resp.status_code == 200
        queue = resp.json()
        assert len(queue) == 1
        task_id = queue[0]["id"]

        patch = client.patch(
            f"/orchestrator/tasks/{task_id}",
            json={"status": "running", "notes": "Supervisor acknowledged"},
        )
        assert patch.status_code == 200
        updated = patch.json()["task"]
        assert updated["status"] == "running"
        assert updated["notes"] == "Supervisor acknowledged"
        with sqlite3.connect(app.DB_PATH) as conn:
            stored = conn.execute("SELECT payload FROM orchestrator_tasks WHERE id = ?", (task_id,)).fetchone()
        assert stored
        updated_payload = json.loads(stored[0])
        assert updated_payload["status"] == "running"
        assert updated_payload["notes"] == "Supervisor acknowledged"
    finally:
        app.DATA_DIR = original_data_dir
        app.DB_PATH = original_db_path


def test_orchestrator_queue_process_dispatches(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    temp_db = tmp_path / "workbench.db"
    runs_dir = tmp_path / "runs"
    runs_dir.mkdir()
    original_data_dir = app.DATA_DIR
    original_db_path = app.DB_PATH
    original_runs_dir = app.BRIDGE_RUN_DIR
    try:
        app.DATA_DIR = data_dir
        app.DB_PATH = temp_db
        app.BRIDGE_RUN_DIR = runs_dir
        app.init_db()
        client.post(
            "/orchestrator/tasks",
            json={
                "supervisor": {"task": "Process queue", "objective": "ensure run"},
                "agents": [],
                "prompts": [{"id": "analytics.divisions.performance.summary"}],
            },
        )
        resp = client.post("/orchestrator/tasks:process")
        assert resp.status_code == 200
        body = resp.json()
        assert body["processed"] == 1
        with sqlite3.connect(app.DB_PATH) as conn:
            row = conn.execute("SELECT payload FROM orchestrator_tasks").fetchone()
        task = json.loads(row[0])
        assert task["status"] == "dispatched"
        assert task["run_id"]
        manifests = list(runs_dir.glob("*.json"))
        assert manifests, "expected a run manifest to be created"
    finally:
        app.DATA_DIR = original_data_dir
        app.DB_PATH = original_db_path
        app.BRIDGE_RUN_DIR = original_runs_dir


def test_render_prompt_falls_back_to_synced_payload(tmp_path, monkeypatch):
    sync_file = tmp_path / "prompt-library.json"
    payload = [
        {
            "id": "local.synthetic",
            "template": "Hello ${name}",
            "variables": [
                {"name": "name", "type": "string", "required": True},
            ],
        }
    ]
    sync_file.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setattr(app, "PROMPT_SYNC_FILE", sync_file)
    monkeypatch.setattr(app, "registry_find_prompt", lambda _: None)

    resp = client.post(
        "/prompts/render",
        json={"prompt_id": "local.synthetic", "variables": {"name": "Casey"}},
    )
    assert resp.status_code == 200
    rendered = resp.json()["rendered_blocks"]
    assert "Casey" in rendered["instructions"]


def test_prompt_sync_requires_admin_token(tmp_path, monkeypatch):
    sync_file = tmp_path / "prompt-library.json"
    monkeypatch.setattr(app, "PROMPT_SYNC_FILE", sync_file)
    monkeypatch.setattr(app.settings, "admin_token", "secret-token")

    missing = client.post("/prompts:sync", json={"prompts": []})
    assert missing.status_code == 401

    prompts = [
        {
            "id": "secured.prompt",
            "template": "Hi ${who}",
        }
    ]
    ok = client.post(
        "/prompts:sync",
        headers={"X-Admin-Token": "secret-token"},
        json={"prompts": prompts},
    )
    assert ok.status_code == 200
    saved = json.loads(sync_file.read_text(encoding="utf-8"))
    assert saved[0]["id"] == "secured.prompt"


def test_prompts_endpoint_merges_registry_and_synced(tmp_path, monkeypatch):
    sync_file = tmp_path / "prompt-library.json"
    synced_payloads = [
        {"id": "analytics.divisions.performance.summary", "prompt": {"system": "Synced copy"}},
        {"id": "local.draft.prompt", "prompt": {"system": "Draft-only"}},
    ]
    sync_file.write_text(json.dumps(synced_payloads), encoding="utf-8")
    monkeypatch.setattr(app, "PROMPT_SYNC_FILE", sync_file)

    def fake_registry_payloads():
        return [
            {"id": "analytics.divisions.performance.summary", "prompt": {"system": "Registry copy"}},
            {"id": "support.incident.summary", "prompt": {"system": "Canonical"}},
        ]

    monkeypatch.setattr(app, "load_registry_payloads", fake_registry_payloads)

    resp = client.get("/prompts")
    assert resp.status_code == 200
    payloads = resp.json()
    summary = {item["id"]: item for item in payloads}
    assert summary["analytics.divisions.performance.summary"]["prompt"]["system"] == "Synced copy"
    assert summary["support.incident.summary"]["prompt"]["system"] == "Canonical"
    assert "local.draft.prompt" in summary


def test_openai_error_detail_is_masked(monkeypatch):
    original_api_key = app.OPENAI_API_KEY
    try:
        app.OPENAI_API_KEY = "test-key"

        class FakeResponse:
            status_code = 500
            text = "sensitive upstream detail"

            def json(self):
                return {}

        monkeypatch.setattr(app.requests, "post", lambda *args, **kwargs: FakeResponse())

        with pytest.raises(app.HTTPException) as exc:
            app.call_openai_chat("gpt-test", [{"role": "user", "content": "hi"}])

        assert "sensitive" not in str(exc.value.detail).lower()
        assert "error" in str(exc.value.detail).lower()
    finally:
        app.OPENAI_API_KEY = original_api_key
