"""
Authentication and Authorization Module for Unified AI Toolbox

Provides JWT-based authentication with role-based access control (RBAC).
"""

import os
import jwt
import bcrypt
import sqlite3
import secrets
from datetime import datetime, timedelta
from typing import Optional, List
from enum import Enum
from pathlib import Path

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# ----------------------------
# Configuration
# ----------------------------
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Get database path from environment or default
BASE_DIR = Path(__file__).parent.resolve()
AUTH_DB_PATH = os.environ.get("AUTH_DB_PATH", str(BASE_DIR / "auth.db"))

security = HTTPBearer()


# ----------------------------
# User Roles
# ----------------------------
class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    READONLY = "readonly"


# ----------------------------
# Data Models
# ----------------------------
class User(BaseModel):
    id: int
    username: str
    email: str
    role: UserRole
    created_at: datetime
    is_active: bool = True


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: UserRole = UserRole.USER


class UserLogin(BaseModel):
    username: str
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[UserRole] = None


# ----------------------------
# Database Operations
# ----------------------------
def init_auth_db():
    """Initialize authentication database with users table."""
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_username ON users(username)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_email ON users(email)
    """)
    conn.commit()
    conn.close()


def create_default_admin():
    """Create default admin user if no users exist."""
    conn = sqlite3.connect(AUTH_DB_PATH)
    cursor = conn.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    
    if count == 0:
        # Create default admin with password "admin" (should be changed on first login)
        default_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin")
        hashed_password = bcrypt.hashpw(default_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        now = datetime.utcnow().isoformat()
        
        conn.execute("""
            INSERT INTO users (username, email, hashed_password, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, ("admin", "admin@localhost", hashed_password, UserRole.ADMIN.value, now, now))
        conn.commit()
        print("✓ Created default admin user (username: admin, password: admin)")
        print("  ⚠️  Please change the default password immediately!")
    
    conn.close()


# ----------------------------
# Password Hashing
# ----------------------------
def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


# ----------------------------
# Token Operations
# ----------------------------
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict):
    """Create a JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> TokenData:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        
        return TokenData(username=username, role=UserRole(role))
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )


# ----------------------------
# User Operations
# ----------------------------
def get_user_by_username(username: str) -> Optional[dict]:
    """Get user by username from database."""
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None


def create_user(user_data: UserCreate) -> User:
    """Create a new user in the database."""
    conn = sqlite3.connect(AUTH_DB_PATH)
    
    # Check if username or email already exists
    cursor = conn.execute(
        "SELECT COUNT(*) FROM users WHERE username = ? OR email = ?",
        (user_data.username, user_data.email)
    )
    if cursor.fetchone()[0] > 0:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists"
        )
    
    # Hash password and insert user
    hashed_password = hash_password(user_data.password)
    now = datetime.utcnow().isoformat()
    
    cursor = conn.execute("""
        INSERT INTO users (username, email, hashed_password, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_data.username, user_data.email, hashed_password, user_data.role.value, now, now))
    
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return User(
        id=user_id,
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        created_at=datetime.fromisoformat(now),
        is_active=True
    )


def authenticate_user(username: str, password: str) -> Optional[User]:
    """Authenticate a user by username and password."""
    user_data = get_user_by_username(username)
    if not user_data:
        return None
    
    if not verify_password(password, user_data["hashed_password"]):
        return None
    
    if not user_data["is_active"]:
        return None
    
    return User(
        id=user_data["id"],
        username=user_data["username"],
        email=user_data["email"],
        role=UserRole(user_data["role"]),
        created_at=datetime.fromisoformat(user_data["created_at"]),
        is_active=bool(user_data["is_active"])
    )


# ----------------------------
# Authentication Dependencies
# ----------------------------
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """Dependency to get the current authenticated user."""
    token = credentials.credentials
    token_data = decode_token(token)
    
    user_data = get_user_by_username(token_data.username)
    if user_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user_data["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
        )
    
    return User(
        id=user_data["id"],
        username=user_data["username"],
        email=user_data["email"],
        role=UserRole(user_data["role"]),
        created_at=datetime.fromisoformat(user_data["created_at"]),
        is_active=bool(user_data["is_active"])
    )


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """Dependency to get the current active user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


# ----------------------------
# Authorization Dependencies
# ----------------------------
def require_role(*allowed_roles: UserRole):
    """Dependency factory to require specific roles."""
    async def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {', '.join(r.value for r in allowed_roles)}"
            )
        return current_user
    return role_checker


# Create common role dependencies
require_admin = require_role(UserRole.ADMIN)
require_user = require_role(UserRole.ADMIN, UserRole.USER)
require_readonly = require_role(UserRole.ADMIN, UserRole.USER, UserRole.READONLY)


# ----------------------------
# Initialization
# ----------------------------
def initialize_auth():
    """Initialize authentication system."""
    init_auth_db()
    create_default_admin()


if __name__ == "__main__":
    # For testing/setup purposes
    initialize_auth()
    print("Authentication system initialized successfully!")
