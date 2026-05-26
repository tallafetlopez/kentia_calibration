import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, triggerDownload } from "../lib/api";
import { fmtDate } from "../lib/constants";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ChevronDown, ChevronRight, ClipboardList, Download, RefreshCw } from "lucide-react";

const ACTION_COLOR = {
  CREATED: { bg: "#DFF6DD", color: "#1E6B1E", border: "#82C882" },
  LABEL_UPDATED: { bg: "#DDEEFF", color: "#004578", border: "#7EB3E0" },
  LABELS_MASS_UPDATED: { bg: "#DDEEFF", color: "#004578", border: "#7EB3E0" },
  DEPRECATED: { bg: "#FDE7E9", color: "#8B0000", border: "#F4ACAC" },
  SEED_DATA_LOADED: { bg: "#F3F3F3", color: "#605E5C", border: "#C8C8C8" },
};

function getActionStyle(action) {
  for (const key of Object.keys(ACTION_COLOR)) {
    if (action.includes(key)) return ACTION_COLOR[key];
  }
  return { bg: "#FFF4CE", color: "#7A5C00", border: "#F0D060" };
}

export default function ChangeLogPanel({ datasets }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterDs, setFilterDs] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit-log", { params: { limit: 200 } });
      setLog(data.filter((e) => ["dataset", "label"].includes(e.entity_type)));
    } catch {
      toast.error("Could not load change log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dsMap = Object.fromEntries((datasets || []).map((d) => [d.id, d.dataset_name]));
  const actions = [...new Set(log.map((e) => e.action))].sort();

  const filtered = log.filter((e) => {
    if (filterDs !== "ALL") {
      if (e.entity_type === "label") return filterDs === "ALL";
      if (e.entity_id !== filterDs) return false;
    }
    if (filterAction !== "ALL" && e.action !== filterAction) return false;
    return true;
  });

  const exportCsv = () => {
    const header = ["Date", "Entity Type", "Entity ID", "Action", "Author", "Previous Value", "New Value", "Justification"];
    const rows = filtered.map((e) => [
      e.date, e.entity_type, e.entity_id, e.action,
      e.author, e.previous_value ?? "", e.new_value ?? "", e.justification ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    triggerDownload(new Blob([csv], { type: "text/csv" }), `calibration_change_log_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", background: "#F0F0F0", borderBottom: "1px solid #C8C8C8",
          cursor: "pointer", userSelect: "none",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <ClipboardList size={13} style={{ color: "#646E5A" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#212121" }}>
            Calibration Change Log
          </span>
          <span style={{
            fontSize: 10, fontFamily: "monospace", background: "#646E5A", color: "#fff",
            padding: "0 6px", marginLeft: 4,
          }}>{filtered.length}</span>
          <span style={{ fontSize: 10, color: "#8B0000", fontWeight: 600, marginLeft: 8 }}>
            ⚠ Legal requirement — all calibration changes are recorded
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button className="ms-btn" style={{ height: 24, padding: "0 8px", fontSize: 11 }} onClick={load} title="Refresh">
            <RefreshCw size={11} /> Refresh
          </button>
          <button className="ms-btn" style={{ height: 24, padding: "0 8px", fontSize: 11 }} onClick={exportCsv} title="Export CSV">
            <Download size={11} /> Export CSV
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <div style={{
            display: "flex", gap: 10, padding: "8px 12px",
            background: "#F8F8F8", borderBottom: "1px solid #E0E0E0", alignItems: "flex-end",
          }}>
            <div>
              <div className="tiny-label" style={{ marginBottom: 2 }}>Dataset</div>
              <Select value={filterDs} onValueChange={setFilterDs}>
                <SelectTrigger style={{ height: 24, fontSize: 11, width: 220 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All datasets</SelectItem>
                  {(datasets || []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.dataset_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="tiny-label" style={{ marginBottom: 2 }}>Action type</div>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger style={{ height: 24, fontSize: 11, width: 200 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All actions</SelectItem>
                  {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 10, color: "#605E5C", alignSelf: "center" }}>
              Showing {filtered.length} of {log.length} entries
            </div>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", fontSize: 11, color: "#8A8886" }}>Loading…</div>
            ) : (
              <table className="xl-table">
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ width: 140 }}>Date / Time</th>
                    <th style={{ width: 80 }}>Type</th>
                    <th>Action</th>
                    <th>Dataset / Entity</th>
                    <th>Author</th>
                    <th>Previous</th>
                    <th>New value</th>
                    <th>Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const st = getActionStyle(e.action);
                    const dsName = dsMap[e.entity_id] || e.entity_id?.slice(0, 8) + "…";
                    return (
                      <tr key={e.id}>
                        <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C", whiteSpace: "nowrap" }}>
                          {fmtDate(e.date)}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                            background: e.entity_type === "label" ? "#EDE7F6" : "#F0F0F0",
                            color: e.entity_type === "label" ? "#4A148C" : "#444",
                            border: `1px solid ${e.entity_type === "label" ? "#B39DDB" : "#C8C8C8"}`,
                            padding: "1px 5px",
                          }}>
                            {e.entity_type}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontSize: 10, fontWeight: 600, fontFamily: "monospace",
                            background: st.bg, color: st.color, border: `1px solid ${st.border}`,
                            padding: "1px 5px",
                          }}>
                            {e.action}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, fontFamily: "monospace" }}>
                          {e.entity_type === "dataset"
                            ? <Link to={`/datasets/${e.entity_id}`} style={{ color: "#646E5A" }}>{dsName}</Link>
                            : <span style={{ color: "#605E5C" }}>{e.entity_id?.slice(0, 12)}…</span>
                          }
                        </td>
                        <td style={{ fontSize: 11 }}>{e.author}</td>
                        <td style={{ fontSize: 10, fontFamily: "monospace", color: "#8A8886", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.previous_value ?? "—"}
                        </td>
                        <td style={{ fontSize: 10, fontFamily: "monospace", color: "#212121", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.new_value ?? "—"}
                        </td>
                        <td style={{ fontSize: 10, color: "#605E5C", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.justification || "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No entries match filters</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
