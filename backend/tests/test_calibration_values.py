"""Tests for _apply_operation in calibration_values."""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "routers"))

from routers.calibration_values import _apply_operation
from models_calibration import CalibUpdate
from utils.map_limits import clamp_matrix, MAX_MAP_DIM


def make_body(operation, value=None, cells=None, smooth_passes=1):
    return CalibUpdate(
        operation=operation,
        value=value,
        cells=cells or [],
        smooth_passes=smooth_passes,
    )


def test_scalar_set():
    assert _apply_operation(5.0, "set", make_body("set", value=10.0)) == 10.0


def test_scalar_add():
    assert _apply_operation(5.0, "add", make_body("add", value=2.5)) == 7.5


def test_scalar_multiply():
    assert _apply_operation(4.0, "multiply", make_body("multiply", value=1.5)) == 6.0


def test_scalar_percentage():
    assert _apply_operation(100.0, "percentage", make_body("percentage", value=10)) == pytest.approx(110.0)


def test_curve_set_specific_cells():
    curve = [1.0, 2.0, 3.0, 4.0, 5.0]
    result = _apply_operation(curve, "set", make_body("set", value=99.0, cells=[[1], [3]]))
    assert result == [1.0, 99.0, 3.0, 99.0, 5.0]


def test_curve_interpolate():
    curve = [10.0, 0.0, 0.0, 0.0, 50.0]
    result = _apply_operation(curve, "interpolate", make_body("interpolate", cells=[[0], [4]]))
    assert result == [10.0, 20.0, 30.0, 40.0, 50.0]


def test_curve_smooth():
    curve = [1.0, 10.0, 1.0, 10.0, 1.0]
    result = _apply_operation(curve, "smooth", make_body("smooth", cells=[[1], [2], [3]], smooth_passes=1))
    assert result[1] == pytest.approx(4.0)
    assert result[3] == pytest.approx(4.0)


def test_map_set_rectangle():
    m = [[0.0, 0.0, 0.0],
         [0.0, 0.0, 0.0],
         [0.0, 0.0, 0.0]]
    result = _apply_operation(m, "set", make_body("set", value=5.0, cells=[[0, 0], [0, 1], [1, 0], [1, 1]]))
    assert result == [[5.0, 5.0, 0.0], [5.0, 5.0, 0.0], [0.0, 0.0, 0.0]]


def test_map_bilinear_interpolate():
    m = [[10.0, 0.0, 0.0, 0.0, 50.0],
         [0.0,  0.0, 0.0, 0.0,  0.0],
         [0.0,  0.0, 0.0, 0.0,  0.0],
         [0.0,  0.0, 0.0, 0.0,  0.0],
         [30.0, 0.0, 0.0, 0.0, 70.0]]
    cells = [[0, 0], [0, 4], [4, 0], [4, 4]]
    result = _apply_operation(m, "interpolate", make_body("interpolate", cells=cells))
    assert result[0][0] == 10.0
    assert result[0][4] == 50.0
    assert result[4][0] == 30.0
    assert result[4][4] == 70.0
    assert result[2][2] == pytest.approx(40.0)


def test_oversized_map_clamped_before_operation():
    """17x17 map must be clamped to 16x16 by clamp_matrix before any operation."""
    oversized = [[float(r * 17 + c) for c in range(17)] for r in range(17)]
    clamped, _, _, info = clamp_matrix(oversized)
    assert len(clamped) == MAX_MAP_DIM
    assert all(len(row) == MAX_MAP_DIM for row in clamped)
    assert info["truncated"] is True
    assert info["original_dimensions"] == {"rows": 17, "cols": 17}
    # After clamping, operations work normally on 16x16
    result = _apply_operation(clamped, "set", make_body("set", value=99.0, cells=[[0, 0]]))
    assert result[0][0] == 99.0
    assert len(result) == MAX_MAP_DIM
