import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import SwReleaseLabelViewer from "./SwReleaseLabelViewer";
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
  const [selectedId, setSelectedId] = useState(null);
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
  });

  const a2lInputRef = useRef(null);
  const dcmInputRef = useRef(null);
  const [a2lFile, setA2lFile] = useState(null);
  const [dcmFile, setDcmFile] = useState(null);

  const load = useCallback(async () => {
    const params = {};
    if (q) params.q = q;
    if (status !== "ALL") params.status = status;
    if (supplier) params.supplier = supplier;
    const { data } = await api.get("/software-releases", { params });
    setItems(data);
  }, [q, status, supplier]);

  const openRelease = async (r) => {
    try {
      await api.get(`/v1/sw-releases/${r.id}`);
      setSelectedId(r.id);
    } catch {
      const { data: v1List } = await api.get("/v1/sw-releases");
      const v1 = (v1List || []).find(x => x.identifier === r.software_release_identifier && x.version === r.version);
      if (v1) setSelectedId(v1._id || v1.id);
    }
  };

  const deleteRelease = async (e, r) => {
    e.stopPropagation();
    if (!window.confirm(`DELETE "${r.software_release_identifier} v${r.version}"?\n\nThis action is IRREVERSIBLE — the release and all uploaded files will be permanently removed.`)) return;
    try {
      let v1Id = null;
      try {
        await api.get(`/v1/sw-releases/${r.id}`);
        v1Id = r.id;
      } catch {
        const { data: v1List } = await api.get("/v1/sw-releases");
        const v1 = (v1List || []).find(x => x.identifier === r.software_release_identifier && x.version === r.version);
        if (v1) v1Id = v1._id || v1.id;
      }
      if (v1Id) {
        await api.delete(`/v1/sw-releases/${v1Id}`);
      } else {
        await api.delete(`/software-releases/${r.id}`);
      }
      if (selectedId === v1Id) setSelectedId(null);
      toast.success("Release deleted");
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to delete release");
    }
  };

  useEffect(() => { api.get("/ecus").then((r) => { setEcus(r.data); if (r.data[0]) setForm((f) => ({ ...f, ecu_id: r.data[0].id })); }); }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      // 1) Create legacy release — skip if identifier+version already exists
      const { data: existingList } = await api.get("/software-releases");
      const alreadyExists = (existingList || []).find(r =>
        r.software_release_identifier === form.software_release_identifier &&
        r.version === form.version
      );
      if (!alreadyExists) {
        await api.post("/software-releases", form);
      }

      // 2) Resolve or create v1 release
      const { data: v1List } = await api.get("/v1/sw-releases");
      let v1 = (v1List || []).find(r =>
        r.identifier === form.software_release_identifier && r.version === form.version
      );
      if (!v1) {
        const { data } = await api.post("/v1/sw-releases", {
          identifier: form.software_release_identifier,
          version: form.version,
          supplier: form.supplier,
          description: form.description,
          ecu_id: form.ecu_id,
        });
        v1 = data;
      }
      const v1Id = v1._id || v1.id;

      // 3) Upload A2L — non-fatal
      if (a2lFile) {
        try {
          const fd = new FormData();
          fd.append("file", a2lFile);
          await api.post(`/v1/sw-releases/${v1Id}/a2l/upload`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (e) {
          toast.warning(`A2L upload failed: ${e.response?.data?.detail || e.message}`);
        }
      }
      // 4) Upload DCM — non-fatal
      if (dcmFile) {
        try {
          const fd = new FormData();
          fd.append("file", dcmFile);
          await api.post(`/v1/sw-releases/${v1Id}/dcm/upload`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (e) {
          toast.warning(`DCM upload failed: ${e.response?.data?.detail || e.message}`);
        }
      }

      setOpen(false);
      setA2lFile(null);
      setDcmFile(null);
      setForm({ ...form, software_release_identifier: "", version: "", description: "", supplier: "" });
      await load();

      // 5) Select the new release in the embedded viewer
      setSelectedId(v1Id);
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to create release");
    }
  };

  const canCreate = user?.roles?.includes("PD_Project_Manager");

  return (
    <div style={{ display: "flex", height: "calc(100vh - 130px)", gap: 0 }} data-testid="page-software-releases">
    {/* ── Left panel: releases list ────────────────────────────────────────── */}
    <div style={{ width: 420, minWidth: 420, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 12, borderRight: "1px solid #E0E0E0", paddingTop: 4 }}>
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div className="tiny-label">Workflow 1</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Software Releases</h1>
          <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Register ECU software releases and upload A2L / DCM files.</p>
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
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <Label className="tiny-label">A2L file</Label>
                  <input
                    ref={a2lInputRef}
                    type="file"
                    accept=".a2l,.A2L"
                    style={{ display: "none" }}
                    onChange={e => setA2lFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => a2lInputRef.current?.click()}
                    className="ms-btn"
                    style={{ width: "100%", justifyContent: "flex-start", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                    data-testid="new-release-a2l"
                    title={a2lFile ? a2lFile.name : ""}
                  >
                    {a2lFile ? a2lFile.name : "Select A2L file..."}
                  </button>
                  {a2lFile && (
                    <button type="button" onClick={() => setA2lFile(null)}
                      className="text-[11px] text-red-600 hover:underline mt-1">
                      Remove
                    </button>
                  )}
                </div>
                <div>
                  <Label className="tiny-label">DCM file</Label>
                  <input
                    ref={dcmInputRef}
                    type="file"
                    accept=".dcm,.DCM"
                    style={{ display: "none" }}
                    onChange={e => setDcmFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => dcmInputRef.current?.click()}
                    className="ms-btn"
                    style={{ width: "100%", justifyContent: "flex-start", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
                    title={dcmFile ? dcmFile.name : ""}
                  >
                    {dcmFile ? dcmFile.name : "Select DCM file..."}
                  </button>
                  {dcmFile && (
                    <button type="button" onClick={() => setDcmFile(null)}
                      className="text-[11px] text-red-600 hover:underline mt-1">
                      Remove
                    </button>
                  )}
                </div>
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
      <div className="panel" style={{ overflowX: "auto" }}>
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
              <tr key={r.id} data-testid={`sr-row-${r.software_release_identifier}`}
                style={{ cursor: "pointer", background: selectedId === r.id ? "#EFF6FF" : undefined }}
                onClick={() => openRelease(r)}>
                <td style={{ fontWeight: 600 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{r.software_release_identifier}</span>
                    <button
                      onClick={e => deleteRelease(e, r)}
                      style={{ fontSize: 10, color: "#C0392B", fontWeight: 700, background: "none", border: "1px solid #C0392B", borderRadius: 3, cursor: "pointer", padding: "0px 4px", lineHeight: "16px", flexShrink: 0 }}
                      data-testid={`sr-delete-${r.software_release_identifier}`}
                      title="Delete release permanently"
                    >
                      ✕
                    </button>
                  </div>
                </td>
                <td style={{ fontFamily: "monospace" }}>{r.version}</td>
                <td>{r.supplier || "—"}</td>
                <td>
                  {r.a2l_file_reference
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "monospace", fontSize: 11 }}><FileCode2 size={12} /> {r.a2l_file_reference}</span>
                    : <span style={{ fontSize: 10, color: "#7A5C00" }}>not uploaded</span>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 11, color: "#605E5C" }}>{fmtDateShort(r.release_date)}</td>
                <td><StatusPill status={r.status} /></td>
                <td style={{ textAlign: "right" }}>
                  <button
                    onClick={e => { e.stopPropagation(); openRelease(r); }}
                    style={{ fontSize: 11, color: "#646E5A", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
                    data-testid={`sr-open-${r.software_release_identifier}`}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>No software releases found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    {/* ── Right panel: label viewer ─────────────────────────────────────────── */}
    <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
      {selectedId
        ? <SwReleaseLabelViewer id={selectedId} />
        : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#8A8886", fontSize: 12 }}>Select a release to view labels</div>
      }
    </div>
    </div>
  );
}
