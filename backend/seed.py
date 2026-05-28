"""Seed demo data for HERKO Calibration Manager."""
from datetime import datetime, timezone, timedelta
from models import _uuid
from auth_utils import hash_password

DEMO_USERS = [
    ("pm@herko.dev", "Paulo Martins", ["PD_Project_Manager"]),
    ("cal@herko.dev", "Clara Alves", ["Calibration_Engineer"]),
    ("eng@herko.dev", "Ethan Ng", ["PI_Engineering_Manager"]),
    ("reg@herko.dev", "Ren Gupta", ["PI_Regulatory_Compliance_Specialist"]),
    ("vnv@herko.dev", "Vera Novak", ["PD_Verification_Validation_Engineer"]),
    ("cfg@herko.dev", "Carlos Figueroa", ["Configuration_Manager"]),
    ("dma@herko.dev", "Dana Mori", ["DM_Administrator"]),
    ("ps@herko.dev", "Priya Sharma", ["Post_Sales_Engineer"]),
    (
        "admin@herko.dev",
        "Admin",
        [
            "PD_Project_Manager",
            "Calibration_Engineer",
            "PI_Engineering_Manager",
            "PI_Regulatory_Compliance_Specialist",
            "PD_Verification_Validation_Engineer",
            "Configuration_Manager",
            "DM_Administrator",
            "Post_Sales_Engineer",
        ],
    ),
]

DEMO_PASSWORD = "password123"


A2L_LABELS_TEMPLATE = [
    # (label_name, data_type, unit, default_value, level, regulatory, parametrizable)
    ("InjTim_MaxDur_Map", "CURVE", "us", "1850", "CONFIGURATION", "YES", "NO"),
    ("InjTim_StartOfInj_Cor", "VALUE", "deg", "3.2", "CONFIGURATION", "YES", "NO"),
    ("RailP_Setp_Map", "MAP", "bar", "1400", "CONFIGURATION", "YES", "NO"),
    ("RailP_PCtrl_Kp", "VALUE", "-", "0.75", "CONFIGURATION", "NO", "YES"),
    ("EGR_TargetRate_Map", "MAP", "%", "18", "CONFIGURATION", "YES", "NO"),
    ("EGR_MinClose_Lim", "VALUE", "%", "5", "CARRY_OVER", "YES", "NO"),
    ("TurboBoost_Setp_Map", "MAP", "mbar", "1850", "CONFIGURATION", "NO", "NO"),
    ("TurboBoost_Kp", "VALUE", "-", "0.9", "CONFIGURATION", "NO", "YES"),
    ("DPF_RegenTmp_Thr", "VALUE", "degC", "560", "CONFIGURATION", "YES", "NO"),
    ("DPF_RegenInterval_Max", "VALUE", "km", "1000", "CARRY_OVER", "YES", "NO"),
    ("SCR_NOxConv_MinEff", "VALUE", "%", "92", "CONFIGURATION", "YES", "NO"),
    ("SCR_UreaDos_Fact", "VALUE", "-", "1.05", "CONFIGURATION", "YES", "YES"),
    ("LambdaCtl_Setp", "VALUE", "-", "1.0", "CONFIGURATION", "NO", "NO"),
    ("IdleSpd_Target", "VALUE", "rpm", "820", "VARIANT_SPECIFIC", "NO", "YES"),
    ("MaxTrq_Lim_Map", "MAP", "Nm", "450", "CONFIGURATION", "NO", "NO"),
    ("CoolantTmp_WarnLim", "VALUE", "degC", "108", "CARRY_OVER", "NO", "YES"),
    ("OilPress_FaultLim", "VALUE", "bar", "1.8", "CONFIGURATION", "NO", "NO"),
    ("Knock_Detect_Thr", "VALUE", "-", "2.4", "CONFIGURATION", "NO", "NO"),
    ("StartAssist_FuelAdd", "VALUE", "%", "12", "VARIANT_SPECIFIC", "NO", "YES"),
    ("Immobilizer_UnlockKey", "VALUE", "-", "0xA5F3", "VEHICLE_SPECIFIC", "NO", "YES"),
]


DEMO_WORK_PACKAGES = [
    # (code, name, responsible, sub_wp)
    ("AIR_ADM", "Air management admission", "BeGas", None),
    ("AIR_VCP", "Air VCP control", "BeGas", None),
    ("TRQ_ADM", "Torque admission", "BeGas", None),
    ("TRQ_LIM", "Torque limitation", "HERKO", None),
    ("FUE_DFC", "Fuel delivery control", "BeGas", None),
    ("EXH_DPF", "Exhaust DPF management", "BeGas", None),
    ("EXH_SCR", "Exhaust SCR/AdBlue", "BeGas", None),
    ("OVR_OVR", "Override & customer params", "HERKO", None),
    ("SYS_SYS", "System level parameters", "Shared", None),
]

