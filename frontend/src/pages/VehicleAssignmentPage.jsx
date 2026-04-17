import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { fmtDate, LifecycleBadge } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Car, GitBranch } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function VehicleAssignmentPage() {
  const { user } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [vsids, setVsids] = useState([]);
  const [form, setForm] = useState({ dataset_id: "", vin: "", variant_id: "", manufacturing_order_reference: "", service_case_reference: "" });

  const load = async () => {
    const ds = await api.get("/datasets");
    setDatasets(ds.data.filter((d) => ["RELEASE_CANDIDATE", "RELEASED"].includes(d.lifecycle_state)));
    const vs = await api.get("/vehicle-sw-ids");
    setVsids(vs.data);
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.dataset_id) { toast.error("Pick a dataset"); return; }
    try {
      const body = { ...form };
      Object.keys(body).forEach((k) => { if (!body[k]) body[k] = null; });
      body.dataset_id = form.dataset_id;
      await api.post("/vehicle-sw-ids", body);
      toast.success("Vehicle_SW_ID generated");
      setForm({ dataset_id: "", vin: "", variant_id: "", manufacturing_order_reference: "", service_case_reference: "" });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const canAssign = user?.roles?.includes("DM_Administrator");

  return (
    <div className="space-y-6" data-testid="page-vehicle-assignment">
      <div>
        <div className="tiny-label">Workflow 7</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>Vehicle Assignment</h1>
        <p className="mt-1 text-sm text-slate-600">Assign release candidate / released datasets to VINs, variants or manufacturing orders and generate Vehicle_SW_IDs.</p>
      </div>

      <div className="panel p-5 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
        <div className="md:col-span-2">
          <Label className="tiny-label">Dataset (must be RELEASE_CANDIDATE or RELEASED)</Label>
          <Select value={form.dataset_id} onValueChange={(v) => setForm({ ...form, dataset_id: v })}>
            <SelectTrigger className="mt-1.5" data-testid="va-dataset"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.dataset_name} [{d.lifecycle_state}]</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label">VIN</Label>
          <Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="mt-1.5" data-testid="va-vin" />
        </div>
        <div>
          <Label className="tiny-label">Variant</Label>
          <Input value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className="mt-1.5" />
        </div>
        <div>
          <Label className="tiny-label">Mfg order ref</Label>
          <Input value={form.manufacturing_order_reference} onChange={(e) => setForm({ ...form, manufacturing_order_reference: e.target.value })} className="mt-1.5" />
        </div>
        <div className="md:col-span-4">
          <Label className="tiny-label">Service case reference</Label>
          <Input value={form.service_case_reference} onChange={(e) => setForm({ ...form, service_case_reference: e.target.value })} className="mt-1.5" />
        </div>
        <div>
          <Button disabled={!canAssign} onClick={submit} className="bg-slate-900 hover:bg-slate-800 w-full" data-testid="va-submit"><Car className="w-4 h-4 mr-1.5" /> Generate</Button>
        </div>
      </div>

      <div>
        <div className="tiny-label mb-3">Vehicle_SW_IDs · {vsids.length}</div>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="tiny-label py-3 px-4">Vehicle_SW_ID</th>
                <th className="tiny-label py-3 px-4">Dataset</th>
                <th className="tiny-label py-3 px-4">VIN / Variant / MO / SC</th>
                <th className="tiny-label py-3 px-4">Created by</th>
                <th className="tiny-label py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {vsids.map((v) => {
                const d = datasets.find((x) => x.id === v.dataset_id);
                return (
                  <tr key={v.id} className="border-b border-slate-100 table-row" data-testid={`vsid-${v.id}`}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-900">{v.id.slice(0, 8)}…</td>
                    <td className="py-3 px-4"><Link to={`/datasets/${v.dataset_id}`} className="text-slate-900 hover:underline">{d?.dataset_name || v.dataset_id.slice(0, 8)}</Link></td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-700">{v.vin || v.variant_id || v.manufacturing_order_reference || v.service_case_reference || "—"}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{v.created_by}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(v.creation_date)}</td>
                  </tr>
                );
              })}
              {vsids.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-500">No vehicle assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
