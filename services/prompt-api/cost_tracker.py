"""Cost tracking for AI provider API calls."""

import sqlite3
import datetime
import json
from typing import Optional, Dict, Any, List
from pathlib import Path


class CostTracker:
    """Track and report on AI API costs."""
    
    def __init__(self, db_path: Path):
        """Initialize cost tracker.
        
        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self._ensure_schema()
    
    def _ensure_schema(self):
        """Ensure cost tracking schema exists in database."""
        with sqlite3.connect(self.db_path) as conn:
            # Check if api_costs table exists
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='api_costs'"
            )
            if not cursor.fetchone():
                # Schema doesn't exist, create it
                schema_path = Path(__file__).parent.parent.parent / "data" / "sqlite" / "schema.sql"
                if schema_path.exists():
                    with open(schema_path, 'r') as f:
                        schema = f.read()
                        conn.executescript(schema)
    
    def log_api_call(
        self,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        total_cost: float,
        input_cost: float = 0.0,
        output_cost: float = 0.0,
        prompt_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Log an API call with cost information.
        
        Args:
            provider: Provider name (e.g., 'openai', 'anthropic')
            model: Model identifier
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            total_cost: Total cost in USD
            input_cost: Input cost in USD
            output_cost: Output cost in USD
            prompt_id: Optional prompt ID
            agent_id: Optional agent ID
            user_id: Optional user ID
            session_id: Optional session ID
            metadata: Optional metadata as dict
        
        Returns:
            ID of inserted row
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO api_costs (
                    provider, model, input_tokens, output_tokens, total_tokens,
                    input_cost, output_cost, total_cost,
                    prompt_id, agent_id, user_id, session_id,
                    created_utc, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    provider,
                    model,
                    input_tokens,
                    output_tokens,
                    input_tokens + output_tokens,
                    input_cost,
                    output_cost,
                    total_cost,
                    prompt_id,
                    agent_id,
                    user_id,
                    session_id,
                    datetime.datetime.utcnow().isoformat(),
                    json.dumps(metadata) if metadata else None,
                )
            )
            return cursor.lastrowid
    
    def get_total_cost(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> float:
        """Get total cost for a time period.
        
        Args:
            start_date: Start date (ISO format)
            end_date: End date (ISO format)
            provider: Filter by provider
            user_id: Filter by user ID
        
        Returns:
            Total cost in USD
        """
        query = "SELECT SUM(total_cost) FROM api_costs WHERE 1=1"
        params = []
        
        if start_date:
            query += " AND created_utc >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND created_utc <= ?"
            params.append(end_date)
        
        if provider:
            query += " AND provider = ?"
            params.append(provider)
        
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(query, params)
            result = cursor.fetchone()[0]
            return result if result else 0.0
    
    def get_cost_by_provider(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get cost breakdown by provider.
        
        Args:
            start_date: Start date (ISO format)
            end_date: End date (ISO format)
        
        Returns:
            List of provider cost summaries
        """
        query = """
            SELECT 
                provider,
                COUNT(*) as call_count,
                SUM(total_tokens) as total_tokens,
                SUM(total_cost) as total_cost,
                AVG(total_cost) as avg_cost_per_call,
                MAX(created_utc) as last_call_utc
            FROM api_costs
            WHERE 1=1
        """
        params = []
        
        if start_date:
            query += " AND created_utc >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND created_utc <= ?"
            params.append(end_date)
        
        query += " GROUP BY provider ORDER BY total_cost DESC"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def get_cost_by_model(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get cost breakdown by model.
        
        Args:
            start_date: Start date (ISO format)
            end_date: End date (ISO format)
            provider: Filter by provider
        
        Returns:
            List of model cost summaries
        """
        query = """
            SELECT 
                provider,
                model,
                COUNT(*) as call_count,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(total_tokens) as total_tokens,
                SUM(total_cost) as total_cost,
                AVG(total_cost) as avg_cost_per_call,
                MAX(created_utc) as last_call_utc
            FROM api_costs
            WHERE 1=1
        """
        params = []
        
        if start_date:
            query += " AND created_utc >= ?"
            params.append(start_date)
        
        if end_date:
            query += " AND created_utc <= ?"
            params.append(end_date)
        
        if provider:
            query += " AND provider = ?"
            params.append(provider)
        
        query += " GROUP BY provider, model ORDER BY total_cost DESC"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def get_daily_costs(
        self,
        days: int = 30,
        provider: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get daily cost breakdown.
        
        Args:
            days: Number of days to include
            provider: Filter by provider
        
        Returns:
            List of daily cost summaries
        """
        query = """
            SELECT 
                DATE(created_utc) as date,
                provider,
                COUNT(*) as call_count,
                SUM(total_tokens) as total_tokens,
                SUM(total_cost) as total_cost
            FROM api_costs
            WHERE created_utc >= DATE('now', '-' || ? || ' days')
        """
        params = [days]
        
        if provider:
            query += " AND provider = ?"
            params.append(provider)
        
        query += " GROUP BY DATE(created_utc), provider ORDER BY date DESC, provider"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]
    
    def check_budget(
        self,
        budget_amount: float,
        period_days: int = 30,
        provider: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Check if costs are within budget.
        
        Args:
            budget_amount: Budget in USD
            period_days: Number of days for budget period
            provider: Filter by provider
        
        Returns:
            Budget status information
        """
        start_date = (
            datetime.datetime.utcnow() - datetime.timedelta(days=period_days)
        ).isoformat()
        
        current_cost = self.get_total_cost(
            start_date=start_date,
            provider=provider
        )
        
        remaining = budget_amount - current_cost
        percentage_used = (current_cost / budget_amount * 100) if budget_amount > 0 else 0
        
        status = "ok"
        if percentage_used >= 90:
            status = "critical"
        elif percentage_used >= 75:
            status = "warning"
        
        return {
            "budget_amount": budget_amount,
            "period_days": period_days,
            "current_cost": current_cost,
            "remaining": remaining,
            "percentage_used": percentage_used,
            "status": status,
            "provider": provider,
        }
