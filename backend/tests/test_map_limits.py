"""Tests for utils/map_limits.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from utils.map_limits import clamp_matrix, is_2d_matrix, matrix_dimensions, MAX_MAP_DIM


def test_no_clamp_needed():
    m = [[1, 2], [3, 4]]
    clamped, cx, cy, info = clamp_matrix(m)
    assert clamped == [[1, 2], [3, 4]]
    assert info is None


def test_clamp_rows():
    m = [[i] * 4 for i in range(20)]
    clamped, _, _, info = clamp_matrix(m)
    assert len(clamped) == MAX_MAP_DIM
    assert info["truncated"] is True
    assert info["original_dimensions"]["rows"] == 20


def test_clamp_cols():
    m = [list(range(20)) for _ in range(4)]
    clamped, _, _, info = clamp_matrix(m)
    assert all(len(row) == MAX_MAP_DIM for row in clamped)
    assert info["original_dimensions"]["cols"] == 20


def test_clamp_both():
    m = [[float(r * 20 + c) for c in range(20)] for r in range(20)]
    clamped, cx, cy, info = clamp_matrix(m, x_axis=list(range(20)), y_axis=list(range(20)))
    assert len(clamped) == MAX_MAP_DIM
    assert all(len(row) == MAX_MAP_DIM for row in clamped)
    assert len(cx) == MAX_MAP_DIM
    assert len(cy) == MAX_MAP_DIM
    assert info["original_dimensions"] == {"rows": 20, "cols": 20}


def test_axis_clamped_with_matrix():
    m = [[1.0] * 18 for _ in range(18)]
    x = list(range(18))
    y = list(range(18))
    clamped, cx, cy, info = clamp_matrix(m, x, y)
    assert len(cx) == MAX_MAP_DIM
    assert len(cy) == MAX_MAP_DIM


def test_non_matrix_passthrough():
    v = [1.0, 2.0, 3.0]
    result, _, _, info = clamp_matrix(v)
    assert result == v
    assert info is None
