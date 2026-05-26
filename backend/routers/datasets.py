"""Datasets router — v1 /api/v1/datasets (SQLite)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal, get_args

from fastapi import APIRouter, HTTPException, Query, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from db import fetch_one, fetch_all, run, jl, jd, get_conn, count
from dependencies import get_current_user, now_iso
from models import LabelLevel, LabelConfidence

router = APIRouter(prefix="/datasets", tags=["Datasets"])


# ── Models ────────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    sw_release_id: str
    context: Literal["PRODUCTION", "DEVELOPMENT", "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"]
    mode: Literal["IMPORT_S37", "COPY_EXISTING", "REUSE_BASELINE", "MERGE"]
    author: str
    derived_from: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    context: Optional[str] = None
    mode: Optional[str] = None
    derived_from: Optional[str] = None
    model_config = ConfigDict(populate_by_name=True)


class StateTransitionRequest(BaseModel):
    to_state: str
    model_config = ConfigDict(populate_by_name=True)


class DatasetRenameRequest(BaseModel):
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


class ImportA2LRequest(BaseModel):
    a2l_content: str


async def get_user(request: Request):
    return await get_current_user(request)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_valid_transition(from_state: str, to_state: str) -> bool:
    valid = {
        "EDIT": ["UNDER_APPROVAL", "DEPRECATED"],
        "UNDER_APPROVAL": ["APPROVED", "EDIT", "DEPRECATED"],
        "APPROVED": ["RELEASE_CANDIDATE", "DEPRECATED"],
        "RELEASE_CANDIDATE": ["RELEASED", "DEPRECATED"],
        "RELEASED": ["DEPRECATED"],
        "DEPRECATED": [],
    }
    return to_state in valid.get(from_state, [])


def _to_response(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "name": doc.get("dataset_name", ""),
        "state": doc.get("lifecycle_state", "EDIT"),
        "context": doc.get("deployment_context", ""),
        "mode": doc.get("creation_mode", ""),
        "author": doc.get("author", ""),
        "derived_from": doc.get("baseline_dataset_id") or None,
        "sw_release_identifier": doc.get("sw_release_identifier", ""),
        "is_locked": bool(doc.get("locked", 0)),
        "created_at": doc.get("creation_date", ""),
        "updated_at": doc.get("last_modified_date", ""),
    }


def _parse_a2l_content(content: str) -> list:
    labels = []
    seen = set()
    pattern = re.compile(r'/begin\s+(CHARACTERISTIC|MEASUREMENT)\s+(\w+)\s+"([^"]*)"', re.IGNORECASE)
    for m in pattern.finditer(content):
        block_type, name, description = m.group(1), m.group(2), m.group(3)
        if name in seen:
            continue
        seen.add(name)
        snippet = content[m.end():m.end() + 300]
        dtype_match = re.search(r'\b(FLOAT32_IEEE|FLOAT64_IEEE|UBYTE|SBYTE|UWORD|SWORD|ULONG|SLONG|A_UINT64|A_INT64)\b', snippet, re.IGNORECASE)
        data_type = dtype_match.group(0).upper() if dtype_match else "FLOAT"
        labels.append({"label_name": name, "description": description, "data_type": data_type, "block_type": block_type.upper()})
    return labels


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_datasets(
    state: Optional[str] = Query(None),
    context: Optional[str] = Query(None),
    mode: Optional[str] = Query(None),
    sw_release: Optional[str] = Query(None),
    user: dict = Depends(get_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if state:
        conditions.append("lifecycle_state = ?")
        params.append(state)
    if context:
        conditions.append("deployment_context = ?")
        params.append(context)
    if mode:
        conditions.append("creation_mode = ?")
        params.append(mode)
    if sw_release:
        conditions.append("sw_release_identifier = ?")
        params.append(sw_release)
    rows = await fetch_all(db, f"SELECT * FROM datasets WHERE {' AND '.join(conditions)} ORDER BY creation_date DESC", tuple(params))
    return [_to_response(r) for r in rows]


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    return _to_response(doc)


@router.post("", status_code=201)
async def create_dataset(body: DatasetCreate, user: dict = Depends(get_user)):
    db = get_conn()
    sw_release = await fetch_one(db, "SELECT * FROM sw_releases WHERE id = ?", (body.sw_release_id,))
    if not sw_release:
        raise HTTPException(404, "SW Release not found")
    now = now_iso()
    new_id = str(uuid.uuid4())
    await run(db, """
        INSERT INTO datasets (id, dataset_name, software_release_id, sw_release_identifier,
            lifecycle_state, creation_mode, deployment_context, author, baseline_dataset_id,
            creation_date, last_modified_date)
        VALUES (?, ?, ?, ?, 'EDIT', ?, ?, ?, ?, ?, ?)
    """, (new_id, body.name, body.sw_release_id, sw_release.get("identifier", ""),
          body.mode, body.context, body.author, body.derived_from or "", now, now))
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (new_id,))
    return _to_response(doc)


@router.patch("/{dataset_id}")
async def update_dataset(dataset_id: str, body: DatasetUpdate, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    sets: list = []
    params: list = []
    if body.name is not None:
        sets.append("dataset_name = ?"); params.append(body.name)
    if body.context is not None:
        sets.append("deployment_context = ?"); params.append(body.context)
    if body.mode is not None:
        sets.append("creation_mode = ?"); params.append(body.mode)
    if body.derived_from is not None:
        sets.append("baseline_dataset_id = ?"); params.append(body.derived_from)
    if sets:
        now = now_iso()
        sets.append("last_modified_date = ?"); params.append(now)
        await run(db, f"UPDATE datasets SET {', '.join(sets)} WHERE id = ?", tuple(params) + (dataset_id,))
    return _to_response(await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,)))


@router.post("/{dataset_id}/transition")
async def transition_dataset_state(dataset_id: str, body: StateTransitionRequest, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    current = doc.get("lifecycle_state", "EDIT")
    new_state = body.to_state
    if not _is_valid_transition(current, new_state):
        raise HTTPException(400, f"Invalid transition from {current} to {new_state}")
    now = now_iso()
    locked = 1 if new_state in ("RELEASED", "RELEASE_CANDIDATE") else doc.get("locked", 0)
    await run(db, "UPDATE datasets SET lifecycle_state=?, locked=?, last_modified_date=? WHERE id=?",
              (new_state, locked, now, dataset_id))
    if new_state == "RELEASED":
        from models import _uuid
        await run(db, """
            INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, from_state, to_state)
            VALUES (?, 'dataset', ?, 'STATE_TRANSITION', ?, ?, ?, ?)
        """, (_uuid(), dataset_id, user.get("email", ""), now, current, new_state))
    return _to_response(await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,)))


@router.patch("/{dataset_id}/rename")
async def rename_dataset(dataset_id: str, body: DatasetRenameRequest, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    if doc.get("lifecycle_state", "EDIT") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be renamed")
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(400, "Dataset name cannot be empty")
    dup = await fetch_one(db, "SELECT id FROM datasets WHERE software_release_id=? AND dataset_name=? AND id!=?",
                          (doc["software_release_id"], new_name, dataset_id))
    if dup:
        raise HTTPException(400, "A dataset with this name already exists in the same software release")
    now = now_iso()
    await run(db, "UPDATE datasets SET dataset_name=?, last_modified_date=? WHERE id=?", (new_name, now, dataset_id))
    from models import _uuid
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, previous_value, new_value)
        VALUES (?, 'dataset', ?, 'RENAMED', ?, ?, ?, ?)
    """, (_uuid(), dataset_id, user.get("email", ""), now, doc["dataset_name"], new_name))
    return _to_response(await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,)))


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    if doc.get("lifecycle_state", "EDIT") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be deleted")
    now = now_iso()
    await run(db, "DELETE FROM datasets WHERE id = ?", (dataset_id,))
    await run(db, "DELETE FROM labels WHERE dataset_id = ?", (dataset_id,))
    from models import _uuid
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, previous_value)
        VALUES (?, 'dataset', ?, 'DELETED', ?, ?, ?)
    """, (_uuid(), dataset_id, user.get("email", ""), now, doc.get("dataset_name", "")))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{dataset_id}/labels/import-a2l")
async def import_labels_from_a2l(dataset_id: str, body: ImportA2LRequest, user: dict = Depends(get_user)):
    db = get_conn()
    dataset = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    parsed = _parse_a2l_content(body.a2l_content)
    if not parsed:
        raise HTTPException(422, "No labels found in A2L content")
    now = now_iso()
    author = user.get("email", "")
    from models import _uuid
    params_list = []
    for lbl in parsed:
        params_list.append((_uuid(), dataset_id, lbl["label_name"], lbl.get("description", ""),
                            lbl.get("data_type", "FLOAT"), lbl.get("block_type", "CHARACTERISTIC"),
                            author, now, now))
    await db.executemany("""
        INSERT OR IGNORE INTO labels (id, dataset_id, label_name, description, data_type, block_type,
            created_by, created_at, last_modification_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, params_list)
    await db.commit()
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, new_value)
        VALUES (?, 'dataset', ?, 'A2L_IMPORT', ?, ?, ?)
    """, (_uuid(), dataset_id, author, now, f"Imported {len(parsed)} labels from A2L"))
    return {"imported": len(parsed), "labels": [l["label_name"] for l in parsed]}


@router.get("/{dataset_id}/labels")
async def get_dataset_labels(dataset_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    return await fetch_all(db, "SELECT * FROM labels WHERE dataset_id = ?", (dataset_id,))


@router.patch("/{dataset_id}/labels/{label_id}")
async def update_label(dataset_id: str, label_id: str, body: LabelUpdateRequest, user: dict = Depends(get_user)):
    db = get_conn()
    dataset = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.get("lifecycle_state", "EDIT") != "EDIT":
        raise HTTPException(400, "Dataset is not in EDIT state")
    label = await fetch_one(db, "SELECT * FROM labels WHERE id=? AND dataset_id=?", (label_id, dataset_id))
    if not label:
        raise HTTPException(404, "Label not found")
    old_value = label.get("current_value")
    value_changed = body.current_value is not None and body.current_value != old_value
    if value_changed and not (body.change_justification or "").strip():
        raise HTTPException(422, "change_justification is required when modifying current_value")
    now = now_iso()
    author = user.get("email", "")
    update_dict = {k: v for k, v in body.model_dump().items() if v is not None}
    if value_changed:
        update_dict["modified"] = 1
    update_dict["last_modified_by"] = author
    update_dict["last_modification_date"] = now
    sets = ", ".join(f"{k} = ?" for k in update_dict)
    await run(db, f"UPDATE labels SET {sets} WHERE id = ?", tuple(update_dict.values()) + (label_id,))
    from models import _uuid
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, previous_value, new_value, dataset_id)
        VALUES (?, 'label', ?, 'LABEL_UPDATED', ?, ?, ?, ?, ?)
    """, (_uuid(), label_id, author, now, old_value, body.current_value or old_value, dataset_id))
    return await fetch_one(db, "SELECT * FROM labels WHERE id = ?", (label_id,))


