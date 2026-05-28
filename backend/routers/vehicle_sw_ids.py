"""Vehicle SW IDs router for HERKO Calibration Manager."""

from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import uuid
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/vehicle-sw-ids", tags=["Vehicle SW IDs"])


class VehicleSwIdGenerateRequest(BaseModel):
    """Request model for generating a new Vehicle SW ID."""
    dataset_id: str
    vin: Optional[str] = None
    variant: Optional[str] = None
    mfg_order_ref: Optional[str] = None
    service_case_ref: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class VehicleSwIdResponse(BaseModel):
    """Response model for Vehicle SW ID."""
    id: str
    vehicle_sw_id: str
    sw_release_id: str
    sw_release_identifier: str
    dataset_id: str
    dataset_name: str
    vin: Optional[str] = None
    variant: Optional[str] = None
    mfg_order_ref: Optional[str] = None
    service_case_ref: Optional[str] = None
    created_by: str
    created_at: datetime

    model_config = ConfigDict(populate_by_name=True)


async def get_user(request: Request):
    return await get_current_user(request)


@router.get("", response_model=List[VehicleSwIdResponse])
async def list_vehicle_sw_ids(
    sw_release: Optional[str] = Query(None),
    dataset: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """List all Vehicle SW IDs with optional filters."""
    query = {}
    if sw_release:
        query["sw_release_identifier"] = sw_release
    if dataset:
        query["dataset_name"] = dataset

    documents = await db.vehicle_sw_ids.find(query).to_list(None)
    return [_to_response(doc) for doc in documents]


@router.get("/{vehicle_sw_id_id}", response_model=VehicleSwIdResponse)
async def get_vehicle_sw_id(
    vehicle_sw_id_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Get a single Vehicle SW ID by ID."""
    try:
        oid = ObjectId(vehicle_sw_id_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Vehicle SW ID format")

    doc = await db.vehicle_sw_ids.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Vehicle SW ID not found")

    return _to_response(doc)


@router.post("/generate", response_model=VehicleSwIdResponse, status_code=201)
async def generate_vehicle_sw_id(
    body: VehicleSwIdGenerateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_user),
):
    """Generate a new Vehicle SW ID linked to a dataset.
    
    Validates that the dataset is in RELEASE_CANDIDATE or RELEASED state.
    """
    # 1. Fetch the dataset
    try:
        dataset_oid = ObjectId(body.dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset_id format")

    dataset = await db.datasets.find_one({"_id": dataset_oid})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # 2. Validate dataset state
    dataset_state = dataset.get("state")
    if dataset_state not in ["RELEASE_CANDIDATE", "RELEASED"]:
        raise HTTPException(
            status_code=400,
            detail=f"Dataset must be in RELEASE_CANDIDATE or RELEASED state (current: {dataset_state})"
        )

    # 3. Fetch sw_release
    try:
        sw_oid = ObjectId(dataset["sw_release_id"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sw_release_id in dataset")

    sw_release = await db.sw_releases.find_one({"_id": sw_oid})
    if not sw_release:
        raise HTTPException(status_code=404, detail="SW Release not found")

    # 4. Generate Vehicle_SW_ID
    vehicle_sw_id = str(uuid.uuid4())

    # 5. Create and persist document
    doc = {
        "vehicle_sw_id": vehicle_sw_id,
        "sw_release_id": str(sw_oid),
        "sw_release_identifier": sw_release["identifier"],
        "dataset_id": body.dataset_id,
        "dataset_name": dataset["name"],
        "vin": body.vin,
        "variant": body.variant,
        "mfg_order_ref": body.mfg_order_ref,
        "service_case_ref": body.service_case_ref,
        "created_by": user.get("email"),
        "created_at": datetime.utcnow(),
    }
    result = await db.vehicle_sw_ids.insert_one(doc)
    doc["_id"] = result.inserted_id

    return _to_response(doc)


def _to_response(doc: dict) -> VehicleSwIdResponse:
    """Convert MongoDB document to response model."""
    return VehicleSwIdResponse(
        id=str(doc["_id"]),
        vehicle_sw_id=doc["vehicle_sw_id"],
        sw_release_id=doc["sw_release_id"],
        sw_release_identifier=doc["sw_release_identifier"],
        dataset_id=doc["dataset_id"],
        dataset_name=doc["dataset_name"],
        vin=doc.get("vin"),
        variant=doc.get("variant"),
        mfg_order_ref=doc.get("mfg_order_ref"),
        service_case_ref=doc.get("service_case_ref"),
        created_by=doc.get("created_by", "unknown"),
        created_at=doc["created_at"],
    )
