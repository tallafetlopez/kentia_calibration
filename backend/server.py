from dotenv import load_dotenv
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from auth_utils import verify_password, create_access_token, get_current_user, hash_password, require_role, user_has_role
from seed import seed_all, _make_labels
from routers import sw_releases, datasets, vehicle_sw_ids, a2l
from routers import traceability as traceability_router
from routers import dcm as dcm_router
from routers import work_packages as work_packages_router
from routers import labels as labels_router
from routers import calibration_values as calibration_values_router

load_dotenv(ROOT_DIR / ".env")

import os
import logging
from db import open_db, close_db, get_conn, fetch_one, fetch_all, run, run_many, count, jl, jd
from models import (
    CalibrationFile, CalibrationFileType, _uuid, _now, ROLES,
    RegisterBody, LoginBody, SwitchRoleBody, SoftwareReleaseCreate, DatasetCreate,
    LabelUpdate, LabelMassUpdate, ReviewUpdate, ReleaseSelectBody, DeprecateBody, DeriveBody, VehicleSWIDCreate,
    WorkPackageCreate, WorkPackageUpdate,
)
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Query, UploadFile, File
from typing import List, Optional

from starlette.middleware.cors import CORSMiddleware

app = FastAPI(title="HERKO Calibration Manager")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("herko")

DISABLE_SEED = True

_LABEL_INSERT_SQL = """
    INSERT OR IGNORE INTO labels
        (id, dataset_id, label_name, data_type, current_value, unit, level,
         confidence_status, last_modified_by, last_modification_date, regulatory_relevance,
         regulation_reference, parametrizable_in_customer, parametrizable_override_justification,
         change_justification, comments, imported_from_a2l, modified, owner, deputy,
         work_package_id, maturity)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
"""


def _label_params(label: dict, dataset_id: str = None, user_email: str = None) -> tuple:
    now = _now()
    return (
        label.get("id") or _uuid(),
        dataset_id or label.get("dataset_id", ""),
        label.get("label_name", ""),
        label.get("data_type", ""),
        label.get("current_value", ""),
        label.get("unit", ""),
        label.get("level", "CONFIGURATION"),
        label.get("confidence_status", "EMPTY"),
        user_email or label.get("last_modified_by", "system"),
        label.get("last_modification_date") or now,
        label.get("regulatory_relevance", "NO"),
        label.get("regulation_reference", ""),
        label.get("parametrizable_in_customer", "NO"),
        label.get("parametrizable_override_justification", ""),
        label.get("change_justification", ""),
        label.get("comments", ""),
        1 if label.get("imported_from_a2l") else 0,
        1 if label.get("modified") else 0,
        label.get("owner", "BeGas"),
        label.get("deputy", ""),
        label.get("work_package_id"),
        label.get("maturity", "0"),
    )


def _ds_out(row: dict) -> dict:
    if row is None:
        return None
    row["review"] = jl(row.get("review")) or {}
    row["technical_validation_summary"] = jl(row.get("technical_validation_summary")) or []
    row["locked"] = bool(row.get("locked", 0))
    row["deployed"] = bool(row.get("deployed", 0))
    row["release_candidate_flag"] = bool(row.get("release_candidate_flag", 0))
    row["is_post_sales_derived"] = bool(row.get("is_post_sales_derived", 0))
    return row


def _sr_out(row: dict) -> dict:
    if row is None:
        return None
    row["validation_log"] = jl(row.get("validation_log")) or []
    row["other_artefacts"] = jl(row.get("other_artefacts")) or []
    return row


def _user_out(row: dict) -> dict:
    if row is None:
        return None
    row["roles"] = jl(row.get("roles")) or []
    row.pop("password_hash", None)
    return row


# ── Helpers ───────────────────────────────────────────────────────────────────

async def current_user(request: Request) -> dict:
    db = get_conn()
    return await get_current_user(request, db)


async def log_audit(entity_type: str, entity_id: str, action: str, author: str,
                    previous_value=None, new_value=None, justification: str = ""):
    db = get_conn()
    await run(db, """
        INSERT INTO audit_log (id, entity_type, entity_id, action, previous_value, new_value, author, date, justification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (_uuid(), entity_type, entity_id, action,
          str(previous_value) if previous_value is not None else None,
          str(new_value) if new_value is not None else None,
          author, _now(), justification))


# ── Startup / Shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    await open_db()
    db = get_conn()
    existing = await count(db, "users")
    if existing == 0:
        if DISABLE_SEED:
            logger.info("Empty database detected, but automatic seed is DISABLED")
        else:
            logger.info("Empty database — seeding demo data")
            stats = await seed_all()
            logger.info(f"Seeded: {stats}")


@app.on_event("shutdown")
async def on_shutdown():
    await close_db()


# =====================================================
#                    AUTH
# =====================================================

@api.post("/auth/register")
async def register(body: RegisterBody):
    db = get_conn()
    email = body.email.lower()
    if await fetch_one(db, "SELECT id FROM users WHERE email=?", (email,)):
        raise HTTPException(status_code=400, detail="Email already registered")
    roles = body.roles or ["Calibration_Engineer"]
    invalid = [r for r in roles if r not in ROLES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid roles: {invalid}")
    user_id = _uuid()
    now = _now()
    await run(db, """
        INSERT INTO users (id, email, password_hash, name, roles, active_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, email, hash_password(body.password), body.name, jd(roles), roles[0], now))
    token = create_access_token(user_id, email)
    return {"token": token, "user": {
        "id": user_id, "email": email, "name": body.name,
        "roles": roles, "active_role": roles[0], "created_at": now,
    }}


@api.post("/auth/login")
async def login(body: LoginBody):
    try:
        logger.info(f"Login attempt: {body.email}")
        db = get_conn()
        email = body.email.lower()
        user = await fetch_one(db, "SELECT * FROM users WHERE email=?", (email,))
        logger.info(f"User found: {user is not None}")
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        token = create_access_token(user["id"], email)
        logger.info(f"Login successful for {email}")
        return {"token": token, "user": _user_out(dict(user))}
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        raise


