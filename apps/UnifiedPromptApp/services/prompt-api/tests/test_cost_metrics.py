"""
Tests for cost metrics recording and aggregation.
"""
import pathlib
import sqlite3
import tempfile
from cost_metrics import record_call_metrics, aggregate_run_metrics, get_run_summary
from migrations import apply_migrations


def create_test_db():
    """Create a test database with migrations applied."""
    db_file = tempfile.NamedTemporaryFile(delete=False, suffix='.db')
    db_path = pathlib.Path(db_file.name)
    db_file.close()
    
    apply_migrations(db_path)
    return db_path


def test_record_call_metrics():
    """Test recording individual call metrics."""
    db_path = create_test_db()
    
    try:
        # Record a metric
        metric_id = record_call_metrics(
            db_path=db_path,
            model="gpt-4o-mini",
            tokens_input=1000,
            tokens_output=500,
            run_id="test-run-123",
            agent_name="TestAgent",
            project_name="TestProject"
        )
        
        assert metric_id > 0
        
        # Verify it was stored
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM orchestration_cost_metrics WHERE id = ?", (metric_id,))
            row = cursor.fetchone()
            
            assert row is not None
            assert row['model_name'] == "gpt-4o-mini"
            assert row['tokens_input'] == 1000
            assert row['tokens_output'] == 500
            assert row['run_id'] == "test-run-123"
            assert row['agent_name'] == "TestAgent"
            assert row['cost_usd'] > 0
            assert row['kwh_estimated'] > 0
            assert row['water_liters_estimated'] > 0
    finally:
        db_path.unlink()


def test_record_multiple_calls():
    """Test recording multiple calls for the same run."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-multi"
        
        # Record multiple calls
        record_call_metrics(db_path, "gpt-4o-mini", 1000, 500, run_id=run_id, agent_name="Agent1")
        record_call_metrics(db_path, "gpt-4o-mini", 2000, 1000, run_id=run_id, agent_name="Agent2")
        record_call_metrics(db_path, "gpt-4o", 500, 250, run_id=run_id, agent_name="Agent1")
        
        # Verify all were stored
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM orchestration_cost_metrics WHERE run_id = ?", (run_id,))
            count = cursor.fetchone()[0]
            assert count == 3
    finally:
        db_path.unlink()


def test_aggregate_run_metrics():
    """Test aggregating metrics for a run."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-aggregate"
        
        # Record some calls
        record_call_metrics(db_path, "gpt-4o-mini", 1000, 500, run_id=run_id, agent_name="Agent1")
        record_call_metrics(db_path, "gpt-4o-mini", 2000, 1000, run_id=run_id, agent_name="Agent2")
        record_call_metrics(db_path, "gpt-4o", 500, 250, run_id=run_id, agent_name="Agent1")
        
        # Aggregate
        aggregates = aggregate_run_metrics(
            db_path=db_path,
            run_id=run_id,
            run_goal="Test goal",
            project_name="TestProject"
        )
        
        assert aggregates['run_id'] == run_id
        assert aggregates['call_count'] == 3
        assert aggregates['total_tokens_input'] == 3500  # 1000 + 2000 + 500
        assert aggregates['total_tokens_output'] == 1750  # 500 + 1000 + 250
        assert aggregates['total_cost_usd'] > 0
        assert aggregates['total_kwh'] > 0
        assert aggregates['total_water_liters'] > 0
        assert "gpt-4o-mini" in aggregates['unique_models']
        assert "gpt-4o" in aggregates['unique_models']
        assert "Agent1" in aggregates['unique_agents']
        assert "Agent2" in aggregates['unique_agents']
    finally:
        db_path.unlink()


def test_aggregate_stores_in_table():
    """Test that aggregation stores results in aggregates table."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-stored"
        
        # Record and aggregate
        record_call_metrics(db_path, "gpt-4o-mini", 1000, 500, run_id=run_id)
        aggregate_run_metrics(db_path, run_id, run_goal="Test")
        
        # Verify stored in aggregates table
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM orchestration_run_aggregates WHERE run_id = ?", (run_id,))
            row = cursor.fetchone()
            
            assert row is not None
            assert row['run_id'] == run_id
            assert row['call_count'] == 1
            assert row['total_tokens_input'] == 1000
            assert row['total_tokens_output'] == 500
    finally:
        db_path.unlink()


def test_get_run_summary():
    """Test retrieving run summary."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-summary"
        
        # Record, aggregate, then retrieve
        record_call_metrics(db_path, "gpt-4o-mini", 1000, 500, run_id=run_id)
        aggregate_run_metrics(db_path, run_id, run_goal="Test goal")
        
        summary = get_run_summary(db_path, run_id)
        
        assert summary is not None
        assert summary['run_id'] == run_id
        assert summary['total_tokens_input'] == 1000
        assert summary['total_tokens_output'] == 500
        assert summary['total_tokens'] == 1500
        assert summary['call_count'] == 1
        assert 'unique_models' in summary
        assert 'unique_agents' in summary
    finally:
        db_path.unlink()


def test_get_run_summary_not_found():
    """Test retrieving summary for non-existent run."""
    db_path = create_test_db()
    
    try:
        summary = get_run_summary(db_path, "non-existent-run")
        assert summary is None
    finally:
        db_path.unlink()


def test_aggregate_empty_run():
    """Test aggregating a run with no metrics."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-empty"
        
        # Aggregate without recording any metrics
        aggregates = aggregate_run_metrics(db_path, run_id)
        
        assert aggregates['run_id'] == run_id
        assert aggregates['call_count'] == 0
        assert aggregates['total_tokens_input'] == 0
        assert aggregates['total_tokens_output'] == 0
        assert aggregates['total_cost_usd'] == 0.0
    finally:
        db_path.unlink()


def test_update_existing_aggregate():
    """Test that re-aggregating updates existing record."""
    db_path = create_test_db()
    
    try:
        run_id = "test-run-update"
        
        # Record and aggregate
        record_call_metrics(db_path, "gpt-4o-mini", 1000, 500, run_id=run_id)
        aggregate_run_metrics(db_path, run_id)
        
        # Record more and aggregate again
        record_call_metrics(db_path, "gpt-4o-mini", 2000, 1000, run_id=run_id)
        aggregate_run_metrics(db_path, run_id)
        
        # Should have updated values, not duplicate records
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM orchestration_run_aggregates WHERE run_id = ?", (run_id,))
            count = cursor.fetchone()[0]
            assert count == 1
            
            cursor.execute("SELECT call_count, total_tokens_input FROM orchestration_run_aggregates WHERE run_id = ?", (run_id,))
            row = cursor.fetchone()
            assert row[0] == 2  # call_count
            assert row[1] == 3000  # total_tokens_input
    finally:
        db_path.unlink()
