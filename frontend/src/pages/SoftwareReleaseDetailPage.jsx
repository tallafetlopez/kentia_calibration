import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { fmtDate } from "../lib/constants";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2, XCircle, FileCode2, ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function SoftwareReleaseDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [sr, setSr] = useState(null);
  const [patch, setPatch] = useState({});

  const load = async () => {
    const { data } = await api.get(`/software-releases/${id}`);
    setSr(data);
    setPatch({
      a2l_file_reference: data.a2l_file_reference || "",
      dbc_reference: data.dbc_reference || "",
      dtc_list_reference: data.dtc_list_reference || "",
      description: data.description || "",
      supplier: data.supplier || "",
    });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  if (!sr) return <div className="tiny-label pulse-slow">Loading…</div>;

  const canEdit = user?.roles?.includes("PD_Project_Manager");

  const savePatch = async () => {
    try {
      await api.patch(`/software-releases/${id}`, patch);
      toast.success("Updated");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const runValidation = async () => {
    try {
      const { data } = await api.post(`/software-releases/${id}/validate`);
      if (data.ok) toast.success("Validated · marked VALID_FOR_CALIBRATION");
      else toast.error(data.errors.join(", "));
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const checks = [
    { ok: !!sr.a2l_file_reference, label: "A2L file linked" },
    { ok: !!sr.dbc_reference, label: "DBC reference present" },
    { ok: !!sr.dtc_list_reference, label: "DTC list reference present" },
    { ok: sr.status === "VALID_FOR_CALIBRATION", label: "Marked VALID_FOR_CALIBRATION" },
  ];

  return (
    <div className="space-y-6" data-testid="page-sr-detail">
      <Link to="/software-releases" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ArrowLeft className="w-3.5 h-3.5" /> Back</Link>

      <div className="panel p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <div className="tiny-label">Software Release</div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
              {sr.software_release_identifier}
            </h1>
            <div className="mt-1 text-sm text-slate-600">{sr.description || "—"}</div>
            <div className="mt-3 flex items-center gap-3 text-xs font-mono text-slate-500">
              <span>v{sr.version}</span>
              <span>·</span>
              <span>{sr.supplier}</span>
              <span>·</span>
              <span>released {fmtDate(sr.release_date)}</span>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-full border text-xs font-mono font-semibold ${sr.status === "VALID_FOR_CALIBRATION" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
            {sr.status}
          </div>
        </div>

        {sr.status !== "VALID_FOR_CALIBRATION" && (
          <div className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4" /> This release is not valid for calibration. Link A2L and run validation.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <div className="panel p-6">
          <div className="tiny-label mb-4">Artefacts</div>
          <div className="space-y-4">
            <div>
              <Label className="tiny-label">A2L file reference</Label>
              <div className="flex gap-2 mt-1.5">
                <Input value={patch.a2l_file_reference} onChange={(e) => setPatch({ ...patch, a2l_file_reference: e.target.value })} disabled={!canEdit} data-testid="sr-a2l-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="tiny-label">DBC reference</Label>
                <Input value={patch.dbc_reference} onChange={(e) => setPatch({ ...patch, dbc_reference: e.target.value })} disabled={!canEdit} className="mt-1.5" />
              </div>
              <div>
                <Label className="tiny-label">DTC list reference</Label>
                <Input value={patch.dtc_list_reference} onChange={(e) => setPatch({ ...patch, dtc_list_reference: e.target.value })} disabled={!canEdit} className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label className="tiny-label">Description</Label>
              <Input value={patch.description} onChange={(e) => setPatch({ ...patch, description: e.target.value })} disabled={!canEdit} className="mt-1.5" />
            </div>
            <div>
              <Label className="tiny-label">Supplier</Label>
              <Input value={patch.supplier} onChange={(e) => setPatch({ ...patch, supplier: e.target.value })} disabled={!canEdit} className="mt-1.5" />
            </div>
            <div className="pt-3 flex justify-end gap-2">
              <Button variant="outline" onClick={savePatch} disabled={!canEdit} data-testid="sr-save">Save changes</Button>
              <Button onClick={runValidation} disabled={!canEdit} className="bg-slate-900 hover:bg-slate-800" data-testid="sr-validate">
                <ShieldCheck className="w-4 h-4 mr-1.5" /> Run validation
              </Button>
            </div>
          </div>
        </div>

        <div className="panel p-6">
          <div className="tiny-label mb-4">Validation checklist</div>
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                <span className={c.ok ? "text-slate-800" : "text-slate-500"}>{c.label}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 tiny-label">Validation log</div>
          <div className="mt-2 space-y-2 max-h-64 overflow-auto">
            {(sr.validation_log || []).slice().reverse().map((l, i) => (
              <div key={i} className="text-[11px] font-mono text-slate-600 border-l-2 border-slate-200 pl-2">
                <div>{fmtDate(l.date)} · {l.user}</div>
                <div className="text-slate-900">{l.action}</div>
                {l.errors && l.errors.length > 0 && <div className="text-red-600">{l.errors.join("; ")}</div>}
              </div>
            ))}
            {(!sr.validation_log || sr.validation_log.length === 0) && <div className="text-xs text-slate-500">No validation runs yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
