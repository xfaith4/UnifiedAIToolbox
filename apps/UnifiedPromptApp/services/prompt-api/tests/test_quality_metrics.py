"""
Tests for quality metrics recording and querying.
"""
import pathlib
import sqlite3
import tempfile
from contextlib import closing
from quality_metrics import (
    record_quality_metrics, get_quality_metrics, get_quality_summary,
    get_quality_by_strategy, get_quality_by_model, get_cost_quality_efficiency
)
from cost_metrics import record_call_metrics, aggregate_run_metrics
from migrations import apply_migrations


def create_test_db():
    """Create a test database with migrations applied."""
    db_file = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    db_path = pathlib.Path(db_file.name)
    db_file.close()
    
    apply_migrations(db_path)
    return db_path


def test_record_quality_metrics():
    """Test recording quality metrics for a run."""
    db_path = create_test_db()
    
    try:
        # Record quality metrics
        metric_id = record_quality_metrics(
            db_path=db_path,
            run_id="test-run-001",
            strategy="multi-agent",
            success=True,
            quality_score=0.85,
            notes="Great output quality",
            time_to_result_ms=45000,
            needs_manual_fix=False,
            rating_source="manual"
        )
        
        assert metric_id > 0
        
        # Verify it was stored
        with closing(sqlite3.connect(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM run_quality_metrics WHERE id = ?", (metric_id,))
            row = cursor.fetchone()
            
            assert row is not None
            assert row['run_id'] == "test-run-001"
            assert row['strategy'] == "multi-agent"
            assert row['success'] == 1
            assert row['quality_score'] == 0.85
            assert row['notes'] == "Great output quality"
            assert row['time_to_result_ms'] == 45000
            assert row['needs_manual_fix'] == 0
            assert row['rating_source'] == "manual"
    finally:
        db_path.unlink()


def test_update_quality_metrics():
    """Test updating existing quality metrics."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-002"
        
        # Initial record
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            success=False,
            quality_score=0.5
        )
        
        # Update with better score
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            success=True,
            quality_score=0.9,
            notes="Improved after retry"
        )
        
        # Verify updated
        metrics = get_quality_metrics(db_path, run_id)
        assert metrics is not None
        assert metrics['success'] is True
        assert metrics['quality_score'] == 0.9
        assert metrics['notes'] == "Improved after retry"
    finally:
        db_path.unlink()


def test_get_quality_metrics():
    """Test retrieving quality metrics for a run."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-003"
        
        # Record metrics
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            strategy="single-shot",
            success=True,
            quality_score=0.75,
            needs_manual_fix=True
        )
        
        # Retrieve
        metrics = get_quality_metrics(db_path, run_id)
        
        assert metrics is not None
        assert metrics['run_id'] == run_id
        assert metrics['strategy'] == "single-shot"
        assert metrics['success'] is True
        assert metrics['quality_score'] == 0.75
        assert metrics['needs_manual_fix'] is True
    finally:
        db_path.unlink()


def test_get_quality_metrics_not_found():
    """Test retrieving metrics for non-existent run."""
    db_path = create_test_db()
    
    try:
        metrics = get_quality_metrics(db_path, "non-existent-run")
        assert metrics is None
    finally:
        db_path.unlink()


def test_quality_summary():
    """Test getting quality summary statistics."""
    db_path = create_test_db()
    
    try:
        # Record multiple runs with varying quality
        runs = [
            ("run-001", "multi-agent", True, 0.9, False),
            ("run-002", "multi-agent", True, 0.85, False),
            ("run-003", "single-shot", False, 0.4, True),
            ("run-004", "multi-agent", True, 0.95, False),
            ("run-005", "single-shot", True, 0.7, False),
        ]
        
        for run_id, strategy, success, quality, needs_fix in runs:
            record_quality_metrics(
                db_path=db_path,
                run_id=run_id,
                strategy=strategy,
                success=success,
                quality_score=quality,
                needs_manual_fix=needs_fix
            )
        
        # Get overall summary
        summary = get_quality_summary(db_path)
        
        assert summary['total_runs'] == 5
        assert summary['successful_runs'] == 4
        assert summary['success_rate'] == 0.8  # 4/5
        assert summary['avg_quality_score'] is not None
        assert 0.7 < summary['avg_quality_score'] < 0.8  # Average of all scores
        assert summary['runs_needing_manual_fix'] == 1
    finally:
        db_path.unlink()


def test_quality_summary_with_filters():
    """Test quality summary with strategy filter."""
    db_path = create_test_db()
    
    try:
        # Record runs for different strategies
        record_quality_metrics(db_path, "run-001", strategy="multi-agent", success=True, quality_score=0.9)
        record_quality_metrics(db_path, "run-002", strategy="multi-agent", success=True, quality_score=0.85)
        record_quality_metrics(db_path, "run-003", strategy="single-shot", success=False, quality_score=0.4)
        
        # Get summary for multi-agent only
        summary = get_quality_summary(db_path, strategy="multi-agent")
        
        assert summary['total_runs'] == 2
        assert summary['successful_runs'] == 2
        assert summary['success_rate'] == 1.0
        assert summary['avg_quality_score'] > 0.85
    finally:
        db_path.unlink()


def test_quality_by_strategy():
    """Test getting quality metrics grouped by strategy."""
    db_path = create_test_db()
    
    try:
        # Record runs for different strategies
        runs = [
            ("run-001", "multi-agent", True, 0.9),
            ("run-002", "multi-agent", True, 0.85),
            ("run-003", "multi-agent", False, 0.5),
            ("run-004", "single-shot", True, 0.7),
            ("run-005", "single-shot", False, 0.4),
        ]
        
        for run_id, strategy, success, quality in runs:
            record_quality_metrics(
                db_path=db_path,
                run_id=run_id,
                strategy=strategy,
                success=success,
                quality_score=quality
            )
        
        # Get by strategy
        by_strategy = get_quality_by_strategy(db_path)
        
        assert len(by_strategy) == 2
        
        # Find multi-agent strategy
        multi_agent = next(s for s in by_strategy if s['strategy'] == 'multi-agent')
        assert multi_agent['total_runs'] == 3
        assert multi_agent['successful_runs'] == 2
        assert multi_agent['success_rate'] > 0.6
        
        # Find single-shot strategy
        single_shot = next(s for s in by_strategy if s['strategy'] == 'single-shot')
        assert single_shot['total_runs'] == 2
        assert single_shot['successful_runs'] == 1
    finally:
        db_path.unlink()


def test_cost_quality_efficiency():
    """Test computing cost-quality efficiency metrics."""
    db_path = create_test_db()
    
    try:
        # Record runs with both cost and quality data
        runs = [
            ("run-001", "multi-agent", True, 0.9, 1000, 500),  # High quality, moderate cost
            ("run-002", "multi-agent", True, 0.85, 2000, 1000),  # High quality, high cost
            ("run-003", "single-shot", False, 0.4, 500, 250),  # Low quality, low cost
            ("run-004", "single-shot", True, 0.7, 800, 400),  # Medium quality, low cost
        ]
        
        for run_id, strategy, success, quality, tokens_in, tokens_out in runs:
            # Record cost metrics
            record_call_metrics(
                db_path=db_path,
                model="gpt-4o-mini",
                tokens_input=tokens_in,
                tokens_output=tokens_out,
                run_id=run_id
            )
            aggregate_run_metrics(db_path, run_id, run_goal="Test")
            
            # Record quality metrics
            record_quality_metrics(
                db_path=db_path,
                run_id=run_id,
                strategy=strategy,
                success=success,
                quality_score=quality
            )
        
        # Get efficiency metrics
        efficiency = get_cost_quality_efficiency(db_path, quality_threshold=0.7)
        
        assert efficiency['total_runs'] == 4
        assert efficiency['successful_runs'] == 3
        assert efficiency['high_quality_runs'] >= 2  # Runs with quality >= 0.7
        assert efficiency['total_cost_usd'] > 0
        assert efficiency['cost_per_run'] is not None
        assert efficiency['cost_per_successful_run'] is not None
        assert efficiency['cost_per_high_quality_run'] is not None
        assert efficiency['quality_adjusted_cost_index'] is not None
    finally:
        db_path.unlink()


def test_automated_test_results():
    """Test recording automated test results."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-auto"
        
        # Record automated test result
        record_quality_metrics(
            db_path=db_path,
            run_id=run_id,
            strategy="test-suite",
            success=True,
            quality_score=0.88,
            time_to_result_ms=30000,
            rating_source="automated",
            automated_test_passed=True,
            automated_test_score=0.88
        )
        
        # Verify
        metrics = get_quality_metrics(db_path, run_id)
        assert metrics is not None
        assert metrics['rating_source'] == "automated"
        assert metrics['automated_test_passed'] is True
        assert metrics['automated_test_score'] == 0.88
    finally:
        db_path.unlink()


def test_quality_by_model():
    """Test getting quality metrics grouped by model."""
    db_path = create_test_db()
    
    try:
        # Record runs with different models
        runs = [
            ("run-001", "gpt-4o", True, 0.9),
            ("run-002", "gpt-4o", True, 0.85),
            ("run-003", "gpt-4o-mini", True, 0.75),
            ("run-004", "gpt-4o-mini", False, 0.5),
        ]
        
        for run_id, model, success, quality in runs:
            # Record cost with model
            record_call_metrics(
                db_path=db_path,
                model=model,
                tokens_input=1000,
                tokens_output=500,
                run_id=run_id
            )
            aggregate_run_metrics(db_path, run_id)
            
            # Record quality
            record_quality_metrics(
                db_path=db_path,
                run_id=run_id,
                success=success,
                quality_score=quality
            )
        
        # Get by model
        by_model = get_quality_by_model(db_path)
        
        assert len(by_model) == 2
        
        # Verify gpt-4o has better success rate
        gpt4o = next(m for m in by_model if m['model'] == 'gpt-4o')
        assert gpt4o['total_runs'] == 2
        assert gpt4o['successful_runs'] == 2
        assert gpt4o['success_rate'] == 1.0
    finally:
        db_path.unlink()
