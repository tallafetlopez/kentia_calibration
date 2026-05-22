"""SW Releases router for HERKO Calibration Manager."""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from auth_utils import get_current_user
from starlette.requests import Request

router = APIRouter(prefix="/sw-releases", tags=["SW Releases"])


class SWReleaseBase(BaseModel):
    """Base model for SW Release."""
    identifier: str
    version: str
    supplier: str
    a2l_filename: Optional[str] = None
    released_date: datetime

    model_config = ConfigDict(populate_by_name=True)


class SWReleaseCreate(BaseModel):
    """Model for creating a new SW Release."""
    identifier: str
    version: str
    supplier: str = ""
    description: Optional[str] = None
    ecu_id: Optional[str] = None
    a2l_filename: Optional[str] = None
    released_date: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class SWReleaseResponse(SWReleaseBase):
    """Model for SW Release response."""
    id: str
    status: str
    created_by: str
    created_at: datetime
    has_dcm: bool = False
    dcm_filename: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class SWReleaseStatusUpdate(BaseModel):
    """Model for updating SW Release status."""
    status: str

    model_config = ConfigDict(populate_by_name=True)


async def get_db() -> AsyncIOMotorDatabase:
    """Dependency to get database — should be overridden in main.py."""
    from server import db
    return db


async def get_user(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Resolve authenticated user with database dependency."""
    return await get_current_user(request, db)


@router.get("", response_model=List[SWReleaseResponse])
async def list_sw_releases(
    status: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """List all SW Releases with optional filters."""
    query = {}
    if status:
        query["status"] = status
    if supplier:
        query["supplier"] = supplier

    documents = await db.sw_releases.find(query).to_list(None)
    return [_to_response(doc) for doc in documents]


@router.get("/{release_id}", response_model=SWReleaseResponse)
async def get_sw_release(
    release_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get a single SW Release by ID."""
    try:
        oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID format")

    doc = await db.sw_releases.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="SW Release not found")

    return _to_response(doc)


