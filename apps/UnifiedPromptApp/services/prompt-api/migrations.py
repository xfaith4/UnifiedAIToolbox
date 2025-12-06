"""
Database migrations for prompt-api service.

This module handles schema evolution to add new features:
- Run feedback and learning storage (Supervisor scoring)
- Enhanced audit trail with run_id linkage
- Cost tracking per orchestration run
"""

import sqlite3
import pathlib
from typing import Optional


def apply_migrations(db_path: pathlib.Path) -> None:
    """Apply all pending migrations to the database."""
    with sqlite3.connect(db_path) as conn:
        c = conn.cursor()
        
        # Check if migrations table exists
        c.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL,
                description TEXT
            )
        """)
        
        # Get current version
        c.execute("SELECT MAX(version) FROM schema_migrations")
        current_version = c.fetchone()[0] or 0
        
        migrations = [
            (1, _migration_001_run_feedback, "Add run feedback and learning tables"),
            (2, _migration_002_audit_run_id, "Add run_id to audit table for cost attribution"),
            (3, _migration_003_run_metadata, "Add orchestration run metadata table"),
            (4, _migration_004_cost_metrics, "Add detailed cost and environmental impact metrics table"),
            (5, _migration_005_run_aggregates, "Add orchestration run aggregates summary table"),
            (6, _migration_006_quality_metrics, "Add quality and outcome tracking table"),
        ]
        
        for version, migration_func, description in migrations:
            if version > current_version:
                print(f"Applying migration {version}: {description}")
                migration_func(c)
                c.execute(
                    "INSERT INTO schema_migrations (version, applied_at, description) VALUES (?, datetime('now'), ?)",
                    (version, description)
                )
                conn.commit()
                print(f"Migration {version} applied successfully")


def _migration_001_run_feedback(cursor: sqlite3.Cursor) -> None:
    """
    Migration 001: Add run feedback and learning tables.
    
    Supports the Supervisor agent's quality scoring and learning loop.
    """
    # Run feedback from Supervisor
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS run_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            quality_score REAL,
            feedback_json TEXT,
            insights_json TEXT,
            agent_scores_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES orchestrator_runs(id)
        )
    """)
    
    # Create index for efficient lookup
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_run_feedback_run_id 
        ON run_feedback(run_id)
    """)
    
    # Learning patterns extracted from successful runs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS learning_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_type TEXT NOT NULL,
            pattern_data TEXT NOT NULL,
            source_run_ids TEXT,
            quality_score REAL,
            usage_count INTEGER DEFAULT 0,
            success_rate REAL,
            created_at TEXT NOT NULL,
            last_used_at TEXT
        )
    """)
    
    # Index for pattern lookup
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_learning_patterns_type 
        ON learning_patterns(pattern_type)
    """)


def _migration_002_audit_run_id(cursor: sqlite3.Cursor) -> None:
    """
    Migration 002: Add run_id to audit table for cost attribution.
    
    Links API calls to orchestration runs for accurate cost tracking.
    """
    # Check if audit table exists first
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='audit'")
    if not cursor.fetchone():
        # Audit table doesn't exist, skip this migration (it will be created by app.py init_db)
        print("  Note: audit table doesn't exist yet, skipping run_id column addition")
        return
    
    # Check if run_id column exists
    cursor.execute("PRAGMA table_info(audit)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'run_id' not in columns:
        # Add run_id column
        cursor.execute("ALTER TABLE audit ADD COLUMN run_id TEXT")
        
        # Create index for efficient cost queries by run
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_run_id 
            ON audit(run_id)
        """)


def _migration_003_run_metadata(cursor: sqlite3.Cursor) -> None:
    """
    Migration 003: Add orchestration run metadata table.
    
    Stores comprehensive metadata about each orchestration run including:
    - Goal, agents used, model configuration
    - Timing and cost information
    - Status and outcomes
    """
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orchestrator_runs (
            id TEXT PRIMARY KEY,
            goal TEXT,
            agents_json TEXT,
            run_mode TEXT,
            model TEXT,
            status TEXT,
            requested_at TEXT,
            started_at TEXT,
            completed_at TEXT,
            total_tokens INTEGER,
            total_cost REAL,
            output_summary TEXT,
            metadata_json TEXT,
            created_at TEXT NOT NULL
        )
    """)
    
    # Indexes for common queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_runs_status 
        ON orchestrator_runs(status)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_runs_created_at 
        ON orchestrator_runs(created_at DESC)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_runs_run_mode 
        ON orchestrator_runs(run_mode)
    """)