@router.post("/{dataset_id}/review")
async def update_domain_review(dataset_id: str, body: ReviewDomainRequest, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    if doc.get("lifecycle_state") != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset must be UNDER_APPROVAL")
    now = now_iso()
    author = user.get("email", "")
    review = jl(doc.get("review")) or {}
    review[body.domain] = body.status
    review[f"{body.domain}_comments"] = body.comments or ""
    new_state = doc.get("lifecycle_state")
    if body.status == "REWORK_REQUIRED":
        new_state = "EDIT"
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            review[k] = "PENDING"
    await run(db, "UPDATE datasets SET review=?, lifecycle_state=?, last_modified_date=? WHERE id=?",
              (jd(review), new_state, now, dataset_id))
    from models import _uuid
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, dataset_id)
        VALUES (?, 'dataset', ?, ?, ?, ?, ?)
    """, (_uuid(), dataset_id, f"REVIEW_{body.domain.upper()}_{body.status}", author, now, dataset_id))
    return _to_response(await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,)))


@router.post("/{dataset_id}/approve")
async def approve_dataset_v1(dataset_id: str, body: ApprovalDecisionRequest, user: dict = Depends(get_user)):
    db = get_conn()
    doc = await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,))
    if not doc:
        raise HTTPException(404, "Dataset not found")
    if doc.get("lifecycle_state") != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset must be UNDER_APPROVAL")
    review = jl(doc.get("review")) or {}
    if body.decision == "APPROVED":
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            if review.get(k) != "ACCEPTED":
                raise HTTPException(400, f"Review '{k}' is not ACCEPTED")
    now = now_iso()
    author = user.get("email", "")
    if body.decision == "APPROVED":
        new_state = "APPROVED"
        review.update({"approval_decision": "APPROVED", "approval_justification": body.justification,
                       "approval_date": now, "approved_by": author})
        audit_action = "UNDER_APPROVAL→APPROVED"
    else:
        new_state = "EDIT"
        review.update({"approval_decision": "REJECTED", "approval_justification": body.justification,
                       "rejected_by": author})
        audit_action = "UNDER_APPROVAL→REJECTED→EDIT"
    await run(db, "UPDATE datasets SET lifecycle_state=?, review=?, last_modified_date=? WHERE id=?",
              (new_state, jd(review), now, dataset_id))
    from models import _uuid
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, author, date, dataset_id, justification)
        VALUES (?, 'dataset', ?, ?, ?, ?, ?, ?)
    """, (_uuid(), dataset_id, audit_action, author, now, dataset_id, body.justification))
    return _to_response(await fetch_one(db, "SELECT * FROM datasets WHERE id = ?", (dataset_id,)))


@router.get("/{dataset_id}/changelog")
async def get_dataset_changelog(dataset_id: str, user: dict = Depends(get_user)):
    db = get_conn()
    return await fetch_all(db, "SELECT * FROM audit_log WHERE entity_id=? OR dataset_id=? ORDER BY date DESC",
                           (dataset_id, dataset_id))
