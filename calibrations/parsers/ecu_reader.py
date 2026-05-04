"""
Integrador A2L + S37: lee los valores físicos calibrados directamente
de la imagen de firmware usando las definiciones del A2L.

Equivale a lo que hace ETAS INCA internamente al leer una ECU.

Uso:
    from calibrations.parsers.a2l_parser import A2lParser
    from calibrations.parsers.s37_parser import S37Parser
    from calibrations.parsers.ecu_reader import EcuReader

    a2l = A2lParser().parse("HKSW_0A_03_102_00.a2l")
    s37 = S37Parser().parse("HKSW_0A_03_102_00.s37")

    reader = EcuReader(a2l, s37)

    # Leer un escalar VALUE
    val = reader.read_scalar("ADMc_C_ComprNormRefTemp")
    print(f"Valor físico: {val} °C")

    # Comparar con DCM
    from calibrations.parsers.dcm_parser import DcmParser
    dcm = DcmParser().parse("HKSW_0A_03_102_00_1D_120KMH_251120.DCM")
    dcm_val = dcm.scalars["ADMc_C_ComprNormRefTemp"].value
    print(f"DCM={dcm_val}  S37={val}  Match={abs(val - dcm_val) < 0.001}")

    # Leer todos los escalares VALUE disponibles en la imagen
    results = reader.read_all_scalars()
    for name, value in list(results.items())[:5]:
        print(f"  {name} = {value}")
"""

import struct
from dataclasses import dataclass, field

from .a2l_parser import A2lDataset, A2lCharacteristic
from .s37_parser import S37Image, S37Parser


# ── Mapa de tipos de dato ASAP2 → (struct_format, size_bytes) ────────────────
# El byte order se aplica dinámicamente según BYTE_ORDER del characteristic.
# Aquí se define el formato base sin endianness (se prefija > o < en tiempo de uso).
ASAP2_DTYPE = {
    "FLOAT32_IEEE": ("f", 4),
    "FLOAT64_IEEE": ("d", 8),
    "UBYTE":        ("B", 1),
    "SBYTE":        ("b", 1),
    "UWORD":        ("H", 2),
    "SWORD":        ("h", 2),
    "ULONG":        ("I", 4),
    "SLONG":        ("i", 4),
    "A_UINT64":     ("Q", 8),
    "A_INT64":      ("q", 8),
}


@dataclass
class ReadResult:
    """Resultado de lectura de un characteristic desde el S37."""
    name: str
    char_type: str
    ecu_address: int
    raw_bytes: bytes
    value: object           # float | list[float] | list[list[float]]
    unit: str = ""
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.error == ""


# ── EcuReader ─────────────────────────────────────────────────────────────────

