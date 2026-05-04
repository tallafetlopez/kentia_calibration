"""
Parser para archivos ASAP2 / A2L v1.31
Encoding: UTF-8 con fallback a ISO-8859-1

Auto-generado por OpenECU capi.py — contiene definiciones de CHARACTERISTIC,
MEASUREMENT, AXIS_PTS, COMPU_METHOD y RECORD_LAYOUT.

Uso:
    parser = A2lParser()
    ds = parser.parse("HKSW_0A_03_102_00.a2l")

    print(ds.summary())

    # Parámetro calibrable por nombre
    char = ds.characteristics["ADMc_C_ComprNormRefTemp"]
    print(char.char_type, hex(char.ecu_address), char.lower_limit, char.upper_limit)

    # Todos los MAPs
    maps = {k: v for k, v in ds.characteristics.items() if v.char_type == "MAP"}
"""

import re
from dataclasses import dataclass, field
from pathlib import Path


# ── Dataclasses de resultado ──────────────────────────────────────────────────

@dataclass
class A2lCharacteristic:
    """Parámetro calibrable (VALUE, MAP, CURVE, AXIS_PTS, VAL_BLK)."""
    name: str
    description: str = ""
    char_type: str = ""          # VALUE | MAP | CURVE | AXIS_PTS | VAL_BLK
    ecu_address: int = 0         # dirección en memoria (hex → int)
    record_layout: str = ""
    conversion: str = ""         # compu_method referenciado
    lower_limit: float = 0.0
    upper_limit: float = 0.0
    byte_order: str = "MSB_FIRST"


@dataclass
class A2lMeasurement:
    """Variable de medida — solo lectura, no calibrable."""
    name: str
    description: str = ""
    datatype: str = ""
    conversion: str = ""
    ecu_address: int = 0
    lower_limit: float = 0.0
    upper_limit: float = 0.0


@dataclass
class A2lCompuMethod:
    """Método de conversión de unidades físicas."""
    name: str
    description: str = ""
    method: str = ""       # RAT_FUNC | TAB_VERB | IDENTICAL | LINEAR | ...
    format: str = ""
    unit: str = ""
    coeffs: list = field(default_factory=list)   # para RAT_FUNC: [a, b, c, d, e, f]


@dataclass
class A2lDataset:
    """Resultado completo del parse de un archivo .A2L."""
    project_name: str = ""
    module_name: str = ""
    version: str = ""
    characteristics: dict = field(default_factory=dict)   # dict[str, A2lCharacteristic]
    measurements: dict = field(default_factory=dict)       # dict[str, A2lMeasurement]
    compu_methods: dict = field(default_factory=dict)      # dict[str, A2lCompuMethod]
    parse_errors: list = field(default_factory=list)       # list[str]

    def summary(self) -> str:
        return (
            f"A2L project={self.project_name!r} module={self.module_name!r} v={self.version!r} — "
            f"{len(self.characteristics)} characteristics, "
            f"{len(self.measurements)} measurements, "
            f"{len(self.compu_methods)} compu_methods"
            + (f"  [{len(self.parse_errors)} errors]" if self.parse_errors else "")
        )


# ── Parser principal ──────────────────────────────────────────────────────────

