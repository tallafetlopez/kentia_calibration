import React, { useEffect, useState } from "react";
import Plot from "../lib/Plot";
import { api, formatApiErrorDetail } from "../lib/api";
import { HERKO_LAYOUT, HERKO_CONFIG, HEATMAP_COLORSCALE } from "../lib/herkoChartTheme";

function Skeleton() {
  return (
    <div
      className="w-full h-64 bg-slate-200 border border-slate-300 rounded-sm"
      style={{ animation: "herkoPulse 1.5s ease-in-out infinite" }}
      aria-label="Loading heatmap"
    >
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading heatmap...</div>
    </div>
  );
}

const HEATMAP_DIMENSION = 16;
const CLASSIC_RAINBOW_COLORSCALE = [
  [0.0, "#6a0dad"],
  [0.14, "#4b1fd1"],
  [0.28, "#1e5cc8"],
  [0.42, "#1aa8d8"],
  [0.5, "#1fa34a"],
  [0.64, "#8fd11f"],
  [0.78, "#ffd21f"],
  [0.9, "#ff7b00"],
  [1.0, "#ef0000"],
];

function to16x16Matrix(values) {
  const safeValues = values.length > 0 ? values : [0.5];
  return Array.from({ length: HEATMAP_DIMENSION }, (_, row) =>
    Array.from({ length: HEATMAP_DIMENSION }, (_, col) => {
      const idx = (row * HEATMAP_DIMENSION + col) % safeValues.length;
      return Number((safeValues[idx] ?? 0.5).toFixed(3));
    })
  );
}

function buildAxisLabels(prefix) {
  return Array.from({ length: HEATMAP_DIMENSION }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);
}

function buildMockHeatmapData() {
  const xLabels = buildAxisLabels("F");
  const yLabels = buildAxisLabels("L");
  const zRows = Array.from({ length: HEATMAP_DIMENSION }, (_, row) =>
    Array.from({ length: HEATMAP_DIMENSION }, (_, col) => {
      const wave = (Math.sin((row + 1) * 0.9 + (col + 1) * 0.7) + 1) / 2;
      return Number((10 + wave * 85).toFixed(0));
    })
  );

  return {
    zRows,
    xLabels,
    yLabels,
  };
}

/**
 * Chart A — Parameter Heatmap
 * Shows calibration values as a 2D colour grid grouped by category.
 * Data source: GET /api/v1/datasets/{id}/labels
 */
export default function CalibrationHeatmap({ datasetId, useMock = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (useMock) {
      setData(buildMockHeatmapData());
      setLoading(false);
      setError(null);
      return;
    }
    if (!datasetId) return;
    setLoading(true);
    api
      .get(`/v1/datasets/${datasetId}/labels`)
      .then(({ data: labels }) => {
        if (!labels || labels.length === 0) {
          setData(null);
          return;
        }

        // Group labels by category
        const categories = [...new Set(labels.map((l) => l.category || "General"))];
        const labelNames = labels.map((l) =>
          (l.label_name || l.name || "").slice(0, 14)
        );

        // Normalise values 0-1 per label
        const rawVals = labels.map((l) => parseFloat(l.current_value ?? l.value ?? 0) || 0);
        const min = Math.min(...rawVals);
        const max = Math.max(...rawVals);
        const norm = rawVals.map((v) => (max === min ? 50 : ((v - min) / (max - min)) * 100));

        // Build Z matrix (categories × labels)
        const zRows = to16x16Matrix(norm);

          setData({ zRows, xLabels: buildAxisLabels("F"), yLabels: buildAxisLabels("L"), rawVals, labels, labelNames, categories });
      })
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
        }, [datasetId, useMock]);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="w-full h-40 flex items-center justify-center text-red-600 text-sm">
        {error}
      </div>
    );
  if (!data)
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-[#6b7a5e] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M14 3v18" />
        </svg>
        No labels defined. Add labels to see the heatmap.
      </div>
    );

  const textMatrix = data.zRows.map((row) => row.map((value) => `${Math.round(value)}`));

  const traces = [{
    type: "heatmap",
    z: data.zRows,
    text: textMatrix,
    texttemplate: "%{text}",
    textfont: { size: 9, color: "#111827" },
    x: data.xLabels,
    y: data.yLabels,
    colorscale: CLASSIC_RAINBOW_COLORSCALE,
    showscale: true,
    colorbar: {
      title: "Scale",
      tickfont: { size: 10 },
      tickvals: [0, 25, 50, 75, 100],
      ticktext: ["0", "25", "50", "75", "100"],
      len: 0.82,
    },
    hoverongaps: false,
    hovertemplate: "<b>%{x}</b><br>%{y}<br>Value: %{z:.0f}<extra></extra>",
    zmin: 0,
    zmax: 100,
  }];

  return (
    <Plot
      data={traces}
      layout={{
        ...HERKO_LAYOUT,
        title: { text: useMock ? "Spark Advance Map · 16x16" : "Calibration Heatmap · 16x16", ...HERKO_LAYOUT.title },
        xaxis: {
          tickangle: 0,
          tickfont: { size: 9 },
          title: "Fuel Index",
          side: "top",
          fixedrange: true,
        },
        yaxis: {
          tickfont: { size: 9 },
          title: "Load Index",
          autorange: "reversed",
          scaleanchor: "x",
          scaleratio: 1,
          fixedrange: true,
        },
        height: 500,
        margin: { ...HERKO_LAYOUT.margin, t: 48, r: 8, b: 36, l: 56 },
      }}
      config={HERKO_CONFIG}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
