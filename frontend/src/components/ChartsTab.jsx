import React, { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import CalibrationHeatmap from "./CalibrationHeatmap";
import CalibrationSurface3D from "./CalibrationSurface3D";
import LabelEvolutionChart from "./LabelEvolutionChart";

const FOCUS_OPTIONS = [
  { key: "heatmap", label: "Heatmap" },
  { key: "surface", label: "3D Surface" },
  { key: "evolution", label: "Evolution" },
];

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
};

const titleStyle = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 8,
};

function ChartShell({ title, children, className = "" }) {
  return (
    <div className={className} style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      {children}
    </div>
  );
}

function PillSelector({ activeKey, onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FOCUS_OPTIONS.map((opt) => {
        const active = activeKey === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            style={{
              border: "1px solid #d1d5db",
              background: active ? "#4a5240" : "#ffffff",
              color: active ? "#ffffff" : "#6b7280",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "#f3f4f6";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "#ffffff";
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ChartsTab({ datasetId, datasetName, labelsCount }) {
  const [focusMode, setFocusMode] = useState(false);
  const [focusChart, setFocusChart] = useState("heatmap");

  const useMockData = labelsCount === 0;

  const warningText = useMemo(() => {
    if (!useMockData) return null;
    return "No labels defined yet — charts show demo data. Add labels to see real values.";
  }, [useMockData]);

  const renderChart = (chartKey) => {
    if (chartKey === "heatmap") {
      return <CalibrationHeatmap datasetId={datasetId} useMock={useMockData} />;
    }
    if (chartKey === "surface") {
      return <CalibrationSurface3D datasetId={datasetId} useMock={useMockData} />;
    }
    return <LabelEvolutionChart datasetId={datasetId} useMock={useMockData} />;
  };

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes herkoPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>

      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="tiny-label">Charts · {datasetName || "Dataset"}</div>
          </div>
          <button
            type="button"
            onClick={() => setFocusMode((v) => !v)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-300 px-3 py-1.5 rounded-sm"
          >
            {focusMode ? "Show all" : "Focus mode"}
          </button>
        </div>

        {warningText && (
          <div className="mt-3 flex items-start gap-2 border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 rounded-sm text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{warningText}</span>
          </div>
        )}
      </div>

      <div className="panel p-4 flex items-center justify-between gap-3">
        <PillSelector activeKey={focusChart} onSelect={setFocusChart} />
        <div className="text-xs text-slate-500">{focusMode ? "Focused chart view" : "Overview grid"}</div>
      </div>

      {focusMode ? (
        <ChartShell title={FOCUS_OPTIONS.find((x) => x.key === focusChart)?.label || "Chart"}>
          {renderChart(focusChart)}
        </ChartShell>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ChartShell title="Heatmap · Parameter Coverage" className="md:col-span-1">
            {renderChart("heatmap")}
          </ChartShell>

          <ChartShell title="3D Surface · Calibration Map" className="md:col-span-2">
            {renderChart("surface")}
          </ChartShell>

          <ChartShell title="Label Evolution Over Time" className="md:col-span-3">
            {renderChart("evolution")}
          </ChartShell>
        </div>
      )}
    </div>
  );
}
