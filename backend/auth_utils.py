import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request

import aiosqlite
from db import fetch_one

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 24h


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    secret = os.environ.get("JWT_SECRET", "herko-dev-secret-change-in-production")
    return secret


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def extract_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    token = request.cookies.get("access_token")
    if token:
        return token
    raise HTTPException(status_code=401, detail="Not authenticated")


async def get_current_user(request: Request, db: aiosqlite.Connection) -> dict:
    token = extract_token(request)
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    row = await fetch_one(db, "SELECT * FROM users WHERE id = ?", (payload["sub"],))
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    user = dict(row)
    user.pop("password_hash", None)
    from db import jl
    user["roles"] = jl(user.get("roles")) or []
    return user


def user_has_role(user: dict, *allowed_roles: str) -> bool:
    active = user.get("active_role")
    roles = set(user.get("roles", []))
    if active and active in allowed_roles:
        return True
    return bool(roles.intersection(set(allowed_roles)))


def require_role(user: dict, *allowed_roles: str):
    if not user_has_role(user, *allowed_roles):
        raise HTTPException(
            status_code=403,
            detail=f"Required role: {' or '.join(allowed_roles)}",
        )
