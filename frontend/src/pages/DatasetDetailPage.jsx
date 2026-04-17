import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { LifecycleBadge, fmtDate } from "../lib/constants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Checkbox } from "../components/ui/checkbox";
import {
  ArrowLeft,
  Lock,
  ShieldAlert,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  FileCheck2,
  Car,
  GitBranch,
  Copy as CopyIcon,
  Trash2,
  Pencil,
} from "lucide-react";
import { useAuth } from "../lib/auth";

const REVIEW_DOMAINS = [
  { key: "technical", label: "Technical Review", roles: ["Calibration_Engineer", "PI_Engineering_Manager"] },
  { key: "project_configuration", label: "Project Configuration", roles: ["Configuration_Manager", "PD_Project_Manager"] },
  { key: "regulatory", label: "Regulatory Compliance", roles: ["PI_Regulatory_Compliance_Specialist"] },
  { key: "vnv", label: "Verification & Validation", roles: ["PD_Verification_Validation_Engineer"] },
];

function LabelBadge({ children, tone }) {
  const map = {
    reg: "bg-red-50 text-red-700 border-red-200",
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono border ${map[tone]}`}>{children}</span>;
}

export default function DatasetDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null);
  const [labels, setLabels] = useState([]);
  const [filter, setFilter] = useState({ q: "", modified: false, regulatory: false, incomplete: false });
  const [editing, setEditing] = useState(null);
  const [audit, setAudit] = useState([]);
  const [dialogs, setDialogs] = useState({ release: false, deprecate: false, derive: false, attach_vnv: false, review: null });
  const [tab, setTab] = useState("overview");
  const [otherDsId, setOtherDsId] = useState("");
  const [diff, setDiff] = useState(null);
  const [allDatasets, setAllDatasets] = useState([]);

  const load = async () => {
    const { data } = await api.get(`/datasets/${id}`);
    setBundle(data);
    const lbls = await api.get(`/datasets/${id}/labels`);
    setLabels(lbls.data);
    const a = await api.get(`/audit-log`, { params: { entity_id: id } });
    setAudit(a.data);
  };

  useEffect(() => { load(); api.get("/datasets").then((r) => setAllDatasets(r.data)); /* eslint-disable-next-line */ }, [id]);

  if (!bundle) return <div className="tiny-label pulse-slow">Loading dataset…</div>;
  const d = bundle.dataset;
  const sr = bundle.software_release;
  const baseline = bundle.baseline;
  const derived = bundle.derived_datasets || [];
  const vAssignments = bundle.vehicle_assignments || [];
  const readOnly = ["RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"].includes(d.lifecycle_state);

  // computed
  const regulatoryLabels = labels.filter((l) => l.regulatory_relevance === "YES");
  const incompleteLabels = labels.filter((l) => l.confidence_status === "EMPTY" ||
    (l.regulatory_relevance === "YES" && !l.change_justification));
  const modifiedCount = labels.filter((l) => l.modified).length;

  const filtered = labels.filter((l) => {
    if (filter.q && !l.label_name.toLowerCase().includes(filter.q.toLowerCase())) return false;
    if (filter.modified && !l.modified) return false;
    if (filter.regulatory && l.regulatory_relevance !== "YES") return false;
    if (filter.incomplete && !(l.confidence_status === "EMPTY" || (l.regulatory_relevance === "YES" && !l.change_justification))) return false;
    return true;
  });

  const saveLabel = async () => {
    try {
      const patch = {};
      ["current_value", "level", "confidence_status", "regulatory_relevance", "regulation_reference",
        "parametrizable_in_customer", "parametrizable_override_justification", "change_justification", "comments"
      ].forEach((k) => { if (editing[k] !== undefined) patch[k] = editing[k]; });
      await api.patch(`/datasets/${id}/labels/${editing.id}`, patch);
      toast.success("Label updated");
      setEditing(null);
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const runTechValidate = async () => {
    try {
      const { data } = await api.post(`/datasets/${id}/technical-validate`);
      if (data.status === "PASS") toast.success("Technical validation PASS");
      else toast.error(`FAIL: ${data.errors.length} issue(s)`);
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const submitApproval = async () => {
    try {
      await api.post(`/datasets/${id}/submit-approval`);
      toast.success("Submitted for approval");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const submitReview = async (domain, status, comments, vnvRef) => {
    try {
      const body = { domain, status };
      if (comments) body.comments = comments;
      if (vnvRef) body.vnv_report_reference = vnvRef;
      await api.post(`/datasets/${id}/review`, body);
      toast.success(`${domain} · ${status}`);
      setDialogs({ ...dialogs, review: null });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const approve = async () => {
    try {
      await api.post(`/datasets/${id}/approve`);
      toast.success("Dataset APPROVED");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const releaseSelect = async (ctx, variant, justification) => {
    try {
      await api.post(`/datasets/${id}/release-select`, {
        selected_deployment_context: ctx,
        selected_variant_id: variant || null,
        selection_justification: justification,
      });
      toast.success("Marked RELEASE_CANDIDATE");
      setDialogs({ ...dialogs, release: false });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const deprecate = async (just, repl) => {
    try {
      await api.post(`/datasets/${id}/deprecate`, { justification: just, replacement_dataset_id: repl || null });
      toast.success("Deprecated");
      setDialogs({ ...dialogs, deprecate: false });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const derivePostSales = async (name, vin, variant, svc, changelog) => {
    try {
      const { data } = await api.post(`/datasets/${id}/derive-post-sales`, {
        dataset_name: name, vin: vin || null, variant_id: variant || null, service_case_reference: svc || null, changelog_summary: changelog,
      });
      toast.success("Derived dataset created");
      setDialogs({ ...dialogs, derive: false });
      navigate(`/datasets/${data.id}`);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const attachVnv = async (ref) => {
    try {
      await api.post(`/datasets/${id}/attach-vnv`, { vnv_report_reference: ref });
      toast.success("V&V report attached");
      setDialogs({ ...dialogs, attach_vnv: false });
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const fetchDiff = async () => {
    if (!otherDsId) return;
    const { data } = await api.get(`/datasets/${id}/compare/${otherDsId}`);
    setDiff(data);
  };

  // Readiness checklist for submission
  const checklist = [
    { ok: labels.every((l) => l.confidence_status !== "EMPTY"), label: "All labels have confidence status" },
    { ok: regulatoryLabels.every((l) => !!l.change_justification), label: "Regulatory labels have change justification" },
    { ok: !!d.changelog_summary, label: "Changelog summary present" },
    { ok: !!d.review?.vnv_report_reference, label: "V&V report attached" },
    { ok: d.technical_validation_status === "PASS", label: "Technical validation PASS" },
  ];
  const readyToSubmit = checklist.every((c) => c.ok);

  const canEditDs = !readOnly && (user?.roles?.includes("Calibration_Engineer") || user?.roles?.includes("Post_Sales_Engineer"));
  const canApprove = user?.roles?.includes("PI_Engineering_Manager");
  const canSelect = user?.roles?.includes("Configuration_Manager");
  const canDeprecate = user?.roles?.includes("Configuration_Manager");

  return (
    <div className="space-y-6" data-testid="page-dataset-detail">
      <Link to="/datasets" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><ArrowLeft className="w-3.5 h-3.5" /> Back to catalogue</Link>

      {/* Header */}
      <div className="panel p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <LifecycleBadge state={d.lifecycle_state} />
              {d.locked && <span className="lc-badge lc-RELEASE_CANDIDATE"><Lock className="w-3 h-3" /> LOCKED</span>}
              {d.is_post_sales_derived && <span className="lc-badge lc-EDIT">POST-SALES DERIVED</span>}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>
              {d.dataset_name}
            </h1>
            <div className="mt-1 text-sm text-slate-600">{d.changelog_summary || "—"}</div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-slate-600">
              <div><span className="text-slate-400">SW · </span>{sr?.software_release_identifier} v{sr?.version}</div>
              <div><span className="text-slate-400">Context · </span>{d.deployment_context}</div>
              <div><span className="text-slate-400">Mode · </span>{d.creation_mode}</div>
              <div><span className="text-slate-400">Author · </span>{d.author}</div>
              <div><span className="text-slate-400">Updated · </span>{fmtDate(d.last_modified_date)}</div>
              {d.variant_id && <div><span className="text-slate-400">Variant · </span>{d.variant_id}</div>}
              {d.vin && <div><span className="text-slate-400">VIN · </span>{d.vin}</div>}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {readOnly && (
              <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-3 py-2">
                <Lock className="w-4 h-4" /> Dataset is {d.lifecycle_state} — read-only
              </div>
            )}
            {regulatoryLabels.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <ShieldAlert className="w-4 h-4" /> Contains {regulatoryLabels.length} regulatory-relevant labels
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Traceability side panel (horizontal) */}
      <div className="panel p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-xs font-mono">
          <GitBranch className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500">Traceability</span>
          <span className="text-slate-400">·</span>
          {sr && <Link to={`/software-releases/${sr.id}`} className="text-slate-900 hover:underline">{sr.software_release_identifier}</Link>}
          <span className="text-slate-400">→</span>
          <span className="text-slate-900">{d.dataset_name}</span>
          {baseline && <>
            <span className="text-slate-400">· baseline</span>
            <Link to={`/datasets/${baseline.id}`} className="text-slate-900 hover:underline">{baseline.dataset_name}</Link>
          </>}
          {vAssignments.length > 0 && <>
            <span className="text-slate-400">→</span>
            <span className="text-slate-900">{vAssignments.length} vehicle assignment(s)</span>
          </>}
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="compare-btn"><CopyIcon className="w-3.5 h-3.5 mr-1.5" /> Compare with…</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Compare label-by-label</DialogTitle></DialogHeader>
            <div className="flex gap-2">
              <Select value={otherDsId} onValueChange={setOtherDsId}>
                <SelectTrigger><SelectValue placeholder="Pick another dataset…" /></SelectTrigger>
                <SelectContent>
                  {allDatasets.filter((x) => x.id !== id).map((x) => <SelectItem key={x.id} value={x.id}>{x.dataset_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={fetchDiff} disabled={!otherDsId}>Compute diff</Button>
            </div>
            {diff && (
              <div className="mt-4 max-h-[50vh] overflow-auto">
                <div className="tiny-label mb-2">{diff.diffs.length} differences · {diff.total_labels_a} vs {diff.total_labels_b} labels</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-slate-200">
                      <th className="py-2 pr-2 tiny-label">Label</th>
                      <th className="py-2 pr-2 tiny-label">This</th>
                      <th className="py-2 pr-2 tiny-label">Other</th>
                      <th className="py-2 pr-2 tiny-label">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.diffs.map((r) => (
                      <tr key={r.label_name} className="border-b border-slate-100">
                        <td className="py-2 pr-2 font-mono text-slate-900">{r.label_name}</td>
                        <td className="py-2 pr-2 font-mono text-slate-700">{r.a_value ?? "—"}</td>
                        <td className="py-2 pr-2 font-mono text-slate-700">{r.b_value ?? "—"}</td>
                        <td className="py-2 pr-2"><LabelBadge tone={r.change_type === "CHANGED" ? "warn" : r.change_type === "ADDED" ? "ok" : "reg"}>{r.change_type}</LabelBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-transparent p-0 h-auto border-b border-slate-200 rounded-none w-full justify-start gap-6">
          {[
            ["overview", "Overview"],
            ["labels", `Labels · ${labels.length}`],
            ["changelog", "Changelog"],
            ["review", "Review & Approval"],
            ["deployment", "Deployment"],
            ["audit", "Audit Trail"],
          ].map(([v, lbl]) => (
            <TabsTrigger key={v} value={v} className="relative data-[state=active]:text-slate-900 data-[state=active]:shadow-none rounded-none pb-3 pt-0 px-0 font-medium text-sm text-slate-500 data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:-bottom-[1px] data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-[2px] data-[state=active]:after:bg-blue-600 bg-transparent" data-testid={`ds-tab-${v}`}>
              {lbl}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="panel p-5 lg:col-span-2">
              <div className="tiny-label mb-3">Readiness checklist</div>
              <ul className="space-y-2">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-sm">
                    {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
                    <span className={c.ok ? "text-slate-800" : "text-slate-500"}>{c.label}</span>
                  </li>
                ))}
              </ul>
              {d.lifecycle_state === "EDIT" && (
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" onClick={runTechValidate} disabled={!canEditDs} data-testid="btn-tech-validate"><Shield className="w-4 h-4 mr-1.5" /> Run technical validation</Button>
                  <Button onClick={() => setDialogs({ ...dialogs, attach_vnv: true })} variant="outline" disabled={!canEditDs} data-testid="btn-attach-vnv"><FileCheck2 className="w-4 h-4 mr-1.5" /> Attach V&V</Button>
                  <Button onClick={submitApproval} disabled={!canEditDs || !readyToSubmit} className="bg-slate-900 hover:bg-slate-800 ml-auto" data-testid="btn-submit-approval">Submit for approval</Button>
                </div>
              )}
              {d.lifecycle_state === "APPROVED" && (
                <div className="mt-5 flex gap-2">
                  <Button onClick={() => setDialogs({ ...dialogs, release: true })} disabled={!canSelect} className="bg-slate-900 hover:bg-slate-800" data-testid="btn-release-select"><Rocket className="w-4 h-4 mr-1.5" /> Select for release</Button>
                </div>
              )}
              {d.lifecycle_state === "RELEASED" && (
                <div className="mt-5 flex gap-2">
                  <Button variant="outline" onClick={() => setDialogs({ ...dialogs, derive: true })} data-testid="btn-derive">Create post-sales derived dataset</Button>
                </div>
              )}
              {(d.lifecycle_state === "APPROVED" || d.lifecycle_state === "RELEASE_CANDIDATE" || d.lifecycle_state === "RELEASED") && (
                <div className="mt-3">
                  <Button variant="outline" onClick={() => setDialogs({ ...dialogs, deprecate: true })} disabled={!canDeprecate} className="text-red-600 border-red-200 hover:bg-red-50" data-testid="btn-deprecate"><Trash2 className="w-4 h-4 mr-1.5" /> Deprecate</Button>
                </div>
              )}
            </div>
            <div className="panel p-5">
              <div className="tiny-label mb-3">Label statistics</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Chivo" }}>{labels.length}</div><div className="tiny-label">Total</div></div>
                <div><div className="text-2xl font-bold text-red-700" style={{ fontFamily: "Chivo" }}>{regulatoryLabels.length}</div><div className="tiny-label">Regulatory</div></div>
                <div><div className="text-2xl font-bold text-amber-700" style={{ fontFamily: "Chivo" }}>{incompleteLabels.length}</div><div className="tiny-label">Incomplete</div></div>
                <div><div className="text-2xl font-bold text-blue-700" style={{ fontFamily: "Chivo" }}>{modifiedCount}</div><div className="tiny-label">Modified</div></div>
              </div>
            </div>
          </div>

          {derived.length > 0 && (
            <div className="panel p-5">
              <div className="tiny-label mb-3">Derived datasets</div>
              <ul className="space-y-2">
                {derived.map((dv) => (
                  <li key={dv.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <LifecycleBadge state={dv.lifecycle_state} />
                      <Link to={`/datasets/${dv.id}`} className="text-slate-900 font-medium hover:underline">{dv.dataset_name}</Link>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{dv.deployment_context}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* Labels */}
        <TabsContent value="labels" className="mt-6 space-y-4">
          <div className="panel p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="tiny-label">Search</Label>
              <Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} className="mt-1.5" placeholder="Label name…" data-testid="lbl-search" />
            </div>
            <label className="flex items-center gap-2 text-xs px-3 py-2 border border-slate-200 rounded-md cursor-pointer">
              <Checkbox checked={filter.modified} onCheckedChange={(v) => setFilter({ ...filter, modified: !!v })} /> Modified
            </label>
            <label className="flex items-center gap-2 text-xs px-3 py-2 border border-slate-200 rounded-md cursor-pointer">
              <Checkbox checked={filter.regulatory} onCheckedChange={(v) => setFilter({ ...filter, regulatory: !!v })} /> Regulatory
            </label>
            <label className="flex items-center gap-2 text-xs px-3 py-2 border border-slate-200 rounded-md cursor-pointer">
              <Checkbox checked={filter.incomplete} onCheckedChange={(v) => setFilter({ ...filter, incomplete: !!v })} /> Incomplete
            </label>
          </div>

          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left">
                  <th className="tiny-label py-3 px-4">Label</th>
                  <th className="tiny-label py-3 px-4">Value</th>
                  <th className="tiny-label py-3 px-4">Unit</th>
                  <th className="tiny-label py-3 px-4">Level</th>
                  <th className="tiny-label py-3 px-4">Confidence</th>
                  <th className="tiny-label py-3 px-4">Attributes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 table-row" data-testid={`lbl-row-${l.label_name}`}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-900">{l.label_name}<span className="ml-1 text-[10px] text-slate-400">{l.data_type}</span></td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-800">{l.current_value || "—"}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{l.unit || "—"}</td>
                    <td className="py-3 px-4 text-[10px] font-mono text-slate-600">{l.level}</td>
                    <td className="py-3 px-4">
                      <LabelBadge tone={l.confidence_status === "EMPTY" ? "warn" : l.confidence_status === "DOCUMENTED" ? "ok" : "info"}>{l.confidence_status}</LabelBadge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1 flex-wrap">
                        {l.regulatory_relevance === "YES" && <LabelBadge tone="reg"><ShieldAlert className="w-3 h-3" /> REG</LabelBadge>}
                        {l.parametrizable_in_customer === "YES" && <LabelBadge tone="info">CUSTOMER</LabelBadge>}
                        {l.modified && <LabelBadge tone="warn">MOD</LabelBadge>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setEditing({ ...l })} data-testid={`lbl-edit-${l.label_name}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-500">No labels match filters</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Edit panel */}
          <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Edit label — <span className="font-mono text-sm">{editing?.label_name}</span></DialogTitle>
              </DialogHeader>
              {editing && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="tiny-label">Current value</Label>
                    <Input value={editing.current_value || ""} onChange={(e) => setEditing({ ...editing, current_value: e.target.value })} className="mt-1.5 font-mono" data-testid="lbl-edit-value" />
                  </div>
                  <div>
                    <Label className="tiny-label">Level</Label>
                    <Select value={editing.level} onValueChange={(v) => setEditing({ ...editing, level: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="tiny-label">Confidence</Label>
                    <Select value={editing.confidence_status} onValueChange={(v) => setEditing({ ...editing, confidence_status: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="tiny-label">Regulatory</Label>
                    <Select value={editing.regulatory_relevance} onValueChange={(v) => setEditing({ ...editing, regulatory_relevance: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="NO">NO</SelectItem><SelectItem value="YES">YES</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="tiny-label">Parametrizable in customer</Label>
                    <Select value={editing.parametrizable_in_customer} onValueChange={(v) => setEditing({ ...editing, parametrizable_in_customer: v })}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="NO">NO</SelectItem><SelectItem value="YES">YES</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="tiny-label">Regulation reference</Label>
                    <Input value={editing.regulation_reference || ""} onChange={(e) => setEditing({ ...editing, regulation_reference: e.target.value })} className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label className="tiny-label">Change justification {editing.regulatory_relevance === "YES" && <span className="text-red-600">*</span>}</Label>
                    <Textarea value={editing.change_justification || ""} onChange={(e) => setEditing({ ...editing, change_justification: e.target.value })} className="mt-1.5" rows={2} data-testid="lbl-edit-justification" />
                  </div>
                  {editing.regulatory_relevance === "YES" && editing.parametrizable_in_customer === "YES" && (
                    <div className="col-span-2">
                      <Label className="tiny-label">Override justification (regulatory + customer-parametrizable)</Label>
                      <Textarea value={editing.parametrizable_override_justification || ""} onChange={(e) => setEditing({ ...editing, parametrizable_override_justification: e.target.value })} className="mt-1.5" rows={2} />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label className="tiny-label">Comments</Label>
                    <Textarea value={editing.comments || ""} onChange={(e) => setEditing({ ...editing, comments: e.target.value })} className="mt-1.5" rows={2} />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveLabel} className="bg-slate-900 hover:bg-slate-800" data-testid="lbl-edit-save">Save label</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Changelog */}
        <TabsContent value="changelog" className="mt-6">
          <div className="panel p-6 space-y-3">
            <div className="tiny-label">Changelog summary</div>
            <div className="text-sm text-slate-800">{d.changelog_summary || "—"}</div>
            <div className="tiny-label pt-2">Modified labels</div>
            <ul className="text-xs font-mono text-slate-700 space-y-1 max-h-72 overflow-auto">
              {labels.filter((l) => l.modified).map((l) => (
                <li key={l.id} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{l.label_name}</span>
                  <span className="text-slate-500">{l.current_value} {l.unit}</span>
                </li>
              ))}
              {labels.filter((l) => l.modified).length === 0 && <li className="text-slate-500 font-sans">No labels modified yet.</li>}
            </ul>
          </div>
        </TabsContent>

        {/* Review */}
        <TabsContent value="review" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REVIEW_DOMAINS.map((dom) => {
              const stat = d.review?.[dom.key];
              const cmt = d.review?.[`${dom.key}_comments`];
              const userCan = dom.roles.some((r) => user?.roles?.includes(r)) && d.lifecycle_state === "UNDER_APPROVAL";
              const tone = stat === "ACCEPTED" ? "ok" : stat === "REWORK_REQUIRED" ? "reg" : "warn";
              return (
                <div key={dom.key} className="panel p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="tiny-label">{dom.label}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-0.5">{dom.roles.join(" · ")}</div>
                    </div>
                    <LabelBadge tone={tone}>{stat}</LabelBadge>
                  </div>
                  {cmt && <div className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-md p-2">{cmt}</div>}
                  {userCan && (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setDialogs({ ...dialogs, review: { domain: dom.key, status: "ACCEPTED", label: dom.label } })} data-testid={`accept-${dom.key}`}>Accept</Button>
                      <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setDialogs({ ...dialogs, review: { domain: dom.key, status: "REWORK_REQUIRED", label: dom.label } })} data-testid={`rework-${dom.key}`}>Request rework</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {d.lifecycle_state === "UNDER_APPROVAL" && (
            <div className="panel p-5 flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium text-slate-900">Final approval</div>
                <div className="text-xs text-slate-500">Available once all domains are ACCEPTED. Engineering Manager only.</div>
              </div>
              <Button onClick={approve} disabled={!canApprove} className="bg-slate-900 hover:bg-slate-800" data-testid="btn-final-approve">Approve dataset</Button>
            </div>
          )}

          {d.review?.approval_decision && (
            <div className="panel p-5 text-xs font-mono text-slate-700">
              <div className="tiny-label mb-1">Decision history</div>
              {d.review.approval_decision} by {d.review.approved_by} on {fmtDate(d.review.approval_date)}
              {d.review.vnv_report_reference && <div className="mt-1">V&V report: {d.review.vnv_report_reference}</div>}
            </div>
          )}

          {/* Review action dialog */}
          <Dialog open={!!dialogs.review} onOpenChange={(v) => !v && setDialogs({ ...dialogs, review: null })}>
            <DialogContent>
              <DialogHeader><DialogTitle>{dialogs.review?.label} — {dialogs.review?.status}</DialogTitle></DialogHeader>
              <ReviewCommentBox
                domain={dialogs.review?.domain}
                status={dialogs.review?.status}
                onSubmit={submitReview}
              />
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Deployment */}
        <TabsContent value="deployment" className="mt-6 space-y-4">
          <div className="panel p-5">
            <div className="tiny-label mb-3">Deployment decision</div>
            {d.selected_deployment_context ? (
              <div className="space-y-1 text-sm">
                <div><span className="tiny-label mr-2">Context</span><span className="font-mono text-slate-900">{d.selected_deployment_context}</span></div>
                {d.selected_variant_id && <div><span className="tiny-label mr-2">Variant</span><span className="font-mono text-slate-900">{d.selected_variant_id}</span></div>}
                <div className="text-xs text-slate-700 mt-2 bg-slate-50 border border-slate-100 rounded-md p-2">{d.selection_justification}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-2">by {d.selected_by} · {fmtDate(d.selection_date)}</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No deployment decision recorded.</div>
            )}
          </div>

          {vAssignments.length > 0 && (
            <div className="panel p-5">
              <div className="tiny-label mb-3">Vehicle assignments · Vehicle_SW_IDs</div>
              <ul className="space-y-2">
                {vAssignments.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-xs font-mono border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-900">{v.id.slice(0, 8)}…</span>
                    <span className="text-slate-600">{v.vin || v.variant_id || v.manufacturing_order_reference || v.service_case_reference}</span>
                    <span className="text-slate-500">{fmtDate(v.creation_date)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* Audit */}
        <TabsContent value="audit" className="mt-6">
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="tiny-label py-3 px-4 text-left">Date</th>
                  <th className="tiny-label py-3 px-4 text-left">Action</th>
                  <th className="tiny-label py-3 px-4 text-left">Author</th>
                  <th className="tiny-label py-3 px-4 text-left">Justification</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
                    <td className="py-2 px-4 text-xs font-mono text-slate-600">{fmtDate(a.date)}</td>
                    <td className="py-2 px-4 text-xs font-mono text-slate-900">{a.action}</td>
                    <td className="py-2 px-4 text-xs text-slate-700">{a.author}</td>
                    <td className="py-2 px-4 text-xs text-slate-600">{a.justification || "—"}</td>
                  </tr>
                ))}
                {audit.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-500">No audit entries.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Release dialog */}
      <Dialog open={dialogs.release} onOpenChange={(v) => setDialogs({ ...dialogs, release: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Select for release</DialogTitle></DialogHeader>
          <ReleaseSelectForm defaultCtx={d.deployment_context} defaultVariant={d.variant_id} onSubmit={releaseSelect} />
        </DialogContent>
      </Dialog>

      {/* Deprecate dialog */}
      <Dialog open={dialogs.deprecate} onOpenChange={(v) => setDialogs({ ...dialogs, deprecate: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Deprecate dataset</DialogTitle></DialogHeader>
          <DeprecateForm datasets={allDatasets.filter((x) => x.id !== id && x.lifecycle_state !== "DEPRECATED")} onSubmit={deprecate} />
        </DialogContent>
      </Dialog>

      {/* Derive post-sales dialog */}
      <Dialog open={dialogs.derive} onOpenChange={(v) => setDialogs({ ...dialogs, derive: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create post-sales derived dataset</DialogTitle></DialogHeader>
          <DeriveForm onSubmit={derivePostSales} />
        </DialogContent>
      </Dialog>

      {/* Attach V&V dialog */}
      <Dialog open={dialogs.attach_vnv} onOpenChange={(v) => setDialogs({ ...dialogs, attach_vnv: v })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attach V&V report</DialogTitle></DialogHeader>
          <AttachVnvForm onSubmit={attachVnv} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReviewCommentBox({ domain, status, onSubmit }) {
  const [comments, setComments] = useState("");
  const [vnvRef, setVnvRef] = useState("");
  return (
    <div className="space-y-3">
      <Textarea placeholder="Comments (optional)" value={comments} onChange={(e) => setComments(e.target.value)} rows={3} data-testid="review-comment-input" />
      {domain === "vnv" && <Input placeholder="V&V report reference" value={vnvRef} onChange={(e) => setVnvRef(e.target.value)} />}
      <DialogFooter>
        <Button onClick={() => onSubmit(domain, status, comments, vnvRef)} className="bg-slate-900 hover:bg-slate-800" data-testid="review-submit">Submit</Button>
      </DialogFooter>
    </div>
  );
}

function ReleaseSelectForm({ defaultCtx, defaultVariant, onSubmit }) {
  const [ctx, setCtx] = useState(defaultCtx || "PRODUCTION");
  const [variant, setVariant] = useState(defaultVariant || "");
  const [just, setJust] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <Label className="tiny-label">Context</Label>
        <Select value={ctx} onValueChange={setCtx}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>{["DEVELOPMENT", "PRODUCTION", "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"].map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label className="tiny-label">Variant (optional)</Label><Input value={variant} onChange={(e) => setVariant(e.target.value)} className="mt-1.5" /></div>
      <div><Label className="tiny-label">Justification</Label><Textarea value={just} onChange={(e) => setJust(e.target.value)} className="mt-1.5" rows={3} data-testid="release-justification" /></div>
      <DialogFooter>
        <Button onClick={() => onSubmit(ctx, variant, just)} disabled={!just} className="bg-slate-900 hover:bg-slate-800" data-testid="release-confirm">Confirm release</Button>
      </DialogFooter>
    </div>
  );
}

function DeprecateForm({ datasets, onSubmit }) {
  const [just, setJust] = useState("");
  const [repl, setRepl] = useState("none");
  return (
    <div className="space-y-3">
      <div><Label className="tiny-label">Justification</Label><Textarea value={just} onChange={(e) => setJust(e.target.value)} className="mt-1.5" rows={3} data-testid="deprecate-justification" /></div>
      <div>
        <Label className="tiny-label">Replacement dataset (optional)</Label>
        <Select value={repl} onValueChange={setRepl}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {datasets.map((d) => <SelectItem key={d.id} value={d.id}>{d.dataset_name} [{d.lifecycle_state}]</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(just, repl === "none" ? null : repl)} disabled={!just} className="bg-red-600 hover:bg-red-700 text-white" data-testid="deprecate-confirm">Deprecate</Button>
      </DialogFooter>
    </div>
  );
}

function DeriveForm({ onSubmit }) {
  const [form, setForm] = useState({ dataset_name: "", vin: "", variant_id: "", service_case_reference: "", changelog_summary: "" });
  return (
    <div className="space-y-3">
      <div><Label className="tiny-label">Derived dataset name</Label><Input value={form.dataset_name} onChange={(e) => setForm({ ...form, dataset_name: e.target.value })} className="mt-1.5" data-testid="derive-name" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="tiny-label">VIN (optional)</Label><Input value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} className="mt-1.5" /></div>
        <div><Label className="tiny-label">Variant (optional)</Label><Input value={form.variant_id} onChange={(e) => setForm({ ...form, variant_id: e.target.value })} className="mt-1.5" /></div>
      </div>
      <div><Label className="tiny-label">Service case reference</Label><Input value={form.service_case_reference} onChange={(e) => setForm({ ...form, service_case_reference: e.target.value })} className="mt-1.5" /></div>
      <div><Label className="tiny-label">Changelog summary</Label><Textarea value={form.changelog_summary} onChange={(e) => setForm({ ...form, changelog_summary: e.target.value })} className="mt-1.5" rows={2} /></div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form.dataset_name, form.vin, form.variant_id, form.service_case_reference, form.changelog_summary)} disabled={!form.dataset_name} className="bg-slate-900 hover:bg-slate-800" data-testid="derive-confirm">Derive</Button>
      </DialogFooter>
    </div>
  );
}

function AttachVnvForm({ onSubmit }) {
  const [ref, setRef] = useState("");
  return (
    <div className="space-y-3">
      <Label className="tiny-label">V&V report reference / URL</Label>
      <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="VNV_Report_2025_Q1.pdf" data-testid="vnv-input" />
      <DialogFooter>
        <Button onClick={() => onSubmit(ref)} disabled={!ref} className="bg-slate-900 hover:bg-slate-800" data-testid="vnv-attach-confirm">Attach</Button>
      </DialogFooter>
    </div>
  );
}
