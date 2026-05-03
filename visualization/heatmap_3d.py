"""
visualization/heatmap_3d.py
────────────────────────────
Plotly-based 3D surface + 2D heatmap visualization for calibration label data.
NON-DESTRUCTIVE — standalone module, no existing code modified.

Usage
-----
    from visualization.heatmap_3d import CalibrationMap3D
    viz = CalibrationMap3D(labels_a, labels_b)   # labels_b optional
    fig = viz.build(mode="surface")              # or "heatmap" / "delta" / "overlay"
    fig.show()
"""

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from typing import List, Optional, Dict

from visualization.data_processor import (
    labels_to_dataframe,
    build_surface_data,
    compute_delta,
)

# ── Office-style colour palette ───────────────────────────────────────────────
_COLORSCALE_MAIN  = "RdYlGn"   # green=high, red=low
_COLORSCALE_DELTA = "RdBu"     # blue=negative delta, red=positive
_BG               = "#F3F3F3"
_PAPER_BG         = "#FFFFFF"
_FONT_FAMILY      = "Segoe UI, Arial, sans-serif"
_FONT_COLOR       = "#212121"
_GRID_COLOR       = "#C8C8C8"
_MS_BLUE          = "#2B579A"


class CalibrationMap3D:
    """
    Interactive 3D calibration map visualizer.

    Parameters
    ----------
    labels_a : list[dict]  — primary dataset labels (from API)
    labels_b : list[dict]  — optional second dataset for compare/delta
    x_col    : column for X axis  (default: label_name)
    y_col    : column for Y axis  (default: confidence_status)
    z_col    : column for Z value (default: value_num)
    grid_size: interpolation resolution
    """

    def __init__(
        self,
        labels_a: List[dict],
        labels_b: Optional[List[dict]] = None,
        x_col: str = "label_name",
        y_col: str = "confidence_status",
        z_col: str = "value_num",
        grid_size: int = 40,
    ):
        self.x_col = x_col
        self.y_col = y_col
        self.z_col = z_col
        self.grid_size = grid_size

        self.df_a = labels_to_dataframe(labels_a)
        self.df_b = labels_to_dataframe(labels_b) if labels_b else None

        self._surf_a: Optional[Dict] = None
        self._surf_b: Optional[Dict] = None
        self._delta_df: Optional[pd.DataFrame] = None

    # ── Public ────────────────────────────────────────────────────────────────

    def build(
        self,
        mode: str = "surface",
        smooth: bool = True,
        dataset_a_name: str = "Dataset A",
        dataset_b_name: str = "Dataset B",
    ) -> go.Figure:
        """
        Build and return a Plotly Figure.

        mode options
        ────────────
        'surface'  — 3D surface of dataset A
        'heatmap'  — 2D heatmap of dataset A
        'overlay'  — 3D surface A + B overlaid (requires labels_b)
        'delta'    — 3D surface of (B - A) delta (requires labels_b)
        'full'     — 2×2 dashboard: surface A, heatmap A, delta surface, delta bar
        """
        self._surf_a = build_surface_data(
            self.df_a, self.x_col, self.y_col, self.z_col,
            self.grid_size, smooth
        )

        if self.df_b is not None:
            self._surf_b = build_surface_data(
                self.df_b, self.x_col, self.y_col, self.z_col,
                self.grid_size, smooth
            )
            self._delta_df = compute_delta(self.df_a, self.df_b)

        dispatch = {
            "surface": self._fig_surface,
            "heatmap": self._fig_heatmap,
            "overlay": self._fig_overlay,
            "delta":   self._fig_delta,
            "full":    self._fig_full_dashboard,
        }
        if mode not in dispatch:
            raise ValueError(f"Unknown mode '{mode}'. Choose: {list(dispatch)}")

        fig = dispatch[mode](
            dataset_a_name=dataset_a_name,
            dataset_b_name=dataset_b_name,
        )
        self._apply_office_theme(fig)
        return fig

    # ── Private builders ──────────────────────────────────────────────────────

    def _fig_surface(self, dataset_a_name="Dataset A", **_) -> go.Figure:
        s = self._surf_a
        fig = go.Figure()
        fig.add_trace(self._surface_trace(s, _COLORSCALE_MAIN, dataset_a_name, opacity=0.9))
        fig.add_trace(self._scatter_trace(s, dataset_a_name))
        fig.update_layout(
            title=dict(text=f"3D Calibration Surface — {dataset_a_name}", font_size=14),
            scene=self._scene_layout(s),
        )
        return fig

    def _fig_heatmap(self, dataset_a_name="Dataset A", **_) -> go.Figure:
        s = self._surf_a
        fig = go.Figure()
        fig.add_trace(go.Heatmap(
            z=s["zi"],
            x=s["x_labels"],
            y=s["y_labels"],
            colorscale=_COLORSCALE_MAIN,
            colorbar=dict(title="Value", tickfont_size=10),
            hoverongaps=False,
            hovertemplate="X: %{x}<br>Y: %{y}<br>Value: %{z:.3f}<extra></extra>",
        ))
        fig.update_layout(
            title=dict(text=f"2D Heatmap — {dataset_a_name}", font_size=14),
            xaxis=dict(title=self.x_col, tickangle=-45, tickfont_size=9),
            yaxis=dict(title=self.y_col, tickfont_size=9),
        )
        return fig

    def _fig_overlay(self, dataset_a_name="Dataset A", dataset_b_name="Dataset B", **_) -> go.Figure:
        self._require_b("overlay")
        sa, sb = self._surf_a, self._surf_b
        fig = go.Figure()
        fig.add_trace(self._surface_trace(sa, "Blues",  dataset_a_name, opacity=0.65))
        fig.add_trace(self._surface_trace(sb, "Oranges", dataset_b_name, opacity=0.65))
        fig.update_layout(
            title=dict(text=f"3D Overlay — {dataset_a_name} vs {dataset_b_name}", font_size=14),
            scene=self._scene_layout(sa),
        )
        return fig

    def _fig_delta(self, dataset_a_name="Dataset A", dataset_b_name="Dataset B", **_) -> go.Figure:
        self._require_b("delta")
        sa, sb = self._surf_a, self._surf_b
        # Align grids (use A's grid, interpolate B onto it)
        zi_delta = sb["zi"] - sa["zi"]
        fig = go.Figure()
        fig.add_trace(go.Surface(
            x=sa["XI"], y=sa["YI"], z=zi_delta,
            colorscale=_COLORSCALE_DELTA,
            colorbar=dict(title="Δ Value", tickfont_size=10),
            opacity=0.9,
            name=f"Δ ({dataset_b_name} − {dataset_a_name})",
            hovertemplate="Δ: %{z:.4f}<extra></extra>",
        ))
        fig.update_layout(
            title=dict(text=f"Delta Surface — {dataset_b_name} − {dataset_a_name}", font_size=14),
            scene=self._scene_layout(sa, z_title="Δ Value"),
        )
        return fig

    def _fig_full_dashboard(self, dataset_a_name="Dataset A", dataset_b_name="Dataset B", **_) -> go.Figure:
        """2×2 dashboard: surface A | heatmap A | delta surface | delta bar chart"""
        has_b = self.df_b is not None
        specs = [
            [{"type": "surface"}, {"type": "heatmap"}],
            [{"type": "surface"} if has_b else {"type": "xy"},
             {"type": "bar"}],
        ]
        fig = make_subplots(
            rows=2, cols=2,
            specs=specs,
            subplot_titles=[
                f"3D Surface — {dataset_a_name}",
                f"2D Heatmap — {dataset_a_name}",
                f"Delta Surface — B−A" if has_b else "No second dataset",
                "Top Δ Labels (bar)",
            ],
            horizontal_spacing=0.08,
            vertical_spacing=0.12,
        )

        sa = self._surf_a

        # Row 1 Col 1 — 3D surface A
        fig.add_trace(self._surface_trace(sa, _COLORSCALE_MAIN, dataset_a_name, opacity=0.9), row=1, col=1)

        # Row 1 Col 2 — heatmap A
        fig.add_trace(go.Heatmap(
            z=sa["zi"], colorscale=_COLORSCALE_MAIN,
            showscale=True, hoverongaps=False,
            hovertemplate="Value: %{z:.3f}<extra></extra>",
        ), row=1, col=2)

        # Row 2 Col 1 — delta surface or placeholder
        if has_b:
            sb = self._surf_b
            zi_delta = sb["zi"] - sa["zi"]
            fig.add_trace(go.Surface(
                x=sa["XI"], y=sa["YI"], z=zi_delta,
                colorscale=_COLORSCALE_DELTA, opacity=0.9,
                showscale=False,
                hovertemplate="Δ: %{z:.4f}<extra></extra>",
            ), row=2, col=1)
        else:
            fig.add_trace(go.Scatter(x=[0], y=[0], mode="text",
                text=["Load a second dataset<br>to see delta"],
                textfont=dict(size=12, color="#8A8886")), row=2, col=1)

        # Row 2 Col 2 — top delta bar
        if has_b and self._delta_df is not None:
            top = self._delta_df.head(15)
            colors = ["#C00000" if d > 0 else "#2B579A" for d in top["delta"]]
            fig.add_trace(go.Bar(
                x=top["label_name"].astype(str),
                y=top["delta"],
                marker_color=colors,
                name="Δ per label",
                hovertemplate="%{x}<br>Δ = %{y:.4f}<extra></extra>",
            ), row=2, col=2)
        else:
            fig.add_trace(go.Bar(x=[], y=[]), row=2, col=2)

        fig.update_layout(
            title=dict(text="Calibration Map — Full Dashboard", font_size=15),
            height=820,
        )
        return fig

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _surface_trace(self, s: Dict, colorscale: str, name: str, opacity: float = 0.9) -> go.Surface:
        return go.Surface(
            x=s["XI"], y=s["YI"], z=s["zi"],
            colorscale=colorscale,
            opacity=opacity,
            name=name,
            colorbar=dict(title="Value", tickfont_size=10, len=0.5),
            hovertemplate="Value: %{z:.4f}<extra></extra>",
        )

    def _scatter_trace(self, s: Dict, name: str) -> go.Scatter3d:
        return go.Scatter3d(
            x=s["raw_x"], y=s["raw_y"], z=s["raw_z"],
            mode="markers",
            marker=dict(size=3, color=s["raw_z"], colorscale=_COLORSCALE_MAIN,
                        opacity=0.8, line=dict(width=0)),
            name=f"{name} (raw)",
            hovertemplate="Raw value: %{z:.4f}<extra></extra>",
        )

    @staticmethod
    def _scene_layout(s: Dict, z_title: str = "Value") -> dict:
        return dict(
            xaxis=dict(title="X", gridcolor=_GRID_COLOR, showbackground=True,
                       backgroundcolor=_BG),
            yaxis=dict(title="Y", gridcolor=_GRID_COLOR, showbackground=True,
                       backgroundcolor=_BG),
            zaxis=dict(title=z_title, gridcolor=_GRID_COLOR, showbackground=True,
                       backgroundcolor=_BG),
            camera=dict(eye=dict(x=1.6, y=1.6, z=1.0)),
        )

    @staticmethod
    def _apply_office_theme(fig: go.Figure) -> None:
        fig.update_layout(
            font=dict(family=_FONT_FAMILY, color=_FONT_COLOR, size=11),
            paper_bgcolor=_PAPER_BG,
            plot_bgcolor=_BG,
            legend=dict(
                bgcolor=_PAPER_BG, bordercolor=_GRID_COLOR, borderwidth=1,
                font_size=10,
            ),
            margin=dict(l=40, r=40, t=60, b=40),
            hoverlabel=dict(
                bgcolor=_PAPER_BG, bordercolor=_MS_BLUE,
                font=dict(family=_FONT_FAMILY, size=11),
            ),
        )

    def _require_b(self, mode: str) -> None:
        if self.df_b is None or self._surf_b is None:
            raise ValueError(f"Mode '{mode}' requires a second dataset (labels_b).")
