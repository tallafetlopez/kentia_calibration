import React, { useEffect, useState, useCallback } from "react";
import AppLayout from "../components/AppLayout";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Layers, Users } from "lucide-react";

const OWNER_OPTIONS = ["BeGas", "HERKO", "Shared"];

const ownerColor = {
  BeGas: "bg-blue-50 text-blue-700 border-blue-200",
  HERKO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Shared: "bg-amber-50 text-amber-700 border-amber-200",
};

function WpForm({ initial, ecus, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    code: "", name: "", description: "", ecu_id: "", sub_workpackage: "", responsible: "BeGas",
    ...(initial || {}),
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="tiny-label">Code *</Label>
          <Input
            className="mt-1 font-mono text-sm"
            placeholder="AIR_ADM"
            value={form.code}
            onChange={(e) => set("code", e.target.value.toUpperCase())}
            disabled={!!initial}
          />
        </div>
        <div>
          <Label className="tiny-label">ECU *</Label>
          <Select value={form.ecu_id} onValueChange={(v) => set("ecu_id", v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select ECU…" /></SelectTrigger>
            <SelectContent>
              {ecus.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="tiny-label">Name *</Label>
          <Input className="mt-1" placeholder="Air management admission" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <Label className="tiny-label">Sub-workpackage</Label>
          <Input className="mt-1 font-mono text-sm" placeholder="optional" value={form.sub_workpackage} onChange={(e) => set("sub_workpackage", e.target.value)} />
        </div>
        <div>
          <Label className="tiny-label">Responsible</Label>
          <Select value={form.responsible} onValueChange={(v) => set("responsible", v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OWNER_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="tiny-label">Description</Label>
          <Textarea rows={2} className="mt-1 text-sm" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          className="bg-slate-900 hover:bg-slate-800"
          disabled={loading || !form.code || !form.name || !form.ecu_id}
          onClick={() => onSubmit(form)}
        >
          {initial ? "Save changes" : "Create WorkPackage"}
        </Button>
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
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand" />
              WorkPackages
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Functional groupings of labels (BeGas req #4). Each label belongs to exactly one WP.
            </p>
          </div>
          <Button className="bg-slate-900 hover:bg-slate-800 h-8 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New WorkPackage
          </Button>
        </div>

        {/* Filters */}
        <div className="panel p-3 flex flex-wrap gap-2 items-center">
          <Input
            className="h-8 text-xs w-48"
            placeholder="Search code or name…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <Select value={filterEcu} onValueChange={setFilterEcu}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All ECUs</SelectItem>
              {ecus.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500 ml-auto">{filtered.length} workpackages</span>
        </div>

        {/* Table */}
        <div className="panel p-0 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-28">Code</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-24">ECU</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-24">Responsible</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-20">Sub-WP</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-600 w-20">Labels</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">
                  {wps.length === 0 ? "No WorkPackages yet. Create one to start assigning labels." : "No results for current filters."}
                </td></tr>
              ) : filtered.map((wp, i) => (
                <tr key={wp.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{wp.code}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {wp.name}
                    {wp.description && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{wp.description}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[10px]">{ecuName(wp.ecu_id)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${ownerColor[wp.responsible]}`}>
                      {wp.responsible}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-500 text-[10px]">{wp.sub_workpackage || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Users className="w-3 h-3 text-slate-400" />
                      {wp.label_count ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditTarget(wp)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        onClick={() => setDeleteTarget(wp)}
                        disabled={(wp.label_count ?? 0) > 0}
                        title={(wp.label_count ?? 0) > 0 ? "Has labels — cannot delete" : "Delete"}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
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
    </AppLayout>
  );
}
