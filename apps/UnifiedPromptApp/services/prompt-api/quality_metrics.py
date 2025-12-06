"""
Quality and outcome tracking for orchestration runs.

Provides functions to record, update, and query per-run quality metrics
including success status, quality scores, human ratings, and automated test results.
"""

import sqlite3
import pathlib
from datetime import datetime
from typing import Optional, Dict, Any, List


def now_iso() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.utcnow().isoformat() + "Z"


def record_quality_metrics(
    db_path: pathlib.Path,
    run_id: str,
    strategy: Optional[str] = None,
    success: bool = False,
    quality_score: Optional[float] = None,
    notes: Optional[str] = None,
    time_to_result_ms: Optional[int] = None,
    needs_manual_fix: bool = False,
    rating_source: str = "manual",
    automated_test_passed: Optional[bool] = None,
    automated_test_score: Optional[float] = None
) -> int:
    """
    Record or update quality metrics for a run.
    
    Args:
        db_path: Path to SQLite database
        run_id: Orchestration run ID
        strategy: Strategy name (e.g., "multi-agent", "single-shot")
        success: Whether the run was successful
        quality_score: Numeric quality score (0.0 to 1.0 recommended)
        notes: Human-readable notes about quality
        time_to_result_ms: Time taken to produce result in milliseconds
        needs_manual_fix: Whether manual intervention was needed
        rating_source: Source of rating ("manual", "automated", "test")
        automated_test_passed: Boolean result from automated test
        automated_test_score: Numeric score from automated test
        
    Returns:
        ID of the quality metrics record
    """
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        if not cursor.fetchone():
            print("Warning: run_quality_metrics table doesn't exist, skipping quality recording")
            return -1
        
        now = now_iso()
        
        cursor.execute("""
            INSERT INTO run_quality_metrics (
                run_id, strategy, success, quality_score, notes,
                time_to_result_ms, needs_manual_fix, rating_source,
                automated_test_passed, automated_test_score,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                strategy = COALESCE(excluded.strategy, strategy),
                success = excluded.success,
                quality_score = COALESCE(excluded.quality_score, quality_score),
                notes = COALESCE(excluded.notes, notes),
                time_to_result_ms = COALESCE(excluded.time_to_result_ms, time_to_result_ms),
                needs_manual_fix = excluded.needs_manual_fix,
                rating_source = excluded.rating_source,
                automated_test_passed = COALESCE(excluded.automated_test_passed, automated_test_passed),
                automated_test_score = COALESCE(excluded.automated_test_score, automated_test_score),
                updated_at = excluded.updated_at
        """, (
            run_id, strategy, 1 if success else 0, quality_score, notes,
            time_to_result_ms, 1 if needs_manual_fix else 0, rating_source,
            1 if automated_test_passed else 0 if automated_test_passed is not None else None,
            automated_test_score, now, now
        ))
        
        conn.commit()
        return cursor.lastrowid


