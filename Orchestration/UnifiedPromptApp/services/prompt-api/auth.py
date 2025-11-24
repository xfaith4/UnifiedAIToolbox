from fastapi import APIRouter, Depends

# Minimal auth stubs — replace with real logic as needed.
router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
def auth_status():
    return {"enabled": False}


@router.get("/me")
def auth_me():
    return {"id": "local-user", "username": "local", "role": "admin"}


@router.post("/login")
def auth_login():
    return {"access_token": "local-token", "refresh_token": "local-refresh"}
