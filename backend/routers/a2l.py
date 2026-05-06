"""
A2L Router — SW Release A2L file management

Endpoints:
- POST /api/v1/sw-releases/{id}/a2l/upload — Upload A2L file
- GET /api/v1/sw-releases/{id}/a2l/parse — Parse uploaded A2L file
"""

import os
import shutil
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from models import A2LUploadResponse

router = APIRouter(prefix="/sw-releases", tags=["A2L Management"])

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent.parent / "uploads" / "a2l"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def get_db() -> AsyncIOMotorDatabase:
    """Placeholder - db will be injected by main app"""
    from server import db

    return db


async def get_current_user(request: Request):
    """Placeholder - will be injected from auth_utils"""
    from auth_utils import get_current_user as _get_current_user
    from server import db

    return await _get_current_user(request, db)


def _parse_a2l_simple(file_path: str) -> dict:
    """
    Simple A2L parser - extracts basic structure without external library.
    Parses ASAP2 format manually.

    Returns:
    {
      "project_name": str,
      "version": str,
      "total_parameters": int,
      "scalars": [{"name", "long_identifier", "unit", "value"}],
      "maps": [{"name", "long_identifier", "rows", "cols", "unit"}],
      "curves": [{"name", "long_identifier", "size", "unit"}]
    }
    """
    result = {
        "project_name": "Unknown",
        "version": "1.0",
        "total_parameters": 0,
        "scalars": [],
        "maps": [],
        "curves": [],
    }

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        # Extract PROJECT name
        for raw_line in lines:
            line = raw_line.strip()
            if line.startswith("/begin PROJECT"):
                parts = line.split()
                if len(parts) > 2:
                    result["project_name"] = parts[2].strip('"')
                break

        # Parse CHARACTERISTIC blocks and infer VALUE/CURVE/MAP type.
        # This works better with real ASAP2 files than searching for
        # non-standard '/begin CHARACTERISTIC SCALAR' patterns.
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

                characteristics.append(
                    {
                        "name": name,
                        "long_identifier": long_identifier or name,
                        "type": ctype,
                    }
                )

                i = j
            i += 1

        for c in characteristics:
            if c["type"] == "MAP":
                result["maps"].append(
                    {
                        "name": c["name"],
                        "long_identifier": c["long_identifier"],
                        "rows": 8,
                        "cols": 8,
                        "unit": "",
                    }
                )
            elif c["type"] == "CURVE":
                result["curves"].append(
                    {
                        "name": c["name"],
                        "long_identifier": c["long_identifier"],
                        "size": 256,
                        "unit": "",
                    }
                )
            else:
                result["scalars"].append(
                    {
                        "name": c["name"],
                        "long_identifier": c["long_identifier"],
                        "unit": "",
                        "value": 0.0,
                    }
                )

        result["total_parameters"] = len(result["scalars"]) + len(result["maps"]) + len(result["curves"])

    except Exception as e:
        print(f"Warning: A2L parse error - {e}")
        result["total_parameters"] = 0

    return result


@router.post("/{sr_id}/a2l/upload", response_model=A2LUploadResponse)
async def upload_a2l(
    sr_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Upload A2L file for a SW Release.

    - Only .a2l extension accepted
    - File stored in ./uploads/a2l/{sr_id}_{filename}
    - Updates sw_release document with a2l_filename and a2l_path
    """

    try:
        db = await get_db()

        # Verify SW Release exists
        sr = await db.sw_releases.find_one({"_id": ObjectId(sr_id)})
        if not sr:
            raise HTTPException(status_code=404, detail="SW Release not found")

        # Validate file extension
        if not file.filename.endswith(".a2l"):
            raise HTTPException(
                status_code=400,
                detail="Only .a2l files are accepted",
            )

        # Save file
        file_bytes = await file.read()
        file_size = len(file_bytes)

        # Generate file path
        safe_filename = f"{sr_id}_{file.filename}"
        file_path = UPLOADS_DIR / safe_filename

        # Write file
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        # Update SW Release document
        now = datetime.now(timezone.utc).isoformat()
        await db.sw_releases.update_one(
            {"_id": ObjectId(sr_id)},
            {
                "$set": {
                    "a2l_filename": file.filename,
                    "a2l_path": str(file_path),
                    "a2l_uploaded_at": now,
                }
            },
        )

        return A2LUploadResponse(
            filename=file.filename,
            size_bytes=file_size,
            uploaded_at=now,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{sr_id}/a2l/parse")
async def parse_a2l(
    sr_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Parse uploaded A2L file for a SW Release.

    Returns structured JSON:
    {
      "project_name": str,
      "version": str,
      "total_parameters": int,
      "scalars": [{"name", "long_identifier", "unit", "value"}],
      "maps": [{"name", "long_identifier", "rows", "cols", "unit"}],
      "curves": [{"name", "long_identifier", "size", "unit"}]
    }
    """

    try:
        db = await get_db()

        # Verify SW Release exists and has A2L file
        sr = await db.sw_releases.find_one({"_id": ObjectId(sr_id)})
        if not sr:
            raise HTTPException(status_code=404, detail="SW Release not found")

        if not sr.get("a2l_path"):
            raise HTTPException(
                status_code=404,
                detail="No A2L file associated with this SW Release",
            )

        # Verify file still exists
        file_path = sr.get("a2l_path")
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail="A2L file not found on disk",
            )

        # Parse A2L
        result = _parse_a2l_simple(file_path)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse failed: {str(e)}")


@router.get("/{sr_id}/a2l/info")
async def get_a2l_info(
    sr_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Get metadata about uploaded A2L file without parsing.

    Returns:
    {
      "filename": str,
      "size_bytes": int,
      "uploaded_at": str,
      "has_file": bool
    }
    """

    try:
        db = await get_db()

        sr = await db.sw_releases.find_one({"_id": ObjectId(sr_id)})
        if not sr:
            raise HTTPException(status_code=404, detail="SW Release not found")

        a2l_filename = sr.get("a2l_filename")
        a2l_path = sr.get("a2l_path")
        uploaded_at = sr.get("a2l_uploaded_at")

        if not a2l_filename:
            return {
                "filename": None,
                "size_bytes": 0,
                "uploaded_at": None,
                "has_file": False,
            }

        # Get file size
        file_size = 0
        if a2l_path and os.path.exists(a2l_path):
            file_size = os.path.getsize(a2l_path)

        return {
            "filename": a2l_filename,
            "size_bytes": file_size,
            "uploaded_at": uploaded_at,
            "has_file": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Info query failed: {str(e)}")
