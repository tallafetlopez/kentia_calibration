/**
 * Shared Plotly theme for all HERKO charts.
 * Import: import { HERKO_LAYOUT, HERKO_CONFIG } from "../lib/herkoChartTheme";
 */

export const HERKO_LAYOUT = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "#f9fafb",
  font: { family: "'Inter', system-ui, sans-serif", size: 11, color: "#374151" },
  colorway: ["#4a5240", "#6b7a5e", "#9aad8a", "#c8d9b8", "#e8f0e0"],
  margin: { t: 40, r: 20, b: 50, l: 50 },
  title: { font: { size: 13, color: "#1f2937" } },
};

export const HERKO_CONFIG = {
  displaylogo: false,
  modeBarButtonsToRemove: ["sendDataToCloud", "toImage", "select2d", "lasso2d"],
  responsive: true,
};

export const HEATMAP_COLORSCALE = [
  [0, "#f0f4eb"],
  [0.5, "#6b7a5e"],
  [1, "#2d3a28"],
];

export const LIFECYCLE_COLORS = {
  EDIT: "#9ca3af",
  UNDER_APPROVAL: "#f59e0b",
  APPROVED: "#22c55e",
  RELEASE_CANDIDATE: "#a855f7",
  RELEASED: "#3b82f6",
  DEPRECATED: "#ef4444",
};
