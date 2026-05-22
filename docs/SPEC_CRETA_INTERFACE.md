# SPEC: Interfaz de calibración estilo CRETA
**Versión**: 2.0  
**Proyecto**: HERKO Calibration Manager  
**Referencia**: AVL CRETA (Label Viewer)  
**Alcance**: A2L + DCM parsing, tabla principal, visualización de parámetros, plan de maduración

---

## 1. Visión general del sistema

Cuando el usuario carga un **archivo A2L** y un **archivo DCM**, el sistema debe:

1. Parsear el A2L → extraer definiciones completas de cada label (nombre, tipo, unidades, límites, ejes, función, ruta, long identifier).
2. Parsear el DCM → extraer valores actuales de cada label (scalars, curves, maps).
3. Sincronizar: unir A2L + DCM por nombre de label.
4. Mostrar tabla principal estilo CRETA con todos los metadatos.
5. Al seleccionar una fila → mostrar panel derecho con gráfica + metadatos completos.
6. Soportar plan de maduración por label.

### Archivos de referencia usados en este proyecto
- A2L: definición de labels del ECM BIOS35 (BeGas / HERKO)
- DCM: `HKSW_0A_03_102_00_1D_120KMH_251120.DCM`
  - 1634 scalars, 65 curves, 72 maps

---

## 2. Parsing de archivos

### 2.1 Parser A2L

El A2L sigue el estándar ASAP2. Cada label (`/begin MEASUREMENT` o `/begin CHARACTERISTIC`) tiene:

```
/begin CHARACTERISTIC <name>
  "<long_identifier>"
  <type>            /* VALUE | CURVE | MAP | TABLE */
  <address>         /* hex address */
  <deposit>
  <lower_limit>
  <upper_limit>
  /begin AXIS_DESCR ...   /* para CURVE y MAP */
  /begin FUNCTION_LIST ... /* función asociada */
/end CHARACTERISTIC
```

**Campos a extraer por label**:

| Campo A2L          | Descripción                         | Ejemplo                          |
|--------------------|-------------------------------------|----------------------------------|
| `name`             | Nombre único del label              | `ADMc_kPa_BoostPressTrgt`        |
| `long_identifier`  | Descripción larga                   | `"Boost pressure target"`        |
| `type`             | Tipo de parámetro                   | `VALUE`, `CURVE`, `MAP`          |
| `lower_limit`      | Límite mínimo                       | `-1000.0`                        |
| `upper_limit`      | Límite máximo                       | `1000.0`                         |
| `unit`             | Unidad de medida                    | `kPa`, `deg`, `rpm`, `–`         |
| `x_axis`           | Eje X (para CURVE y MAP)            | array de valores                 |
| `x_unit`           | Unidad eje X                        | `[RPM]`                          |
| `y_axis`           | Eje Y (solo MAP)                    | array de valores                 |
| `y_unit`           | Unidad eje Y                        | `[ms]`                           |
| `function`         | Función ECU a la que pertenece      | `SYS`, `TRC`, `EEC`, `OBD`...    |
| `function_version` | Versión de la función               | `1.0`, `2.3`                     |
| `address`          | Dirección en memoria del ECU        | `0x20004E00`                     |
| `deposit`          | Offset del registro                 | `DIRECT`                         |

**Tipos de labels**:
- `VALUE` → scalar: un solo número
- `CURVE` → curva 1D: array de pares (x, y)
- `MAP` → mapa 2D: matriz z[rows][cols] con ejes x e y
- `TABLE` → tabla de lookup (tratado como MAP)

### 2.2 Parser DCM

El DCM (Data Control Map) es un fichero de texto con secciones por tipo:

```
FUNCTIONS
  <function_name> "<version>" ""
END

PARAMETERS             /* scalars */
  WERT <name>
    <value>
  END

KENNLINIE              /* curves */
  WERT <name> <n_points>
    ST/X <x1> <x2> ... <xn>
    WERT <y1> <y2> ... <yn>
  END

KENNFELD               /* maps */
  WERT <name> <n_cols> <n_rows>
    ST/X <x1> ... <xn>
    ST/Y <y1> ... <ym>
    WERT <z_row_1_1> ... <z_row_1_n>
    WERT <z_row_2_1> ... <z_row_2_n>
    ...
  END
```

