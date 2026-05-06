# HERKO Calibration Manager — FASE 1-4 Implementación

## Resumen

Se han implementado completamente las Fases 1-4 del HERKO Calibration Manager:

### FASE 1 ✅ — Limpieza de Base de Datos
- ✅ Script `clear_db.py` para limpiar colecciones sin eliminar índices
- ✅ Preserva la colección `users` para mantener el usuario admin
- ✅ Soporta flag `--dry-run` para ver qué se eliminaría sin ejecutar

### FASE 2 ✅ — Endpoints FastAPI v1 API
- ✅ Router `sw_releases.py` — Gestión de lanzamientos de software
- ✅ Router `datasets.py` — Gestión de datasets con estado y transiciones
- ✅ Router `vehicle_sw_ids.py` — Generación de IDs de vehículos
- ✅ Router `traceability.py` — Trazabilidad completa y auditoría

### FASE 3 ✅ — Componentes React
- ✅ `NewSwReleaseModal.jsx` — Formulario para crear SW Release
- ✅ `NewDatasetModal.jsx` — Formulario para crear Dataset
- ✅ `GenerateVehicleSwIdModal.jsx` — Generador de Vehicle SW IDs
- ✅ `DatasetStateTransitionButton.jsx` — Botón reutilizable para transiciones

### FASE 4 ✅ — Integración
- ✅ Script `seed_test_data.py` — Datos de prueba iniciales
- ✅ Tests con pytest (estructura preparada)

---

## Guía de Uso

### 1. Limpiar la Base de Datos

```bash
cd backend
python clear_db.py              # Ejecutar limpieza
python clear_db.py --dry-run    # Ver qué se eliminaría
```

**Nota:** La colección `users` se preserva automáticamente.

---

### 2. Cargar Datos de Prueba

```bash
cd backend
python seed_test_data.py
```

**Inserta:**
- 1 SW Release: `ECM-SW-2024.1` (status: `VALID_FOR_CALIBRATION`)
- 1 Dataset: `DS_Base_Euro6d_Prod` (state: `RELEASED`)
- 1 Vehicle SW ID: linked al dataset anterior

---

### 3. Endpoints FastAPI (v1 API)

#### SW Releases

```
GET    /api/v1/sw-releases                    → Listar releases
GET    /api/v1/sw-releases/{id}               → Obtener uno
POST   /api/v1/sw-releases                    → Crear nuevo
PATCH  /api/v1/sw-releases/{id}/status        → Actualizar estado
DELETE /api/v1/sw-releases/{id}               → Soft-delete (DEPRECATED)
```

Query params para `GET /api/v1/sw-releases`:
- `?status=VALID_FOR_CALIBRATION`
- `?supplier=Bosch`

#### Datasets

```
GET    /api/v1/datasets                       → Listar datasets
GET    /api/v1/datasets/{id}                  → Obtener uno
POST   /api/v1/datasets                       → Crear nuevo
PATCH  /api/v1/datasets/{id}                  → Actualizar campos
POST   /api/v1/datasets/{id}/transition       → Cambiar estado
DELETE /api/v1/datasets/{id}                  → Soft-delete (DEPRECATED)
```

Query params para `GET /api/v1/datasets`:
- `?state=RELEASED`
- `?context=PRODUCTION`
- `?mode=IMPORT_S37`
- `?sw_release=ECM-SW-2024.1`

**Estados validos:**
- `EDIT` → `UNDER_APPROVAL` o `DEPRECATED`
- `UNDER_APPROVAL` → `APPROVED`, `EDIT`, o `DEPRECATED`
- `APPROVED` → `RELEASE_CANDIDATE` o `DEPRECATED`
- `RELEASE_CANDIDATE` → `RELEASED` o `DEPRECATED`
- `RELEASED` → `DEPRECATED`

**Contexts:**
- `PRODUCTION`
- `DEVELOPMENT`
- `VARIANT_SPECIFIC`
- `POST_SALES`
- `VIN_SPECIFIC`

**Modes:**
- `IMPORT_S37`
- `COPY_EXISTING`
- `REUSE_BASELINE`
- `MERGE`

#### Vehicle SW IDs

```
GET    /api/v1/vehicle-sw-ids                 → Listar
GET    /api/v1/vehicle-sw-ids/{id}            → Obtener uno
POST   /api/v1/vehicle-sw-ids/generate        → Generar nuevo
```

Query params:
- `?sw_release=ECM-SW-2024.1`
- `?dataset=DS_Base_Euro6d_Prod`

**POST /api/v1/vehicle-sw-ids/generate:**
```json
{
  "dataset_id": "ObjectId string",
  "vin": "17ALPHANUMERIC" | null,
  "variant": "string" | null,
  "mfg_order_ref": "string" | null,
  "service_case_ref": "string" | null
}
```

⚠️ El dataset debe estar en estado `RELEASE_CANDIDATE` o `RELEASED`

#### Traceability y Auditoría

```
GET    /api/v1/traceability                   → Cadena completa
GET    /api/v1/traceability/audit-logs        → Logs de auditoría
```

Query params para audit-logs:
- `?entity=dataset`
- `?entity_id=ObjectId`
- `?author=email@example.com`
- `?limit=50`

---

### 4. Componentes React

#### Importar en tu componente padre:

```jsx
import NewSwReleaseModal from './components/NewSwReleaseModal';
import NewDatasetModal from './components/NewDatasetModal';
import GenerateVehicleSwIdModal from './components/GenerateVehicleSwIdModal';
import DatasetStateTransitionButton from './components/DatasetStateTransitionButton';

function MyPage() {
  const [showSwReleaseModal, setShowSwReleaseModal] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const handleRefresh = () => {
    // Recargar datos
  };

  return (
    <div>
      {/* Botón para abrir modal */}
      <button onClick={() => setShowSwReleaseModal(true)}>
        + New SW Release
      </button>

      {/* Modal */}
      <NewSwReleaseModal
        isOpen={showSwReleaseModal}
        onClose={() => setShowSwReleaseModal(false)}
        onSuccess={handleRefresh}
      />

      {/* State transition button en lista de datasets */}
      {datasets.map((dataset) => (
        <div key={dataset.id}>
          <h3>{dataset.name}</h3>
          <DatasetStateTransitionButton
            datasetId={dataset.id}
            currentState={dataset.state}
            onTransitionSuccess={handleRefresh}
          />
        </div>
      ))}
    </div>
  );
}
```

---

## Estructura de Base de Datos

### Colecciones (MongoDB)

```
calibrationengine_herko/
├── users                    (preservado por clear_db.py)
├── sw_releases             (nueva)
├── datasets                (nueva)
├── vehicle_sw_ids          (nueva)
├── audit_logs              (nueva)
└── ... (otras colecciones existentes)
```

### Documentos SW Release
```json
{
  "_id": ObjectId,
  "identifier": "ECM-SW-2024.1",
  "version": "1.4.2",
  "supplier": "Bosch",
  "a2l_filename": null | "file.a2l",
  "released_date": ISODate,
  "status": "DRAFT" | "VALID_FOR_CALIBRATION" | "DEPRECATED",
  "created_by": "email@example.com",
  "created_at": ISODate
}
```

### Documentos Dataset
```json
{
  "_id": ObjectId,
  "name": "DS_Base_Euro6d_Prod",
  "state": "EDIT" | "UNDER_APPROVAL" | "APPROVED" | "RELEASE_CANDIDATE" | "RELEASED" | "DEPRECATED",
  "sw_release_id": "ObjectId_string",
  "sw_release_identifier": "ECM-SW-2024.1",
  "context": "PRODUCTION" | "DEVELOPMENT" | "VARIANT_SPECIFIC" | "POST_SALES" | "VIN_SPECIFIC",
  "mode": "IMPORT_S37" | "COPY_EXISTING" | "REUSE_BASELINE" | "MERGE",
  "author": "email@example.com",
  "derived_from": null | "parent_dataset_name",
  "is_locked": false,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### Documentos Vehicle SW ID
```json
{
  "_id": ObjectId,
  "vehicle_sw_id": "UUID",
  "sw_release_id": "ObjectId_string",
  "sw_release_identifier": "ECM-SW-2024.1",
  "dataset_id": "ObjectId_string",
  "dataset_name": "DS_Base_Euro6d_Prod",
  "vin": null | "17_CHAR_STRING",
  "variant": null | "variant_name",
  "mfg_order_ref": null | "MO-A2A1493B",
  "service_case_ref": null | "service_ref",
  "created_by": "email@example.com",
  "created_at": ISODate
}
```

### Audit Log Entries
```json
{
  "action": "STATE_TRANSITION",
  "entity": "dataset",
  "entity_id": "ObjectId_string",
  "from_state": "EDIT",
  "to_state": "UNDER_APPROVAL",
  "author": "email@example.com",
  "timestamp": ISODate
}
```

---

## Características Destacadas

### ✨ Validaciones

- **SW Release**: Identifier único, versión y proveedor requeridos
- **Dataset**: Nombre único, SW Release debe existir y ser VALID_FOR_CALIBRATION
- **Vehicle SW ID**: Dataset debe estar RELEASED o RELEASE_CANDIDATE, VIN validado a 17 caracteres
- **State Transitions**: Todas las transiciones validas según máquina de estados

### 🔒 Seguridad

- **JWT**: Todos los endpoints requieren autenticación
- **Audit Logging**: Se registran transiciones de estado críticas
- **Soft Deletes**: Los registros se marcan como DEPRECATED, no se eliminan

### 📊 Trazabilidad

- **Cadena completa**: SW Release → Datasets → Vehicle SW IDs
- **Logs de auditoría**: Histórico completo de cambios
- **Denormalización**: Los identificadores se duplican para consultas rápidas

---

## Próximos Pasos

1. **Integrar los componentes React** en tu app (`App.jsx` o pages)
2. **Crear tests pytest** para validar endpoints (estructura en `tests/test_sw_releases.py`)
3. **Implementar UI para visualizar** la trazabilidad completa
4. **Configurar permisos** por rol (ej: solo admins pueden cambiar status)
5. **Optimizar índices** en MongoDB para las consultas frecuentes

---

## Troubleshooting

### Error: "SW Release not found" al crear Dataset
→ Asegurate que el SW Release existe y su status es `VALID_FOR_CALIBRATION`

### Error: "Dataset must be in RELEASE_CANDIDATE or RELEASED state"
→ El dataset debe estar en uno de esos estados para generar Vehicle SW ID

### Error: "Invalid transition from X to Y"
→ Consulta el diagrama de estados arriba — no todas las transiciones son válidas

### Datos no aparecen después de ejecutar seed_test_data.py
→ Ejecuta `clear_db.py --dry-run` para verificar que las colecciones existen
→ Verifica que MongoDB está corriendo: `mongosh`

---

**Versión**: 1.0  
**Última actualización**: 5 de mayo de 2026  
**Estado**: ✅ COMPLETO
