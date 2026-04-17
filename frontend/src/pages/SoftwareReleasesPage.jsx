import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { fmtDateShort } from "../lib/constants";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Plus, Search, FileCode2, CheckCircle2, Circle, Archive } from "lucide-react";
import { useAuth } from "../lib/auth";

function StatusPill({ status }) {
  const map = {
    DRAFT: "bg-slate-100 text-slate-700 border-slate-200",
    VALID_FOR_CALIBRATION: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ARCHIVED: "bg-slate-200 text-slate-600 border-slate-300",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${map[status]}`}>
      {status === "VALID_FOR_CALIBRATION" ? <CheckCircle2 className="w-3 h-3" /> : status === "ARCHIVED" ? <Archive className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
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
    <div className="space-y-6" data-testid="page-software-releases">
      <div className="flex items-end justify-between">
        <div>
          <div className="tiny-label">Workflow 1</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
            Software Releases
          </h1>
          <p className="mt-1 text-sm text-slate-600">Register ECU software releases and link A2L / DBC / DTC artefacts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!canCreate} className="bg-slate-900 hover:bg-slate-800" data-testid="btn-new-release">
              <Plus className="w-4 h-4 mr-1.5" /> New release
            </Button>
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
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button className="bg-slate-900 hover:bg-slate-800" onClick={create} data-testid="new-release-create">Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="panel p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Label className="tiny-label">Search</Label>
          <div className="relative mt-1.5">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Identifier, version, description…" data-testid="sr-search" />
          </div>
        </div>
        <div className="w-52">
          <Label className="tiny-label">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="mt-1.5" data-testid="sr-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="VALID_FOR_CALIBRATION">VALID_FOR_CALIBRATION</SelectItem>
              <SelectItem value="ARCHIVED">ARCHIVED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-52">
          <Label className="tiny-label">Supplier</Label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1.5" placeholder="e.g. Bosch" />
        </div>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <th className="tiny-label py-3 px-4">Identifier</th>
              <th className="tiny-label py-3 px-4">Version</th>
              <th className="tiny-label py-3 px-4">Supplier</th>
              <th className="tiny-label py-3 px-4">A2L</th>
              <th className="tiny-label py-3 px-4">Released</th>
              <th className="tiny-label py-3 px-4">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="table-row border-b border-slate-100 last:border-0" data-testid={`sr-row-${r.software_release_identifier}`}>
                <td className="py-3 px-4 font-medium text-slate-900">{r.software_release_identifier}</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">{r.version}</td>
                <td className="py-3 px-4 text-slate-700">{r.supplier || "—"}</td>
                <td className="py-3 px-4">
                  {r.a2l_file_reference ? (
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-700"><FileCode2 className="w-3.5 h-3.5" /> {r.a2l_file_reference}</span>
                  ) : <span className="text-[11px] text-amber-600">missing</span>}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500">{fmtDateShort(r.release_date)}</td>
                <td className="py-3 px-4"><StatusPill status={r.status} /></td>
                <td className="py-3 px-4 text-right">
                  <Link to={`/software-releases/${r.id}`} className="text-xs text-slate-900 font-medium hover:underline" data-testid={`sr-open-${r.software_release_identifier}`}>Open →</Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No software releases found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
