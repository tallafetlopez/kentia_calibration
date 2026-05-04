"""
Tests de los parsers de archivos ECU.

Ejecutar (desde la raíz del proyecto):
    python -m pytest calibrations/tests/test_parsers.py -v
    python -m unittest calibrations.tests.test_parsers -v
"""

import os
import struct
import tempfile
import unittest
from pathlib import Path

from calibrations.parsers.dcm_parser import DcmParser, DcmDataset


# ── Fragmento mínimo de DCM para tests unitarios ──────────────────────────────

MINIMAL_DCM = """\
KONSERVIERUNG_FORMAT 2.0

FESTWERT TestScalar
   LANGNAME "Un escalar de prueba"
   EINHEIT_W "rpm"
   WERT 1500.0000000000000000
END

STUETZSTELLENVERTEILUNG TestAxis 3
*SST
   LANGNAME "Eje de prueba"
   EINHEIT_X "rpm"
   ST/X   1000.0   2000.0   3000.0
END

GRUPPENKENNLINIE TestCurve 3
   LANGNAME "Curva de prueba"
   EINHEIT_X "rpm"
   EINHEIT_W "bar"
*SSTX  TestAxis
   ST/X   1000.0   2000.0   3000.0
   WERT   0.5   1.0   1.5
END

GRUPPENKENNFELD TestMap2D 3 2
   LANGNAME "Mapa 2D de prueba"
   EINHEIT_X "rpm"
   EINHEIT_Y "bar"
   EINHEIT_W "deg"
*SSTX  TestAxis
*SSTY  TestAxisY
   ST/X   1000.0   2000.0   3000.0
   ST/Y   25.0
   WERT   10.0   11.0   12.0
   ST/Y   50.0
   WERT   13.0   14.0   15.0
END

FESTWERTEBLOCK TestArray 4
   LANGNAME "Array de prueba"
   EINHEIT_W "V"
   WERT   1.1   2.2   3.3   4.4
END

TEXTSTRING TestText
   LANGNAME "Cadena de prueba"
   TEXT "hola mundo"
END
"""


def _write_tmp_dcm(content: str) -> str:
    """Escribe contenido DCM en un archivo temporal y devuelve su ruta."""
    tmp = tempfile.NamedTemporaryFile(
        mode="w", suffix=".DCM", encoding="iso-8859-1", delete=False
    )
    tmp.write(content)
    tmp.close()
    return tmp.name


# ── Tests del DcmParser ───────────────────────────────────────────────────────

