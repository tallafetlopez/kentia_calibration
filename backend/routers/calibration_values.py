"""
Calibration value editor — Working Page (WP) / Reference Page (RP) model.

Pattern: ETAS INCA — each label has RP (immutable DCM snapshot) and WP (editable copy).
Operations on WP are persisted with full edit history.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request

_BACKEND_DIR = Path(__file__).parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from models_calibration import CalibUpdate, CalibResetRequest

router = APIRouter(tags=["calibration_values"])


async def get_db():
    from server import db
    return db


async def get_current_user(request: Request):
    from auth_utils import get_current_user as _get
    from server import db
    return await _get(request, db)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _require_sr(sr_id: str, db):
    try:
        oid = ObjectId(sr_id)
    except Exception:
        raise HTTPException(400, "Invalid sw_release id")
    sr = await db.sw_releases.find_one({"_id": oid})
    if not sr:
        raise HTTPException(404, "SW Release not found")
    return sr


async def _get_or_init_working(db, sr_id: str, label_name: str) -> dict:
    """Load working doc. If absent, create with WP = RP = DCM original."""
    from routers.labels import _build_merged, _cached_parse_dcm

    sr = await _require_sr(sr_id, db)
    sr_id_str = str(sr["_id"])

    doc = await db.label_working_values.find_one(
        {"sw_release_id": sr_id_str, "label_name": label_name}
    )
    if doc:
        return doc

    merged = await _build_merged(sr, db)
    entry = next((m for m in merged if m["name"] == label_name), None)
    if not entry:
        raise HTTPException(404, f"Label '{label_name}' not found in merged data")

    rp: Any = None
    if sr.get("dcm_path") and Path(sr["dcm_path"]).exists():
        dcm = _cached_parse_dcm(sr["dcm_path"])
        if entry["type"] == "scalar":
            full = next((p for p in dcm.get("scalars", []) if p["name"] == label_name), None)
            rp = full.get("value") if full else None
        elif entry["type"] == "curve":
            full = next((p for p in dcm.get("curves", []) if p["name"] == label_name), None)
            rp = full.get("values") if full else None
        elif entry["type"] == "map":
            full = next((p for p in dcm.get("maps", []) if p["name"] == label_name), None)
            rp = full.get("values") if full else None

    new_doc = {
        "sw_release_id": sr_id_str,
        "label_name":    label_name,
        "type":          entry["type"],
        "rp_value":      rp,
        "wp_value":      rp,
        "modified":      False,
        "created_at":    _now(),
        "edit_history":  [],
    }
    await db.label_working_values.insert_one(new_doc)
    return new_doc


def _validate_against_limits(value, lower, upper, name="value") -> list[str]:
    warnings = []

    def _check(v, idx_label=""):
        if v is None or not isinstance(v, (int, float)):
            return
        if lower is not None and v < lower:
            warnings.append(f"{name}{idx_label} = {v} below lower_limit {lower}")
        if upper is not None and v > upper:
            warnings.append(f"{name}{idx_label} = {v} above upper_limit {upper}")

    if isinstance(value, list):
        if value and isinstance(value[0], list):
            for ri, row in enumerate(value):
                for ci, v in enumerate(row):
                    _check(v, f"[{ri},{ci}]")
        else:
            for i, v in enumerate(value):
                _check(v, f"[{i}]")
    else:
        _check(value)
    return warnings


def _apply_operation(current, op: str, body: CalibUpdate) -> Any:
    """Apply operation to current value and return new value."""
    cells = body.cells
    val = body.value

    # SCALAR
    if not isinstance(current, list):
        if op == "set":        return val
        if op == "add":        return (current or 0) + val
        if op == "multiply":   return (current or 0) * val
        if op == "percentage": return (current or 0) * (1 + val / 100)
        if op == "reset":      return None
        raise HTTPException(400, f"Operation '{op}' not valid for scalar")

    # CURVE (1D list)
    if current and not isinstance(current[0], list):
        new = list(current)
        idxs = [c[0] for c in cells] if cells else list(range(len(new)))
        if op == "set":
            for i in idxs:
                if 0 <= i < len(new): new[i] = val
        elif op == "add":
            for i in idxs:
                if 0 <= i < len(new) and isinstance(new[i], (int, float)): new[i] += val
        elif op == "multiply":
            for i in idxs:
                if 0 <= i < len(new) and isinstance(new[i], (int, float)): new[i] *= val
        elif op == "percentage":
            for i in idxs:
                if 0 <= i < len(new) and isinstance(new[i], (int, float)): new[i] *= (1 + val / 100)
        elif op == "interpolate":
            if len(idxs) >= 2:
                sorted_i = sorted(idxs)
                i0, i1 = sorted_i[0], sorted_i[-1]
                v0, v1 = new[i0], new[i1]
                if isinstance(v0, (int, float)) and isinstance(v1, (int, float)):
                    for i in range(i0, i1 + 1):
                        t = (i - i0) / (i1 - i0)
                        new[i] = v0 + t * (v1 - v0)
        elif op == "smooth":
            for _ in range(max(1, body.smooth_passes)):
                smoothed = list(new)
                for i in idxs:
                    neighbors = []
                    for j in (i - 1, i, i + 1):
                        if 0 <= j < len(new) and isinstance(new[j], (int, float)):
                            neighbors.append(new[j])
                    if neighbors:
                        smoothed[i] = sum(neighbors) / len(neighbors)
                new = smoothed
        return new

    # MAP (list of lists)
    rows = len(current)
    cols = len(current[0]) if rows else 0
    new = [list(r) for r in current]
    target_cells = cells if cells else [[r, c] for r in range(rows) for c in range(cols)]

    if op == "set":
        for r, c in target_cells:
            if 0 <= r < rows and 0 <= c < cols: new[r][c] = val
    elif op == "add":
        for r, c in target_cells:
            if 0 <= r < rows and 0 <= c < cols and isinstance(new[r][c], (int, float)):
                new[r][c] += val
    elif op == "multiply":
        for r, c in target_cells:
            if 0 <= r < rows and 0 <= c < cols and isinstance(new[r][c], (int, float)):
                new[r][c] *= val
    elif op == "percentage":
        for r, c in target_cells:
            if 0 <= r < rows and 0 <= c < cols and isinstance(new[r][c], (int, float)):
                new[r][c] *= (1 + val / 100)
    elif op == "smooth":
        for _ in range(max(1, body.smooth_passes)):
            smoothed = [list(r) for r in new]
            for r, c in target_cells:
                if not (0 <= r < rows and 0 <= c < cols): continue
                neighbors = []
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < rows and 0 <= nc < cols and isinstance(new[nr][nc], (int, float)):
                            neighbors.append(new[nr][nc])
                if neighbors:
                    smoothed[r][c] = sum(neighbors) / len(neighbors)
            new = smoothed
    elif op == "interpolate":
        if len(target_cells) >= 2:
            rs = sorted({r for r, _ in target_cells})
            cs = sorted({c for _, c in target_cells})
            r0, r1 = rs[0], rs[-1]
            c0, c1 = cs[0], cs[-1]
            v00 = new[r0][c0]; v01 = new[r0][c1]
            v10 = new[r1][c0]; v11 = new[r1][c1]
            if all(isinstance(v, (int, float)) for v in (v00, v01, v10, v11)):
                for r in range(r0, r1 + 1):
                    for c in range(c0, c1 + 1):
                        tr = (r - r0) / (r1 - r0) if r1 > r0 else 0
                        tc = (c - c0) / (c1 - c0) if c1 > c0 else 0
                        top    = v00 + tc * (v01 - v00)
                        bottom = v10 + tc * (v11 - v10)
                        new[r][c] = top + tr * (bottom - top)
    else:
        raise HTTPException(400, f"Operation '{op}' not implemented")

    return new


@router.get("/sw-releases/{sr_id}/labels/{label_name}/values")
async def get_values(
    sr_id: str,
    label_name: str,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    doc = await _get_or_init_working(db, sr_id, label_name)
    return {
        "sw_release_id": doc["sw_release_id"],
        "label_name":    doc["label_name"],
        "type":          doc["type"],
        "rp_value":      doc["rp_value"],
        "wp_value":      doc["wp_value"],
        "modified":      doc.get("modified", False),
        "modified_at":   doc.get("modified_at"),
        "modified_by":   doc.get("modified_by"),
    }


@router.put("/sw-releases/{sr_id}/labels/{label_name}/values")
async def update_values(
    sr_id: str,
    label_name: str,
    body: CalibUpdate,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    if body.operation in ("set", "add", "multiply", "percentage") and body.value is None:
        raise HTTPException(400, f"Operation '{body.operation}' requires 'value'")

    doc = await _get_or_init_working(db, sr_id, label_name)
    new_wp = _apply_operation(doc["wp_value"], body.operation, body)

    # Validate against A2L limits
    from routers.labels import _build_merged, _require_sr as _req_sr
    sr = await _req_sr(sr_id, db)
    merged = await _build_merged(sr, db)
    entry = next((m for m in merged if m["name"] == label_name), None)
    lo = entry.get("lower_limit") if entry else None
    hi = entry.get("upper_limit") if entry else None
    warnings = _validate_against_limits(new_wp, lo, hi, name=label_name)

    history_entry = {
        "ts":        _now(),
        "user":      user.get("email", ""),
        "operation": body.operation,
        "cells":     body.cells,
        "value":     body.value,
        "warnings":  warnings,
    }
    if body.justification:
        history_entry["justification"] = body.justification

    await db.label_working_values.update_one(
        {"sw_release_id": doc["sw_release_id"], "label_name": label_name},
        {
            "$set": {
                "wp_value":    new_wp,
                "modified":    True,
                "modified_at": _now(),
                "modified_by": user.get("email", ""),
            },
            "$push": {"edit_history": history_entry},
        },
    )

    await db.audit_log.insert_one({
        "ts":             _now(),
        "action":         "CALIB_VALUE_EDIT",
        "user":           user.get("email", ""),
        "sw_release_id":  sr_id,
        "label_name":     label_name,
        "operation":      body.operation,
        "cells_count":    len(body.cells) if body.cells else None,
        "warnings_count": len(warnings),
    })

    return {
        "wp_value": new_wp,
        "modified": True,
        "warnings": warnings,
    }


@router.post("/sw-releases/{sr_id}/labels/{label_name}/values/reset")
async def reset_values(
    sr_id: str,
    label_name: str,
    body: CalibResetRequest,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    doc = await _get_or_init_working(db, sr_id, label_name)
    cells = body.cells

    if cells == "all":
        new_wp = doc["rp_value"]
    else:
        rp = doc["rp_value"]
        wp = doc["wp_value"]
        if isinstance(wp, list) and wp and isinstance(wp[0], list):
            new_wp = [list(r) for r in wp]
            for cell in cells:
                r, c = cell[0], cell[1]
                if 0 <= r < len(new_wp) and 0 <= c < len(new_wp[0]):
                    new_wp[r][c] = rp[r][c]
        elif isinstance(wp, list):
            new_wp = list(wp)
            for cell in cells:
                i = cell[0]
                if 0 <= i < len(new_wp):
                    new_wp[i] = rp[i]
        else:
            new_wp = rp

    is_modified = (new_wp != doc["rp_value"])
    await db.label_working_values.update_one(
        {"sw_release_id": doc["sw_release_id"], "label_name": label_name},
        {
            "$set": {
                "wp_value":    new_wp,
                "modified":    is_modified,
                "modified_at": _now(),
                "modified_by": user.get("email", ""),
            },
            "$push": {"edit_history": {
                "ts":          _now(),
                "user":        user.get("email", ""),
                "operation":   "reset",
                "cells":       cells if cells != "all" else [],
                "reset_scope": "all" if cells == "all" else "partial",
            }},
        },
    )
    return {"wp_value": new_wp, "modified": is_modified}


@router.get("/sw-releases/{sr_id}/labels/{label_name}/values/history")
async def get_history(
    sr_id: str,
    label_name: str,
    limit: int = 50,
    skip: int = 0,
    db=Depends(get_db),
    user=Depends(get_current_user),
):
    sr = await _require_sr(sr_id, db)
    doc = await db.label_working_values.find_one(
        {"sw_release_id": str(sr["_id"]), "label_name": label_name}
    )
    if not doc:
        return {"entries": [], "total": 0}
    history = doc.get("edit_history", [])
    return {
        "entries": list(reversed(history))[skip: skip + limit],
        "total":   len(history),
    }
