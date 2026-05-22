# HERKO Calibration Manager — Roadmap

## ✅ FASE 1 — Limpiar la base de datos
- [x] Script `clear_db.py` para limpiar colecciones sin eliminar índices
- [x] Preservar colección `users` para supervivencia de admin
- [x] Flag `--dry-run` implementado

## ✅ FASE 2 — Endpoints FastAPI (backend)
- [x] Router: SW Releases (`routers/sw_releases.py`)
  - [x] GET /api/v1/sw-releases (con filtros status, supplier)
  - [x] GET /api/v1/sw-releases/{id}
  - [x] POST /api/v1/sw-releases
  - [x] PATCH /api/v1/sw-releases/{id}/status
  - [x] DELETE /api/v1/sw-releases/{id} (soft-delete)

- [x] Router: Datasets (`routers/datasets.py`)
  - [x] GET /api/v1/datasets (con filtros state, context, mode, sw_release)
  - [x] GET /api/v1/datasets/{id}
  - [x] POST /api/v1/datasets
  - [x] PATCH /api/v1/datasets/{id}
  - [x] POST /api/v1/datasets/{id}/transition (state machine)
  - [x] DELETE /api/v1/datasets/{id}

- [x] Router: Vehicle SW IDs (`routers/vehicle_sw_ids.py`)
  - [x] GET /api/v1/vehicle-sw-ids
  - [x] GET /api/v1/vehicle-sw-ids/{id}
  - [x] POST /api/v1/vehicle-sw-ids/generate (con validaciones)

- [x] Router: Traceability (`routers/traceability.py`)
  - [x] GET /api/v1/traceability (cadena completa)
  - [x] GET /api/v1/traceability/audit-logs (con filtros)

- [x] Registro de routers en `server.py`

## ✅ FASE 3 — Formularios React (frontend)
- [x] `NewSwReleaseModal.jsx` (crear SW Release)
- [x] `NewDatasetModal.jsx` (crear Dataset)
- [x] `GenerateVehicleSwIdModal.jsx` (generar Vehicle SW ID)
- [x] `DatasetStateTransitionButton.jsx` (transiciones reutilizables)

## ✅ FASE 4 — Integración y validación
- [x] Script `seed_test_data.py` (datos de prueba iniciales)
- [x] Estructura para tests con pytest (preparada)
- [x] `IMPLEMENTATION_GUIDE.md` (documentación completa)

## ✅ PROMPT 1-3 — Dev Tools & A2L Module
- [x] PROMPT 3: Dev bypass temporal (`devBypassSetup.js`, `DevModeBadge.jsx`)
  - [x] Modo sin auth para testing rápido
  - [x] Activable con `?dev=true` o localStorage
  - [x] Badge flotante rojo en esquina inferior derecha
  - [x] Mock interceptors de axios

- [x] PROMPT 1: Fix loading infinito
  - [x] Timeout 5s en auth check (fetchMe)
  - [x] Timeout 10s en login call
  - [x] Componente `AuthErrorFallback.jsx`
  - [x] Logging de errores en console
  - [x] setLoading(false) garantizado

- [x] PROMPT 2: Módulo A2L visual
  - [x] Backend: `routers/a2l.py` (3 endpoints)
    - [x] POST /api/v1/sw-releases/{id}/a2l/upload
    - [x] GET /api/v1/sw-releases/{id}/a2l/parse
    - [x] GET /api/v1/sw-releases/{id}/a2l/info
  - [x] Frontend: Página detail con tabs
    - [x] `SwReleaseDetailPage.jsx` (layout 2-columnas)
    - [x] `A2LParametersTab.jsx` (tabla searchable)
    - [x] `A2LMapsTab.jsx` (visual heat-maps)
    - [x] `A2LUploadTab.jsx` (drag-drop upload)

## ✅ LOGIN FIX — Critical Bug Resolution
- [x] Diagnosticado: Import conflict `traceability` function vs module
- [x] Arreglado: Renombrado import a `traceability_router`
- [x] Frontend: Mejorados timeouts y error handling
- [x] Scripts: `diagnose_login.py`, `seed_users_simple.py`, `verify_login_complete.py`
- [x] Documentación: `LOGIN_FIX_GUIDE.md`, `LOGIN_FIX_REPORT.md`
- [x] Verificación: Todos los checks pasan ✓