@api.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@api.post("/auth/logout")
async def logout(user: dict = Depends(current_user)):
    return {"ok": True}


@api.post("/auth/switch-role")
async def switch_role(body: SwitchRoleBody, user: dict = Depends(current_user)):
    if body.role not in user.get("roles", []):
        raise HTTPException(status_code=403, detail="Role not assigned to user")
    db = get_conn()
    await run(db, "UPDATE users SET active_role=? WHERE id=?", (body.role, user["id"]))
    user["active_role"] = body.role
    return user


@api.get("/auth/roles")
async def list_roles():
    return {"roles": ROLES}


@api.get("/auth/users")
async def list_users(user: dict = Depends(current_user)):
    db = get_conn()
    rows = await fetch_all(db, "SELECT id, email, name, roles, active_role, created_at FROM users ORDER BY email")
    for r in rows:
        r["roles"] = jl(r.get("roles")) or []
    return rows


@api.patch("/auth/users/{user_id}/roles")
async def update_user_roles(user_id: str, body: dict, user: dict = Depends(current_user)):
    if "DM_Administrator" not in (user.get("roles") or []):
        raise HTTPException(403, "DM_Administrator role required")
    new_roles = body.get("roles", [])
    if not isinstance(new_roles, list) or not new_roles:
        raise HTTPException(400, "roles must be a non-empty list")
    valid = [r for r in new_roles if r in ROLES]
    if not valid:
        raise HTTPException(400, f"No valid roles provided. Valid: {ROLES}")
    db = get_conn()
    target = await fetch_one(db, "SELECT id, email, name, roles, active_role, created_at FROM users WHERE id=?", (user_id,))
    if not target:
        raise HTTPException(404, "User not found")
    active = target.get("active_role")
    if active not in valid:
        active = valid[0]
    await run(db, "UPDATE users SET roles=?, active_role=? WHERE id=?", (jd(valid), active, user_id))
    await log_audit("user", user_id, "ROLES_UPDATED", user["email"],
                    previous_value=str(jl(target.get("roles"))), new_value=str(valid))
    updated = await fetch_one(db, "SELECT id, email, name, roles, active_role, created_at FROM users WHERE id=?", (user_id,))
    updated["roles"] = jl(updated.get("roles")) or []
    return updated


# =====================================================
#                    ECUs
# =====================================================

@api.get("/ecus")
async def list_ecus(user: dict = Depends(current_user)):
    db = get_conn()
    return await fetch_all(db, "SELECT * FROM ecus")


# =====================================================
#                 SOFTWARE RELEASES
# =====================================================

