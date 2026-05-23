"""Single source of truth for map dimension cap across the SW Releases module."""
from __future__ import annotations
from typing import Any, Sequence

MAX_MAP_DIM: int = 16


def is_2d_matrix(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) > 0
        and isinstance(value[0], list)
    )


def matrix_dimensions(matrix: Sequence[Sequence[Any]]) -> tuple[int, int]:
    if not matrix:
        return 0, 0
    rows = len(matrix)
    cols = max((len(r) for r in matrix), default=0)
    return rows, cols


def clamp_matrix(
    matrix: Sequence[Sequence[Any]],
    x_axis: Sequence[Any] | None = None,
    y_axis: Sequence[Any] | None = None,
) -> tuple[list[list[Any]], list[Any] | None, list[Any] | None, dict | None]:
    """
    Truncate matrix to leading MAX_MAP_DIM x MAX_MAP_DIM submatrix and align
    axis arrays. Returns (clamped_matrix, clamped_x, clamped_y, info) where
    info is None if no truncation, else:
        {"truncated": True, "original_dimensions": {"rows": int, "cols": int}}
    """
    if not is_2d_matrix(matrix):
        return (
            list(matrix),
            list(x_axis) if x_axis else None,
            list(y_axis) if y_axis else None,
            None,
        )

    rows, cols = matrix_dimensions(matrix)
    if rows <= MAX_MAP_DIM and cols <= MAX_MAP_DIM:
        normalized = [list(r) + [None] * (cols - len(r)) for r in matrix]
        return (
            normalized,
            list(x_axis) if x_axis else None,
            list(y_axis) if y_axis else None,
            None,
        )

    new_rows = min(rows, MAX_MAP_DIM)
    new_cols = min(cols, MAX_MAP_DIM)
    clamped = [list(matrix[r][:new_cols]) for r in range(new_rows)]
    clamped_x = list(x_axis[:new_cols]) if x_axis else None
    clamped_y = list(y_axis[:new_rows]) if y_axis else None
    info = {
        "truncated": True,
        "original_dimensions": {"rows": rows, "cols": cols},
    }
    return clamped, clamped_x, clamped_y, info
