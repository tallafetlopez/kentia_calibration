"""
Parser para archivos Motorola S-Record (.S37 / .S19 / .SREC).
Formato S3 (dirección 32 bits) — el más común en ECUs de 32 bits.

Uso básico:
    parser = S37Parser()
    image = parser.parse("HKSW_0A_03_102_00.s37")
    print(f"Rango: 0x{image.address_min:08X} - 0x{image.address_max:08X}")
    print(f"Total bytes: {image.total_bytes}")
    print(f"Records: {len(image.records)}")

Leer valor calibrado cruzando con el .A2L:
    # ECU_ADDRESS del characteristic en el .A2L → 0x84f98
    raw = parser.read(image, 0x84f98, 4)      # float32 MSB_FIRST = 4 bytes
    import struct
    value = struct.unpack('>f', raw)[0]        # '>' = big-endian (MSB_FIRST)
    print(f"Valor en ECU: {value}")

NOTA: Para interpretar los datos se necesita el .A2L que provee:
    - ECU_ADDRESS: dirección de memoria
    - RECORD_LAYOUT: tipo de dato (FLOAT32_IEEE, UBYTE, SWORD, ...)
    - BYTE_ORDER: MSB_FIRST (big-endian) | LSB_FIRST (little-endian)
"""

import bisect
from dataclasses import dataclass, field
from pathlib import Path


# ── Dataclasses de resultado ──────────────────────────────────────────────────

@dataclass
class S37Record:
    """Un registro S3 del archivo."""
    record_type: str      # "S3" | "S7"
    address: int          # dirección de memoria (32 bits)
    data: bytes           # payload del registro
    checksum: int         # byte de checksum leído del archivo
    checksum_ok: bool     # True si el checksum calculado coincide


@dataclass
class S37Image:
    """
    Imagen de memoria completa reconstruida desde el archivo S37.

    memory_map: diccionario { dirección_inicio: bytes } con cada bloque.
    Para leer datos usa S37Parser.read(image, address, length).
    """
    memory_map: dict = field(default_factory=dict)   # dict[int, bytes]
    records: list = field(default_factory=list)       # list[S37Record]
    start_address: int = 0           # dirección de inicio de ejecución (registro S7)
    address_min: int = 0xFFFF_FFFF   # dirección más baja encontrada
    address_max: int = 0             # dirección más alta (exclusiva)
    total_bytes: int = 0             # bytes de datos útiles totales
    checksum_errors: int = 0         # registros con checksum incorrecto

    def summary(self) -> str:
        return (
            f"S37 — {len(self.records)} S3 records, {self.total_bytes} bytes, "
            f"range 0x{self.address_min:08X}–0x{self.address_max:08X}, "
            f"start=0x{self.start_address:08X}"
            + (f"  [{self.checksum_errors} checksum errors]" if self.checksum_errors else "")
        )


# ── Parser principal ──────────────────────────────────────────────────────────

class S37Parser:
    """
    Parser de archivos Motorola S-Record (.S37).

    Soporta:
        S0 — cabecera (ignorado)
        S3 — datos con dirección de 32 bits
        S5 — contador de registros (ignorado)
        S7 — fin de archivo / dirección de inicio de ejecución
    """

    def parse(self, filepath) -> S37Image:
        """
        Parsea un archivo S37 y devuelve un S37Image.

        Args:
            filepath: Ruta al archivo (str o Path).

        Returns:
            S37Image con todos los records S3 y el mapa de memoria.
        """
        path = Path(filepath)
        image = S37Image()

        with open(path, encoding="ascii", errors="ignore") as f:
            for raw_line in f:
                line = raw_line.strip()
                if len(line) < 4:
                    continue

                rec_type = line[0:2]

                if rec_type not in ("S3", "S7"):
                    continue  # S0, S5 — ignorar

                try:
                    byte_count = int(line[2:4], 16)
                    payload = line[4:]           # todo lo que sigue al byte_count

                    if rec_type == "S3":
                        # Estructura S3:
                        #   byte_count (1B) | address (4B) | data (N B) | checksum (1B)
                        if len(payload) < 10:    # 8 hex addr + 2 hex checksum mínimo
                            continue

                        address = int(payload[0:8], 16)
                        data_hex = payload[8:-2]
                        checksum_byte = int(payload[-2:], 16)
                        data = bytes.fromhex(data_hex)

                        # Checksum: complemento a 1 de la suma de (byte_count + addr + data)
                        all_bytes = bytes([byte_count]) + bytes.fromhex(payload[:-2])
                        computed = (~sum(all_bytes)) & 0xFF
                        checksum_ok = (computed == checksum_byte)

                        record = S37Record(
                            record_type="S3",
                            address=address,
                            data=data,
                            checksum=checksum_byte,
                            checksum_ok=checksum_ok,
                        )
                        image.records.append(record)
                        image.memory_map[address] = data

                        if not checksum_ok:
                            image.checksum_errors += 1

                        image.address_min = min(image.address_min, address)
                        image.address_max = max(image.address_max, address + len(data))
                        image.total_bytes += len(data)

                    elif rec_type == "S7":
                        # S7: solo contiene la dirección de inicio de ejecución
                        if len(payload) >= 10:
                            image.start_address = int(payload[0:8], 16)

                except Exception:
                    continue  # registro malformado — saltar silenciosamente

        return image

    def read(self, image: S37Image, address: int, length: int) -> bytes:
        """
        Lee ``length`` bytes desde ``address`` en la imagen de memoria.

        Los bloques S37 no son contiguos en memoria; este método los reconstruye
        buscando el bloque que contiene cada dirección solicitada.

        Args:
            image:   S37Image devuelto por parse().
            address: Dirección de inicio en espacio de memoria ECU.
            length:  Número de bytes a leer.

        Returns:
            bytes de longitud ``length``.

        Raises:
            ValueError: Si alguna dirección del rango no está en la imagen.
        """
        result = bytearray()
        remaining = length
        current_addr = address

        # Ordenar las claves una vez para búsqueda binaria eficiente
        sorted_addrs = sorted(image.memory_map.keys())

        while remaining > 0:
            # bisect_right devuelve el índice del primer bloque cuya dirección
            # es mayor que current_addr; el candidato está en idx-1
            idx = bisect.bisect_right(sorted_addrs, current_addr) - 1

            if idx < 0:
                raise ValueError(
                    f"Dirección 0x{current_addr:08X} fuera del rango de la imagen. "
                    f"Rango disponible: 0x{image.address_min:08X}–0x{image.address_max:08X}"
                )

            rec_addr = sorted_addrs[idx]
            rec_data = image.memory_map[rec_addr]
            rec_end = rec_addr + len(rec_data)

            if current_addr >= rec_end:
                raise ValueError(
                    f"Dirección 0x{current_addr:08X} no contenida en ningún bloque S37. "
                    f"Rango disponible: 0x{image.address_min:08X}–0x{image.address_max:08X}"
                )

            offset = current_addr - rec_addr
            chunk = rec_data[offset: offset + remaining]
            result.extend(chunk)
            current_addr += len(chunk)
            remaining -= len(chunk)

        return bytes(result)
