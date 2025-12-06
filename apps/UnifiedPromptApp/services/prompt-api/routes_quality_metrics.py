"""
Quality and outcome tracking API endpoints.

Provides endpoints for recording and querying quality metrics,
including human ratings, automated test results, and efficiency calculations.
"""

import sqlite3
from typing import Optional, List, Dict, Any
from fastapi import HTTPException
from pydantic import BaseModel, Field


class QualityRatingRequest(BaseModel):
    """Request to record a human quality rating."""
    success: bool = Field(description="Whether the run was successful")
    quality_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Quality score (0.0 to 1.0)")
    notes: Optional[str] = Field(None, description="Human-readable notes")
    strategy: Optional[str] = Field(None, description="Strategy used")
    needs_manual_fix: bool = Field(False, description="Whether manual intervention was needed")


class AutomatedTestRequest(BaseModel):
    """Request to record automated test results."""
    success: bool = Field(description="Whether the test passed")
    test_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Test score (0.0 to 1.0)")
    strategy: Optional[str] = Field(None, description="Strategy used")
    time_to_result_ms: Optional[int] = Field(None, description="Time taken in milliseconds")


class QualityMetricsResponse(BaseModel):
    """Response with quality metrics for a run."""
    run_id: str
    strategy: Optional[str] = None
    success: bool
    quality_score: Optional[float] = None
    notes: Optional[str] = None
    time_to_result_ms: Optional[int] = None
    needs_manual_fix: bool
    rating_source: str
    automated_test_passed: Optional[bool] = None
    automated_test_score: Optional[float] = None
    created_at: str
    updated_at: str


class QualitySummaryResponse(BaseModel):
    """Summary of quality metrics."""
    total_runs: int
    successful_runs: int
    success_rate: float
    avg_quality_score: Optional[float] = None
    runs_needing_manual_fix: int
    avg_time_to_result_ms: Optional[int] = None
    by_strategy: List[Dict[str, Any]] = Field(default_factory=list)
    by_model: List[Dict[str, Any]] = Field(default_factory=list)


class CostQualityEfficiencyResponse(BaseModel):
    """Cost efficiency metrics based on quality."""
    total_cost_usd: float
    total_runs: int
    successful_runs: int
    high_quality_runs: int
    quality_threshold: float
    cost_per_run: Optional[float] = None
    cost_per_successful_run: Optional[float] = None
    cost_per_high_quality_run: Optional[float] = None
    quality_adjusted_cost_index: Optional[float] = None
    avg_quality_score: Optional[float] = None


class RunWithQualityResponse(BaseModel):
    """Extended run metrics with quality data."""
    run_id: str
    run_goal: Optional[str] = None
    total_cost_usd: float
    total_kwh: float
    total_water_liters: float
    # Quality fields
    success: Optional[bool] = None
    quality_score: Optional[float] = None
    strategy: Optional[str] = None
    needs_manual_fix: Optional[bool] = None
    time_to_result_ms: Optional[int] = None
    # Computed efficiency
    cost_efficiency: Optional[float] = None  # cost / quality if quality > 0


def record_quality_rating(
    db_path,
    run_id: str,
    rating: QualityRatingRequest,
    admin_token: Optional[str] = None,
    settings = None
) -> Dict[str, str]:
    """
    Record a human quality rating for a run.
    
    Args:
        db_path: Path to database
        run_id: Run identifier
        rating: Quality rating data
        admin_token: Admin authentication token
        settings: Settings object
        
    Returns:
        Success message
    """
    # Validate admin token if configured
    if settings and settings.admin_token and admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin token required")
    
    from quality_metrics import record_quality_metrics
    
    try:
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            strategy=rating.strategy,
            success=rating.success,
            quality_score=rating.quality_score,
            notes=rating.notes,
            needs_manual_fix=rating.needs_manual_fix,
            rating_source="manual"
        )
        
        return {"status": "success", "message": f"Quality rating recorded for run {run_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record quality rating: {str(e)}")


def record_automated_test(
    db_path,
    run_id: str,
    test_result: AutomatedTestRequest,
    admin_token: Optional[str] = None,
    settings = None
) -> Dict[str, str]:
    """
    Record automated test results for a run.
    
    Args:
        db_path: Path to database
        run_id: Run identifier
        test_result: Test result data
        admin_token: Admin authentication token
        settings: Settings object
        
    Returns:
        Success message
    """
    # Validate admin token if configured
    if settings and settings.admin_token and admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin token required")
    
    from quality_metrics import record_quality_metrics
    
    try:
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            strategy=test_result.strategy,
            success=test_result.success,
            quality_score=test_result.test_score,
            time_to_result_ms=test_result.time_to_result_ms,
            rating_source="automated",
            automated_test_passed=test_result.success,
            automated_test_score=test_result.test_score
        )
        
        return {"status": "success", "message": f"Automated test result recorded for run {run_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to record test result: {str(e)}")


