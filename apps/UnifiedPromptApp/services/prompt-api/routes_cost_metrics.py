"""
Cost and environmental impact analytics API endpoints.

Provides endpoints for querying cost, energy, and water usage metrics
across orchestration runs, models, and agents.
"""

import sqlite3
import json
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from fastapi import Query, HTTPException, Header
from pydantic import BaseModel, Field


class MetricsSummaryResponse(BaseModel):
    """Summary metrics for a time period."""
    total_cost_usd: float
    total_kwh: float
    total_water_liters: float
    total_tokens: int
    call_count: int
    run_count: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    top_models: List[Dict[str, Any]] = Field(default_factory=list)
    top_agents: List[Dict[str, Any]] = Field(default_factory=list)
    daily_timeseries: List[Dict[str, Any]] = Field(default_factory=list)
    # Quality-based cost metrics
    cost_per_successful_run: Optional[float] = None
    cost_per_high_quality_run: Optional[float] = None
    quality_adjusted_cost_index: Optional[float] = None


class RunMetricsResponse(BaseModel):
    """Metrics for orchestration runs."""
    runs: List[Dict[str, Any]]
    total_count: int
    page: int
    per_page: int


class ModelMetricsResponse(BaseModel):
    """Aggregated metrics by model."""
    models: List[Dict[str, Any]]


class PrometheusMetrics(BaseModel):
    """Prometheus-format metrics."""
    metrics_text: str


