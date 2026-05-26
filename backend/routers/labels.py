"""
Labels Router — A2L + DCM merged view with metadata CRUD (SQLite)
Prefix: /api/v1  (mounted in server.py)
"""

from __future__ import annotations

import hashlib
import io
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

_BACKEND_DIR = Path(__file__).parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
_PARSERS_DIR = _BACKEND_DIR / "parsers"
if str(_PARSERS_DIR) not in sys.path:
    sys.path.insert(0, str(_PARSERS_DIR))

from parsers.a2l_parser import A2lParser
from parsers.dcm_parser import DCMParser
from parsers.dcm_writer import write_dcm
from utils.map_limits import clamp_matrix
from db import fetch_one, fetch_all, run, get_conn, jl, jd
from dependencies import get_current_user, now_iso as _now_iso, require_sr as _require_sr

router = APIRouter(tags=["Labels"])

_a2l_cache: dict[str, tuple[float, object]] = {}
_dcm_cache: dict[str, tuple[float, object]] = {}
_merged_cache: dict[str, tuple[str, list[dict]]] = {}


def _merged_signature(sr: dict, meta_version: str, working_version: str) -> str:
    a2l_path = sr.get("a2l_path") or ""
    dcm_path = sr.get("dcm_path") or ""
    a2l_mtime = str(Path(a2l_path).stat().st_mtime) if a2l_path and Path(a2l_path).exists() else ""
    dcm_mtime = str(Path(dcm_path).stat().st_mtime) if dcm_path and Path(dcm_path).exists() else ""
    parts = [a2l_path, dcm_path, a2l_mtime, dcm_mtime, meta_version, working_version]
    return hashlib.md5("|".join(parts).encode()).hexdigest()


async def _collection_version(db, table: str, sr_id: str) -> str:
    cur = await db.execute(f"SELECT COUNT(*) as cnt, MAX(updated_at) as last_ts FROM {table} WHERE sw_release_id=?", (sr_id,))
    row = dict(await cur.fetchone())
    return f"{row['cnt']}:{row['last_ts'] or ''}"


def _invalidate_merged_cache(sr_id: str) -> None:
    _merged_cache.pop(sr_id, None)


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