# Label → WorkPackage assignment by prefix
_WP_PREFIX = {
    "InjTim": "FUE_DFC", "RailP": "FUE_DFC",
    "EGR": "AIR_ADM", "TurboBoost": "AIR_VCP",
    "DPF": "EXH_DPF", "SCR": "EXH_SCR",
    "LambdaCtl": "FUE_DFC", "IdleSpd": "OVR_OVR",
    "MaxTrq": "TRQ_LIM", "CoolantTmp": "SYS_SYS",
    "OilPress": "SYS_SYS", "Knock": "FUE_DFC",
    "StartAssist": "OVR_OVR", "Immobilizer": "SYS_SYS",
}


def _make_labels(dataset_id: str, all_complete: bool = False, wp_id_map: dict = None):
    labels = []
    for name, dtype, unit, val, level, reg, param in A2L_LABELS_TEMPLATE:
        confidence = "VALIDATED" if all_complete else ("DOCUMENTED" if reg == "YES" else "CALIBRATED")
        # Infer WP and owner from label prefix
        wp_code = next((v for k, v in _WP_PREFIX.items() if name.startswith(k)), None)
        wp_id = (wp_id_map or {}).get(wp_code)
        wp_entry = next((w for w in DEMO_WORK_PACKAGES if w[0] == wp_code), None)
        owner = wp_entry[2] if wp_entry else "BeGas"
        maturity = "100" if all_complete else ("75" if reg == "YES" else "25")
        labels.append(
            {
                "id": _uuid(),
                "dataset_id": dataset_id,
                "label_name": name,
                "data_type": dtype,
                "current_value": val,
                "unit": unit,
                "level": level,
                "confidence_status": confidence,
                "last_modified_by": "system",
                "last_modification_date": datetime.now(timezone.utc).isoformat(),
                "regulatory_relevance": reg,
                "regulation_reference": "EU 2017/1151" if reg == "YES" else "",
                "parametrizable_in_customer": param,
                "parametrizable_override_justification": "",
                "change_justification": "Initial calibration from A2L baseline" if reg == "YES" else "",
                "comments": "",
                "imported_from_a2l": True,
                "modified": False,
                "owner": owner,
                "deputy": "",
                "work_package_id": wp_id,
                "maturity": maturity,
            }
        )
    return labels