def get_quality_metrics(
    db_path: pathlib.Path,
    run_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get quality metrics for a specific run.
    
    Args:
        db_path: Path to SQLite database
        run_id: Orchestration run ID
        
    Returns:
        Dictionary with quality metrics or None if not found
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        if not cursor.fetchone():
            return None
        
        cursor.execute("""
            SELECT * FROM run_quality_metrics
            WHERE run_id = ?
        """, (run_id,))
        
        row = cursor.fetchone()
        if not row:
            return None
        
        return {
            'run_id': row['run_id'],
            'strategy': row['strategy'],
            'success': bool(row['success']),
            'quality_score': row['quality_score'],
            'notes': row['notes'],
            'time_to_result_ms': row['time_to_result_ms'],
            'needs_manual_fix': bool(row['needs_manual_fix']),
            'rating_source': row['rating_source'],
            'automated_test_passed': bool(row['automated_test_passed']) if row['automated_test_passed'] is not None else None,
            'automated_test_score': row['automated_test_score'],
            'created_at': row['created_at'],
            'updated_at': row['updated_at']
        }


def get_quality_summary(
    db_path: pathlib.Path,
    strategy: Optional[str] = None,
    min_quality_score: Optional[float] = None,
    success_only: bool = False
) -> Dict[str, Any]:
    """
    Get summary statistics for quality metrics.
    
    Args:
        db_path: Path to SQLite database
        strategy: Filter by strategy name
        min_quality_score: Filter by minimum quality score
        success_only: Only include successful runs
        
    Returns:
        Dictionary with summary statistics
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        if not cursor.fetchone():
            return {
                'total_runs': 0,
                'successful_runs': 0,
                'success_rate': 0.0,
                'avg_quality_score': None,
                'runs_needing_manual_fix': 0,
                'avg_time_to_result_ms': None
            }
        
        # Build WHERE clause
        where_clauses = []
        params = []
        
        if strategy:
            where_clauses.append("strategy = ?")
            params.append(strategy)
        
        if min_quality_score is not None:
            where_clauses.append("quality_score >= ?")
            params.append(min_quality_score)
        
        if success_only:
            where_clauses.append("success = 1")
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Get summary statistics
        cursor.execute(f"""
            SELECT
                COUNT(*) as total_runs,
                SUM(success) as successful_runs,
                AVG(CASE WHEN quality_score IS NOT NULL THEN quality_score END) as avg_quality,
                SUM(needs_manual_fix) as manual_fix_count,
                AVG(CASE WHEN time_to_result_ms IS NOT NULL THEN time_to_result_ms END) as avg_time
            FROM run_quality_metrics
            WHERE {where_sql}
        """, params)
        
        row = cursor.fetchone()
        
        total = row['total_runs'] or 0
        successful = row['successful_runs'] or 0
        
        return {
            'total_runs': total,
            'successful_runs': successful,
            'success_rate': round(successful / total, 4) if total > 0 else 0.0,
            'avg_quality_score': round(row['avg_quality'], 4) if row['avg_quality'] is not None else None,
            'runs_needing_manual_fix': row['manual_fix_count'] or 0,
            'avg_time_to_result_ms': round(row['avg_time']) if row['avg_time'] is not None else None
        }


def get_quality_by_strategy(
    db_path: pathlib.Path
) -> List[Dict[str, Any]]:
    """
    Get quality metrics grouped by strategy.
    
    Args:
        db_path: Path to SQLite database
        
    Returns:
        List of dictionaries with per-strategy metrics
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics'"
        )
        if not cursor.fetchone():
            return []
        
        cursor.execute("""
            SELECT
                strategy,
                COUNT(*) as total_runs,
                SUM(success) as successful_runs,
                AVG(CASE WHEN quality_score IS NOT NULL THEN quality_score END) as avg_quality,
                MIN(quality_score) as min_quality,
                MAX(quality_score) as max_quality,
                SUM(needs_manual_fix) as manual_fix_count,
                AVG(CASE WHEN time_to_result_ms IS NOT NULL THEN time_to_result_ms END) as avg_time
            FROM run_quality_metrics
            WHERE strategy IS NOT NULL
            GROUP BY strategy
            ORDER BY successful_runs DESC, avg_quality DESC
        """)
        
        results = []
        for row in cursor.fetchall():
            total = row['total_runs'] or 0
            successful = row['successful_runs'] or 0
            
            results.append({
                'strategy': row['strategy'],
                'total_runs': total,
                'successful_runs': successful,
                'success_rate': round(successful / total, 4) if total > 0 else 0.0,
                'avg_quality_score': round(row['avg_quality'], 4) if row['avg_quality'] is not None else None,
                'min_quality_score': round(row['min_quality'], 4) if row['min_quality'] is not None else None,
                'max_quality_score': round(row['max_quality'], 4) if row['max_quality'] is not None else None,
                'runs_needing_manual_fix': row['manual_fix_count'] or 0,
                'avg_time_to_result_ms': round(row['avg_time']) if row['avg_time'] is not None else None
            })
        
        return results


