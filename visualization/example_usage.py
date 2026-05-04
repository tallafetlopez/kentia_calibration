"""
visualization/example_usage.py
────────────────────────────────
Standalone demo — runs without the backend.
Generates dummy ECM calibration label data and opens the interactive chart.

Run:
    cd CalibrationEngine_Herko
    python visualization/example_usage.py
"""

import numpy as np
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from visualization.heatmap_3d import CalibrationMap3D

# ── Generate dummy calibration labels (mimics /api/datasets/{id}/labels) ─────

LABEL_NAMES = [
    "InjTim_MaxDur_Map", "InjTim_StartOfInj_Cor", "RailP_Setp_Map",
    "RailP_PCtrl_Kp", "EGR_TargetRate_Map", "EGR_MinClose_Lim",
    "TurboBoost_Setp_Map", "TurboBoost_Kp", "DPF_RegenTmp_Thr",
    "DPF_RegenInterval_Max", "SCR_NOxConv_MinEff", "SCR_UreaDos_Fact",
    "LambdaCtl_Setp", "IdleSpd_Target", "MaxTrq_Lim_Map",
    "CoolantTmp_WarnLim", "OilPress_FaultLim", "Knock_Detect_Thr",
    "StartAssist_FuelAdd", "Immobilizer_UnlockKey",
]
CONFIDENCE = ["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"]
LEVELS     = ["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"]

rng = np.random.default_rng(42)

def _make_labels(seed_offset: float = 0.0):
    labels = []
    for i, name in enumerate(LABEL_NAMES):
        base_val = rng.uniform(0.5, 2000.0) + seed_offset * rng.uniform(-50, 50)
        labels.append({
            "id": f"lbl-{i:03d}",
            "label_name": name,
            "current_value": str(round(base_val, 4)),
            "confidence_status": CONFIDENCE[i % len(CONFIDENCE)],
            "level": LEVELS[i % len(LEVELS)],
            "regulatory_relevance": "YES" if i % 3 == 0 else "NO",
            "unit": ["us", "deg", "bar", "-", "%", "rpm", "Nm"][i % 7],
            "modified": bool(i % 4 == 0),
        })
    return labels

labels_a = _make_labels(seed_offset=0.0)
labels_b = _make_labels(seed_offset=1.0)   # slightly different values

# ── Demo 1: Single dataset — 3D surface ──────────────────────────────────────
print("Opening 3D surface (Dataset A)…")
viz = CalibrationMap3D(labels_a, x_col="label_name", y_col="confidence_status", z_col="value_num", grid_size=16)
fig_surface = viz.build(mode="surface", dataset_a_name="ECM-SW-2024.1 · DS_Base_Euro6d_Prod")
fig_surface.show()

# ── Demo 2: 2D heatmap ───────────────────────────────────────────────────────
print("Opening 2D heatmap…")
fig_heatmap = viz.build(mode="heatmap", dataset_a_name="ECM-SW-2024.1 · DS_Base_Euro6d_Prod")
fig_heatmap.show()

# ── Demo 3: Delta surface (B − A) ────────────────────────────────────────────
print("Opening delta surface (B − A)…")
viz2 = CalibrationMap3D(labels_a, labels_b, grid_size=16)
fig_delta = viz2.build(
    mode="delta",
    dataset_a_name="DS_Base_Euro6d_Prod",
    dataset_b_name="DS_NextGen_Baseline",
)
fig_delta.show()

# ── Demo 4: Full dashboard ───────────────────────────────────────────────────
print("Opening full dashboard…")
fig_full = viz2.build(
    mode="full",
    dataset_a_name="DS_Base_Euro6d_Prod",
    dataset_b_name="DS_NextGen_Baseline",
)
fig_full.show()

print("Done. Close browser tabs to exit.")