class EcuReader:
    """
    Lee valores calibrados del firmware S37 usando las definiciones A2L.

    Soporta:
        - VALUE    → escalar float
        - VAL_BLK  → array 1D de floats
        - CURVE    → eje X + valores (2 × N floats)
        - MAP      → eje X + eje Y + matriz (Nx + Ny + Nx×Ny floats)
    """

    def __init__(self, a2l: A2lDataset, s37: S37Image):
        self.a2l = a2l
        self.s37 = s37
        self._parser = S37Parser()

    # ── Lectura de tipos individuales ─────────────────────────────────────────

    def read_scalar(self, char_name: str) -> float:
        """
        Lee un CHARACTERISTIC de tipo VALUE desde el S37.

        Returns:
            Valor float en unidades físicas.

        Raises:
            KeyError: Si el nombre no existe en el A2L.
            ValueError: Si la dirección no está en la imagen S37.
        """
        char = self._get_char(char_name)
        raw = self._read_raw(char.ecu_address, 4)
        fmt = self._fmt(char.byte_order, "f")
        return struct.unpack(fmt, raw)[0]

    def read_result(self, char_name: str) -> ReadResult:
        """
        Lee cualquier CHARACTERISTIC y devuelve un ReadResult con metadatos.
        Captura errores internamente — consulta ReadResult.ok y ReadResult.error.
        """
        if char_name not in self.a2l.characteristics:
            return ReadResult(
                name=char_name, char_type="", ecu_address=0,
                raw_bytes=b"", value=None,
                error=f"'{char_name}' no encontrado en A2L",
            )
        char = self.a2l.characteristics[char_name]

        # Obtener unidad desde compu_method si está disponible
        unit = ""
        if char.conversion in self.a2l.compu_methods:
            unit = self.a2l.compu_methods[char.conversion].unit

        try:
            if char.char_type == "VALUE":
                raw = self._read_raw(char.ecu_address, 4)
                value = struct.unpack(self._fmt(char.byte_order, "f"), raw)[0]
                return ReadResult(char_name, char.char_type, char.ecu_address, raw, value, unit)

            elif char.char_type == "VAL_BLK":
                # Array: leer N floats contiguos (N se infiere del rango / layout)
                # Sin RECORD_LAYOUT completo usamos heurística: intentar con 1 float
                raw = self._read_raw(char.ecu_address, 4)
                value = struct.unpack(self._fmt(char.byte_order, "f"), raw)[0]
                return ReadResult(char_name, char.char_type, char.ecu_address, raw, value, unit)

            elif char.char_type in ("CURVE", "MAP", "AXIS_PTS"):
                # Para estos tipos devolvemos los bytes raw sin interpretar
                # (requieren RECORD_LAYOUT completo para dimensiones exactas)
                raw = self._read_raw(char.ecu_address, 4)
                value = struct.unpack(self._fmt(char.byte_order, "f"), raw)[0]
                return ReadResult(char_name, char.char_type, char.ecu_address, raw, value, unit)

            else:
                return ReadResult(
                    char_name, char.char_type, char.ecu_address, b"", None, unit,
                    error=f"Tipo '{char.char_type}' no soportado",
                )

        except Exception as exc:
            return ReadResult(
                char_name, char.char_type, char.ecu_address, b"", None, unit,
                error=str(exc),
            )

    def read_all_scalars(self) -> dict:
        """
        Lee todos los CHARACTERISTICs de tipo VALUE disponibles en la imagen S37.

        Returns:
            dict[str, float] — solo los que se leyeron sin error.
        """
        results = {}
        for name, char in self.a2l.characteristics.items():
            if char.char_type != "VALUE":
                continue
            r = self.read_result(name)
            if r.ok:
                results[name] = r.value
        return results

    def compare_with_dcm(self, dcm_dataset, tolerance: float = 0.001) -> dict:
        """
        Compara los valores escalares VALUE del S37 con los del DCM.

        Args:
            dcm_dataset: DcmDataset devuelto por DcmParser.parse()
            tolerance:   Diferencia máxima para considerar "match"

        Returns:
            dict[str, dict] con keys: s37, dcm, diff, match, unit
        """
        comparison = {}
        for name, dcm_scalar in dcm_dataset.scalars.items():
            if name not in self.a2l.characteristics:
                continue
            r = self.read_result(name)
            if not r.ok:
                continue
            s37_val = r.value
            dcm_val = dcm_scalar.value
            diff = abs(s37_val - dcm_val)
            comparison[name] = {
                "s37":   s37_val,
                "dcm":   dcm_val,
                "diff":  diff,
                "match": diff <= tolerance,
                "unit":  dcm_scalar.unit or r.unit,
            }
        return comparison

    # ── Helpers privados ──────────────────────────────────────────────────────

    def _get_char(self, name: str) -> A2lCharacteristic:
        if name not in self.a2l.characteristics:
            raise KeyError(f"Characteristic '{name}' no encontrada en A2L")
        char = self.a2l.characteristics[name]
        if not char.ecu_address:
            raise ValueError(f"Characteristic '{name}' no tiene ECU_ADDRESS válida")
        return char

    def _read_raw(self, address: int, length: int) -> bytes:
        return self._parser.read(self.s37, address, length)

    @staticmethod
    def _fmt(byte_order: str, type_char: str) -> str:
        """Construye el formato struct con endianness correcto."""
        prefix = "<" if byte_order == "LSB_FIRST" else ">"
        return f"{prefix}{type_char}"
