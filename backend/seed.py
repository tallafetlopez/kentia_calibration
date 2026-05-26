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


async def seed_all(_db=None):
    """Seed demo data into SQLite. _db parameter ignored — uses get_conn()."""
    import json
    from db import get_conn, run, run_many, fetch_one

    db = get_conn()

    # Clear existing data
    for table in ["audit_log", "vehicle_sw_ids", "labels", "datasets",
                  "software_releases", "work_packages", "ecus", "users"]:
        await run(db, f"DELETE FROM {table}")

    now = datetime.now(timezone.utc).isoformat()

    # Users
    for email, name, roles in DEMO_USERS:
        await run(db, """
            INSERT OR IGNORE INTO users (id, email, password_hash, name, roles, active_role, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (_uuid(), email, hash_password(DEMO_PASSWORD), name,
              json.dumps(roles), roles[0], now))

    # ECU
    ecm_id = _uuid()
    await run(db, "INSERT INTO ecus (id, name, type, active) VALUES (?, ?, ?, 1)",
              (ecm_id, "ECM", "Engine Control Module"))

    # Work Packages
    wp_id_map = {}
    wp_params = []
    for code, name, responsible, sub_wp in DEMO_WORK_PACKAGES:
        wp_id = _uuid()
        wp_id_map[code] = wp_id
        wp_params.append((wp_id, code, name, f"WorkPackage {code} — {name}",
                          ecm_id, sub_wp, responsible, 1, now))
    await run_many(db, """
        INSERT OR IGNORE INTO work_packages (id, code, name, description, ecu_id, sub_workpackage, responsible, active, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, wp_params)

    # Software Releases
    sr_ids = [_uuid(), _uuid(), _uuid()]
    for i, (sr_id, identifier, version, desc, supplier, days_ago, status, a2l_ref, dbc_ref, dtc_ref) in enumerate([
        (sr_ids[0], "ECM-SW-2024.1", "1.4.2", "Baseline software for Euro 6d platform", "Bosch", 120,
         "VALID_FOR_CALIBRATION", "ECM_SW_2024.1_v1.4.2.a2l", "ECM_CAN_2024.1.dbc", "ECM_DTC_List_2024.1.xlsx"),
        (sr_ids[1], "ECM-SW-2024.2", "2.0.0", "Performance optimization update", "Bosch", 45,
         "VALID_FOR_CALIBRATION", "ECM_SW_2024.2_v2.0.0.a2l", "ECM_CAN_2024.2.dbc", "ECM_DTC_List_2024.2.xlsx"),
        (sr_ids[2], "ECM-SW-2025.1", "2.1.0", "Draft release for platform refresh", "Continental", 0,
         "DRAFT", None, None, None),
    ]):
        release_date = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
        val_log = json.dumps([{"date": now, "user": "system", "action": "Marked VALID_FOR_CALIBRATION"}]
                              if status == "VALID_FOR_CALIBRATION" else [])
        await run(db, """
            INSERT INTO software_releases
                (id, ecu_id, software_release_identifier, version, description, supplier,
                 release_date, status, a2l_file_reference, dbc_reference, dtc_list_reference,
                 other_artefacts, validation_log)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (sr_id, ecm_id, identifier, version, desc, supplier, release_date,
              status, a2l_ref, dbc_ref, dtc_ref, json.dumps([]), val_log))

    # Datasets
    def ds_base(name, sr, state, mode, context, author, post_sales=False, locked=False, deployed=False, baseline=None):
        accepted = state in ("APPROVED", "RELEASE_CANDIDATE", "RELEASED")
        review = {
            "technical": "ACCEPTED" if accepted else "PENDING",
            "project_configuration": "ACCEPTED" if accepted else "PENDING",
            "regulatory": "ACCEPTED" if accepted else "PENDING",
            "vnv": "ACCEPTED" if accepted else "PENDING",
            "technical_comments": "Reviewed internal calibration maps. All within spec." if accepted else "",
            "project_configuration_comments": "Config traceability ok." if accepted else "",
            "regulatory_comments": "EU 2017/1151 compliance verified." if accepted else "",
            "vnv_comments": "HIL runs pass." if accepted else "",
            "vnv_report_reference": "VNV_Report_2024_Q4.pdf" if accepted else None,
            "approval_decision": "APPROVED" if accepted else None,
            "approval_date": now if accepted else None,
            "approved_by": "eng@herko.dev" if accepted else None,
        }
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
            "technical_validation_summary": json.dumps([]),
            "locked": 1 if (locked or state in ("RELEASE_CANDIDATE", "RELEASED", "DEPRECATED")) else 0,
            "deployed": 1 if (deployed or state == "RELEASED") else 0,
            "release_candidate_flag": 1 if state == "RELEASE_CANDIDATE" else 0,
            "changelog_summary": f"{mode.replace('_', ' ').lower().capitalize()} of {name}",
            "review": json.dumps(review),
            "selected_deployment_context": context if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selected_variant_id": None,
            "selection_justification": "Platform rollout" if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selected_by": "cfg@herko.dev" if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "selection_date": now if state in ("RELEASE_CANDIDATE", "RELEASED") else None,
            "deprecation_justification": None,
            "deprecation_replacement_id": None,
            "deprecation_date": None,
            "is_post_sales_derived": 1 if post_sales else 0,
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
    datasets_list = [ds_base(*spec) for spec in ds_specs]

    base_prod = next(x for x in datasets_list if x["dataset_name"] == "DS_Base_Euro6d_Prod")
    for d in datasets_list:
        if d["creation_mode"] == "REUSE_BASELINE":
            d["baseline_dataset_id"] = base_prod["id"]
        if "Variant_Sport" in d["dataset_name"]:
            d["variant_id"] = "VAR_SPORT_01"
        if "Variant_Eco" in d["dataset_name"]:
            d["variant_id"] = "VAR_ECO_01"
            d["selected_variant_id"] = "VAR_ECO_01"
        if "VIN_" in d["dataset_name"]:
            d["vin"] = "WBA1234567ABCDEFG"
            d["is_post_sales_derived"] = 1
        if "Service_BugFix" in d["dataset_name"]:
            d["is_post_sales_derived"] = 1
        if d["lifecycle_state"] == "DEPRECATED":
            d["deprecation_justification"] = "Superseded by DS_NextGen_Baseline"
            d["deprecation_date"] = now

    ds_params = [(d["id"], d["dataset_name"], d["ecu_id"], d["software_release_id"],
                  d["lifecycle_state"], d["creation_mode"], d["deployment_context"],
                  d["variant_id"], d["vin"], d["baseline_dataset_id"], d["author"],
                  d["creation_date"], d["last_modified_date"], d["technical_validation_status"],
                  d["technical_validation_summary"], d["locked"], d["deployed"],
                  d["release_candidate_flag"], d["changelog_summary"], d["review"],
                  d.get("selected_deployment_context"), d.get("selected_variant_id"),
                  d.get("selection_justification"), d.get("selected_by"), d.get("selection_date"),
                  d.get("deprecation_justification"), d.get("deprecation_replacement_id"),
                  d.get("deprecation_date"), d["is_post_sales_derived"])
                 for d in datasets_list]
    await run_many(db, """
        INSERT OR IGNORE INTO datasets
            (id, dataset_name, ecu_id, software_release_id, lifecycle_state, creation_mode,
             deployment_context, variant_id, vin, baseline_dataset_id, author, creation_date,
             last_modified_date, technical_validation_status, technical_validation_summary,
             locked, deployed, release_candidate_flag, changelog_summary, review,
             selected_deployment_context, selected_variant_id, selection_justification,
             selected_by, selection_date, deprecation_justification, deprecation_replacement_id,
             deprecation_date, is_post_sales_derived)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, ds_params)

    # Labels
    all_labels = []
    for d in datasets_list:
        complete = d["lifecycle_state"] not in ("EDIT",)
        all_labels.extend(_make_labels(d["id"], all_complete=complete, wp_id_map=wp_id_map))
    label_params = [(l["id"], l["dataset_id"], l["label_name"], l.get("data_type", ""),
                     l.get("current_value", ""), l.get("unit", ""), l.get("level", "CONFIGURATION"),
                     l.get("confidence_status", "EMPTY"), l.get("last_modified_by", "system"),
                     l.get("last_modification_date", now), l.get("regulatory_relevance", "NO"),
                     l.get("regulation_reference", ""), l.get("parametrizable_in_customer", "NO"),
                     l.get("parametrizable_override_justification", ""), l.get("change_justification", ""),
                     l.get("comments", ""), 1 if l.get("imported_from_a2l") else 0,
                     1 if l.get("modified") else 0, l.get("owner", "BeGas"),
                     l.get("deputy", ""), l.get("work_package_id"), l.get("maturity", "0"))
                    for l in all_labels]
    await run_many(db, """
        INSERT OR IGNORE INTO labels
            (id, dataset_id, label_name, data_type, current_value, unit, level,
             confidence_status, last_modified_by, last_modification_date, regulatory_relevance,
             regulation_reference, parametrizable_in_customer, parametrizable_override_justification,
             change_justification, comments, imported_from_a2l, modified, owner, deputy,
             work_package_id, maturity)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, label_params)

    # Vehicle SW IDs
    released = [d for d in datasets_list if d["lifecycle_state"] == "RELEASED"]
    vs_params = []
    for d in released:
        vs_id = _uuid()
        vs_params.append((vs_id, vs_id, d["software_release_id"], d["id"],
                          d.get("variant_id"), d.get("vin"),
                          f"MO-{_uuid()[:8].upper()}" if not d.get("vin") else None,
                          f"SC-{_uuid()[:8].upper()}" if d.get("vin") else None,
                          now, "dma@herko.dev"))
    if vs_params:
        await run_many(db, """
            INSERT OR IGNORE INTO vehicle_sw_ids
                (id, vehicle_sw_id, software_release_id, dataset_id, variant_id, vin,
                 manufacturing_order_reference, service_case_reference, creation_date, created_by)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, vs_params)

    # Audit log
    audit_params = [(_uuid(), "system", "seed", "SEED_DATA_LOADED", None, None, "system", now, "Initial demo seed")]
    for d in datasets_list:
        audit_params.append((_uuid(), "dataset", d["id"], f"CREATED → {d['lifecycle_state']}",
                             None, d["lifecycle_state"], d["author"], d["creation_date"],
                             d["changelog_summary"]))
    await run_many(db, """
        INSERT OR IGNORE INTO audit_log
            (id, entity_type, entity_id, action, previous_value, new_value, author, date, justification)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, audit_params)

    return {
        "users": len(DEMO_USERS),
        "ecus": 1,
        "software_releases": 3,
        "datasets": len(datasets_list),
        "labels": len(all_labels),
        "vehicle_sw_ids": len(vs_params),
    }
