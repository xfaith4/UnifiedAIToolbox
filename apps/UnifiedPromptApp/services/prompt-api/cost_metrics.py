"""
Cost and environmental impact metrics tracking.

Provides functions to record per-call metrics and aggregate them by run,
including cost (USD), energy (kWh), and water usage (liters).
"""

import sqlite3
import json
import pathlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from model_costs import calculate_impact, ModelImpact


def now_iso() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%fZ')


def record_call_metrics(
    db_path: pathlib.Path,
    model: str,
    tokens_input: Optional[int],
    tokens_output: Optional[int],
    run_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    project_name: Optional[str] = None,
    app_name: Optional[str] = None,
    timestamp: Optional[str] = None
) -> int:
    """
    Record cost and environmental metrics for a single API call.
    
    Args:
        db_path: Path to SQLite database
        model: Model name (e.g., "gpt-4o-mini")
        tokens_input: Number of input tokens
        tokens_output: Number of output tokens
        run_id: Optional orchestration run ID
        agent_name: Optional agent name
        project_name: Optional project name
        app_name: Optional app name
        timestamp: Optional timestamp (defaults to now)
        
    Returns:
        ID of the inserted metric record
    """
    impact = calculate_impact(model, tokens_input, tokens_output, agent_name)
    
    timestamp = timestamp or now_iso()
    created_at = now_iso()
    
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()

        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='orchestration_cost_metrics'"
        )
        if not cursor.fetchone():
            # Table doesn't exist yet - migration hasn't run
            print("Warning: orchestration_cost_metrics table doesn't exist, skipping metrics recording")
            return -1

        cursor.execute(
            """
            INSERT INTO orchestration_cost_metrics (
                run_id, timestamp, model_name, agent_name,
                tokens_input, tokens_output,
                cost_usd, kwh_estimated, water_liters_estimated,
                project_name, app_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                timestamp,
                model,
                agent_name,
                impact.tokens_input,
                impact.tokens_output,
                impact.cost_usd,
                impact.kwh_estimated,
                impact.water_liters_estimated,
                project_name,
                app_name,
                created_at,
            ),
        )

        conn.commit()
        return cursor.lastrowid
    finally:
        try:
            conn.close()
        except Exception:
            pass


def aggregate_run_metrics(
    db_path: pathlib.Path,
    run_id: str,
    run_goal: Optional[str] = None,
    project_name: Optional[str] = None,
    app_name: Optional[str] = None,
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None
) -> Dict[str, Any]:
    """
    Aggregate all metrics for a run and store in summary table.
    
    Args:
        db_path: Path to SQLite database
        run_id: Orchestration run ID
        run_goal: Optional goal description
        project_name: Optional project name
        app_name: Optional app name
        started_at: Optional run start timestamp
        completed_at: Optional run completion timestamp
        
    Returns:
        Dictionary with aggregated metrics
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if tables exist
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('orchestration_cost_metrics', 'orchestration_run_aggregates')"
        )
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        if 'orchestration_cost_metrics' not in existing_tables:
            print(f"Warning: Cannot aggregate metrics for run {run_id}, tables don't exist")
            return {}
        
        # Aggregate metrics from all calls in this run
        cursor.execute("""
            SELECT
                COUNT(*) as call_count,
                SUM(tokens_input) as total_input,
                SUM(tokens_output) as total_output,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water,
                GROUP_CONCAT(DISTINCT model_name) as models,
                GROUP_CONCAT(DISTINCT agent_name) as agents
            FROM orchestration_cost_metrics
            WHERE run_id = ?
        """, (run_id,))
        
        row = cursor.fetchone()
        
        if not row or row['call_count'] == 0:
            # No metrics for this run yet
            return {
                'run_id': run_id,
                'call_count': 0,
                'total_tokens_input': 0,
                'total_tokens_output': 0,
                'total_cost_usd': 0.0,
                'total_kwh': 0.0,
                'total_water_liters': 0.0
            }
        
        # Parse models and agents lists
        models = [m for m in (row['models'] or '').split(',') if m]
        agents = [a for a in (row['agents'] or '').split(',') if a and a != 'None']
        
        aggregates = {
            'run_id': run_id,
            'call_count': row['call_count'],
            'total_tokens_input': row['total_input'] or 0,
            'total_tokens_output': row['total_output'] or 0,
            'total_cost_usd': round(row['total_cost'] or 0.0, 6),
            'total_kwh': round(row['total_kwh'] or 0.0, 6),
            'total_water_liters': round(row['total_water'] or 0.0, 6),
            'unique_models': models,
            'unique_agents': agents,
            'project_name': project_name,
            'app_name': app_name,
            'run_goal': run_goal,
            'started_at': started_at,
            'completed_at': completed_at
        }
        
        # Store/update in aggregates table if it exists
        if 'orchestration_run_aggregates' in existing_tables:
            now = now_iso()
            cursor.execute("""
                INSERT INTO orchestration_run_aggregates (
                    run_id, total_tokens_input, total_tokens_output,
                    total_cost_usd, total_kwh, total_water_liters,
                    call_count, unique_models_json, unique_agents_json,
                    project_name, app_name, run_goal,
                    started_at, completed_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    total_tokens_input = excluded.total_tokens_input,
                    total_tokens_output = excluded.total_tokens_output,
                    total_cost_usd = excluded.total_cost_usd,
                    total_kwh = excluded.total_kwh,
                    total_water_liters = excluded.total_water_liters,
                    call_count = excluded.call_count,
                    unique_models_json = excluded.unique_models_json,
                    unique_agents_json = excluded.unique_agents_json,
                    updated_at = excluded.updated_at
            """, (
                run_id,
                aggregates['total_tokens_input'],
                aggregates['total_tokens_output'],
                aggregates['total_cost_usd'],
                aggregates['total_kwh'],
                aggregates['total_water_liters'],
                aggregates['call_count'],
                json.dumps(models),
                json.dumps(agents),
                project_name,
                app_name,
                run_goal,
                started_at,
                completed_at,
                now,
                now
            ))
            conn.commit()
        
        return aggregates
    finally:
        try:
            conn.close()
        except Exception:
            pass


def get_run_summary(
    db_path: pathlib.Path,
    run_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get aggregated metrics summary for a specific run.
    
    Args:
        db_path: Path to SQLite database
        run_id: Orchestration run ID
        
    Returns:
        Dictionary with run metrics or None if not found
    """
    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='orchestration_run_aggregates'"
        )
        if not cursor.fetchone():
            return None
        
        cursor.execute("""
            SELECT * FROM orchestration_run_aggregates
            WHERE run_id = ?
        """, (run_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'run_id': row['run_id'],
            'total_tokens_input': row['total_tokens_input'],
            'total_tokens_output': row['total_tokens_output'],
            'total_tokens': row['total_tokens_input'] + row['total_tokens_output'],
            'total_cost_usd': row['total_cost_usd'],
            'total_kwh': row['total_kwh'],
            'total_water_liters': row['total_water_liters'],
            'call_count': row['call_count'],
            'unique_models': json.loads(row['unique_models_json'] or '[]'),
            'unique_agents': json.loads(row['unique_agents_json'] or '[]'),
            'project_name': row['project_name'],
            'app_name': row['app_name'],
            'run_goal': row['run_goal'],
            'started_at': row['started_at'],
            'completed_at': row['completed_at'],
            'created_at': row['created_at'],
            'updated_at': row['updated_at']
        }
    finally:
        try:
            conn.close()
        except Exception:
            pass
