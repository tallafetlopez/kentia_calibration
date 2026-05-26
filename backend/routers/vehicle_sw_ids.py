"""Vehicle SW IDs router — SQLite."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pydantic import BaseModel, ConfigDict

from db import fetch_one, fetch_all, run, get_conn
from dependencies import get_current_user, now_iso

router = APIRouter(prefix="/vehicle-sw-ids", tags=["Vehicle SW IDs"])


class VehicleSwIdGenerateRequest(BaseModel):
    dataset_id: str
    vin: Optional[str] = None
    variant: Optional[str] = None
    mfg_order_ref: Optional[str] = None
    service_case_ref: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)


def _to_response(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "vehicle_sw_id": doc["vehicle_sw_id"],
        "sw_release_id": doc["software_release_id"],
        "sw_release_identifier": doc.get("sw_release_identifier", ""),
        "dataset_id": doc["dataset_id"],
        "dataset_name": doc.get("dataset_name", ""),
        "vin": doc.get("vin"),
        "variant": doc.get("variant") or doc.get("variant_id"),
        "mfg_order_ref": doc.get("mfg_order_ref") or doc.get("manufacturing_order_reference"),
        "service_case_ref": doc.get("service_case_ref") or doc.get("service_case_reference"),
        "created_by": doc.get("created_by", ""),
        "created_at": doc.get("creation_date", doc.get("created_at", "")),
    }


async def get_user(request: Request):
    return await get_current_user(request)


@router.get("")
async def list_vehicle_sw_ids(
    sw_release: Optional[str] = Query(None),
    dataset: Optional[str] = Query(None),
    user: dict = Depends(get_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if sw_release:
        conditions.append("sw_release_identifier = ?")
        params.append(sw_release)
    if dataset:
        conditions.append("dataset_name = ?")
        params.append(dataset)
    rows = await fetch_all(db, f"SELECT * FROM vehicle_sw_ids WHERE {' AND '.join(conditions)}", tuple(params))
    return [_to_response(r) for r in rows]


@router.get("/{vsid_id}")
async def get_vehicle_sw_id(vsid_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM vehicle_sw_ids WHERE id = ?", (vsid_id,))
    if not doc:
        raise HTTPException(404, "Vehicle SW ID not found")
    return _to_response(doc)


@router.post("/generate", status_code=201)
async def generate_vehicle_sw_id(body: VehicleSwIdGenerateRequest, user: dict = Depends(get_user)):
    db = get_conn()
    dataset = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (body.dataset_id,))
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    state = dataset.get("lifecycle_state", "EDIT")
    if state not in ("RELEASE_CANDIDATE", "RELEASED"):
        raise HTTPException(400, f"Dataset must be in RELEASE_CANDIDATE or RELEASED state (current: {state})")

    sr_id = dataset["software_release_id"]
    sw_release = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
    if not sw_release:
        raise HTTPException(404, "SW Release not found")

    new_id = str(uuid.uuid4())
    vehicle_sw_id = str(uuid.uuid4())
    now = now_iso()
    await run(db, """
        INSERT INTO vehicle_sw_ids
            (id, vehicle_sw_id, software_release_id, sw_release_identifier, dataset_id, dataset_name,
             vin, variant, mfg_order_ref, service_case_ref, creation_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (new_id, vehicle_sw_id, sr_id, sw_release.get("identifier", ""),
          body.dataset_id, dataset.get("dataset_name", ""),
          body.vin, body.variant, body.mfg_order_ref, body.service_case_ref,
          now, user.get("email", "")))
    doc = await fetch_one(db, "SELECT * FROM vehicle_sw_ids WHERE id = ?", (new_id,))
    return _to_response(doc)
