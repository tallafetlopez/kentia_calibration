"""Traceability router — SQLite."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict

from db import fetch_all, fetch_one, get_conn, jl
from dependencies import get_current_user

router = APIRouter(prefix="/traceability", tags=["Traceability"])


class AuditLogEntry(BaseModel):
    id: Optional[str] = None
    action: str
    entity_type: str
    entity_id: str
    dataset_id: Optional[str] = None
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    previous_value: Optional[Any] = None
    new_value: Optional[Any] = None
    author: str
    date: datetime
    justification: Optional[str] = None
    extra: Optional[dict] = None
    model_config = ConfigDict(populate_by_name=True)


async def get_user(request: Request):
    return await get_current_user(request)


@router.get("")
async def get_traceability(user: dict = Depends(get_user)):
    db = get_conn()
    sw_releases = await fetch_all(db, "SELECT * FROM sw_releases WHERE status != 'DEPRECATED'")
    result = []
    for sr in sw_releases:
        sr_id = sr["id"]
        datasets = await fetch_all(db, "SELECT * FROM datasets WHERE software_release_id=? AND lifecycle_state != 'DEPRECATED'", (sr_id,))
        ds_list = []
        for ds in datasets:
            ds_id = ds["id"]
            vehicles = await fetch_all(db, "SELECT * FROM vehicle_sw_ids WHERE dataset_id=?", (ds_id,))
            ds_list.append({
                "name": ds.get("dataset_name", ""),
                "state": ds.get("lifecycle_state", "EDIT"),
                "context": ds.get("deployment_context", ""),
                "mode": ds.get("creation_mode", ""),
                "derived_from": ds.get("baseline_dataset_id") or None,
                "is_locked": bool(ds.get("locked", 0)),
                "vehicle_sw_ids": [
                    {
                        "vehicle_sw_id": v.get("vehicle_sw_id", v.get("id", "")),
                        "vin": v.get("vin"),
                        "variant": v.get("variant") or v.get("variant_id"),
                        "mfg_order_ref": v.get("mfg_order_ref") or v.get("manufacturing_order_reference"),
                        "created_at": v.get("creation_date", ""),
                    }
                    for v in vehicles
                ],
            })
        result.append({
            "sw_release": {"identifier": sr["identifier"], "version": sr["version"], "status": sr.get("status", "DRAFT")},
            "datasets": ds_list,
        })
    return result


@router.get("/chain")
async def get_chain(user: dict = Depends(get_user)):
    """Full traceability chain from legacy collections: SW Release → Datasets → Labels → Vehicle_SW_IDs."""
    db = get_conn()
    sw_releases = await fetch_all(db, "SELECT * FROM software_releases WHERE status != 'DEPRECATED'")
    result = []
    for sr in sw_releases:
        sr_id = sr["id"]
        datasets = await fetch_all(db, "SELECT * FROM datasets WHERE software_release_id=? AND lifecycle_state != 'DEPRECATED'", (sr_id,))
        ds_list = []
        for ds in datasets:
            ds_id = ds["id"]
            labels_raw = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))
            labels = [
                {
                    "id": l.get("id", ""),
                    "label_name": l.get("label_name", ""),
                    "current_value": l.get("current_value"),
                    "level": l.get("level", ""),
                    "confidence_status": l.get("confidence_status", ""),
                    "regulatory_relevance": l.get("regulatory_relevance", "NO"),
                    "last_modified_by": l.get("last_modified_by", ""),
                    "last_modification_date": l.get("last_modification_date"),
                    "modified": bool(l.get("modified", 0)),
                    "change_justification": l.get("change_justification"),
                }
                for l in labels_raw
            ]
            vsids_raw = await fetch_all(db, "SELECT * FROM vehicle_sw_ids WHERE dataset_id=?", (ds_id,))
            vehicle_sw_ids = [
                {
                    "id": v.get("id", ""),
                    "vin": v.get("vin"),
                    "variant": v.get("variant") or v.get("variant_id"),
                    "mfg_order_ref": v.get("mfg_order_ref") or v.get("manufacturing_order_reference"),
                    "service_case_ref": v.get("service_case_ref") or v.get("service_case_reference"),
                    "created_at": str(v.get("creation_date", "")),
                }
                for v in vsids_raw
            ]
            ds_list.append({
                "id": ds_id,
                "dataset_name": ds.get("dataset_name", ""),
                "lifecycle_state": ds.get("lifecycle_state", "EDIT"),
                "deployment_context": ds.get("deployment_context", ""),
                "creation_mode": ds.get("creation_mode", ""),
                "author": ds.get("author", ""),
                "labels": labels,
                "vehicle_sw_ids": vehicle_sw_ids,
            })
        result.append({
            "sw_release": {
                "id": sr_id,
                "identifier": sr.get("software_release_identifier", sr.get("identifier", "")),
                "version": sr.get("version", ""),
                "status": sr.get("status", "DRAFT"),
            },
            "datasets": ds_list,
        })
    return result


def _parse_date(raw) -> datetime:
    if isinstance(raw, datetime):
        return raw
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _normalise(doc: dict) -> dict:
    return {
        "id": doc.get("id", ""),
        "action": doc.get("action", ""),
        "entity_type": doc.get("entity_type", "unknown"),
        "entity_id": doc.get("entity_id", ""),
        "dataset_id": doc.get("dataset_id"),
        "from_state": doc.get("from_state"),
        "to_state": doc.get("to_state"),
        "previous_value": doc.get("previous_value"),
        "new_value": doc.get("new_value"),
        "author": doc.get("author", ""),
        "date": _parse_date(doc.get("date")),
        "justification": doc.get("justification"),
        "extra": jl(doc.get("extra")) or None,
    }


@router.get("/audit-logs")
async def get_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    user: dict = Depends(get_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if entity_type:
        types = [v.strip() for v in entity_type.split(",")]
        placeholders = ",".join("?" * len(types))
        conditions.append(f"entity_type IN ({placeholders})")
        params.extend(types)
    if entity_id:
        conditions.append("entity_id = ?")
        params.append(entity_id)
    if author:
        conditions.append("author LIKE ?")
        params.append(f"%{author}%")
    if action:
        actions = [v.strip() for v in action.split(",")]
        if len(actions) == 1:
            conditions.append("action LIKE ?")
            params.append(f"%{actions[0]}%")
        else:
            placeholders = ",".join("?" * len(actions))
            conditions.append(f"action IN ({placeholders})")
            params.extend(actions)
    if from_date:
        conditions.append("date >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("date <= ?")
        params.append(to_date)
    rows = await fetch_all(db, f"SELECT * FROM audit_log WHERE {' AND '.join(conditions)} ORDER BY date DESC LIMIT ?",
                           tuple(params) + (limit,))
    return [_normalise(r) for r in rows]


@router.get("/audit-logs/authors")
async def get_audit_log_authors(user: dict = Depends(get_user)):
    db = get_conn()
    rows = await fetch_all(db, "SELECT DISTINCT author FROM audit_log WHERE author != '' ORDER BY author")
    return [r["author"] for r in rows]
