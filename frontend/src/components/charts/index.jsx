import React, { lazy, Suspense, useState } from "react";

const Plot = lazy(() => import("../../lib/Plot"));

function ChartShell({ children }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">
        Loading chart engine…
      </div>
    }>
      {children}
    </Suspense>
  );
}

const COLORSCALE = [
  [0,    "rgb(20,68,84)"],
  [0.25, "rgb(35,134,136)"],
  [0.5,  "rgb(120,198,121)"],
  [0.75, "rgb(249,200,78)"],
  [1,    "rgb(238,105,85)"],
];

const COMMON_LAYOUT = {
  margin: { l: 52, r: 20, t: 14, b: 48 },
  paper_bgcolor: "white",
  plot_bgcolor: "#fafafa",
  font: { size: 10, color: "#6b7280" },
};

const CONFIG = { displayModeBar: false, responsive: true };

// ─── Scalar chart ─────────────────────────────────────────────────────────────
export function ScalarChart({ label }) {
  if (!label) return null;
  const val = Number(label.value ?? 0);
  const lo  = Number(label.lower_limit ?? 0);
  const hi  = Number(label.upper_limit ?? 1);
  const outOfRange = val < lo || val > hi;
  const barColor = outOfRange ? "#ef4444" : "#2563eb";

  const data = [
    {
      type: "indicator",
      mode: "gauge+number+delta",
      value: val,
      delta: { reference: (lo + hi) / 2, valueformat: ".4f" },
      number: { valueformat: ".5f", suffix: label.unit ? `  ${label.unit}` : "" },
      gauge: {
        axis: { range: [lo, hi], tickformat: ".3g" },
        bar: { color: barColor, thickness: 0.35 },
        bgcolor: "#e5e7eb",
        borderwidth: 0,
        threshold: {
          line: { color: barColor, width: 3 },
          thickness: 0.85,
          value: val,
        },
        steps: [
          { range: [lo, hi], color: "#f3f4f6" },
        ],
      },
    },
  ];

  const layout = {
    ...COMMON_LAYOUT,
    margin: { l: 32, r: 32, t: 24, b: 16 },
    height: 220,
  };

  return (
    <div className="p-3 flex flex-col gap-3">
      <ChartShell><Plot data={data} layout={layout} config={CONFIG} style={{ width: "100%" }} /></ChartShell>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded p-2 border border-gray-100">
          <span className="text-gray-400">Lower limit </span>
          <span className="font-mono font-semibold text-gray-700">{lo} {label.unit || ""}</span>
        </div>
        <div className="bg-gray-50 rounded p-2 border border-gray-100">
          <span className="text-gray-400">Upper limit </span>
          <span className="font-mono font-semibold text-gray-700">{hi} {label.unit || ""}</span>
        </div>
      </div>
      {outOfRange && (
        <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded px-2 py-1">
          OUT OF RANGE
        </p>
      )}
    </div>
  );
}

// ─── Curve chart ──────────────────────────────────────────────────────────────
export function CurveChart({ param, compareParam }) {
  if (!param) return null;

  const xRaw = Array.isArray(param.x_axis) ? param.x_axis : [];
  const yRaw = Array.isArray(param.values)  ? param.values : [];
  const n    = Math.min(xRaw.length || yRaw.length, yRaw.length || xRaw.length);
  const xVals = (n > 0 ? xRaw.slice(0, n) : yRaw.map((_, i) => i)).map((v, i) => {
    const x = Number(v); return Number.isFinite(x) ? x : i;
  });
  const yVals = (n > 0 ? yRaw.slice(0, n) : []).map(v => {
    const y = Number(v); return Number.isFinite(y) ? y : null;
  });

  const traces = [
    {
      type: "scatter",
      mode: "lines+markers",
      x: xVals,
      y: yVals,
      name: param.name,
      line: { color: "#2563eb", width: 2 },
      marker: { size: 5, color: "#2563eb", line: { color: "#fff", width: 1 } },
    },
  ];

  if (compareParam) {
    const cxRaw = Array.isArray(compareParam.x_axis) ? compareParam.x_axis : [];
    const cyRaw = Array.isArray(compareParam.values)  ? compareParam.values : [];
    const cn    = Math.min(cxRaw.length || cyRaw.length, cyRaw.length || cxRaw.length);
    const cxVals = (cn > 0 ? cxRaw.slice(0, cn) : cyRaw.map((_, i) => i)).map((v, i) => {
      const x = Number(v); return Number.isFinite(x) ? x : i;
    });
    const cyVals = (cn > 0 ? cyRaw.slice(0, cn) : []).map(v => {
      const y = Number(v); return Number.isFinite(y) ? y : null;
    });
    traces.push({
      type: "scatter",
      mode: "lines+markers",
      x: cxVals,
      y: cyVals,
      name: "Base",
      line: { color: "#f97316", width: 1.5, dash: "dot" },
      marker: { size: 4, color: "#f97316" },
    });
  }

  const layout = {
    ...COMMON_LAYOUT,
    height: 300,
    xaxis: { title: param.unit_x || "X", gridcolor: "#f0f0f0", zeroline: false },
    yaxis: { title: param.unit_w || "Y", gridcolor: "#f0f0f0", zeroline: false },
    legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center", font: { size: 10 } },
    showlegend: !!compareParam,
  };

  if (!yVals.some(v => v !== null)) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400 m-3">
        No plottable data
      </div>
    );
  }

  return (
    <div className="p-3">
      <ChartShell><Plot data={traces} layout={layout} config={CONFIG} style={{ width: "100%" }} /></ChartShell>
    </div>
  );
}

