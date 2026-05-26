"""PyInstaller-compatible resource path resolver."""
import os
import sys
from pathlib import Path


def resource_path(relative: str) -> Path:
    """Resolve path to a bundled resource.

    When frozen by PyInstaller, resources live under sys._MEIPASS.
    In development, they live relative to this file's parent (backend/).
    """
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / relative
    return Path(__file__).parent / relative


def app_data_dir() -> Path:
    """Return writable user-data dir for runtime files (db, logs, uploads).

    Uses HERKO_DATA_PATH env var when set (Tauri sidecar sets it).
    Falls back to %APPDATA%\\HERKO on Windows, ~/.herko elsewhere.
    """
    custom = os.environ.get("HERKO_DATA_PATH")
    if custom:
        p = Path(custom)
    elif sys.platform == "win32":
        p = Path(os.environ.get("APPDATA", Path.home())) / "HERKO"
    else:
        p = Path.home() / ".herko"
    p.mkdir(parents=True, exist_ok=True)
    return p