def get_quality_by_model(
    db_path: pathlib.Path
) -> List[Dict[str, Any]]:
    """
    Get quality metrics grouped by model (joins with cost metrics).
    
    Args:
        db_path: Path to SQLite database
        
    Returns:
        List of dictionaries with per-model quality metrics
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if tables exist
        cursor.execute("""
            SELECT name FROM sqlite_master WHERE type='table' 
            AND name IN ('run_quality_metrics', 'orchestration_run_aggregates')
        """)
        existing_tables = {row[0] for row in cursor.fetchall()}
        
        if 'run_quality_metrics' not in existing_tables or 'orchestration_run_aggregates' not in existing_tables:
            return []
        
        cursor.execute("""
            SELECT
                json_each.value as model,
                COUNT(DISTINCT q.run_id) as total_runs,
                SUM(q.success) as successful_runs,
                AVG(CASE WHEN q.quality_score IS NOT NULL THEN q.quality_score END) as avg_quality
            FROM run_quality_metrics q
            JOIN orchestration_run_aggregates a ON q.run_id = a.run_id
            JOIN json_each(a.unique_models_json) 
            GROUP BY json_each.value
            ORDER BY successful_runs DESC, avg_quality DESC
        """)
        
        results = []
        for row in cursor.fetchall():
            total = row['total_runs'] or 0
            successful = row['successful_runs'] or 0
            
            results.append({
                'model': row['model'],
                'total_runs': total,
                'successful_runs': successful,
                'success_rate': round(successful / total, 4) if total > 0 else 0.0,
                'avg_quality_score': round(row['avg_quality'], 4) if row['avg_quality'] is not None else None
            })
        
        return results


def get_cost_quality_efficiency(
    db_path: pathlib.Path,
    quality_threshold: float = 0.7
) -> Dict[str, Any]:
    """
    Calculate cost efficiency metrics based on quality.
    
    Computes:
    - Cost per successful run
    - Cost per high-quality run (quality >= threshold)
    - Quality-adjusted cost index
    
    Args:
        db_path: Path to SQLite database
        quality_threshold: Minimum quality score to be considered "high-quality"
        
    Returns:
        Dictionary with efficiency metrics
    """
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Check if tables exist
        cursor.execute("""
            SELECT name FROM sqlite_master WHERE type='table' 
            AND name IN ('run_quality_metrics', 'orchestration_run_aggregates')
        """)
        existing_tables = {row[0] for row in cursor.fetchall()}
        
        if 'run_quality_metrics' not in existing_tables or 'orchestration_run_aggregates' not in existing_tables:
            return {
                'total_cost_usd': 0.0,
                'total_runs': 0,
                'successful_runs': 0,
                'high_quality_runs': 0,
                'cost_per_run': None,
                'cost_per_successful_run': None,
                'cost_per_high_quality_run': None,
                'quality_adjusted_cost_index': None
            }
        
        # Get overall metrics
        cursor.execute("""
            SELECT
                COUNT(*) as total_runs,
                SUM(q.success) as successful_runs,
                SUM(CASE WHEN q.quality_score >= ? THEN 1 ELSE 0 END) as high_quality_runs,
                SUM(a.total_cost_usd) as total_cost,
                SUM(CASE WHEN q.success = 1 THEN a.total_cost_usd ELSE 0 END) as cost_of_successful,
                SUM(CASE WHEN q.quality_score >= ? THEN a.total_cost_usd ELSE 0 END) as cost_of_high_quality,
                AVG(q.quality_score) as avg_quality
            FROM run_quality_metrics q
            JOIN orchestration_run_aggregates a ON q.run_id = a.run_id
        """, (quality_threshold, quality_threshold))
        
        row = cursor.fetchone()
        
        total_runs = row['total_runs'] or 0
        successful_runs = row['successful_runs'] or 0
        high_quality_runs = row['high_quality_runs'] or 0
        total_cost = row['total_cost'] or 0.0
        cost_of_successful = row['cost_of_successful'] or 0.0
        cost_of_high_quality = row['cost_of_high_quality'] or 0.0
        avg_quality = row['avg_quality'] or 0.0
        
        # Calculate efficiency metrics
        cost_per_run = total_cost / total_runs if total_runs > 0 else None
        cost_per_successful = cost_of_successful / successful_runs if successful_runs > 0 else None
        cost_per_high_quality = cost_of_high_quality / high_quality_runs if high_quality_runs > 0 else None
        
        # Quality-adjusted cost index: cost / (quality * success_rate)
        # Lower is better. A run that costs less and has higher quality/success will have lower index
        success_rate = successful_runs / total_runs if total_runs > 0 else 0
        quality_adjusted_index = None
        if avg_quality > 0 and success_rate > 0:
            quality_adjusted_index = round(total_cost / (avg_quality * success_rate), 2)
        
        return {
            'total_cost_usd': round(total_cost, 6),
            'total_runs': total_runs,
            'successful_runs': successful_runs,
            'high_quality_runs': high_quality_runs,
            'quality_threshold': quality_threshold,
            'cost_per_run': round(cost_per_run, 6) if cost_per_run is not None else None,
            'cost_per_successful_run': round(cost_per_successful, 6) if cost_per_successful is not None else None,
            'cost_per_high_quality_run': round(cost_per_high_quality, 6) if cost_per_high_quality is not None else None,
            'quality_adjusted_cost_index': quality_adjusted_index,
            'avg_quality_score': round(avg_quality, 4) if avg_quality > 0 else None
        }