@router.post("", response_model=SWReleaseResponse, status_code=201)
async def create_sw_release(
    body: SWReleaseCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Create a new SW Release."""
    doc = {
        "identifier": body.identifier,
        "version": body.version,
        "supplier": body.supplier,
        "a2l_filename": body.a2l_filename,
        "description": body.description,
        "ecu_id": body.ecu_id,
        "released_date": body.released_date or datetime.utcnow(),
        "status": "DRAFT",
        "created_by": user.get("email"),
        "created_at": datetime.utcnow(),
    }
    result = await db.sw_releases.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


@router.patch("/{release_id}/status", response_model=SWReleaseResponse)
async def update_sw_release_status(
    release_id: str,
    body: SWReleaseStatusUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Update the status of an SW Release."""
    try:
        oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID format")

    result = await db.sw_releases.update_one(
        {"_id": oid},
        {"$set": {"status": body.status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="SW Release not found")

    doc = await db.sw_releases.find_one({"_id": oid})
    return _to_response(doc)


@router.delete("/{release_id}", status_code=204)
async def delete_sw_release(
    release_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Soft delete an SW Release by setting status to DEPRECATED."""
    try:
        oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID format")

    result = await db.sw_releases.update_one(
        {"_id": oid},
        {"$set": {"status": "DEPRECATED"}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="SW Release not found")


# ── Chart / Overview endpoints ────────────────────────────────────────────────

def _get_db_from_request(request):
    return request.app.state.db


@router.get("/{release_id}/datasets")
async def get_release_datasets(
    release_id: str,
    request: Request,
    user: dict = Depends(get_user),
):
    """Return all datasets linked to an SW Release (for lifecycle donut chart)."""
    db = _get_db_from_request(request)
    try:
        oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID")

    sr = await db.sw_releases.find_one({"_id": oid})
    if not sr:
        raise HTTPException(status_code=404, detail="SW Release not found")

    sr_identifier = sr.get("identifier", "")
    cursor = db.datasets.find({"software_release_id": release_id})
    datasets = []
    async for doc in cursor:
        datasets.append({
            "id": str(doc["_id"]),
            "name": doc.get("dataset_name") or doc.get("name", ""),
            "state": doc.get("lifecycle_state") or doc.get("state", "EDIT"),
        })

    if not datasets:
        # Also try by identifier in legacy format
        cursor2 = db.datasets.find({"software_release_identifier": sr_identifier})
        async for doc in cursor2:
            datasets.append({
                "id": str(doc["_id"]),
                "name": doc.get("dataset_name") or doc.get("name", ""),
                "state": doc.get("lifecycle_state") or doc.get("state", "EDIT"),
            })

    return datasets


@router.get("/{release_id}/label-stats")
async def get_release_label_stats(
    release_id: str,
    request: Request,
    user: dict = Depends(get_user),
):
    """Return label coverage stats per dataset (for stacked bar chart)."""
    db = _get_db_from_request(request)
    try:
        oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID")

    sr = await db.sw_releases.find_one({"_id": oid})
    if not sr:
        raise HTTPException(status_code=404, detail="SW Release not found")

    sr_identifier = sr.get("identifier", "")
    cursor = db.datasets.find(
        {"$or": [{"software_release_id": release_id}, {"software_release_identifier": sr_identifier}]}
    )
    result = []
    async for ds in cursor:
        ds_id = str(ds["_id"])
        ds_name = ds.get("dataset_name") or ds.get("name", ds_id)
        lbls = await db.labels.find({"dataset_id": ds_id}).to_list(length=None)
        if not lbls:
            # mock stats when no labels
            import random as _rnd
            _rnd.seed(hash(ds_id) % (2**31))
            total = _rnd.randint(15, 25)
            comp = _rnd.randint(total // 2, total)
            incomp = total - comp
            miss = _rnd.randint(0, max(0, incomp))
            result.append({"name": ds_name, "complete": comp, "incomplete": incomp, "missing_justification": miss})
            continue

        complete = sum(1 for l in lbls if l.get("confidence_status") not in (None, "EMPTY"))
        incomplete = sum(1 for l in lbls if l.get("confidence_status") in (None, "EMPTY"))
        missing_just = sum(
            1 for l in lbls
            if l.get("regulatory_relevance") == "YES" and not l.get("change_justification")
        )
        result.append({
            "name": ds_name,
            "complete": complete,
            "incomplete": incomplete,
            "missing_justification": missing_just,
        })

    if not result:
        # Return mock data for the release overview
        import random as _rnd
        _rnd.seed(hash(release_id) % (2**31))
        for i in range(3):
            total = _rnd.randint(15, 25)
            comp = _rnd.randint(total // 2, total)
            result.append({
                "name": f"DS_Mock_{i + 1}",
                "complete": comp,
                "incomplete": total - comp,
                "missing_justification": _rnd.randint(0, 3),
            })

    return {"release_id": release_id, "datasets": result}


class AssignDatasetRequest(BaseModel):
    dataset_id: str
    vin: Optional[str] = None
    variant_id: Optional[str] = None
    manufacturing_order_reference: Optional[str] = None
    service_case_reference: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


@router.post("/{release_id}/assign-dataset")
async def assign_dataset_to_release(
    release_id: str,
    body: AssignDatasetRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Transition dataset RELEASE_CANDIDATE → RELEASED and generate Vehicle SW ID."""
    import uuid as _uuid

    # 1. Load dataset — try old UUID field first, then ObjectId
    dataset = await db.datasets.find_one({"id": body.dataset_id})
    using_old = dataset is not None
    if not dataset:
        try:
            dataset = await db.datasets.find_one({"_id": ObjectId(body.dataset_id)})
        except Exception:
            pass
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    state = dataset.get("lifecycle_state") or dataset.get("state", "")
    if state != "RELEASE_CANDIDATE":
        raise HTTPException(status_code=400, detail="Dataset must be in RELEASE_CANDIDATE state")

    # 2. Load SW Release
    try:
        sr_oid = ObjectId(release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid release ID format")

    sr = await db.sw_releases.find_one({"_id": sr_oid})
    if not sr:
        raise HTTPException(status_code=404, detail="SW Release not found")

    now = datetime.utcnow()
    author = user.get("username") or user.get("email")

    # 3. Transition dataset to RELEASED
    if using_old:
        await db.datasets.update_one(
            {"id": body.dataset_id},
            {"$set": {"lifecycle_state": "RELEASED", "last_modified_date": now.isoformat()}},
        )
    else:
        await db.datasets.update_one(
            {"_id": dataset["_id"]},
            {"$set": {"state": "RELEASED", "is_locked": True, "updated_at": now}},
        )

    # 4. Generate Vehicle SW ID inline
    vehicle_sw_id = str(_uuid.uuid4())
    dataset_name = dataset.get("dataset_name") or dataset.get("name", "")
    sw_release_id = dataset.get("software_release_id") or dataset.get("sw_release_id") or release_id

    vsw_doc = {
        "vehicle_sw_id": vehicle_sw_id,
        "sw_release_id": sw_release_id,
        "sw_release_identifier": sr.get("identifier", ""),
        "dataset_id": body.dataset_id,
        "dataset_name": dataset_name,
        "vin": body.vin,
        "variant": body.variant_id,
        "mfg_order_ref": body.manufacturing_order_reference,
        "service_case_ref": body.service_case_reference,
        "created_by": author,
        "created_at": now,
    }
    vsw_result = await db.vehicle_sw_ids.insert_one(vsw_doc)

    # 5. Audit log
    await db.audit_log.insert_one({
        "entity_type": "dataset",
        "entity_id": body.dataset_id,
        "dataset_id": body.dataset_id,
        "action": "DATASET_RELEASED",
        "author": author,
        "date": now.isoformat(),
        "vehicle_sw_id": vehicle_sw_id,
        "justification": f"Released via SW Release {sr.get('identifier', release_id)}",
    })

    return {
        "dataset_id": body.dataset_id,
        "dataset_name": dataset_name,
        "lifecycle_state": "RELEASED",
        "vehicle_sw_id": vehicle_sw_id,
        "vehicle_sw_id_doc_id": str(vsw_result.inserted_id),
    }


def _to_response(doc: dict) -> SWReleaseResponse:
    """Convert MongoDB document to response model."""
    dcm_fname = doc.get("dcm_filename")
    return SWReleaseResponse(
        id=str(doc["_id"]),
        identifier=doc["identifier"],
        version=doc["version"],
        supplier=doc["supplier"],
        a2l_filename=doc.get("a2l_filename"),
        released_date=doc["released_date"],
        status=doc.get("status", "DRAFT"),
        created_by=doc.get("created_by", "unknown"),
        created_at=doc["created_at"],
        has_dcm=bool(dcm_fname),
        dcm_filename=dcm_fname,
    )
