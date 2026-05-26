"""SQLite database layer — connection, schema init, and shared helpers."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import aiosqlite

_log = logging.getLogger(__name__)

import os as _os, sys as _sys

def _resolve_db_path() -> Path:
    custom = _os.environ.get("HERKO_DB_PATH")
    if custom:
        return Path(custom)
    # PyInstaller frozen or production: use app data dir
    if getattr(_sys, "frozen", False) or _os.environ.get("HERKO_DATA_PATH"):
        from resource_path import app_data_dir
        return app_data_dir() / "calibration.db"
    # Development: keep next to backend/ for easy DBeaver access
    return Path(__file__).parent.parent / "calibration_manager.db"

DB_PATH = _resolve_db_path()

_conn: Optional[aiosqlite.Connection] = None


# ── Connection lifecycle ──────────────────────────────────────────────────────

async def open_db() -> None:
    global _conn
    _conn = await aiosqlite.connect(str(DB_PATH))
    _conn.row_factory = aiosqlite.Row
    await _conn.execute("PRAGMA journal_mode=WAL")
    await _conn.execute("PRAGMA foreign_keys=ON")
    await _init_schema()
    _log.info("SQLite DB opened: %s", DB_PATH)


async def close_db() -> None:
    global _conn
    if _conn:
        await _conn.close()
        _conn = None


def get_conn() -> aiosqlite.Connection:
    if _conn is None:
        raise RuntimeError("DB not initialised — call open_db() first")
    return _conn


# ── Query helpers ─────────────────────────────────────────────────────────────

async def fetch_one(db: aiosqlite.Connection, sql: str, params: tuple = ()) -> Optional[dict]:
    cur = await db.execute(sql, params)
    row = await cur.fetchone()
    return dict(row) if row else None


async def fetch_all(db: aiosqlite.Connection, sql: str, params: tuple = ()) -> list[dict]:
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def run(db: aiosqlite.Connection, sql: str, params: tuple = ()) -> None:
    await db.execute(sql, params)
    await db.commit()


async def run_many(db: aiosqlite.Connection, sql: str, params_list: list) -> None:
    await db.executemany(sql, params_list)
    await db.commit()


async def count(db: aiosqlite.Connection, table: str, where: str = "1=1", params: tuple = ()) -> int:
    cur = await db.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", params)
    row = await cur.fetchone()
    return row[0] if row else 0


# ── JSON helpers ──────────────────────────────────────────────────────────────

def jl(s: Any) -> Any:
    """JSON loads — TEXT → dict/list. Pass-through for already-parsed values."""
    if s is None:
        return None
    if isinstance(s, (dict, list)):
        return s
    try:
        return json.loads(s)
    except Exception:
        return s


def jd(v: Any) -> Optional[str]:
    """JSON dumps — dict/list → TEXT. None stays None."""
    if v is None:
        return None
    if isinstance(v, str):
        return v
    return json.dumps(v, ensure_ascii=False)


# ── Schema ────────────────────────────────────────────────────────────────────

async def _init_schema() -> None:
    assert _conn is not None
    await _conn.executescript("""
-- Users
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    roles       TEXT NOT NULL DEFAULT '[]',
    active_role TEXT,
    created_at  TEXT NOT NULL
);

-- ECUs
CREATE TABLE IF NOT EXISTS ecus (
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    type   TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
);

-- Software Releases (legacy /api/)
CREATE TABLE IF NOT EXISTS software_releases (
    id                           TEXT PRIMARY KEY,
    ecu_id                       TEXT NOT NULL DEFAULT '',
    software_release_identifier  TEXT NOT NULL DEFAULT '',
    version                      TEXT NOT NULL DEFAULT '',
    description                  TEXT DEFAULT '',
    supplier                     TEXT DEFAULT '',
    release_date                 TEXT NOT NULL,
    status                       TEXT DEFAULT 'DRAFT',
    a2l_file_reference           TEXT,
    dbc_reference                TEXT,
    dtc_list_reference           TEXT,
    other_artefacts              TEXT DEFAULT '[]',
    validation_log               TEXT DEFAULT '[]'
);

