import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { LifecycleBadge, fmtDate, DEPLOYMENT_CONTEXTS } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Rocket, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function ReleaseCenterPage() {
  const { user } = useAuth();
  const [releases, setReleases] = useState([]);
  const [selSr, setSelSr] = useState("");
  const [selCtx, setSelCtx] = useState("PRODUCTION");
  const [variant, setVariant] = useState("");
  const [justification, setJustification] = useState("");
  const [all, setAll] = useState([]);
  const [vsids, setVsids] = useState([]);

  const load = async () => {
    const ds = await api.get("/datasets");
    setAll(ds.data);
    const vs = await api.get("/vehicle-sw-ids");
    setVsids(vs.data);
  };

  useEffect(() => {
    api.get("/software-releases", { params: { status: "VALID_FOR_CALIBRATION" } }).then((r) => {
      setReleases(r.data);
      if (r.data[0]) setSelSr(r.data[0].id);
    });
    load();
  }, []);

  const candidates = useMemo(() => {
    if (!selSr) return [];
    return all.filter((d) => d.software_release_id === selSr && d.lifecycle_state === "APPROVED" && d.deployment_context === selCtx);
  }, [all, selSr, selCtx]);

  const releaseCandidates = all.filter((d) => d.lifecycle_state === "RELEASE_CANDIDATE");

  const selectForRelease = async (ds) => {
    if (!justification) { toast.error("Enter justification"); return; }
    try {
      await api.post(`/datasets/${ds.id}/release-select`, {
        selected_deployment_context: selCtx,
        selected_variant_id: variant || null,
        selection_justification: justification,
      });
      toast.success(`${ds.dataset_name} → RELEASE_CANDIDATE`);
      setJustification("");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const canSelect = user?.roles?.includes("Configuration_Manager");

  return (
    <div className="space-y-6" data-testid="page-release-center">
      <div>
        <div className="tiny-label">Workflow 6</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>Release Center</h1>
        <p className="mt-1 text-sm text-slate-600">Select approved calibration datasets as release candidates for a software release.</p>
      </div>

      <div className="panel p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <Label className="tiny-label">Software release</Label>
          <Select value={selSr} onValueChange={setSelSr}>
            <SelectTrigger className="mt-1.5" data-testid="rc-sr-filter"><SelectValue /></SelectTrigger>
            <SelectContent>{releases.map((r) => <SelectItem key={r.id} value={r.id}>{r.software_release_identifier} · v{r.version}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label">Deployment context</Label>
          <Select value={selCtx} onValueChange={setSelCtx}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{DEPLOYMENT_CONTEXTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="tiny-label">Variant (optional)</Label>
          <Input value={variant} onChange={(e) => setVariant(e.target.value)} className="mt-1.5" />
        </div>
        <div className="md:col-span-4">
          <Label className="tiny-label">Selection justification</Label>
          <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} className="mt-1.5" rows={2} data-testid="rc-justification" />
        </div>
      </div>

      <div>
        <div className="tiny-label mb-3">Compatible candidates · {candidates.length}</div>
        {candidates.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-slate-500">No APPROVED candidates match this SW release + context.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((d) => (
              <div key={d.id} className="panel p-5" data-testid={`rc-cand-${d.dataset_name}`}>
                <div className="flex items-center justify-between">
                  <LifecycleBadge state={d.lifecycle_state} />
                  <Link to={`/datasets/${d.id}`} className="text-xs text-slate-600 hover:text-slate-900 hover:underline">Open →</Link>
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Chivo" }}>{d.dataset_name}</div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">{d.deployment_context} · {d.creation_mode}</div>
                <div className="mt-3 text-xs text-slate-600">{d.changelog_summary}</div>
                <div className="mt-4">
                  <Button disabled={!canSelect} onClick={() => selectForRelease(d)} className="bg-slate-900 hover:bg-slate-800" data-testid={`rc-select-${d.dataset_name}`}>
                    <Rocket className="w-4 h-4 mr-1.5" /> Mark as release candidate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="tiny-label mb-3">Current release candidates · {releaseCandidates.length}</div>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="tiny-label py-3 px-4">Dataset</th>
                <th className="tiny-label py-3 px-4">Context</th>
                <th className="tiny-label py-3 px-4">Selected by</th>
                <th className="tiny-label py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {releaseCandidates.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-3 px-4"><Link to={`/datasets/${d.id}`} className="text-slate-900 font-medium hover:underline">{d.dataset_name}</Link></td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-700">{d.selected_deployment_context}</td>
                  <td className="py-3 px-4 text-xs text-slate-700">{d.selected_by}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{fmtDate(d.selection_date)}</td>
                </tr>
              ))}
              {releaseCandidates.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No release candidates currently.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
