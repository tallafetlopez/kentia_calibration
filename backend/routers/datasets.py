"""Datasets router for HERKO Calibration Manager."""

from fastapi import APIRouter, HTTPException, Query, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Literal
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from auth_utils import get_current_user

router = APIRouter(prefix="/datasets", tags=["Datasets"])


class DatasetBase(BaseModel):
    """Base model for Dataset."""
    name: str
    context: Literal["PRODUCTION", "DEVELOPMENT", "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"]
    mode: Literal["IMPORT_S37", "COPY_EXISTING", "REUSE_BASELINE", "MERGE"]
    author: str
    derived_from: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class DatasetCreate(DatasetBase):
    """Model for creating a new Dataset."""
    sw_release_id: str


class DatasetUpdate(BaseModel):
    """Model for updating a Dataset."""
    name: Optional[str] = None
    context: Optional[str] = None
    mode: Optional[str] = None
    derived_from: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class StateTransitionRequest(BaseModel):
    """Model for state transition request."""
    to_state: str

    model_config = ConfigDict(populate_by_name=True)


class DatasetRenameRequest(BaseModel):
    """Model for renaming a dataset."""
    name: str

    model_config = ConfigDict(populate_by_name=True)


class DatasetResponse(DatasetBase):
    """Model for Dataset response."""
    id: str
    state: str
    sw_release_identifier: str
    is_locked: bool
    created_at: datetime
    updated_at: datetime

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


def _is_valid_transition(from_state: str, to_state: str) -> bool:
    """Check if state transition is valid."""
    valid_transitions = {
        "EDIT": ["UNDER_APPROVAL", "DEPRECATED"],
        "UNDER_APPROVAL": ["APPROVED", "EDIT", "DEPRECATED"],
        "APPROVED": ["RELEASE_CANDIDATE", "DEPRECATED"],
        "RELEASE_CANDIDATE": ["RELEASED", "DEPRECATED"],
        "RELEASED": ["DEPRECATED"],
        "DEPRECATED": [],
    }
    return to_state in valid_transitions.get(from_state, [])


