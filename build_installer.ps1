# =============================================================
#  Calibration Manager — Build Script
#  Genera CalibrationManager_Setup.exe completo
#
#  Uso:  .\build_installer.ps1
#
#  REQUISITO PREVIO: rellenar backend\.env con credenciales
#  reales de MongoDB Atlas antes de ejecutar.
# =============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function Step($n, $msg) {
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  PASO $n — $msg" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Check($file, $label) {
    if (Test-Path $file) {
        Write-Host "  ✅  $label OK: $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌  $label NO encontrado: $file" -ForegroundColor Red
        exit 1
    }
}

# ─────────────────────────────────────────────────────────────
Step 0 "Verificar credenciales en backend\.env"
# ─────────────────────────────────────────────────────────────

$envFile = "$ROOT\backend\.env"
if (-not (Test-Path $envFile)) {
    Write-Host "  ❌  Falta backend\.env" -ForegroundColor Red
    exit 1
}
$envContent = Get-Content $envFile -Raw
if ($envContent -match "<usuario>|CAMBIA_ESTA") {
    Write-Host "  ⚠️   backend\.env contiene valores de PLANTILLA." -ForegroundColor Yellow
    Write-Host "  ⚠️   Edítalo con tus credenciales reales de MongoDB Atlas." -ForegroundColor Yellow
    $confirm = Read-Host "  ¿Continuar igualmente? (s/N)"
    if ($confirm -notmatch "^[sS]$") { exit 0 }
}
Write-Host "  ✅  backend\.env presente" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────
Step 1 "Generar icono (electron\icon.ico)"
# ─────────────────────────────────────────────────────────────
Set-Location $ROOT
python create_icon.py
Check "$ROOT\electron\icon.ico" "icon.ico"

# ─────────────────────────────────────────────────────────────
Step 2 "Compilar frontend React"
# ─────────────────────────────────────────────────────────────
Set-Location "$ROOT\frontend"
if (-not (Test-Path "node_modules")) {
    Write-Host "  → npm install..." -ForegroundColor Gray
    npm install
}
Write-Host "  → npm run build..." -ForegroundColor Gray
npm run build
Check "$ROOT\frontend\build\index.html" "frontend/build/index.html"

# ─────────────────────────────────────────────────────────────
Step 3 "Empaquetar backend con PyInstaller"
# ─────────────────────────────────────────────────────────────
Set-Location "$ROOT\backend"
Write-Host "  → PyInstaller (~2-4 min)..." -ForegroundColor Gray
python -m PyInstaller -y `
    --onedir `
    --name CalibrationManagerServer `
    "--add-data=.env;." `
    "--add-data=../frontend/build;build" `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.loops.asyncio `
    --hidden-import uvicorn.protocols `
    --hidden-import uvicorn.protocols.http `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.http.h11_impl `
    --hidden-import uvicorn.protocols.websockets `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan `
    --hidden-import uvicorn.lifespan.on `
    --hidden-import motor.motor_asyncio `
    --hidden-import pymongo `
    --hidden-import bson `
    --hidden-import bson.objectid `
    --hidden-import bson.errors `
    --hidden-import bson.codec_options `
    --hidden-import dns `
    --hidden-import dns.resolver `
    --hidden-import dns.rdatatype `
    --hidden-import certifi `
    --collect-data certifi `
    --hidden-import passlib.handlers.bcrypt `
    --hidden-import multipart `
    --hidden-import fastapi `
    --hidden-import starlette `
    --hidden-import starlette.middleware.cors `
    --hidden-import email_validator `
    --noconsole `
    server.py

Check "$ROOT\backend\dist\CalibrationManagerServer\CalibrationManagerServer.exe" "CalibrationManagerServer.exe"
$sz = [math]::Round((Get-Item "$ROOT\backend\dist\CalibrationManagerServer\CalibrationManagerServer.exe").Length / 1MB, 1)
Write-Host "  → Tamaño: $sz MB" -ForegroundColor Gray

