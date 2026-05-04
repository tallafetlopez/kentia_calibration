# HERKO Calibration Manager

Herramienta de gestión de configuración ECM (ECU Calibration Management) para el ciclo de vida completo de releases de software embebido: desde la importación de ficheros A2L hasta la aprobación regulatoria, trazabilidad y asignación a vehículos.

---

## Descripción del proyecto

**HERKO Calibration Manager** es una aplicación web full-stack que gestiona:

- **Software Releases** — registro de versiones de software de ECU con referencias a ficheros A2L, DBC y DTC.
- **Datasets de calibración** — conjunto de etiquetas (labels) asociadas a cada release, con ciclo de vida completo (EDIT → UNDER_APPROVAL → APPROVED → RELEASE_CANDIDATE → RELEASED → DEPRECATED).
- **Labels / Parámetros A2L** — gestión individual de parámetros de calibración con niveles de confianza (EMPTY, CALIBRATED, VALIDATED, DOCUMENTED).
- **Review Center** — flujo de aprobación con roles diferenciados.
- **Release Center** — promoción de datasets a candidatos de release y publicación.
- **Vehicle Assignment** — asignación de software publicado a VINs específicos.
- **Traceability** — trazabilidad completa de cambios con audit log.
- **Admin Panel** — gestión de usuarios y roles.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + Python 3.11 |
| Base de datos | MongoDB (Motor async) |
| Autenticación | JWT (PyJWT + bcrypt) |
| Frontend | React 18 + React Router v7 |
| UI Components | Radix UI + Tailwind CSS + shadcn/ui |
| HTTP Client | Axios |
| Formularios | React Hook Form + Zod |
| Build tool | CRACO (Create React App) |

---

## Estructura del proyecto

```
kentia_calibration/
├── backend/
│   ├── .env               # Variables de entorno (ver abajo)
│   ├── server.py          # API FastAPI principal (~950 endpoints)
│   ├── models.py          # Modelos Pydantic y tipos
│   ├── auth_utils.py      # JWT, bcrypt, extracción de token
│   ├── seed.py            # Datos demo (usuarios, releases, datasets, labels)
│   ├── check_db.py        # Diagnóstico de conexión a MongoDB
│   ├── requirements.txt   # Dependencias Python
│   └── tests/
│       └── test_herko_api.py
├── frontend/
│   ├── .env               # Variables de entorno React (ver abajo)
│   ├── package.json       # Dependencias Node
│   ├── src/
│   │   ├── App.js
│   │   ├── lib/
│   │   │   ├── api.js     # Cliente Axios con interceptor de token
│   │   │   ├── auth.jsx   # Contexto de autenticación
│   │   │   └── constants.jsx
│   │   ├── pages/         # Todas las páginas de la app
│   │   └── components/    # Componentes reutilizables + shadcn/ui
│   └── public/
├── visualization/         # Módulo de visualización 3D (heatmaps)
├── memory/
│   └── PRD.md
└── README.md
```

---

## Requisitos previos

- **Python 3.11+**
- **Node.js 18+** y **npm**
- **MongoDB** corriendo en `localhost:27017` (base de datos: `calibrationdb`)

---

## Configuración de variables de entorno

### Backend — `backend/.env`

```env
MONGO_URL=mongodb://localhost:27017/
DB_NAME=calibrationdb
JWT_SECRET=supersecretkey123_herko_calibration_2026
CORS_ORIGINS=http://localhost:3000
```

### Frontend — `frontend/.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

> **IMPORTANTE:** Ambos archivos `.env` deben existir antes de arrancar. Si no existen, créalos con el contenido indicado arriba.

---

## Arranque del proyecto (paso a paso)

### 1. Instalar dependencias Python

```bash
pip install -r backend/requirements.txt
```

### 2. Instalar dependencias Node

```bash
npm install --prefix frontend
```

### 3. Arrancar el backend (desde el directorio `backend/`)

