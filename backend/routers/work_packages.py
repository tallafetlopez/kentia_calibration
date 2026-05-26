"""WorkPackages router — SQLite."""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from auth_utils import require_role
from models import WorkPackageCreate, WorkPackageUpdate, _uuid, _now
from db import fetch_one, fetch_all, run, get_conn

router = APIRouter(prefix="/work-packages", tags=["WorkPackages"])


async def _user(request: Request):
    from dependencies import get_current_user
    return await get_current_user(request)


@router.get("")
async def list_work_packages(
    ecu_id: Optional[str] = None,
    active: Optional[bool] = None,
    request: Request = None,
):
    db = get_conn()
    await _user(request)
    conditions = ["1=1"]
    params: list = []
    if ecu_id:
        conditions.append("wp.ecu_id = ?")
        params.append(ecu_id)
    if active is not None:
        conditions.append("wp.active = ?")
        params.append(1 if active else 0)
    sql = f"""
        SELECT wp.*, COUNT(l.id) as label_count
        FROM work_packages wp
        LEFT JOIN labels l ON l.work_package_id = wp.id
        WHERE {' AND '.join(conditions)}
        GROUP BY wp.id
        ORDER BY wp.code
    """
    rows = await fetch_all(db, sql, tuple(params))
    return [dict(r) for r in rows]


@router.get("/{wp_id}")
async def get_work_package(wp_id: str, request: Request):
    db = get_conn()
    await _user(request)
    wp = await fetch_one(db, "SELECT * FROM work_packages WHERE id = ?", (wp_id,))
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    from db import count
    wp["label_count"] = await count(db, "labels", "work_package_id = ?", (wp_id,))
    return wp


@router.post("", status_code=201)
async def create_work_package(body: WorkPackageCreate, request: Request):
    db = get_conn()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    existing = await fetch_one(db, "SELECT id FROM work_packages WHERE code = ? AND ecu_id = ?",
                               (body.code, body.ecu_id))
    if existing:
        raise HTTPException(400, f"WorkPackage code '{body.code}' already exists for this ECU")
    wp_id = _uuid()
    now = _now()
    await run(db, """
        INSERT INTO work_packages (id, code, name, description, ecu_id, sub_workpackage, responsible, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    """, (wp_id, body.code, body.name, body.description, body.ecu_id,
          body.sub_workpackage, body.responsible, now))
    wp = await fetch_one(db, "SELECT * FROM work_packages WHERE id = ?", (wp_id,))
    from db import count
    wp["label_count"] = 0
    return wp


@router.patch("/{wp_id}")
async def update_work_package(wp_id: str, body: WorkPackageUpdate, request: Request):
    db = get_conn()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    wp = await fetch_one(db, "SELECT * FROM work_packages WHERE id = ?", (wp_id,))
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        sets = ", ".join(f"{k} = ?" for k in patch)
        await run(db, f"UPDATE work_packages SET {sets} WHERE id = ?",
                  tuple(patch.values()) + (wp_id,))
    updated = await fetch_one(db, "SELECT * FROM work_packages WHERE id = ?", (wp_id,))
    from db import count
    updated["label_count"] = await count(db, "labels", "work_package_id = ?", (wp_id,))
    return updated


@router.delete("/{wp_id}", status_code=204)
async def delete_work_package(wp_id: str, request: Request):
    db = get_conn()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    wp = await fetch_one(db, "SELECT id FROM work_packages WHERE id = ?", (wp_id,))
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    from db import count
    n = await count(db, "labels", "work_package_id = ?", (wp_id,))
    if n > 0:
        raise HTTPException(400, f"Cannot delete WorkPackage with {n} labels assigned. Reassign labels first.")
    await run(db, "DELETE FROM work_packages WHERE id = ?", (wp_id,))


@router.get("/{wp_id}/labels")
async def list_wp_labels(wp_id: str, request: Request):
    db = get_conn()
    await _user(request)
    wp = await fetch_one(db, "SELECT * FROM work_packages WHERE id = ?", (wp_id,))
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    labels = await fetch_all(db, "SELECT * FROM labels WHERE work_package_id = ?", (wp_id,))
    return {"work_package": wp, "labels": labels, "count": len(labels)}
