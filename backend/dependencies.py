"""Shared FastAPI dependency helpers — single source of truth for all routers."""

from __future__ import annotations

from datetime import datetime, timezone

import aiosqlite
from fastapi import HTTPException, Request

from db import get_conn, fetch_one


async def get_db() -> aiosqlite.Connection:
    return get_conn()


async def get_current_user(request: Request) -> dict:
    from auth_utils import get_current_user as _get
    db = get_conn()
    return await _get(request, db)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def require_sr(sr_id: str, db: aiosqlite.Connection) -> dict:
    sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
    if not sr:
        raise HTTPException(status_code=404, detail="SW Release not found")
    return sr