def get_run_quality(
    db_path,
    run_id: str
) -> Optional[QualityMetricsResponse]:
    """
    Get quality metrics for a specific run.
    
    Args:
        db_path: Path to database
        run_id: Run identifier
        
    Returns:
        Quality metrics or None if not found
    """
    from quality_metrics import get_quality_metrics
    
    metrics = get_quality_metrics(db_path, run_id)
    if not metrics:
        return None
    
    return QualityMetricsResponse(**metrics)


def get_quality_summary(
    db_path,
    strategy: Optional[str] = None,
    min_quality_score: Optional[float] = None,
    success_only: bool = False
) -> QualitySummaryResponse:
    """
    Get summary of quality metrics.
    
    Args:
        db_path: Path to database
        strategy: Filter by strategy
        min_quality_score: Minimum quality score
        success_only: Only include successful runs
        
    Returns:
        Quality summary statistics
    """
    from quality_metrics import (
        get_quality_summary as get_summary,
        get_quality_by_strategy,
        get_quality_by_model
    )
    
    summary = get_summary(db_path, strategy, min_quality_score, success_only)
    by_strategy = get_quality_by_strategy(db_path)
    by_model = get_quality_by_model(db_path)
    
    return QualitySummaryResponse(
        total_runs=summary['total_runs'],
        successful_runs=summary['successful_runs'],
        success_rate=summary['success_rate'],
        avg_quality_score=summary['avg_quality_score'],
        runs_needing_manual_fix=summary['runs_needing_manual_fix'],
        avg_time_to_result_ms=summary['avg_time_to_result_ms'],
        by_strategy=by_strategy,
        by_model=by_model
    )


def get_cost_quality_efficiency(
    db_path,
    quality_threshold: float = 0.7
) -> CostQualityEfficiencyResponse:
    """
    Get cost efficiency metrics based on quality.
    
    Args:
        db_path: Path to database
        quality_threshold: Minimum score for "high-quality"
        
    Returns:
        Cost-quality efficiency metrics
    """
    from quality_metrics import get_cost_quality_efficiency as get_efficiency
    
    metrics = get_efficiency(db_path, quality_threshold)
    
    return CostQualityEfficiencyResponse(**metrics)


def get_runs_with_quality(
    db_path,
    page: int = 1,
    per_page: int = 20,
    strategy: Optional[str] = None,
    min_quality: Optional[float] = None,
    success_only: bool = False
) -> Dict[str, Any]:
    """
    Get runs with both cost and quality metrics.
    
    Args:
        db_path: Path to database
        page: Page number
        per_page: Items per page
        strategy: Filter by strategy
        min_quality: Minimum quality score
        success_only: Only successful runs
        
    Returns:
        Paginated runs with quality and cost data
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
                'runs': [],
                'total_count': 0,
                'page': page,
                'per_page': per_page
            }
        
        # Build filters
        where_clauses = []
        params = []
        
        if strategy:
            where_clauses.append("q.strategy = ?")
            params.append(strategy)
        
        if min_quality is not None:
            where_clauses.append("q.quality_score >= ?")
            params.append(min_quality)
        
        if success_only:
            where_clauses.append("q.success = 1")
        
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Get total count
        cursor.execute(f"""
            SELECT COUNT(*) as count
            FROM run_quality_metrics q
            JOIN orchestration_run_aggregates a ON q.run_id = a.run_id
            WHERE {where_sql}
        """, params)
        total_count = cursor.fetchone()['count']
        
        # Get paginated results
        offset = (page - 1) * per_page
        cursor.execute(f"""
            SELECT
                q.run_id,
                q.strategy,
                q.success,
                q.quality_score,
                q.needs_manual_fix,
                q.time_to_result_ms,
                a.run_goal,
                a.total_cost_usd,
                a.total_kwh,
                a.total_water_liters,
                a.created_at
            FROM run_quality_metrics q
            JOIN orchestration_run_aggregates a ON q.run_id = a.run_id
            WHERE {where_sql}
            ORDER BY a.created_at DESC
            LIMIT ? OFFSET ?
        """, params + [per_page, offset])
        
        runs = []
        for row in cursor.fetchall():
            quality_score = row['quality_score']
            cost = row['total_cost_usd']
            
            # Calculate cost efficiency (lower is better)
            # Only compute if quality score is meaningful (>= 0.1 to avoid extreme values)
            cost_efficiency = None
            if quality_score and quality_score >= 0.1:
                cost_efficiency = round(cost / quality_score, 6)
            
            runs.append({
                'run_id': row['run_id'],
                'run_goal': row['run_goal'],
                'strategy': row['strategy'],
                'success': bool(row['success']),
                'quality_score': quality_score,
                'needs_manual_fix': bool(row['needs_manual_fix']),
                'time_to_result_ms': row['time_to_result_ms'],
                'total_cost_usd': cost,
                'total_kwh': row['total_kwh'],
                'total_water_liters': row['total_water_liters'],
                'cost_efficiency': cost_efficiency,
                'created_at': row['created_at']
            })
        
        return {
            'runs': runs,
            'total_count': total_count,
            'page': page,
            'per_page': per_page
        }
