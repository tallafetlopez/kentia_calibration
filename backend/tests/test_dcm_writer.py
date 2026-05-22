"""DCM writer round-trip tests."""
import sys
from pathlib import Path
import tempfile

sys.path.insert(0, str(Path(__file__).parent.parent))

from parsers.dcm_writer import write_dcm
from parsers.dcm_parser import DCMParser


def test_scalar_roundtrip():
    labels = [
        {"name": "Test_Scalar", "type": "scalar", "value": 42.5, "unit": "kPa",
         "long_identifier": "Boost target"}
    ]
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "out.dcm"
        write_dcm(labels, path)
        parsed = DCMParser().parse(str(path))
        assert len(parsed["scalars"]) == 1
        s = parsed["scalars"][0]
        assert s["name"] == "Test_Scalar"
        assert abs(s["value"] - 42.5) < 1e-9


def test_curve_roundtrip():
    labels = [
        {"name": "Test_Curve", "type": "curve",
         "x_axis": [0.0, 1000.0, 2000.0, 3000.0],
         "values": [0.5, 0.8, 1.2, 1.5],
         "unit_x": "RPM", "unit_w": "bar"}
    ]
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "out.dcm"
        write_dcm(labels, path)
        parsed = DCMParser().parse(str(path))
        assert len(parsed["curves"]) == 1
        c = parsed["curves"][0]
        assert c["name"] == "Test_Curve"
        assert c["x_axis"] == [0.0, 1000.0, 2000.0, 3000.0]
        assert c["values"] == [0.5, 0.8, 1.2, 1.5]


def test_map_roundtrip():
    labels = [
        {"name": "Test_Map", "type": "map",
         "x_axis": [1000.0, 2000.0, 3000.0],
         "y_axis": [10.0, 50.0],
         "values": [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]],
         "unit_x": "RPM", "unit_y": "%", "unit_w": "deg"}
    ]
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "out.dcm"
        write_dcm(labels, path)
        parsed = DCMParser().parse(str(path))
        assert len(parsed["maps"]) == 1
        m = parsed["maps"][0]
        assert m["name"] == "Test_Map"
        assert m["values"] == [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]


def test_empty_labels():
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "empty.dcm"
        write_dcm([], path)
        parsed = DCMParser().parse(str(path))
        assert parsed["scalars"] == []
        assert parsed["curves"] == []
        assert parsed["maps"] == []


def test_header_written():
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "h.dcm"
        write_dcm([], path, header={"project": "TestProj", "dataset": "TestDS"})
        content = path.read_text(encoding="iso-8859-1")
        assert "TestProj" in content
        assert "TestDS" in content
        assert "KONSERVIERUNG_FORMAT 2.0" in content