@api.get("/software-releases")
async def list_software_releases(
    ecu_id: Optional[str] = None,
    status: Optional[str] = None,
    supplier: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(current_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if ecu_id:
        conditions.append("ecu_id = ?"); params.append(ecu_id)
    if status:
        conditions.append("status = ?"); params.append(status)
    if supplier:
        conditions.append("supplier = ?"); params.append(supplier)
    if q:
        conditions.append("(software_release_identifier LIKE ? OR version LIKE ? OR description LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
    rows = await fetch_all(db, f"SELECT * FROM software_releases WHERE {' AND '.join(conditions)}", tuple(params))
    return [_sr_out(r) for r in rows]


@api.get("/software-releases/{sr_id}")
async def get_software_release(sr_id: str, user: dict = Depends(current_user)):
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (sr_id,))
    if not sr:
        raise HTTPException(404, "Software release not found")
    return _sr_out(sr)


@api.post("/software-releases")
async def create_software_release(body: SoftwareReleaseCreate, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    db = get_conn()
    sr = body.model_dump()
    sr["id"] = _uuid()
    sr["status"] = "DRAFT"
    sr["release_date"] = _now()
    sr["validation_log"] = []
    await run(db, """
        INSERT INTO software_releases
            (id, ecu_id, software_release_identifier, version, description, supplier,
             release_date, status, a2l_file_reference, dbc_reference, dtc_list_reference,
             other_artefacts, validation_log)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (sr["id"], sr.get("ecu_id", ""), sr.get("software_release_identifier", ""),
          sr.get("version", ""), sr.get("description", ""), sr.get("supplier", ""),
          sr["release_date"], sr["status"], sr.get("a2l_file_reference"),
          sr.get("dbc_reference"), sr.get("dtc_list_reference"),
          jd(sr.get("other_artefacts") or []), jd([])))
    await log_audit("software_release", sr["id"], "CREATED", user["email"],
                    new_value=sr.get("software_release_identifier"))
    return _sr_out(sr)


@api.patch("/software-releases/{sr_id}")
async def update_software_release(sr_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (sr_id,))
    if not sr:
        raise HTTPException(404, "Not found")
    allowed = {"description", "supplier", "a2l_file_reference", "dbc_reference", "dtc_list_reference", "other_artefacts"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if patch:
        set_clause = ", ".join(f"{k}=?" for k in patch)
        await run(db, f"UPDATE software_releases SET {set_clause} WHERE id=?",
                  tuple(patch.values()) + (sr_id,))
        await log_audit("software_release", sr_id, "UPDATED", user["email"],
                        new_value=", ".join(patch.keys()))
    updated = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (sr_id,))
    return _sr_out(updated)


@api.post("/software-releases/{sr_id}/validate")
async def validate_release(sr_id: str, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (sr_id,))
    if not sr:
        raise HTTPException(404, "Not found")
    errors = []
    if not sr.get("a2l_file_reference"):
        errors.append("A2L file not linked")
    if sr.get("status") == "ARCHIVED":
        errors.append("Release is archived")
    log_entry = {"date": _now(), "user": user["email"], "action": "VALIDATION_RUN", "errors": errors}
    validation_log = jl(sr.get("validation_log")) or []
    validation_log.append(log_entry)
    if not errors:
        await run(db, "UPDATE software_releases SET validation_log=?, status=? WHERE id=?",
                  (jd(validation_log), "VALID_FOR_CALIBRATION", sr_id))
    else:
        await run(db, "UPDATE software_releases SET validation_log=? WHERE id=?",
                  (jd(validation_log), sr_id))
    await log_audit(
        "software_release", sr_id, "VALIDATED" if not errors else "VALIDATION_FAILED",
        user["email"], new_value="VALID_FOR_CALIBRATION" if not errors else "DRAFT",
    )
    return {"ok": not errors, "errors": errors}


# =====================================================
#                    DATASETS
# =====================================================

@api.get("/datasets")
async def list_datasets(
    software_release_id: Optional[str] = None,
    lifecycle_state: Optional[str] = None,
    creation_mode: Optional[str] = None,
    deployment_context: Optional[str] = None,
    author: Optional[str] = None,
    locked: Optional[bool] = None,
    q: Optional[str] = None,
    user: dict = Depends(current_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    for col, val in [
        ("software_release_id", software_release_id),
        ("lifecycle_state", lifecycle_state),
        ("creation_mode", creation_mode),
        ("deployment_context", deployment_context),
        ("author", author),
    ]:
        if val:
            conditions.append(f"{col} = ?"); params.append(val)
    if locked is not None:
        conditions.append("locked = ?"); params.append(1 if locked else 0)
    if q:
        conditions.append("dataset_name LIKE ?"); params.append(f"%{q}%")
    rows = await fetch_all(db, f"SELECT * FROM datasets WHERE {' AND '.join(conditions)}", tuple(params))
    return [_ds_out(r) for r in rows]


@api.get("/datasets/{ds_id}")
async def get_dataset(ds_id: str, user: dict = Depends(current_user)):
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (d["software_release_id"],))
    baseline = None
    if d.get("baseline_dataset_id"):
        baseline = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (d["baseline_dataset_id"],))
        if baseline:
            baseline = _ds_out(baseline)
    derived = await fetch_all(db, "SELECT * FROM datasets WHERE baseline_dataset_id=?", (ds_id,))
    vehicle_assignments = await fetch_all(db, "SELECT * FROM vehicle_sw_ids WHERE dataset_id=?", (ds_id,))
    return {
        "dataset": _ds_out(d),
        "software_release": _sr_out(sr) if sr else None,
        "baseline": baseline,
        "derived_datasets": [_ds_out(x) for x in derived],
        "vehicle_assignments": vehicle_assignments,
    }


@api.patch("/datasets/{ds_id}/rename")
async def rename_dataset(ds_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    db = get_conn()
    dataset = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.get("lifecycle_state") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be renamed")
    new_name = str(body.get("name") or "").strip()
    if not new_name:
        raise HTTPException(400, "Dataset name cannot be empty")
    duplicate = await fetch_one(db,
        "SELECT id FROM datasets WHERE software_release_id=? AND dataset_name=? AND id != ?",
        (dataset["software_release_id"], new_name, ds_id))
    if duplicate:
        raise HTTPException(400, "A dataset with this name already exists in the same software release")
    old_name = dataset["dataset_name"]
    updated_at = _now()
    await run(db, "UPDATE datasets SET dataset_name=?, last_modified_date=? WHERE id=?",
              (new_name, updated_at, ds_id))
    await run(db, """
        INSERT INTO audit_log
            (id, entity_type, entity_id, action, previous_value, new_value, author, date, justification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (_uuid(), "dataset", ds_id, "RENAMED", old_name, new_name, user["email"], updated_at, ""))
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.delete("/datasets/{ds_id}", status_code=204)
async def delete_dataset(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    db = get_conn()
    dataset = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.get("lifecycle_state") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be deleted")
    timestamp = _now()
    await run(db, "DELETE FROM datasets WHERE id=?", (ds_id,))
    await run(db, "DELETE FROM labels WHERE dataset_id=?", (ds_id,))
    await run(db, """
        INSERT INTO audit_log
            (id, entity_type, entity_id, action, previous_value, new_value, author, date, justification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (_uuid(), "dataset", ds_id, "DELETED", dataset["dataset_name"], None, user["email"], timestamp, ""))


@api.post("/datasets")
async def create_dataset(body: DatasetCreate, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (body.software_release_id,))
    if not sr:
        raise HTTPException(404, "Software release not found")
    if sr["status"] != "VALID_FOR_CALIBRATION":
        raise HTTPException(400, "Software release is not VALID_FOR_CALIBRATION — cannot create dataset")
    if not sr.get("a2l_file_reference"):
        raise HTTPException(400, "Software release has no A2L linked")
    if body.creation_mode == "REUSE_BASELINE" and body.deployment_context not in (
        "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"
    ):
        raise HTTPException(400, "REUSE_BASELINE only allowed for VARIANT_SPECIFIC / POST_SALES / VIN_SPECIFIC")
    baseline = None
    if body.baseline_dataset_id:
        baseline = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (body.baseline_dataset_id,))
        if not baseline:
            raise HTTPException(404, "Baseline dataset not found")
        if body.creation_mode == "REUSE_BASELINE" and baseline["deployment_context"] == "PRODUCTION" and body.deployment_context == "PRODUCTION":
            raise HTTPException(400, "Reused datasets cannot themselves be base PRODUCTION datasets")
    now = _now()
    d_id = _uuid()
    review = {
        "technical": "PENDING", "project_configuration": "PENDING",
        "regulatory": "PENDING", "vnv": "PENDING",
        "technical_comments": "", "project_configuration_comments": "",
        "regulatory_comments": "", "vnv_comments": "",
        "vnv_report_reference": None,
        "approval_decision": None, "approval_date": None, "approved_by": None,
    }
    changelog = body.changelog_summary or f"Created via {body.creation_mode}"
    await run(db, """
        INSERT INTO datasets
            (id, dataset_name, ecu_id, software_release_id, lifecycle_state, creation_mode,
             deployment_context, variant_id, vin, baseline_dataset_id, author, creation_date,
             last_modified_date, technical_validation_status, technical_validation_summary,
             locked, deployed, release_candidate_flag, changelog_summary, review,
             is_post_sales_derived)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (d_id, body.dataset_name, sr.get("ecu_id", ""), body.software_release_id, "EDIT",
          body.creation_mode, body.deployment_context, body.variant_id, body.vin,
          body.baseline_dataset_id, user["email"], now, now, "NOT_RUN", jd([]),
          0, 0, 0, changelog, jd(review),
          1 if body.deployment_context in ("POST_SALES", "VIN_SPECIFIC") else 0))
    if baseline:
        base_labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (baseline["id"],))
        if base_labels:
            params_list = [_label_params({**l, "id": _uuid(), "modified": False}, d_id, user["email"])
                           for l in base_labels]
            await run_many(db, _LABEL_INSERT_SQL, params_list)
    await log_audit("dataset", d_id, "CREATED", user["email"],
                    new_value=f"{body.dataset_name} [{body.creation_mode}]",
                    justification=changelog)
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (d_id,))
    return _ds_out(d)


@api.post("/datasets/{ds_id}/technical-validate")
async def technical_validate(ds_id: str, user: dict = Depends(current_user)):
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is locked")
    labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))
    if not labels:
        status = "PASS"
        errors = ["⚠️  No labels defined yet — add labels before submitting for approval"]
        await run(db, "UPDATE datasets SET technical_validation_status=?, technical_validation_summary=?, last_modified_date=? WHERE id=?",
                  (status, jd(errors), _now(), ds_id))
        await log_audit("dataset", ds_id, f"TECH_VALIDATION_{status}", user["email"], new_value=status)
        return {"status": status, "errors": errors}
    errors = []
    for l in labels:
        if l.get("confidence_status") == "EMPTY":
            errors.append(f"{l['label_name']}: confidence is EMPTY")
        if l.get("regulatory_relevance") == "YES" and not l.get("change_justification"):
            errors.append(f"{l['label_name']}: regulatory-relevant label missing change justification")
        if l.get("regulatory_relevance") == "YES" and l.get("parametrizable_in_customer") == "YES" \
                and not l.get("parametrizable_override_justification"):
            errors.append(f"{l['label_name']}: regulatory + customer-parametrizable requires override justification")
    if d["deployment_context"] == "PRODUCTION":
        for l in labels:
            if l.get("regulatory_relevance") == "YES" and l.get("confidence_status") != "DOCUMENTED":
                errors.append(f"{l['label_name']}: PRODUCTION context requires regulatory-relevant labels DOCUMENTED")
    status = "PASS" if not errors else "FAIL"
    await run(db, "UPDATE datasets SET technical_validation_status=?, technical_validation_summary=?, last_modified_date=? WHERE id=?",
              (status, jd(errors), _now(), ds_id))
    await log_audit("dataset", ds_id, f"TECH_VALIDATION_{status}", user["email"], new_value=status)
    return {"status": status, "errors": errors}


@api.post("/datasets/{ds_id}/submit-approval")
async def submit_approval(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    d = _ds_out(d)
    if d["lifecycle_state"] != "EDIT":
        raise HTTPException(400, f"Dataset must be in EDIT state (currently {d['lifecycle_state']})")
    if not d["changelog_summary"]:
        raise HTTPException(400, "Changelog summary is required")
    if not d["review"].get("vnv_report_reference"):
        raise HTTPException(400, "V&V report reference must be attached before submission")
    if d.get("technical_validation_status") in (None, "NOT_RUN"):
        labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))
        if not labels:
            validation_status = "PASS"
            validation_errors = ["⚠️  No labels defined yet — add labels before submitting for approval"]
        else:
            validation_errors = []
            for l in labels:
                if l.get("confidence_status") == "EMPTY":
                    validation_errors.append(f"{l['label_name']}: confidence is EMPTY")
                if l.get("regulatory_relevance") == "YES" and not l.get("change_justification"):
                    validation_errors.append(f"{l['label_name']}: regulatory-relevant label missing change justification")
                if l.get("regulatory_relevance") == "YES" and l.get("parametrizable_in_customer") == "YES" \
                        and not l.get("parametrizable_override_justification"):
                    validation_errors.append(f"{l['label_name']}: regulatory + customer-parametrizable requires override justification")
            if d["deployment_context"] == "PRODUCTION":
                for l in labels:
                    if l.get("regulatory_relevance") == "YES" and l.get("confidence_status") != "DOCUMENTED":
                        validation_errors.append(f"{l['label_name']}: PRODUCTION context requires regulatory-relevant labels DOCUMENTED")
            validation_status = "PASS" if not validation_errors else "FAIL"
        await run(db, "UPDATE datasets SET technical_validation_status=?, technical_validation_summary=?, last_modified_date=? WHERE id=?",
                  (validation_status, jd(validation_errors), _now(), ds_id))
        await log_audit("dataset", ds_id, f"TECH_VALIDATION_{validation_status}", user["email"], new_value=validation_status)
        if validation_status == "FAIL":
            raise HTTPException(400, f"Technical validation FAILED — fix {len(validation_errors)} issue(s) first")
    else:
        if d["technical_validation_status"] != "PASS":
            raise HTTPException(400, "Technical validation must PASS before submission")
    review = d["review"]
    for k in ("technical", "project_configuration", "regulatory", "vnv"):
        review[k] = "PENDING"
    await run(db, "UPDATE datasets SET lifecycle_state=?, review=?, last_modified_date=? WHERE id=?",
              ("UNDER_APPROVAL", jd(review), _now(), ds_id))
    await log_audit("dataset", ds_id, "EDIT→UNDER_APPROVAL", user["email"],
                    previous_value="EDIT", new_value="UNDER_APPROVAL")
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/attach-vnv")
async def attach_vnv(ds_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "PD_Verification_Validation_Engineer", "Post_Sales_Engineer")
    ref = body.get("vnv_report_reference", "")
    if not ref:
        raise HTTPException(400, "vnv_report_reference required")
    db = get_conn()
    d = await fetch_one(db, "SELECT review FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    review = jl(d["review"]) or {}
    review["vnv_report_reference"] = ref
    await run(db, "UPDATE datasets SET review=?, last_modified_date=? WHERE id=?",
              (jd(review), _now(), ds_id))
    await log_audit("dataset", ds_id, "VNV_REPORT_ATTACHED", user["email"], new_value=ref)
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/review")
async def submit_review(ds_id: str, body: ReviewUpdate, user: dict = Depends(current_user)):
    role_map = {
        "technical": ("Calibration_Engineer", "PI_Engineering_Manager"),
        "project_configuration": ("Configuration_Manager", "PD_Project_Manager"),
        "regulatory": ("PI_Regulatory_Compliance_Specialist",),
        "vnv": ("PD_Verification_Validation_Engineer",),
    }
    require_role(user, *role_map[body.domain])
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset is not UNDER_APPROVAL")
    review = jl(d.get("review")) or {}
    review[body.domain] = body.status
    review[f"{body.domain}_comments"] = body.comments or ""
    if body.domain == "vnv" and body.vnv_report_reference:
        review["vnv_report_reference"] = body.vnv_report_reference
    if body.status == "REWORK_REQUIRED":
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            review[k] = "PENDING"
        await run(db, "UPDATE datasets SET lifecycle_state='EDIT', review=?, last_modified_date=? WHERE id=?",
                  (jd(review), _now(), ds_id))
        await log_audit("dataset", ds_id, f"REWORK_{body.domain.upper()}", user["email"],
                        justification=body.comments or "")
    else:
        await run(db, "UPDATE datasets SET review=?, last_modified_date=? WHERE id=?",
                  (jd(review), _now(), ds_id))
        await log_audit("dataset", ds_id, f"REVIEW_{body.domain.upper()}_{body.status}",
                        user["email"], new_value=body.status, justification=body.comments or "")
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/approve")
async def approve_dataset(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "PI_Engineering_Manager")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset must be UNDER_APPROVAL")
    review = jl(d.get("review")) or {}
    for k in ("technical", "project_configuration", "regulatory", "vnv"):
        if review.get(k) != "ACCEPTED":
            raise HTTPException(400, f"Review '{k}' is not ACCEPTED")
    now = _now()
    review["approval_decision"] = "APPROVED"
    review["approval_date"] = now
    review["approved_by"] = user["email"]
    await run(db, "UPDATE datasets SET lifecycle_state='APPROVED', review=?, last_modified_date=? WHERE id=?",
              (jd(review), now, ds_id))
    await log_audit("dataset", ds_id, "UNDER_APPROVAL→APPROVED", user["email"],
                    previous_value="UNDER_APPROVAL", new_value="APPROVED")
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/release-select")
async def release_select(ds_id: str, body: ReleaseSelectBody, user: dict = Depends(current_user)):
    require_role(user, "Configuration_Manager")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "APPROVED":
        raise HTTPException(400, "Only APPROVED datasets can be selected for release")
    now = _now()
    await run(db, """
        UPDATE datasets SET lifecycle_state='RELEASE_CANDIDATE', release_candidate_flag=1, locked=1,
            selected_deployment_context=?, selected_variant_id=?, selection_justification=?,
            selected_by=?, selection_date=?, last_modified_date=?
        WHERE id=?
    """, (body.selected_deployment_context, body.selected_variant_id, body.selection_justification,
          user["email"], now, now, ds_id))
    await log_audit("dataset", ds_id, "APPROVED→RELEASE_CANDIDATE", user["email"],
                    previous_value="APPROVED", new_value="RELEASE_CANDIDATE",
                    justification=body.selection_justification)
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/deprecate")
async def deprecate_dataset(ds_id: str, body: DeprecateBody, user: dict = Depends(current_user)):
    require_role(user, "Configuration_Manager")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] not in ("RELEASED", "RELEASE_CANDIDATE", "APPROVED"):
        raise HTTPException(400, "Can only deprecate APPROVED / RELEASE_CANDIDATE / RELEASED datasets")
    if not body.justification:
        raise HTTPException(400, "Justification is required")
    if body.replacement_dataset_id:
        rep = await fetch_one(db, "SELECT id FROM datasets WHERE id=?", (body.replacement_dataset_id,))
        if not rep:
            raise HTTPException(404, "Replacement dataset not found")
    now = _now()
    await run(db, """
        UPDATE datasets SET lifecycle_state='DEPRECATED', locked=1,
            deprecation_justification=?, deprecation_replacement_id=?, deprecation_date=?, last_modified_date=?
        WHERE id=?
    """, (body.justification, body.replacement_dataset_id, now, now, ds_id))
    await log_audit("dataset", ds_id, "DEPRECATED", user["email"],
                    previous_value=d["lifecycle_state"], new_value="DEPRECATED",
                    justification=body.justification)
    updated = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    return _ds_out(updated)


