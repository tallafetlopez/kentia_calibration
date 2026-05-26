"""DCM Router — SW Release DCM file management (SQLite)."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Request
from pydantic import BaseModel

_BACKEND_DIR = Path(__file__).parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
_PARSERS_DIR = _BACKEND_DIR / "parsers"
if str(_PARSERS_DIR) not in sys.path:
    sys.path.insert(0, str(_PARSERS_DIR))

from parsers.dcm_parser import DCMParser
from db import fetch_one, run, get_conn, jd
from dependencies import get_current_user, now_iso

router = APIRouter(tags=["DCM Management"])

UPLOADS_DIR = _BACKEND_DIR / "uploads" / "dcm"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


class DCMSummaryResponse(BaseModel):
    filename: str
    size_bytes: int
    uploaded_at: str
    summary: dict


class DCMParameterItem(BaseModel):
    name: str
    long_name: str
    unit: str
    type: str
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
    parameter_names: Union[List[str], str]


class DCMImportResponse(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


async def _require_sr(sr_id: str, db):
    sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
    if not sr:
        raise HTTPException(404, "SW Release not found")
    return sr


async def _get_parsed(sr: dict) -> dict:
    dcm_path = sr.get("dcm_path")
    if not dcm_path or not Path(dcm_path).exists():
        raise HTTPException(404, "No DCM file uploaded for this SW Release")
    return DCMParser().parse(dcm_path)


async def get_user(request: Request):
    return await get_current_user(request)


@router.post("/sw-releases/{sr_id}/dcm/upload", response_model=DCMSummaryResponse)
async def upload_dcm(sr_id: str, file: UploadFile = File(...), user: dict = Depends(get_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    fname = file.filename or ""
    if not fname.lower().endswith(".dcm"):
        raise HTTPException(400, "Only .dcm files are accepted")
    safe_name = f"{sr_id}_{fname}"
    dest = UPLOADS_DIR / safe_name
    contents = await file.read()
    dest.write_bytes(contents)
    parsed = DCMParser().parse(str(dest))
    summary = parsed["summary"]
    uploaded_at = now_iso()
    await run(db, """
        UPDATE sw_releases SET dcm_filename=?, dcm_path=?, dcm_uploaded_at=?, dcm_summary=? WHERE id=?
    """, (fname, str(dest), uploaded_at, jd(summary), sr_id))
    return DCMSummaryResponse(filename=fname, size_bytes=len(contents), uploaded_at=uploaded_at, summary=summary)


@router.delete("/sw-releases/{sr_id}/dcm", status_code=204)
async def delete_dcm(sr_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    if sr.get("dcm_path"):
        try:
            Path(sr["dcm_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    await run(db, "UPDATE sw_releases SET dcm_filename=NULL, dcm_path=NULL, dcm_uploaded_at=NULL, dcm_summary=NULL WHERE id=?", (sr_id,))


@router.get("/sw-releases/{sr_id}/dcm/summary", response_model=DCMSummaryResponse)
async def get_dcm_summary(sr_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    if not sr.get("dcm_filename"):
        raise HTTPException(404, "No DCM file uploaded for this SW Release")
    dcm_path = sr.get("dcm_path", "")
    size_bytes = Path(dcm_path).stat().st_size if dcm_path and Path(dcm_path).exists() else 0
    from db import jl
    return DCMSummaryResponse(filename=sr["dcm_filename"], size_bytes=size_bytes,
                              uploaded_at=sr.get("dcm_uploaded_at", ""),
                              summary=jl(sr.get("dcm_summary")) or {})


@router.get("/sw-releases/{sr_id}/dcm/parameters")
async def list_dcm_parameters(
    sr_id: str,
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_user),
):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    parsed = await _get_parsed(sr)
    items = []
    if not type or type == "scalar":
        for p in parsed["scalars"]:
            items.append({"name": p["name"], "long_name": p["long_name"], "unit": p["unit"], "type": "scalar", "value_preview": p["value"]})
    if not type or type == "curve":
        for p in parsed["curves"]:
            items.append({"name": p["name"], "long_name": p["long_name"], "unit": p.get("unit_w", ""), "type": "curve", "value_preview": f"1D [{p['size']} points]"})
    if not type or type == "map":
        for p in parsed["maps"]:
            items.append({"name": p["name"], "long_name": p["long_name"], "unit": p.get("unit_w", ""), "type": "map", "value_preview": f"2D [{p['rows']}×{p['cols']}]"})
    if search:
        q = search.lower()
        items = [it for it in items if q in it["name"].lower() or q in it["long_name"].lower()]
    total = len(items)
    return {"total": total, "offset": offset, "limit": limit, "items": items[offset: offset + limit]}


@router.get("/sw-releases/{sr_id}/dcm/parameters/{param_name}", response_model=DCMParameterDetail)
async def get_dcm_parameter(sr_id: str, param_name: str, user: dict = Depends(get_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    parsed = await _get_parsed(sr)
    for p in parsed["scalars"]:
        if p["name"] == param_name:
            return DCMParameterDetail(name=p["name"], long_name=p["long_name"], type="scalar", unit=p["unit"], value=p["value"])
    for p in parsed["curves"]:
        if p["name"] == param_name:
            return DCMParameterDetail(name=p["name"], long_name=p["long_name"], type="curve", unit_x=p["unit_x"], unit_w=p["unit_w"], x_axis=p["x_axis"], values=p["values"], size=p["size"])
    for p in parsed["maps"]:
        if p["name"] == param_name:
            return DCMParameterDetail(name=p["name"], long_name=p["long_name"], type="map", unit_x=p["unit_x"], unit_y=p["unit_y"], unit_w=p["unit_w"], x_axis=p["x_axis"], y_axis=p["y_axis"], values=p["values"], rows=p["rows"], cols=p["cols"])
    raise HTTPException(404, f"Parameter '{param_name}' not found in DCM")


@router.post("/datasets/{dataset_id}/import-from-dcm", response_model=DCMImportResponse)
async def import_from_dcm(dataset_id: str, body: DCMImportBody, user: dict = Depends(get_user)):
    db = get_conn()
    ds = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not ds:
        raise HTTPException(404, "Dataset not found")
    sr = await _require_sr(body.sw_release_id, db)
    parsed = await _get_parsed(sr)
    dcm_filename = sr.get("dcm_filename", "")
    scalars = parsed["scalars"]
    if body.parameter_names == "all_scalars":
        selected = scalars
    else:
        names_set = set(body.parameter_names)
        selected = [p for p in scalars if p["name"] in names_set]
    from models import _uuid, _now
    imported = 0
    skipped = 0
    errors: list = []
    for param in selected:
        try:
            existing = await fetch_one(db, "SELECT id FROM labels WHERE dataset_id=? AND label_name=?", (dataset_id, param["name"]))
            if existing:
                skipped += 1
                continue
            now = _now()
            await run(db, """
                INSERT INTO labels (id, dataset_id, label_name, unit, current_value, confidence_status,
                    regulatory_relevance, change_justification, modified, created_by, created_at, last_modification_date)
                VALUES (?, ?, ?, ?, ?, 'CALIBRATED', 'NO', '', 0, ?, ?, ?)
            """, (_uuid(), dataset_id, param["name"], param.get("unit", ""),
                  str(param.get("value", "")), user.get("email", ""), now, now))
            imported += 1
        except Exception as exc:
            errors.append(f"{param['name']}: {exc}")
    return DCMImportResponse(imported=imported, skipped=skipped, errors=errors)