// ─── Map chart ────────────────────────────────────────────────────────────────
const MAX_MAP_DIM = 16;

export function MapChart({ param }) {
  const [mode, setMode] = useState("heatmap");
  if (!param) return null;

  const rawRows = Array.isArray(param.values) ? param.values : [];
  let zRows = rawRows
    .filter(r => Array.isArray(r) && r.length > 0)
    .map(r => r.map(v => { const n = Number(v); return Number.isFinite(n) ? n : null; }));

  const wasTruncated = zRows.length > MAX_MAP_DIM || (zRows[0]?.length ?? 0) > MAX_MAP_DIM;
  if (zRows.length > MAX_MAP_DIM) zRows = zRows.slice(0, MAX_MAP_DIM);
  zRows = zRows.map(r => r.length > MAX_MAP_DIM ? r.slice(0, MAX_MAP_DIM) : r);

  const rowCount = zRows.length;
  const colCount = zRows.reduce((m, r) => Math.max(m, r.length), 0);
  const hasData  = rowCount > 0 && colCount > 0;

  const xSource = Array.isArray(param.x_axis) ? param.x_axis.slice(0, colCount) : [];
  const ySource = Array.isArray(param.y_axis) ? param.y_axis.slice(0, rowCount) : [];
  const xLabels = xSource.length === colCount
    ? xSource.map((v, i) => { const n = Number(v); return Number.isFinite(n) ? n : i; })
    : Array.from({ length: colCount }, (_, i) => i);
  const yLabels = ySource.length === rowCount
    ? ySource.map((v, i) => { const n = Number(v); return Number.isFinite(n) ? n : i; })
    : Array.from({ length: rowCount }, (_, i) => i);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400 m-3">
        No plottable data
      </div>
    );
  }

  const heatmapTrace = {
    type: "heatmap",
    z: zRows,
    x: xLabels,
    y: yLabels,
    colorscale: COLORSCALE,
    showscale: true,
    colorbar: { thickness: 12, len: 0.9, tickfont: { size: 9 }, title: { text: param.unit_w || "Z", font: { size: 9 } } },
    hoverongaps: false,
  };

  const surfaceTrace = {
    type: "surface",
    z: zRows,
    x: xLabels,
    y: yLabels,
    colorscale: COLORSCALE,
    showscale: true,
    colorbar: { thickness: 12, len: 0.9, tickfont: { size: 9 } },
    contours: {
      z: { show: true, usecolormap: true, highlightcolor: "#fff", project: { z: false } },
    },
  };

  const heatmapLayout = {
    ...COMMON_LAYOUT,
    height: 300,
    xaxis: { title: param.unit_x || "X", tickfont: { size: 9 } },
    yaxis: { title: param.unit_y || "Y", tickfont: { size: 9 } },
  };

  const surfaceLayout = {
    ...COMMON_LAYOUT,
    height: 340,
    margin: { l: 0, r: 0, t: 20, b: 0 },
    scene: {
      xaxis: { title: param.unit_x || "X" },
      yaxis: { title: param.unit_y || "Y" },
      zaxis: { title: param.unit_w || "Z" },
      camera: { eye: { x: 1.5, y: -1.5, z: 1.2 } },
    },
  };

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          {rowCount}×{colCount} · X:{param.unit_x || "–"} · Y:{param.unit_y || "–"} · Z:{param.unit_w || "–"}
        </p>
        <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
          {["heatmap", "surface"].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-0.5 ${mode === m ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {m === "heatmap" ? "Heatmap" : "3D"}
            </button>
          ))}
        </div>
      </div>
      {wasTruncated && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Map truncated to {MAX_MAP_DIM}×{MAX_MAP_DIM} (max display size).
        </p>
      )}
      <ChartShell>
        {mode === "heatmap"
          ? <Plot data={[heatmapTrace]} layout={heatmapLayout} config={CONFIG} style={{ width: "100%" }} />
          : <Plot data={[surfaceTrace]} layout={surfaceLayout} config={{ ...CONFIG, displayModeBar: true, modeBarButtonsToRemove: ["sendDataToCloud", "toImage"] }} style={{ width: "100%" }} />
        }
      </ChartShell>
    </div>
  );
}
