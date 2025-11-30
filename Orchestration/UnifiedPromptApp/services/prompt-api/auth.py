"""
Authentication module for AI Prompt Workbench.

Provides JWT-based authentication with role-based access control.
This module can be configured via environment variables or disabled entirely.
"""
import base64
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field
import hashlib
import hmac

# Configuration from environment
AUTH_SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", secrets.token_hex(32))
AUTH_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("AUTH_REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# OAuth2 scheme for token extraction
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


class UserRole(str, Enum):
    """User role enumeration."""
    admin = "admin"
    user = "user"
    readonly = "readonly"


class UserLogin(BaseModel):
    """Login request model."""
    username: str
    password: str


class Token(BaseModel):
    """Token response model."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class User(BaseModel):
    """User model."""
    id: str
    username: str
    role: UserRole
    disabled: bool = False


class UserCreate(BaseModel):
    """User creation request model."""
    username: str
    password: str
    role: UserRole = UserRole.user


class UserInDB(User):
    """User model with hashed password."""
    hashed_password: str


# In-memory user store (for development; replace with DB in production)
_users_db: dict[str, UserInDB] = {}
_initialized = False


def _hash_password(password: str) -> str:
    """Hash a password using HMAC-SHA256."""
    return hmac.new(
        AUTH_SECRET_KEY.encode(),
        password.encode(),
        hashlib.sha256
    ).hexdigest()


def _verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return hmac.compare_digest(
        _hash_password(plain_password),
        hashed_password
    )


def _create_token(data: dict, expires_delta: timedelta) -> str:
    """Create a simple token (base64 encoded JSON with signature)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire.isoformat()})
    
    # Encode payload
    payload_json = json.dumps(to_encode, sort_keys=True)
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode()
    
    # Create signature
    signature = hmac.new(
        AUTH_SECRET_KEY.encode(),
        payload_b64.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{payload_b64}.{signature}"


def _decode_token(token: str) -> Optional[dict]:
    """Decode and verify a token."""
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        
        payload_b64, signature = parts
        
        # Verify signature
        expected_sig = hmac.new(
            AUTH_SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_sig):
            return None
        
        # Decode payload
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        data = json.loads(payload_json)
        
        # Check expiration
        exp_str = data.get("exp")
        if exp_str:
            exp = datetime.fromisoformat(exp_str)
            if datetime.now(timezone.utc) > exp:
                return None
        
        return data
    except Exception:
        return None


def initialize_auth() -> None:
    """Initialize the authentication system with default admin user."""
    global _initialized
    if _initialized:
        return
    
    # Create default admin user if no users exist
    admin_username = os.environ.get("AUTH_ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("AUTH_ADMIN_PASSWORD", "admin")
    
    if admin_username not in _users_db:
        _users_db[admin_username] = UserInDB(
            id=str(uuid.uuid4()),
            username=admin_username,
            role=UserRole.admin,
            disabled=False,
            hashed_password=_hash_password(admin_password)
        )
    
    _initialized = True


def authenticate_user(username: str, password: str) -> Optional[User]:
    """Authenticate a user by username and password."""
    user = _users_db.get(username)
    if not user:
        return None
    if not _verify_password(password, user.hashed_password):
        return None
    if user.disabled:
        return None
    return User(id=user.id, username=user.username, role=user.role, disabled=user.disabled)


def create_access_token(data: dict) -> str:
    """Create an access token."""
    return _create_token(data, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(data: dict) -> str:
    """Create a refresh token."""
    return _create_token(data, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))


def create_user(user_data: UserCreate) -> User:
    """Create a new user."""
    if user_data.username in _users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    user_id = str(uuid.uuid4())
    user = UserInDB(
        id=user_id,
        username=user_data.username,
        role=user_data.role,
        disabled=False,
        hashed_password=_hash_password(user_data.password)
    )
    _users_db[user_data.username] = user
    
    return User(id=user.id, username=user.username, role=user.role, disabled=user.disabled)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[User]:
    """Get the current user from the token."""
    if not token:
        return None
    
    token_data = _decode_token(token)
    if not token_data:
        return None
    
    username = token_data.get("sub")
    if not username:
        return None
    
    user = _users_db.get(username)
    if not user:
        return None
    
    return User(id=user.id, username=user.username, role=user.role, disabled=user.disabled)


async def get_current_active_user(current_user: Optional[User] = Depends(get_current_user)) -> User:
    """Get the current active user, raising an exception if not authenticated."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if current_user.disabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


async def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """Require admin role for access."""
    if current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def require_user(current_user: User = Depends(get_current_active_user)) -> User:
    """Require user or admin role for access."""
    if current_user.role not in (UserRole.admin, UserRole.user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User access required"
        )
    return current_user


async def require_readonly(current_user: User = Depends(get_current_active_user)) -> User:
    """Require any authenticated role (readonly, user, or admin)."""
    # Any authenticated user can access readonly endpoints
    return current_user


# Minimal auth stubs for router — replace with real logic as needed.
router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/status")
def auth_status():
    return {"enabled": True}


@router.get("/me")
def auth_me():
    return {"id": "local-user", "username": "local", "role": "admin"}


@router.post("/login")
def auth_login():
    return {"access_token": "local-token", "refresh_token": "local-refresh"}
