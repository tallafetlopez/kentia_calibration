# Executable Program File Setup

This document summarizes everything added in the `EXECUTABLE-PROGRAM-FILE-SETUP` branch related to packaging and distributing Calibration Manager as a desktop application.

---

## Installer Download

The installer is hosted on MEGA due to GitHub's 100 MB file size limit.

### [DOWNLOAD CalibrationManager_Setup.exe](https://mega.nz/file/4WRnCAwC#KiRRioidj1CU33lultgak3VnaWIDbp7GXIOPt_AuKKY)

---

## Files Added

### `electron/`
Wraps the web app in an Electron desktop shell so it runs as a native Windows application.

| File | Description |
|------|-------------|
| `electron/main.js` | Electron entry point — creates the browser window and loads the app |
| `electron/package.json` | Electron app metadata and build config |
| `electron/package-lock.json` | Locked dependency tree |
| `electron/icon.ico` | Application icon |
| `electron/mongod.exe` | Bundled MongoDB binary *(not tracked in git — too large)* |

### `build_installer.ps1`
PowerShell script that automates the full build pipeline:
- Builds the React frontend
- Packages the Python backend with PyInstaller
- Runs Inno Setup to produce the final `.exe` installer

### `calibration_manager_installer.iss`
Inno Setup configuration file that defines:
- App name, version, and publisher info
- Files to include in the installer (frontend build, backend binary, Electron, MongoDB)
- Install/uninstall behavior on Windows

### `create_icon.py`
Utility script to generate the `.ico` icon file used by the Electron app and the Windows installer.

### `docs/USER_MANUAL_CALIBRATION_MANAGER.pdf`
End-user manual covering installation steps and application usage.

### `docs/DOC_CALIBRATION_MANAGER.pdf`
Technical documentation for the project.

---

## What the Installer Includes

When a user runs `CalibrationManager_Setup.exe` they get a self-contained installation with:

- React frontend (pre-built static files)
- Python backend (compiled with PyInstaller — no Python required on the target machine)
- Electron shell (desktop window wrapper)
- MongoDB (bundled — no separate database install required)

---

## Notes

- `installer_output/` and `electron/mongod.exe` are excluded from git (exceed GitHub's 100 MB limit). The final `.exe` is distributed via the MEGA link above.
- Installation instructions are in [`docs/USER_MANUAL_CALIBRATION_MANAGER.pdf`](docs/USER_MANUAL_CALIBRATION_MANAGER.pdf).
