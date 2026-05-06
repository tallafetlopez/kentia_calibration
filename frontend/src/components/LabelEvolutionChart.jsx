import React, { useEffect, useState } from "react";
import Plot from "../lib/Plot";
import { api, formatApiErrorDetail } from "../lib/api";
import { HERKO_LAYOUT, HERKO_CONFIG } from "../lib/herkoChartTheme";

function Skeleton() {
  return (
    <div
      className="w-full h-64 bg-slate-200 border border-slate-300 rounded-sm"
      style={{ animation: "herkoPulse 1.5s ease-in-out infinite" }}
      aria-label="Loading evolution chart"
    >
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">Loading evolution chart...</div>
    </div>
  );
}

function buildMockEvolution() {
  const versions = ["v1.0", "v1.1", "v1.2", "v1.3", "v1.4.2"];
  const colors = ["#4a5240", "#9aad8a", "#c8a951"];

  return [
    {
      type: "scatter",
      mode: "lines+markers",
      name: "SCR_Fact",
      x: versions,
      y: [0.78, 0.8, 0.81, 0.79, 0.82],
      line: { color: colors[0], width: 2 },
      marker: { size: 6, color: colors[0] },
      hovertemplate: "<b>SCR_Fact</b><br>%{x}<br>Value: %{y:.3f}<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: "EGR_Rate",
      x: versions,
      y: [18.1, 18.4, 18.0, 18.6, 18.3],
      line: { color: colors[1], width: 2 },
      marker: { size: 6, color: colors[1] },
      hovertemplate: "<b>EGR_Rate</b><br>%{x}<br>Value: %{y:.3f}<extra></extra>",
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: "NOx_Limit",
      x: versions,
      y: [90, 89, 91, 90.5, 92],
      line: { color: colors[2], width: 2 },
      marker: { size: 6, color: colors[2] },
      hovertemplate: "<b>NOx_Limit</b><br>%{x}<br>Value: %{y:.3f}<extra></extra>",
    },
  ];
}

/**
 * Chart C — Label Evolution
 * Shows how label values changed across dataset versions (from changelog).
 * Data source: GET /api/v1/datasets/{id}/changelog
 */
export default function LabelEvolutionChart({ datasetId, useMock = false }) {
  const [traces, setTraces] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (useMock) {
      setTraces(buildMockEvolution());
      setLoading(false);
      setError(null);
      return;
    }

    if (!datasetId) return;
    setLoading(true);
    api
      .get(`/v1/datasets/${datasetId}/changelog`)
      .then(({ data }) => {
        if (!data || !data.entries || data.entries.length === 0) {
          setTraces([]);
          return;
        }

        // Group changes by label name
        const byLabel = {};
        data.entries.forEach((entry) => {
          const date = entry.date || entry.created_at;
          (entry.changes || []).forEach((ch) => {
            const name = ch.label_name;
            if (!byLabel[name]) byLabel[name] = [];
            const val = parseFloat(ch.new_value ?? ch.value ?? 0);
            if (!isNaN(val)) byLabel[name].push({ date, value: val });
          });
        });

        const COLORS = ["#4a5240", "#9aad8a", "#c8a951"];
        const built = Object.entries(byLabel)
          .filter(([, pts]) => pts.length > 0)
          .map(([name, pts], i) => {
            const sorted = [...pts].sort((a, b) => new Date(a.date) - new Date(b.date));
            return {
              type: "scatter",
              mode: "lines+markers",
              name,
              x: sorted.map((p) => p.date),
              y: sorted.map((p) => p.value),
              line: { color: COLORS[i % COLORS.length], width: 2 },
              marker: { size: 5, color: COLORS[i % COLORS.length] },
              hovertemplate: `<b>${name}</b><br>%{x}<br>Value: %{y:.4f}<extra></extra>`,
            };
          });

        setTraces(built);
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
  if (!traces || traces.length === 0)
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-[#6b7a5e] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
        No label changes recorded in changelog.
      </div>
    );

  return (
    <Plot
      data={traces}
      layout={{
        ...HERKO_LAYOUT,
        title: { text: "Label Evolution", ...HERKO_LAYOUT.title },
        xaxis: { title: "Date / Version", tickfont: { size: 10 } },
        yaxis: { title: "Value", tickfont: { size: 10 } },
        legend: { orientation: "h", y: -0.25, font: { size: 10 } },
        height: 300,
      }}
      config={HERKO_CONFIG}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
