"""
Parser para archivos DAMOS Calibration Data (.DCM) v2.0
Encoding: ISO-8859-1 (latin-1)

Soporta:
    FESTWERT                  — escalar simple
    STUETZSTELLENVERTEILUNG   — eje de coordenadas (breakpoints)
    GRUPPENKENNLINIE          — curva 1D
    GRUPPENKENNFELD           — mapa 2D
    FESTWERTEBLOCK            — array 1D sin eje
    TEXTSTRING                — cadena de texto

Uso:
    parser = DcmParser()
    dataset = parser.parse("HKSW_0A_03_102_00_1D_120KMH_251120.DCM")

    print(f"Escalares : {len(dataset.scalars)}")
    print(f"Mapas 2D  : {len(dataset.maps)}")

    mapa = dataset.maps["ADMm_NU_BoostIGain_z"]
    print(mapa.axis_x)        # list[float]
    print(mapa.axis_y)        # list[float]
    print(mapa.data)          # list[list[float]]  — data[iy][ix]
"""

import re
from dataclasses import dataclass, field
from pathlib import Path


# ── Dataclasses de resultado ──────────────────────────────────────────────────

@dataclass
class DcmScalar:
    """FESTWERT — valor escalar simple."""
    name: str
    description: str = ""
    unit: str = ""
    value: float = 0.0


@dataclass
class DcmBreakpoints:
    """STUETZSTELLENVERTEILUNG — eje de coordenadas (breakpoints)."""
    name: str
    description: str = ""
    unit_x: str = ""
    values: list = field(default_factory=list)  # list[float]


@dataclass
class DcmCurve1D:
    """GRUPPENKENNLINIE — curva 1D (N puntos)."""
    name: str
    description: str = ""
    unit_x: str = ""
    unit_w: str = ""
    axis_x_ref: str = ""       # nombre del STUETZSTELLENVERTEILUNG referenciado
    axis_x: list = field(default_factory=list)   # list[float]
    values: list = field(default_factory=list)   # list[float]


@dataclass
class DcmMap2D:
    """GRUPPENKENNFELD — mapa 2D (Nx columnas × Ny filas)."""
    name: str
    nx: int = 0
    ny: int = 0
    description: str = ""
    unit_x: str = ""
    unit_y: str = ""
    unit_w: str = ""
    axis_x_ref: str = ""
    axis_y_ref: str = ""
    axis_x: list = field(default_factory=list)   # list[float]
    axis_y: list = field(default_factory=list)   # list[float]
    data: list = field(default_factory=list)     # list[list[float]] — data[iy][ix]


@dataclass
class DcmArray:
    """FESTWERTEBLOCK — array 1D de valores sin eje."""
    name: str
    n: int = 0
    description: str = ""
    unit: str = ""
    values: list = field(default_factory=list)   # list[float]


@dataclass
class DcmTextString:
    """TEXTSTRING — cadena de texto."""
    name: str
    description: str = ""
    text: str = ""


@dataclass
class DcmDataset:
    """Resultado completo del parse de un archivo .DCM."""
    version: str = "2.0"
    scalars: dict = field(default_factory=dict)       # dict[str, DcmScalar]
    breakpoints: dict = field(default_factory=dict)   # dict[str, DcmBreakpoints]
    curves: dict = field(default_factory=dict)        # dict[str, DcmCurve1D]
    maps: dict = field(default_factory=dict)          # dict[str, DcmMap2D]
    arrays: dict = field(default_factory=dict)        # dict[str, DcmArray]
    text_strings: dict = field(default_factory=dict)  # dict[str, DcmTextString]
    parse_errors: list = field(default_factory=list)  # list[str]

    def summary(self) -> str:
        return (
            f"DCM v{self.version} — "
            f"{len(self.scalars)} scalars, "
            f"{len(self.breakpoints)} breakpoints, "
            f"{len(self.curves)} curves, "
            f"{len(self.maps)} maps, "
            f"{len(self.arrays)} arrays, "
            f"{len(self.text_strings)} text_strings"
            + (f"  [{len(self.parse_errors)} errors]" if self.parse_errors else "")
        )


# ── Parser principal ──────────────────────────────────────────────────────────