-- SW Releases (v1 /api/v1/)
CREATE TABLE IF NOT EXISTS sw_releases (
    id              TEXT PRIMARY KEY,
    identifier      TEXT NOT NULL DEFAULT '',
    version         TEXT NOT NULL DEFAULT '',
    supplier        TEXT DEFAULT '',
    description     TEXT DEFAULT '',
    ecu_id          TEXT DEFAULT '',
    status          TEXT DEFAULT 'DRAFT',
    a2l_filename    TEXT,
    a2l_path        TEXT,
    a2l_uploaded_at TEXT,
    dcm_filename    TEXT,
    dcm_path        TEXT,
    dcm_uploaded_at TEXT,
    dcm_summary     TEXT,
    released_date   TEXT,
    created_by      TEXT DEFAULT '',
    created_at      TEXT NOT NULL
);

-- Datasets (unified: legacy + v1 share this table)
CREATE TABLE IF NOT EXISTS datasets (
    id                           TEXT PRIMARY KEY,
    dataset_name                 TEXT NOT NULL DEFAULT '',
    ecu_id                       TEXT DEFAULT '',
    software_release_id          TEXT NOT NULL DEFAULT '',
    sw_release_identifier        TEXT DEFAULT '',
    lifecycle_state              TEXT DEFAULT 'EDIT',
    creation_mode                TEXT DEFAULT 'IMPORT_S37',
    deployment_context           TEXT DEFAULT 'DEVELOPMENT',
    variant_id                   TEXT DEFAULT '',
    vin                          TEXT DEFAULT '',
    baseline_dataset_id          TEXT DEFAULT '',
    author                       TEXT DEFAULT '',
    creation_date                TEXT NOT NULL,
    last_modified_date           TEXT NOT NULL,
    technical_validation_status  TEXT DEFAULT 'NOT_RUN',
    technical_validation_summary TEXT DEFAULT '[]',
    locked                       INTEGER DEFAULT 0,
    deployed                     INTEGER DEFAULT 0,
    release_candidate_flag       INTEGER DEFAULT 0,
    changelog_summary            TEXT DEFAULT '',
    review                       TEXT DEFAULT '{}',
    selected_deployment_context  TEXT,
    selected_variant_id          TEXT,
    selection_justification      TEXT,
    selected_by                  TEXT,
    selection_date               TEXT,
    deprecation_justification    TEXT,
    deprecation_replacement_id   TEXT,
    deprecation_date             TEXT,
    is_post_sales_derived        INTEGER DEFAULT 0
);

-- Labels (shared)
CREATE TABLE IF NOT EXISTS labels (
    id                                   TEXT PRIMARY KEY,
    dataset_id                           TEXT NOT NULL DEFAULT '',
    label_name                           TEXT NOT NULL DEFAULT '',
    data_type                            TEXT DEFAULT '',
    current_value                        TEXT DEFAULT '',
    unit                                 TEXT DEFAULT '',
    level                                TEXT DEFAULT 'CONFIGURATION',
    confidence_status                    TEXT DEFAULT 'EMPTY',
    last_modified_by                     TEXT DEFAULT '',
    last_modification_date               TEXT NOT NULL DEFAULT '',
    regulatory_relevance                 TEXT DEFAULT 'NO',
    regulation_reference                 TEXT DEFAULT '',
    parametrizable_in_customer           TEXT DEFAULT 'NO',
    parametrizable_override_justification TEXT DEFAULT '',
    change_justification                 TEXT DEFAULT '',
    comments                             TEXT DEFAULT '',
    imported_from_a2l                    INTEGER DEFAULT 1,
    modified                             INTEGER DEFAULT 0,
    owner                                TEXT DEFAULT 'BeGas',
    deputy                               TEXT DEFAULT '',
    work_package_id                      TEXT,
    maturity                             TEXT DEFAULT '0',
    description                          TEXT DEFAULT '',
    block_type                           TEXT DEFAULT 'CHARACTERISTIC',
    created_by                           TEXT DEFAULT '',
    created_at                           TEXT DEFAULT ''
);

