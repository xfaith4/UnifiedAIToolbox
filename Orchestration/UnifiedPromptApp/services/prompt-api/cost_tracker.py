from typing import Any, Dict, List, Optional


class CostTracker:
    """
    Minimal stub cost tracker to keep the API running when the real tracker
    implementation is not present. Returns zeroed or empty results.
    """

    def __init__(self, db_path: Any):
        self.db_path = db_path

    def get_total_cost(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> float:
        return 0.0

    def get_cost_by_provider(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return []

    def get_cost_by_model(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return []

    def get_daily_costs(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        return []

    def check_budget(
        self,
        budget_amount: float,
        period_days: int,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        provider: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "budget_amount": budget_amount,
            "period_days": period_days,
            "current_cost": 0.0,
            "remaining": budget_amount,
            "percentage_used": 0.0,
            "status": "ok",
            "provider": provider,
        }
