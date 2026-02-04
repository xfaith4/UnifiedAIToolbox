import sqlite3
from contextlib import closing
from cost_tracker import CostTracker


def seed_audit(db_path):
    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute(
            """
            CREATE TABLE audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                template_id TEXT,
                model TEXT,
                input_json TEXT,
                output_json TEXT,
                cached INTEGER,
                status TEXT,
                created_at TEXT,
                token_prompt INTEGER,
                token_completion INTEGER
            )
            """
        )
        conn.executemany(
            "INSERT INTO audit (model, created_at, token_prompt, token_completion) VALUES (?, ?, ?, ?)",
            [
                ("gpt-4o-mini", "2024-11-01T00:00:00Z", 1000, 500),
                ("gpt-4o-mini", "2024-11-02T12:00:00Z", 2000, 0),
                ("gpt-3.5-turbo", "2024-11-02T15:00:00Z", 500, 500),
            ],
        )
        conn.commit()


def test_cost_totals_and_breakdown(tmp_path):
    db_path = tmp_path / "audit.db"
    seed_audit(db_path)
    tracker = CostTracker(db_path)

    total = tracker.get_total_cost()
    # 4o-mini: (1000/1k)*0.00015 + (500/1k)*0.0006 = 0.00045
    # second 4o-mini: (2000/1k)*0.00015 = 0.0003
    # 3.5-turbo: (500/1k)*0.0005 + (500/1k)*0.0015 = 0.001
    assert total == 0.00175

    by_model = tracker.get_cost_by_model()
    summary = {row["model"]: row["cost"] for row in by_model}
    assert summary["gpt-4o-mini"] == 0.00075
    assert summary["gpt-3.5-turbo"] == 0.001

    by_provider = tracker.get_cost_by_provider()
    assert by_provider[0]["provider"] == "openai"
    assert by_provider[0]["cost"] == total


def test_daily_and_budget(tmp_path):
    db_path = tmp_path / "audit.db"
    seed_audit(db_path)
    tracker = CostTracker(db_path)

    daily = tracker.get_daily_costs()
    summary = {row["date"]: row["cost"] for row in daily}
    assert summary["2024-11-01"] == 0.00045
    assert summary["2024-11-02"] == 0.0013

    budget = tracker.check_budget(budget_amount=0.002, period_days=30)
    assert budget["status"] in ("ok", "warning")
    assert budget["current_cost"] == tracker.get_total_cost()
