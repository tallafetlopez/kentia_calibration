"""
Labels Router — A2L + DCM merged view with metadata CRUD
Prefix: /api/v1  (mounted in server.py)

Endpoints:
  GET  /sw-releases/{id}/labels/merged       — paginated A2L+DCM merge
  GET  /sw-releases/{id}/labels/summary      — counts by type/function/status
  GET  /sw-releases/{id}/labels/{name}       — full detail (includes x_axis/values)
  PUT  /sw-releases/{id}/labels/{name}/metadata  — update owner/deputy/comment/status
  PUT  /sw-releases/{id}/labels/{name}/maturity  — update maturity score + append history
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Union

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

_BACKEND_DIR = Path(__file__).parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
_PARSERS_DIR = _BACKEND_DIR / "parsers"
if str(_PARSERS_DIR) not in sys.path:
    sys.path.insert(0, str(_PARSERS_DIR))

from parsers.a2l_parser import A2lParser          # noqa: E402
from parsers.dcm_parser import DCMParser          # noqa: E402

router = APIRouter(tags=["Labels"])


# ─── helpers ──────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_db():
    from server import db
    return db


async def get_current_user(request: Request):
    from auth_utils import get_current_user as _get
    from server import db
    return await _get(request, db)


async def _require_sr(sr_id: str, db):
    try:
        oid = ObjectId(sr_id)
    except Exception:
        raise HTTPException(400, "Invalid sw_release id")
    sr = await db.sw_releases.find_one({"_id": oid})
    if not sr:
        raise HTTPException(404, "SW Release not found")
    return sr


# ─── In-memory parse cache (path → (mtime, result)) ──────────────────────────

_a2l_cache: dict[str, tuple[float, object]] = {}
_dcm_cache: dict[str, tuple[float, object]] = {}


def _cached_parse_a2l(path: str):
    mtime = Path(path).stat().st_mtime
    if path in _a2l_cache and _a2l_cache[path][0] == mtime:
        return _a2l_cache[path][1]
    ds = A2lParser().parse(path)
    _a2l_cache[path] = (mtime, ds)
    return ds


def _cached_parse_dcm(path: str) -> dict:
    mtime = Path(path).stat().st_mtime
    if path in _dcm_cache and _dcm_cache[path][0] == mtime:
        return _dcm_cache[path][1]
    parsed = DCMParser().parse(path)
    _dcm_cache[path] = (mtime, parsed)
    return parsed


# ─── Core merge logic ─────────────────────────────────────────────────────────

async def _build_merged(sr: dict, db) -> list[dict]:
    """
    Parse A2L + DCM files for the given SW Release, merge by label name,
    enrich with DB metadata, and return a flat list sorted by name.
    """
    sr_id = str(sr["_id"])

    # ── 1. Parse A2L ──────────────────────────────────────────────────────────
    a2l_chars: dict = {}
    a2l_compu: dict = {}
    if sr.get("a2l_path") and Path(sr["a2l_path"]).exists():
        ds = _cached_parse_a2l(sr["a2l_path"])
        a2l_chars = ds.characteristics
        a2l_compu = ds.compu_methods

    # ── 2. Parse DCM ──────────────────────────────────────────────────────────
    dcm_scalars: dict = {}
    dcm_curves: dict  = {}
    dcm_maps: dict    = {}
    if sr.get("dcm_path") and Path(sr["dcm_path"]).exists():
        parsed = _cached_parse_dcm(sr["dcm_path"])
        dcm_scalars = {p["name"]: p for p in parsed.get("scalars", [])}
        dcm_curves  = {p["name"]: p for p in parsed.get("curves",  [])}
        dcm_maps    = {p["name"]: p for p in parsed.get("maps",    [])}

    # ── 3. All unique label names ──────────────────────────────────────────────
    all_names = (
        set(a2l_chars.keys())
        | set(dcm_scalars.keys())
        | set(dcm_curves.keys())
        | set(dcm_maps.keys())
    )

    # ── 4. Load per-label metadata from DB ────────────────────────────────────
    meta_map: dict[str, dict] = {}
    async for doc in db.label_metadata.find({"sw_release_id": sr_id}):
        meta_map[doc["label_name"]] = doc

    # ── 5. Build merged list ──────────────────────────────────────────────────
    labels: list[dict] = []
    _a2l_type_map = {"VALUE": "scalar", "CURVE": "curve", "MAP": "map", "AXIS_PTS": "scalar", "VAL_BLK": "scalar"}

    for name in sorted(all_names):
        char  = a2l_chars.get(name)
        dcm_s = dcm_scalars.get(name)
        dcm_c = dcm_curves.get(name)
        dcm_m = dcm_maps.get(name)

        # Determine type (DCM takes precedence for actual data shape)
        if dcm_s:
            ptype = "scalar"
        elif dcm_c:
            ptype = "curve"
        elif dcm_m:
            ptype = "map"
        elif char:
            ptype = _a2l_type_map.get(char.char_type, "scalar")
        else:
            continue

        # Value preview
        if ptype == "scalar" and dcm_s:
            raw_val = dcm_s.get("value")
            if isinstance(raw_val, float):
                value_preview = f"{raw_val:.5f}"
            else:
                value_preview = str(raw_val) if raw_val is not None else None
        elif ptype == "curve" and dcm_c:
            value_preview = f"[{dcm_c.get('size', '?')}d]"
        elif ptype == "map" and dcm_m:
            value_preview = f"[{dcm_m.get('rows','?')}×{dcm_m.get('cols','?')}]"
        else:
            value_preview = None

        # Flags
        in_a2l = char is not None
        in_dcm = (dcm_s or dcm_c or dcm_m) is not None

        # Unit (A2L wins, fallback to DCM)
        unit = ""
        if char and char.unit:
            unit = char.unit
        elif dcm_s:
            unit = dcm_s.get("unit", "")
        elif dcm_c:
            unit = dcm_c.get("unit_w", "")
        elif dcm_m:
            unit = dcm_m.get("unit_w", "")

        # Out-of-range (scalars only, only if both A2L limits and DCM value available)
        out_of_range = False
        if char and dcm_s and char.lower_limit != char.upper_limit:
            try:
                v = float(dcm_s["value"])
                out_of_range = v < char.lower_limit or v > char.upper_limit
            except (TypeError, ValueError):
                pass

        # System status
        if out_of_range:
            system_status = "WARNING"
        elif not in_a2l:
            system_status = "MISSING_A2L"
        elif not in_dcm:
            system_status = "MISSING_DCM"
        else:
            system_status = "DOC_OK"

        # Metadata from DB
        meta = meta_map.get(name, {})

        # Long identifier: prefer A2L description, fallback to DCM long_name
        if char and char.description:
            long_id = char.description
        else:
            dcm_p = dcm_s or dcm_c or dcm_m or {}
            long_id = dcm_p.get("long_name", "")

        labels.append({
            "name":            name,
            "long_identifier": long_id,
            "type":            ptype,
            "unit":            unit,
            "lower_limit":     char.lower_limit if char else None,
            "upper_limit":     char.upper_limit if char else None,
            "function":        char.function   if char else "",
            "address":         hex(char.ecu_address) if char else None,
            "value_preview":   value_preview,
            "in_a2l":          in_a2l,
            "in_dcm":          in_dcm,
            "out_of_range":    out_of_range,
            "system_status":   system_status,
            "owner":           meta.get("owner",        ""),
            "deputy":          meta.get("deputy",       ""),
            "comment":         meta.get("comment",      ""),
            "user_status":     meta.get("user_status",  "START"),
            "maturity_score":  meta.get("maturity_score", 0),
            "label_flags":     meta.get("label_flags",  []),
            "save":            meta.get("save",         False),
        })

    return labels


# ─── Pydantic models ──────────────────────────────────────────────────────────

class LabelMetadataUpdate(BaseModel):
    owner:       Optional[str] = None
    deputy:      Optional[str] = None
    comment:     Optional[str] = None
    user_status: Optional[str] = None
    label_flags: Optional[List[str]] = None
    save:        Optional[bool] = None


class LabelMaturityUpdate(BaseModel):
    score: int            # 0 | 25 | 50 | 75 | 100
    note:  str = ""


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/sw-releases/{sr_id}/labels/merged")
async def list_merged_labels(
    sr_id:             str,
    search:            Optional[str] = Query(None),
    type:              Optional[str] = Query(None, description="scalar|curve|map"),
    function:          Optional[str] = Query(None),
    owner:             Optional[str] = Query(None),
    system_status:     Optional[str] = Query(None),
    out_of_range_only: bool          = Query(False),
    limit:             int           = Query(100, ge=1, le=2000),
    offset:            int           = Query(0,   ge=0),
    user: dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    labels = await _build_merged(sr, db)

    # ── Filters ───────────────────────────────────────────────────────────────
    if search:
        q = search.lower()
        labels = [l for l in labels if q in l["name"].lower() or q in l["long_identifier"].lower()]
    if type:
        labels = [l for l in labels if l["type"] == type]
    if function:
        labels = [l for l in labels if l["function"] == function]
    if owner:
        labels = [l for l in labels if l["owner"] == owner]
    if system_status:
        labels = [l for l in labels if l["system_status"] == system_status]
    if out_of_range_only:
        labels = [l for l in labels if l["out_of_range"]]

    total = len(labels)
    page  = labels[offset: offset + limit]

    return {"total": total, "offset": offset, "limit": limit, "items": page}


@router.get("/sw-releases/{sr_id}/labels/summary")
async def labels_summary(
    sr_id: str,
    user:  dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    labels = await _build_merged(sr, db)

    counts_type: dict[str, int] = {}
    counts_func: dict[str, int] = {}
    counts_status: dict[str, int] = {}
    out_of_range = 0
    missing_a2l  = 0
    missing_dcm  = 0

    for l in labels:
        counts_type[l["type"]] = counts_type.get(l["type"], 0) + 1
        fn = l["function"] or "—"
        counts_func[fn] = counts_func.get(fn, 0) + 1
        counts_status[l["system_status"]] = counts_status.get(l["system_status"], 0) + 1
        if l["out_of_range"]:  out_of_range += 1
        if not l["in_a2l"]:    missing_a2l  += 1
        if not l["in_dcm"]:    missing_dcm  += 1

    return {
        "total":         len(labels),
        "by_type":       counts_type,
        "by_function":   counts_func,
        "by_status":     counts_status,
        "out_of_range":  out_of_range,
        "missing_a2l":   missing_a2l,
        "missing_dcm":   missing_dcm,
    }


@router.get("/sw-releases/{sr_id}/labels/{label_name}")
async def get_label_detail(
    sr_id:      str,
    label_name: str,
    user:       dict = Depends(get_current_user),
):
    """Full detail: includes x_axis, y_axis, values arrays + maturity history."""
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    sr_id_str = str(sr["_id"])

    # Parse A2L
    a2l_char = None
    if sr.get("a2l_path") and Path(sr["a2l_path"]).exists():
        ds = _cached_parse_a2l(sr["a2l_path"])
        a2l_char = ds.characteristics.get(label_name)

    # Parse DCM
    dcm_detail: dict = {}
    if sr.get("dcm_path") and Path(sr["dcm_path"]).exists():
        parsed = _cached_parse_dcm(sr["dcm_path"])
        for p in parsed.get("scalars", []):
            if p["name"] == label_name:
                dcm_detail = {**p, "_type": "scalar"}
                break
        if not dcm_detail:
            for p in parsed.get("curves", []):
                if p["name"] == label_name:
                    dcm_detail = {**p, "_type": "curve"}
                    break
        if not dcm_detail:
            for p in parsed.get("maps", []):
                if p["name"] == label_name:
                    dcm_detail = {**p, "_type": "map"}
                    break

    if not a2l_char and not dcm_detail:
        raise HTTPException(404, f"Label '{label_name}' not found in A2L or DCM")

    # DB metadata
    meta = await db.label_metadata.find_one({"sw_release_id": sr_id_str, "label_name": label_name}) or {}

    ptype = dcm_detail.get("_type") or (
        {"VALUE": "scalar", "CURVE": "curve", "MAP": "map"}.get(
            a2l_char.char_type if a2l_char else "", "scalar"
        )
    )

    return {
        "name":             label_name,
        "long_identifier":  (a2l_char.description if a2l_char else dcm_detail.get("long_name", "")),
        "type":             ptype,
        "unit":             (a2l_char.unit if a2l_char else dcm_detail.get("unit") or dcm_detail.get("unit_w") or ""),
        "unit_x":           dcm_detail.get("unit_x"),
        "unit_y":           dcm_detail.get("unit_y"),
        "unit_w":           dcm_detail.get("unit_w"),
        "lower_limit":      a2l_char.lower_limit if a2l_char else None,
        "upper_limit":      a2l_char.upper_limit if a2l_char else None,
        "function":         a2l_char.function    if a2l_char else "",
        "address":          hex(a2l_char.ecu_address) if a2l_char else None,
        # DCM values
        "value":            dcm_detail.get("value"),
        "x_axis":           dcm_detail.get("x_axis"),
        "y_axis":           dcm_detail.get("y_axis"),
        "values":           dcm_detail.get("values"),
        "size":             dcm_detail.get("size"),
        "rows":             dcm_detail.get("rows"),
        "cols":             dcm_detail.get("cols"),
        # Flags
        "in_a2l":           a2l_char is not None,
        "in_dcm":           bool(dcm_detail),
        # DB metadata
        "owner":            meta.get("owner",          ""),
        "deputy":           meta.get("deputy",         ""),
        "comment":          meta.get("comment",        ""),
        "user_status":      meta.get("user_status",    "START"),
        "maturity_score":   meta.get("maturity_score", 0),
        "maturity_history": meta.get("maturity_history", []),
        "label_flags":      meta.get("label_flags",   []),
        "save":             meta.get("save",           False),
    }


@router.put("/sw-releases/{sr_id}/labels/{label_name}/metadata")
async def update_label_metadata(
    sr_id:      str,
    label_name: str,
    body:       LabelMetadataUpdate,
    user:       dict = Depends(get_current_user),
):
    db = await get_db()
    sr = await _require_sr(sr_id, db)
    sr_id_str = str(sr["_id"])

    update_fields: dict = {"updated_at": _now_iso(), "updated_by": user.get("email", "")}
    if body.owner       is not None: update_fields["owner"]       = body.owner
    if body.deputy      is not None: update_fields["deputy"]      = body.deputy
    if body.comment     is not None: update_fields["comment"]     = body.comment
    if body.user_status is not None: update_fields["user_status"] = body.user_status
    if body.label_flags is not None: update_fields["label_flags"] = body.label_flags
    if body.save        is not None: update_fields["save"]        = body.save

    await db.label_metadata.update_one(
        {"sw_release_id": sr_id_str, "label_name": label_name},
        {"$set": update_fields, "$setOnInsert": {"sw_release_id": sr_id_str, "label_name": label_name, "created_at": _now_iso()}},
        upsert=True,
    )
    return {"ok": True}


@router.put("/sw-releases/{sr_id}/labels/{label_name}/maturity")
async def update_label_maturity(
    sr_id:      str,
    label_name: str,
    body:       LabelMaturityUpdate,
    user:       dict = Depends(get_current_user),
):
    if body.score not in (0, 25, 50, 75, 100):
        raise HTTPException(400, "Score must be 0, 25, 50, 75, or 100")

    db = await get_db()
    sr = await _require_sr(sr_id, db)
    sr_id_str = str(sr["_id"])

    history_entry = {
        "score":  body.score,
        "note":   body.note,
        "user":   user.get("email", ""),
        "date":   _now_iso(),
    }

    await db.label_metadata.update_one(
        {"sw_release_id": sr_id_str, "label_name": label_name},
        {
            "$set": {
                "maturity_score": body.score,
                "updated_at":     _now_iso(),
                "updated_by":     user.get("email", ""),
            },
            "$push": {"maturity_history": history_entry},
            "$setOnInsert": {
                "sw_release_id": sr_id_str,
                "label_name":    label_name,
                "created_at":    _now_iso(),
            },
        },
        upsert=True,
    )
    return {"ok": True, "score": body.score}
