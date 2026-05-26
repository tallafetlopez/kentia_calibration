import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail, apiCall } from "../lib/api";
import { toast } from "sonner";
import { LIFECYCLE_STATES, DEPLOYMENT_CONTEXTS, CREATION_MODES, LifecycleBadge, fmtDate } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Label } from "../components/ui/label";
import { Search, Plus, Lock, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import ChangeLogPanel from "../components/ChangeLogPanel";

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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

  const submit = () => apiCall(async () => {
    const body = { ...form };
    if (!body.baseline_dataset_id) delete body.baseline_dataset_id;
    if (!body.variant_id) delete body.variant_id;
    if (!body.vin) delete body.vin;
    const { data } = await api.post("/datasets", body);
    toast.success(`Created ${data.dataset_name}`);
    setOpenCreate(false);
    setForm({ ...form, dataset_name: "", variant_id: "", vin: "", baseline_dataset_id: "", changelog_summary: "" });
    load();
  });

  const deleteDataset = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.delete(`/datasets/${deleteTarget.id}`);
      toast.success(`Deleted ${deleteTarget.dataset_name}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setDeleteError(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setDeleteBusy(false);
    }
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
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {d.lifecycle_state === "EDIT" && (
                        <button
                          type="button"
                          className="ms-btn"
                          style={{ height: 26, width: 26, padding: 0, color: "#B42318", borderColor: "#F4ACAC" }}
                          onClick={() => { setDeleteError(""); setDeleteTarget(d); }}
                          data-testid={`ds-delete-${d.id}`}
                          aria-label={`Delete ${d.dataset_name}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                      <Link to={`/datasets/${d.id}`} style={{ fontSize: 11, color: "#646E5A", fontWeight: 600 }} data-testid={`ds-open-${d.dataset_name}`}>Open →</Link>
                    </div>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dataset {deleteTarget?.dataset_name}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <div style={{ fontSize: 12, color: "#B42318" }}>{deleteError}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteDataset(); }} disabled={deleteBusy} className="bg-red-600 text-white hover:bg-red-700 focus:bg-red-700">
              {deleteBusy ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