```bash
cd backend
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

> El backend debe ejecutarse **desde dentro del directorio `backend/`** para que los imports relativos (`models`, `auth_utils`, `seed`) funcionen correctamente.

### 4. Arrancar el frontend (desde la raíz del proyecto)

```bash
cd ..   # volver a la raíz si estabas en backend/
npm start --prefix frontend
```

El frontend quedará disponible en: **http://localhost:3000**  
El backend quedará disponible en: **http://localhost:8000**  
La documentación interactiva de la API en: **http://localhost:8000/docs**

---

## Cuentas demo

Contraseña para todas las cuentas: **`password123`**

| Email | Rol |
|---|---|
| `admin@herko.dev` | Todos los roles |
| `pm@herko.dev` | PD_Project_Manager |
| `cal@herko.dev` | Calibration_Engineer |
| `eng@herko.dev` | PI_Engineering_Manager |
| `reg@herko.dev` | PI_Regulatory_Compliance_Specialist |
| `vnv@herko.dev` | PD_Verification_Validation_Engineer |
| `cfg@herko.dev` | Configuration_Manager |
| `dma@herko.dev` | DM_Administrator |
| `ps@herko.dev` | Post_Sales_Engineer |

---

## Roles y permisos

| Rol | Permisos principales |
|---|---|
| PD_Project_Manager | Crear/editar releases, promover datasets, gestión completa |
| Calibration_Engineer | Editar labels, calibrar parámetros |
| PI_Engineering_Manager | Aprobar releases |
| PI_Regulatory_Compliance_Specialist | Revisión regulatoria |
| PD_Verification_Validation_Engineer | Validación y V&V |
| Configuration_Manager | Gestión de configuración |
| DM_Administrator | Administración de usuarios y sistema |
| Post_Sales_Engineer | Asignación post-venta a vehículos |

---

## Ciclo de vida de un Dataset

```
EDIT → UNDER_APPROVAL → APPROVED → RELEASE_CANDIDATE → RELEASED → DEPRECATED
```

---

## Correcciones aplicadas (sesión 03/05/2026)

Durante la revisión completa del proyecto se detectaron y corrigieron los siguientes problemas:

| # | Problema | Archivo afectado | Solución |
|---|---|---|---|
| 1 | Archivo `backend/.env` no existía | `backend/.env` | Creado con `MONGO_URL`, `DB_NAME`, `JWT_SECRET` y `CORS_ORIGINS` |
| 2 | `check_db.py` usaba ruta relativa para `.env` | `backend/check_db.py` | Cambiado a ruta absoluta con `Path(__file__).parent` |
| 3 | Advertencia deprecada `baseUrl` en jsconfig | `frontend/jsconfig.json` | Agregado `"ignoreDeprecations": "6.0"` |
| 4 | Conflicto de dependencias: `date-fns` v4 incompatible con `react-day-picker` | `frontend/package.json` | Bajado `date-fns` a `^3.6.0` |
| 5 | Conflicto: `react` v19 incompatible con `react-day-picker` y otros | `frontend/package.json` | Bajado `react` y `react-dom` a `^18.3.1` |
| 6 | `package.json` corrompido tras edición (entradas en `browserslist`) | `frontend/package.json` | Limpiado y restaurado el bloque `browserslist` |
| 7 | Archivo `frontend/.env` no existía | `frontend/.env` | Creado con `REACT_APP_BACKEND_URL=http://localhost:8000` |
| 8 | Backend no arrancaba: `ModuleNotFoundError: No module named 'models'` | `backend/server.py` | Se debe ejecutar desde `cd backend/` para que los imports relativos funcionen |
| 9 | CORS duplicado en el servidor | `backend/server.py` | Eliminado el middleware duplicado |
| 10 | `allow_origins=["*"]` con `allow_credentials=True` bloqueado por el navegador | `backend/server.py` | Cambiado a `CORS_ORIGINS=http://localhost:3000` desde variable de entorno |
| 11 | `JWT_SECRET` demasiado corta (< 32 bytes) generaba advertencia de seguridad | `backend/.env` | Ampliada a más de 32 bytes |
| 12 | `useEffect` con dependencia `load` faltante en 3 páginas (advertencia ESLint) | `DatasetDetailPage.jsx`, `SoftwareReleaseDetailPage.jsx`, `SoftwareReleasesPage.jsx` | Corregido con `useCallback` |

---

## Solución de incompatibilidad numpy/scipy

Si al arrancar el backend ves un error como:

```
ValueError: numpy.dtype size changed, may indicate binary incompatibility. Expected 96 from C header, got 88 from PyObject
```

O bien advertencias sobre versiones de numpy y scipy, ejecuta lo siguiente en tu entorno virtual:

```bash
pip uninstall -y numpy scipy
pip install "numpy>=1.21.6,<1.28.0" scipy --force-reinstall
```

Esto instalará versiones compatibles y el backend arrancará correctamente.

---

## Comandos útiles

```bash
# Verificar conexión a la base de datos y ejecutar seed si está vacía
cd backend
python check_db.py

# Ver logs del backend en tiempo real
cd backend
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Construir el frontend para producción
npm run build --prefix frontend

# Ejecutar tests del backend
cd backend
python -m pytest tests/ -v
```

---

## API principal (endpoints)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Autenticación, devuelve JWT |
| POST | `/api/auth/register` | Registro de usuario |
| GET | `/api/auth/me` | Usuario autenticado actual |
| POST | `/api/auth/switch-role` | Cambiar rol activo |
| GET/POST | `/api/software-releases` | Listar / crear releases |
| GET/PATCH | `/api/software-releases/{id}` | Detalle / editar release |
| GET/POST | `/api/datasets` | Listar / crear datasets |
| GET | `/api/datasets/{id}` | Detalle de dataset con labels |
| PATCH | `/api/datasets/{id}/labels/{lid}` | Actualizar label individual |
| POST | `/api/datasets/{id}/submit` | Enviar a revisión |
| POST | `/api/datasets/{id}/approve` | Aprobar dataset |
| POST | `/api/datasets/{id}/release` | Promover a release |
| GET | `/api/reviews` | Listado de reviews pendientes |
| POST | `/api/reviews/{id}` | Actualizar review |
| GET/POST | `/api/vehicle-sw-ids` | Gestión de asignaciones a vehículos |
| GET | `/api/audit-log` | Log de auditoría completo |
| GET | `/api/users` | Listado de usuarios (admin) |
| POST | `/api/seed` | Reseed de datos demo |

