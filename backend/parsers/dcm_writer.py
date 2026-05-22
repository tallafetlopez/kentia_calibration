"""
DCM Writer — DAMOS 2.0 format serializer.
Encoding: ISO-8859-1 (matches the parser).
"""
from __future__ import annotations
from datetime import datetime
from typing import Iterable
from pathlib import Path


def _fmt_value(v) -> str:
    if isinstance(v, float):
        return f"{v:.10g}"
    return str(v)


def write_dcm(labels: Iterable[dict], output_path: str | Path, header: dict | None = None) -> str:
    """
    Serialize a list of label dicts to DAMOS 2.0 DCM format.

    Each label must have at least:
      - name (str)
      - type  ("scalar" | "curve" | "map")
      - value (scalar) or values (curve/map matrix)
      - x_axis, y_axis (curve/map)
      - unit, unit_x, unit_y, unit_w (optional)
      - long_identifier (optional)
    """
    header = header or {}
    project    = header.get("project",    "HERKO Calibration Manager")
    dataset    = header.get("dataset",    f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    created_by = header.get("created_by", "kentia_calibration")

    lines: list[str] = []
    lines.append("KONSERVIERUNG_FORMAT 2.0")
    lines.append("")
    lines.append(f"* project {project}")
    lines.append(f"* dataset {dataset}")
    lines.append(f"* created by {created_by}")
    lines.append(f"* generated {datetime.now().isoformat()}")
    lines.append("")

    for label in labels:
        ltype   = label.get("type", "scalar")
        name    = label["name"]
        long_id = label.get("long_identifier") or label.get("long_name") or ""

        if ltype == "scalar":
            lines.append(f"FESTWERT {name}")
            if long_id:
                lines.append(f'   LANGNAME "{long_id}"')
            unit = label.get("unit", "")
            if unit:
                lines.append(f'   EINHEIT_W "{unit}"')
            val = label.get("value")
            if val is None:
                val = 0.0
            if isinstance(val, str):
                lines.append(f'   TEXT "{val}"')
            else:
                lines.append(f"   WERT {_fmt_value(val)}")
            lines.append("END")
            lines.append("")

        elif ltype == "curve":
            x_axis = label.get("x_axis") or []
            values = label.get("values") or []
            if values and isinstance(values[0], list):
                values = values[0]
            size = len(x_axis) or len(values)
            lines.append(f"GRUPPENKENNLINIE {name} {size}")
            if long_id:
                lines.append(f'   LANGNAME "{long_id}"')
            ux = label.get("unit_x", "")
            uw = label.get("unit_w") or label.get("unit", "")
            if ux:
                lines.append(f'   EINHEIT_X "{ux}"')
            if uw:
                lines.append(f'   EINHEIT_W "{uw}"')
            if x_axis:
                lines.append("   ST/X   " + "   ".join(_fmt_value(v) for v in x_axis))
            if values:
                lines.append("   WERT   " + "   ".join(_fmt_value(v) for v in values))
            lines.append("END")
            lines.append("")

        elif ltype == "map":
            x_axis   = label.get("x_axis")  or []
            y_axis   = label.get("y_axis")  or []
            z_matrix = label.get("values")  or []
            cols = len(x_axis) or (len(z_matrix[0]) if z_matrix else 0)
            rows = len(y_axis) or len(z_matrix)
            lines.append(f"GRUPPENKENNFELD {name} {cols} {rows}")
            if long_id:
                lines.append(f'   LANGNAME "{long_id}"')
            ux = label.get("unit_x", "")
            uy = label.get("unit_y", "")
            uw = label.get("unit_w") or label.get("unit", "")
            if ux:
                lines.append(f'   EINHEIT_X "{ux}"')
            if uy:
                lines.append(f'   EINHEIT_Y "{uy}"')
            if uw:
                lines.append(f'   EINHEIT_W "{uw}"')
            if x_axis:
                lines.append("   ST/X   " + "   ".join(_fmt_value(v) for v in x_axis))
            for ri, row in enumerate(z_matrix):
                if ri < len(y_axis):
                    lines.append(f"   ST/Y   {_fmt_value(y_axis[ri])}")
                lines.append("   WERT   " + "   ".join(_fmt_value(v) for v in row))
            lines.append("END")
            lines.append("")

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines), encoding="iso-8859-1")
    return str(output_path)