**Campos a extraer**:

| Campo DCM   | Descripción              |
|-------------|--------------------------|
| `name`      | Nombre del label         |
| `value`     | Valor (scalar)           |
| `x_values`  | Eje X (curve / map)      |
| `y_values`  | Eje Y (map)              |
| `z_matrix`  | Valores Z (map)          |
| `y_values`  | Valores Y (curve)        |

### 2.3 Sincronización A2L + DCM

Tras parsear ambos archivos, merge por `name`:

```python
label = {
  # Del A2L
  "name": a2l.name,
  "long_identifier": a2l.long_identifier,
  "type": a2l.type,          # scalar | curve | map
  "unit": a2l.unit,
  "unit_x": a2l.x_unit,
  "unit_y": a2l.y_unit,
  "lower_limit": a2l.lower_limit,
  "upper_limit": a2l.upper_limit,
  "function": a2l.function,
  "function_version": a2l.function_version,
  "address": a2l.address,
  "x_axis_a2l": a2l.x_axis,   # referencia del A2L
  "y_axis_a2l": a2l.y_axis,
  
  # Del DCM (valores reales)
  "value": dcm.value,          # scalar
  "x_axis": dcm.x_values,      # eje X real del DCM
  "y_axis": dcm.y_values,      # eje Y real del DCM
  "values": dcm.z_matrix,      # valores Z o Y reales
  
  # Calculados
  "in_a2l": True,
  "in_dcm": True,
  "out_of_range": value < lower_limit or value > upper_limit,
}
```

**Casos especiales**:
- Label en A2L pero no en DCM → `in_dcm: False`, value = null
- Label en DCM pero no en A2L → `in_a2l: False`, metadatos vacíos
- Valor fuera de límites → flag `out_of_range: True`

---

## 3. Tabla principal (estilo CRETA)

### 3.1 Columnas exactas (orden igual que CRETA)

| # | Columna            | Fuente         | Tipo       | Descripción                                         |
|---|--------------------|----------------|------------|-----------------------------------------------------|
| 1 | **Typ**            | A2L + DCM      | Icono      | Tipo de label: S (scalar), C (curve), M (map)       |
| 2 | **Name**           | A2L            | Texto mono | Nombre del label, clickable para abrir detalle      |
| 3 | **Save**           | Sistema        | Checkbox   | Si el valor ha sido guardado/locked                 |
| 4 | **System Status**  | Sistema        | Badge      | DOC_OK, MERGER_HEAD, WARNING, ERROR                 |
| 5 | **Scor**           | Maduración     | Número     | Score de maduración 0–100                           |
| 6 | **Value or Dim**   | DCM            | Texto mono | Valor actual o dimensión [NxM] para curves/maps     |
| 7 | **Value or Dim Old** | Histórico    | Texto mono | Valor anterior (última versión)                     |
| 8 | **Label Flags**    | Sistema        | Icono      | Flags especiales (AZL, bloqueado, etc.)             |
| 9 | **Owner**          | Metadatos      | Texto      | Propietario del label (BeGas / HERKO / Shared)      |
|10 | **Deputy**         | Metadatos      | Texto      | Deputy owner                                        |
|11 | **Function**       | A2L            | Texto      | Función ECU: SYS, TRC, EEC, OBD, BEC, FEC, AUX_ELM |
|12 | **Function Version** | A2L          | Texto      | Versión de la función                               |
|13 | **User Status**    | WorkPackage    | Badge      | START, IN_PROGRESS, DONE, APPROVED                  |
|14 | **Comment**        | Usuario        | Texto      | Comentario libre editable                           |

### 3.2 Comportamiento de la tabla

**Altura de fila**: 24–26px (compacta, estilo Excel)  
**Font**: Consolas/Courier New para Name y valores  
**Alternado**: filas pares bg-white, filas impares bg-gray-50  
**Selección**: fila seleccionada → bg-blue-50 + borde izquierdo azul 2px  
**Scroll**: vertical infinito, header sticky  
**Ordenación**: clic en cabecera ordena por esa columna  
**Filtrado**: búsqueda por Name, LongIdentifier, Function, Owner

