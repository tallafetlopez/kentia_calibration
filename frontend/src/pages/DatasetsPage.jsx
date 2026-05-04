import React, { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { LIFECYCLE_STATES, DEPLOYMENT_CONTEXTS, CREATION_MODES, LifecycleBadge, fmtDate } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Search, Plus, Lock, ClipboardList, Download, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../lib/auth";

/* ── Calibration Change Log panel ─────────────────────────────────────────── */
function ChangeLogPanel({ datasets, sr }) {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterDs, setFilterDs] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit-log", { params: { limit: 200 } });
      // keep only calibration-relevant actions
      const relevant = data.filter((e) =>
        ["dataset", "label"].includes(e.entity_type)
      );
      setLog(relevant);
    } catch {
      toast.error("Could not load change log");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dsMap = Object.fromEntries(datasets.map((d) => [d.id, d.dataset_name]));

  const actions = [...new Set(log.map((e) => e.action))].sort();

  const filtered = log.filter((e) => {
    if (filterDs !== "ALL" && e.entity_id !== filterDs && !datasets.find((d) => d.id === filterDs && e.entity_id === filterDs)) {
      // for label entries, entity_id is label id — we can't filter by dataset easily without extra data
      // so for label rows just show all when a dataset filter is active only if entity_type=dataset
      if (e.entity_type === "label") return filterDs === "ALL";
      return e.entity_id === filterDs;
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
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `calibration_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const ACTION_COLOR = {
    CREATED: { bg: "#DFF6DD", color: "#1E6B1E", border: "#82C882" },
    LABEL_UPDATED: { bg: "#DDEEFF", color: "#004578", border: "#7EB3E0" },
    LABELS_MASS_UPDATED: { bg: "#DDEEFF", color: "#004578", border: "#7EB3E0" },
    DEPRECATED: { bg: "#FDE7E9", color: "#8B0000", border: "#F4ACAC" },
    SEED_DATA_LOADED: { bg: "#F3F3F3", color: "#605E5C", border: "#C8C8C8" },
  };
  const getActionStyle = (action) => {
    for (const key of Object.keys(ACTION_COLOR)) {
      if (action.includes(key)) return ACTION_COLOR[key];
    }
    return { bg: "#FFF4CE", color: "#7A5C00", border: "#F0D060" };
  };

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      {/* Panel header — clickable to collapse */}
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
          {/* Filters */}
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
                  {datasets.map((d) => (
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

          {/* Table */}
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

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function DatasetsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [sr, setSr] = useState([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState(params.get("state") || "ALL");
  const [context, setContext] = useState("ALL");
  const [mode, setMode] = useState("ALL");
  const [swr, setSwr] = useState("ALL");
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    dataset_name: "",
    software_release_id: "",
    creation_mode: "IMPORT_S37",
    deployment_context: "DEVELOPMENT",
    variant_id: "",
    vin: "",
    baseline_dataset_id: "",
    changelog_summary: "",
  });

  const load = async () => {
    const p = {};
    if (q) p.q = q;
    if (state !== "ALL") p.lifecycle_state = state;
    if (context !== "ALL") p.deployment_context = context;
    if (mode !== "ALL") p.creation_mode = mode;
    if (swr !== "ALL") p.software_release_id = swr;
    const { data } = await api.get("/datasets", { params: p });
    setItems(data);
  };

  useEffect(() => { api.get("/software-releases").then((r) => setSr(r.data)); }, []);
  useEffect(() => {
    load();
    const newParams = {};
    if (state !== "ALL") newParams.state = state;
    setParams(newParams);
    /* eslint-disable-next-line */
  }, [q, state, context, mode, swr]);

  useEffect(() => {
    const urlState = params.get("state");
    if (urlState && urlState !== state) setState(urlState);
    /* eslint-disable-next-line */
  }, [params]);

  const validSr = sr.filter((r) => r.status === "VALID_FOR_CALIBRATION");
  const canCreate = user?.roles?.includes("Calibration_Engineer") || user?.roles?.includes("Post_Sales_Engineer");

  const submit = async () => {
    try {
      const body = { ...form };
      if (!body.baseline_dataset_id) delete body.baseline_dataset_id;
      if (!body.variant_id) delete body.variant_id;
      if (!body.vin) delete body.vin;
      const { data } = await api.post("/datasets", body);
      toast.success(`Created ${data.dataset_name}`);
      setOpenCreate(false);
      setForm({ ...form, dataset_name: "", variant_id: "", vin: "", baseline_dataset_id: "", changelog_summary: "" });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const baselines = items.filter((i) => ["RELEASED", "APPROVED"].includes(i.lifecycle_state));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-datasets">

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="tiny-label">Workflow 2 · Catalogue</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Dataset Catalogue</h1>
          <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>All calibration datasets across software releases.</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <button disabled={!canCreate} className="ms-btn primary" data-testid="btn-new-dataset">
              <Plus size={13} /> New dataset
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Calibration Dataset</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="tiny-label">Software release (must be VALID_FOR_CALIBRATION)</Label>
                <Select value={form.software_release_id} onValueChange={(v) => setForm({ ...form, software_release_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="nds-swr"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {validSr.map((r) => <SelectItem key={r.id} value={r.id}>{r.software_release_identifier} · v{r.version}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">Dataset name</Label>
                <input value={form.dataset_name} onChange={(e) => setForm({ ...form, dataset_name: e.target.value })} className="ms-input" style={{ marginTop: 6 }} data-testid="nds-name" />
              </div>
              <div>
                <Label className="tiny-label">Creation mode</Label>
                <Select value={form.creation_mode} onValueChange={(v) => setForm({ ...form, creation_mode: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="nds-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>{CREATION_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="tiny-label">Deployment context</Label>
                <Select value={form.deployment_context} onValueChange={(v) => setForm({ ...form, deployment_context: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="nds-context"><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPLOYMENT_CONTEXTS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="tiny-label">Variant ID (optional)</Label>
                <input value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className="ms-input" style={{ marginTop: 6 }} />
              </div>
              <div>
                <Label className="tiny-label">VIN (optional)</Label>
                <input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="ms-input" style={{ marginTop: 6 }} />
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">Baseline dataset (for REUSE_BASELINE)</Label>
                <Select value={form.baseline_dataset_id || "none"} onValueChange={(v) => setForm({ ...form, baseline_dataset_id: v === "none" ? "" : v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {baselines.map((b) => <SelectItem key={b.id} value={b.id}>{b.dataset_name} [{b.lifecycle_state}]</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">Changelog summary</Label>
                <textarea value={form.changelog_summary} onChange={(e) => setForm({ ...form, changelog_summary: e.target.value })} className="ms-input" style={{ marginTop: 6, height: 64, resize: "vertical" }} rows={3} data-testid="nds-changelog" />
              </div>
            </div>
            <DialogFooter>
              <button className="ms-btn" onClick={() => setOpenCreate(false)}>Cancel</button>
              <button className="ms-btn primary" onClick={submit} data-testid="nds-create">Create dataset</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="panel" style={{ padding: "10px 12px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, alignItems: "flex-end" }}>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Search</div>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: "#8A8886" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="ms-input" style={{ paddingLeft: 22 }} placeholder="Dataset name…" data-testid="ds-search" />
          </div>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Lifecycle</div>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger data-testid="ds-state-filter" style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {LIFECYCLE_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Context</div>
          <Select value={context} onValueChange={setContext}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {DEPLOYMENT_CONTEXTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Mode</div>
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {CREATION_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Release</div>
          <Select value={swr} onValueChange={setSwr}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {sr.map((r) => <SelectItem key={r.id} value={r.id}>{r.software_release_identifier}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Dataset table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <table className="xl-table">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>State</th>
              <th>SW Release</th>
              <th>Context</th>
              <th>Mode</th>
              <th>Author</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => {
              const rel = sr.find((x) => x.id === d.software_release_id);
              return (
                <tr key={d.id} data-testid={`ds-row-${d.dataset_name}`}>
                  <td>
                    <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                      {d.dataset_name}
                      {d.locked && <Lock size={11} style={{ color: "#4A148C" }} />}
                      {d.is_post_sales_derived && <span style={{ fontSize: 9, fontFamily: "monospace", background: "#F3F3F3", color: "#605E5C", padding: "0 4px" }}>POST_SALES</span>}
                    </div>
                    {d.baseline_dataset_id && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#8A8886", marginTop: 1 }}>derived from baseline</div>}
                  </td>
                  <td><LifecycleBadge state={d.lifecycle_state} /></td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{rel?.software_release_identifier || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{d.deployment_context}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 11, color: "#605E5C" }}>{d.creation_mode}</td>
                  <td style={{ fontSize: 11 }}>{d.author}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 10, color: "#8A8886" }}>{fmtDate(d.last_modified_date)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link to={`/datasets/${d.id}`} style={{ fontSize: 11, color: "#646E5A", fontWeight: 600 }} data-testid={`ds-open-${d.dataset_name}`}>Open →</Link>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No datasets match filters</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Calibration Change Log ─────────────────────────────────────────── */}
      <ChangeLogPanel datasets={items} sr={sr} />

    </div>
  );
}