@api.post("/datasets/{ds_id}/derive-post-sales")
async def derive_post_sales(ds_id: str, body: DeriveBody, user: dict = Depends(current_user)):
    require_role(user, "Post_Sales_Engineer", "Calibration_Engineer")
    db = get_conn()
    base = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not base:
        raise HTTPException(404, "Not found")
    if base["lifecycle_state"] != "RELEASED":
        raise HTTPException(400, "Post-sales derivation requires baseline in RELEASED state")
    ctx = "VIN_SPECIFIC" if body.vin else "POST_SALES"
    new_id = _uuid()
    now = _now()
    review = {
        "technical": "PENDING", "project_configuration": "PENDING",
        "regulatory": "PENDING", "vnv": "PENDING",
        "technical_comments": "", "project_configuration_comments": "",
        "regulatory_comments": "", "vnv_comments": "",
        "vnv_report_reference": None,
        "approval_decision": None, "approval_date": None, "approved_by": None,
    }
    changelog = body.changelog_summary or f"Derived post-sales from {base['dataset_name']}"
    await run(db, """
        INSERT INTO datasets
            (id, dataset_name, ecu_id, software_release_id, lifecycle_state, creation_mode,
             deployment_context, variant_id, vin, baseline_dataset_id, author, creation_date,
             last_modified_date, technical_validation_status, technical_validation_summary,
             locked, deployed, release_candidate_flag, changelog_summary, review, is_post_sales_derived)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (new_id, body.dataset_name, base.get("ecu_id", ""), base["software_release_id"], "EDIT",
          "REUSE_BASELINE", ctx, body.variant_id, body.vin, ds_id, user["email"], now, now,
          "NOT_RUN", jd([]), 0, 0, 0, changelog, jd(review), 1))
    base_labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))
    if base_labels:
        params_list = [_label_params({**l, "id": _uuid(), "modified": False}, new_id) for l in base_labels]
        await run_many(db, _LABEL_INSERT_SQL, params_list)
    await log_audit("dataset", new_id, "DERIVED_POST_SALES", user["email"],
                    previous_value=base["id"], new_value=new_id, justification=changelog)
    new_ds = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (new_id,))
    return _ds_out(new_ds)


# =====================================================
#                    LABELS
# =====================================================

@api.get("/datasets/{ds_id}/labels")
async def list_labels(ds_id: str, user: dict = Depends(current_user)):
    db = get_conn()
    return await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))


@api.post("/datasets/{ds_id}/labels/import-defaults")
async def import_default_labels(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is read-only")
    existing = await count(db, "labels", "dataset_id=?", (ds_id,))
    if existing > 0:
        raise HTTPException(400, f"Dataset already has {existing} labels")
    labels = _make_labels(ds_id, all_complete=False)
    if labels:
        params_list = [_label_params(l, ds_id) for l in labels]
        await run_many(db, _LABEL_INSERT_SQL, params_list)
    await run(db, "UPDATE datasets SET last_modified_date=?, technical_validation_status='NOT_RUN', technical_validation_summary=? WHERE id=?",
              (_now(), jd([]), ds_id))
    await log_audit("dataset", ds_id, "DEFAULT_LABELS_IMPORTED", user["email"], new_value=f"{len(labels)} labels")
    return {"ok": True, "inserted": len(labels)}


def _enforce_label_rules(dataset: dict, label: dict, patch: dict):
    merged = {**label, **{k: v for k, v in patch.items() if v is not None}}
    if merged.get("regulatory_relevance") == "YES" and merged.get("parametrizable_in_customer") == "YES" \
            and not merged.get("parametrizable_override_justification"):
        raise HTTPException(400, f"{label['label_name']}: regulatory + parametrizable-in-customer requires override justification")
    if merged.get("regulatory_relevance") == "YES" and "current_value" in patch and not merged.get("change_justification"):
        raise HTTPException(400, f"{label['label_name']}: regulatory-relevant label change requires justification")
    if dataset.get("is_post_sales_derived") and dataset.get("baseline_dataset_id"):
        if "current_value" in patch and label.get("parametrizable_in_customer") != "YES":
            raise HTTPException(400, f"{label['label_name']}: not parametrizable_in_customer — cannot be modified in post-sales derived dataset")
    return merged


@api.patch("/datasets/{ds_id}/labels/{label_id}")
async def update_label(ds_id: str, label_id: str, body: LabelUpdate, user: dict = Depends(current_user)):
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, f"Dataset is {d['lifecycle_state']} and read-only. Derive a new dataset to modify.")
    label = await fetch_one(db, "SELECT * FROM labels WHERE id=? AND dataset_id=?", (label_id, ds_id))
    if not label:
        raise HTTPException(404, "Label not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return label
    _enforce_label_rules(_ds_out(dict(d)), label, patch)
    patch["last_modified_by"] = user["email"]
    patch["last_modification_date"] = _now()
    patch["modified"] = 1
    set_clause = ", ".join(f"{k}=?" for k in patch)
    await run(db, f"UPDATE labels SET {set_clause} WHERE id=?", tuple(patch.values()) + (label_id,))
    await run(db, "UPDATE datasets SET last_modified_date=? WHERE id=?", (_now(), ds_id))
    await log_audit("label", label_id, "LABEL_UPDATED", user["email"],
                    previous_value=label.get("current_value"),
                    new_value=patch.get("current_value", label.get("current_value")),
                    justification=body.change_justification or "")
    updated = await fetch_one(db, "SELECT * FROM labels WHERE id=?", (label_id,))
    return updated


@api.post("/datasets/{ds_id}/labels/mass-update")
async def mass_update(ds_id: str, body: LabelMassUpdate, user: dict = Depends(current_user)):
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (ds_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is read-only")
    patch_src = {k: v for k, v in body.patch.model_dump().items() if v is not None}
    if not patch_src:
        return {"updated": 0}
    updated = 0
    for lid in body.label_ids:
        label = await fetch_one(db, "SELECT * FROM labels WHERE id=? AND dataset_id=?", (lid, ds_id))
        if not label:
            continue
        try:
            _enforce_label_rules(_ds_out(dict(d)), label, patch_src)
        except HTTPException:
            continue
        patch = dict(patch_src)
        patch["last_modified_by"] = user["email"]
        patch["last_modification_date"] = _now()
        patch["modified"] = 1
        set_clause = ", ".join(f"{k}=?" for k in patch)
        await run(db, f"UPDATE labels SET {set_clause} WHERE id=?", tuple(patch.values()) + (lid,))
        updated += 1
    await run(db, "UPDATE datasets SET last_modified_date=? WHERE id=?", (_now(), ds_id))
    await log_audit("dataset", ds_id, "LABELS_MASS_UPDATED", user["email"], new_value=f"{updated} labels")
    return {"updated": updated}


# =====================================================
#                 VEHICLE SW IDs
# =====================================================

@api.get("/vehicle-sw-ids")
async def list_vehicle_sw_ids(
    software_release_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
    user: dict = Depends(current_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if software_release_id:
        conditions.append("software_release_id = ?"); params.append(software_release_id)
    if dataset_id:
        conditions.append("dataset_id = ?"); params.append(dataset_id)
    return await fetch_all(db, f"SELECT * FROM vehicle_sw_ids WHERE {' AND '.join(conditions)}", tuple(params))


@api.post("/vehicle-sw-ids")
async def create_vehicle_sw_id(body: VehicleSWIDCreate, user: dict = Depends(current_user)):
    require_role(user, "DM_Administrator")
    db = get_conn()
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (body.dataset_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] not in ("RELEASE_CANDIDATE", "RELEASED"):
        raise HTTPException(400, "Only RELEASE_CANDIDATE or RELEASED datasets can be assigned to vehicles")
    now = _now()
    vs_id = _uuid()
    await run(db, """
        INSERT INTO vehicle_sw_ids
            (id, vehicle_sw_id, software_release_id, dataset_id, variant_id, vin,
             manufacturing_order_reference, service_case_reference, creation_date, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (vs_id, vs_id, d["software_release_id"], d["id"],
          body.variant_id or d.get("selected_variant_id") or d.get("variant_id"),
          body.vin or d.get("vin"), body.manufacturing_order_reference,
          body.service_case_reference, now, user["email"]))
    if d["lifecycle_state"] == "RELEASE_CANDIDATE":
        await run(db, "UPDATE datasets SET lifecycle_state='RELEASED', deployed=1, last_modified_date=? WHERE id=?",
                  (now, d["id"]))
        await log_audit("dataset", d["id"], "RELEASE_CANDIDATE→RELEASED", user["email"],
                        previous_value="RELEASE_CANDIDATE", new_value="RELEASED")
    await log_audit("vehicle_sw_id", vs_id, "CREATED", user["email"],
                    new_value=f"dataset={d['dataset_name']}, vin={body.vin or d.get('vin')}")
    return await fetch_one(db, "SELECT * FROM vehicle_sw_ids WHERE id=?", (vs_id,))


# =====================================================
#                 AUDIT LOG
# =====================================================

@api.get("/audit-log")
async def list_audit(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 200,
    user: dict = Depends(current_user),
):
    db = get_conn()
    conditions = ["1=1"]
    params: list = []
    if entity_type:
        conditions.append("entity_type = ?"); params.append(entity_type)
    if entity_id:
        conditions.append("entity_id = ?"); params.append(entity_id)
    return await fetch_all(db,
        f"SELECT * FROM audit_log WHERE {' AND '.join(conditions)} ORDER BY date DESC LIMIT ?",
        tuple(params) + (min(limit, 1000),))


# =====================================================
#             DASHBOARD & TRACEABILITY
# =====================================================

@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(current_user)):
    db = get_conn()
    total_sr = await count(db, "software_releases")
    valid_sr = await count(db, "software_releases", "status=?", ("VALID_FOR_CALIBRATION",))
    states = ["EDIT", "UNDER_APPROVAL", "APPROVED", "RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"]
    by_state = {s: await count(db, "datasets", "lifecycle_state=?", (s,)) for s in states}
    deployed = await count(db, "datasets", "deployed=1")
    vehicle_sw_ids_count = await count(db, "vehicle_sw_ids")
    recent_audit = await fetch_all(db, "SELECT * FROM audit_log ORDER BY date DESC LIMIT 8")
    return {
        "software_releases_total": total_sr,
        "software_releases_valid": valid_sr,
        "datasets_by_state": by_state,
        "pending_reviews": by_state["UNDER_APPROVAL"],
        "release_candidates": by_state["RELEASE_CANDIDATE"],
        "deployed_datasets": deployed,
        "vehicle_sw_ids": vehicle_sw_ids_count,
        "recent_audit": recent_audit,
    }