async def seed_all(db):
    # Clear existing (idempotent reset)
    for coll in ["users", "ecus", "software_releases", "datasets", "labels", "vehicle_sw_ids", "audit_log", "work_packages"]:
        await db[coll].delete_many({})

    # Users
    now = datetime.now(timezone.utc).isoformat()
    for email, name, roles in DEMO_USERS:
        await db.users.insert_one(
            {
                "id": _uuid(),
                "email": email,
                "password_hash": hash_password(DEMO_PASSWORD),
                "name": name,
                "roles": roles,
                "active_role": roles[0],
                "created_at": now,
            }
        )

    # ECU
    ecm_id = _uuid()
    await db.ecus.insert_one(
        {"id": ecm_id, "name": "ECM", "type": "Engine Control Module", "active": True}
    )

    # WorkPackages
    wp_id_map = {}
    wp_docs = []
    for code, name, responsible, sub_wp in DEMO_WORK_PACKAGES:
        wp_id = _uuid()
        wp_id_map[code] = wp_id
        wp_docs.append({
            "id": wp_id, "code": code, "name": name,
            "description": f"WorkPackage {code} — {name}",
            "ecu_id": ecm_id, "sub_workpackage": sub_wp,
            "responsible": responsible, "active": True,
            "created_at": now,
        })
    await db.work_packages.insert_many(wp_docs)

    # Software Releases
    sr_ids = [_uuid(), _uuid(), _uuid()]
    releases = [
        {
            "id": sr_ids[0],
            "ecu_id": ecm_id,
            "software_release_identifier": "ECM-SW-2024.1",
            "version": "1.4.2",
            "description": "Baseline software for Euro 6d platform",
            "supplier": "Bosch",
            "release_date": (datetime.now(timezone.utc) - timedelta(days=120)).isoformat(),
            "status": "VALID_FOR_CALIBRATION",
            "a2l_file_reference": "ECM_SW_2024.1_v1.4.2.a2l",
            "dbc_reference": "ECM_CAN_2024.1.dbc",
            "dtc_list_reference": "ECM_DTC_List_2024.1.xlsx",
            "other_artefacts": ["ECM_CalMap_2024.1.hex"],
            "validation_log": [
                {"date": now, "user": "system", "action": "A2L linked"},
                {"date": now, "user": "system", "action": "Marked VALID_FOR_CALIBRATION"},
            ],
        },
        {
            "id": sr_ids[1],
            "ecu_id": ecm_id,
            "software_release_identifier": "ECM-SW-2024.2",
            "version": "2.0.0",
            "description": "Performance optimization update",
            "supplier": "Bosch",
            "release_date": (datetime.now(timezone.utc) - timedelta(days=45)).isoformat(),
            "status": "VALID_FOR_CALIBRATION",
            "a2l_file_reference": "ECM_SW_2024.2_v2.0.0.a2l",
            "dbc_reference": "ECM_CAN_2024.2.dbc",
            "dtc_list_reference": "ECM_DTC_List_2024.2.xlsx",
            "other_artefacts": [],
            "validation_log": [{"date": now, "user": "system", "action": "Marked VALID_FOR_CALIBRATION"}],
        },
        {
            "id": sr_ids[2],
            "ecu_id": ecm_id,
            "software_release_identifier": "ECM-SW-2025.1",
            "version": "2.1.0",
            "description": "Draft release for platform refresh",
            "supplier": "Continental",
            "release_date": datetime.now(timezone.utc).isoformat(),
            "status": "DRAFT",
            "a2l_file_reference": None,
            "dbc_reference": None,
            "dtc_list_reference": None,
            "other_artefacts": [],
            "validation_log": [],
        },
    ]
    await db.software_releases.insert_many(releases)

    # Datasets
    datasets = []
    all_labels = []
    audit = []

    def ds_base(name, sr, state, mode, context, author, post_sales=False, locked=False, deployed=False, baseline=None):
        return {
            "id": _uuid(),
            "dataset_name": name,
            "ecu_id": ecm_id,
            "software_release_id": sr,
            "lifecycle_state": state,
            "creation_mode": mode,
            "deployment_context": context,
            "variant_id": None,
            "vin": None,
            "baseline_dataset_id": baseline,
            "author": author,
            "creation_date": (datetime.now(timezone.utc) - timedelta(days=20)).isoformat(),
            "last_modified_date": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            "technical_validation_status": "PASS" if state != "EDIT" else "NOT_RUN",
            "technical_validation_summary": [],
            "locked": locked,
            "deployed": deployed,
            "release_candidate_flag": state == "RELEASE_CANDIDATE",
            "changelog_summary": f"{mode.replace('_',' ').lower().capitalize()} of {name}",
            "review": {
                "technical": "ACCEPTED" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else ("PENDING"),
                "project_configuration": "ACCEPTED" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else "PENDING",
                "regulatory": "ACCEPTED" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else "PENDING",
                "vnv": "ACCEPTED" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else "PENDING",
                "technical_comments": "Reviewed internal calibration maps. All within spec." if state != "EDIT" else "",
                "project_configuration_comments": "Config traceability ok." if state != "EDIT" else "",
                "regulatory_comments": "EU 2017/1151 compliance verified." if state != "EDIT" else "",
                "vnv_comments": "HIL runs pass." if state != "EDIT" else "",
                "vnv_report_reference": "VNV_Report_2024_Q4.pdf" if state != "EDIT" else None,
                "approval_decision": "APPROVED" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else None,
                "approval_date": now if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else None,
                "approved_by": "eng@herko.dev" if state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED") else None,
            },
            "selected_deployment_context": context if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selected_variant_id": None,
            "selection_justification": "Platform rollout" if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selected_by": "cfg@herko.dev" if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selection_date": now if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "deprecation_justification": None,
            "deprecation_replacement_id": None,
            "deprecation_date": None,
            "is_post_sales_derived": post_sales,
        }

    ds_specs = [
        ("DS_Base_Euro6d_Prod", sr_ids[0], "RELEASED", "IMPORT_S37", "PRODUCTION", "cal@herko.dev"),
        ("DS_Base_Euro6d_Dev", sr_ids[0], "EDIT", "COPY_EXISTING", "DEVELOPMENT", "cal@herko.dev"),
        ("DS_Variant_Sport", sr_ids[0], "APPROVED", "REUSE_BASELINE", "VARIANT_SPECIFIC", "cal@herko.dev"),
        ("DS_Variant_Eco", sr_ids[0], "RELEASE_CANDIDATE", "REUSE_BASELINE", "VARIANT_SPECIFIC", "cal@herko.dev"),
        ("DS_NextGen_Trial", sr_ids[1], "UNDER_APPROVAL", "IMPORT_S37", "DEVELOPMENT", "cal@herko.dev"),
        ("DS_NextGen_Baseline", sr_ids[1], "APPROVED", "MERGE", "PRODUCTION", "cal@herko.dev"),
        ("DS_NextGen_Legacy", sr_ids[1], "DEPRECATED", "IMPORT_S37", "PRODUCTION", "cal@herko.dev"),
        ("DS_Service_BugFix_1234", sr_ids[0], "EDIT", "REUSE_BASELINE", "POST_SALES", "ps@herko.dev"),
        ("DS_VIN_WBA1234567", sr_ids[0], "RELEASED", "REUSE_BASELINE", "VIN_SPECIFIC", "ps@herko.dev"),
        ("DS_FleetTest_Beta", sr_ids[1], "EDIT", "COPY_EXISTING", "DEVELOPMENT", "cal@herko.dev"),
    ]
    for spec in ds_specs:
        d = ds_base(*spec)
        if d["lifecycle_state"] in ("RELEASE_CANDIDATE", "RELEASED"):
            d["locked"] = True
        if d["lifecycle_state"] == "RELEASED":
            d["deployed"] = True
        if "Variant_Sport" in d["dataset_name"]:
            d["variant_id"] = "VAR_SPORT_01"
        if "Variant_Eco" in d["dataset_name"]:
            d["variant_id"] = "VAR_ECO_01"
            d["selected_variant_id"] = "VAR_ECO_01"
        if "VIN_" in d["dataset_name"]:
            d["vin"] = "WBA1234567ABCDEFG"
            d["is_post_sales_derived"] = True
        if "Service_BugFix" in d["dataset_name"]:
            d["is_post_sales_derived"] = True
        if d["lifecycle_state"] == "DEPRECATED":
            d["deprecation_justification"] = "Superseded by DS_NextGen_Baseline"
            d["deprecation_date"] = now
        datasets.append(d)

    # baseline linkage for derived
    base_prod = next(x for x in datasets if x["dataset_name"] == "DS_Base_Euro6d_Prod")
    for d in datasets:
        if d["creation_mode"] == "REUSE_BASELINE":
            d["baseline_dataset_id"] = base_prod["id"]

    await db.datasets.insert_many(datasets)

    for d in datasets:
        complete = d["lifecycle_state"] not in ("EDIT",)
        all_labels.extend(_make_labels(d["id"], all_complete=complete, wp_id_map=wp_id_map))
    await db.labels.insert_many(all_labels)

    # Vehicle SW IDs for released datasets
    released = [d for d in datasets if d["lifecycle_state"] == "RELEASED"]
    vs_ids = []
    for d in released:
        vs_ids.append(
            {
                "id": _uuid(),
                "software_release_id": d["software_release_id"],
                "dataset_id": d["id"],
                "variant_id": d.get("variant_id"),
                "vin": d.get("vin"),
                "manufacturing_order_reference": f"MO-{_uuid()[:8].upper()}" if not d.get("vin") else None,
                "service_case_reference": f"SC-{_uuid()[:8].upper()}" if d.get("vin") else None,
                "creation_date": now,
                "created_by": "dma@herko.dev",
            }
        )
    if vs_ids:
        await db.vehicle_sw_ids.insert_many(vs_ids)

    # Audit log
    audit.append(
        {
            "id": _uuid(),
            "entity_type": "system",
            "entity_id": "seed",
            "action": "SEED_DATA_LOADED",
            "previous_value": None,
            "new_value": None,
            "author": "system",
            "date": now,
            "justification": "Initial demo seed",
        }
    )
    for d in datasets:
        audit.append(
            {
                "id": _uuid(),
                "entity_type": "dataset",
                "entity_id": d["id"],
                "action": f"CREATED → {d['lifecycle_state']}",
                "previous_value": None,
                "new_value": d["lifecycle_state"],
                "author": d["author"],
                "date": d["creation_date"],
                "justification": d["changelog_summary"],
            }
        )
    await db.audit_log.insert_many(audit)

    return {
        "users": len(DEMO_USERS),
        "ecus": 1,
        "software_releases": len(releases),
        "datasets": len(datasets),
        "labels": len(all_labels),
        "vehicle_sw_ids": len(vs_ids),
    }