async def _build_merged(sr: dict, db) -> list[dict]:
    sr_id = sr["id"]
    meta_version    = await _collection_version(db, "label_metadata", sr_id)
    working_version = await _collection_version(db, "label_working_values", sr_id)
    sig = _merged_signature(sr, meta_version, working_version)
    cached = _merged_cache.get(sr_id)
    if cached and cached[0] == sig:
        return cached[1]

    a2l_chars: dict = {}
    a2l_compu: dict = {}
    if sr.get("a2l_path") and Path(sr["a2l_path"]).exists():
        ds = _cached_parse_a2l(sr["a2l_path"])
        a2l_chars = ds.characteristics
        a2l_compu = ds.compu_methods

    dcm_scalars: dict = {}
    dcm_curves: dict = {}
    dcm_maps: dict = {}
    if sr.get("dcm_path") and Path(sr["dcm_path"]).exists():
        parsed = _cached_parse_dcm(sr["dcm_path"])
        dcm_scalars = {p["name"]: p for p in parsed.get("scalars", [])}
        dcm_curves  = {p["name"]: p for p in parsed.get("curves",  [])}
        dcm_maps    = {p["name"]: p for p in parsed.get("maps",    [])}

    all_names = set(a2l_chars.keys()) | set(dcm_scalars.keys()) | set(dcm_curves.keys()) | set(dcm_maps.keys())

    meta_rows = await fetch_all(db, "SELECT * FROM label_metadata WHERE sw_release_id=?", (sr_id,))
    meta_map = {r["label_name"]: r for r in meta_rows}

    labels: list[dict] = []
    _a2l_type_map = {"VALUE": "scalar", "CURVE": "curve", "MAP": "map", "AXIS_PTS": "scalar", "VAL_BLK": "scalar"}

    for name in sorted(all_names):
        char  = a2l_chars.get(name)
        dcm_s = dcm_scalars.get(name)
        dcm_c = dcm_curves.get(name)
        dcm_m = dcm_maps.get(name)
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

        if ptype == "scalar" and dcm_s:
            raw_val = dcm_s.get("value")
            value_preview = f"{raw_val:.5f}" if isinstance(raw_val, float) else (str(raw_val) if raw_val is not None else None)
        elif ptype == "curve" and dcm_c:
            value_preview = f"[{dcm_c.get('size', '?')}d]"
        elif ptype == "map" and dcm_m:
            value_preview = f"[{dcm_m.get('rows','?')}×{dcm_m.get('cols','?')}]"
            if dcm_m.get("truncated"):
                value_preview += " (clamped)"
        else:
            value_preview = None

        in_a2l = char is not None
        in_dcm = (dcm_s or dcm_c or dcm_m) is not None
        default_value_a2l = char.lower_limit if (char and not in_dcm) else None

        unit = ""
        if char and char.unit:
            unit = char.unit
        elif dcm_s:
            unit = dcm_s.get("unit", "")
        elif dcm_c:
            unit = dcm_c.get("unit_w", "")
        elif dcm_m:
            unit = dcm_m.get("unit_w", "")

        out_of_range = False
        if char and dcm_s and char.lower_limit != char.upper_limit:
            try:
                v = float(dcm_s["value"])
                out_of_range = v < char.lower_limit or v > char.upper_limit
            except (TypeError, ValueError):
                pass

        if out_of_range:
            system_status = "WARNING"
        elif not in_a2l:
            system_status = "MISSING_A2L"
        elif not in_dcm:
            system_status = "MISSING_DCM"
        else:
            system_status = "DOC_OK"

        meta = meta_map.get(name, {})
        if char and char.description:
            long_id = char.description
        else:
            dcm_p = dcm_s or dcm_c or dcm_m or {}
            long_id = dcm_p.get("long_name", "")

        labels.append({
            "name": name, "long_identifier": long_id, "type": ptype, "unit": unit,
            "lower_limit": char.lower_limit if char else None,
            "upper_limit": char.upper_limit if char else None,
            "function": char.function if char else "",
            "address": hex(char.ecu_address) if char else None,
            "value_preview": value_preview, "in_a2l": in_a2l, "in_dcm": in_dcm,
            "out_of_range": out_of_range, "system_status": system_status,
            "owner": meta.get("owner", ""), "deputy": meta.get("deputy", ""),
            "comment": meta.get("comment", ""), "user_status": meta.get("user_status", "START"),
            "maturity_score": meta.get("maturity_score", 0),
            "label_flags": jl(meta.get("label_flags")) or [],
            "save": bool(meta.get("save", 0)),
            "default_value_a2l": default_value_a2l,
            "needs_default_assignment": (in_a2l and not in_dcm),
            "truncated": bool(dcm_m and dcm_m.get("truncated")),
            "original_dimensions": (dcm_m or {}).get("original_dimensions"),
        })

    # Enrich modified_wp
    wv_rows = await fetch_all(db, "SELECT label_name FROM label_working_values WHERE sw_release_id=? AND modified=1", (sr_id,))
    working_modified = {r["label_name"] for r in wv_rows}
    for label in labels:
        label["modified_wp"] = label["name"] in working_modified

    _merged_cache[sr_id] = (sig, labels)
    return labels


# ── Pydantic models ───────────────────────────────────────────────────────────

class LabelMetadataUpdate(BaseModel):
    owner:       Optional[str] = None
    deputy:      Optional[str] = None
    comment:     Optional[str] = None
    user_status: Optional[str] = None
    label_flags: Optional[List[str]] = None
    save:        Optional[bool] = None


class DcmExportRequest(BaseModel):
    label_names:   Optional[List[str]] = None
    only_saved:    bool = True
    only_maturity: Optional[List[int]] = None
    filename:      Optional[str] = None


class MergeRequest(BaseModel):
    base_sr_id:         str
    overlay_sr_ids:     List[str]
    strategy:           str = "overlay_wins"
    manual_resolutions: Optional[dict] = None