def get_metrics_summary(
    db_path,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    project: Optional[str] = None,
    app: Optional[str] = None,
    admin_token: Optional[str] = None,
    settings = None
) -> MetricsSummaryResponse:
    """
    Get summary metrics for a time period.
    
    Args:
        db_path: Path to database
        start_date: Start date filter (ISO format)
        end_date: End date filter (ISO format)
        project: Project name filter
        app: App name filter
        admin_token: Admin authentication token
        settings: Settings object for admin token validation
        
    Returns:
        MetricsSummaryResponse with aggregated metrics
    """
    # Validate admin token if configured
    if settings and settings.admin_token and admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin token required")
    
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if tables exist
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='orchestration_cost_metrics'"
        )
        if not cursor.fetchone():
            return MetricsSummaryResponse(
                total_cost_usd=0.0,
                total_kwh=0.0,
                total_water_liters=0.0,
                total_tokens=0,
                call_count=0,
                run_count=0,
                start_date=start_date,
                end_date=end_date
            )
        
        # Build WHERE clause for filters
        where_clauses = []
        params = []
        
        if start_date:
            where_clauses.append("timestamp >= ?")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("timestamp <= ?")
            params.append(end_date)
        
        if project:
            where_clauses.append("project_name = ?")
            params.append(project)
        
        if app:
            where_clauses.append("app_name = ?")
            params.append(app)
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Get overall summary
        cursor.execute(f"""
            SELECT
                COUNT(*) as call_count,
                COUNT(DISTINCT run_id) as run_count,
                SUM(tokens_input + tokens_output) as total_tokens,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water
            FROM orchestration_cost_metrics
            WHERE {where_sql}
        """, params)
        
        row = cursor.fetchone()
        summary = {
            'call_count': row['call_count'] or 0,
            'run_count': row['run_count'] or 0,
            'total_tokens': row['total_tokens'] or 0,
            'total_cost_usd': round(row['total_cost'] or 0.0, 6),
            'total_kwh': round(row['total_kwh'] or 0.0, 6),
            'total_water_liters': round(row['total_water'] or 0.0, 6)
        }
        
        # Top models by cost
        cursor.execute(f"""
            SELECT
                model_name,
                COUNT(*) as call_count,
                SUM(tokens_input + tokens_output) as total_tokens,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water
            FROM orchestration_cost_metrics
            WHERE {where_sql}
            GROUP BY model_name
            ORDER BY total_cost DESC
            LIMIT 10
        """, params)
        
        top_models = []
        for row in cursor.fetchall():
            top_models.append({
                'model': row['model_name'],
                'call_count': row['call_count'],
                'total_tokens': row['total_tokens'] or 0,
                'total_cost_usd': round(row['total_cost'] or 0.0, 6),
                'total_kwh': round(row['total_kwh'] or 0.0, 6),
                'total_water_liters': round(row['total_water'] or 0.0, 6)
            })
        
        # Top agents by cost (excluding nulls)
        cursor.execute(f"""
            SELECT
                agent_name,
                COUNT(*) as call_count,
                SUM(tokens_input + tokens_output) as total_tokens,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water
            FROM orchestration_cost_metrics
            WHERE {where_sql} AND agent_name IS NOT NULL
            GROUP BY agent_name
            ORDER BY total_cost DESC
            LIMIT 10
        """, params)
        
        top_agents = []
        for row in cursor.fetchall():
            top_agents.append({
                'agent': row['agent_name'],
                'call_count': row['call_count'],
                'total_tokens': row['total_tokens'] or 0,
                'total_cost_usd': round(row['total_cost'] or 0.0, 6),
                'total_kwh': round(row['total_kwh'] or 0.0, 6),
                'total_water_liters': round(row['total_water'] or 0.0, 6)
            })
        
        # Daily timeseries
        cursor.execute(f"""
            SELECT
                DATE(timestamp) as date,
                COUNT(*) as call_count,
                SUM(tokens_input + tokens_output) as total_tokens,
                SUM(cost_usd) as cost,
                SUM(kwh_estimated) as kwh,
                SUM(water_liters_estimated) as water
            FROM orchestration_cost_metrics
            WHERE {where_sql}
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
            LIMIT 90
        """, params)
        
        daily = []
        for row in cursor.fetchall():
            daily.append({
                'date': row['date'],
                'call_count': row['call_count'],
                'total_tokens': row['total_tokens'] or 0,
                'cost_usd': round(row['cost'] or 0.0, 6),
                'kwh': round(row['kwh'] or 0.0, 6),
                'water_liters': round(row['water'] or 0.0, 6)
            })
        
        # Reverse to get chronological order
        daily.reverse()
        
        # Get quality-based cost metrics if quality table exists
        cost_per_successful = None
        cost_per_high_quality = None
        quality_adjusted_index = None
        
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        if cursor.fetchone():
            # Calculate quality-based cost efficiency
            cursor.execute(f"""
                SELECT
                    SUM(CASE WHEN q.success = 1 THEN a.total_cost_usd ELSE 0 END) as cost_of_successful,
                    SUM(CASE WHEN q.success = 1 THEN 1 ELSE 0 END) as successful_runs,
                    SUM(CASE WHEN q.quality_score >= 0.7 THEN a.total_cost_usd ELSE 0 END) as cost_of_high_quality,
                    SUM(CASE WHEN q.quality_score >= 0.7 THEN 1 ELSE 0 END) as high_quality_runs,
                    AVG(q.quality_score) as avg_quality,
                    COUNT(*) as total_quality_runs
                FROM orchestration_cost_metrics m
                LEFT JOIN orchestration_run_aggregates a ON m.run_id = a.run_id
                LEFT JOIN run_quality_metrics q ON m.run_id = q.run_id
                WHERE {where_sql} AND q.run_id IS NOT NULL
            """, params)
            
            quality_row = cursor.fetchone()
            if quality_row:
                successful_runs = quality_row['successful_runs'] or 0
                high_quality_runs = quality_row['high_quality_runs'] or 0
                total_quality_runs = quality_row['total_quality_runs'] or 0
                avg_quality = quality_row['avg_quality'] or 0
                
                if successful_runs > 0:
                    cost_per_successful = round(quality_row['cost_of_successful'] / successful_runs, 6)
                
                if high_quality_runs > 0:
                    cost_per_high_quality = round(quality_row['cost_of_high_quality'] / high_quality_runs, 6)
                
                # Quality-adjusted cost index: total_cost / (avg_quality * success_rate)
                if avg_quality > 0 and total_quality_runs > 0:
                    success_rate = successful_runs / total_quality_runs
                    if success_rate > 0:
                        quality_adjusted_index = round(summary['total_cost_usd'] / (avg_quality * success_rate), 2)
        
        return MetricsSummaryResponse(
            total_cost_usd=summary['total_cost_usd'],
            total_kwh=summary['total_kwh'],
            total_water_liters=summary['total_water_liters'],
            total_tokens=summary['total_tokens'],
            call_count=summary['call_count'],
            run_count=summary['run_count'],
            start_date=start_date,
            end_date=end_date,
            top_models=top_models,
            top_agents=top_agents,
            daily_timeseries=daily,
            cost_per_successful_run=cost_per_successful,
            cost_per_high_quality_run=cost_per_high_quality,
            quality_adjusted_cost_index=quality_adjusted_index
        )


