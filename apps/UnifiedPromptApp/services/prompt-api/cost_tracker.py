import datetime
import os
import sqlite3
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    # Preferred: use the same centralized model pricing/impact module used by cost_metrics.py.
    from model_costs import calculate_impact
except Exception:  # pragma: no cover - keeps the tracker importable during partial installs/tests
    calculate_impact = None


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

    start_dt = _parse_iso(start) if start else None
    end_dt = _parse_iso(end) if end else None

    if start_dt and dt < start_dt:
        return False
    if end_dt and dt > end_dt:
        return False
    return True


def _safe_tokens(value: Optional[int]) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _cost_for_row(model: str, prompt_tokens: Optional[int], completion_tokens: Optional[int]) -> float:
    """
    Calculate cost using centralized model_costs.calculate_impact.

    This intentionally avoids hardcoded model pricing here. Add or update models in
    model_costs.json / model_costs.py, not in this file.
    """
    if not calculate_impact:
        return 0.0

    impact = calculate_impact(
        model=model or "unknown",
        tokens_input=_safe_tokens(prompt_tokens),
        tokens_output=_safe_tokens(completion_tokens),
        agent_name=None,
    )
    return round(float(getattr(impact, "cost_usd", 0.0) or 0.0), 6)


def _provider_for_model(model: str) -> str:
    """
    Resolve provider without duplicating pricing logic.

    If model_costs exposes provider metadata in the future, prefer that there.
    This fallback keeps provider filters useful for current OpenAI/Anthropic routing.
    """
    normalized = (model or "").lower()
    if normalized.startswith("claude"):
        return "anthropic"
    if normalized.startswith("gpt") or normalized.startswith("o"):
        return "openai"
    return "unknown"


class CostTracker:
    """
    Lightweight cost tracker backed by the audit table.

    Cost calculation is delegated to model_costs.calculate_impact so model pricing
    can be updated centrally through the model_costs module/config rather than
    duplicated here.
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
                    "provider": _provider_for_model(model),
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
        return [{"provider": k, "cost": round(v, 6)} for k, v in sorted(totals.items())]

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
        return [{"model": k, "cost": round(v, 6)} for k, v in sorted(totals.items())]

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
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row

            cursor = conn.execute("PRAGMA table_info(audit)")
            columns = [row[1] for row in cursor.fetchall()]

            if "run_id" not in columns:
                return {
                    "runs": [],
                    "total_cost": 0.0,
                    "note": "Run-based cost tracking not yet enabled (missing run_id in audit table)",
                }

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

            rows = conn.execute(query, params).fetchall()

            runs = []
            total_cost = 0.0

            for row in rows:
                prompt_tokens = row["total_prompt_tokens"] or 0
                completion_tokens = row["total_completion_tokens"] or 0
                cost = _cost_for_row(row["model"] or "", prompt_tokens, completion_tokens)
                total_cost += cost

                runs.append(
                    {
                        "run_id": row["run_id"],
                        "model": row["model"],
                        "provider": _provider_for_model(row["model"] or ""),
                        "call_count": row["call_count"],
                        "total_prompt_tokens": prompt_tokens,
                        "total_completion_tokens": completion_tokens,
                        "total_tokens": prompt_tokens + completion_tokens,
                        "cost": round(cost, 6),
                        "first_call": row["first_call"],
                        "last_call": row["last_call"],
                    }
                )

            return {
                "runs": runs,
                "total_cost": round(total_cost, 6),
                "run_count": len(set(r["run_id"] for r in runs)),
            }
