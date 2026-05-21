import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Layers, Users } from "lucide-react";

const OWNER_OPTIONS = ["BeGas", "HERKO", "Shared"];

const ownerBadge = {
  BeGas: { background: "#DDEEFF", color: "#004578", border: "1px solid #7EB3E0" },
  HERKO: { background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882" },
  Shared: { background: "#FFF4CE", color: "#7A5C00", border: "1px solid #F0D060" },
};

function WpForm({ initial, ecus, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    code: "", name: "", description: "", ecu_id: "", sub_workpackage: "", responsible: "BeGas",
    ...(initial || {}),
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Code *</Label>
          <input
            className="ms-input"
            style={{ fontFamily: "monospace" }}
            placeholder="AIR_ADM"
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            disabled={!!initial}
          />
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>ECU *</Label>
          <Select value={form.ecu_id} onValueChange={(v) => set("ecu_id", v)}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue placeholder="Select ECU…" /></SelectTrigger>
            <SelectContent>
              {ecus.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Name *</Label>
          <input className="ms-input" placeholder="Air management admission" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Sub-workpackage</Label>
          <input className="ms-input" style={{ fontFamily: "monospace" }} placeholder="optional" value={form.sub_workpackage} onChange={(e) => set("sub_workpackage", e.target.value)} />
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Responsible</Label>
          <Select value={form.responsible} onValueChange={(v) => set("responsible", v)}>
            <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {OWNER_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Description</Label>
          <textarea rows={2} className="ms-input" style={{ height: 52, resize: "vertical" }} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <button className="ms-btn" onClick={onCancel}>Cancel</button>
        <button
          className="ms-btn primary"
          disabled={loading || !form.code || !form.name || !form.ecu_id}
          onClick={() => onSubmit(form)}
        >
          {initial ? "Save changes" : "Create WorkPackage"}
        </button>
      </DialogFooter>
    </div>
  );
}

export default function WorkPackagesPage() {
  const [wps, setWps] = useState([]);
  const [ecus, setEcus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterEcu, setFilterEcu] = useState("__all");

  const loadWps = useCallback(async () => {
    const res = await api.get("/v1/work-packages");
    setWps(res.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [wRes, eRes] = await Promise.all([api.get("/v1/work-packages"), api.get("/ecus")]);
        setWps(wRes.data);
        setEcus(eRes.data);
      } catch {
        toast.error("Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = wps.filter((wp) => {
    if (filterEcu !== "__all" && wp.ecu_id !== filterEcu) return false;
    if (filterText) {
      const q = filterText.toLowerCase();
      return wp.code.toLowerCase().includes(q) || wp.name.toLowerCase().includes(q);
    }
    return true;
  });

  const handleCreate = async (form) => {
    setSaving(true);
    try {
      await api.post("/v1/work-packages", form);
      toast.success("WorkPackage created");
      setCreateOpen(false);
      await loadWps();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (form) => {
    setSaving(true);
    try {
      await api.patch(`/v1/work-packages/${editTarget.id}`, form);
      toast.success("WorkPackage updated");
      setEditTarget(null);
      await loadWps();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/v1/work-packages/${deleteTarget.id}`);
      toast.success("Deleted");
      setDeleteTarget(null);
      await loadWps();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
      setDeleteTarget(null);
    }
  };

  const ecuName = (id) => ecus.find((e) => e.id === id)?.name || id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header */}
        <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div className="tiny-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Layers size={12} style={{ color: "#646E5A" }} /> WorkPackages
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>WorkPackages</h1>
            <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Functional groupings of labels. Each label belongs to exactly one WP.</p>
          </div>
          <button className="ms-btn primary" onClick={() => setCreateOpen(true)}>
            <Plus size={12} /> New WorkPackage
          </button>
        </div>

        {/* Filters */}
        <div className="panel" style={{ padding: "10px 12px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div>
            <div className="tiny-label" style={{ marginBottom: 3 }}>Search</div>
            <input
              className="ms-input"
              style={{ width: 200 }}
              placeholder="Search code or name…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <div>
            <div className="tiny-label" style={{ marginBottom: 3 }}>ECU</div>
            <Select value={filterEcu} onValueChange={setFilterEcu}>
              <SelectTrigger style={{ height: 24, fontSize: 12, width: 150 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All ECUs</SelectItem>
                {ecus.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <span style={{ fontSize: 11, color: "#8A8886", marginLeft: "auto" }}>{filtered.length} workpackages</span>
        </div>

        {/* Table */}
        <div className="panel" style={{ overflow: "hidden" }}>
          <table className="xl-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 100 }}>ECU</th>
                <th style={{ width: 100 }}>Responsible</th>
                <th style={{ width: 90 }}>Sub-WP</th>
                <th style={{ width: 70, textAlign: "right" }}>Labels</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>
                  {wps.length === 0 ? "No WorkPackages yet. Create one to start assigning labels." : "No results for current filters."}
                </td></tr>
              ) : filtered.map((wp) => (
                <tr key={wp.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#212121" }}>{wp.code}</td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{wp.name}</span>
                    {wp.description && <div style={{ fontSize: 10, color: "#8A8886", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{wp.description}</div>}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{ecuName(wp.ecu_id)}</td>
                  <td>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", ...ownerBadge[wp.responsible] }}>
                      {wp.responsible}
                    </span>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{wp.sub_workpackage || "—"}</td>
                  <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Users size={11} style={{ color: "#8A8886" }} />
                      {wp.label_count ?? "—"}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      <button className="ms-btn" style={{ height: 22, width: 22, padding: 0 }} onClick={() => setEditTarget(wp)}>
                        <Pencil size={11} />
                      </button>
                      <button
                        className="ms-btn"
                        style={{ height: 22, width: 22, padding: 0, color: (wp.label_count ?? 0) > 0 ? "#C8C8C8" : "#B42318", borderColor: (wp.label_count ?? 0) > 0 ? "#E0E0E0" : "#F4ACAC" }}
                        onClick={() => setDeleteTarget(wp)}
                        disabled={(wp.label_count ?? 0) > 0}
                        title={(wp.label_count ?? 0) > 0 ? "Has labels — cannot delete" : "Delete"}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New WorkPackage</DialogTitle></DialogHeader>
          <WpForm ecus={ecus} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit {editTarget?.code}</DialogTitle></DialogHeader>
          {editTarget && (
            <WpForm initial={editTarget} ecus={ecus} onSubmit={handleEdit} onCancel={() => setEditTarget(null)} loading={saving} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete WorkPackage?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-semibold">{deleteTarget?.code}</span> — {deleteTarget?.name} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
