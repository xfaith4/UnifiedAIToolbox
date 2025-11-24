from fastapi import APIRouter

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/status")
def github_status():
    return {"available": False, "message": "GitHub integration stubbed"}
