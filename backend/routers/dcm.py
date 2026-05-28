"""
DCM Router — SW Release DCM file management
Prefix: /api/v1  (mounted in server.py)

Endpoints:
  POST   /sw-releases/{id}/dcm/upload
  GET    /sw-releases/{id}/dcm/summary
  GET    /sw-releases/{id}/dcm/parameters
  GET    /sw-releases/{id}/dcm/parameters/{param_name}
  POST   /datasets/{dataset_id}/import-from-dcm
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Optional, Union

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

# Ensure parsers dir is importable when running from backend/
_BACKEND_DIR = Path(__file__).parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
_PARSERS_DIR = _BACKEND_DIR / "parsers"
if str(_PARSERS_DIR) not in sys.path:
    sys.path.insert(0, str(_PARSERS_DIR))

from parsers.dcm_parser import DCMParser  # noqa: E402
from dependencies import get_db, get_current_user, now_iso as _now_iso, require_sr as _require_sr  # noqa: E402

router = APIRouter(tags=["DCM Management"])

UPLOADS_DIR = _BACKEND_DIR / "uploads" / "dcm"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# ─── response models ───────────────────────────────────────────────────────────

class DCMSummaryResponse(BaseModel):
    filename: str
    size_bytes: int
    uploaded_at: str
    summary: dict


class DCMParameterItem(BaseModel):
    name: str
    long_name: str
    unit: str
    type: str          # scalar | curve | map
    value_preview: Union[str, float, None]


class DCMParameterDetail(BaseModel):
    name: str
    long_name: str
    type: str
    unit: Optional[str] = None
    unit_x: Optional[str] = None
    unit_y: Optional[str] = None
    unit_w: Optional[str] = None
    value: Optional[Union[float, str]] = None
    x_axis: Optional[List[float]] = None
    y_axis: Optional[List[float]] = None
    values: Optional[Union[List[float], List[List[float]]]] = None
    size: Optional[int] = None
    rows: Optional[int] = None
    cols: Optional[int] = None


class DCMImportBody(BaseModel):
    sw_release_id: str
    parameter_names: Union[List[str], str]  # list of names or "all_scalars"


class DCMImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


# ─── helpers ──────────────────────────────────────────────────────────────────

async def _get_parsed(sr: dict) -> dict:
    """Parse the DCM file for the given sw_release document."""
    dcm_path = sr.get("dcm_path")
    if not dcm_path or not Path(dcm_path).exists():
        raise HTTPException(status_code=404, detail="No DCM file uploaded for this SW Release")
    parser = DCMParser()
    return parser.parse(dcm_path)


# ─── endpoints ────────────────────────────────────────────────────────────────

@router.post("/sw-releases/{sr_id}/dcm/upload", response_model=DCMSummaryResponse)
async def upload_dcm(
    sr_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)

    fname = file.filename or ""
    if not fname.lower().endswith(".dcm"):
        raise HTTPException(status_code=400, detail="Only .dcm files are accepted")

    safe_name = f"{sr_id}_{fname}"
    dest = UPLOADS_DIR / safe_name
    contents = await file.read()
    dest.write_bytes(contents)
    size_bytes = len(contents)

    # Parse immediately
    parser = DCMParser()
    parsed = parser.parse(str(dest))
    summary = parsed["summary"]

    uploaded_at = _now_iso()

    # Persist in sw_release document
    await db.sw_releases.update_one(
        {"_id": ObjectId(sr_id)},
        {"$set": {
            "dcm_filename": fname,
            "dcm_path": str(dest),
            "dcm_uploaded_at": uploaded_at,
            "dcm_summary": summary,
        }},
    )

    return DCMSummaryResponse(
        filename=fname,
        size_bytes=size_bytes,
        uploaded_at=uploaded_at,
        summary=summary,
    )


@router.delete("/sw-releases/{sr_id}/dcm", status_code=204)
async def delete_dcm(
    sr_id: str,
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    if sr.get("dcm_path"):
        try:
            Path(sr["dcm_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    await db.sw_releases.update_one(
        {"_id": ObjectId(sr_id)},
        {"$unset": {"dcm_filename": "", "dcm_path": "", "dcm_uploaded_at": "", "dcm_summary": ""}},
    )


@router.get("/sw-releases/{sr_id}/dcm/summary", response_model=DCMSummaryResponse)
async def get_dcm_summary(
    sr_id: str,
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)

    if not sr.get("dcm_filename"):
        raise HTTPException(status_code=404, detail="No DCM file uploaded for this SW Release")

    dcm_path = sr.get("dcm_path", "")
    size_bytes = Path(dcm_path).stat().st_size if dcm_path and Path(dcm_path).exists() else 0

    return DCMSummaryResponse(
        filename=sr["dcm_filename"],
        size_bytes=size_bytes,
        uploaded_at=sr.get("dcm_uploaded_at", ""),
        summary=sr.get("dcm_summary", {}),
    )


@router.get("/sw-releases/{sr_id}/dcm/parameters", response_model=dict)
async def list_dcm_parameters(
    sr_id: str,
    type: Optional[str] = Query(None, description="scalar | curve | map"),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    parsed = await _get_parsed(sr)

    items: list[DCMParameterItem] = []

    if not type or type == "scalar":
        for p in parsed["scalars"]:
            items.append(DCMParameterItem(
                name=p["name"], long_name=p["long_name"],
                unit=p["unit"], type="scalar",
                value_preview=p["value"],
            ))

    if not type or type == "curve":
        for p in parsed["curves"]:
            items.append(DCMParameterItem(
                name=p["name"], long_name=p["long_name"],
                unit=p.get("unit_w", ""), type="curve",
                value_preview=f"1D [{p['size']} points]",
            ))

    if not type or type == "map":
        for p in parsed["maps"]:
            items.append(DCMParameterItem(
                name=p["name"], long_name=p["long_name"],
                unit=p.get("unit_w", ""), type="map",
                value_preview=f"2D [{p['rows']}×{p['cols']}]",
            ))

    # Filter by search
    if search:
        q = search.lower()
        items = [it for it in items if q in it.name.lower() or q in it.long_name.lower()]

    total = len(items)
    page = items[offset: offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [it.model_dump() for it in page],
    }


@router.get("/sw-releases/{sr_id}/dcm/parameters/{param_name}", response_model=DCMParameterDetail)
async def get_dcm_parameter(
    sr_id: str,
    param_name: str,
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    parsed = await _get_parsed(sr)

    # Search in scalars
    for p in parsed["scalars"]:
        if p["name"] == param_name:
            return DCMParameterDetail(
                name=p["name"], long_name=p["long_name"], type="scalar",
                unit=p["unit"], value=p["value"],
            )

    # Search in curves
    for p in parsed["curves"]:
        if p["name"] == param_name:
            return DCMParameterDetail(
                name=p["name"], long_name=p["long_name"], type="curve",
                unit_x=p["unit_x"], unit_w=p["unit_w"],
                x_axis=p["x_axis"], values=p["values"],
                size=p["size"],
            )

    # Search in maps
    for p in parsed["maps"]:
        if p["name"] == param_name:
            return DCMParameterDetail(
                name=p["name"], long_name=p["long_name"], type="map",
                unit_x=p["unit_x"], unit_y=p["unit_y"], unit_w=p["unit_w"],
                x_axis=p["x_axis"], y_axis=p["y_axis"], values=p["values"],
                rows=p["rows"], cols=p["cols"],
            )

    raise HTTPException(status_code=404, detail=f"Parameter '{param_name}' not found in DCM")


@router.post("/datasets/{dataset_id}/import-from-dcm", response_model=DCMImportResponse)
async def import_from_dcm(
    dataset_id: str,
    body: DCMImportBody,
    user: dict = Depends(get_current_user),
):
    db = await get_db()

    # Fetch dataset
    try:
        ds_oid = ObjectId(dataset_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid dataset id")
    ds = await db.datasets.find_one({"_id": ds_oid})
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Fetch sw_release DCM
    sr = await _require_sr(body.sw_release_id, db)
    parsed = await _get_parsed(sr)
    dcm_filename = sr.get("dcm_filename", "")

    scalars = parsed["scalars"]

    if body.parameter_names == "all_scalars":
        selected = scalars
    else:
        names_set = set(body.parameter_names)
        selected = [p for p in scalars if p["name"] in names_set]

    imported = 0
    skipped = 0
    errors: list[str] = []

    from models import _uuid, _now

    for param in selected:
        try:
            # Check if label already exists in dataset
            existing = await db.labels.find_one({"dataset_id": dataset_id, "label_name": param["name"]})
            if existing:
                skipped += 1
                continue

            label = {
                "id": _uuid(),
                "dataset_id": dataset_id,
                "label_name": param["name"],
                "long_name": param.get("long_name", ""),
                "unit": param.get("unit", ""),
                "current_value": str(param.get("value", "")),
                "confidence_status": "CALIBRATED",
                "regulatory_relevance": "NO",
                "change_justification": "",
                "modified": False,
                "source": "DCM_IMPORT",
                "dcm_filename": dcm_filename,
                "created_at": _now(),
                "last_modified": _now(),
            }
            await db.labels.insert_one(label)
            imported += 1
        except Exception as exc:
            errors.append(f"{param['name']}: {exc}")

    # Update dataset label count
    total_labels = await db.labels.count_documents({"dataset_id": dataset_id})
    await db.datasets.update_one(
        {"_id": ds_oid},
        {"$set": {"label_count": total_labels}},
    )

    return DCMImportResponse(imported=imported, skipped=skipped, errors=errors)
