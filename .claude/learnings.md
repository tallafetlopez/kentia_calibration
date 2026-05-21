# Learnings — kentia_calibration (HERKO Calibration Manager)

## 2026-05-21 — Dominio completo del proyecto

**Contexto**: Análisis de todos los documentos de referencia en calibrationpdfs/

**Dominio**: ECU Calibration Management para motores de camión
- **HERKO** = OEM fabricante de camiones (propietario del proyecto)
- **BeGas** = proveedor del SW del ECM (Engine Control Module)
- Regulación clave: **UNECE R156** — trazabilidad total obligatoria, Excel prohibido en producción
- Referencia de mercado: **AVL CRETA** (herramienta de estado del arte, propietaria)

**Archivos de calibración que maneja el sistema:**
- `.a2l` — ASAP2: definición de labels (nombres, tipos, direcciones memoria, escalado)
- `.s37` — binario: valores reales asignados a labels (fichero master para EOL/producción)
- `.dcm` — INCA engineering tool: sobreescrituras sobre S37 en desarrollo
- `.c` — PiSnoop tool: calibración para flashing en producción
- `.lab` — lista de labels para filtrado en revisiones/DCM
- `DLL` — librería ECM-específica para challenge/response en flashing

**Concepto clave — Label:**
- Label = parámetro de calibración del ECU (ej: `ADMc_C_ComprNormRefTemp`, `ADM_kPa_BoostFB`)
- Atributos: nombre, valor, unidad, descripción, madurez (0/25/75/100% + Deprecated), responsable, tipo
- Tipos: SCALAR, MAP (1D/2D), TABLE
- Responsabilidad: BeGas / HERKO (OEM) / Shared
- Agrupados por WorkPackage y sub-workpackage, sin solapamientos
- Funciones/sistemas: SYS, TRC, BEC, FEC, OBD, EEC, AUX_ELM, etc.

**Estados del Dataset:**
DRAFT → UNDER APPROVAL → (aprobado/rechazado) → RELEASED → DEPRECATED
+ estados derivados: DERIVE-POST-SALES

**Roadmap del proyecto (quick&dirty PDF):**
- Hoy → Q3/26: BIOS35 1.0 → 1 ECU (ECM), gestión nivel Dataset
- Q3/26: BIOS35 1.X → 1 ECU, gestión nivel Label
- Q4/26: BIOS42 → 2 ECUs (VCU1.0 + ECM), nivel Label
- Futuro: n ECUs, proceso final automatizado

**Requisitos funcionales BeGas (BeGas_CB_Management_Tool_Requirements.pdf):**
1. Usuarios y niveles de usuario
3. Label responsable y deputy
4. Clasificar labels por workpackage/subworkpackage (sin solapamiento)
5. Clasificar labels por funciones
6. Warnings al importar .a2l (especificar checks)
7. Warnings al importar .s37
8. Read Only / Lock — descarga revisiones
9. Checks en import DCM: issues y reacción
10. Checks en import DCM: labels flagged (determinar flags)
11. Checks en import DCM: empleado no-responsable (requiere autorización)
12. Comparativa de labels en import DCM (versión antigua vs nueva)
13. Sistema de puntuación para definir madurez del label
14. Descripción asignada a cada revisión/SW/DCM mergeado/importado
15. Warnings durante merge
16. Informar sobre orden de merge
17. Adjuntos asociados a DCMs para justificación
18. Exportar .a2l y .s37 si no bloqueados
19. Exportar .lab file
20. Usar .lab files para filtrar labels en revisiones/DCMs

**Proceso de aprobación (ST-06-PR-304):**
- D.1: Registro nueva SW Release
- D.2: Creación Dataset vinculado a SW Release
- D.3: Gestión a nivel label (parámetros parametrizables)
- D.4: Revisión y aprobación cross-funcional
Roles: PD-Integration & Cal Engineer, PI-Engineering Manager, PD-Project Manager,
PI-Regulatory Compliance Specialist, PD-V&V Engineer, Configuration Manager, DM_Administrator

**Aplicar cuando**: cualquier decisión de feature, modelo de datos o UI en este proyecto
