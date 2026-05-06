# HERKO Calibration Manager — Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      HERKO CALIBRATION MANAGER                              │
│                     (5 de mayo de 2026 — v1.0)                             │
└─────────────────────────────────────────────────────────────────────────────┘

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                          FRONTEND (React 18)                               ┃
┃                       http://localhost:3000                                ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                            ┃
┃  ┌─────────────────────────────────────────────────────────────────┐     ┃
┃  │                    COMPONENTES NUEVOS (FASE 3)                  │     ┃
┃  │                                                                 │     ┃
┃  │  • NewSwReleaseModal.jsx                                       │     ┃
┃  │    └─ Crear SW Release (identifier, version, supplier, date)  │     ┃
┃  │                                                                 │     ┃
┃  │  • NewDatasetModal.jsx                                         │     ┃
┃  │    └─ Crear Dataset (name, context, mode, sw_release_id)      │     ┃
┃  │                                                                 │     ┃
┃  │  • GenerateVehicleSwIdModal.jsx                                │     ┃
┃  │    └─ Generar Vehicle SW ID (con validación de estado)         │     ┃
┃  │                                                                 │     ┃
┃  │  • DatasetStateTransitionButton.jsx                            │     ┃
┃  │    └─ Transiciones EDIT → UNDER_APPROVAL → ... → RELEASED    │     ┃
┃  │                                                                 │     ┃
┃  └─────────────────────────────────────────────────────────────────┘     ┃
┃                                                                            ┃
┃                          HTTP/REST + JWT                                  ┃
┃                    axios → http://localhost:8000                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                      │
                                      │ /api/v1/*
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                       BACKEND (FastAPI + Motor)                            ┃
┃                    http://localhost:8000/docs                             ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                            ┃
┃  ┌─────────────────────────────────────────────────────────────────┐     ┃
┃  │               ROUTERS v1 API (FASE 2)                            │     ┃
┃  │                                                                 │     ┃
┃  │  /api/v1/sw-releases                (SW Releases Router)       │     ┃
┃  │  ├─ GET    → list all, filtros: ?status, ?supplier            │     ┃
┃  │  ├─ GET    /{id}                                              │     ┃
┃  │  ├─ POST   → create (status: DRAFT)                           │     ┃
┃  │  ├─ PATCH  /{id}/status → update status                       │     ┃
┃  │  └─ DELETE /{id} → soft-delete (status: DEPRECATED)           │     ┃
┃  │                                                                 │     ┃
┃  │  /api/v1/datasets                   (Datasets Router)          │     ┃
┃  │  ├─ GET    → list, filtros: ?state, ?context, ?mode           │     ┃
┃  │  ├─ GET    /{id}                                              │     ┃
┃  │  ├─ POST   → create (state: EDIT, is_locked: false)          │     ┃
┃  │  ├─ PATCH  /{id} → update fields                              │     ┃
┃  │  ├─ POST   /{id}/transition → STATE MACHINE                   │     ┃
┃  │  │         States: EDIT → UNDER_APPROVAL → APPROVED            │     ┃
┃  │  │                  → RELEASE_CANDIDATE → RELEASED             │     ┃
┃  │  │                  (All → DEPRECATED)                         │     ┃
┃  │  └─ DELETE /{id} → soft-delete                                │     ┃
┃  │                                                                 │     ┃
┃  │  /api/v1/vehicle-sw-ids            (Vehicle SW IDs Router)    │     ┃
┃  │  ├─ GET    → list (filtros: ?sw_release, ?dataset)           │     ┃
┃  │  ├─ GET    /{id}                                              │     ┃
┃  │  └─ POST   /generate → create Vehicle_SW_ID (UUID)            │     ┃
┃  │           ⚠️ Dataset must be RELEASE_CANDIDATE or RELEASED    │     ┃
┃  │                                                                 │     ┃
┃  │  /api/v1/traceability              (Traceability Router)      │     ┃
┃  │  ├─ GET    → full chain (SW → Datasets → Vehicles)           │     ┃
┃  │  └─ GET    /audit-logs → logs filtered by entity/author/date  │     ┃
┃  │                                                                 │     ┃
┃  └─────────────────────────────────────────────────────────────────┘     ┃
┃                                                                            ┃
┃  ┌─────────────────────────────────────────────────────────────────┐     ┃
┃  │                     AUTH (JWT + Motor)                          │     ┃
┃  │  • Middleware: Authorization header + JWT verification         │     ┃
┃  │  • Dependency: get_current_user(request, db)                   │     ┃
┃  │  • All endpoints require authentication                        │     ┃
┃  └─────────────────────────────────────────────────────────────────┘     ┃
┃                                                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                      │
                            MongoDB Async Driver
                            motor.motor_asyncio
                                      │
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                     DATABASE (MongoDB Atlas/Local)                        ┃
┃               calibrationengine_herko @ localhost:27017                   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                            ┃
┃  Collections:                                                              ┃
┃  │                                                                        ┃
┃  ├─ users                      (existe, preservado por clear_db.py)     ┃
┃  │  └─ {id, email, password_hash, name, roles, active_role, ...}       ┃
┃  │                                                                        ┃
┃  ├─ sw_releases                (NUEVA)                                  ┃
┃  │  └─ {_id, identifier, version, supplier, status, released_date, ...} ┃
┃  │     Status: DRAFT | VALID_FOR_CALIBRATION | DEPRECATED              ┃
┃  │                                                                        ┃
┃  ├─ datasets                   (NUEVA)                                  ┃
┃  │  └─ {_id, name, state, sw_release_id, context, mode, is_locked, ...} ┃
┃  │     State: EDIT | UNDER_APPROVAL | APPROVED | RELEASE_CANDIDATE     ┃
┃  │            | RELEASED | DEPRECATED                                   ┃
┃  │     Context: PRODUCTION | DEVELOPMENT | VARIANT_SPECIFIC | ...       ┃
┃  │     Mode: IMPORT_S37 | COPY_EXISTING | REUSE_BASELINE | MERGE       ┃
┃  │                                                                        ┃
┃  ├─ vehicle_sw_ids             (NUEVA)                                  ┃
┃  │  └─ {_id, vehicle_sw_id (UUID), sw_release_id, dataset_id,           ┃
┃  │       vin, variant, mfg_order_ref, service_case_ref, ...}           ┃
┃  │                                                                        ┃
┃  ├─ audit_logs                 (NUEVA)                                  ┃
┃  │  └─ {action, entity, entity_id, from_state, to_state,                ┃
┃  │       author, timestamp}                                              ┃
┃  │     → Registra transiciones de estado críticas                       ┃
┃  │                                                                        ┃
┃  └─ ... (otras colecciones existentes)                                  ┃
┃                                                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

## Flujo de Datos — Ciclo Completo

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    1️⃣  CREAR SW RELEASE                                │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks "New SW Release" → NewSwReleaseModal opens                │
│                  ↓                                                        │
│  Form submit → POST /api/v1/sw-releases (JWT auth)                     │
│                  ↓                                                        │
│  Backend validates + inserts into db.sw_releases (status: DRAFT)       │
│                  ↓                                                        │
│  Response: { id, identifier, version, ... }                            │
│                  ↓                                                        │
│  UI refreshes list, modal closes                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    2️⃣  ACTUALIZAR STATUS SW RELEASE                    │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks "Mark Valid" → PATCH /api/v1/sw-releases/{id}/status      │
│                  ↓                                                        │
│  Body: { "status": "VALID_FOR_CALIBRATION" }                           │
│                  ↓                                                        │
│  Backend updates record                                                 │
│                  ↓                                                        │
│  Response: updated SW Release                                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    3️⃣  CREAR DATASET                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks "New Dataset" → NewDatasetModal opens                      │
│                  ↓                                                        │
│  Modal loads sw_releases (GET /api/v1/sw-releases?status=VALID...)     │
│                  ↓                                                        │
│  User selects SW Release + context/mode → Form submit                  │
│                  ↓                                                        │
│  POST /api/v1/datasets { name, sw_release_id, context, mode, ... }    │
│                  ↓                                                        │
│  Backend validates SW Release exists + inserts dataset                 │
│  (state: EDIT, is_locked: false, denormalized sw_release_identifier)   │
│                  ↓                                                        │
│  Response: { id, name, state: "EDIT", ... }                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    4️⃣  TRANSICIÓN DE ESTADO DATASET                    │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks button on Dataset row → DatasetStateTransitionButton      │
│  (e.g., "Submit for Approval" EDIT → UNDER_APPROVAL)                 │
│                  ↓                                                        │
│  POST /api/v1/datasets/{id}/transition { to_state: "UNDER_APPROVAL" }  │
│                  ↓                                                        │
│  Backend validates transition is valid in state machine                │
│                  ↓                                                        │
│  If transitioning to RELEASED:                                          │
│    └─ Write audit log entry                                            │
│    └─ Set is_locked = true                                            │
│                  ↓                                                        │
│  Response: updated dataset with new state                              │
│                  ↓                                                        │
│  UI updates badge color, refreshes                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    5️⃣  GENERAR VEHICLE SW ID                           │
├─────────────────────────────────────────────────────────────────────────┤
│  User clicks "Assign Vehicle" → GenerateVehicleSwIdModal opens         │
│                  ↓                                                        │
│  Modal loads datasets (GET /api/v1/datasets?state=RELEASE_CANDIDATE)  │
│                  ↓                                                        │
│  User fills form (vin, variant, mfg_order_ref, ...) → Submit         │
│                  ↓                                                        │
│  POST /api/v1/vehicle-sw-ids/generate { dataset_id, vin, ... }       │
│                  ↓                                                        │
│  Backend validates:                                                     │
│    • Dataset exists                                                     │
│    • Dataset state is RELEASED or RELEASE_CANDIDATE                   │
│    • VIN format (17 chars if provided)                                │
│                  ↓                                                        │
│  Generate UUID for vehicle_sw_id                                       │
│                  ↓                                                        │
│  Insert into db.vehicle_sw_ids (denormalized sw_release_id, ...)      │
│                  ↓                                                        │
│  Response: { vehicle_sw_id: "550e8400-...", ... }                     │
│                  ↓                                                        │
│  UI shows highlighted box with ID + copy button                        │
│  Auto-closes after 2s                                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    6️⃣  VER TRAZABILIDAD COMPLETA                       │
├─────────────────────────────────────────────────────────────────────────┤
│  User navigates to Traceability page                                    │
│                  ↓                                                        │
│  GET /api/v1/traceability                                              │
│                  ↓                                                        │
│  Backend joins:                                                         │
│    SW_Releases → Datasets → Vehicle_SW_IDs                            │
│                  ↓                                                        │
│  Response: [                                                            │
│    {                                                                    │
│      sw_release: { identifier, version, status },                      │
│      datasets: [                                                        │
│        {                                                                │
│          name, state, context, mode,                                   │
│          vehicle_sw_ids: [ {vehicle_sw_id, vin, created_at}, ... ]   │
│        },                                                               │
│        ...                                                              │
│      ]                                                                  │
│    },                                                                   │
│    ...                                                                  │
│  ]                                                                      │
│                  ↓                                                        │
│  UI renders hierarchical tree: SW → Datasets → Vehicles               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    7️⃣  VER AUDIT LOG                                    │
├─────────────────────────────────────────────────────────────────────────┤
│  User navigates to Audit Log page                                       │
│                  ↓                                                        │
│  GET /api/v1/traceability/audit-logs?limit=50                         │
│                  ↓                                                        │
│  Backend returns filtered audit log entries (sorted by timestamp DESC)  │
│                  ↓                                                        │
│  Response: [                                                            │
│    {                                                                    │
│      action: "STATE_TRANSITION",                                       │
│      entity: "dataset",                                                │
│      entity_id: "...",                                                 │
│      from_state: "EDIT",                                               │
│      to_state: "UNDER_APPROVAL",                                       │
│      author: "cal@herko.dev",                                          │
│      timestamp: "2026-05-05T14:32:15Z"                                │
│    },                                                                   │
│    ...                                                                  │
│  ]                                                                      │
│                  ↓                                                        │
│  UI renders timeline con eventos filtrados                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Máquina de Estados — Ciclo de Vida Dataset

```
                              ┌──────────────┐
                              │    EDIT      │ (inicial)
                              └──────┬───────┘
                                     │
                    Submit for Approval
                            │        │
                            ├────────┘
                            │
              ┌─────────────────────────────┐
              │    UNDER_APPROVAL           │
              └─────────┬─────────┬─────────┘
                        │         │
                    Approve    Reject
                        │         │
                        │         └────────────────┐
                        │                          │
              ┌─────────▼─────────┐       (regresa a EDIT)
              │    APPROVED       │
              └────────┬──────────┘
                       │
            Mark as Release Candidate
                       │
         ┌─────────────▼──────────────┐
         │  RELEASE_CANDIDATE        │
         │  (is_locked = true)        │
         └─────────────┬──────────────┘
                       │
                    Release
                       │
         ┌─────────────▼──────────────┐
         │    RELEASED                │
         │  (is_locked = true)        │ (estado final)
         │  → Write audit log         │
         └─────────────┬──────────────┘
                       │
                    Deprecated (cualquier estado)
                       │
         ┌─────────────▼──────────────┐
         │    DEPRECATED              │
         │  (soft-deleted)            │
         └────────────────────────────┘
```

## Estructura de Archivos — Backend (Nuevos)

```
backend/
├── routers/              (NUEVO)
│   ├── __init__.py
│   ├── sw_releases.py         (SW Releases Router)
│   ├── datasets.py            (Datasets Router)
│   ├── vehicle_sw_ids.py      (Vehicle SW IDs Router)
│   └── traceability.py        (Traceability Router)
│
├── clear_db.py                (Script limpieza BD)
├── seed_test_data.py          (Script seed datos prueba)
├── server.py                  (actualizado: import + include_router)
│
└── ... (archivos existentes)
```

## Estructura de Archivos — Frontend (Nuevos)

```
frontend/
├── src/
│   ├── components/
│   │   ├── NewSwReleaseModal.jsx         (NUEVO)
│   │   ├── NewDatasetModal.jsx           (NUEVO)
│   │   ├── GenerateVehicleSwIdModal.jsx  (NUEVO)
│   │   └── DatasetStateTransitionButton.jsx (NUEVO)
│   │
│   ├── App.jsx                (TODO: integrar componentes)
│   └── ... (archivos existentes)
│
└── ... (archivos existentes)
```

## Próximos Pasos de Integración

1. **En `App.jsx` o componente padre:**
   ```jsx
   import NewSwReleaseModal from './components/NewSwReleaseModal';
   // ... otros imports
   
   export default function App() {
     const [showSwReleaseModal, setShowSwReleaseModal] = useState(false);
     
     return (
       <div>
         <button onClick={() => setShowSwReleaseModal(true)}>
           New SW Release
         </button>
         <NewSwReleaseModal
           isOpen={showSwReleaseModal}
           onClose={() => setShowSwReleaseModal(false)}
           onSuccess={() => {/* refresh list */}}
         />
       </div>
     );
   }
   ```

2. **Crear vistas/pages:**
   - `pages/SWReleases.jsx` → lista + crear
   - `pages/Datasets.jsx` → lista + crear + transiciones
   - `pages/VehicleAssignment.jsx` → generar Vehicle SW IDs
   - `pages/Traceability.jsx` → cadena completa
   - `pages/AuditLog.jsx` → histórico de cambios

3. **Tests pytest:**
   - Crear `tests/test_sw_releases.py`
   - Crear `tests/test_datasets.py`
   - Usar `pytest-asyncio` + motor fixtures

4. **Índices MongoDB:**
   ```javascript
   db.sw_releases.createIndex({ "identifier": 1 }, { unique: true })
   db.sw_releases.createIndex({ "status": 1 })
   db.datasets.createIndex({ "name": 1 }, { unique: true })
   db.datasets.createIndex({ "state": 1 })
   db.datasets.createIndex({ "sw_release_id": 1 })
   db.vehicle_sw_ids.createIndex({ "vehicle_sw_id": 1 }, { unique: true })
   db.vehicle_sw_ids.createIndex({ "dataset_id": 1 })
   ```

---

**Versión del Diagrama**: 1.0  
**Fecha**: 5 de mayo de 2026  
**Estado**: ✅ IMPLEMENTACIÓN COMPLETA (Fases 1-4)