### 3.3 Icono de tipo (columna Typ)

```
S  → cuadrado gris pequeño    → SCALAR
~  → icono onda               → CURVE
■■ → icono cuadrícula         → MAP
```

Colores de badge:
- SCALAR: `bg-gray-100 text-gray-600`
- CURVE: `bg-blue-50 text-blue-700`
- MAP: `bg-violet-50 text-violet-700`

### 3.4 Columna Value or Dim

- **Scalar**: muestra el valor numérico con 5 decimales. Ejemplo: `0.50000`
- **Curve**: muestra dimensión como `[8d]` (8 puntos)
- **Map**: muestra dimensión como `[16x16]` (16 filas × 16 columnas)
- Si fuera de rango → texto en rojo + icono warning

### 3.5 System Status badges

| Estado       | Color           | Descripción                                      |
|--------------|-----------------|--------------------------------------------------|
| `DOC_OK`     | verde           | Documentado y aprobado                           |
| `MERGER_HEAD`| naranja         | Pendiente de merge                               |
| `WARNING`    | amarillo        | Hay un aviso no crítico                          |
| `ERROR`      | rojo            | Error crítico (valor inválido, fuera de límites) |
| `LOCKED`     | gris oscuro     | Label bloqueado (read-only)                      |
| `MODIFIED`   | azul            | Modificado en sesión actual                      |

### 3.6 Paginación

- 80–100 filas por página
- Controles: `← Prev` / `Next →`
- Contador: `1–80 / 1771`

---

## 4. Panel derecho: detalle de parámetro

Al hacer clic en cualquier fila, se abre un panel lateral (derecha, ancho fijo 600px).  
**No es un modal** — el panel se queda visible mientras el usuario sigue navegando la tabla.

### 4.1 Estructura del panel

```
┌─────────────────────────────────────────────────┐
│ HEADER: [Tipo badge] NombreLabel          [×]   │
│ LongIdentifier                                  │
│ Unit: kPa · Min: -1000 · Max: 1000              │
│ Function: EEC  · Address: 0x20004E00            │
├─────────────────────────────────────────────────┤
│ TABS: [ Chart ] [ Data ] [ Maturity ] [ Info ]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  (contenido según tab activo)                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.2 Tab: Chart

**Para scalars**:
- Gauge o barra de progreso mostrando valor actual vs límites min/max
- Valor actual grande en centro
- Línea roja en lower_limit, línea roja en upper_limit

**Para curves (CURVE)**:
- SVG chart 2D: eje X = x_axis (unidad: unit_x), eje Y = values (unidad: unit_w)
- Grid lines horizontales y verticales
- Línea azul con puntos en cada dato
- Etiquetas de escala en ambos ejes (6–8 ticks)
- Etiqueta de unidad en ambos ejes
- Dimensiones: ancho panel × 260px alto

**Para maps (MAP)**:
- Toggle: `Heatmap` | `3D Surface`
- **Heatmap**: matriz de celdas coloreadas por valor Z
  - Eje X abajo (unit_x), Eje Y izquierda (unit_y)
  - Leyenda de color vertical derecha (unit_w)
  - Ticks con valores reales
- **3D Surface**: proyección isométrica del mapa
  - Wireframe + relleno de color interpolado (misma paleta)
  - Ejes etiquetados

**Paleta de colores para mapas**:
```
bajo  → #14445 (teal oscuro)
25%   → #238688 (teal medio)
50%   → #78C679 (verde lima)
75%   → #F9C84E (ámbar)
alto  → #EE6955 (coral)
```

### 4.3 Tab: Data

**Para scalars**:
```
Valor actual: 0.50000  kPa
Valor anterior: 0.00000  kPa
Δ cambio: +0.50000  (+∞%)
```

**Para curves**:
Tabla de 2 columnas: X | Y

```
  X [RPM]  |  Y [–]
  ---------|--------
  1000     |  0.800
  1500     |  0.825
  2000     |  0.850
  ...
