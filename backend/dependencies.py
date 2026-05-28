"""Shared FastAPI dependency helpers — single source of truth for all routers."""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_db() -> AsyncIOMotorDatabase:
    from server import db
    return db


async def get_current_user(request: Request):
    from auth_utils import get_current_user as _get
    from server import db
    return await _get(request, db)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def require_sr(sr_id: str, db: AsyncIOMotorDatabase):
    try:
        oid = ObjectId(sr_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sw_release id")
    sr = await db.sw_releases.find_one({"_id": oid})
    if not sr:
        raise HTTPException(status_code=404, detail="SW Release not found")
    return sr
