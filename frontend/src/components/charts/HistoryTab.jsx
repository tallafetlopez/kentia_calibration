import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";

export default function HistoryTab({ swReleaseId, labelName }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/v1/sw-releases/${swReleaseId}/labels/${encodeURIComponent(labelName)}/values/history`, {
      params: { limit: 100 },
    })
      .then(r => setEntries(r.data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [swReleaseId, labelName]);

  if (loading) return <div className="p-4 text-xs text-gray-400">Loading history…</div>;
  if (entries.length === 0) {
    return <div className="p-4 text-xs text-gray-400 italic">No edits recorded for this label yet.</div>;
  }

  return (
    <div className="p-3">
      <p className="text-[11px] font-semibold text-gray-700 uppercase mb-2">
        Edit history ({entries.length})
      </p>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left text-gray-500">When</th>
              <th className="px-2 py-1 text-left text-gray-500">User</th>
              <th className="px-2 py-1 text-left text-gray-500">Op</th>
              <th className="px-2 py-1 text-left text-gray-500">Value</th>
              <th className="px-2 py-1 text-left text-gray-500">Cells</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-2 py-1 text-gray-600 font-mono">
                  {e.ts ? new Date(e.ts).toLocaleString() : "—"}
                </td>
                <td className="px-2 py-1 text-gray-700">{e.user || "—"}</td>
                <td className="px-2 py-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded font-mono">{e.operation}</span>
                </td>
                <td className="px-2 py-1 font-mono text-gray-700">{e.value ?? "—"}</td>
                <td className="px-2 py-1 text-gray-500">
                  {e.reset_scope === "all" ? "all" : (e.cells?.length || "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
