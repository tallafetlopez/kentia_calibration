"""Traceability router for HERKO Calibration Manager."""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase
from auth_utils import get_current_user

router = APIRouter(prefix="/traceability", tags=["Traceability"])


class VehicleSwIdInfo(BaseModel):
    """Vehicle SW ID information in traceability chain."""
    vehicle_sw_id: str
    vin: Optional[str] = None
    variant: Optional[str] = None
    mfg_order_ref: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(populate_by_name=True)


class DatasetInfo(BaseModel):
    """Dataset information in traceability chain."""
    name: str
    state: str
    context: str
    mode: str
    derived_from: Optional[str] = None
    is_locked: bool
    vehicle_sw_ids: List[VehicleSwIdInfo]

    model_config = ConfigDict(populate_by_name=True)


class SWReleaseInfo(BaseModel):
    """SW Release information in traceability chain."""
    identifier: str
    version: str
    status: str


class TraceabilityChain(BaseModel):
    """Full traceability chain."""
    sw_release: SWReleaseInfo
    datasets: List[DatasetInfo]

    model_config = ConfigDict(populate_by_name=True)


class AuditLogEntry(BaseModel):
    """Audit log entry — normalised across both audit_log and audit_logs collections."""
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


async def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database."""
    from server import db
    return db


async def get_user(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Resolve authenticated user with database dependency."""
    return await get_current_user(request, db)


