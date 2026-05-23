import React, { lazy, Suspense, useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";

const Plot = lazy(() => import("../../lib/Plot"));
const ChartFallback = (
  <div className="flex items-center justify-center h-64 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">
    Loading chart engine…
  </div>
);

const FONT_FAMILY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function CurveEditor({ swReleaseId, label, onChange }) {
  const [values, setValues] = useState(null);
  const [selected, setSelected] = useState([]);
  const [opValue, setOpValue] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      const r = await api.get(`/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values`);
      setValues(r.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); setSelected([]); }, [swReleaseId, label?.name]); // eslint-disable-line

  const apply = async (operation, valueOverride) => {
    const needsValue = ["set", "add", "multiply", "percentage"].includes(operation);
    if (needsValue && valueOverride === undefined && opValue === "") {
      toast.error("Enter a value first");
      return;
    }
    if (operation !== "smooth" && selected.length === 0 && operation !== "reset") {
      toast.error("Select cells in the table first");
      return;
    }
    const cells = selected.map(i => [i]);
    setSaving(true);
    try {
      const payload = {
        operation,
        value: valueOverride !== undefined ? valueOverride : (opValue !== "" ? Number(opValue) : null),
        cells,
      };
      const r = await api.put(
        `/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values`,
        payload,
      );
      setValues(v => ({ ...v, wp_value: r.data.wp_value, modified: true }));
      if (r.data.warnings?.length) toast.warning(`${r.data.warnings.length} warning(s)`);
      else toast.success("Applied");
      onChange?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset to RP?")) return;
    try {
      const r = await api.post(
        `/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values/reset`,
        { cells: selected.length ? selected.map(i => [i]) : "all" },
      );
      setValues(v => ({ ...v, wp_value: r.data.wp_value, modified: r.data.modified }));
      setSelected([]);
      onChange?.();
    } catch (e) { toast.error("Failed"); }
  };

  const toggleSelect = (i, multi) => {
    setSelected(prev => {
      if (multi) return prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i];
      return prev.length === 1 && prev[0] === i ? [] : [i];
    });
  };

  if (!values) return <div className="p-4 text-xs text-gray-400">Loading…</div>;

  const wp = values.wp_value || [];
  const rp = values.rp_value || [];
  const x  = (label.x_axis || []).map(Number);

  const plotData = [
    {
      x: x.length ? x : wp.map((_, i) => i),
      y: wp,
      mode: "lines+markers",
      name: "Working",
      line: { color: "#2563eb", width: 2 },
      marker: { color: "#2563eb", size: 7 },
    },
  ];
  if (values.modified) {
    plotData.push({
      x: x.length ? x : rp.map((_, i) => i),
      y: rp,
      mode: "lines",
      name: "Reference",
      line: { color: "#9ca3af", width: 1.5, dash: "dash" },
    });
  }

  return (
    <div className="p-3 space-y-3">
      <div className="border border-gray-200 rounded bg-white">
        <Suspense fallback={ChartFallback}>
        <Plot
          data={plotData}
          layout={{
            font: { family: FONT_FAMILY, size: 11 },
            height: 280,
            margin: { l: 50, r: 20, t: 20, b: 40 },
            paper_bgcolor: "white",
            plot_bgcolor: "#fafafa",
            xaxis: { title: { text: label.unit_x || "X", font: { size: 10 } } },
            yaxis: { title: { text: label.unit_w || label.unit || "Y", font: { size: 10 } } },
            showlegend: values.modified,
            legend: { x: 0.02, y: 0.98, font: { size: 10 } },
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
          useResizeHandler
        />
        </Suspense>
      </div>

      <div className="border border-gray-200 rounded">
        <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-700 uppercase">
            Cells ({wp.length}){selected.length > 0 && ` · ${selected.length} selected`}
          </p>
          {values.modified && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">Modified</span>
          )}
        </div>
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left text-gray-500 w-12">#</th>
                <th className="px-2 py-1 text-left text-gray-500 w-24">{label.unit_x || "X"}</th>
                <th className="px-2 py-1 text-left text-gray-500">WP</th>
                <th className="px-2 py-1 text-left text-gray-500">RP</th>
              </tr>
            </thead>
            <tbody>
              {wp.map((v, i) => {
                const isSel = selected.includes(i);
                const diff  = rp[i] !== undefined && v !== rp[i];
                return (
                  <tr
                    key={i}
                    onClick={e => toggleSelect(i, e.ctrlKey || e.metaKey || e.shiftKey)}
                    className={`cursor-pointer border-t border-gray-100 ${isSel ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <td className="px-2 py-0.5 text-gray-400 font-mono">{i}</td>
                    <td className="px-2 py-0.5 font-mono text-gray-700">{x[i] !== undefined ? x[i] : "—"}</td>
                    <td className={`px-2 py-0.5 font-mono ${diff ? "text-amber-700 font-semibold" : "text-gray-800"}`}>
                      {typeof v === "number" ? v.toFixed(5).replace(/\.?0+$/, "") : "—"}
                    </td>
                    <td className="px-2 py-0.5 font-mono text-gray-400">
                      {typeof rp[i] === "number" ? rp[i].toFixed(5).replace(/\.?0+$/, "") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-gray-200 rounded p-3 bg-gray-50">
        <p className="text-[11px] font-semibold text-gray-700 uppercase mb-2">Apply to selection</p>
        <div className="flex gap-2 mb-2">
          <input
            type="number" step="any" value={opValue}
            onChange={e => setOpValue(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
            placeholder="Value"
          />
          <button onClick={() => apply("set")} disabled={saving}
            className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Set</button>
          <button onClick={() => apply("add")} disabled={saving}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">Add</button>
          <button onClick={() => apply("multiply")} disabled={saving}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">×</button>
          <button onClick={() => apply("percentage")} disabled={saving}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">%</button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => apply("interpolate")} disabled={saving || selected.length < 2}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
            Interpolate
          </button>
          <button onClick={() => apply("smooth")} disabled={saving || selected.length < 1}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
            Smooth
          </button>
          <button onClick={reset} disabled={saving}
            className="px-2 py-1 text-[10px] border border-amber-300 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-50">
            Reset
          </button>
        </div>
        <p className="text-[10px] text-gray-500 italic mt-2">
          Ctrl/Shift+Click to multi-select. Interpolate needs ≥2 cells (uses first and last).
        </p>
      </div>
    </div>
  );
}