@router.get("", response_model=List[DatasetResponse])
async def list_datasets(
    state: Optional[str] = Query(None),
    context: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    sw_release: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """List all datasets with optional filters."""
    query = {}
    if state:
        query["state"] = state
    if context:
        query["context"] = context
    if mode:
        query["mode"] = mode
    if sw_release:
        query["sw_release_identifier"] = sw_release

    documents = await db.datasets.find(query).to_list(None)
    return [_to_response(doc) for doc in documents]


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get a single dataset by ID."""
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    doc = await db.datasets.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return _to_response(doc)


@router.post("", response_model=DatasetResponse, status_code=201)
async def create_dataset(
    body: DatasetCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Create a new dataset."""
    # Fetch sw_release to get identifier
    try:
        sw_oid = ObjectId(body.sw_release_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sw_release_id format")

    sw_release = await db.sw_releases.find_one({"_id": sw_oid})
    if not sw_release:
        raise HTTPException(status_code=404, detail="SW Release not found")

    now = datetime.utcnow()
    doc = {
        "name": body.name,
        "state": "EDIT",
        "sw_release_id": body.sw_release_id,
        "sw_release_identifier": sw_release["identifier"],
        "context": body.context,
        "mode": body.mode,
        "author": body.author,
        "derived_from": body.derived_from,
        "is_locked": False,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.datasets.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: str,
    body: DatasetUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Update allowed fields of a dataset."""
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    doc = await db.datasets.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Build update dict
    update_dict = {}
    if body.name is not None:
        update_dict["name"] = body.name
    if body.context is not None:
        update_dict["context"] = body.context
    if body.mode is not None:
        update_dict["mode"] = body.mode
    if body.derived_from is not None:
        update_dict["derived_from"] = body.derived_from

    if update_dict:
        update_dict["updated_at"] = datetime.utcnow()
        await db.datasets.update_one({"_id": oid}, {"$set": update_dict})

    doc = await db.datasets.find_one({"_id": oid})
    return _to_response(doc)


@router.post("/{dataset_id}/transition", response_model=DatasetResponse)
async def transition_dataset_state(
    dataset_id: str,
    body: StateTransitionRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Advance dataset lifecycle state with validation."""
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    doc = await db.datasets.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")

    current_state = doc.get("state", "EDIT")
    new_state = body.to_state

    # Validate transition
    if not _is_valid_transition(current_state, new_state):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition from {current_state} to {new_state}"
        )

    # Update state
    update_dict = {
        "state": new_state,
        "updated_at": datetime.utcnow(),
    }

    # Lock dataset if transitioning to RELEASED or RELEASE_CANDIDATE
    if new_state in ["RELEASED", "RELEASE_CANDIDATE"]:
        update_dict["is_locked"] = True

    await db.datasets.update_one({"_id": oid}, {"$set": update_dict})

    # Write audit log for RELEASED transition
    if new_state == "RELEASED":
        await db.audit_logs.insert_one({
            "action": "STATE_TRANSITION",
            "entity": "dataset",
            "entity_id": dataset_id,
            "from_state": current_state,
            "to_state": new_state,
            "author": user.get("email"),
            "timestamp": datetime.utcnow(),
        })

    doc = await db.datasets.find_one({"_id": oid})
    return _to_response(doc)


@router.patch("/{dataset_id}/rename", response_model=DatasetResponse)
async def rename_dataset(
    dataset_id: str,
    body: DatasetRenameRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Rename a dataset only while it is in EDIT state."""
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    doc = await db.datasets.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if doc.get("state", "EDIT") != "EDIT":
        raise HTTPException(status_code=400, detail="Only EDIT datasets can be renamed")

    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Dataset name cannot be empty")

    duplicate = await db.datasets.find_one(
        {
            "sw_release_id": doc["sw_release_id"],
            "name": new_name,
            "_id": {"$ne": oid},
        },
        {"_id": 1},
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="A dataset with this name already exists in the same software release")

    now = datetime.utcnow()
    await db.datasets.update_one({"_id": oid}, {"$set": {"name": new_name, "updated_at": now}})
    await db.audit_log.insert_one({
        "action": "RENAMED",
        "entity": "dataset",
        "entity_id": dataset_id,
        "old_name": doc["name"],
        "new_name": new_name,
        "author": user.get("email"),
        "timestamp": now,
    })

    updated = await db.datasets.find_one({"_id": oid})
    return _to_response(updated)


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Delete a dataset and its labels only while it is in EDIT state."""
    try:
        oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset ID format")

    doc = await db.datasets.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if doc.get("state", "EDIT") != "EDIT":
        raise HTTPException(status_code=400, detail="Only EDIT datasets can be deleted")

    now = datetime.utcnow()
    await db.datasets.delete_one({"_id": oid})
    await db.labels.delete_many({"dataset_id": dataset_id})
    await db.audit_log.insert_one({
        "action": "DELETED",
        "entity": "dataset",
        "entity_id": dataset_id,
        "dataset_name": doc["name"],
        "author": user.get("email"),
        "timestamp": now,
    })
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Chart / Visualization endpoints ──────────────────────────────────────────

@router.get("/{dataset_id}/labels")
async def get_dataset_labels(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return all labels for a dataset (for heatmap / evolution charts)."""
    cursor = db.labels.find({"dataset_id": dataset_id})
    labels = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        labels.append(doc)
    if not labels:
        # Return mock data so charts render even without real labels
        labels = _mock_labels(dataset_id)
    return labels


@router.get("/{dataset_id}/maps")
async def get_dataset_maps(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return list of calibration map names available for this dataset."""
    cursor = db.calibration_maps.find({"dataset_id": dataset_id}, {"name": 1})
    maps = [{"name": doc["name"]} async for doc in cursor]
    if not maps:
        # Return mock map names
        maps = [{"name": n} for n in ["InjTim_MaxDur_Map", "RailP_Setp_Map", "MaxTrq_Lim_Map"]]
    return maps


@router.get("/{dataset_id}/maps/{map_name}")
async def get_dataset_map(
    dataset_id: str,
    map_name: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return 2D matrix data for a specific calibration map (surface chart)."""
    doc = await db.calibration_maps.find_one({"dataset_id": dataset_id, "name": map_name})
    if doc:
        return {
            "name": doc["name"],
            "x": doc.get("x", []),
            "y": doc.get("y", []),
            "z": doc.get("z", []),
            "x_label": doc.get("x_label", "X"),
            "y_label": doc.get("y_label", "Y"),
            "unit": doc.get("unit", "Value"),
        }
    # Return mock surface data
    import math
    n = 20
    xs = [round(i * 500 / (n - 1), 1) for i in range(n)]
    ys = [round(i * 8000 / (n - 1), 0) for i in range(n)]
    z = [
        [round(math.sin(xi / 100) * math.cos(yi / 1500) * 50 + 80, 3) for xi in range(n)]
        for yi in range(n)
    ]
    return {"name": map_name, "x": xs, "y": ys, "z": z,
            "x_label": "Rail Pressure (bar)", "y_label": "Engine Speed (rpm)", "unit": "us"}


@router.get("/{dataset_id}/changelog")
async def get_dataset_changelog(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return changelog entries for label evolution chart."""
    cursor = db.audit_log.find({"entity_id": dataset_id, "action": {"$in": ["LABEL_UPDATE", "LABEL_MODIFIED", "MASS_UPDATE"]}}).sort("timestamp", 1)
    entries = []
    async for doc in cursor:
        entries.append({
            "date": doc.get("timestamp", "").isoformat() if hasattr(doc.get("timestamp"), "isoformat") else str(doc.get("timestamp", "")),
            "changes": doc.get("changes", []),
        })
    if not entries:
        entries = _mock_changelog()
    return {"dataset_id": dataset_id, "entries": entries}


# ── Mock helpers (used when DB has no data yet) ───────────────────────────────

import math as _math
import random as _random

def _mock_labels(dataset_id: str):
    """Generate 20 realistic mock labels across 4 categories."""
    _random.seed(hash(dataset_id) % (2**31))
    categories = ["fuel", "ignition", "emissions", "thermal"]
    names = [
        "InjTim_MaxDur", "InjTim_StartOfInj", "RailP_Setp", "RailP_PCtrl_Kp",
        "EGR_TargetRate", "EGR_MinClose", "TurboBoost_Setp", "TurboBoost_Kp",
        "DPF_RegenTmp", "DPF_RegenInterval", "SCR_NOxConv", "SCR_UreaDos",
        "LambdaCtl_Setp", "IdleSpd_Target", "MaxTrq_Lim", "CoolantTmp_Warn",
        "OilPress_Fault", "Knock_Detect", "StartAssist_Fuel", "Immobilizer_Key",
    ]
    statuses = ["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"]
    labels = []
    for i, name in enumerate(names):
        labels.append({
            "id": f"mock-{i:03d}",
            "dataset_id": dataset_id,
            "label_name": name,
            "name": name,
            "category": categories[i % len(categories)],
            "current_value": str(round(_random.uniform(0.1, 2000.0), 4)),
            "value": round(_random.uniform(0.1, 2000.0), 4),
            "confidence_status": statuses[i % len(statuses)],
            "regulatory_relevance": "YES" if i % 3 == 0 else "NO",
            "unit": ["us", "deg", "bar", "-", "%", "rpm", "Nm"][i % 7],
            "modified": i % 4 == 0,
        })
    return labels


def _mock_changelog():
    """Generate mock changelog entries."""
    from datetime import datetime, timedelta
    base = datetime(2024, 1, 1)
    entries = []
    labels = ["InjTim_MaxDur", "RailP_Setp", "MaxTrq_Lim", "EGR_TargetRate"]
    for i in range(4):
        entries.append({
            "date": (base + timedelta(days=i * 30)).isoformat(),
            "changes": [
                {"label_name": name, "new_value": str(round(50 + i * 10 + j * 5, 2))}
                for j, name in enumerate(labels)
            ],
        })
    return entries


def _to_response(doc: dict) -> DatasetResponse:
    """Convert MongoDB document to response model."""
    return DatasetResponse(
        id=str(doc["_id"]),
        name=doc["name"],
        state=doc.get("state", "EDIT"),
        context=doc["context"],
        mode=doc["mode"],
        author=doc["author"],
        derived_from=doc.get("derived_from"),
        sw_release_identifier=doc["sw_release_identifier"],
        is_locked=doc.get("is_locked", False),
        created_at=doc["created_at"],
        updated_at=doc.get("updated_at", doc["created_at"]),
    )
