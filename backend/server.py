from dotenv import load_dotenv
from pathlib import Path
import sys

# Resolve base paths for dev and PyInstaller --onefile packaged mode
if getattr(sys, 'frozen', False):
    # PyInstaller extracts files to sys._MEIPASS at runtime
    _MEIPASS = Path(sys._MEIPASS)
    ROOT_DIR = _MEIPASS
    FRONTEND_BUILD_DIR = _MEIPASS / "build"
else:
    ROOT_DIR = Path(__file__).parent
    FRONTEND_BUILD_DIR = ROOT_DIR.parent / "frontend" / "build"

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
from scripts.ensure_indexes import ensure_indexes

load_dotenv(ROOT_DIR / ".env", override=False)

import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

import logging
from models import (
    CalibrationFile, CalibrationFileType, _uuid, _now, ROLES,
    RegisterBody, LoginBody, SwitchRoleBody, SoftwareReleaseCreate, DatasetCreate,
    LabelUpdate, LabelMassUpdate, ReviewUpdate, ReleaseSelectBody, DeprecateBody, DeriveBody, VehicleSWIDCreate,
    WorkPackageCreate, WorkPackageUpdate,
)
# -------- Calibration Files API --------
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Query, UploadFile, File
from typing import List, Optional

from bson import ObjectId

from starlette.middleware.cors import CORSMiddleware

app = FastAPI(title="HERKO Calibration Manager")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("herko")

# Set to True to prevent demo data reseeding on backend startup.
DISABLE_SEED = True


# -------- Helpers --------
async def current_user(request: Request) -> dict:
    return await get_current_user(request, db)



async def log_audit(entity_type: str, entity_id: str, action: str, author: str,
                    previous_value=None, new_value=None, justification: str = ""):
    entry = {
        "id": _uuid(),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "previous_value": str(previous_value) if previous_value is not None else None,
        "new_value": str(new_value) if new_value is not None else None,
        "author": author,
        "date": _now(),
        "justification": justification,
    }
    await db.audit_log.insert_one(entry)


# -------- Startup --------
@app.on_event("startup")
async def on_startup():
    # Wrap in try/except so a slow MongoDB doesn't prevent uvicorn from
    # serving HTTP requests. Indexes will be created on the next restart
    # once MongoDB is fully ready.
    try:
        await db.users.create_index("email", unique=True)
        await db.datasets.create_index("software_release_id")
        await db.labels.create_index("dataset_id")
        await db.labels.create_index("work_package_id")
        await db.labels.create_index("owner")
        await db.labels.create_index("maturity")
        await db.work_packages.create_index([("code", 1), ("ecu_id", 1)], unique=True)
        await db.audit_log.create_index("date")
        await ensure_indexes(db)

        existing = await db.users.count_documents({})
        if existing == 0:
            if DISABLE_SEED:
                logger.info("Empty database detected, but automatic seed is DISABLED")
            else:
                logger.info("Empty database — seeding demo data")
                stats = await seed_all(db)
                logger.info(f"Seeded: {stats}")
    except Exception as exc:
        logger.warning(f"Startup DB init skipped (MongoDB may still be initialising): {exc}")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# =====================================================
#                    AUTH
# =====================================================
@api.post("/auth/register")
async def register(body: RegisterBody):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    roles = body.roles or ["Calibration_Engineer"]
    invalid = [r for r in roles if r not in ROLES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid roles: {invalid}")
    user = {
        "id": _uuid(),
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "roles": roles,
        "active_role": roles[0],
        "created_at": _now(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], email)
    user.pop("password_hash")
    user.pop("_id", None)
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(body: LoginBody):
    try:
        logger.info(f"Login attempt: {body.email}")
        email = body.email.lower()
        user = await db.users.find_one({"email": email})
        logger.info(f"User found: {user is not None}")
        if not user or not verify_password(body.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        logger.info(f"Password verified, creating token...")
        token = create_access_token(user["id"], email)
        user.pop("password_hash")
        user.pop("_id", None)
        logger.info(f"Login successful for {email}")
        return {"token": token, "user": user}
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
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_role": body.role}})
    user["active_role"] = body.role
    return user


@api.get("/auth/roles")
async def list_roles():
    return {"roles": ROLES}


@api.get("/auth/users")
async def list_users(user: dict = Depends(current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users


@api.patch("/auth/users/{user_id}/roles")
async def update_user_roles(user_id: str, body: dict, user: dict = Depends(current_user)):
    """Admin-only: update which roles are assigned to a user."""
    if "DM_Administrator" not in (user.get("roles") or []):
        raise HTTPException(403, "DM_Administrator role required")
    new_roles = body.get("roles", [])
    if not isinstance(new_roles, list) or not new_roles:
        raise HTTPException(400, "roles must be a non-empty list")
    valid = [r for r in new_roles if r in ROLES]
    if not valid:
        raise HTTPException(400, f"No valid roles provided. Valid: {ROLES}")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "User not found")
    # Ensure active_role stays valid
    active = target.get("active_role")
    if active not in valid:
        active = valid[0]
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"roles": valid, "active_role": active}},
    )
    await log_audit("user", user_id, "ROLES_UPDATED", user["email"],
                    previous_value=str(target.get("roles")), new_value=str(valid))
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated


# =====================================================
#                    ECUs
# =====================================================
@api.get("/ecus")
async def list_ecus(user: dict = Depends(current_user)):
    return await db.ecus.find({}, {"_id": 0}).to_list(100)


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
    filt = {}
    if ecu_id:
        filt["ecu_id"] = ecu_id
    if status:
        filt["status"] = status
    if supplier:
        filt["supplier"] = supplier
    if q:
        filt["$or"] = [
            {"software_release_identifier": {"$regex": q, "$options": "i"}},
            {"version": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    return await db.software_releases.find(filt, {"_id": 0}).to_list(1000)


@api.get("/software-releases/{sr_id}")
async def get_software_release(sr_id: str, user: dict = Depends(current_user)):
    sr = await db.software_releases.find_one({"id": sr_id}, {"_id": 0})
    if not sr:
        raise HTTPException(404, "Software release not found")
    return sr


@api.post("/software-releases")
async def create_software_release(body: SoftwareReleaseCreate, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    sr = body.model_dump()
    sr["id"] = _uuid()
    sr["status"] = "DRAFT"
    sr["release_date"] = _now()
    sr["validation_log"] = []
    await db.software_releases.insert_one(sr)
    await log_audit("software_release", sr["id"], "CREATED", user["email"], new_value=sr["software_release_identifier"])
    sr.pop("_id", None)
    return sr


@api.patch("/software-releases/{sr_id}")
async def update_software_release(sr_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    sr = await db.software_releases.find_one({"id": sr_id}, {"_id": 0})
    if not sr:
        raise HTTPException(404, "Not found")
    allowed = {"description", "supplier", "a2l_file_reference", "dbc_reference", "dtc_list_reference", "other_artefacts"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if patch:
        await db.software_releases.update_one({"id": sr_id}, {"$set": patch})
        await log_audit("software_release", sr_id, "UPDATED", user["email"], new_value=", ".join(patch.keys()))
    return await db.software_releases.find_one({"id": sr_id}, {"_id": 0})


@api.post("/software-releases/{sr_id}/validate")
async def validate_release(sr_id: str, user: dict = Depends(current_user)):
    require_role(user, "PD_Project_Manager")
    sr = await db.software_releases.find_one({"id": sr_id}, {"_id": 0})
    if not sr:
        raise HTTPException(404, "Not found")
    errors = []
    if not sr.get("a2l_file_reference"):
        errors.append("A2L file not linked")
    if sr.get("status") == "ARCHIVED":
        errors.append("Release is archived")
    log_entry = {
        "date": _now(),
        "user": user["email"],
        "action": "VALIDATION_RUN",
        "errors": errors,
    }
    update = {"$push": {"validation_log": log_entry}}
    if not errors:
        update["$set"] = {"status": "VALID_FOR_CALIBRATION"}
    await db.software_releases.update_one({"id": sr_id}, update)
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
    filt = {}
    for k, v in [
        ("software_release_id", software_release_id),
        ("lifecycle_state", lifecycle_state),
        ("creation_mode", creation_mode),
        ("deployment_context", deployment_context),
        ("author", author),
    ]:
        if v:
            filt[k] = v
    if locked is not None:
        filt["locked"] = locked
    if q:
        filt["dataset_name"] = {"$regex": q, "$options": "i"}
    return await db.datasets.find(filt, {"_id": 0}).to_list(2000)


@api.get("/datasets/{ds_id}")
async def get_dataset(ds_id: str, user: dict = Depends(current_user)):
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    sr = await db.software_releases.find_one({"id": d["software_release_id"]}, {"_id": 0})
    baseline = None
    if d.get("baseline_dataset_id"):
        baseline = await db.datasets.find_one({"id": d["baseline_dataset_id"]}, {"_id": 0})
    derived = await db.datasets.find({"baseline_dataset_id": ds_id}, {"_id": 0}).to_list(100)
    vehicle_assignments = await db.vehicle_sw_ids.find({"dataset_id": ds_id}, {"_id": 0}).to_list(100)
    return {
        "dataset": d,
        "software_release": sr,
        "baseline": baseline,
        "derived_datasets": derived,
        "vehicle_assignments": vehicle_assignments,
    }


@api.patch("/datasets/{ds_id}/rename")
async def rename_dataset(ds_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    dataset = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.get("lifecycle_state") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be renamed")

    new_name = str(body.get("name") or "").strip()
    if not new_name:
        raise HTTPException(400, "Dataset name cannot be empty")

    duplicate = await db.datasets.find_one(
        {
            "software_release_id": dataset["software_release_id"],
            "dataset_name": new_name,
            "id": {"$ne": ds_id},
        },
        {"_id": 0, "id": 1},
    )
    if duplicate:
        raise HTTPException(400, "A dataset with this name already exists in the same software release")

    old_name = dataset["dataset_name"]
    updated_at = _now()
    await db.datasets.update_one(
        {"id": ds_id},
        {"$set": {"dataset_name": new_name, "last_modified_date": updated_at}},
    )
    await db.audit_log.insert_one(
        {
            "id": _uuid(),
            "entity_type": "dataset",
            "entity_id": ds_id,
            "action": "RENAMED",
            "old_name": old_name,
            "new_name": new_name,
            "author": user["email"],
            "timestamp": updated_at,
            "date": updated_at,
            "previous_value": old_name,
            "new_value": new_name,
            "justification": "",
        }
    )
    renamed = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    return renamed


@api.delete("/datasets/{ds_id}", status_code=204)
async def delete_dataset(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    dataset = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    if dataset.get("lifecycle_state") != "EDIT":
        raise HTTPException(400, "Only EDIT datasets can be deleted")

    timestamp = _now()
    await db.datasets.delete_one({"id": ds_id})
    await db.labels.delete_many({"dataset_id": ds_id})
    await db.audit_log.insert_one(
        {
            "id": _uuid(),
            "entity_type": "dataset",
            "entity_id": ds_id,
            "action": "DELETED",
            "dataset_name": dataset["dataset_name"],
            "author": user["email"],
            "timestamp": timestamp,
            "date": timestamp,
            "previous_value": dataset["dataset_name"],
            "new_value": None,
            "justification": "",
        }
    )
    return


@api.post("/datasets")
async def create_dataset(body: DatasetCreate, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    sr = await db.software_releases.find_one({"id": body.software_release_id}, {"_id": 0})
    if not sr:
        raise HTTPException(404, "Software release not found")
    if sr["status"] != "VALID_FOR_CALIBRATION":
        raise HTTPException(400, "Software release is not VALID_FOR_CALIBRATION — cannot create dataset")
    if not sr.get("a2l_file_reference"):
        raise HTTPException(400, "Software release has no A2L linked")

    # Rule: REUSE_BASELINE restricted to VARIANT_SPECIFIC / POST_SALES / VIN_SPECIFIC
    if body.creation_mode == "REUSE_BASELINE" and body.deployment_context not in (
        "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"
    ):
        raise HTTPException(400, "REUSE_BASELINE only allowed for VARIANT_SPECIFIC / POST_SALES / VIN_SPECIFIC")

    baseline = None
    if body.baseline_dataset_id:
        baseline = await db.datasets.find_one({"id": body.baseline_dataset_id}, {"_id": 0})
        if not baseline:
            raise HTTPException(404, "Baseline dataset not found")
        if body.creation_mode == "REUSE_BASELINE" and baseline["deployment_context"] == "PRODUCTION" and body.deployment_context == "PRODUCTION":
            raise HTTPException(400, "Reused datasets cannot themselves be base PRODUCTION datasets")

    d = {
        "id": _uuid(),
        "dataset_name": body.dataset_name,
        "ecu_id": sr["ecu_id"],
        "software_release_id": body.software_release_id,
        "lifecycle_state": "EDIT",
        "creation_mode": body.creation_mode,
        "deployment_context": body.deployment_context,
        "variant_id": body.variant_id,
        "vin": body.vin,
        "baseline_dataset_id": body.baseline_dataset_id,
        "author": user["email"],
        "creation_date": _now(),
        "last_modified_date": _now(),
        "technical_validation_status": "NOT_RUN",
        "technical_validation_summary": [],
        "locked": False,
        "deployed": False,
        "release_candidate_flag": False,
        "changelog_summary": body.changelog_summary or f"Created via {body.creation_mode}",
        "review": {
            "technical": "PENDING", "project_configuration": "PENDING",
            "regulatory": "PENDING", "vnv": "PENDING",
            "technical_comments": "", "project_configuration_comments": "",
            "regulatory_comments": "", "vnv_comments": "",
            "vnv_report_reference": None,
            "approval_decision": None, "approval_date": None, "approved_by": None,
        },
        "selected_deployment_context": None, "selected_variant_id": None,
        "selection_justification": None, "selected_by": None, "selection_date": None,
        "deprecation_justification": None, "deprecation_replacement_id": None, "deprecation_date": None,
        "is_post_sales_derived": body.deployment_context in ("POST_SALES", "VIN_SPECIFIC"),
    }
    await db.datasets.insert_one(d)

    # Copy labels only when deriving from an explicit baseline.
    # For fresh datasets, keep labels empty until user explicitly imports them.
    if baseline:
        base_labels = await db.labels.find({"dataset_id": baseline["id"]}, {"_id": 0}).to_list(10000)
        new_labels = []
        for l in base_labels:
            nl = dict(l)
            nl["id"] = _uuid()
            nl["dataset_id"] = d["id"]
            nl["last_modified_by"] = user["email"]
            nl["last_modification_date"] = _now()
            nl["modified"] = False
            new_labels.append(nl)
        if new_labels:
            await db.labels.insert_many(new_labels)

    await log_audit("dataset", d["id"], "CREATED", user["email"],
                    new_value=f"{d['dataset_name']} [{body.creation_mode}]",
                    justification=d["changelog_summary"])
    d.pop("_id", None)
    return d


@api.post("/datasets/{ds_id}/technical-validate")
async def technical_validate(ds_id: str, user: dict = Depends(current_user)):
    """
    Run technical validation on a dataset.
    - If dataset has 0 labels: returns PASS (no validation needed yet)
    - If dataset has labels: validates them and returns PASS/FAIL with errors
    """
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is locked")
    
    labels = await db.labels.find({"dataset_id": ds_id}, {"_id": 0}).to_list(10000)
    
    # If no labels, validation passes (add warning)
    if not labels:
        status = "PASS"
        errors = ["⚠️  No labels defined yet — add labels before submitting for approval"]
        await db.datasets.update_one(
            {"id": ds_id},
            {"$set": {"technical_validation_status": status, "technical_validation_summary": errors, "last_modified_date": _now()}},
        )
        await log_audit("dataset", ds_id, f"TECH_VALIDATION_{status}", user["email"], new_value=status)
        return {"status": status, "errors": errors}
    
    # Validate labels
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
        undoc = [l["label_name"] for l in labels if l.get("regulatory_relevance") == "YES" and l.get("confidence_status") != "DOCUMENTED"]
        for name in undoc:
            errors.append(f"{name}: PRODUCTION context requires regulatory-relevant labels DOCUMENTED")

    status = "PASS" if not errors else "FAIL"
    await db.datasets.update_one(
        {"id": ds_id},
        {"$set": {"technical_validation_status": status, "technical_validation_summary": errors, "last_modified_date": _now()}},
    )
    await log_audit("dataset", ds_id, f"TECH_VALIDATION_{status}", user["email"], new_value=status)
    return {"status": status, "errors": errors}


@api.post("/datasets/{ds_id}/submit-approval")
async def submit_approval(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "EDIT":
        raise HTTPException(400, f"Dataset must be in EDIT state (currently {d['lifecycle_state']})")
    if not d["changelog_summary"]:
        raise HTTPException(400, "Changelog summary is required")
    if not d["review"].get("vnv_report_reference"):
        raise HTTPException(400, "V&V report reference must be attached before submission")
    
    # Auto-run technical validation if not run yet
    if d.get("technical_validation_status") in (None, "NOT_RUN"):
        # Call technical_validate logic inline
        labels = await db.labels.find({"dataset_id": ds_id}, {"_id": 0}).to_list(10000)
        
        if not labels:
            # No labels — pass validation
            validation_status = "PASS"
            validation_errors = ["⚠️  No labels defined yet — add labels before submitting for approval"]
        else:
            # Validate labels
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
                undoc = [l["label_name"] for l in labels if l.get("regulatory_relevance") == "YES" and l.get("confidence_status") != "DOCUMENTED"]
                for name in undoc:
                    validation_errors.append(f"{name}: PRODUCTION context requires regulatory-relevant labels DOCUMENTED")
            
            validation_status = "PASS" if not validation_errors else "FAIL"
        
        # Update dataset with validation results
        await db.datasets.update_one(
            {"id": ds_id},
            {"$set": {
                "technical_validation_status": validation_status,
                "technical_validation_summary": validation_errors,
                "last_modified_date": _now()
            }},
        )
        await log_audit("dataset", ds_id, f"TECH_VALIDATION_{validation_status}", user["email"], new_value=validation_status)
        
        # Check if validation passed
        if validation_status == "FAIL":
            raise HTTPException(400, f"Technical validation FAILED — fix {len(validation_errors)} issue(s) first")
    else:
        # Validation already run — check if it passed
        if d["technical_validation_status"] != "PASS":
            raise HTTPException(400, "Technical validation must PASS before submission")
    
    # Proceed with approval submission
    await db.datasets.update_one(
        {"id": ds_id},
        {"$set": {
            "lifecycle_state": "UNDER_APPROVAL",
            "review.technical": "PENDING",
            "review.project_configuration": "PENDING",
            "review.regulatory": "PENDING",
            "review.vnv": "PENDING",
            "last_modified_date": _now(),
        }},
    )
    await log_audit("dataset", ds_id, "EDIT→UNDER_APPROVAL", user["email"], previous_value="EDIT", new_value="UNDER_APPROVAL")
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/attach-vnv")
async def attach_vnv(ds_id: str, body: dict, user: dict = Depends(current_user)):
    require_role(user, "Calibration_Engineer", "PD_Verification_Validation_Engineer", "Post_Sales_Engineer")
    ref = body.get("vnv_report_reference", "")
    if not ref:
        raise HTTPException(400, "vnv_report_reference required")
    await db.datasets.update_one({"id": ds_id}, {"$set": {"review.vnv_report_reference": ref, "last_modified_date": _now()}})
    await log_audit("dataset", ds_id, "VNV_REPORT_ATTACHED", user["email"], new_value=ref)
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/review")
async def submit_review(ds_id: str, body: ReviewUpdate, user: dict = Depends(current_user)):
    role_map = {
        "technical": ("Calibration_Engineer", "PI_Engineering_Manager"),
        "project_configuration": ("Configuration_Manager", "PD_Project_Manager"),
        "regulatory": ("PI_Regulatory_Compliance_Specialist",),
        "vnv": ("PD_Verification_Validation_Engineer",),
    }
    require_role(user, *role_map[body.domain])
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset is not UNDER_APPROVAL")

    patch = {
        f"review.{body.domain}": body.status,
        f"review.{body.domain}_comments": body.comments or "",
        "last_modified_date": _now(),
    }
    if body.domain == "vnv" and body.vnv_report_reference:
        patch["review.vnv_report_reference"] = body.vnv_report_reference

    # Rework -> back to EDIT and reset statuses
    if body.status == "REWORK_REQUIRED":
        patch["lifecycle_state"] = "EDIT"
        for k in ("technical", "project_configuration", "regulatory", "vnv"):
            patch[f"review.{k}"] = "PENDING"
        await db.datasets.update_one({"id": ds_id}, {"$set": patch})
        await log_audit("dataset", ds_id, f"REWORK_{body.domain.upper()}", user["email"],
                        justification=body.comments or "")
        return await db.datasets.find_one({"id": ds_id}, {"_id": 0})

    await db.datasets.update_one({"id": ds_id}, {"$set": patch})
    await log_audit("dataset", ds_id, f"REVIEW_{body.domain.upper()}_{body.status}",
                    user["email"], new_value=body.status, justification=body.comments or "")
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/approve")
async def approve_dataset(ds_id: str, user: dict = Depends(current_user)):
    require_role(user, "PI_Engineering_Manager")
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "UNDER_APPROVAL":
        raise HTTPException(400, "Dataset must be UNDER_APPROVAL")
    r = d["review"]
    for k in ("technical", "project_configuration", "regulatory", "vnv"):
        if r.get(k) != "ACCEPTED":
            raise HTTPException(400, f"Review '{k}' is not ACCEPTED")
    await db.datasets.update_one({"id": ds_id}, {"$set": {
        "lifecycle_state": "APPROVED",
        "review.approval_decision": "APPROVED",
        "review.approval_date": _now(),
        "review.approved_by": user["email"],
        "last_modified_date": _now(),
    }})
    await log_audit("dataset", ds_id, "UNDER_APPROVAL→APPROVED", user["email"],
                    previous_value="UNDER_APPROVAL", new_value="APPROVED")
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/release-select")
async def release_select(ds_id: str, body: ReleaseSelectBody, user: dict = Depends(current_user)):
    require_role(user, "Configuration_Manager")
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] != "APPROVED":
        raise HTTPException(400, "Only APPROVED datasets can be selected for release")
    await db.datasets.update_one({"id": ds_id}, {"$set": {
        "lifecycle_state": "RELEASE_CANDIDATE",
        "release_candidate_flag": True,
        "locked": True,
        "selected_deployment_context": body.selected_deployment_context,
        "selected_variant_id": body.selected_variant_id,
        "selection_justification": body.selection_justification,
        "selected_by": user["email"],
        "selection_date": _now(),
        "last_modified_date": _now(),
    }})
    await log_audit("dataset", ds_id, "APPROVED→RELEASE_CANDIDATE", user["email"],
                    previous_value="APPROVED", new_value="RELEASE_CANDIDATE",
                    justification=body.selection_justification)
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/deprecate")
async def deprecate_dataset(ds_id: str, body: DeprecateBody, user: dict = Depends(current_user)):
    require_role(user, "Configuration_Manager")
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Not found")
    if d["lifecycle_state"] not in ("RELEASED", "RELEASE_CANDIDATE", "APPROVED"):
        raise HTTPException(400, "Can only deprecate APPROVED / RELEASE_CANDIDATE / RELEASED datasets")
    if not body.justification:
        raise HTTPException(400, "Justification is required")
    if body.replacement_dataset_id:
        rep = await db.datasets.find_one({"id": body.replacement_dataset_id}, {"_id": 0})
        if not rep:
            raise HTTPException(404, "Replacement dataset not found")
    await db.datasets.update_one({"id": ds_id}, {"$set": {
        "lifecycle_state": "DEPRECATED",
        "locked": True,
        "deprecation_justification": body.justification,
        "deprecation_replacement_id": body.replacement_dataset_id,
        "deprecation_date": _now(),
        "last_modified_date": _now(),
    }})
    await log_audit("dataset", ds_id, "DEPRECATED", user["email"],
                    previous_value=d["lifecycle_state"], new_value="DEPRECATED",
                    justification=body.justification)
    return await db.datasets.find_one({"id": ds_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/derive-post-sales")
async def derive_post_sales(ds_id: str, body: DeriveBody, user: dict = Depends(current_user)):
    require_role(user, "Post_Sales_Engineer", "Calibration_Engineer")
    base = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not base:
        raise HTTPException(404, "Not found")
    if base["lifecycle_state"] != "RELEASED":
        raise HTTPException(400, "Post-sales derivation requires baseline in RELEASED state")
    ctx = "VIN_SPECIFIC" if body.vin else "POST_SALES"
    new_id = _uuid()
    new_ds = dict(base)
    new_ds["id"] = new_id
    new_ds["dataset_name"] = body.dataset_name
    new_ds["lifecycle_state"] = "EDIT"
    new_ds["creation_mode"] = "REUSE_BASELINE"
    new_ds["deployment_context"] = ctx
    new_ds["variant_id"] = body.variant_id
    new_ds["vin"] = body.vin
    new_ds["baseline_dataset_id"] = ds_id
    new_ds["author"] = user["email"]
    new_ds["creation_date"] = _now()
    new_ds["last_modified_date"] = _now()
    new_ds["technical_validation_status"] = "NOT_RUN"
    new_ds["technical_validation_summary"] = []
    new_ds["locked"] = False
    new_ds["deployed"] = False
    new_ds["release_candidate_flag"] = False
    new_ds["changelog_summary"] = body.changelog_summary or f"Derived post-sales from {base['dataset_name']}"
    new_ds["review"] = {
        "technical": "PENDING", "project_configuration": "PENDING",
        "regulatory": "PENDING", "vnv": "PENDING",
        "technical_comments": "", "project_configuration_comments": "",
        "regulatory_comments": "", "vnv_comments": "",
        "vnv_report_reference": None,
        "approval_decision": None, "approval_date": None, "approved_by": None,
    }
    new_ds["selected_deployment_context"] = None
    new_ds["selected_variant_id"] = None
    new_ds["selection_justification"] = None
    new_ds["selected_by"] = None
    new_ds["selection_date"] = None
    new_ds["deprecation_justification"] = None
    new_ds["deprecation_replacement_id"] = None
    new_ds["deprecation_date"] = None
    new_ds["is_post_sales_derived"] = True
    new_ds.pop("_id", None)
    await db.datasets.insert_one(new_ds)

    base_labels = await db.labels.find({"dataset_id": ds_id}, {"_id": 0}).to_list(10000)
    new_labels = []
    for l in base_labels:
        nl = dict(l)
        nl["id"] = _uuid()
        nl["dataset_id"] = new_id
        nl["modified"] = False
        new_labels.append(nl)
    if new_labels:
        await db.labels.insert_many(new_labels)
    await log_audit("dataset", new_id, "DERIVED_POST_SALES", user["email"],
                    previous_value=base["id"], new_value=new_id,
                    justification=new_ds["changelog_summary"])
    new_ds.pop("_id", None)
    return new_ds


# =====================================================
#                    LABELS
# =====================================================
@api.get("/datasets/{ds_id}/labels")
async def list_labels(ds_id: str, user: dict = Depends(current_user)):
    return await db.labels.find({"dataset_id": ds_id}, {"_id": 0}).to_list(10000)


@api.post("/datasets/{ds_id}/labels/import-defaults")
async def import_default_labels(ds_id: str, user: dict = Depends(current_user)):
    """Explicit action: import default template labels into a dataset."""
    require_role(user, "Calibration_Engineer", "Post_Sales_Engineer")
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is read-only")

    existing = await db.labels.count_documents({"dataset_id": ds_id})
    if existing > 0:
        raise HTTPException(400, f"Dataset already has {existing} labels")

    labels = _make_labels(ds_id, all_complete=False)
    if labels:
        await db.labels.insert_many(labels)
    await db.datasets.update_one(
        {"id": ds_id},
        {"$set": {"last_modified_date": _now(), "technical_validation_status": "NOT_RUN", "technical_validation_summary": []}},
    )
    await log_audit("dataset", ds_id, "DEFAULT_LABELS_IMPORTED", user["email"], new_value=f"{len(labels)} labels")
    return {"ok": True, "inserted": len(labels)}


def _enforce_label_rules(dataset: dict, label: dict, patch: dict):
    merged = {**label, **{k: v for k, v in patch.items() if v is not None}}
    # regulatory + parametrizable requires override justification
    if merged.get("regulatory_relevance") == "YES" and merged.get("parametrizable_in_customer") == "YES" \
            and not merged.get("parametrizable_override_justification"):
        raise HTTPException(400, f"{label['label_name']}: regulatory + parametrizable-in-customer requires override justification")
    # regulatory change requires justification
    if merged.get("regulatory_relevance") == "YES" and "current_value" in patch and not merged.get("change_justification"):
        raise HTTPException(400, f"{label['label_name']}: regulatory-relevant label change requires justification")
    # post-sales derived dataset only allows editing parametrizable labels
    if dataset.get("is_post_sales_derived") and dataset.get("baseline_dataset_id"):
        if "current_value" in patch and label.get("parametrizable_in_customer") != "YES":
            raise HTTPException(400, f"{label['label_name']}: not parametrizable_in_customer — cannot be modified in post-sales derived dataset")
    return merged


@api.patch("/datasets/{ds_id}/labels/{label_id}")
async def update_label(ds_id: str, label_id: str, body: LabelUpdate, user: dict = Depends(current_user)):
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, f"Dataset is {d['lifecycle_state']} and read-only. Derive a new dataset to modify.")
    label = await db.labels.find_one({"id": label_id, "dataset_id": ds_id}, {"_id": 0})
    if not label:
        raise HTTPException(404, "Label not found")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        return label
    _enforce_label_rules(d, label, patch)
    patch["last_modified_by"] = user["email"]
    patch["last_modification_date"] = _now()
    patch["modified"] = True
    await db.labels.update_one({"id": label_id}, {"$set": patch})
    await db.datasets.update_one({"id": ds_id}, {"$set": {"last_modified_date": _now()}})
    await log_audit("label", label_id, "LABEL_UPDATED", user["email"],
                    previous_value=label.get("current_value"),
                    new_value=patch.get("current_value", label.get("current_value")),
                    justification=body.change_justification or "")
    return await db.labels.find_one({"id": label_id}, {"_id": 0})


@api.post("/datasets/{ds_id}/labels/mass-update")
async def mass_update(ds_id: str, body: LabelMassUpdate, user: dict = Depends(current_user)):
    d = await db.datasets.find_one({"id": ds_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"):
        raise HTTPException(400, "Dataset is read-only")
    updated = 0
    patch_src = {k: v for k, v in body.patch.model_dump().items() if v is not None}
    if not patch_src:
        return {"updated": 0}
    for lid in body.label_ids:
        label = await db.labels.find_one({"id": lid, "dataset_id": ds_id}, {"_id": 0})
        if not label:
            continue
        try:
            _enforce_label_rules(d, label, patch_src)
        except HTTPException:
            continue
        patch = dict(patch_src)
        patch["last_modified_by"] = user["email"]
        patch["last_modification_date"] = _now()
        patch["modified"] = True
        await db.labels.update_one({"id": lid}, {"$set": patch})
        updated += 1
    await db.datasets.update_one({"id": ds_id}, {"$set": {"last_modified_date": _now()}})
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
    filt = {}
    if software_release_id:
        filt["software_release_id"] = software_release_id
    if dataset_id:
        filt["dataset_id"] = dataset_id
    return await db.vehicle_sw_ids.find(filt, {"_id": 0}).to_list(2000)


@api.post("/vehicle-sw-ids")
async def create_vehicle_sw_id(body: VehicleSWIDCreate, user: dict = Depends(current_user)):
    require_role(user, "DM_Administrator")
    d = await db.datasets.find_one({"id": body.dataset_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["lifecycle_state"] not in ("RELEASE_CANDIDATE", "RELEASED"):
        raise HTTPException(400, "Only RELEASE_CANDIDATE or RELEASED datasets can be assigned to vehicles")
    vs = {
        "id": _uuid(),
        "software_release_id": d["software_release_id"],
        "dataset_id": d["id"],
        "variant_id": body.variant_id or d.get("selected_variant_id") or d.get("variant_id"),
        "vin": body.vin or d.get("vin"),
        "manufacturing_order_reference": body.manufacturing_order_reference,
        "service_case_reference": body.service_case_reference,
        "creation_date": _now(),
        "created_by": user["email"],
    }
    await db.vehicle_sw_ids.insert_one(vs)
    # First assignment -> RELEASED
    if d["lifecycle_state"] == "RELEASE_CANDIDATE":
        await db.datasets.update_one({"id": d["id"]}, {"$set": {
            "lifecycle_state": "RELEASED",
            "deployed": True,
            "last_modified_date": _now(),
        }})
        await log_audit("dataset", d["id"], "RELEASE_CANDIDATE→RELEASED", user["email"],
                        previous_value="RELEASE_CANDIDATE", new_value="RELEASED")
    await log_audit("vehicle_sw_id", vs["id"], "CREATED", user["email"],
                    new_value=f"dataset={d['dataset_name']}, vin={vs['vin']}")
    vs.pop("_id", None)
    return vs


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
    filt = {}
    if entity_type:
        filt["entity_type"] = entity_type
    if entity_id:
        filt["entity_id"] = entity_id
    return await db.audit_log.find(filt, {"_id": 0}).sort("date", -1).to_list(min(limit, 1000))


# =====================================================
#             DASHBOARD & TRACEABILITY
# =====================================================
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(current_user)):
    total_sr = await db.software_releases.count_documents({})
    valid_sr = await db.software_releases.count_documents({"status": "VALID_FOR_CALIBRATION"})
    states = ["EDIT", "UNDER_APPROVAL", "APPROVED", "RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"]
    by_state = {}
    for s in states:
        by_state[s] = await db.datasets.count_documents({"lifecycle_state": s})
    pending_reviews = await db.datasets.count_documents({"lifecycle_state": "UNDER_APPROVAL"})
    release_candidates = by_state["RELEASE_CANDIDATE"]
    deployed = await db.datasets.count_documents({"deployed": True})
    vehicle_sw_ids = await db.vehicle_sw_ids.count_documents({})
    recent_audit = await db.audit_log.find({}, {"_id": 0}).sort("date", -1).to_list(8)
    return {
        "software_releases_total": total_sr,
        "software_releases_valid": valid_sr,
        "datasets_by_state": by_state,
        "pending_reviews": pending_reviews,
        "release_candidates": release_candidates,
        "deployed_datasets": deployed,
        "vehicle_sw_ids": vehicle_sw_ids,
        "recent_audit": recent_audit,
    }


@api.get("/traceability")
async def traceability(user: dict = Depends(current_user)):
    releases = await db.software_releases.find({}, {"_id": 0}).to_list(1000)
    datasets = await db.datasets.find({}, {"_id": 0}).to_list(2000)
    vs_ids = await db.vehicle_sw_ids.find({}, {"_id": 0}).to_list(2000)
    return {"software_releases": releases, "datasets": datasets, "vehicle_sw_ids": vs_ids}


@api.get("/datasets/{ds_id}/compare/{other_id}")
async def compare_datasets(ds_id: str, other_id: str, user: dict = Depends(current_user)):
    a_labels = await db.labels.find({"dataset_id": ds_id}, {"_id": 0}).to_list(10000)
    b_labels = await db.labels.find({"dataset_id": other_id}, {"_id": 0}).to_list(10000)
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
    sr = await db.software_releases.find_one({"id": sr_id}, {"_id": 0})
    if not sr:
        raise HTTPException(404, "Software release not found")
    dataset_id = body.get("dataset_id")
    if not dataset_id:
        raise HTTPException(400, "dataset_id is required")
    d = await db.datasets.find_one({"id": dataset_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Dataset not found")
    if d["software_release_id"] != sr_id:
        raise HTTPException(400, "Dataset does not belong to this software release")
    if d["lifecycle_state"] not in ("RELEASE_CANDIDATE", "RELEASED"):
        raise HTTPException(400, "Only RELEASE_CANDIDATE or RELEASED datasets can be assigned")
    vs = {
        "id": _uuid(),
        "software_release_id": sr_id,
        "dataset_id": dataset_id,
        "variant_id": body.get("variant_id") or d.get("selected_variant_id") or d.get("variant_id"),
        "vin": body.get("vin") or d.get("vin"),
        "manufacturing_order_reference": body.get("manufacturing_order_reference"),
        "service_case_reference": body.get("service_case_reference"),
        "creation_date": _now(),
        "created_by": user["email"],
    }
    await db.vehicle_sw_ids.insert_one(vs)
    if d["lifecycle_state"] == "RELEASE_CANDIDATE":
        await db.datasets.update_one({"id": dataset_id}, {"$set": {
            "lifecycle_state": "RELEASED",
            "deployed": True,
            "last_modified_date": _now(),
        }})
        await log_audit("dataset", dataset_id, "RELEASE_CANDIDATE→RELEASED", user["email"],
                        previous_value="RELEASE_CANDIDATE", new_value="RELEASED")
    await log_audit("vehicle_sw_id", vs["id"], "SW_ASSIGNED", user["email"],
                    new_value=f"sr={sr['software_release_identifier']}, dataset={d['dataset_name']}, vin={vs['vin']}")
    vs.pop("_id", None)
    return vs


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
    """Returns Plotly figure JSON for embedding in React."""
    import sys as _sys, os as _os
    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    try:
        from visualization.heatmap_3d import CalibrationMap3D
        import plotly.io as pio
    except ImportError as e:
        raise HTTPException(500, f"Visualization deps not installed: {e}")

    labels_a = await db.labels.find({"dataset_id": dataset_id}, {"_id": 0}).to_list(10000)
    if not labels_a:
        raise HTTPException(404, "No labels found for this dataset")

    labels_b = None
    if compare_id:
        labels_b = await db.labels.find({"dataset_id": compare_id}, {"_id": 0}).to_list(10000)

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
    stats = await seed_all(db)
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

# ── Visualization module (non-destructive extension) ──────────────────────────
try:
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from visualization.viz_api import viz_router
    app.include_router(viz_router)
except ImportError:
    pass  # visualization deps not installed — app still works normally

_env_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
_default_dev_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
]
CORS_ORIGINS = list(dict.fromkeys([o.strip() for o in _env_cors_origins if o.strip()] + _default_dev_origins))
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Serve React frontend (production / Electron mode) ────────────────────────
# This block only activates when frontend/build/ exists (after `npm run build`).
# In development, the React dev server on :3000 is used instead.
if FRONTEND_BUILD_DIR.exists():
    from fastapi.staticfiles import StaticFiles as _StaticFiles
    from fastapi.responses import FileResponse as _FileResponse

    _static_dir = FRONTEND_BUILD_DIR / "static"
    if _static_dir.exists():
        app.mount("/static", _StaticFiles(directory=str(_static_dir)), name="frontend-static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _serve_react(full_path: str):
        # Serve known files (favicon.ico, manifest.json, logo192.png, etc.)
        target = FRONTEND_BUILD_DIR / full_path
        if full_path and target.is_file():
            return _FileResponse(str(target))
        # Fallback: always return index.html so React Router works
        return _FileResponse(str(FRONTEND_BUILD_DIR / "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
