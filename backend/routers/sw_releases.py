"""SW Releases router — v1 /api/v1/sw-releases (SQLite)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, ConfigDict
from starlette.requests import Request

from db import fetch_one, fetch_all, run, jl, jd, get_conn
from dependencies import get_current_user, now_iso

router = APIRouter(prefix="/sw-releases", tags=["SW Releases"])


# ── Models ────────────────────────────────────────────────────────────────────

class SWReleaseCreate(BaseModel):
    identifier: str
    version: str
    supplier: str = ""
    description: Optional[str] = None
    ecu_id: Optional[str] = None
    a2l_filename: Optional[str] = None
    released_date: Optional[datetime] = None
    model_config = ConfigDict(populate_by_name=True)


class SWReleaseStatusUpdate(BaseModel):
    status: str
    model_config = ConfigDict(populate_by_name=True)


def _to_response(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "identifier": doc["identifier"],
        "version": doc["version"],
        "supplier": doc.get("supplier", ""),
        "description": doc.get("description", ""),
        "ecu_id": doc.get("ecu_id", ""),
        "status": doc.get("status", "DRAFT"),
        "a2l_filename": doc.get("a2l_filename"),
        "a2l_path": doc.get("a2l_path"),
        "a2l_uploaded_at": doc.get("a2l_uploaded_at"),
        "dcm_filename": doc.get("dcm_filename"),
        "dcm_path": doc.get("dcm_path"),
        "dcm_uploaded_at": doc.get("dcm_uploaded_at"),
        "dcm_summary": jl(doc.get("dcm_summary")),
        "has_dcm": bool(doc.get("dcm_filename")),
        "released_date": doc.get("released_date"),
        "created_by": doc.get("created_by", ""),
        "created_at": doc.get("created_at", ""),
    }


async def get_user(request: Request):
    return await get_current_user(request)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_sw_releases(
    status: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
    user: dict = Depends(get_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if supplier:
        conditions.append("supplier = ?")
        params.append(supplier)
    rows = await fetch_all(db, f"SELECT * FROM sw_releases WHERE {' AND '.join(conditions)} ORDER BY created_at DESC", tuple(params))
    return [_to_response(r) for r in rows]


@router.get("/{release_id}")
async def get_sw_release(release_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (release_id,))
    if not doc:
        raise HTTPException(404, "SW Release not found")
    return _to_response(doc)


@router.post("", status_code=201)
async def create_sw_release(body: SWReleaseCreate, user: dict = Depends(get_user)):
    db = get_conn()
    now = now_iso()
    new_id = str(uuid.uuid4())
    released = body.released_date.isoformat() if body.released_date else now
    await run(db, """
        INSERT INTO sw_releases (id, identifier, version, supplier, description, ecu_id, status, a2l_filename, released_date, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)
    """, (new_id, body.identifier, body.version, body.supplier, body.description or "", body.ecu_id or "",
          body.a2l_filename, released, user.get("email", ""), now))
    doc = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (new_id,))
    return _to_response(doc)


@router.patch("/{release_id}/status")
async def update_sw_release_status(release_id: str, body: SWReleaseStatusUpdate, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (release_id,))
    if not doc:
        raise HTTPException(404, "SW Release not found")
    await run(db, "UPDATE sw_releases SET status = ? WHERE id = ?", (body.status, release_id))
    return _to_response(await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (release_id,)))


@router.delete("/{release_id}", status_code=204)
async def delete_sw_release(release_id: str, user: dict = Depends(get_user)):
    """Hard delete SW Release and associated uploaded files."""
    from pathlib import Path
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (release_id,))
    if not doc:
        raise HTTPException(404, "SW Release not found")
    for field in ("a2l_path", "dcm_path"):
        path = doc.get(field)
        if path:
            try:
                Path(path).unlink(missing_ok=True)
            except Exception:
                pass
    await run(db, "DELETE FROM sw_releases WHERE id = ?", (release_id,))
    # Also remove from legacy table by identifier+version
    await run(db, "DELETE FROM software_releases WHERE software_release_identifier = ? AND version = ?",
              (doc.get("identifier", ""), doc.get("version", "")))
