# HERKO Calibration Manager — Packaging Guide

## Architecture

```
app.exe (Tauri v2 shell)
  └── fastapi-server.exe (PyInstaller sidecar)
        └── FastAPI + uvicorn + SQLite (aiosqlite)
              └── %APPDATA%\HERKO\calibration.db
```

- `app.exe` is the Tauri WebView2 host. It spawns `fastapi-server.exe` as a child process on startup and polls `http://127.0.0.1:8765/health` before showing the window.
- `fastapi-server.exe` is a frozen Python process. It binds **only** to `127.0.0.1` (never `0.0.0.0`). Logs go to `%APPDATA%\HERKO\server.log`.
- The SQLite database is created at first run in `%APPDATA%\HERKO\calibration.db`.

## Prerequisites (developer machine)

| Tool | Version | Install |
|------|---------|---------|
| Rust (stable-x86_64-pc-windows-msvc) | 1.77+ | `rustup` |
| VS Build Tools 2022 (C++ workload) | 17.x | `aka.ms/vs/17/release/vs_buildtools.exe` |
| Python | 3.11+ | python.org |
| pnpm | 11.1.0 | `npm i -g pnpm` |
| Node.js | 18+ | nodejs.org |
| PyInstaller | 6.20.0 | pip (in venv) |

## Build steps

### 1. Backend sidecar

```powershell
cd apps/kentia_calibration/backend
.venv\Scripts\pyinstaller.exe fastapi_server.spec
# Output: dist/fastapi-server.exe
```

### 2. Copy sidecar to Tauri binaries

```powershell
Copy-Item backend\dist\fastapi-server.exe `
  frontend\src-tauri\binaries\fastapi-server-x86_64-pc-windows-msvc.exe
```

### 3. React production build

```powershell
cd apps/kentia_calibration/frontend
$env:CI = "false"
pnpm build
```

### 4. Tauri bundle (MSI + NSIS)

```powershell
# Ensure MSVC linker is on PATH
$msvcVer = (Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" | Select-Object -First 1).Name
$env:LIB = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\$msvcVer\lib\x64;" +
           "C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\ucrt\x64;" +
           "C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

pnpm tauri build
```

Output files:
```
frontend/src-tauri/target/release/bundle/
  msi/HERKO Calibration Manager_0.1.0_x64_en-US.msi
  nsis/HERKO Calibration Manager_0.1.0_x64-setup.exe
```

## Environment variables (runtime)

| Variable | Default | Description |
|----------|---------|-------------|
| `HERKO_API_PORT` | `8765` | Port the backend listens on |
| `HERKO_DB_PATH` | `%APPDATA%\HERKO\calibration.db` | Override database path |
| `HERKO_DATA_PATH` | `%APPDATA%\HERKO` | Override all data directory |

## Security notes

- Backend binds to `127.0.0.1` only — not reachable from network.
- CORS allows only `tauri://localhost`, `http://tauri.localhost`, and `http://localhost:*` (dev).
- CSP restricts `connect-src` to `http://127.0.0.1:8765`.
- No telemetry. No auto-update. No internet required at runtime.
- Installer is **unsigned** (v0.1.0). Windows SmartScreen will warn on first run. Add code signing certificate before production release. See `tauri.conf.json` → `bundle.windows.certificateThumbprint`.

## R156 / SUMS traceability

- MSI upgradeCode: `B9F4E2A1-3C7D-4F8B-A5E6-1D2C3B4A5F6E` (fixed — do not change between versions)
- SHA256 hashes recorded in `releases/<version>/SHA256SUMS.md`
- SQLite WAL mode = atomic transactions, auditable edit history in `label_working_values.edit_history`

## Upgrade

Tauri WiX uses the upgradeCode to detect previous versions. Increment `version` in `tauri.conf.json` and `src-tauri/Cargo.toml` before each release. The MSI installer will replace the previous installation automatically.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank white window on launch | Backend didn't start in time | Check `%APPDATA%\HERKO\server.log` |
| `http://127.0.0.1:8765` unreachable | fastapi-server.exe crashed | Check `server.log`; re-run PyInstaller if DLLs missing |
| 1603 MSI install error | UAC not elevated | Run installer as Administrator |
| SmartScreen blocks NSIS setup | Unsigned binary | Click "More info" → "Run anyway", or sign the binary |