# ─────────────────────────────────────────────────────────────
Step 4 "Copiar mongod.exe a electron/ para empaquetado"
# ─────────────────────────────────────────────────────────────

$mongodDest = "$ROOT\electron\mongod.exe"
$mongodCandidates = @(
    "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe",
    "C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe",
    "C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe"
)
$mongodSource = $null
foreach ($c in $mongodCandidates) {
    if (Test-Path $c) { $mongodSource = $c; break }
}
if (-not $mongodSource) {
    $found = Get-ChildItem "C:\Program Files\MongoDB" -Recurse -Filter "mongod.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $mongodSource = $found.FullName }
}
if (-not $mongodSource) {
    Write-Host "  ❌  mongod.exe no encontrado en 'C:\Program Files\MongoDB'" -ForegroundColor Red
    Write-Host "  ❌  Instala MongoDB Community Server y vuelve a intentarlo." -ForegroundColor Red
    exit 1
}
Copy-Item $mongodSource $mongodDest -Force
$mongodMB = [math]::Round((Get-Item $mongodDest).Length / 1MB, 0)
Write-Host "  ✅  mongod.exe copiado desde: $mongodSource ($mongodMB MB)" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────
Step 5 "Empaquetar app Electron"
# ─────────────────────────────────────────────────────────────
Set-Location "$ROOT\electron"
if (-not (Test-Path "node_modules")) {
    Write-Host "  → npm install (primera vez ~100 MB)..." -ForegroundColor Gray
    npm install
}
Write-Host "  → electron-packager..." -ForegroundColor Gray
npm run build

$winUnpacked = "$ROOT\electron\dist\Calibration Manager-win32-x64"
Check "$winUnpacked\Calibration Manager.exe" "Calibration Manager.exe"
$appSz = [math]::Round((Get-ChildItem $winUnpacked -Recurse | Measure-Object Length -Sum).Sum / 1MB, 0)
Write-Host "  → Tamaño total: $appSz MB" -ForegroundColor Gray

# ─────────────────────────────────────────────────────────────
Step 6 "Compilar instalador con Inno Setup"
# ─────────────────────────────────────────────────────────────
Set-Location $ROOT

# Buscar ISCC.exe
$iscc = $null
foreach ($p in @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
)) {
    if (Test-Path $p) { $iscc = $p; break }
}

if (-not $iscc) {
    Write-Host "  → Inno Setup no encontrado. Instalando via winget..." -ForegroundColor Yellow
    winget install --id JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements
    foreach ($p in @(
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe"
    )) {
        if (Test-Path $p) { $iscc = $p; break }
    }
}

if (-not $iscc) {
    Write-Host "  ❌  ISCC.exe no encontrado" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force "$ROOT\installer_output" | Out-Null
& $iscc "$ROOT\calibration_manager_installer.iss"
if ($LASTEXITCODE -ne 0) { Write-Host "  ❌  ISCC falló" -ForegroundColor Red; exit 1 }

Check "$ROOT\installer_output\CalibrationManager_Setup.exe" "CalibrationManager_Setup.exe"
$instSz = [math]::Round((Get-Item "$ROOT\installer_output\CalibrationManager_Setup.exe").Length / 1MB, 0)

# ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  ✅  BUILD COMPLETADO" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "  Instalador: $ROOT\installer_output\CalibrationManager_Setup.exe"
Write-Host "  Tamaño:     $instSz MB"
Write-Host ""
Write-Host "  Flujo del usuario final:"
Write-Host "   1. Doble clic en CalibrationManager_Setup.exe"
Write-Host "   2. Asistente → Ruta → Instalar → Finalizar"
Write-Host "   3. Icono 'Calibration Manager' en el Escritorio (si seleccionado)"
Write-Host "   4. Doble clic → splash de carga → ventana nativa (sin navegador)"
Write-Host "   5. Login → trabaja con la app normalmente"
Write-Host "   6. Cerrar ventana → backend se apaga automáticamente"
Write-Host ""
