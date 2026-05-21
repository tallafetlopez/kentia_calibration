import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 24  # 24h for this demo tool


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


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


async def get_current_user(request: Request, db):
    token = extract_token(request)
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
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
