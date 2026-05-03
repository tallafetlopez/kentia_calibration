import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { fmtDateShort } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Plus, Search, FileCode2, CheckCircle2, Circle, Archive } from "lucide-react";
import { useAuth } from "../lib/auth";

const STATUS_STYLE = {
  DRAFT: { background: "#F3F3F3", color: "#444", border: "1px solid #C8C8C8" },
  VALID_FOR_CALIBRATION: { background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882" },
  ARCHIVED: { background: "#E0E0E0", color: "#444", border: "1px solid #A0A0A0" },
};
function StatusPill({ status }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{ ...st, display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {status === "VALID_FOR_CALIBRATION" ? <CheckCircle2 size={10} /> : status === "ARCHIVED" ? <Archive size={10} /> : <Circle size={10} />}
      {status}
    </span>
  );
}

export default function SoftwareReleasesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [ecus, setEcus] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [supplier, setSupplier] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    ecu_id: "",
    software_release_identifier: "",
    version: "",
    description: "",
    supplier: "",
    a2l_file_reference: "",
    dbc_reference: "",
    dtc_list_reference: "",
  });

  const load = async () => {
    const params = {};
    if (q) params.q = q;
    if (status !== "ALL") params.status = status;
    if (supplier) params.supplier = supplier;
    const { data } = await api.get("/software-releases", { params });
    setItems(data);
  };

  useEffect(() => { api.get("/ecus").then((r) => { setEcus(r.data); if (r.data[0]) setForm((f) => ({ ...f, ecu_id: r.data[0].id })); }); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, status, supplier]);

  const create = async () => {
    try {
      await api.post("/software-releases", form);
      toast.success("Software release created");
      setOpen(false);
      setForm({ ...form, software_release_identifier: "", version: "", description: "", supplier: "", a2l_file_reference: "", dbc_reference: "", dtc_list_reference: "" });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const canCreate = user?.roles?.includes("PD_Project_Manager");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-software-releases">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="tiny-label">Workflow 1</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Software Releases</h1>
          <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Register ECU software releases and link A2L / DBC / DTC artefacts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button disabled={!canCreate} className="ms-btn primary" data-testid="btn-new-release">
              <Plus size={13} /> New release
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Register Software Release</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label className="tiny-label">ECU</Label>
                <Select value={form.ecu_id} onValueChange={(v) => setForm({ ...form, ecu_id: v })}>
                  <SelectTrigger className="mt-1.5" data-testid="new-release-ecu"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ecus.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="tiny-label">Identifier</Label>
                <Input value={form.software_release_identifier} onChange={(e) => setForm({ ...form, software_release_identifier: e.target.value })} className="mt-1.5" data-testid="new-release-identifier" />
              </div>
              <div>
                <Label className="tiny-label">Version</Label>
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} className="mt-1.5" data-testid="new-release-version" />
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">Supplier</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label className="tiny-label">A2L reference</Label>
                <Input value={form.a2l_file_reference} onChange={(e) => setForm({ ...form, a2l_file_reference: e.target.value })} className="mt-1.5" placeholder="ECM_SW_XXX.a2l" data-testid="new-release-a2l" />
              </div>
              <div>
                <Label className="tiny-label">DBC reference</Label>
                <Input value={form.dbc_reference} onChange={(e) => setForm({ ...form, dbc_reference: e.target.value })} className="mt-1.5" />
              </div>
              <div className="col-span-2">
                <Label className="tiny-label">DTC list reference</Label>
                <Input value={form.dtc_list_reference} onChange={(e) => setForm({ ...form, dtc_list_reference: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <button className="ms-btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="ms-btn primary" onClick={create} data-testid="new-release-create">Create</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="panel" style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Search</div>
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", color: "#8A8886" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="ms-input" style={{ paddingLeft: 22 }} placeholder="Identifier, version, description…" data-testid="sr-search" />
          </div>
        </div>
        <div style={{ width: 180 }}>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Status</div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="sr-status-filter" style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="VALID_FOR_CALIBRATION">VALID_FOR_CALIBRATION</SelectItem>
              <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ width: 160 }}>
          <div className="tiny-label" style={{ marginBottom: 3 }}>Supplier</div>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="ms-input" placeholder="e.g. Bosch" />
        </div>
      </div>

      {/* Table */}
      <div className="panel" style={{ overflow: "hidden" }}>
        <table className="xl-table">
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Version</th>
              <th>Supplier</th>
              <th>A2L</th>
              <th>Released</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} data-testid={`sr-row-${r.software_release_identifier}`}>
                <td style={{ fontWeight: 600 }}>{r.software_release_identifier}</td>
                <td style={{ fontFamily: "monospace" }}>{r.version}</td>
                <td>{r.supplier || "—"}</td>
                <td>
                  {r.a2l_file_reference
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "monospace", fontSize: 11 }}><FileCode2 size={12} /> {r.a2l_file_reference}</span>
                    : <span style={{ fontSize: 10, color: "#7A5C00" }}>missing</span>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 11, color: "#605E5C" }}>{fmtDateShort(r.release_date)}</td>
                <td><StatusPill status={r.status} /></td>
                <td style={{ textAlign: "right" }}>
                  <Link to={`/software-releases/${r.id}`} style={{ fontSize: 11, color: "#2B579A", fontWeight: 600 }} data-testid={`sr-open-${r.software_release_identifier}`}>Open →</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No software releases found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