def _migration_004_cost_metrics(cursor: sqlite3.Cursor) -> None:
    """
    Migration 004: Add detailed cost and environmental impact metrics table.
    
    Stores per-call metrics including:
    - Token counts (input/output)
    - Cost in USD
    - Energy consumption (kWh)
    - Water usage (liters)
    - Model and agent attribution
    """
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_cost_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT,
            timestamp TEXT NOT NULL,
            model_name TEXT NOT NULL,
            agent_name TEXT,
            tokens_input INTEGER,
            tokens_output INTEGER,
            cost_usd REAL,
            kwh_estimated REAL,
            water_liters_estimated REAL,
            project_name TEXT,
            app_name TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES orchestrator_runs(id)
        )
    """)
    
    # Indexes for efficient queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_cost_metrics_run_id 
        ON orchestration_cost_metrics(run_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_cost_metrics_timestamp 
        ON orchestration_cost_metrics(timestamp DESC)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_cost_metrics_model 
        ON orchestration_cost_metrics(model_name)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_cost_metrics_agent 
        ON orchestration_cost_metrics(agent_name)
    """)


def _migration_005_run_aggregates(cursor: sqlite3.Cursor) -> None:
    """
    Migration 005: Add orchestration run aggregates summary table.
    
    Stores aggregated metrics per run for quick summary queries:
    - Total tokens processed
    - Total cost, energy, and water usage
    - Run metadata
    """
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orchestration_run_aggregates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT UNIQUE NOT NULL,
            total_tokens_input INTEGER DEFAULT 0,
            total_tokens_output INTEGER DEFAULT 0,
            total_cost_usd REAL DEFAULT 0.0,
            total_kwh REAL DEFAULT 0.0,
            total_water_liters REAL DEFAULT 0.0,
            call_count INTEGER DEFAULT 0,
            unique_models_json TEXT,
            unique_agents_json TEXT,
            project_name TEXT,
            app_name TEXT,
            run_goal TEXT,
            started_at TEXT,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES orchestrator_runs(id)
        )
    """)
    
    # Indexes for queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_run_aggregates_run_id 
        ON orchestration_run_aggregates(run_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_run_aggregates_created_at 
        ON orchestration_run_aggregates(created_at DESC)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_run_aggregates_project 
        ON orchestration_run_aggregates(project_name)
    """)


def _migration_006_quality_metrics(cursor: sqlite3.Cursor) -> None:
    """
    Migration 006: Add quality and outcome tracking table.
    
    Stores per-run outcome and quality data:
    - Success/failure status
    - Quality scores (numeric)
    - Human ratings and notes
    - Automated test results
    - Time to result metrics
    - Manual fix requirements
    - Strategy information
    """
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS run_quality_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT UNIQUE NOT NULL,
            strategy TEXT,
            success INTEGER NOT NULL DEFAULT 0,
            quality_score REAL,
            notes TEXT,
            time_to_result_ms INTEGER,
            needs_manual_fix INTEGER NOT NULL DEFAULT 0,
            rating_source TEXT,
            automated_test_passed INTEGER,
            automated_test_score REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES orchestrator_runs(id)
        )
    """)
    
    # Indexes for efficient queries
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_quality_metrics_run_id 
        ON run_quality_metrics(run_id)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_quality_metrics_success 
        ON run_quality_metrics(success)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_quality_metrics_strategy 
        ON run_quality_metrics(strategy)
    """)
    
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_quality_metrics_quality_score 
        ON run_quality_metrics(quality_score)
    """)


if __name__ == "__main__":
    # Test migrations
    import os
    test_db = pathlib.Path("/tmp/test_migrations.db")
    if test_db.exists():
        os.remove(test_db)
    
    apply_migrations(test_db)
    
    # Verify schema
    with sqlite3.connect(test_db) as conn:
        c = conn.cursor()
        c.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in c.fetchall()]
        print(f"\nCreated tables: {', '.join(tables)}")
        
        c.execute("SELECT version, description FROM schema_migrations ORDER BY version")
        migrations = c.fetchall()
        print("\nApplied migrations:")
        for version, description in migrations:
            print(f"  {version}: {description}")
    
    print("\nMigrations test completed successfully!")