@api.get("/traceability")
async def traceability(user: dict = Depends(current_user)):
    db = get_conn()
    releases = await fetch_all(db, "SELECT * FROM software_releases")
    datasets_all = await fetch_all(db, "SELECT * FROM datasets")
    vs_ids = await fetch_all(db, "SELECT * FROM vehicle_sw_ids")
    return {
        "software_releases": [_sr_out(r) for r in releases],
        "datasets": [_ds_out(r) for r in datasets_all],
        "vehicle_sw_ids": vs_ids,
    }


@api.get("/datasets/{ds_id}/compare/{other_id}")
async def compare_datasets(ds_id: str, other_id: str, user: dict = Depends(current_user)):
    db = get_conn()
    a_labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (ds_id,))
    b_labels = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (other_id,))
    a_map = {l["label_name"]: l for l in a_labels}
    b_map = {l["label_name"]: l for l in b_labels}
    all_names = sorted(set(a_map) | set(b_map))
    diffs = []
    for name in all_names:
        la = a_map.get(name)
        lb = b_map.get(name)
        if la and lb:
            if la.get("current_value") != lb.get("current_value"):
                diffs.append({
                    "label_name": name,
                    "a_value": la.get("current_value"),
                    "b_value": lb.get("current_value"),
                    "unit": la.get("unit") or lb.get("unit"),
                    "change_type": "CHANGED",
                })
        elif la and not lb:
            diffs.append({"label_name": name, "a_value": la.get("current_value"), "b_value": None, "change_type": "REMOVED"})
        elif lb and not la:
            diffs.append({"label_name": name, "a_value": None, "b_value": lb.get("current_value"), "change_type": "ADDED"})
    return {"diffs": diffs, "total_labels_a": len(a_labels), "total_labels_b": len(b_labels)}