def get_runs_metrics(
    db_path,
    page: int = 1,
    per_page: int = 20,
    model: Optional[str] = None,
    agent: Optional[str] = None,
    app: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin_token: Optional[str] = None,
    settings = None
) -> RunMetricsResponse:
    """
    Get paginated list of runs with metrics.
    
    Args:
        db_path: Path to database
        page: Page number (1-indexed)
        per_page: Items per page
        model: Filter by model name
        agent: Filter by agent name
        app: Filter by app name
        start_date: Start date filter
        end_date: End date filter
        admin_token: Admin authentication token
        settings: Settings object
        
    Returns:
        RunMetricsResponse with paginated runs
    """
    if settings and settings.admin_token and admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin token required")
    
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='orchestration_run_aggregates'"
        )
        if not cursor.fetchone():
            return RunMetricsResponse(runs=[], total_count=0, page=page, per_page=per_page)
        
        # Build filters
        where_clauses = []
        params = []
        
        if start_date:
            where_clauses.append("created_at >= ?")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("created_at <= ?")
            params.append(end_date)
        
        if app:
            where_clauses.append("app_name = ?")
            params.append(app)
        
        # For model/agent filters, check if value exists in JSON array
        # Using json_each for safer JSON array querying
        if model:
            where_clauses.append("""
                EXISTS (
                    SELECT 1 FROM json_each(unique_models_json)
                    WHERE json_each.value = ?
                )
            """)
            params.append(model)
        
        if agent:
            where_clauses.append("""
                EXISTS (
                    SELECT 1 FROM json_each(unique_agents_json)
                    WHERE json_each.value = ?
                )
            """)
            params.append(agent)
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Get total count
        cursor.execute(f"""
            SELECT COUNT(*) as count
            FROM orchestration_run_aggregates
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()['count']
        
        # Get paginated results with optional quality data
        offset = (page - 1) * per_page
        
        # Check if quality table exists to join
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        has_quality_table = cursor.fetchone() is not None
        
        if has_quality_table:
            cursor.execute(f"""
                SELECT
                    a.*,
                    q.success as quality_success,
                    q.quality_score,
                    q.strategy,
                    q.needs_manual_fix
                FROM orchestration_run_aggregates a
                LEFT JOIN run_quality_metrics q ON a.run_id = q.run_id
                WHERE {where_sql}
                ORDER BY a.created_at DESC
                LIMIT ? OFFSET ?
            """, params + [per_page, offset])
        else:
            cursor.execute(f"""
                SELECT *
                FROM orchestration_run_aggregates
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """, params + [per_page, offset])
        
        runs = []
        for row in cursor.fetchall():
            run_data = {
                'run_id': row['run_id'],
                'run_goal': row['run_goal'],
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
                'started_at': row['started_at'],
                'completed_at': row['completed_at'],
                'created_at': row['created_at']
            }
            
            # Add quality data if available
            if has_quality_table:
                run_data['quality_success'] = bool(row['quality_success']) if row['quality_success'] is not None else None
                run_data['quality_score'] = row['quality_score']
                run_data['strategy'] = row['strategy']
                run_data['needs_manual_fix'] = bool(row['needs_manual_fix']) if row['needs_manual_fix'] is not None else None
                
                # Compute cost efficiency if quality score exists
                if row['quality_score'] and row['quality_score'] > 0:
                    run_data['cost_efficiency'] = round(row['total_cost_usd'] / row['quality_score'], 6)
                else:
                    run_data['cost_efficiency'] = None
            
            runs.append(run_data)
        
        return RunMetricsResponse(
            runs=runs,
            total_count=total_count,
            page=page,
            per_page=per_page
        )


def get_models_metrics(
    db_path,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin_token: Optional[str] = None,
    settings = None
) -> ModelMetricsResponse:
    """
    Get aggregated metrics by model.
    
    Args:
        db_path: Path to database
        start_date: Start date filter
        end_date: End date filter
        admin_token: Admin authentication token
        settings: Settings object
        
    Returns:
        ModelMetricsResponse with per-model aggregates
    """
    if settings and settings.admin_token and admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin token required")
    
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='orchestration_cost_metrics'"
        )
        if not cursor.fetchone():
            return ModelMetricsResponse(models=[])
        
        # Build filters
        where_clauses = []
        params = []
        
        if start_date:
            where_clauses.append("timestamp >= ?")
            params.append(start_date)
        
        if end_date:
            where_clauses.append("timestamp <= ?")
            params.append(end_date)
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Aggregate by model
        cursor.execute(f"""
            SELECT
                model_name,
                COUNT(*) as call_count,
                COUNT(DISTINCT run_id) as run_count,
                SUM(tokens_input) as total_input,
                SUM(tokens_output) as total_output,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water,
                AVG(cost_usd) as avg_cost_per_call
            FROM orchestration_cost_metrics
            WHERE {where_sql}
            GROUP BY model_name
            ORDER BY total_cost DESC
        """, params)
        
        models = []
        for row in cursor.fetchall():
            models.append({
                'model': row['model_name'],
                'call_count': row['call_count'],
                'run_count': row['run_count'],
                'total_tokens_input': row['total_input'] or 0,
                'total_tokens_output': row['total_output'] or 0,
                'total_tokens': (row['total_input'] or 0) + (row['total_output'] or 0),
                'total_cost_usd': round(row['total_cost'] or 0.0, 6),
                'total_kwh': round(row['total_kwh'] or 0.0, 6),
                'total_water_liters': round(row['total_water'] or 0.0, 6),
                'avg_cost_per_call': round(row['avg_cost_per_call'] or 0.0, 6)
            })
        
        return ModelMetricsResponse(models=models)


def get_prometheus_metrics(db_path) -> str:
    """
    Generate Prometheus-compatible metrics text.
    
    Args:
        db_path: Path to database
        
    Returns:
        Prometheus metrics text format
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='orchestration_cost_metrics'"
        )
        if not cursor.fetchone():
            return "# No metrics available\n"
        
        # Get aggregates by model
        cursor.execute("""
            SELECT
                model_name,
                SUM(cost_usd) as total_cost,
                SUM(kwh_estimated) as total_kwh,
                SUM(water_liters_estimated) as total_water,
                SUM(tokens_input + tokens_output) as total_tokens
            FROM orchestration_cost_metrics
            GROUP BY model_name
        """)
        
        lines = []
        lines.append("# HELP unified_ai_cost_usd_total Total AI API cost in USD by model")
        lines.append("# TYPE unified_ai_cost_usd_total counter")
        
        for row in cursor.fetchall():
            model = row['model_name']
            lines.append(f'unified_ai_cost_usd_total{{model="{model}"}} {row["total_cost"] or 0.0}')
        
        lines.append("\n# HELP unified_ai_energy_kwh_total Total energy consumption in kWh by model")
        lines.append("# TYPE unified_ai_energy_kwh_total counter")
        
        cursor.execute("""
            SELECT
                model_name,
                SUM(kwh_estimated) as total_kwh
            FROM orchestration_cost_metrics
            GROUP BY model_name
        """)
        
        for row in cursor.fetchall():
            model = row['model_name']
            lines.append(f'unified_ai_energy_kwh_total{{model="{model}"}} {row["total_kwh"] or 0.0}')
        
        lines.append("\n# HELP unified_ai_water_liters_total Total water usage in liters by model")
        lines.append("# TYPE unified_ai_water_liters_total counter")
        
        cursor.execute("""
            SELECT
                model_name,
                SUM(water_liters_estimated) as total_water
            FROM orchestration_cost_metrics
            GROUP BY model_name
        """)
        
        for row in cursor.fetchall():
            model = row['model_name']
            lines.append(f'unified_ai_water_liters_total{{model="{model}"}} {row["total_water"] or 0.0}')
        
        lines.append("\n# HELP unified_ai_tokens_total Total tokens processed by model")
        lines.append("# TYPE unified_ai_tokens_total counter")
        
        cursor.execute("""
            SELECT
                model_name,
                SUM(tokens_input + tokens_output) as total_tokens
            FROM orchestration_cost_metrics
            GROUP BY model_name
        """)
        
        for row in cursor.fetchall():
            model = row['model_name']
            lines.append(f'unified_ai_tokens_total{{model="{model}"}} {row["total_tokens"] or 0}')
        
        return "\n".join(lines) + "\n"