class DcmParser:
    """
    Parser de archivos DAMOS Calibration Data (.DCM / .CDF) v2.0.

    Compatible con el formato generado por ETAS INCA/CDM.
    Encoding esperado: ISO-8859-1 (latin-1).
    """

    def parse(self, filepath) -> DcmDataset:
        """
        Parsea un archivo .DCM y devuelve un DcmDataset.

        Args:
            filepath: Ruta al archivo (str o Path).

        Returns:
            DcmDataset con todos los objetos encontrados.
        """
        path = Path(filepath)
        dataset = DcmDataset()

        with open(path, encoding="iso-8859-1", errors="replace") as f:
            raw_lines = f.readlines()

        clean_lines = self._clean(raw_lines)

        i = 0
        n = len(clean_lines)

        while i < n:
            line = clean_lines[i]

            # ── Cabecera de versión ──────────────────────────────────────────
            if line.startswith("KONSERVIERUNG_FORMAT"):
                parts = line.split()
                if len(parts) >= 2:
                    dataset.version = parts[-1]
                i += 1

            # ── FESTWERT (escalar) ───────────────────────────────────────────
            elif line.startswith("FESTWERT ") and not line.startswith("FESTWERTEBLOCK"):
                name = line.split()[1]
                obj = DcmScalar(name=name)
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("EINHEIT_W"):
                        obj.unit = self._quoted(l)
                    elif l.startswith("WERT"):
                        vals = self._floats(l[4:])
                        if vals:
                            obj.value = vals[0]
                        else:
                            dataset.parse_errors.append(
                                f"FESTWERT {name}: valor no numérico en: {l}"
                            )
                    i += 1
                dataset.scalars[name] = obj
                i += 1  # saltar END

            # ── STUETZSTELLENVERTEILUNG (breakpoints) ────────────────────────
            elif line.startswith("STUETZSTELLENVERTEILUNG"):
                parts = line.split()
                name = parts[1]
                obj = DcmBreakpoints(name=name)
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("*SST"):         # directiva de marcado, ignorar
                        i += 1
                        continue
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("EINHEIT_X"):
                        obj.unit_x = self._quoted(l)
                    elif l.startswith("ST/X"):
                        obj.values.extend(self._floats(l[4:]))
                    i += 1
                dataset.breakpoints[name] = obj
                i += 1

            # ── GRUPPENKENNLINIE (curva 1D) ──────────────────────────────────
            elif line.startswith("GRUPPENKENNLINIE"):
                parts = line.split()
                name = parts[1]
                obj = DcmCurve1D(name=name)
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("EINHEIT_X"):
                        obj.unit_x = self._quoted(l)
                    elif l.startswith("EINHEIT_W"):
                        obj.unit_w = self._quoted(l)
                    elif l.startswith("*SSTX"):
                        obj.axis_x_ref = l.split()[-1]
                    elif l.startswith("ST/X"):
                        obj.axis_x.extend(self._floats(l[4:]))
                    elif l.startswith("WERT"):
                        obj.values.extend(self._floats(l[4:]))
                    i += 1
                dataset.curves[name] = obj
                i += 1

            # ── GRUPPENKENNFELD (mapa 2D) ────────────────────────────────────
            elif line.startswith("GRUPPENKENNFELD"):
                parts = line.split()
                name = parts[1]
                nx = int(parts[2]) if len(parts) > 2 else 0
                ny = int(parts[3]) if len(parts) > 3 else 0
                obj = DcmMap2D(name=name, nx=nx, ny=ny)
                current_row: list = []
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("EINHEIT_X"):
                        obj.unit_x = self._quoted(l)
                    elif l.startswith("EINHEIT_Y"):
                        obj.unit_y = self._quoted(l)
                    elif l.startswith("EINHEIT_W"):
                        obj.unit_w = self._quoted(l)
                    elif l.startswith("*SSTX"):
                        obj.axis_x_ref = l.split()[-1]
                    elif l.startswith("*SSTY"):
                        obj.axis_y_ref = l.split()[-1]
                    elif l.startswith("ST/X"):
                        obj.axis_x.extend(self._floats(l[4:]))
                    elif l.startswith("ST/Y"):
                        # Nuevo valor de eje Y: guardar la fila acumulada
                        if current_row:
                            obj.data.append(current_row)
                            current_row = []
                        obj.axis_y.extend(self._floats(l[4:]))
                    elif l.startswith("WERT"):
                        current_row.extend(self._floats(l[4:]))
                    i += 1
                if current_row:
                    obj.data.append(current_row)
                dataset.maps[name] = obj
                i += 1

            # ── FESTWERTEBLOCK (array 1D) ────────────────────────────────────
            elif line.startswith("FESTWERTEBLOCK"):
                parts = line.split()
                name = parts[1]
                n_elems = int(parts[2]) if len(parts) > 2 else 0
                obj = DcmArray(name=name, n=n_elems)
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("EINHEIT_W"):
                        obj.unit = self._quoted(l)
                    elif l.startswith("WERT"):
                        obj.values.extend(self._floats(l[4:]))
                    i += 1
                dataset.arrays[name] = obj
                i += 1

            # ── TEXTSTRING ───────────────────────────────────────────────────
            elif line.startswith("TEXTSTRING"):
                name = line.split()[1]
                obj = DcmTextString(name=name)
                i += 1
                while i < n and clean_lines[i] != "END":
                    l = clean_lines[i]
                    if l.startswith("LANGNAME"):
                        obj.description = self._quoted(l)
                    elif l.startswith("TEXT"):
                        obj.text = self._quoted(l)
                    i += 1
                dataset.text_strings[name] = obj
                i += 1

            else:
                i += 1

        return dataset

    # ── Helpers privados ──────────────────────────────────────────────────────

    @staticmethod
    def _clean(raw_lines: list) -> list:
        """
        Limpia las líneas raw del archivo:
        - Elimina saltos de línea Windows/Unix
        - Strip de espacios
        - Descarta líneas vacías
        - Descarta comentarios (* al inicio), EXCEPTO directivas *SSTX, *SSTY, *SST
        """
        result = []
        for line in raw_lines:
            stripped = line.rstrip("\r\n").strip()
            if not stripped:
                continue
            if stripped.startswith("*") and not stripped.startswith(("*SSTX", "*SSTY", "*SST")):
                continue  # comentario real, ignorar
            result.append(stripped)
        return result

    @staticmethod
    def _quoted(line: str) -> str:
        """Extrae el contenido entre las primeras comillas dobles de una línea."""
        m = re.search(r'"(.*?)"', line)
        return m.group(1) if m else ""

    @staticmethod
    def _floats(text: str) -> list:
        """Parsea todos los tokens float de un fragmento de texto."""
        result = []
        for token in text.split():
            try:
                result.append(float(token))
            except ValueError:
                pass
        return result
