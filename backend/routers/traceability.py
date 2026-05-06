"""Traceability router for HERKO Calibration Manager."""

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
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
    """Audit log entry."""
    action: str
    entity: str
    entity_id: str
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    author: str
    timestamp: datetime

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


@router.get("/audit-logs", response_model=List[AuditLogEntry])
async def get_audit_logs(
    entity: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    author: Optional[str] = Query(None),
    limit: int = Query(50, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get audit logs with optional filters, sorted by timestamp DESC."""
    query = {}
    if entity:
        query["entity"] = entity
    if entity_id:
        query["entity_id"] = entity_id
    if author:
        query["author"] = author

    documents = await db.audit_logs.find(query).sort("timestamp", -1).limit(limit).to_list(None)
    return [
        AuditLogEntry(
            action=doc["action"],
            entity=doc["entity"],
            entity_id=doc["entity_id"],
            from_state=doc.get("from_state"),
            to_state=doc.get("to_state"),
            author=doc["author"],
            timestamp=doc["timestamp"],
        )
        for doc in documents
    ]
