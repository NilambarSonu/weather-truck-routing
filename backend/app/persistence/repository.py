import uuid
from typing import Optional, Dict, Any
from .models import TripPlan


class PlanRepository:
    @staticmethod
    async def save_plan(plan_dict: Dict[str, Any], plan_id: Optional[str] = None) -> str:
        uid = uuid.UUID(plan_id) if plan_id else uuid.uuid4()
        req_data = plan_dict.get("request", {})
        meta = plan_dict.get("meta", {})

        plan_record = TripPlan(
            id=uid,
            algo_version=meta.get("algo_version", "1.0.0"),
            weather_provider=meta.get("weather_provider", "openmeteo"),
            request_data=req_data,
            result_data=plan_dict,
        )
        plan_record.save()
        return str(plan_record.id)

    @staticmethod
    def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
        try:
            uid = uuid.UUID(plan_id)
            record = TripPlan.objects.get(id=uid)
            res = dict(record.result_data)
            res["id"] = str(record.id)
            res["created_at"] = record.created_at.isoformat()
            return res
        except (TripPlan.DoesNotExist, ValueError):
            return None