class LabelMaturityUpdate(BaseModel):
    score: int
    note:  str = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/sw-releases/{sr_id}/labels/merged")
async def list_merged_labels(
    sr_id: str,
    search: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    function: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    system_status: Optional[str] = Query(None),
    out_of_range_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    labels = await _build_merged(sr, db)
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
    return {"total": total, "offset": offset, "limit": limit, "items": labels[offset: offset + limit]}


@router.get("/sw-releases/{sr_id}/labels/summary")
async def labels_summary(sr_id: str, user: dict = Depends(get_current_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    labels = await _build_merged(sr, db)
    counts_type: dict = {}
    counts_func: dict = {}
    counts_status: dict = {}
    out_of_range = missing_a2l = missing_dcm = 0
    for l in labels:
        counts_type[l["type"]] = counts_type.get(l["type"], 0) + 1
        fn = l["function"] or "—"
        counts_func[fn] = counts_func.get(fn, 0) + 1
        counts_status[l["system_status"]] = counts_status.get(l["system_status"], 0) + 1
        if l["out_of_range"]: out_of_range += 1
        if not l["in_a2l"]: missing_a2l += 1
        if not l["in_dcm"]: missing_dcm += 1
    return {"total": len(labels), "by_type": counts_type, "by_function": counts_func,
            "by_status": counts_status, "out_of_range": out_of_range,
            "missing_a2l": missing_a2l, "missing_dcm": missing_dcm}


@router.get("/sw-releases/{sr_id}/labels/{label_name}")
async def get_label_detail(sr_id: str, label_name: str, user: dict = Depends(get_current_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    sr_id_str = sr["id"]
    a2l_char = None
    if sr.get("a2l_path") and Path(sr["a2l_path"]).exists():
        ds = _cached_parse_a2l(sr["a2l_path"])
        a2l_char = ds.characteristics.get(label_name)
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
    meta = await fetch_one(db, "SELECT * FROM label_metadata WHERE sw_release_id=? AND label_name=?", (sr_id_str, label_name)) or {}
    ptype = dcm_detail.get("_type") or ({"VALUE": "scalar", "CURVE": "curve", "MAP": "map"}.get(a2l_char.char_type if a2l_char else "", "scalar"))
    detail_values = dcm_detail.get("values")
    detail_x = dcm_detail.get("x_axis")
    detail_y = dcm_detail.get("y_axis")
    detail_truncated = dcm_detail.get("truncated", False)
    detail_orig_dims = dcm_detail.get("original_dimensions")
    if ptype == "map" and detail_values:
        clamped_v, clamped_x, clamped_y, clamp_info = clamp_matrix(detail_values, detail_x, detail_y)
        detail_values = clamped_v; detail_x = clamped_x; detail_y = clamped_y
        if clamp_info:
            detail_truncated = True; detail_orig_dims = clamp_info["original_dimensions"]
    return {
        "name": label_name,
        "long_identifier": (a2l_char.description if a2l_char else dcm_detail.get("long_name", "")),
        "type": ptype,
        "unit": (a2l_char.unit if a2l_char else dcm_detail.get("unit") or dcm_detail.get("unit_w") or ""),
        "unit_x": dcm_detail.get("unit_x"), "unit_y": dcm_detail.get("unit_y"), "unit_w": dcm_detail.get("unit_w"),
        "lower_limit": a2l_char.lower_limit if a2l_char else None,
        "upper_limit": a2l_char.upper_limit if a2l_char else None,
        "function": a2l_char.function if a2l_char else "",
        "address": hex(a2l_char.ecu_address) if a2l_char else None,
        "value": dcm_detail.get("value"), "x_axis": detail_x, "y_axis": detail_y,
        "values": detail_values, "size": dcm_detail.get("size"),
        "rows": len(detail_values) if detail_values else dcm_detail.get("rows"),
        "cols": (len(detail_values[0]) if isinstance(detail_values[0], list) else None) if detail_values else dcm_detail.get("cols"),
        "truncated": detail_truncated, "original_dimensions": detail_orig_dims,
        "in_a2l": a2l_char is not None, "in_dcm": bool(dcm_detail),
        "owner": meta.get("owner", ""), "deputy": meta.get("deputy", ""),
        "comment": meta.get("comment", ""), "user_status": meta.get("user_status", "START"),
        "maturity_score": meta.get("maturity_score", 0),
        "maturity_history": jl(meta.get("maturity_history")) or [],
        "label_flags": jl(meta.get("label_flags")) or [],
        "save": bool(meta.get("save", 0)),
    }


@router.put("/sw-releases/{sr_id}/labels/{label_name}/metadata")
async def update_label_metadata(sr_id: str, label_name: str, body: LabelMetadataUpdate, user: dict = Depends(get_current_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    sr_id_str = sr["id"]
    now = _now_iso()
    email = user.get("email", "")
    existing = await fetch_one(db, "SELECT id FROM label_metadata WHERE sw_release_id=? AND label_name=?", (sr_id_str, label_name))
    if existing:
        sets: list = ["updated_at = ?", "updated_by = ?"]
        params: list = [now, email]
        if body.owner       is not None: sets.append("owner = ?");       params.append(body.owner)
        if body.deputy      is not None: sets.append("deputy = ?");      params.append(body.deputy)
        if body.comment     is not None: sets.append("comment = ?");     params.append(body.comment)
        if body.user_status is not None: sets.append("user_status = ?"); params.append(body.user_status)
        if body.label_flags is not None: sets.append("label_flags = ?"); params.append(jd(body.label_flags))
        if body.save        is not None: sets.append("save = ?");        params.append(1 if body.save else 0)
        await run(db, f"UPDATE label_metadata SET {', '.join(sets)} WHERE sw_release_id=? AND label_name=?",
                  tuple(params) + (sr_id_str, label_name))
    else:
        from models import _uuid
        await run(db, """
            INSERT INTO label_metadata (id, sw_release_id, label_name, owner, deputy, comment,
                user_status, label_flags, save, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (_uuid(), sr_id_str, label_name,
              body.owner or "", body.deputy or "", body.comment or "",
              body.user_status or "START", jd(body.label_flags or []),
              1 if body.save else 0, now, now, email))
    _invalidate_merged_cache(sr_id_str)
    return {"ok": True}


@router.put("/sw-releases/{sr_id}/labels/{label_name}/maturity")
async def update_label_maturity(sr_id: str, label_name: str, body: LabelMaturityUpdate, user: dict = Depends(get_current_user)):
    if body.score not in (0, 25, 50, 75, 100):
        raise HTTPException(400, "Score must be 0, 25, 50, 75, or 100")
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    sr_id_str = sr["id"]
    now = _now_iso()
    email = user.get("email", "")
    history_entry = {"score": body.score, "note": body.note, "user": email, "date": now}
    existing = await fetch_one(db, "SELECT id, maturity_history FROM label_metadata WHERE sw_release_id=? AND label_name=?", (sr_id_str, label_name))
    if existing:
        history = jl(existing.get("maturity_history")) or []
        history.append(history_entry)
        await run(db, "UPDATE label_metadata SET maturity_score=?, maturity_history=?, updated_at=?, updated_by=? WHERE sw_release_id=? AND label_name=?",
                  (body.score, jd(history), now, email, sr_id_str, label_name))
    else:
        from models import _uuid
        await run(db, """
            INSERT INTO label_metadata (id, sw_release_id, label_name, maturity_score, maturity_history, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (_uuid(), sr_id_str, label_name, body.score, jd([history_entry]), now, now, email))
    _invalidate_merged_cache(sr_id_str)
    return {"ok": True, "score": body.score}


@router.post("/sw-releases/{sr_id}/labels/export-dcm")
async def export_labels_to_dcm(sr_id: str, body: DcmExportRequest, user: dict = Depends(get_current_user)):
    db = get_conn()
    sr = await _require_sr(sr_id, db)
    all_labels = await _build_merged(sr, db)
    if body.label_names:
        wanted = set(body.label_names)
        filtered = [l for l in all_labels if l["name"] in wanted]
    else:
        filtered = all_labels
    if body.only_saved and not body.label_names:
        filtered = [l for l in filtered if l.get("save")]
    if body.only_maturity:
        allowed = set(body.only_maturity)
        filtered = [l for l in filtered if (l.get("maturity_score") or 0) in allowed]
    if not filtered:
        raise HTTPException(400, "No labels match the export criteria")
    scalars_map: dict = {}
    curves_map: dict = {}
    maps_map: dict = {}
    if sr.get("dcm_path") and Path(sr["dcm_path"]).exists():
        parsed = _cached_parse_dcm(sr["dcm_path"])
        scalars_map = {p["name"]: p for p in parsed.get("scalars", [])}
        curves_map  = {p["name"]: p for p in parsed.get("curves",  [])}
        maps_map    = {p["name"]: p for p in parsed.get("maps",    [])}
    wv_rows = await fetch_all(db, "SELECT * FROM label_working_values WHERE sw_release_id=?", (sr["id"],))
    working_docs = {r["label_name"]: r for r in wv_rows}
    enriched: list = []
    for label in filtered:
        n = label["name"]; t = label["type"]
        rec = {"name": n, "type": t, "long_identifier": label.get("long_identifier", ""), "unit": label.get("unit", "")}
        wp_doc = working_docs.get(n)
        if t == "scalar":
            src = scalars_map.get(n, {})
            rec["value"] = jl(wp_doc["wp_value"]) if (wp_doc and wp_doc.get("modified")) else src.get("value", 0.0)
        elif t == "curve":
            src = curves_map.get(n, {})
            rec["x_axis"] = src.get("x_axis", [])
            rec["values"] = jl(wp_doc["wp_value"]) if (wp_doc and wp_doc.get("modified")) else src.get("values", [])
            rec["unit_x"] = src.get("unit_x", ""); rec["unit_w"] = src.get("unit_w", "")
        elif t == "map":
            src = maps_map.get(n, {})
            rec["x_axis"] = src.get("x_axis", []); rec["y_axis"] = src.get("y_axis", [])
            rec["values"] = jl(wp_doc["wp_value"]) if (wp_doc and wp_doc.get("modified")) else src.get("values", [])
            rec["unit_x"] = src.get("unit_x", ""); rec["unit_y"] = src.get("unit_y", ""); rec["unit_w"] = src.get("unit_w", "")
        enriched.append(rec)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".dcm", delete=False, encoding="iso-8859-1") as tmp:
        tmp_path = tmp.name
    write_dcm(enriched, tmp_path, header={"project": f"SW Release {sr.get('version', sr_id)}", "dataset": body.filename or f"export_{ts}", "created_by": user.get("email", "kentia")})
    from models import _uuid
    await run(db, "INSERT INTO audit_log (id, action, author, date, sw_release_id, new_value) VALUES (?, 'DCM_EXPORT', ?, ?, ?, ?)",
              (_uuid(), user.get("email"), _now_iso(), sr_id, str(len(enriched))))
    content = Path(tmp_path).read_bytes()
    Path(tmp_path).unlink(missing_ok=True)
    fname = (body.filename or f"export_{ts}") + ("" if (body.filename or "").endswith(".dcm") else ".dcm")
    return StreamingResponse(io.BytesIO(content), media_type="application/octet-stream",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@router.post("/labels/merge-preview")
async def merge_preview(body: MergeRequest, user: dict = Depends(get_current_user)):
    db = get_conn()
    base_sr = await _require_sr(body.base_sr_id, db)
    base_labels = {l["name"]: l for l in await _build_merged(base_sr, db)}
    overlays = []
    for ov_id in body.overlay_sr_ids:
        ov_sr = await _require_sr(ov_id, db)
        ov_labels = {l["name"]: l for l in await _build_merged(ov_sr, db)}
        overlays.append({"sr_id": ov_id, "version": ov_sr.get("version", ""), "labels": ov_labels})
    all_names = set(base_labels) | {n for ov in overlays for n in ov["labels"]}
    plan: dict = {"identical": [], "conflicts": [], "only_in_base": [], "only_in_overlay": []}
    for name in sorted(all_names):
        base_v = base_labels.get(name, {}).get("value_preview")
        ov_vals = [{"sr": ov["sr_id"], "version": ov["version"], "value": ov["labels"][name].get("value_preview")} for ov in overlays if name in ov["labels"]]
        in_base = name in base_labels; in_overlay = bool(ov_vals)
        if in_base and not in_overlay:
            plan["only_in_base"].append({"name": name, "value": base_v})
        elif not in_base and in_overlay:
            plan["only_in_overlay"].append({"name": name, "values": ov_vals})
        elif in_base and in_overlay:
            distinct = {str(base_v)} | {str(o["value"]) for o in ov_vals}
            if len(distinct) == 1:
                plan["identical"].append({"name": name, "value": base_v})
            else:
                resolution = ("base" if body.strategy == "base_wins" else "overlay_last" if body.strategy == "overlay_wins" else (body.manual_resolutions or {}).get(name, "unresolved"))
                plan["conflicts"].append({"name": name, "base_value": base_v, "overlay_values": ov_vals, "resolution": resolution})
    plan["summary"] = {"total_labels": len(all_names), "identical_count": len(plan["identical"]), "conflicts_count": len(plan["conflicts"]), "only_in_base_count": len(plan["only_in_base"]), "only_in_overlay_count": len(plan["only_in_overlay"])}
    return plan


@router.post("/labels/merge-export")
async def merge_export(body: MergeRequest, user: dict = Depends(get_current_user)):
    db = get_conn()
    def _find_in(parsed: dict, name: str):
        for kind in ("scalars", "curves", "maps"):
            for p in parsed.get(kind, []):
                if p["name"] == name:
                    return p
        return None
    base_sr = await _require_sr(body.base_sr_id, db)
    parsed_base = _cached_parse_dcm(base_sr["dcm_path"]) if base_sr.get("dcm_path") and Path(base_sr["dcm_path"]).exists() else {}
    overlays_parsed: list = []
    for ov_id in body.overlay_sr_ids:
        ov_sr = await _require_sr(ov_id, db)
        overlays_parsed.append(_cached_parse_dcm(ov_sr["dcm_path"]) if ov_sr.get("dcm_path") and Path(ov_sr["dcm_path"]).exists() else {})
    all_names: set = set()
    for kind in ("scalars", "curves", "maps"):
        for p in parsed_base.get(kind, []): all_names.add(p["name"])
        for ov in overlays_parsed:
            for p in ov.get(kind, []): all_names.add(p["name"])
    merged: list = []
    for name in sorted(all_names):
        winner = _find_in(parsed_base, name)
        if body.strategy == "overlay_wins":
            for ov in overlays_parsed:
                cand = _find_in(ov, name)
                if cand: winner = cand
        elif body.strategy == "manual":
            res = (body.manual_resolutions or {}).get(name, "base")
            if res.startswith("overlay_"):
                idx = int(res.split("_")[1])
                cand = _find_in(overlays_parsed[idx], name) if idx < len(overlays_parsed) else None
                if cand: winner = cand
        if winner: merged.append(winner)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    with tempfile.NamedTemporaryFile(mode="w", suffix=".dcm", delete=False, encoding="iso-8859-1") as tmp:
        tmp_path = tmp.name
    write_dcm(merged, tmp_path, header={"project": "Merged calibration", "dataset": f"merge_{ts}", "created_by": user.get("email", "kentia")})
    from models import _uuid
    await run(db, "INSERT INTO audit_log (id, action, author, date, sw_release_id, new_value) VALUES (?, 'DCM_MERGE', ?, ?, ?, ?)",
              (_uuid(), user.get("email"), _now_iso(), body.base_sr_id, str(len(merged))))
    content = Path(tmp_path).read_bytes()
    Path(tmp_path).unlink(missing_ok=True)
    return StreamingResponse(io.BytesIO(content), media_type="application/octet-stream",
                             headers={"Content-Disposition": f'attachment; filename="merged_{ts}.dcm"'})
