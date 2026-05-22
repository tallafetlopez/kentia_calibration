import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function SwReleaseMerge() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [swReleases,     setSwReleases]     = useState([]);
  const [overlayIds,     setOverlayIds]     = useState([]);
  const [strategy,       setStrategy]       = useState("overlay_wins");
  const [preview,        setPreview]        = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [merging,        setMerging]        = useState(false);
  const [manualRes,      setManualRes]      = useState({});
  const [currentSr,      setCurrentSr]      = useState(null);

  useEffect(() => {
    api.get("/v1/sw-releases")
      .then(r => {
        const list = r.data || [];
        setSwReleases(list);
        setCurrentSr(list.find(r => (r._id || r.id) === id));
      })
      .catch(() => {});
  }, [id]);

  const addOverlay = (srId) => {
    if (srId && !overlayIds.includes(srId) && srId !== id) {
      setOverlayIds(prev => [...prev, srId]);
      setPreview(null);
    }
  };

  const removeOverlay = (srId) => {
    setOverlayIds(prev => prev.filter(x => x !== srId));
    setPreview(null);
  };

  const runPreview = async () => {
    if (overlayIds.length === 0) {
      toast.error("Select at least one overlay release");
      return;
    }
    setPreviewLoading(true);
    try {
      const { data } = await api.post("/v1/labels/merge-preview", {
        base_sr_id:         id,
        overlay_sr_ids:     overlayIds,
        strategy,
        manual_resolutions: strategy === "manual" ? manualRes : null,
      });
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeMerge = async () => {
    setMerging(true);
    try {
      const resp = await api.post("/v1/labels/merge-export", {
        base_sr_id:         id,
        overlay_sr_ids:     overlayIds,
        strategy,
        manual_resolutions: strategy === "manual" ? manualRes : null,
      }, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/octet-stream" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `merged_${new Date().toISOString().slice(0, 10)}.dcm`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Merged DCM downloaded");
    } catch (e) {
      toast.error("Merge export failed");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-xs text-gray-500 hover:text-gray-800 mb-4">
        Back
      </button>

      <div className="mb-4">
        <h1 className="text-lg font-bold">Merge Calibrations</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Base release:&nbsp;
          <code className="text-blue-600 bg-blue-50 px-1 rounded">
            {currentSr?.version || id}
          </code>
        </p>
      </div>

      {/* ── Overlay selection ─────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded p-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Overlay releases <span className="font-normal text-gray-400">(applied in order, last wins)</span></h2>
        {overlayIds.length === 0 && (
          <p className="text-xs text-gray-400 mb-2">No overlays selected. Add at least one.</p>
        )}
        <ul className="mb-3 space-y-1">
          {overlayIds.map((ovId, i) => {
            const sr = swReleases.find(r => (r._id || r.id) === ovId);
            return (
              <li key={ovId} className="flex items-center gap-2 text-xs bg-gray-50 px-2 py-1 rounded">
                <span className="w-5 text-gray-400 text-center">{i + 1}.</span>
                <span className="flex-1 font-mono text-gray-700">{sr?.version || ovId}</span>
                <button onClick={() => removeOverlay(ovId)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
              </li>
            );
          })}
        </ul>
        <select
          onChange={e => { addOverlay(e.target.value); e.target.value = ""; }}
          className="border border-gray-300 rounded px-2 py-1 text-xs bg-white"
          defaultValue=""
        >
          <option value="">+ Add overlay release…</option>
          {swReleases
            .filter(r => {
              const rid = r._id || r.id;
              return rid !== id && !overlayIds.includes(rid);
            })
            .map(r => (
              <option key={r._id || r.id} value={r._id || r.id}>
                {r.version || r.name || r._id}
              </option>
            ))}
        </select>
      </div>

      {/* ── Strategy ─────────────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded p-4 mb-4">
        <h2 className="text-sm font-semibold mb-2">Conflict resolution</h2>
        <div className="flex flex-col gap-1.5 text-xs">
          {[
            { v: "overlay_wins", label: "Overlay wins", desc: "Last overlay value beats base (typical)" },
            { v: "base_wins",    label: "Base wins",    desc: "Keep base values, ignore overlay conflicts" },
            { v: "manual",       label: "Manual",       desc: "Resolve each conflict individually after preview" },
          ].map(o => (
            <label key={o.v} className="flex items-start gap-2 cursor-pointer">
              <input type="radio" checked={strategy === o.v} onChange={() => { setStrategy(o.v); setPreview(null); }}
                className="mt-0.5" />
              <span>
                <span className="font-semibold">{o.label}</span>
                <span className="text-gray-400"> — {o.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={runPreview}
          disabled={previewLoading || overlayIds.length === 0}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {previewLoading ? "Computing…" : "Run preview"}
        </button>
        {preview && (
          <button
            onClick={executeMerge}
            disabled={merging || (strategy === "manual" && preview.conflicts.some(c => !manualRes[c.name]))}
            className={`px-3 py-1.5 text-xs text-white rounded disabled:opacity-50 ${
              preview.summary.conflicts_count > 0 ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {merging ? "Exporting…" : "Execute and download DCM"}
          </button>
        )}
      </div>

      {/* ── Preview results ───────────────────────────────────────────────── */}
      {preview && (
        <div className="border border-gray-200 rounded p-4">
          <h2 className="text-sm font-semibold mb-3">Preview results</h2>

          <div className="grid grid-cols-4 gap-3 text-xs mb-4">
            {[
              { label: "Identical",      count: preview.summary.identical_count,       color: "emerald" },
              { label: "Conflicts",      count: preview.summary.conflicts_count,       color: "amber" },
              { label: "New in overlay", count: preview.summary.only_in_overlay_count, color: "blue" },
              { label: "Only in base",   count: preview.summary.only_in_base_count,    color: "gray" },
            ].map(({ label, count, color }) => (
              <div key={label} className={`border rounded p-2 text-center bg-${color}-50 border-${color}-200`}>
                <div className={`text-xl font-bold text-${color}-700`}>{count}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {preview.conflicts.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-amber-700 mb-1.5">
                {preview.conflicts.length} conflict{preview.conflicts.length > 1 ? "s" : ""}
              </h3>
              <div className="max-h-96 overflow-y-auto border border-amber-200 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-semibold text-gray-600">Label</th>
                      <th className="text-left px-2 py-1 font-semibold text-gray-600">Base value</th>
                      <th className="text-left px-2 py-1 font-semibold text-gray-600">Overlay value(s)</th>
                      {strategy === "manual" && (
                        <th className="text-left px-2 py-1 font-semibold text-gray-600">Choose</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.conflicts.map(c => (
                      <tr key={c.name} className="border-t border-amber-100">
                        <td className="px-2 py-1 font-mono text-blue-600">{c.name}</td>
                        <td className="px-2 py-1 font-mono text-gray-700">{c.base_value ?? "—"}</td>
                        <td className="px-2 py-1 font-mono text-gray-500 text-[10px]">
                          {c.overlay_values.map(ov => `${ov.version}: ${ov.value ?? "—"}`).join(" / ")}
                        </td>
                        {strategy === "manual" && (
                          <td className="px-2 py-1">
                            <select
                              value={manualRes[c.name] || "base"}
                              onChange={e => setManualRes(prev => ({...prev, [c.name]: e.target.value}))}
                              className="border border-gray-300 rounded px-1 text-[10px] bg-white"
                            >
                              <option value="base">Base</option>
                              {c.overlay_values.map((ov, idx) => (
                                <option key={idx} value={`overlay_${idx}`}>
                                  Overlay {idx + 1} ({ov.version})
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {preview.only_in_overlay.length > 0 && (
            <p className="text-[10px] text-blue-600 mt-2">
              + {preview.only_in_overlay.length} new labels will be added from overlay(s)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
