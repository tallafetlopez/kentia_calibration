"""Datasets router for HERKO Calibration Manager."""

from fastapi import APIRouter, HTTPException, Query, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Literal, get_args
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from dependencies import get_db, get_current_user
from models import LabelLevel, LabelConfidence

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


class ReviewDomainRequest(BaseModel):
    domain: Literal["technical", "project_configuration", "regulatory", "vnv"]
    status: Literal["PENDING", "ACCEPTED", "REWORK_REQUIRED"]
    comments: Optional[str] = None


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    justification: str


class LabelUpdateRequest(BaseModel):
    current_value: Optional[str] = None
    level: Optional[str] = None
    confidence_status: Optional[str] = None
    regulatory_relevance: Optional[str] = None
    parametrizable_in_customer: Optional[str] = None
    change_justification: Optional[str] = None
    comments: Optional[str] = None

    @field_validator("level")
    @classmethod
    def validate_level(cls, v):
        allowed = set(get_args(LabelLevel))
        if v is not None and v not in allowed:
            raise ValueError(f"level must be one of {', '.join(sorted(allowed))}")
        return v

    @field_validator("confidence_status")
    @classmethod
    def validate_confidence_status(cls, v):
        allowed = set(get_args(LabelConfidence))
        if v is not None and v not in allowed:
            raise ValueError(f"confidence_status must be one of {', '.join(sorted(allowed))}")
        return v

    @field_validator("regulatory_relevance", "parametrizable_in_customer")
    @classmethod
    def validate_yes_no(cls, v):
        if v is not None and v not in {"YES", "NO"}:
            raise ValueError("Value must be YES or NO")
        return v


class DatasetResponse(DatasetBase):
    """Model for Dataset response."""
    id: str
    state: str
    sw_release_identifier: str
    is_locked: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(populate_by_name=True)


async def get_user(request: Request):
    return await get_current_user(request)


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

def _parse_a2l(content: str) -> list:
    """Extract CHARACTERISTIC and MEASUREMENT labels from A2L file content."""
    import re
    labels = []
    seen = set()

    # Match /begin CHARACTERISTIC or MEASUREMENT blocks
    pattern = re.compile(
        r'/begin\s+(CHARACTERISTIC|MEASUREMENT)\s+(\w+)\s+"([^"]*)"',
        re.IGNORECASE,
    )
    for m in pattern.finditer(content):
        block_type, name, description = m.group(1), m.group(2), m.group(3)
        if name in seen:
            continue
        seen.add(name)
        # Try to extract data type from next few lines after the match
        snippet = content[m.end():m.end() + 300]
        dtype_match = re.search(r'\b(FLOAT32_IEEE|FLOAT64_IEEE|UBYTE|SBYTE|UWORD|SWORD|ULONG|SLONG|A_UINT64|A_INT64)\b', snippet, re.IGNORECASE)
        data_type = dtype_match.group(0).upper() if dtype_match else ("FLOAT" if block_type.upper() == "CHARACTERISTIC" else "VALUE")
        labels.append({"label_name": name, "description": description, "data_type": data_type, "block_type": block_type.upper()})

    return labels


class ImportA2LRequest(BaseModel):
    a2l_content: str


