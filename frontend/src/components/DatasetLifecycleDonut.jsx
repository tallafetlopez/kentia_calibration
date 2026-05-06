import React, { useEffect, useState } from "react";
import Plot from "../lib/Plot";
import { api, formatApiErrorDetail } from "../lib/api";
import { HERKO_LAYOUT, HERKO_CONFIG, LIFECYCLE_COLORS } from "../lib/herkoChartTheme";

function Skeleton() {
  return (
    <div className="w-full h-64 bg-slate-100 rounded animate-pulse flex items-center justify-center text-slate-400 text-sm">
      Loading donut…
    </div>
  );
}

/**
 * Chart D — Dataset Lifecycle Donut
 * Shows count of datasets per lifecycle state for a SW Release.
 * Data source: GET /api/v1/sw-releases/{id}/datasets
 */
export default function DatasetLifecycleDonut({ swReleaseId }) {
  const [plotData, setPlotData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!swReleaseId) return;
    setLoading(true);
    api
      .get(`/v1/sw-releases/${swReleaseId}/datasets`)
      .then(({ data: datasets }) => {
        if (!datasets || datasets.length === 0) {
          setPlotData({ labels: [], values: [], total: 0 });
          return;
        }
        // Count by state
        const counts = {};
        datasets.forEach((ds) => {
          const state = ds.state || ds.lifecycle_state || "EDIT";
          counts[state] = (counts[state] || 0) + 1;
        });
        const labels = Object.keys(counts);
        const values = labels.map((l) => counts[l]);
        const colors = labels.map((l) => LIFECYCLE_COLORS[l] || "#9ca3af");
        setPlotData({ labels, values, colors, total: datasets.length });
      })
      .catch((e) => setError(formatApiErrorDetail(e.response?.data?.detail || e.message)))
      .finally(() => setLoading(false));
  }, [swReleaseId]);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <div className="w-full h-40 flex items-center justify-center text-red-600 text-sm">
        {error}
      </div>
    );
  if (!plotData || plotData.total === 0)
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-[#6b7a5e] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        No datasets linked to this release.
      </div>
    );

  return (
    <Plot
      data={[
        {
          type: "pie",
          hole: 0.58,
          labels: plotData.labels,
          values: plotData.values,
          marker: { colors: plotData.colors },
          textinfo: "label+percent",
          textfont: { size: 11 },
          hovertemplate: "<b>%{label}</b><br>%{value} dataset(s)<br>%{percent}<extra></extra>",
        },
      ]}
      layout={{
        ...HERKO_LAYOUT,
        title: { text: "Dataset Lifecycle", ...HERKO_LAYOUT.title },
        annotations: [
          {
            text: `<b>${plotData.total}</b>`,
            showarrow: false,
            font: { size: 26, color: "#1f2937" },
            x: 0.5,
            y: 0.5,
          },
        ],
        legend: { orientation: "h", y: -0.18, font: { size: 10 } },
        height: 300,
        margin: { t: 36, r: 16, b: 48, l: 16 },
      }}
      config={HERKO_CONFIG}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