```

**Para maps**:
Tabla con eje Y en filas, eje X en columnas, valores Z en celdas.  
Celdas coloreadas con misma paleta del heatmap.

### 4.4 Tab: Maturity (Plan de maduración)

Cada label tiene un maturity plan con 4 hitos:

| Hito  | % Score | Criterio                                        |
|-------|---------|-------------------------------------------------|
| 25%   | 25      | Valores iniciales documentados                  |
| 50%   | 50      | Revisado por deputy owner                       |
| 75%   | 75      | Aprobado por Engineering Manager                |
| 100%  | 100     | Released y bloqueado para producción            |

**Visualización**:
```
25%  [●──────────────] DOC_OK     → 2026-03-15
50%  [●──────────────] APPROVED   → 2026-04-02
75%  [○──────────────] PENDING    → –
100% [○──────────────] –          → –

Score actual: 50 / 100
```

**Indicadores visuales**:
- Completado: círculo verde relleno
- Pendiente: círculo gris vacío
- Barra de progreso horizontal 0–100%

### 4.5 Tab: Info

Metadatos completos del label:

```
Name:             ADMc_kPa_BoostPressTrgt
Long Identifier:  Boost pressure target
Type:             MAP (16×16)
Unit (Z):         kPa
Unit (X):         RPM
Unit (Y):         ms
Lower Limit:      -1000.0
Upper Limit:       1000.0
Address:          0x20004E00
Function:         EEC
Function Version: 1.2
Owner:            HERKO
Deputy:           BeGas
In A2L:           ✓
In DCM:           ✓
Out of Range:     No
Last Modified:    2026-05-21 14:32
```

---

## 5. Barra de filtros (encima de la tabla)

```
[ Buscar: nombre / descripción... ] [ Función: ALL ▾ ] [ Tipo: ALL ▾ ] [ Owner: ALL ▾ ] [ Status: ALL ▾ ]
```

**Filtros disponibles**:

| Filtro     | Opciones                                         |
|------------|--------------------------------------------------|
| Búsqueda   | Texto libre: name, long_identifier, comment      |
| Función    | ALL, SYS, TRC, EEC, OBD, BEC, FEC, AUX_ELM...  |
| Tipo       | ALL, SCALAR, CURVE, MAP                          |
| Owner      | ALL, BeGas, HERKO, Shared                        |
| Status     | ALL, DOC_OK, WARNING, ERROR, MODIFIED, LOCKED    |
| Maduración | ALL, 0–25%, 26–50%, 51–75%, 76–100%              |

---

## 6. Barra de estado / summary

Debajo de los filtros, antes de la tabla:

```
1771 parámetros · 1634 scalars · 65 curves · 72 maps
Fuera de rango: 3 · Sin A2L: 0 · Sin DCM: 0
```

---

## 7. Toolbar principal (encima de la tabla, en la ribbon)

Acciones disponibles:

| Botón         | Acción                                                  |
|---------------|---------------------------------------------------------|
| `Export`      | Exporta tabla actual a CSV / Excel                      |
| `Filter`      | Toggle mostrar/ocultar barra de filtros                 |
| `Compare`     | Compara DCM actual con una versión anterior             |
| `Lock All`    | Bloquea todos los labels en estado actual               |
| `Reload`      | Recarga el A2L y DCM del servidor                       |

---

## 8. Comparador de versiones

Cuando el usuario activa **Compare**:

1. Selector de versión anterior (dropdown con historial de DCMs cargados)
2. Las filas muestran dos columnas de valor: `Current` y `Previous`
3. Filas con cambio → fondo amarillo + delta en columna "Value or Dim Old"
4. Filas sin cambio → igual que siempre
5. Filtro rápido: "Mostrar solo cambios"

**Delta visual**:
- Valor subió → flecha ↑ verde
- Valor bajó → flecha ↓ rojo
- Sin cambio → sin indicador

---

## 9. Modelo de datos backend (FastAPI + MongoDB)

### 9.1 Endpoints necesarios

```
GET  /v1/sw-releases/{id}/a2l/labels
     → lista todos los labels del A2L parseado

GET  /v1/sw-releases/{id}/dcm/parameters?type=scalar|curve|map&limit=1000&offset=0
     → lista parámetros del DCM con paginación (ya existe)

GET  /v1/sw-releases/{id}/dcm/parameters/{name}
     → detalle completo de un parámetro (ya existe)

