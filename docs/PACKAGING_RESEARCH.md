# Packaging Research — kentia_calibration v1.0

> Estado: investigación. **No empaquetar todavía** — pendiente reunión con Víctor para alinear con patrón K-Trace.

---

## Objetivo

Distribuir la app (FastAPI backend + React frontend + MongoDB) como un ejecutable instalable en Windows sin requerir que el usuario instale Python, Node.js ni MongoDB.

---

## Opciones evaluadas

### 1. Electron + PyInstaller (recomendada)

Patrón probable de K-Trace según descripción del jefe.

| Componente | Solución |
|---|---|
| Frontend React | Empaquetado dentro de Electron como app desktop (BrowserWindow carga el `build/` estático) |
| Backend FastAPI | Congelado con PyInstaller → `backend.exe` |
| MongoDB | MongoDB Community Server instalado como servicio Windows, o bien MongoDB Embedded (no oficial) |
| Instalador | Electron Builder genera `.exe` / `.msi` con NSIS |

**Pros:** aspecto nativo desktop, sin navegador externo, un solo instalador  
**Contras:** tamaño grande (~200-400 MB), requiere mantener Electron actualizado

**Pasos rough:**
```bash
# 1) Build React
cd frontend && npm run build

# 2) Congelar backend
cd backend && pyinstaller server.py --onefile --name kentia-backend

# 3) Electron app: main.js arranca kentia-backend.exe y abre BrowserWindow a localhost:8000
# 4) electron-builder --win --x64  →  genera .msi
```

---

### 2. Tauri (alternativa ligera)

| Aspecto | Detalle |
|---|---|
| Peso | ~10 MB (usa WebView del SO, no Chromium) |
| Frontend | React build estático en WebView |
| Backend | Sidecar binary (PyInstaller) o servicio externo |
| Rust requerido | Sí, para compilar el shell Tauri |

**Pros:** muy ligero, menor superficie de ataque  
**Contras:** requiere Rust toolchain, WebView2 en Windows (disponible Win10+)

---

### 3. Docker Compose (para entorno dev/CI)

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      MONGO_URL: mongodb://mongo:27017
      DB_NAME: calibration_db
  frontend:
    build: ./frontend
    ports: ["3000:80"]
  mongo:
    image: mongo:7
    volumes: ["mongo_data:/data/db"]
volumes:
  mongo_data:
```

**Pros:** reproducible, sin instalar nada salvo Docker  
**Contras:** no es "instalador MSI", requiere Docker Desktop en el cliente

---

### 4. PyInstaller + nginx (sin Electron)

Backend congelado como `.exe`, frontend pre-built servido por nginx embebido (o por el propio FastAPI con `StaticFiles`).

```python
# server.py — montar el build de React como static
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend/build", html=True), name="static")
```

Entonces PyInstaller congela todo → un solo `.exe` que sirve frontend + API en `localhost:8000`.  
El usuario abre el browser manualmente o se abre automáticamente con `webbrowser.open()`.

**Pros:** sin Electron, más simple  
**Contras:** UX menos "app nativa", requiere que el usuario tenga browser

---

## Recomendación

**Preguntar a Víctor el lunes** cuál es el patrón exacto de K-Trace:

1. ¿Usa Electron? ¿Tauri? ¿PyInstaller standalone?
2. ¿MongoDB está embebido o instalado como servicio Windows?
3. ¿El instalador es NSIS (.exe) o WiX (.msi)?

Dependiendo de la respuesta, replicar ese patrón exacto para mantener consistencia con el ecosistema HERKO.

---

## Siguiente paso (cuando se decida)

```
chore(packaging): add Electron shell + PyInstaller spec + electron-builder config
```

Estimación: 1-2 días de trabajo una vez confirmado el patrón.
