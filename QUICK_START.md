# HERKO Calibration Manager — QUICK START

## 🚀 5 Minutos para Empezar

### 1. Arrancar Backend
```powershell
cd c:\Trabajo\kentia_calibration\backend
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```
✅ Backend corriendo en `http://localhost:8000`

### 2. Arrancar Frontend
```powershell
cd c:\Trabajo\kentia_calibration\frontend
npm start
```
✅ Frontend en `http://localhost:3000`

### 3. Cargar Datos de Prueba
```powershell
cd c:\Trabajo\kentia_calibration\backend
python seed_test_data.py
```
✅ Datos insertados en MongoDB

### 4. Probar Login
- Email: `admin@herko.dev`
- Password: `password123`

---

## 📋 Guía Rápida de Scripts

### Limpiar Base de Datos
```bash
# Ver qué se eliminará (sin ejecutar)
python clear_db.py --dry-run

# Ejecutar limpieza real (preserva colección users)
python clear_db.py
```

### Cargar Datos de Prueba
```bash
python seed_test_data.py
```
Inserta: 1 SW Release + 1 Dataset + 1 Vehicle SW ID

---

## 🔗 URLs Importantes

| Recurso | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Backend Redoc | http://localhost:8000/redoc |

---

## 📡 Endpoints Principales (v1 API)

### SW Releases
```
POST   /api/v1/sw-releases              # Crear
GET    /api/v1/sw-releases              # Listar
GET    /api/v1/sw-releases/{id}         # Obtener uno
PATCH  /api/v1/sw-releases/{id}/status  # Cambiar estado
DELETE /api/v1/sw-releases/{id}         # Eliminar (soft)
```

### Datasets
```
POST   /api/v1/datasets                 # Crear
GET    /api/v1/datasets                 # Listar
GET    /api/v1/datasets/{id}            # Obtener uno
PATCH  /api/v1/datasets/{id}            # Actualizar
POST   /api/v1/datasets/{id}/transition # Cambiar estado
DELETE /api/v1/datasets/{id}            # Eliminar (soft)
```

### Vehicle SW IDs
```
POST   /api/v1/vehicle-sw-ids/generate  # Generar nuevo
GET    /api/v1/vehicle-sw-ids           # Listar
GET    /api/v1/vehicle-sw-ids/{id}      # Obtener uno
```

### Trazabilidad
```
GET    /api/v1/traceability             # Cadena completa
GET    /api/v1/traceability/audit-logs  # Audit log
```

---

## 🧪 Probar Endpoints con CURL

### 1. Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@herko.dev",
    "password": "password123"
  }'
```
Respuesta:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR...",
  "user": { "id": "...", "email": "admin@herko.dev", ... }
}
```

### 2. Crear SW Release
```bash
TOKEN="tu_token_aqui"

curl -X POST http://localhost:8000/api/v1/sw-releases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "ECM-SW-2025.1",
    "version": "2.0.0",
    "supplier": "Bosch",
    "released_date": "2026-05-05T00:00:00Z",
    "a2l_filename": null
  }'
```

### 3. Listar SW Releases
```bash
curl -X GET http://localhost:8000/api/v1/sw-releases \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Crear Dataset
```bash
curl -X POST http://localhost:8000/api/v1/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DS_Test_Euro6d",
    "sw_release_id": "ObjectId_del_sw_release",
    "context": "PRODUCTION",
    "mode": "IMPORT_S37",
    "author": "admin@herko.dev",
    "derived_from": null
  }'
```

### 5. Cambiar Estado Dataset
```bash
curl -X POST http://localhost:8000/api/v1/datasets/ObjectId/transition \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to_state": "UNDER_APPROVAL"}'
```

### 6. Generar Vehicle SW ID
```bash
curl -X POST http://localhost:8000/api/v1/vehicle-sw-ids/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "ObjectId_del_dataset",
    "vin": null,
    "variant": null,
    "mfg_order_ref": "MO-TEST-001",
    "service_case_ref": null
  }'
```

### 7. Ver Trazabilidad Completa
```bash
curl -X GET http://localhost:8000/api/v1/traceability \
  -H "Authorization: Bearer $TOKEN"
```

### 8. Ver Audit Log
```bash
curl -X GET http://localhost:8000/api/v1/traceability/audit-logs?limit=10 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🐛 Troubleshooting

### Error: "Port 8000 already in use"
```powershell
# Matar proceso Python que ocupa el puerto
taskkill /F /IM python.exe

# Luego reintentar
python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

### Error: "MongoDB connection refused"
```powershell
# Verificar que MongoDB está corriendo
mongosh  # Si funciona, MongoDB está activo

# Si no funciona, instalar/iniciar MongoDB
# https://www.mongodb.com/try/download/community
```

### Error: "JWT token invalid"
```
→ Asegúrate de incluir Authorization: Bearer TOKEN en headers
→ El token debe estar en formato correcto (sin "Bearer " duplicado)
```

### Error: "Dataset must be in RELEASE_CANDIDATE or RELEASED state"
```
→ El dataset para generar Vehicle SW ID debe estar en uno de esos estados
→ Usa POST /api/v1/datasets/{id}/transition para cambiar estado primero
```

---

## 📁 Archivos Principales Nuevos

| Archivo | Ubicación | Descripción |
|---------|-----------|-------------|
| `sw_releases.py` | backend/routers | Router SW Releases |
| `datasets.py` | backend/routers | Router Datasets |
| `vehicle_sw_ids.py` | backend/routers | Router Vehicle SW IDs |
| `traceability.py` | backend/routers | Router Trazabilidad |
| `clear_db.py` | backend | Script limpieza BD |
| `seed_test_data.py` | backend | Script datos prueba |
| `NewSwReleaseModal.jsx` | frontend/src/components | Modal crear SW Release |
| `NewDatasetModal.jsx` | frontend/src/components | Modal crear Dataset |
| `GenerateVehicleSwIdModal.jsx` | frontend/src/components | Modal generar Vehicle SW ID |
| `DatasetStateTransitionButton.jsx` | frontend/src/components | Botón transiciones |
| `IMPLEMENTATION_GUIDE.md` | raíz | Guía detallada |
| `ARCHITECTURE_DIAGRAM.md` | raíz | Diagrama arquitectura |
| `QUICK_START.md` | raíz | Este archivo |

---

## ✅ Checklist de Verificación

- [ ] Backend corriendo en localhost:8000
- [ ] Frontend corriendo en localhost:3000
- [ ] MongoDB conectado
- [ ] Datos de prueba cargados (`python seed_test_data.py`)
- [ ] Login funciona con admin@herko.dev / password123
- [ ] GET /api/v1/sw-releases devuelve datos
- [ ] Puedo crear un nuevo SW Release desde API
- [ ] Componentes React compilados sin errores
- [ ] Endpoints requieren JWT (401 sin token)

---

## 🎯 Próximas Tareas

1. **Integrar componentes** en App.jsx
2. **Crear páginas** para cada funcionalidad
3. **Implementar tests** con pytest
4. **Optimizar índices** en MongoDB
5. **Agregar permisos** por rol

Para más detalles, consulta `IMPLEMENTATION_GUIDE.md` y `ARCHITECTURE_DIAGRAM.md`

---

**Creado**: 5 de mayo de 2026  
**Estado**: ✅ LISTO PARA USAR
