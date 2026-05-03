"""
visualization/viz_api.py
─────────────────────────
FastAPI router that exposes the 3D visualization as an HTML endpoint.
Hook: add ONE line to backend/server.py (see instructions at bottom).
NON-DESTRUCTIVE — only adds a new router, touches nothing existing.

Integration (ONE line in backend/server.py, after existing app.include_router):
    from visualization.viz_api import viz_router
    app.include_router(viz_router)
"""

import sys
import os

# Allow import from project root when running from backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional

viz_router = APIRouter(prefix="/api/viz", tags=["visualization"])


async def _get_db(request: Request):
    """Reuse the existing db instance injected by the main app."""
    return request.app.state.db if hasattr(request.app.state, "db") else None


@viz_router.get(
    "/calibration-map/{dataset_id}",
    response_class=HTMLResponse,
    summary="3D Calibration Map for a dataset",
)
async def calibration_map(
    dataset_id: str,
    request: Request,
    compare_id: Optional[str] = None,
    mode: str = "surface",
    smooth: bool = True,
    x_col: str = "label_name",
    y_col: str = "confidence_status",
    z_col: str = "value_num",
):
    """
    Returns a self-contained HTML page with the interactive Plotly chart.

    Query params
    ────────────
    compare_id : second dataset id for overlay/delta modes
    mode       : surface | heatmap | overlay | delta | full
    smooth     : apply bicubic smoothing (default true)
    x_col      : X axis column
    y_col      : Y axis column
    z_col      : Z value column (must be numeric)
    """
    try:
        from visualization.heatmap_3d import CalibrationMap3D
    except ImportError as e:
        raise HTTPException(500, f"Visualization module import error: {e}")

    # ── Fetch labels from MongoDB ─────────────────────────────────────────────
    db = await _get_db(request)
    if db is None:
        # fallback: try to connect directly using env
        import os
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "herko_calibration")]

    labels_a = await db.labels.find({"dataset_id": dataset_id}, {"_id": 0}).to_list(10000)
    if not labels_a:
        raise HTTPException(404, f"No labels found for dataset {dataset_id}")

    labels_b = None
    ds_a = await db.datasets.find_one({"id": dataset_id}, {"_id": 0, "dataset_name": 1})
    ds_b_name = "Dataset B"
    if compare_id:
        labels_b = await db.labels.find({"dataset_id": compare_id}, {"_id": 0}).to_list(10000)
        ds_b = await db.datasets.find_one({"id": compare_id}, {"_id": 0, "dataset_name": 1})
        ds_b_name = ds_b["dataset_name"] if ds_b else "Dataset B"

    ds_a_name = ds_a["dataset_name"] if ds_a else dataset_id

    # ── Build figure ──────────────────────────────────────────────────────────
    try:
        viz = CalibrationMap3D(
            labels_a=labels_a,
            labels_b=labels_b,
            x_col=x_col,
            y_col=y_col,
            z_col=z_col,
            grid_size=40,
        )
        fig = viz.build(
            mode=mode,
            smooth=smooth,
            dataset_a_name=ds_a_name,
            dataset_b_name=ds_b_name,
        )
    except Exception as e:
        raise HTTPException(400, f"Visualization error: {e}")

    html = fig.to_html(
        full_html=True,
        include_plotlyjs="cdn",
        config={"displayModeBar": True, "scrollZoom": True},
    )
    return HTMLResponse(content=html)


@viz_router.get(
    "/calibration-map/{dataset_id}/json",
    summary="Return Plotly figure as JSON (for embedding in React via plotly.js)",
)
async def calibration_map_json(
    dataset_id: str,
    request: Request,
    compare_id: Optional[str] = None,
    mode: str = "surface",
    smooth: bool = True,
):
    """Returns the Plotly figure as JSON — use with react-plotly.js on the frontend."""
    try:
        from visualization.heatmap_3d import CalibrationMap3D
        import plotly.io as pio
    except ImportError as e:
        raise HTTPException(500, str(e))

    db = await _get_db(request)
    if db is None:
        import os
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[os.environ.get("DB_NAME", "herko_calibration")]

    labels_a = await db.labels.find({"dataset_id": dataset_id}, {"_id": 0}).to_list(10000)
    if not labels_a:
        raise HTTPException(404, "No labels found")

    labels_b = None
    if compare_id:
        labels_b = await db.labels.find({"dataset_id": compare_id}, {"_id": 0}).to_list(10000)

    viz = CalibrationMap3D(labels_a=labels_a, labels_b=labels_b)
    fig = viz.build(mode=mode, smooth=smooth)
    return pio.to_json(fig, validate=False)
