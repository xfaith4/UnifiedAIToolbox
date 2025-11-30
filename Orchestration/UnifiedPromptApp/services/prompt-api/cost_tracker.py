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
        # Default window is the trailing period_days if explicit dates are not provided.
        if not start_date and not end_date:
            end_dt = datetime.datetime.now(datetime.timezone.utc)
            start_dt = end_dt - datetime.timedelta(days=period_days)
            start_date = start_dt.isoformat()
            end_date = end_dt.isoformat()

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
