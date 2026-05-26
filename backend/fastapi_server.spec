# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for HERKO Calibration Manager backend sidecar."""

import sys
from pathlib import Path

BACKEND_DIR = Path(SPECPATH)

a = Analysis(
    [str(BACKEND_DIR / 'server.py')],
    pathex=[str(BACKEND_DIR)],
    binaries=[],
    datas=[
        # Bundle agent markdown files
        (str(BACKEND_DIR / 'agents'), 'agents'),
        # Bundle parsers directory (DCM/A2L parsers need their folder)
        (str(BACKEND_DIR / 'parsers'), 'parsers'),
    ],
    hiddenimports=[
        # uvicorn internals not auto-detected
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        # aiosqlite
        'aiosqlite',
        'aiosqlite.core',
        # SQLite dialect
        'sqlalchemy.dialects.sqlite',
        # pydantic v2
        'pydantic.deprecated.class_validators',
        'pydantic.deprecated.config',
        'pydantic.deprecated.tools',
        # email_validator (used by pydantic)
        'email_validator',
        # passlib backends
        'passlib.handlers.bcrypt',
        'passlib.handlers.sha2_crypt',
        # cryptography
        'cryptography.hazmat.primitives.asymmetric.padding',
        'cryptography.hazmat.backends.openssl.backend',
        # multipart
        'multipart',
        # project modules
        'resource_path',
        'db',
        'models',
        'models_calibration',
        'auth_utils',
        'dependencies',
        'seed',
        'routers.sw_releases',
        'routers.datasets',
        'routers.vehicle_sw_ids',
        'routers.a2l',
        'routers.dcm',
        'routers.work_packages',
        'routers.labels',
        'routers.calibration_values',
        'routers.traceability',
        'parsers.dcm_parser',
        'parsers.dcm_writer',
        'parsers.a2l_parser',
        'parsers.s37_parser',
        'utils.map_limits',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # dev/test deps — shrink the bundle
        'pytest', 'black', 'isort', 'flake8', 'mypy',
        'matplotlib', 'IPython', 'notebook',
        'pymongo', 'motor',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='fastapi-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX can break cryptography DLLs — keep off
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,       # sidecar launched by Tauri as subprocess — no window shown regardless
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,          # TODO: add .ico in future
)
