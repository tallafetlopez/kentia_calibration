"""
DCM Parser — DAMOS 2.0 format (Bosch/ETAS standard)
Encoding: ISO-8859-1

Supported block types:
  - FESTWERT             → scalar
  - GRUPPENKENNLINIE     → 1D curve
  - GRUPPENKENNFELD      → 2D map
  - STUETZSTELLENVERTEILUNG → shared axis definition
"""

from __future__ import annotations
import logging
import re
import sys
from pathlib import Path
from typing import Union

_PARSERS_DIR = Path(__file__).parent
_BACKEND_DIR = _PARSERS_DIR.parent
for _d in (str(_PARSERS_DIR), str(_BACKEND_DIR)):
    if _d not in sys.path:
        sys.path.insert(0, _d)

from utils.map_limits import clamp_matrix, MAX_MAP_DIM  # noqa: E402

_log = logging.getLogger(__name__)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _parse_floats(tokens: list[str]) -> list[float]:
    result = []
    for t in tokens:
        try:
            result.append(float(t))
        except ValueError:
            pass
    return result


class DCMParser:
    """Parse a DAMOS 2.0 .dcm file and return a structured dict."""

    def parse(self, filepath: str) -> dict:
        path = Path(filepath)
        with path.open(encoding="iso-8859-1", errors="replace") as fh:
            lines = fh.readlines()

        # Strip trailing whitespace but keep original structure
        lines = [ln.rstrip("\n\r") for ln in lines]

        metadata = {"format": "DAMOS 2.0", "created_by": "", "project": "", "dataset": ""}
        scalars: list[dict] = []
        curves: list[dict] = []
        maps: list[dict] = []
        axes: list[dict] = []

        i = 0
        n = len(lines)

        while i < n:
            raw = lines[i]
            stripped = raw.strip()

            # Skip pure comment lines or blank
            if not stripped or stripped.startswith("*"):
                # Try to extract metadata from top-level comments
                if stripped.startswith("* project"):
                    metadata["project"] = stripped[9:].strip()
                elif stripped.startswith("* dataset") or stripped.startswith("* Dataset"):
                    metadata["dataset"] = stripped[9:].strip()
                elif stripped.startswith("* created by") or stripped.startswith("* Created by"):
                    metadata["created_by"] = stripped[12:].strip()
                i += 1
                continue

            # ── FESTWERT (scalar) ──────────────────────────────────────────
            if stripped.startswith("FESTWERT "):
                parts = stripped.split(None, 1)
                name = parts[1].strip() if len(parts) > 1 else ""
                block: dict = {"name": name, "long_name": "", "unit": "", "value": 0.0, "type": "scalar"}
                i += 1
                while i < n:
                    bl = lines[i].strip()
                    if bl == "END":
                        i += 1
                        break
                    if bl.startswith("*"):
                        i += 1
                        continue
                    if bl.startswith("LANGNAME"):
                        block["long_name"] = bl[9:].strip().strip('"')
                    elif bl.startswith("EINHEIT_W"):
                        block["unit"] = bl[10:].strip().strip('"')
                    elif bl.startswith("WERT"):
                        rest = bl[4:].strip()
                        try:
                            block["value"] = float(rest)
                        except ValueError:
                            block["value"] = rest
                    elif bl.startswith("TEXT"):
                        block["value"] = bl[4:].strip().strip('"')
                    i += 1
                scalars.append(block)
                continue

            # ── GRUPPENKENNLINIE (1D curve) ────────────────────────────────
            if stripped.startswith("GRUPPENKENNLINIE "):
                parts = stripped.split()
                # GRUPPENKENNLINIE <name> <size>
                name = parts[1] if len(parts) > 1 else ""
                size = int(parts[2]) if len(parts) > 2 else 0
                block = {
                    "name": name, "long_name": "", "unit_x": "", "unit_w": "",
                    "x_axis": [], "values": [], "size": size, "type": "curve"
                }
                i += 1
                collecting_x = False
                collecting_w = False
                while i < n:
                    bl = lines[i].strip()
                    if bl == "END":
                        i += 1
                        break
                    if bl.startswith("*"):
                        i += 1
                        continue
                    if bl.startswith("LANGNAME"):
                        block["long_name"] = bl[9:].strip().strip('"')
                        collecting_x = collecting_w = False
                    elif bl.startswith("EINHEIT_X"):
                        block["unit_x"] = bl[10:].strip().strip('"')
                        collecting_x = collecting_w = False
                    elif bl.startswith("EINHEIT_W"):
                        block["unit_w"] = bl[10:].strip().strip('"')
                        collecting_x = collecting_w = False
                    elif bl.startswith("ST/X"):
                        rest = bl[4:].strip()
                        block["x_axis"].extend(_parse_floats(rest.split()))
                        collecting_x = True
                        collecting_w = False
                    elif bl.startswith("WERT"):
                        rest = bl[4:].strip()
                        block["values"].extend(_parse_floats(rest.split()))
                        collecting_w = True
                        collecting_x = False
                    elif collecting_x and re.match(r"^-?[\d. ]+$", bl):
                        block["x_axis"].extend(_parse_floats(bl.split()))
                    elif collecting_w and re.match(r"^-?[\d. ]+$", bl):
                        block["values"].extend(_parse_floats(bl.split()))
                    else:
                        collecting_x = collecting_w = False
                    i += 1
                curves.append(block)
                continue

            # ── GRUPPENKENNFELD (2D map) ───────────────────────────────────
            if stripped.startswith("GRUPPENKENNFELD "):
                parts = stripped.split()
                # GRUPPENKENNFELD <name> <cols> <rows>
                name = parts[1] if len(parts) > 1 else ""
                cols = int(parts[2]) if len(parts) > 2 else 0
                rows = int(parts[3]) if len(parts) > 3 else 0
                block = {
                    "name": name, "long_name": "", "unit_x": "", "unit_y": "", "unit_w": "",
                    "x_axis": [], "y_axis": [], "values": [],
                    "rows": rows, "cols": cols, "type": "map"
                }
                i += 1
                current_y: Union[float, None] = None
                collecting_x = False
                current_row: list[float] = []

                while i < n:
                    bl = lines[i].strip()
                    if bl == "END":
                        # flush last row
                        if current_row:
                            block["values"].append(current_row)
                            current_row = []
                        i += 1
                        break
                    if bl.startswith("*"):
                        i += 1
                        continue
                    if bl.startswith("LANGNAME"):
                        block["long_name"] = bl[9:].strip().strip('"')
                    elif bl.startswith("EINHEIT_X"):
                        block["unit_x"] = bl[10:].strip().strip('"')
                    elif bl.startswith("EINHEIT_Y"):
                        block["unit_y"] = bl[10:].strip().strip('"')
                    elif bl.startswith("EINHEIT_W"):
                        block["unit_w"] = bl[10:].strip().strip('"')
                    elif bl.startswith("ST/X"):
                        rest = bl[4:].strip()
                        block["x_axis"].extend(_parse_floats(rest.split()))
                        collecting_x = True
                    elif bl.startswith("ST/Y"):
                        # flush previous row
                        if current_row:
                            block["values"].append(current_row)
                            current_row = []
                        rest = bl[4:].strip()
                        vals = _parse_floats(rest.split())
                        if vals:
                            current_y = vals[0]
                            block["y_axis"].append(current_y)
                        collecting_x = False
                    elif bl.startswith("WERT"):
                        rest = bl[4:].strip()
                        current_row.extend(_parse_floats(rest.split()))
                        collecting_x = False
                    elif collecting_x and re.match(r"^-?[\d. eE+\-]+$", bl):
                        block["x_axis"].extend(_parse_floats(bl.split()))
                    elif current_y is not None and re.match(r"^-?[\d. eE+\-]+$", bl):
                        current_row.extend(_parse_floats(bl.split()))
                    i += 1
                maps.append(block)
                continue

            # ── STUETZSTELLENVERTEILUNG (shared axis) ─────────────────────
            if stripped.startswith("STUETZSTELLENVERTEILUNG "):
                parts = stripped.split()
                name = parts[1] if len(parts) > 1 else ""
                block = {"name": name, "long_name": "", "unit": "", "points": []}
                i += 1
                collecting = False
                while i < n:
                    bl = lines[i].strip()
                    if bl == "END":
                        i += 1
                        break
                    if bl.startswith("*"):
                        i += 1
                        continue
                    if bl.startswith("LANGNAME"):
                        block["long_name"] = bl[9:].strip().strip('"')
                        collecting = False
                    elif bl.startswith("EINHEIT_X"):
                        block["unit"] = bl[10:].strip().strip('"')
                        collecting = False
                    elif bl.startswith("ST/X"):
                        rest = bl[4:].strip()
                        block["points"].extend(_parse_floats(rest.split()))
                        collecting = True
                    elif collecting and re.match(r"^-?[\d. ]+$", bl):
                        block["points"].extend(_parse_floats(bl.split()))
                    else:
                        collecting = False
                    i += 1
                axes.append(block)
                continue

            i += 1

        # Clamp all maps to MAX_MAP_DIM × MAX_MAP_DIM
        for m in maps:
            clamped, cx, cy, info = clamp_matrix(
                m.get("values", []),
                m.get("x_axis"),
                m.get("y_axis"),
            )
            m["values"] = clamped
            if cx is not None:
                m["x_axis"] = cx
            if cy is not None:
                m["y_axis"] = cy
            if info:
                m["truncated"] = True
                m["original_dimensions"] = info["original_dimensions"]
                _log.warning(
                    "Map %s truncated from %dx%d to %dx%d",
                    m.get("name", "?"),
                    info["original_dimensions"]["rows"],
                    info["original_dimensions"]["cols"],
                    len(clamped),
                    len(clamped[0]) if clamped else 0,
                )
            # Keep rows/cols consistent with clamped size
            m["rows"] = len(clamped)
            m["cols"] = len(clamped[0]) if clamped else 0

        return {
            "metadata": metadata,
            "scalars": scalars,
            "curves": curves,
            "maps": maps,
            "axes": axes,
            "summary": {
                "total_scalars": len(scalars),
                "total_curves": len(curves),
                "total_maps": len(maps),
                "total_axes": len(axes),
            },
        }