# =====================================================
#          SW RELEASE → DATASET ASSIGNMENT
# =====================================================

@api.post("/software-releases/{sr_id}/assign-dataset")
async def assign_dataset_to_release(sr_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "DM_Administrator", "Configuration_Manager")
    db = get_conn()
    sr = await fetch_one(db, "SELECT * FROM software_releases WHERE id=?", (sr_id,))
    if not sr:
        raise HTTPException(404, "Software release not found")
    dataset_id = body.get("dataset_id")
    if not dataset_id:
        raise HTTPException(400, "dataset_id is required")
    d = await fetch_one(db, "SELECT * FROM datasets WHERE id=?", (dataset_id,))
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["software_release_id"] != sr_id:
        raise HTTPException(400, "Dataset does not belong to this software release")
    if d["lifecycle_state"] not in ("RELEASE_CANDIDATE", "RELEASED"):
        raise HTTPException(400, "Only RELEASE_CANDIDATE or RELEASED datasets can be assigned")
    now = _now()
    vs_id = _uuid()
    await run(db, """
        INSERT INTO vehicle_sw_ids
            (id, vehicle_sw_id, software_release_id, dataset_id, variant_id, vin,
             manufacturing_order_reference, service_case_reference, creation_date, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (vs_id, vs_id, sr_id, dataset_id,
          body.get("variant_id") or d.get("selected_variant_id") or d.get("variant_id"),
          body.get("vin") or d.get("vin"), body.get("manufacturing_order_reference"),
          body.get("service_case_reference"), now, user["email"]))
    if d["lifecycle_state"] == "RELEASE_CANDIDATE":
        await run(db, "UPDATE datasets SET lifecycle_state='RELEASED', deployed=1, last_modified_date=? WHERE id=?",
                  (now, dataset_id))
        await log_audit("dataset", dataset_id, "RELEASE_CANDIDATE→RELEASED", user["email"],
                        previous_value="RELEASE_CANDIDATE", new_value="RELEASED")
    await log_audit("vehicle_sw_id", vs_id, "SW_ASSIGNED", user["email"],
                    new_value=f"sr={sr['software_release_identifier']}, dataset={d['dataset_name']}, vin={body.get('vin') or d.get('vin')}")
    return await fetch_one(db, "SELECT * FROM vehicle_sw_ids WHERE id=?", (vs_id,))


# =====================================================
#                 VISUALIZATION
# =====================================================

@api.get("/viz/calibration-map/{dataset_id}/json")
async def viz_calibration_map_json(
    dataset_id: str,
    mode: str = "heatmap",
    compare_id: str = None,
    smooth: bool = True,
    user: dict = Depends(current_user),
):
    import sys as _sys, os as _os
    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    try:
        from visualization.heatmap_3d import CalibrationMap3D
        import plotly.io as pio
    except ImportError as e:
        raise HTTPException(500, f"Visualization deps not installed: {e}")
    db = get_conn()
    labels_a = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (dataset_id,))
    if not labels_a:
        raise HTTPException(404, "No labels found for this dataset")
    labels_b = None
    if compare_id:
        labels_b = await fetch_all(db, "SELECT * FROM labels WHERE dataset_id=?", (compare_id,))
    try:
        viz = CalibrationMap3D(labels_a=labels_a, labels_b=labels_b)
        fig = viz.build(mode=mode, smooth=smooth)
    except Exception as e:
        raise HTTPException(400, f"Visualization error: {e}")
    return pio.to_json(fig, validate=False)


# =====================================================
#                 ADMIN
# =====================================================

@api.post("/seed")
async def reseed(user: dict = Depends(current_user)):
    stats = await seed_all()
    return {"ok": True, **stats}


# =====================================================
app.include_router(api)

# ── v1 API Routers ──────────────────────────────────
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(sw_releases.router)
api_v1.include_router(datasets.router)
api_v1.include_router(vehicle_sw_ids.router)
api_v1.include_router(traceability_router.router)
api_v1.include_router(a2l.router)
api_v1.include_router(dcm_router.router)
api_v1.include_router(work_packages_router.router)
api_v1.include_router(labels_router.router)
api_v1.include_router(calibration_values_router.router)
app.include_router(api_v1)

# ── Visualization module ─────────────────────────────
try:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from visualization.viz_api import viz_router
    app.include_router(viz_router)
except ImportError:
    pass

_env_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
_default_dev_origins = [
    "http://localhost:3000", "http://localhost:3001", "http://localhost:3002",
    "http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3002",
]
# Tauri production origins
_tauri_origins = ["tauri://localhost", "http://tauri.localhost"]
CORS_ORIGINS = list(dict.fromkeys(
    [o.strip() for o in _env_cors_origins if o.strip()] + _default_dev_origins + _tauri_origins
))
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    # Windowed (console=False) frozen exe has no console handles — redirect to log file.
    if getattr(sys, "frozen", False) and sys.stdout is None:
        from resource_path import app_data_dir
        _log_path = app_data_dir() / "server.log"
        _log_file = open(_log_path, "a", buffering=1, encoding="utf-8")
        sys.stdout = _log_file
        sys.stderr = _log_file
    _port = int(os.environ.get("HERKO_API_PORT", 8765))
    uvicorn.run(app, host="127.0.0.1", port=_port, log_level="info")