## ✅ DATABASE & VALIDATION FIX (SESSION 2)
- [x] PROMPT 1: BD reset — limpiar todo excepto usuarios
  - [x] Script `reset_db_keep_users.py` (async + motor)
  - [x] Ejecutado: 9 usuarios preservados
  - [x] Colecciones: solo `users` (resto no creadas aún)

- [x] PROMPT 3: Verificación de BD limpia
  - [x] Confirmado: solo colección `users` (9 users)
  - [x] BD pronta para datos nuevos

- [x] PROMPT 2: Fix validación de labels en dataset
  - [x] **Backend** (`server.py`):
    - [x] Modified `technical_validate` (líneas 418-461)
      - Si 0 labels → return PASS (no valida aún)
      - Si tiene labels → valida normalmente
      - Warning message si 0 labels
    - [x] Modified `submit_approval` (líneas 463-520)
      - Auto-ejecuta technical_validate si NOT_RUN
      - Valida antes de transicionar a UNDER_APPROVAL
      - Bloquea submit si validation FAIL

  - [x] **Frontend** (`DatasetDetailPage.jsx`):
    - [x] Updated checklist (líneas 286-293)
      - Technical validation: "(will run on submit)" si NOT_RUN
      - Solo bloquea si FAIL, no si NOT_RUN
    - [x] Added NOT_RUN display (líneas 450-458)
      - Mensaje informativo (no error rojo)
      - Explica que se ejecutará en submit

## ✅ v1.0 — Workflow Nominal (22/05/2026)

- [x] `parsers/dcm_writer.py` — serializer DAMOS 2.0 (scalar/curve/map)
- [x] `POST /api/v1/sw-releases/{id}/labels/export-dcm` — export DCM con filtros scope/maturity
- [x] `POST /api/v1/labels/merge-preview` — diff seco de N calibraciones (identical/conflicts/only-in-X)
- [x] `POST /api/v1/labels/merge-export` — merge overlay_wins|base_wins|manual → DCM descargable
- [x] `_build_merged`: añade `default_value_a2l` + `needs_default_assignment`
- [x] `SwReleaseLabelViewer`: botón Export DCM + modal, banner ⚠ Missing DCM + modal defaults
- [x] `SwReleaseLabelViewer`: tabla compacta (fontSize 10.5, row 22px)
- [x] `SwReleaseMerge.jsx`: UI merge con preview de conflictos + resolución manual
- [x] `herko/Header`: role switcher dropdown en navbar
- [x] `PATCH /api/auth/users/{id}/roles` — admin edita roles de otros usuarios
- [x] `AdminPage`: checkboxes inline para editar roles (solo DM_Administrator)
- [x] `scripts/clean_duplicate_uploads.py` — script dry-run/--delete huérfanos
- [x] `docs/PACKAGING_RESEARCH.md` — análisis Electron/Tauri/Docker/PyInstaller
- [x] `README.md` — sección Novedades v1.0
- [x] Tag `v1.0.0` en git

## 📋 v1.1 — Próximas features (aplazadas)

- [ ] Escribir valores default al DCM desde modal "Assign defaults" (pendiente de spec con Víctor)
- [ ] Empaquetado MSI/Electron (pendiente reunión Víctor — ver `docs/PACKAGING_RESEARCH.md`)
- [ ] Límites por rol/workpackage al editar labels
- [ ] Reglas de ownership ("tú no puedes tocar esto porque ya lo tocó otro")
- [ ] Suavizado de curvas (pendiente spec técnica)
- [ ] Importar DCM al dataset (workflow completo creación desde cero)
- [ ] Crear tests pytest completos (`tests/test_sw_releases.py`)
- [ ] Notificaciones en tiempo real (WebSocket)

## 🎯 Estado v1.0

**Backend**: ✅ Workflow nominal completo
**Frontend**: ✅ Label Viewer + Merge + Export DCM operativos
**Tests**: ✅ DCM writer 5/5 passing
**Tag**: ✅ v1.0.0

---

## 🚀 Quick Start

```bash
# MongoDB debe estar corriendo en localhost:27017

# Terminal 1 — backend
cd backend
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — frontend
cd frontend
npm start
```

- Frontend: http://localhost:3000
- Backend / Swagger: http://localhost:8000/docs
- Login demo: `admin@herko.dev` / `password123`

