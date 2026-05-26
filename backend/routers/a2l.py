"""A2L Router — SW Release A2L file management (SQLite)."""

import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request

from models import A2LUploadResponse
from db import fetch_one, run, get_conn
from dependencies import get_current_user, now_iso

router = APIRouter(prefix="/sw-releases", tags=["A2L Management"])

UPLOADS_DIR = Path(__file__).parent.parent / "uploads" / "a2l"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


def _parse_a2l_simple(file_path: str) -> dict:
    result = {"project_name": "Unknown", "version": "1.0", "total_parameters": 0,
              "scalars": [], "maps": [], "curves": []}
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        for raw_line in lines:
            line = raw_line.strip()
            if line.startswith("/begin PROJECT"):
                parts = line.split()
                if len(parts) > 2:
                    result["project_name"] = parts[2].strip('"')
                break
        characteristics = []
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if line.startswith("/begin CHARACTERISTIC"):
                parts = line.split()
                name = parts[2] if len(parts) > 2 else f"CHAR_{len(characteristics)}"
                long_identifier = ""
                ctype = "UNKNOWN"
                j = i + 1
                while j < len(lines):
                    inner = lines[j].strip()
                    if inner.startswith("/end CHARACTERISTIC"):
                        break
                    if not long_identifier and inner.startswith('"'):
                        long_identifier = inner.strip('"')
                    token = inner.split()[0] if inner else ""
                    if token in {"VALUE", "CURVE", "MAP"}:
                        ctype = token
                    j += 1
                characteristics.append({"name": name, "long_identifier": long_identifier or name, "type": ctype})
                i = j
            i += 1
        for c in characteristics:
            if c["type"] == "MAP":
                result["maps"].append({"name": c["name"], "long_identifier": c["long_identifier"], "rows": 8, "cols": 8, "unit": ""})
            elif c["type"] == "CURVE":
                result["curves"].append({"name": c["name"], "long_identifier": c["long_identifier"], "size": 256, "unit": ""})
            else:
                result["scalars"].append({"name": c["name"], "long_identifier": c["long_identifier"], "unit": "", "value": 0.0})
        result["total_parameters"] = len(result["scalars"]) + len(result["maps"]) + len(result["curves"])
    except Exception as e:
        print(f"Warning: A2L parse error - {e}")
    return result


async def get_user(request: Request):
    return await get_current_user(request)


@router.post("/{sr_id}/a2l/upload", response_model=A2LUploadResponse)
async def upload_a2l(sr_id: str, file: UploadFile = File(...), user: dict = Depends(get_user)):
    try:
        db = get_conn()
        sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
        if not sr:
            raise HTTPException(404, "SW Release not found")
        if not (file.filename or "").lower().endswith(".a2l"):
            raise HTTPException(400, "Only .a2l files are accepted")
        file_bytes = await file.read()
        safe_filename = f"{sr_id}_{file.filename}"
        file_path = UPLOADS_DIR / safe_filename
        file_path.write_bytes(file_bytes)
        now = now_iso()
        await run(db, "UPDATE sw_releases SET a2l_filename=?, a2l_path=?, a2l_uploaded_at=? WHERE id=?",
                  (file.filename, str(file_path), now, sr_id))
        return A2LUploadResponse(filename=file.filename, size_bytes=len(file_bytes), uploaded_at=now)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {e}")


@router.delete("/{sr_id}/a2l", status_code=204)
async def delete_a2l(sr_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
    if not sr:
        raise HTTPException(404, "SW Release not found")
    if sr.get("a2l_path"):
        try:
            Path(sr["a2l_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    await run(db, "UPDATE sw_releases SET a2l_filename=NULL, a2l_path=NULL, a2l_uploaded_at=NULL WHERE id=?", (sr_id,))


@router.get("/{sr_id}/a2l/parse")
async def parse_a2l(sr_id: str, user: dict = Depends(get_user)):
    try:
        db = get_conn()
        sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
        if not sr:
            raise HTTPException(404, "SW Release not found")
        if not sr.get("a2l_path"):
            raise HTTPException(404, "No A2L file associated with this SW Release")
        if not os.path.exists(sr["a2l_path"]):
            raise HTTPException(404, "A2L file not found on disk")
        return _parse_a2l_simple(sr["a2l_path"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Parse failed: {e}")


@router.get("/{sr_id}/a2l/info")
async def get_a2l_info(sr_id: str, user: dict = Depends(get_user)):
    try:
        db = get_conn()
        sr = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (sr_id,))
        if not sr:
            raise HTTPException(404, "SW Release not found")
        a2l_filename = sr.get("a2l_filename")
        a2l_path = sr.get("a2l_path")
        if not a2l_filename:
            return {"filename": None, "size_bytes": 0, "uploaded_at": None, "has_file": False}
        file_size = os.path.getsize(a2l_path) if a2l_path and os.path.exists(a2l_path) else 0
        return {"filename": a2l_filename, "size_bytes": file_size, "uploaded_at": sr.get("a2l_uploaded_at"), "has_file": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Info query failed: {e}")