GET  /v1/sw-releases/{id}/labels/merged
     → merge A2L + DCM: devuelve todos los labels sincronizados
     → query params: ?function=EEC&type=map&owner=HERKO&search=ADM

GET  /v1/sw-releases/{id}/labels/{name}
     → detalle completo de un label mergeado (A2L + DCM + metadatos)

PUT  /v1/sw-releases/{id}/labels/{name}/maturity
     → actualiza score de maduración

PUT  /v1/sw-releases/{id}/labels/{name}/metadata
     → actualiza owner, deputy, comment, user_status

GET  /v1/sw-releases/{id}/labels/summary
     → cuenta por tipo, por función, flags, fuera de rango
```

### 9.2 Schema del label mergeado

```json
{
  "name": "ADMc_kPa_BoostPressTrgt",
  "long_identifier": "Boost pressure target",
  "type": "map",
  "address": "0x20004E00",
  "unit": "kPa",
  "unit_x": "RPM",
  "unit_y": "ms",
  "lower_limit": -1000.0,
  "upper_limit": 1000.0,
  "function": "EEC",
  "function_version": "1.2",
  "x_axis": [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500],
  "y_axis": [0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0],
  "values": [[...], [...], ...],
  "value_preview": "[8x8]",
  "in_a2l": true,
  "in_dcm": true,
  "out_of_range": false,
  "owner": "HERKO",
  "deputy": "BeGas",
  "system_status": "DOC_OK",
  "user_status": "START",
  "label_flags": [],
  "maturity_score": 50,
  "maturity_history": [
    {"score": 25, "date": "2026-03-15", "user": "engineer1", "status": "DOC_OK"},
    {"score": 50, "date": "2026-04-02", "user": "manager1",  "status": "APPROVED"}
  ],
  "comment": "",
  "last_modified": "2026-05-21T14:32:00Z"
}
```

---

## 10. Roadmap de implementación

### Fase 1 — Parser + sync (backend) ✅ COMPLETADA
- [x] Parser A2L: extraer `CHARACTERISTIC`, `MEASUREMENT`, `AXIS_DESCR`, `FUNCTION_LIST`
- [x] Parser DCM: `PARAMETERS`, `KENNLINIE`, `KENNFELD`
- [x] Endpoint `/labels/merged`: join A2L + DCM por nombre
- [x] Endpoint `/labels/{name}`: detalle completo
- [x] Endpoint `/labels/summary`: contadores
- [x] Endpoint `/labels/{name}/maturity`: PUT score
- [x] Endpoint `/labels/{name}/metadata`: PUT owner/deputy/comment/user_status
- [x] Cache en memoria para A2L y DCM (evita re-parse en cada request)
- [x] MongoDB `label_metadata` collection con índice único (sw_release_id, label_name)

### Fase 2 — Tabla principal (frontend) ✅ COMPLETADA
- [x] 14 columnas CRETA exactas (Typ, Name, Save, System Status, Scor, Value or Dim, Value or Dim Old, Label Flags, Owner, Deputy, Function, Fn Ver, User Status, Comment)
- [x] Icono Typ con colores (S/~/▦)
- [x] System Status badges (DOC_OK, WARNING, MISSING_A2L, MISSING_DCM)
- [x] User Status badges (START, IN_PROGRESS, DONE, APPROVED)
- [x] Ordenación por columna con indicador ↑↓
- [x] Filtros: tipo, función, system_status
- [x] Búsqueda por nombre e identificador
- [x] Paginación 100/página
- [x] Split panel: tabla izquierda + panel derecho 600px
- [x] Route `/software-releases/:id/labels` en App.js
- [x] Botón "Label Viewer (CRETA)" en SwReleaseDetailPage

### Fase 3 — Panel detalle con tabs ✅ COMPLETADA
- [x] Tabs: Chart / Data / Maturity / Info
- [x] Scalars: todos clickables (antes solo curves/maps)
- [x] Chart tab — Scalar: `ScalarGauge` (barra visual valor vs min/max, OUT OF RANGE badge)
- [x] Chart tab — Curve: SVG 2D con ejes reales, grid, ticks, unidades
- [x] Chart tab — Map: Heatmap + 3D surface isométrico, toggle, paleta teal→lima→ámbar→coral
- [x] Data tab — Scalar: tabla valor actual / límites / out-of-range
- [x] Data tab — Curve: tabla X/Y con unidades en cabecera
- [x] Data tab — Map: matriz Z coloreada con ejes X/Y reales
- [x] Maturity tab: progress bar 0–100%, 4 milestones (25/50/75/100%), historial
- [x] Info tab: tabla completa de metadatos (21 campos: name, unit, limits, address, function, owner, deputy, flags, timestamps...)
- [x] Header panel: type badge + nombre + long_identifier + unidad + rango
- [x] Reset tab automático al cambiar de label

### Fase 4 — Maduración + metadatos (edición)
- [ ] Formulario edición inline: owner, deputy, comment, user_status
- [ ] PUT `/labels/{name}/metadata` wired al form
- [ ] Botón "Set Maturity" con selector 0/25/50/75/100
- [ ] PUT `/labels/{name}/maturity` wired
- [ ] Optimistic update + toast confirmación

### Fase 5 — Features avanzadas
- [ ] Export tabla filtrada a CSV
- [ ] Export a Excel (.xlsx) con colores de status
- [ ] Comparador de versiones (DCM actual vs anterior)
- [ ] Filtro rápido "solo fuera de rango" / "solo modificados" / "sin DCM"
- [ ] Lock / unlock labels (read-only flag)
- [ ] Toolbar ribbon: Export / Compare / Lock All / Reload

---

## 11. Ejemplos reales de parámetros (para tests)

### Scalars
```
ADMc_b_ResetBoostLterm       → VALUE  → b    → 0.0     → DOC_OK
ADMc_b_ResetThrottleLterm    → VALUE  → b    → 0.0     → DOC_OK
ADMc_b_TurboOverspeed        → VALUE  → b    → 0.0     → DOC_OK
ADMc_deg_ThrottleTrgt        → VALUE  → deg  → 7.80    → DOC_OK
ADMc_kPa_BoostPressTrgt      → VALUE  → kPa  → (valor) → DOC_OK
ADMc_lam_MaxThComb           → VALUE  → –    → (valor) → DOC_OK
ADMc_NU_Alpha1               → VALUE  → –    → (valor) → DOC_OK
ADMc_NU_Alpha6               → VALUE  → –    → (valor) → DOC_OK
```

### Curves (KENNLINIE)
```
CLFM_nu_TrimMaster    → CURVE → dim: [8d]
CLFM_nu_LamT1         → CURVE → dim: [8d]
CLFM_nu_LamT2         → CURVE → dim: [8d]
CLFM_nu_O2_Dither1    → CURVE → dim: [8d]
CLFM_nu_O2_Dither2    → CURVE → dim: [8d]
```

### Maps (KENNFELD)
```
CLFM_NU_DITHERLEANFIRINGS     → MAP → dim: [16x16]
  Eje X: APD_CLFM_NU_DITHERLEANFIRINGS_X  [RPM]
  Eje Y: (variable de carga o tiempo)
  Eje Z: Factor de dither lambda
```

---

## 12. Decisiones de diseño heredadas de CRETA

| Decisión                            | Razón                                           |
|-------------------------------------|-------------------------------------------------|
| Split panel (tabla izq, chart der)  | Usuario ve tabla y gráfica simultáneamente      |
| Sin modales para charts             | No interrumpe flujo de trabajo                  |
| Rows altura 24–26px                 | Más filas visibles, flujo Excel                 |
| Header sticky                       | Referencia de columnas siempre visible          |
| Font monospace para nombres/valores | Alineación de decimales, nomenclatura técnica   |
| Paleta teal→lima→ámbar→coral       | Alta discriminación perceptual en mapas 2D/3D   |
| Score 0–100 (no 0–4)               | Granularidad para interpolación de estados      |
| Tab Info con address hex            | Ingenieros necesitan dirección para debugging   |
| Value or Dim Old siempre visible    | Comparación inmediata sin acción extra          |

---

*Especificación generada: 2026-05-22*  
*Siguiente paso: implementar Fase 1 (Parser A2L + endpoint /labels/merged)*