@router.get("", response_model=List[TraceabilityChain])
async def get_traceability(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get full traceability chain: SW Release → Datasets → Vehicle_SW_IDs."""
    traceability = []

    # Get all SW Releases (that are not DEPRECATED)
    sw_releases = await db.sw_releases.find({"status": {"$ne": "DEPRECATED"}}).to_list(None)

    for sw_release in sw_releases:
        # Get datasets for this SW Release
        datasets = await db.datasets.find({
            "sw_release_id": str(sw_release["_id"]),
            "state": {"$ne": "DEPRECATED"}
        }).to_list(None)

        datasets_info = []
        for dataset in datasets:
            # Get Vehicle_SW_IDs for this dataset
            vehicle_sw_ids = await db.vehicle_sw_ids.find({
                "dataset_id": str(dataset["_id"])
            }).to_list(None)

            vehicles = [
                VehicleSwIdInfo(
                    vehicle_sw_id=v["vehicle_sw_id"],
                    vin=v.get("vin"),
                    variant=v.get("variant"),
                    mfg_order_ref=v.get("mfg_order_ref"),
                    created_at=v["created_at"],
                )
                for v in vehicle_sw_ids
            ]

            dataset_info = DatasetInfo(
                name=dataset["name"],
                state=dataset.get("state", "EDIT"),
                context=dataset["context"],
                mode=dataset["mode"],
                derived_from=dataset.get("derived_from"),
                is_locked=dataset.get("is_locked", False),
                vehicle_sw_ids=vehicles,
            )
            datasets_info.append(dataset_info)

        chain = TraceabilityChain(
            sw_release=SWReleaseInfo(
                identifier=sw_release["identifier"],
                version=sw_release["version"],
                status=sw_release.get("status", "DRAFT"),
            ),
            datasets=datasets_info,
        )
        traceability.append(chain)

    return traceability


def _normalise(doc: dict) -> AuditLogEntry:
    """Normalise a document from either audit_log or audit_logs collection."""
    entity_type = doc.get("entity_type") or doc.get("entity") or "unknown"
    raw_date = doc.get("date") or doc.get("timestamp")
    if isinstance(raw_date, str):
        try:
            raw_date = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        except Exception:
            raw_date = datetime.now(timezone.utc)
    if raw_date is None:
        raw_date = datetime.now(timezone.utc)

    known_keys = {"_id", "id", "action", "entity_type", "entity", "entity_id", "dataset_id",
                  "from_state", "to_state", "previous_value", "new_value", "author",
                  "date", "timestamp", "justification"}
    extra = {k: str(v) for k, v in doc.items() if k not in known_keys and k != "_id"}

    return AuditLogEntry(
        id=str(doc.get("id") or doc.get("_id") or ""),
        action=doc.get("action", ""),
        entity_type=entity_type,
        entity_id=doc.get("entity_id", ""),
        dataset_id=doc.get("dataset_id"),
        from_state=doc.get("from_state"),
        to_state=doc.get("to_state"),
        previous_value=doc.get("previous_value"),
        new_value=doc.get("new_value"),
        author=doc.get("author", ""),
        date=raw_date,
        justification=doc.get("justification"),
        extra=extra or None,
    )


@router.get("/audit-logs", response_model=List[AuditLogEntry])
async def get_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(200, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get audit logs with filters, sorted by date DESC. Queries both collections."""
    def build_query(type_field: str, date_field: str) -> dict:
        q: dict = {}
        if entity_type:
            q[type_field] = entity_type
        if entity_id:
            q["entity_id"] = entity_id
        if author:
            q["author"] = {"$regex": author, "$options": "i"}
        if action:
            q["action"] = {"$regex": action, "$options": "i"}
        date_filter: dict = {}
        if from_date:
            try:
                date_filter["$gte"] = datetime.fromisoformat(from_date)
            except Exception:
                pass
        if to_date:
            try:
                date_filter["$lte"] = datetime.fromisoformat(to_date)
            except Exception:
                pass
        if date_filter:
            q[date_field] = date_filter
        return q

    q1 = build_query("entity_type", "date")
    q2 = build_query("entity", "timestamp")

    docs1 = await db.audit_log.find(q1).sort("date", -1).limit(limit).to_list(None)
    docs2 = await db.audit_logs.find(q2).sort("timestamp", -1).limit(limit).to_list(None)

    all_docs = docs1 + docs2
    all_docs.sort(
        key=lambda d: (d.get("date") or d.get("timestamp") or datetime.min),
        reverse=True,
    )

    return [_normalise(d) for d in all_docs[:limit]]


@router.get("/chain")
async def get_chain(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Full traceability chain from old (UUID) collections: SW Release → Datasets → Labels → Vehicle_SW_IDs."""
    result = []

    sw_releases = await db.software_releases.find(
        {"status": {"$ne": "DEPRECATED"}}, {"_id": 0}
    ).to_list(None)

    for sr in sw_releases:
        datasets = await db.datasets.find(
            {"software_release_id": sr["id"], "lifecycle_state": {"$ne": "DEPRECATED"}},
            {"_id": 0},
        ).to_list(None)

        ds_list = []
        for ds in datasets:
            ds_id = ds["id"]

            labels_cursor = db.labels.find({"dataset_id": ds_id}, {"_id": 0})
            labels_raw = await labels_cursor.to_list(None)
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
                    "modified": l.get("modified", False),
                    "change_justification": l.get("change_justification"),
                }
                for l in labels_raw
            ]

            vsids_raw = await db.vehicle_sw_ids.find(
                {"dataset_id": ds_id}, {"_id": 0}
            ).to_list(None)
            vehicle_sw_ids = [
                {
                    "id": v.get("id", v.get("vehicle_sw_id", "")),
                    "vin": v.get("vin"),
                    "variant": v.get("variant") or v.get("variant_id"),
                    "mfg_order_ref": v.get("mfg_order_ref") or v.get("manufacturing_order_reference"),
                    "service_case_ref": v.get("service_case_ref") or v.get("service_case_reference"),
                    "created_at": str(v.get("created_at", "")),
                }
                for v in vsids_raw
            ]

            ds_list.append({
                "id": ds_id,
                "dataset_name": ds.get("dataset_name", ds.get("name", "")),
                "lifecycle_state": ds.get("lifecycle_state", ds.get("state", "EDIT")),
                "deployment_context": ds.get("deployment_context", ds.get("context", "")),
                "creation_mode": ds.get("creation_mode", ds.get("mode", "")),
                "author": ds.get("author", ""),
                "labels": labels,
                "vehicle_sw_ids": vehicle_sw_ids,
            })

        result.append({
            "sw_release": {
                "id": sr["id"],
                "identifier": sr.get("identifier", ""),
                "version": sr.get("version", ""),
                "status": sr.get("status", "DRAFT"),
            },
            "datasets": ds_list,
        })

    return result


@router.get("/audit-logs/authors", response_model=List[str])
async def get_audit_log_authors(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return distinct authors for autocomplete."""
    a1 = await db.audit_log.distinct("author")
    a2 = await db.audit_logs.distinct("author")
    authors = sorted(set(a1 + a2) - {None, ""})
    return authors
