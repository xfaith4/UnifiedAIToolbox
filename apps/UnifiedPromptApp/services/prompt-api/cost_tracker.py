import datetime
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Tuple


# USD pricing per 1K tokens (prompt/completion). Expand as you add providers/models.
PRICING_PER_1K = {
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.005, 0.015),
    "gpt-3.5-turbo": (0.0005, 0.0015),
}


def _parse_iso(ts: str) -> Optional[datetime.datetime]:
    try:
        return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _in_window(ts: Optional[str], start: Optional[str], end: Optional[str]) -> bool:
    if not ts:
        return False
    dt = _parse_iso(ts)
    if not dt:
        return False
    if start and dt < datetime.datetime.fromisoformat(start.replace("Z", "+00:00")):
        return False
    if end and dt > datetime.datetime.fromisoformat(end.replace("Z", "+00:00")):
        return False
    return True


def _cost_for_row(model: str, prompt_tokens: Optional[int], completion_tokens: Optional[int]) -> float:
    prompt_rate, completion_rate = PRICING_PER_1K.get(model, (0.0, 0.0))
    total = 0.0
    if prompt_tokens:
        total += (prompt_tokens / 1000.0) * prompt_rate
    if completion_tokens:
        total += (completion_tokens / 1000.0) * completion_rate
    return round(total, 6)


class CostTracker:
    """
    Lightweight cost tracker backed by the audit table. Calculates USD cost
    from token counts using static pricing constants.
    """

    def __init__(self, db_path: Any):
        self.db_path = db_path

    def _audit_rows(self) -> Iterable[Tuple[str, Optional[int], Optional[int], Optional[str]]]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT model, token_prompt, token_completion, created_at FROM audit"
            ).fetchall()
            for row in rows:
                yield (
                    row["model"] or "",
                    row["token_prompt"],
                    row["token_completion"],
                    row["created_at"],
                )

    def _filtered_costs(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        costs: List[Dict[str, Any]] = []
        for model, prompt_tokens, completion_tokens, created_at in self._audit_rows():
            if not _in_window(created_at, start_date, end_date):
                continue
            cost = _cost_for_row(model, prompt_tokens, completion_tokens)
            costs.append(
                {
                    "model": model or "unknown",
                    "provider": "openai",  # default provider; adjust when multi-provider is wired
                    "cost": cost,
                    "created_at": created_at,
                }
            )
        return costs

    def get_total_cost(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> float:
        costs = self._filtered_costs(start_date, end_date)
        if provider:
            costs = [c for c in costs if c["provider"] == provider]
        return round(sum(c["cost"] for c in costs), 6)

    def get_cost_by_provider(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        totals: Dict[str, float] = {}
        for c in self._filtered_costs(start_date, end_date):
            totals[c["provider"]] = totals.get(c["provider"], 0.0) + c["cost"]
        return [{"provider": k, "cost": round(v, 6)} for k, v in totals.items()]

    def get_cost_by_model(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        totals: Dict[str, float] = {}
        for c in self._filtered_costs(start_date, end_date):
            if provider and c["provider"] != provider:
                continue
            totals[c["model"]] = totals.get(c["model"], 0.0) + c["cost"]
        return [{"model": k, "cost": round(v, 6)} for k, v in totals.items()]

    def get_daily_costs(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        totals: Dict[str, float] = {}
        for c in self._filtered_costs(start_date, end_date):
            if provider and c["provider"] != provider:
                continue
            dt = _parse_iso(c["created_at"])
            if not dt:
                continue
            day = dt.date().isoformat()
            totals[day] = totals.get(day, 0.0) + c["cost"]
        return [{"date": k, "cost": round(v, 6)} for k, v in sorted(totals.items())]

    def check_budget(
        self,
        budget_amount: float,
        period_days: int,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        # If no explicit start_date/end_date are provided, treat the window as the full history
        # (delegate to get_total_cost which accepts None to mean no filtering). Do not automatically
        # set a trailing window based on period_days to avoid surprising differences between
        # get_total_cost() and check_budget(). Note: period_days is still included in the response
        # for informational purposes even when not used for date filtering.

        current_cost = self.get_total_cost(start_date, end_date, provider, user_id)
        remaining = max(0.0, budget_amount - current_cost)
        pct = 0.0 if budget_amount <= 0 else min(100.0, (current_cost / budget_amount) * 100)
        status = "ok"
        if pct >= 100:
            status = "exceeded"
        elif pct >= 80:
            status = "warning"

        return {
            "budget_amount": budget_amount,
            "period_days": period_days,
            "current_cost": round(current_cost, 6),
            "remaining": round(remaining, 6),
            "percentage_used": round(pct, 2),
            "status": status,
            "provider": provider,
        }

    def get_cost_by_run(
        self,
        run_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get cost breakdown for a specific orchestration run or all runs.
        
        Args:
            run_id: Optional specific run ID to query
            start_date: Optional start date filter
            end_date: Optional end date filter
            
        Returns:
            Dictionary with run cost information
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            
            # Check if run_id column exists in audit table
            cursor = conn.execute("PRAGMA table_info(audit)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'run_id' not in columns:
                # run_id column doesn't exist yet, return empty results
                return {
                    "runs": [],
                    "total_cost": 0.0,
                    "note": "Run-based cost tracking not yet enabled (missing run_id in audit table)"
                }
            
            # Build query based on filters
            query = """
                SELECT 
                    run_id,
                    model,
                    COUNT(*) as call_count,
                    SUM(token_prompt) as total_prompt_tokens,
                    SUM(token_completion) as total_completion_tokens,
                    MIN(created_at) as first_call,
                    MAX(created_at) as last_call
                FROM audit
                WHERE run_id IS NOT NULL
            """
            params = []
            
            if run_id:
                query += " AND run_id = ?"
                params.append(run_id)
            
            if start_date:
                query += " AND created_at >= ?"
                params.append(start_date)
            
            if end_date:
                query += " AND created_at <= ?"
                params.append(end_date)
            
            query += " GROUP BY run_id, model ORDER BY last_call DESC"
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            runs = []
            total_cost = 0.0
            
            for row in rows:
                cost = _cost_for_row(
                    row["model"] or "",
                    row["total_prompt_tokens"],
                    row["total_completion_tokens"]
                )
                total_cost += cost
                
                runs.append({
                    "run_id": row["run_id"],
                    "model": row["model"],
                    "call_count": row["call_count"],
                    "total_prompt_tokens": row["total_prompt_tokens"] or 0,
                    "total_completion_tokens": row["total_completion_tokens"] or 0,
                    "total_tokens": (row["total_prompt_tokens"] or 0) + (row["total_completion_tokens"] or 0),
                    "cost": round(cost, 6),
                    "first_call": row["first_call"],
                    "last_call": row["last_call"]
                })
            
            return {
                "runs": runs,
                "total_cost": round(total_cost, 6),
                "run_count": len(set(r["run_id"] for r in runs))
            }
