import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { LIFECYCLE_STATES, DEPLOYMENT_CONTEXTS, CREATION_MODES, LifecycleBadge, fmtDate } from "../lib/constants";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Search, Plus, Shield, Lock, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";

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
    // sync from url
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
    <div className="space-y-6" data-testid="page-datasets">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="tiny-label">Workflow 2 · Catalogue</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
            Dataset Catalogue
          </h1>
          <p className="mt-1 text-sm text-slate-600">All calibration datasets across software releases.</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button disabled={!canCreate} className="bg-slate-900 hover:bg-slate-800" data-testid="btn-new-dataset">
              <Plus className="w-4 h-4 mr-1.5" /> New dataset
            </Button>
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
                <Input value={form.dataset_name} onChange={(e) => setForm({ ...form, dataset_name: e.target.value })} className="mt-1.5" data-testid="nds-name" />
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
                <Input value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label className="tiny-label">VIN (optional)</Label>
                <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="mt-1.5" />
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
                <Textarea value={form.changelog_summary} onChange={(e) => setForm({ ...form, changelog_summary: e.target.value })} className="mt-1.5" rows={3} data-testid="nds-changelog" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancel</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={submit} data-testid="nds-create">Create dataset</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="panel p-4 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
        <div className="col-span-2">
          <Label className="tiny-label">Search</Label>
          <div className="relative mt-1.5">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Dataset name…" data-testid="ds-search" />
          </div>
        </div>
        <div>
          <Label className="tiny-label">Lifecycle</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="mt-1.5" data-testid="ds-state-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {LIFECYCLE_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label">Context</Label>
          <Select value={context} onValueChange={setContext}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {DEPLOYMENT_CONTEXTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label">Release</Label>
          <Select value={swr} onValueChange={setSwr}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              {sr.map((r) => <SelectItem key={r.id} value={r.id}>{r.software_release_identifier}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="tiny-label py-3 px-4">Dataset</th>
              <th className="tiny-label py-3 px-4">State</th>
              <th className="tiny-label py-3 px-4">SW Release</th>
              <th className="tiny-label py-3 px-4">Context</th>
              <th className="tiny-label py-3 px-4">Mode</th>
              <th className="tiny-label py-3 px-4">Author</th>
              <th className="tiny-label py-3 px-4">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((d) => {
              const rel = sr.find((x) => x.id === d.software_release_id);
              return (
                <tr key={d.id} className="table-row border-b border-slate-100 last:border-0" data-testid={`ds-row-${d.dataset_name}`}>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 flex items-center gap-1.5">
                      {d.dataset_name}
                      {d.locked && <Lock className="w-3 h-3 text-violet-600" />}
                      {d.is_post_sales_derived && <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 rounded-sm">POST_SALES</span>}
                    </div>
                    {d.baseline_dataset_id && <div className="text-[10px] font-mono text-slate-500 mt-0.5">derived from baseline</div>}
                  </td>
                  <td className="py-3 px-4"><LifecycleBadge state={d.lifecycle_state} /></td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{rel?.software_release_identifier || "—"}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-700">{d.deployment_context}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-500">{d.creation_mode}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">{d.author}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(d.last_modified_date)}</td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/datasets/${d.id}`} className="text-xs text-slate-900 font-medium hover:underline" data-testid={`ds-open-${d.dataset_name}`}>Open →</Link>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-sm text-slate-500">No datasets match filters</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