class A2lParser:
    """
    Parser de archivos ASAP2 (.A2L) v1.31.

    Estrategia: extracción por bloques /begin ... /end con regex.
    Los bloques A2ML, IF_DATA, ANNOTATION y RECORD_LAYOUT se ignoran.
    Compatible con archivos generados por OpenECU capi.py.
    """

    # Tipos de CHARACTERISTIC reconocidos
    _CHAR_TYPES = {"VALUE", "MAP", "CURVE", "AXIS_PTS", "VAL_BLK"}

    def parse(self, filepath) -> A2lDataset:
        """
        Parsea un archivo .A2L y devuelve un A2lDataset.

        Args:
            filepath: Ruta al archivo (str o Path).

        Returns:
            A2lDataset con characteristics, measurements y compu_methods.
        """
        path = Path(filepath)
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            text = path.read_text(encoding="iso-8859-1", errors="replace")

        ds = A2lDataset()

        # ── Metadatos de cabecera ────────────────────────────────────────────
        m = re.search(r"/begin PROJECT\s+(\S+)", text)
        if m:
            ds.project_name = m.group(1)

        m = re.search(r"/begin HEADER\s+\"([^\"]*)\"", text)
        if m:
            ds.version = m.group(1)

        m = re.search(r"/begin MODULE\s+(\S+)", text)
        if m:
            ds.module_name = m.group(1)

        # ── Parseo de bloques ────────────────────────────────────────────────
        self._parse_characteristics(text, ds)
        self._parse_measurements(text, ds)
        self._parse_compu_methods(text, ds)

        return ds

    # ── Parseo de CHARACTERISTIC ─────────────────────────────────────────────

    def _parse_characteristics(self, text: str, ds: A2lDataset) -> None:
        """
        Extrae todos los bloques /begin CHARACTERISTIC ... /end CHARACTERISTIC.

        Formato esperado (líneas relevantes al inicio del bloque):
            /begin CHARACTERISTIC <nombre>
                "<descripción>"
                VALUE|MAP|CURVE|AXIS_PTS|VAL_BLK
                0x<addr>
                <record_layout>
                <factor>
                <compu_method>
                <lower>
                <upper>
        """
        # Captura la cabecera del bloque con los 8 campos posicionales
        pattern = re.compile(
            r"/begin CHARACTERISTIC\s+(\S+)\s+"   # 1: nombre
            r"\"([^\"]*)\"\s+"                     # 2: descripción
            r"(VALUE|MAP|CURVE|AXIS_PTS|VAL_BLK)\s+"  # 3: tipo
            r"(0x[0-9A-Fa-f]+|\d+)\s+"            # 4: dirección ECU
            r"(\S+)\s+"                            # 5: record layout
            r"([0-9.e+\-]+)\s+"                    # 6: factor (ignorado)
            r"(\S+)\s+"                            # 7: compu method
            r"([0-9.\-eE+]+)\s+"                   # 8: lower limit
            r"([0-9.\-eE+]+)",                     # 9: upper limit
        )
        for m in pattern.finditer(text):
            try:
                addr_str = m.group(4)
                addr = int(addr_str, 16) if addr_str.lower().startswith("0x") else int(addr_str)
                char = A2lCharacteristic(
                    name=m.group(1),
                    description=m.group(2),
                    char_type=m.group(3),
                    ecu_address=addr,
                    record_layout=m.group(5),
                    conversion=m.group(7),
                    lower_limit=self._safe_float(m.group(8)),
                    upper_limit=self._safe_float(m.group(9)),
                )
                # BYTE_ORDER — buscar en los próximos ~600 caracteres del bloque
                local = text[m.start(): m.start() + 600]
                bo = re.search(r"BYTE_ORDER\s+(MSB_FIRST|LSB_FIRST)", local)
                if bo:
                    char.byte_order = bo.group(1)
                ds.characteristics[char.name] = char
            except Exception as exc:
                ds.parse_errors.append(
                    f"CHARACTERISTIC '{m.group(1)}' parse error: {exc}"
                )

    # ── Parseo de MEASUREMENT ────────────────────────────────────────────────

    def _parse_measurements(self, text: str, ds: A2lDataset) -> None:
        """
        Extrae todos los bloques /begin MEASUREMENT ... /end MEASUREMENT.

        Formato posicional esperado:
            /begin MEASUREMENT <nombre>
                "<descripción>"
                <datatype>
                <compu_method>
                <precision>  <factor>
                <lower>
                <upper>
        """
        pattern = re.compile(
            r"/begin MEASUREMENT\s+(\S+)\s+"   # 1: nombre
            r"\"([^\"]*)\"\s+"                  # 2: descripción
            r"(\S+)\s+"                         # 3: datatype
            r"(\S+)\s+"                         # 4: compu method
            r"[0-9.]+\s+[0-9.]+\s+"            # precision + factor (ignorados)
            r"([0-9.\-eE+]+)\s+"               # 5: lower limit
            r"([0-9.\-eE+]+)",                  # 6: upper limit
        )
        for m in pattern.finditer(text):
            try:
                meas = A2lMeasurement(
                    name=m.group(1),
                    description=m.group(2),
                    datatype=m.group(3),
                    conversion=m.group(4),
                    lower_limit=self._safe_float(m.group(5)),
                    upper_limit=self._safe_float(m.group(6)),
                )
                # ECU_ADDRESS — puede estar más adelante dentro del mismo bloque
                local = text[m.start(): m.start() + 500]
                addr_m = re.search(r"ECU_ADDRESS\s+(0x[0-9A-Fa-f]+)", local)
                if addr_m:
                    meas.ecu_address = int(addr_m.group(1), 16)
                ds.measurements[meas.name] = meas
            except Exception as exc:
                ds.parse_errors.append(
                    f"MEASUREMENT '{m.group(1)}' parse error: {exc}"
                )

    # ── Parseo de COMPU_METHOD ───────────────────────────────────────────────

    def _parse_compu_methods(self, text: str, ds: A2lDataset) -> None:
        """
        Extrae todos los bloques /begin COMPU_METHOD ... /end COMPU_METHOD.

        Formato posicional esperado:
            /begin COMPU_METHOD <nombre>
                "<descripción>"
                RAT_FUNC|TAB_VERB|IDENTICAL|LINEAR|...
                "<formato>"
                "<unidad>"
                [COEFFS a b c d e f]
        """
        pattern = re.compile(
            r"/begin COMPU_METHOD\s+(\S+)\s+"   # 1: nombre
            r"\"([^\"]*)\"\s+"                   # 2: descripción
            r"(\S+)\s+"                          # 3: método
            r"\"([^\"]*)\"\s+"                   # 4: formato
            r"\"([^\"]*)\"",                     # 5: unidad
        )
        for m in pattern.finditer(text):
            try:
                cm = A2lCompuMethod(
                    name=m.group(1),
                    description=m.group(2),
                    method=m.group(3),
                    format=m.group(4),
                    unit=m.group(5),
                )
                # COEFFS — buscar en los próximos ~400 caracteres
                local = text[m.start(): m.start() + 400]
                coeffs_m = re.search(r"COEFFS\s+([\-0-9.eE+ ]+)", local)
                if coeffs_m:
                    cm.coeffs = [
                        float(x) for x in coeffs_m.group(1).split()
                        if re.match(r"^[\-0-9.eE+]+$", x)
                    ]
                ds.compu_methods[cm.name] = cm
            except Exception as exc:
                ds.parse_errors.append(
                    f"COMPU_METHOD '{m.group(1)}' parse error: {exc}"
                )

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _safe_float(s: str) -> float:
        """Convierte a float con fallback a 0.0."""
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0
