import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { fmtDate, LifecycleBadge } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-vehicle-assignment">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Workflow 7</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Vehicle Assignment</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Assign release candidate / released datasets to VINs, variants or manufacturing orders and generate Vehicle_SW_IDs.</p>
      </div>

      <div className="panel" style={{ padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, alignItems: "flex-end" }}>
        <div className="col-span-2" style={{ gridColumn: "span 2" }}>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Dataset (must be RELEASE_CANDIDATE or RELEASED)</Label>
          <Select value={form.dataset_id} onValueChange={(v) => setForm({ ...form, dataset_id: v })}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }} data-testid="va-dataset"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>{datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.dataset_name} [{d.lifecycle_state}]</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>VIN</Label>
          <input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="ms-input" data-testid="va-vin" />
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Variant</Label>
          <input value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className="ms-input" />
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Mfg order ref</Label>
          <input value={form.manufacturing_order_reference} onChange={(e) => setForm({ ...form, manufacturing_order_reference: e.target.value })} className="ms-input" />
        </div>
        <div style={{ gridColumn: "span 4" }}>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Service case reference</Label>
          <input value={form.service_case_reference} onChange={(e) => setForm({ ...form, service_case_reference: e.target.value })} className="ms-input" />
        </div>
        <div>
          <button disabled={!canAssign} onClick={submit} className="ms-btn primary" style={{ width: "100%" }} data-testid="va-submit">
            <Car size={12} /> Generate
          </button>
        </div>
      </div>

      <div>
        <div className="tiny-label" style={{ marginBottom: 8 }}>Vehicle_SW_IDs · {vsids.length}</div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <table className="xl-table">
            <thead>
              <tr>
                <th>Vehicle_SW_ID</th>
                <th>Dataset</th>
                <th>VIN / Variant / MO / SC</th>
                <th>Created by</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {vsids.map((v) => {
                const d = datasets.find((x) => x.id === v.dataset_id);
                return (
                  <tr key={v.id} data-testid={`vsid-${v.id}`}>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{v.id.slice(0, 8)}…</td>
                    <td><Link to={`/datasets/${v.dataset_id}`} style={{ color: "#646E5A" }}>{d?.dataset_name || v.dataset_id.slice(0, 8)}</Link></td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{v.vin || v.variant_id || v.manufacturing_order_reference || v.service_case_reference || "—"}</td>
                    <td style={{ fontSize: 11 }}>{v.created_by}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{fmtDate(v.creation_date)}</td>
                  </tr>
                );
              })}
              {vsids.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No vehicle assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
