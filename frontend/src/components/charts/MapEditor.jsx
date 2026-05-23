import React, { useState, useEffect, useMemo } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import Plot from "../../lib/Plot";

const COLORSCALE = [
  [0.0,  "rgb(20, 68, 84)"],
  [0.25, "rgb(35, 134, 136)"],
  [0.5,  "rgb(120, 198, 121)"],
  [0.75, "rgb(249, 200, 78)"],
  [1.0,  "rgb(238, 105, 85)"],
];
const FONT_FAMILY = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function cellKey(r, c) { return `${r}-${c}`; }

export default function MapEditor({ swReleaseId, label, onChange }) {
  const [values, setValues] = useState(null);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [opValue, setOpValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState("table");
  const [rangeAnchor, setRangeAnchor] = useState(null);

  const refresh = async () => {
    try {
      const r = await api.get(`/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values`);
      setValues(r.data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); setSelectedCells(new Set()); }, [swReleaseId, label?.name]); // eslint-disable-line

  const cellsArray = useMemo(() => {
    return Array.from(selectedCells).map(k => k.split("-").map(Number));
  }, [selectedCells]);

  const apply = async (operation, valueOverride) => {
    const needsValue = ["set", "add", "multiply", "percentage"].includes(operation);
    if (needsValue && valueOverride === undefined && opValue === "") {
      toast.error("Enter a value first");
      return;
    }
    if (selectedCells.size === 0 && operation !== "reset") {
      toast.error("Select cells in the table first");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        operation,
        value: valueOverride !== undefined ? valueOverride : (opValue !== "" ? Number(opValue) : null),
        cells: cellsArray,
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
    const msg = selectedCells.size > 0
      ? `Reset ${selectedCells.size} selected cell(s) to RP?`
      : "Reset entire map to RP?";
    if (!window.confirm(msg)) return;
    try {
      const r = await api.post(
        `/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(label.name)}/values/reset`,
        { cells: selectedCells.size > 0 ? cellsArray : "all" },
      );
      setValues(v => ({ ...v, wp_value: r.data.wp_value, modified: r.data.modified }));
      setSelectedCells(new Set());
      onChange?.();
    } catch (e) { toast.error("Failed"); }
  };

  const selectRange = (r, c, e) => {
    if (e.shiftKey && rangeAnchor) {
      const [ar, ac] = rangeAnchor;
      const next = new Set(selectedCells);
      const r0 = Math.min(ar, r), r1 = Math.max(ar, r);
      const c0 = Math.min(ac, c), c1 = Math.max(ac, c);
      for (let ri = r0; ri <= r1; ri++)
        for (let ci = c0; ci <= c1; ci++) next.add(cellKey(ri, ci));
      setSelectedCells(next);
    } else {
      const k = cellKey(r, c);
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selectedCells);
        if (next.has(k)) next.delete(k); else next.add(k);
        setSelectedCells(next);
      } else {
        setSelectedCells(new Set([k]));
      }
      setRangeAnchor([r, c]);
    }
  };

  if (!values) return <div className="p-4 text-xs text-gray-400">Loading…</div>;

  const wp    = values.wp_value || [];
  const rp    = values.rp_value || [];
  const rows  = wp.length;
  const cols  = rows > 0 ? wp[0].length : 0;
  const xAxis = (label.x_axis || []).map(Number);
  const yAxis = (label.y_axis || []).map(Number);

  const modifiedCount = (() => {
    const wpFlat = wp.flat();
    const rpFlat = (rp || []).flat();
    return wpFlat.filter((v, i) => v !== rpFlat[i]).length;
  })();

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex rounded border border-gray-300 overflow-hidden text-[10px]">
          {[
            { id: "table",   label: "Table"   },
            { id: "heatmap", label: "Heatmap" },
            { id: "3d",      label: "3D"      },
          ].map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)}
              className={`px-2.5 py-0.5 ${viewMode === m.id ? "bg-gray-800 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              {m.label}
            </button>
          ))}
        </div>
        {values.modified && (
          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
            Modified ({modifiedCount} cells)
          </span>
        )}
      </div>

      {viewMode === "table" && (
        <div className="border border-gray-200 rounded overflow-auto" style={{ maxHeight: 360 }}>
          <table className="text-[10px] font-mono border-collapse" style={{ tableLayout: "fixed" }}>
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-1 py-1 text-center text-gray-400 border-r border-b border-gray-200 sticky left-0 bg-gray-50" style={{ width: 36 }}>
                  Y\X
                </th>
                {Array.from({ length: cols }).map((_, c) => (
                  <th key={c} className="px-1 py-1 text-center text-gray-500 border-r border-b border-gray-200" style={{ minWidth: 48 }}>
                    {xAxis[c] !== undefined ? xAxis[c] : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wp.map((row, r) => (
                <tr key={r}>
                  <td className="px-1 py-0.5 text-gray-500 text-center bg-gray-50 border-r border-b border-gray-200 sticky left-0">
                    {yAxis[r] !== undefined ? yAxis[r] : r}
                  </td>
                  {row.map((v, c) => {
                    const isSel = selectedCells.has(cellKey(r, c));
                    const diff  = rp[r]?.[c] !== undefined && v !== rp[r][c];
                    return (
                      <td
                        key={c}
                        onClick={e => selectRange(r, c, e)}
                        className={`px-1 py-0.5 text-center border-r border-b border-gray-100 cursor-pointer ${
                          isSel ? "bg-blue-200 font-bold" :
                          diff  ? "bg-amber-50 text-amber-800 font-semibold" :
                                  "hover:bg-gray-50 text-gray-700"
                        }`}
                        title={diff ? `RP: ${rp[r][c]}` : undefined}
                      >
                        {typeof v === "number" ? v.toFixed(3).replace(/\.?0+$/, "") : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "heatmap" && (
        <div className="border border-gray-200 rounded bg-white">
          <Plot
            data={[{
              type: "heatmap",
              z: wp,
              x: xAxis.length ? xAxis : undefined,
              y: yAxis.length ? yAxis : undefined,
              colorscale: COLORSCALE,
              hovertemplate: "X=%{x}<br>Y=%{y}<br>Z=%{z:.4f}<extra></extra>",
            }]}
            layout={{
              font: { family: FONT_FAMILY, size: 10 },
              height: 360,
              margin: { l: 50, r: 30, t: 20, b: 40 },
              xaxis: { title: { text: label.unit_x || "X" } },
              yaxis: { title: { text: label.unit_y || "Y" } },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
            useResizeHandler
          />
          <p className="text-[10px] text-gray-500 italic p-2 border-t border-gray-100">
            Switch to Table view to select cells and edit.
          </p>
        </div>
      )}

      {viewMode === "3d" && (
        <div className="border border-gray-200 rounded bg-white">
          <Plot
            data={[{
              type: "surface",
              z: wp,
              x: xAxis.length ? xAxis : undefined,
              y: yAxis.length ? yAxis : undefined,
              colorscale: COLORSCALE,
              hovertemplate: "X=%{x}<br>Y=%{y}<br>Z=%{z:.4f}<extra></extra>",
            }]}
            layout={{
              font: { family: FONT_FAMILY, size: 10 },
              height: 380,
              margin: { l: 0, r: 0, t: 10, b: 0 },
              scene: {
                xaxis: { title: { text: label.unit_x || "X" } },
                yaxis: { title: { text: label.unit_y || "Y" } },
                zaxis: { title: { text: label.unit_w || "Z" } },
                camera: { eye: { x: 1.6, y: 1.4, z: 1.0 } },
              },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>
      )}

      <div className="border border-gray-200 rounded p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-gray-700 uppercase">
            Selection: {selectedCells.size} cell{selectedCells.size !== 1 ? "s" : ""}
          </p>
          {selectedCells.size > 0 && (
            <button onClick={() => setSelectedCells(new Set())}
              className="text-[10px] text-red-600 hover:underline">Clear</button>
          )}
        </div>

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

        <div className="grid grid-cols-4 gap-1 mb-2">
          {[
            { label: "−1",   v: -1    },
            { label: "−0.1", v: -0.1  },
            { label: "+0.1", v:  0.1  },
            { label: "+1",   v:  1    },
          ].map(({ label: lbl, v }) => (
            <button key={lbl} onClick={() => apply("add", v)} disabled={saving}
              className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => apply("interpolate")} disabled={saving || selectedCells.size < 4}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
            Interpolate
          </button>
          <button onClick={() => apply("smooth")} disabled={saving || selectedCells.size < 1}
            className="px-2 py-1 text-[10px] border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">
            Smooth
          </button>
          <button onClick={reset} disabled={saving}
            className="px-2 py-1 text-[10px] border border-amber-300 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-50">
            Reset
          </button>
        </div>

        <p className="text-[10px] text-gray-500 italic mt-2">
          Click to select · Ctrl+Click multi-select · Shift+Click range. Interpolate needs ≥4 corners. Reset without selection resets whole map.
        </p>
      </div>
    </div>
  );
}