@router.post("/{dataset_id}/labels/import-a2l")
async def import_labels_from_a2l(
    dataset_id: str,
    body: ImportA2LRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Parse A2L content and bulk-insert labels for a dataset."""
    dataset = await db.datasets.find_one({"id": dataset_id})
    if not dataset:
        try:
            dataset = await db.datasets.find_one({"_id": ObjectId(dataset_id)})
        except Exception:
            pass
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    parsed = _parse_a2l(body.a2l_content)
    if not parsed:
        raise HTTPException(status_code=422, detail="No labels found in A2L content")

    now = datetime.utcnow()
    author = user.get("username") or user.get("email")

    docs = []
    for lbl in parsed:
        docs.append({
            "dataset_id": dataset_id,
            "label_name": lbl["label_name"],
            "description": lbl.get("description", ""),
            "data_type": lbl.get("data_type", "FLOAT"),
            "block_type": lbl.get("block_type", "CHARACTERISTIC"),
            "current_value": None,
            "level": "CONFIGURATION",
            "confidence_status": "EMPTY",
            "regulatory_relevance": "NO",
            "parametrizable_in_customer": "NO",
            "modified": False,
            "created_by": author,
            "created_at": now.isoformat(),
        })

    result = await db.labels.insert_many(docs)

    await db.audit_log.insert_one({
        "entity_type": "dataset",
        "entity_id": dataset_id,
        "dataset_id": dataset_id,
        "action": "A2L_IMPORT",
        "author": author,
        "date": now.isoformat(),
        "justification": f"Imported {len(docs)} labels from A2L",
    })

    return {"imported": len(result.inserted_ids), "labels": [l["label_name"] for l in parsed]}


@router.get("/{dataset_id}/labels")
async def get_dataset_labels(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Return all labels for a dataset."""
    cursor = db.labels.find({"dataset_id": dataset_id})
    labels = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        labels.append(doc)
    return labels


@router.patch("/{dataset_id}/labels/{label_id}")
async def update_label(
    dataset_id: str,
    label_id: str,
    body: LabelUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Update a single label. Dataset must be in EDIT state."""
    dataset = await db.datasets.find_one({"id": dataset_id})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if dataset.get("lifecycle_state") != "EDIT":
        raise HTTPException(status_code=400, detail="Dataset is not in EDIT state")

    try:
        lbl_oid = ObjectId(label_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid label ID format")

    label = await db.labels.find_one({"_id": lbl_oid, "dataset_id": dataset_id})
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    old_value = label.get("current_value")
    value_changed = body.current_value is not None and body.current_value != old_value
    if value_changed and not (body.change_justification or "").strip():
        raise HTTPException(status_code=422, detail="change_justification is required when modifying current_value")

    now = datetime.utcnow()
    author = user.get("username") or user.get("email")

    update_fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if value_changed:
        update_fields["modified"] = True
    update_fields["last_modified_by"] = author
    update_fields["last_modification_date"] = now.isoformat()

    await db.labels.update_one({"_id": lbl_oid}, {"$set": update_fields})

    await db.audit_log.insert_one({
        "entity_type": "label",
        "entity_id": label_id,
        "dataset_id": dataset_id,
        "action": "LABEL_UPDATED",
        "author": author,
        "date": now.isoformat(),
        "previous_value": old_value,
        "new_value": body.current_value if body.current_value is not None else old_value,
        "justification": body.change_justification,
    })

    updated = await db.labels.find_one({"_id": lbl_oid})
    updated["id"] = str(updated.pop("_id"))
    return updated


@router.post("/{dataset_id}/review")
async def update_domain_review(
    dataset_id: str,
    body: ReviewDomainRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Update a single domain review status. Dataset must be UNDER_APPROVAL."""
    doc = await db.datasets.find_one({"id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if doc.get("lifecycle_state") != "UNDER_APPROVAL":
        raise HTTPException(status_code=400, detail="Dataset must be UNDER_APPROVAL")

    now = datetime.utcnow()
    author = user.get("username") or user.get("email")

    patch = {
        f"review.{body.domain}": body.status,
        f"review.{body.domain}_comments": body.comments or "",
        "last_modified_date": now.isoformat(),
    }

    if body.status == "REWORK_REQUIRED":
        patch["lifecycle_state"] = "EDIT"
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            patch[f"review.{k}"] = "PENDING"

    await db.datasets.update_one({"id": dataset_id}, {"$set": patch})

    await db.audit_log.insert_one({
        "entity_type": "dataset",
        "entity_id": dataset_id,
        "action": f"REVIEW_{body.domain.upper()}_{body.status}",
        "author": author,
        "date": now.isoformat(),
        "justification": body.comments or "",
    })

    updated = await db.datasets.find_one({"id": dataset_id}, {"_id": 0})
    return updated


@router.post("/{dataset_id}/approve")
async def approve_dataset_v1(
    dataset_id: str,
    body: ApprovalDecisionRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Final approval decision (APPROVED or REJECTED). Dataset must be UNDER_APPROVAL."""
    doc = await db.datasets.find_one({"id": dataset_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if doc.get("lifecycle_state") != "UNDER_APPROVAL":
        raise HTTPException(status_code=400, detail="Dataset must be UNDER_APPROVAL")

    review = doc.get("review", {})
    if body.decision == "APPROVED":
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            if review.get(k) != "ACCEPTED":
                raise HTTPException(status_code=400, detail=f"Review '{k}' is not ACCEPTED")

    now = datetime.utcnow()
    author = user.get("username") or user.get("email")

    if body.decision == "APPROVED":
        patch = {
            "lifecycle_state": "APPROVED",
            "review.approval_decision": "APPROVED",
            "review.approval_justification": body.justification,
            "review.approval_date": now.isoformat(),
            "review.approved_by": author,
            "last_modified_date": now.isoformat(),
        }
        audit_action = "UNDER_APPROVAL→APPROVED"
    else:
        patch = {
            "lifecycle_state": "EDIT",
            "review.approval_decision": "REJECTED",
            "review.approval_justification": body.justification,
            "review.rejected_by": author,
            "last_modified_date": now.isoformat(),
        }
        audit_action = "UNDER_APPROVAL→REJECTED→EDIT"

    await db.datasets.update_one({"id": dataset_id}, {"$set": patch})
    await db.audit_log.insert_one({
        "entity_type": "dataset",
        "entity_id": dataset_id,
        "action": audit_action,
        "author": author,
        "date": now.isoformat(),
        "justification": body.justification,
    })

    updated = await db.datasets.find_one({"id": dataset_id}, {"_id": 0})
    return updated


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
    """Return audit log entries for a dataset, most recent first."""
    cursor = db.audit_log.find({"dataset_id": dataset_id}).sort("date", -1)
    entries = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        entries.append(doc)
    return entries


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
    statuses = list(get_args(LabelConfidence))
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