class TestDcmParser(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp_path = _write_tmp_dcm(MINIMAL_DCM)
        cls.parser = DcmParser()
        cls.ds = cls.parser.parse(cls.tmp_path)

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.tmp_path)

    # ── Cabecera ─────────────────────────────────────────────────────────────

    def test_version(self):
        self.assertEqual(self.ds.version, "2.0")

    def test_no_parse_errors(self):
        self.assertEqual(
            len(self.ds.parse_errors), 0,
            msg=f"Errores inesperados: {self.ds.parse_errors}"
        )

    # ── FESTWERT ─────────────────────────────────────────────────────────────

    def test_scalar_exists(self):
        self.assertIn("TestScalar", self.ds.scalars)

    def test_scalar_value(self):
        self.assertAlmostEqual(self.ds.scalars["TestScalar"].value, 1500.0)

    def test_scalar_unit(self):
        self.assertEqual(self.ds.scalars["TestScalar"].unit, "rpm")

    def test_scalar_description(self):
        self.assertEqual(self.ds.scalars["TestScalar"].description, "Un escalar de prueba")

    # ── STUETZSTELLENVERTEILUNG ───────────────────────────────────────────────

    def test_breakpoints_exists(self):
        self.assertIn("TestAxis", self.ds.breakpoints)

    def test_breakpoints_count(self):
        self.assertEqual(len(self.ds.breakpoints["TestAxis"].values), 3)

    def test_breakpoints_values(self):
        bp = self.ds.breakpoints["TestAxis"]
        self.assertAlmostEqual(bp.values[0], 1000.0)
        self.assertAlmostEqual(bp.values[1], 2000.0)
        self.assertAlmostEqual(bp.values[2], 3000.0)

    def test_breakpoints_unit(self):
        self.assertEqual(self.ds.breakpoints["TestAxis"].unit_x, "rpm")

    # ── GRUPPENKENNLINIE ─────────────────────────────────────────────────────

    def test_curve_exists(self):
        self.assertIn("TestCurve", self.ds.curves)

    def test_curve_values_count(self):
        self.assertEqual(len(self.ds.curves["TestCurve"].values), 3)

    def test_curve_values(self):
        c = self.ds.curves["TestCurve"]
        self.assertAlmostEqual(c.values[0], 0.5)
        self.assertAlmostEqual(c.values[1], 1.0)
        self.assertAlmostEqual(c.values[2], 1.5)

    def test_curve_axis_ref(self):
        self.assertEqual(self.ds.curves["TestCurve"].axis_x_ref, "TestAxis")

    def test_curve_axis_x(self):
        c = self.ds.curves["TestCurve"]
        self.assertEqual(len(c.axis_x), 3)
        self.assertAlmostEqual(c.axis_x[0], 1000.0)

    def test_curve_units(self):
        c = self.ds.curves["TestCurve"]
        self.assertEqual(c.unit_x, "rpm")
        self.assertEqual(c.unit_w, "bar")

    # ── GRUPPENKENNFELD ──────────────────────────────────────────────────────

    def test_map2d_exists(self):
        self.assertIn("TestMap2D", self.ds.maps)

    def test_map2d_dimensions(self):
        m = self.ds.maps["TestMap2D"]
        self.assertEqual(m.nx, 3)
        self.assertEqual(m.ny, 2)

    def test_map2d_data_shape(self):
        m = self.ds.maps["TestMap2D"]
        self.assertEqual(len(m.data), 2)       # 2 filas (NY)
        self.assertEqual(len(m.data[0]), 3)    # 3 columnas (NX)
        self.assertEqual(len(m.data[1]), 3)

    def test_map2d_data_values(self):
        m = self.ds.maps["TestMap2D"]
        self.assertAlmostEqual(m.data[0][0], 10.0)   # ST/Y=25, col 0
        self.assertAlmostEqual(m.data[0][1], 11.0)   # ST/Y=25, col 1
        self.assertAlmostEqual(m.data[0][2], 12.0)   # ST/Y=25, col 2
        self.assertAlmostEqual(m.data[1][0], 13.0)   # ST/Y=50, col 0
        self.assertAlmostEqual(m.data[1][2], 15.0)   # ST/Y=50, col 2

    def test_map2d_axis_x(self):
        m = self.ds.maps["TestMap2D"]
        self.assertEqual(len(m.axis_x), 3)
        self.assertAlmostEqual(m.axis_x[2], 3000.0)

    def test_map2d_axis_y(self):
        m = self.ds.maps["TestMap2D"]
        self.assertEqual(len(m.axis_y), 2)
        self.assertAlmostEqual(m.axis_y[0], 25.0)
        self.assertAlmostEqual(m.axis_y[1], 50.0)

    def test_map2d_units(self):
        m = self.ds.maps["TestMap2D"]
        self.assertEqual(m.unit_x, "rpm")
        self.assertEqual(m.unit_y, "bar")
        self.assertEqual(m.unit_w, "deg")

    # ── FESTWERTEBLOCK ───────────────────────────────────────────────────────

    def test_array_exists(self):
        self.assertIn("TestArray", self.ds.arrays)

    def test_array_values(self):
        a = self.ds.arrays["TestArray"]
        self.assertEqual(len(a.values), 4)
        self.assertAlmostEqual(a.values[0], 1.1)
        self.assertAlmostEqual(a.values[3], 4.4)

    def test_array_unit(self):
        self.assertEqual(self.ds.arrays["TestArray"].unit, "V")

    # ── TEXTSTRING ───────────────────────────────────────────────────────────

    def test_textstring_exists(self):
        self.assertIn("TestText", self.ds.text_strings)

    def test_textstring_value(self):
        self.assertEqual(self.ds.text_strings["TestText"].text, "hola mundo")

    # ── Contadores totales ────────────────────────────────────────────────────

    def test_total_scalars(self):
        self.assertEqual(len(self.ds.scalars), 1)

    def test_total_breakpoints(self):
        self.assertEqual(len(self.ds.breakpoints), 1)

    def test_total_curves(self):
        self.assertEqual(len(self.ds.curves), 1)

    def test_total_maps(self):
        self.assertEqual(len(self.ds.maps), 1)

    def test_total_arrays(self):
        self.assertEqual(len(self.ds.arrays), 1)

    def test_total_text_strings(self):
        self.assertEqual(len(self.ds.text_strings), 1)


# ── Test de integración contra el archivo real ────────────────────────────────

_REAL_DCM = Path(__file__).resolve().parents[2] / "HKSW_0A_03_102_00_1D_120KMH_251120.DCM"


@unittest.skipUnless(_REAL_DCM.exists(), f"Archivo real no encontrado: {_REAL_DCM}")
class TestDcmParserReal(unittest.TestCase):
    """Tests contra el archivo .DCM real del proyecto."""

    @classmethod
    def setUpClass(cls):
        cls.ds = DcmParser().parse(_REAL_DCM)

    def test_version_real(self):
        self.assertEqual(self.ds.version, "2.0")

    def test_scalars_count(self):
        self.assertEqual(len(self.ds.scalars), 1634)

    def test_maps_count(self):
        self.assertEqual(len(self.ds.maps), 72)

    def test_curves_count(self):
        self.assertEqual(len(self.ds.curves), 65)

    def test_arrays_count(self):
        self.assertEqual(len(self.ds.arrays), 23)

    def test_breakpoints_count(self):
        self.assertEqual(len(self.ds.breakpoints), 209)

    def test_text_strings_count(self):
        self.assertEqual(len(self.ds.text_strings), 9)

    def test_no_parse_errors_real(self):
        self.assertEqual(
            len(self.ds.parse_errors), 0,
            msg=f"Errores: {self.ds.parse_errors[:5]}"
        )

    def test_known_scalar_value(self):
        """ADMc_C_ComprNormRefTemp debe existir y tener valor numérico."""
        self.assertIn("ADMc_C_ComprNormRefTemp", self.ds.scalars)
        val = self.ds.scalars["ADMc_C_ComprNormRefTemp"].value
        self.assertIsInstance(val, float)

    def test_known_map_shape(self):
        """ADMm_NU_BoostIGain_z debe ser un mapa 6×9."""
        self.assertIn("ADMm_NU_BoostIGain_z", self.ds.maps)
        m = self.ds.maps["ADMm_NU_BoostIGain_z"]
        self.assertEqual(m.nx, 6)
        self.assertEqual(m.ny, 9)
        self.assertEqual(len(m.data), 9)
        self.assertEqual(len(m.data[0]), 6)


if __name__ == "__main__":
    unittest.main(verbosity=2)
