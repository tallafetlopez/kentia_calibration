"""
visualization/data_processor.py
────────────────────────────────
Data processing layer for the 3D calibration map visualizer.
Handles: missing values, non-uniform grids, interpolation, scaling, delta computation.
NON-DESTRUCTIVE — does not import or modify any existing module.
"""

import numpy as np
import pandas as pd
from scipy.interpolate import griddata, RectBivariateSpline
from typing import Optional, Tuple, Dict, List


# ── Public API ────────────────────────────────────────────────────────────────

def labels_to_dataframe(labels: List[dict]) -> pd.DataFrame:
    """
    Convert a list of label dicts (as returned by /api/datasets/{id}/labels)
    into a tidy DataFrame with numeric current_value where possible.
    """
    df = pd.DataFrame(labels)
    if df.empty:
        return df
    df["value_num"] = pd.to_numeric(df["current_value"], errors="coerce")
    return df


def build_surface_data(
    df: pd.DataFrame,
    x_col: str = "label_name",
    y_col: str = "confidence_status",
    z_col: str = "value_num",
    grid_size: int = 40,
    smooth: bool = True,
) -> Dict:
    """
    Build a dict with X, Y, Z arrays ready for Plotly surface/heatmap.

    Parameters
    ----------
    df        : tidy DataFrame (output of labels_to_dataframe)
    x_col     : column to use as X axis (categorical → encoded)
    y_col     : column to use as Y axis (categorical → encoded)
    z_col     : numeric column for Z values
    grid_size : resolution of the interpolated grid
    smooth    : apply bicubic smoothing

    Returns
    -------
    dict with keys: xi, yi, zi, x_labels, y_labels, raw_x, raw_y, raw_z
    """
    work = df[[x_col, y_col, z_col]].dropna(subset=[z_col]).copy()
    if work.empty:
        raise ValueError(f"No numeric data in column '{z_col}' after dropping NaN.")

    # Encode categoricals to integers
    x_cats = sorted(work[x_col].astype(str).unique())
    y_cats = sorted(work[y_col].astype(str).unique())
    x_enc = {v: i for i, v in enumerate(x_cats)}
    y_enc = {v: i for i, v in enumerate(y_cats)}

    work["_x"] = work[x_col].astype(str).map(x_enc).astype(float)
    work["_y"] = work[y_col].astype(str).map(y_enc).astype(float)

    raw_x = work["_x"].values
    raw_y = work["_y"].values
    raw_z = work[z_col].values

    # Uniform grid
    xi = np.linspace(raw_x.min(), raw_x.max(), grid_size)
    yi = np.linspace(raw_y.min(), raw_y.max(), grid_size)
    XI, YI = np.meshgrid(xi, yi)

    # Interpolate scattered → grid
    zi = griddata(
        points=np.column_stack([raw_x, raw_y]),
        values=raw_z,
        xi=(XI, YI),
        method="linear",
        fill_value=np.nanmean(raw_z),
    )

    if smooth and zi.shape[0] > 3 and zi.shape[1] > 3:
        try:
            spline = RectBivariateSpline(yi, xi, zi, kx=3, ky=3)
            zi = spline(yi, xi)
        except Exception:
            pass  # fall back to griddata result

    return {
        "xi": xi,
        "yi": yi,
        "zi": zi,
        "XI": XI,
        "YI": YI,
        "x_labels": x_cats,
        "y_labels": y_cats,
        "raw_x": raw_x,
        "raw_y": raw_y,
        "raw_z": raw_z,
    }


def compute_delta(
    df_a: pd.DataFrame,
    df_b: pd.DataFrame,
    key_col: str = "label_name",
    value_col: str = "value_num",
) -> pd.DataFrame:
    """
    Compute the numeric delta between two datasets aligned by key_col.
    Returns a DataFrame with columns: label_name, value_a, value_b, delta, pct_change.
    """
    a = df_a[[key_col, value_col]].dropna().rename(columns={value_col: "value_a"})
    b = df_b[[key_col, value_col]].dropna().rename(columns={value_col: "value_b"})
    merged = pd.merge(a, b, on=key_col, how="outer")
    merged["delta"] = merged["value_b"] - merged["value_a"]
    merged["pct_change"] = (merged["delta"] / merged["value_a"].replace(0, np.nan)) * 100
    return merged.sort_values("delta", key=abs, ascending=False).reset_index(drop=True)


def scale_values(arr: np.ndarray, method: str = "minmax") -> np.ndarray:
    """Normalize array. method: 'minmax' | 'zscore'"""
    if method == "zscore":
        std = arr.std()
        return (arr - arr.mean()) / std if std != 0 else arr - arr.mean()
    lo, hi = np.nanmin(arr), np.nanmax(arr)
    return (arr - lo) / (hi - lo) if hi != lo else np.zeros_like(arr)
