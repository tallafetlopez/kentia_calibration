"""WorkPackages router — BeGas req #4."""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from pymongo import ReturnDocument

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from auth_utils import get_current_user, require_role
from models import WorkPackageCreate, WorkPackageUpdate, _uuid, _now

router = APIRouter(prefix="/work-packages", tags=["WorkPackages"])


async def _db():
    from server import db
    return db


async def _user(request: Request):
    db = await _db()
    return await get_current_user(request, db)


@router.get("")
async def list_work_packages(
    ecu_id: Optional[str] = None,
    active: Optional[bool] = None,
    request: Request = None,
):
    db = await _db()
    await _user(request)
    filt = {}
    if ecu_id:
        filt["ecu_id"] = ecu_id
    if active is not None:
        filt["active"] = active
    pipeline = [
        {"$match": filt},
        {"$project": {"_id": 0}},
        {"$lookup": {
            "from": "labels",
            "let": {"wp_id": "$id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$work_package_id", "$$wp_id"]}}},
                {"$count": "n"},
            ],
            "as": "_lc",
        }},
        {"$addFields": {"label_count": {"$ifNull": [{"$arrayElemAt": ["$_lc.n", 0]}, 0]}}},
        {"$project": {"_lc": 0}},
    ]
    return await db.work_packages.aggregate(pipeline).to_list(500)


@router.get("/{wp_id}")
async def get_work_package(wp_id: str, request: Request):
    db = await _db()
    await _user(request)
    wp = await db.work_packages.find_one({"id": wp_id}, {"_id": 0})
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    wp["label_count"] = await db.labels.count_documents({"work_package_id": wp_id})
    return wp


@router.post("", status_code=201)
async def create_work_package(body: WorkPackageCreate, request: Request):
    db = await _db()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    existing = await db.work_packages.find_one({"code": body.code, "ecu_id": body.ecu_id})
    if existing:
        raise HTTPException(400, f"WorkPackage code '{body.code}' already exists for this ECU")
    wp = body.model_dump()
    wp["id"] = _uuid()
    wp["active"] = True
    wp["created_at"] = _now()
    await db.work_packages.insert_one(wp)
    wp.pop("_id", None)
    return wp


@router.patch("/{wp_id}")
async def update_work_package(wp_id: str, body: WorkPackageUpdate, request: Request):
    db = await _db()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = await db.work_packages.find_one_and_update(
        {"id": wp_id},
        {"$set": patch} if patch else {"$set": {}},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(404, "WorkPackage not found")
    updated["label_count"] = await db.labels.count_documents({"work_package_id": wp_id})
    return updated


@router.delete("/{wp_id}", status_code=204)
async def delete_work_package(wp_id: str, request: Request):
    db = await _db()
    user = await _user(request)
    require_role(user, "DM_Administrator")
    wp = await db.work_packages.find_one({"id": wp_id}, {"_id": 0})
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    count = await db.labels.count_documents({"work_package_id": wp_id})
    if count > 0:
        raise HTTPException(400, f"Cannot delete WorkPackage with {count} labels assigned. Reassign labels first.")
    await db.work_packages.delete_one({"id": wp_id})


@router.get("/{wp_id}/labels")
async def list_wp_labels(wp_id: str, request: Request):
    db = await _db()
    await _user(request)
    wp = await db.work_packages.find_one({"id": wp_id}, {"_id": 0})
    if not wp:
        raise HTTPException(404, "WorkPackage not found")
    labels = await db.labels.find({"work_package_id": wp_id}, {"_id": 0}).to_list(10000)
    return {"work_package": wp, "labels": labels, "count": len(labels)}