-- Work Packages
CREATE TABLE IF NOT EXISTS work_packages (
    id              TEXT PRIMARY KEY,
    code            TEXT NOT NULL DEFAULT '',
    name            TEXT NOT NULL DEFAULT '',
    description     TEXT DEFAULT '',
    ecu_id          TEXT NOT NULL DEFAULT '',
    sub_workpackage TEXT,
    responsible     TEXT DEFAULT 'BeGas',
    active          INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT '',
    UNIQUE(code, ecu_id)
);

-- Vehicle SW IDs (unified)
CREATE TABLE IF NOT EXISTS vehicle_sw_ids (
    id                          TEXT PRIMARY KEY,
    vehicle_sw_id               TEXT NOT NULL DEFAULT '',
    software_release_id         TEXT NOT NULL DEFAULT '',
    sw_release_identifier       TEXT DEFAULT '',
    dataset_id                  TEXT NOT NULL DEFAULT '',
    dataset_name                TEXT DEFAULT '',
    variant_id                  TEXT,
    vin                         TEXT,
    manufacturing_order_reference TEXT,
    service_case_reference      TEXT,
    creation_date               TEXT NOT NULL DEFAULT '',
    created_by                  TEXT DEFAULT '',
    -- v1 extra aliases
    variant                     TEXT,
    mfg_order_ref               TEXT,
    service_case_ref            TEXT
);

-- Audit Log (unified: legacy audit_log + v1 audit_logs)
CREATE TABLE IF NOT EXISTS audit_log (
    id             TEXT PRIMARY KEY,
    entity_type    TEXT DEFAULT '',
    entity_id      TEXT DEFAULT '',
    action         TEXT NOT NULL DEFAULT '',
    previous_value TEXT,
    new_value      TEXT,
    author         TEXT DEFAULT '',
    date           TEXT NOT NULL,
    justification  TEXT DEFAULT '',
    dataset_id     TEXT DEFAULT '',
    from_state     TEXT,
    to_state       TEXT,
    sw_release_id  TEXT DEFAULT '',
    label_name     TEXT,
    extra          TEXT
);

-- Label Metadata (v1 labels router)
CREATE TABLE IF NOT EXISTS label_metadata (
    id              TEXT PRIMARY KEY,
    sw_release_id   TEXT NOT NULL DEFAULT '',
    label_name      TEXT NOT NULL DEFAULT '',
    owner           TEXT DEFAULT '',
    deputy          TEXT DEFAULT '',
    comment         TEXT DEFAULT '',
    user_status     TEXT DEFAULT 'START',
    maturity_score  INTEGER DEFAULT 0,
    maturity_history TEXT DEFAULT '[]',
    label_flags     TEXT DEFAULT '[]',
    save            INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT '',
    updated_at      TEXT DEFAULT '',
    updated_by      TEXT DEFAULT '',
    UNIQUE(sw_release_id, label_name)
);

-- Label Working Values (calibration editor WP/RP)
CREATE TABLE IF NOT EXISTS label_working_values (
    id           TEXT PRIMARY KEY,
    sw_release_id TEXT NOT NULL DEFAULT '',
    label_name   TEXT NOT NULL DEFAULT '',
    type         TEXT DEFAULT 'scalar',
    rp_value     TEXT,
    wp_value     TEXT,
    modified     INTEGER DEFAULT 0,
    modified_at  TEXT,
    modified_by  TEXT,
    truncated    INTEGER DEFAULT 0,
    original_dimensions TEXT,
    edit_history TEXT DEFAULT '[]',
    created_at   TEXT DEFAULT '',
    updated_at   TEXT DEFAULT '',
    UNIQUE(sw_release_id, label_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_datasets_sr   ON datasets(software_release_id);
CREATE INDEX IF NOT EXISTS idx_labels_ds     ON labels(dataset_id);
CREATE INDEX IF NOT EXISTS idx_labels_wp     ON labels(work_package_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_date    ON audit_log(date);
CREATE INDEX IF NOT EXISTS idx_lm_sr         ON label_metadata(sw_release_id);
CREATE INDEX IF NOT EXISTS idx_lwv_sr        ON label_working_values(sw_release_id);
CREATE INDEX IF NOT EXISTS idx_vsid_ds       ON vehicle_sw_ids(dataset_id);
""")
    await _conn.commit()
    _log.info("Schema ensured")
