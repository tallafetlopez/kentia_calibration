import React, { useEffect, useState } from "react";
import Plot from "../lib/Plot";
import { api, formatApiErrorDetail } from "../lib/api";
import { HERKO_LAYOUT, HERKO_CONFIG } from "../lib/herkoChartTheme";

function Skeleton() {
  return (
    <div className="w-full h-64 bg-slate-100 rounded animate-pulse flex items-center justify-center text-slate-400 text-sm">
      Loading coverage chart…
    </div>
  );
}

/**
 * Chart E — Label Coverage Bar
 * Horizontal stacked bar: complete / incomplete / missing justification per dataset.
 * Data source: GET /api/v1/sw-releases/{id}/label-stats
 */
export default function LabelCoverageBar({ swReleaseId }) {
  const [plotData, setPlotData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!swReleaseId) return;
    setLoading(true);
    api
      .get(`/v1/sw-releases/${swReleaseId}/label-stats`)
      .then(({ data }) => {
        if (!data || !data.datasets || data.datasets.length === 0) {
          setPlotData([]);
          return;
        }
        setPlotData(data.datasets);
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
  if (!plotData || plotData.length === 0)
    return (
      <div className="w-full h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
        <svg className="w-8 h-8 text-[#6b7a5e] opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        No label statistics available.
      </div>
    );

  const dsNames = plotData.map((d) => d.name);
  const complete = plotData.map((d) => d.complete || 0);
  const incomplete = plotData.map((d) => d.incomplete || 0);
  const missingJust = plotData.map((d) => d.missing_justification || 0);

  return (
    <Plot
      data={[
        {
          type: "bar",
          name: "Complete",
          x: complete,
          y: dsNames,
          orientation: "h",
          marker: { color: "#22c55e" },
          hovertemplate: "<b>%{y}</b><br>Complete: %{x}<extra></extra>",
        },
        {
          type: "bar",
          name: "Incomplete",
          x: incomplete,
          y: dsNames,
          orientation: "h",
          marker: { color: "#f59e0b" },
          hovertemplate: "<b>%{y}</b><br>Incomplete: %{x}<extra></extra>",
        },
        {
          type: "bar",
          name: "Missing justification",
          x: missingJust,
          y: dsNames,
          orientation: "h",
          marker: { color: "#ef4444" },
          hovertemplate: "<b>%{y}</b><br>Missing justification: %{x}<extra></extra>",
        },
      ]}
      layout={{
        ...HERKO_LAYOUT,
        title: { text: "Label Coverage", ...HERKO_LAYOUT.title },
        barmode: "stack",
        xaxis: { title: "Labels", tickfont: { size: 10 } },
        yaxis: { tickfont: { size: 10 }, automargin: true },
        legend: { orientation: "h", y: -0.22, font: { size: 10 } },
        height: Math.max(200, 60 + plotData.length * 44),
        margin: { ...HERKO_LAYOUT.margin, l: 140 },
      }}
      config={HERKO_CONFIG}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}
