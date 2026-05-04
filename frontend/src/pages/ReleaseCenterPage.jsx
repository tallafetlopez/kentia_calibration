import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "../lib/api";
import { toast } from "sonner";
import { LifecycleBadge, fmtDate, DEPLOYMENT_CONTEXTS } from "../lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Rocket, Car, CheckCircle2, Plus } from "lucide-react";
import { useAuth } from "../lib/auth";

/* ── Assign SW dialog ──────────────────────────────────────────────────────── */
function AssignSwDialog({ dataset, srId, onDone, onClose }) {
  const [vin, setVin] = useState(dataset?.vin || "");
  const [variantId, setVariantId] = useState(dataset?.selected_variant_id || dataset?.variant_id || "");
  const [moRef, setMoRef] = useState("");
  const [scRef, setScRef] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/software-releases/${srId}/assign-dataset`, {
        dataset_id: dataset.id,
        vin: vin || null,
        variant_id: variantId || null,
        manufacturing_order_reference: moRef || null,
        service_case_reference: scRef || null,
      });
      toast.success(`SW assigned: ${dataset.dataset_name} → RELEASED`);
      onDone();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent style={{ maxWidth: 480 }}>
      <DialogHeader>
        <DialogTitle style={{ fontSize: 14, fontWeight: 600 }}>
          Assign Software — {dataset?.dataset_name}
        </DialogTitle>
      </DialogHeader>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0" }}>
        {/* Info row */}
        <div style={{ background: "#F0F0F0", border: "1px solid #C8C8C8", padding: "8px 10px", fontSize: 11 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <span><span style={{ color: "#605E5C" }}>Dataset: </span><strong>{dataset?.dataset_name}</strong></span>
            <span><span style={{ color: "#605E5C" }}>Context: </span><strong>{dataset?.selected_deployment_context || dataset?.deployment_context}</strong></span>
          </div>
          <div style={{ marginTop: 4, color: "#605E5C", fontSize: 10 }}>
            This will create a Vehicle_SW_ID record in MongoDB and transition the dataset to RELEASED.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>VIN (optional)</Label>
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className="ms-input"
              placeholder="WBA1234567…"
            />
          </div>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Variant ID (optional)</Label>
            <input
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              className="ms-input"
              placeholder="VAR_SPORT_01"
            />
          </div>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Manufacturing Order Ref.</Label>
            <input
              value={moRef}
              onChange={(e) => setMoRef(e.target.value)}
              className="ms-input"
              placeholder="MO-XXXXXXXX"
            />
          </div>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Service Case Ref.</Label>
            <input
              value={scRef}
              onChange={(e) => setScRef(e.target.value)}
              className="ms-input"
              placeholder="SC-XXXXXXXX"
            />
          </div>
        </div>
      </div>

      <DialogFooter style={{ gap: 6 }}>
        <button className="ms-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          className="ms-btn primary"
          onClick={submit}
          disabled={busy}
          data-testid="assign-sw-confirm"
        >
          <Car size={12} /> {busy ? "Assigning…" : "Assign SW & Release"}
        </button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
export default function ReleaseCenterPage() {
  const { user } = useAuth();
  const [releases, setReleases] = useState([]);
  const [selSr, setSelSr] = useState("");
  const [selCtx, setSelCtx] = useState("PRODUCTION");
  const [variant, setVariant] = useState("");
  const [justification, setJustification] = useState("");
  const [all, setAll] = useState([]);
  const [vsids, setVsids] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null); // dataset being assigned

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
    return all.filter((d) =>
      d.software_release_id === selSr &&
      d.lifecycle_state === "APPROVED" &&
      d.deployment_context === selCtx
    );
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
  const canAssign = user?.roles?.includes("DM_Administrator") || user?.roles?.includes("Configuration_Manager");

  // find SW release name for a dataset
  const srName = (srId) => releases.find((r) => r.id === srId)?.software_release_identifier || srId?.slice(0, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="page-release-center">

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Workflow 6</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Release Center</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>
          Select approved calibration datasets as release candidates and assign software to vehicles.
        </p>
      </div>

      {/* Selection form */}
      <div className="panel" style={{ padding: "12px 14px" }}>
        <div className="tiny-label" style={{ marginBottom: 10 }}>Select for Release</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Software release</Label>
            <Select value={selSr} onValueChange={setSelSr}>
              <SelectTrigger style={{ height: 24, fontSize: 12 }} data-testid="rc-sr-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                {releases.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.software_release_identifier} · v{r.version}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Deployment context</Label>
            <Select value={selCtx} onValueChange={setSelCtx}>
              <SelectTrigger style={{ height: 24, fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPLOYMENT_CONTEXTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Variant (optional)</Label>
            <input
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="ms-input"
              placeholder="VAR_SPORT_01"
            />
          </div>
        </div>
        <div>
          <Label className="tiny-label" style={{ display: "block", marginBottom: 3 }}>Selection justification *</Label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="ms-input"
            style={{ height: 52, resize: "vertical" }}
            placeholder="Reason for selecting this dataset for release…"
            data-testid="rc-justification"
          />
        </div>
      </div>

      {/* Approved candidates */}
      <div>
        <div className="tiny-label" style={{ marginBottom: 8 }}>
          Compatible APPROVED candidates · {candidates.length}
        </div>
        {candidates.length === 0 ? (
          <div className="panel" style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#8A8886" }}>
            No APPROVED datasets match this SW release + context.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {candidates.map((d) => (
              <div key={d.id} className="panel" style={{ padding: "12px 14px" }} data-testid={`rc-cand-${d.dataset_name}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <LifecycleBadge state={d.lifecycle_state} />
                  <Link to={`/datasets/${d.id}`} style={{ fontSize: 11, color: "#646E5A" }}>Open →</Link>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginTop: 8 }}>{d.dataset_name}</div>
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#605E5C", marginTop: 2 }}>
                  {d.deployment_context} · {d.creation_mode}
                </div>
                <div style={{ fontSize: 11, color: "#605E5C", marginTop: 6 }}>{d.changelog_summary}</div>
                <div style={{ marginTop: 10 }}>
                  <button
                    disabled={!canSelect}
                    onClick={() => selectForRelease(d)}
                    className="ms-btn primary"
                    style={{ fontSize: 11 }}
                    data-testid={`rc-select-${d.dataset_name}`}
                  >
                    <Rocket size={12} /> Mark as release candidate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Release candidates table — with Assign SW button */}
      <div>
        <div className="tiny-label" style={{ marginBottom: 8 }}>
          Current Release Candidates · {releaseCandidates.length}
        </div>
        <div className="panel" style={{ overflow: "hidden" }}>
          <table className="xl-table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>SW Release</th>
                <th>Context</th>
                <th>Selected by</th>
                <th>Date</th>
                <th>Vehicle_SW_IDs</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {releaseCandidates.map((d) => {
                const assigned = vsids.filter((v) => v.dataset_id === d.id);
                return (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/datasets/${d.id}`} style={{ color: "#646E5A", fontWeight: 600, fontSize: 12 }}>
                        {d.dataset_name}
                      </Link>
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{srName(d.software_release_id)}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 11 }}>{d.selected_deployment_context}</td>
                    <td style={{ fontSize: 11 }}>{d.selected_by}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{fmtDate(d.selection_date)}</td>
                    <td>
                      {assigned.length > 0 ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                          background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882",
                          padding: "1px 6px", display: "inline-flex", alignItems: "center", gap: 4,
                        }}>
                          <CheckCircle2 size={10} /> {assigned.length} assigned
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: "#8A8886" }}>none</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="ms-btn primary"
                        style={{ fontSize: 11, height: 24, padding: "0 10px" }}
                        disabled={!canAssign}
                        onClick={() => setAssignTarget(d)}
                        data-testid={`assign-sw-${d.dataset_name}`}
                        title={!canAssign ? "Requires DM_Administrator or Configuration_Manager role" : "Assign SW to vehicle"}
                      >
                        <Car size={11} /> Assign SW
                      </button>
                    </td>
                  </tr>
                );
              })}
              {releaseCandidates.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#8A8886", padding: "20px 0" }}>
                    No release candidates currently.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vehicle_SW_IDs log */}
      {vsids.length > 0 && (
        <div>
          <div className="tiny-label" style={{ marginBottom: 8 }}>Vehicle_SW_ID Assignments · {vsids.length}</div>
          <div className="panel" style={{ overflow: "hidden" }}>
            <table className="xl-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>SW Release</th>
                  <th>Dataset</th>
                  <th>VIN</th>
                  <th>Variant</th>
                  <th>MO Ref.</th>
                  <th>Created by</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {vsids.map((v) => {
                  const ds = all.find((d) => d.id === v.dataset_id);
                  return (
                    <tr key={v.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{v.id.slice(0, 8)}…</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{srName(v.software_release_id)}</td>
                      <td style={{ fontSize: 11 }}>
                        {ds
                          ? <Link to={`/datasets/${v.dataset_id}`} style={{ color: "#646E5A" }}>{ds.dataset_name}</Link>
                          : v.dataset_id.slice(0, 8) + "…"
                        }
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{v.vin || "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{v.variant_id || "—"}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 11 }}>{v.manufacturing_order_reference || "—"}</td>
                      <td style={{ fontSize: 11 }}>{v.created_by}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 10, color: "#605E5C" }}>{fmtDate(v.creation_date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign SW dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(v) => { if (!v) setAssignTarget(null); }}>
        {assignTarget && (
          <AssignSwDialog
            dataset={assignTarget}
            srId={assignTarget.software_release_id}
            onDone={() => { setAssignTarget(null); load(); }}
            onClose={() => setAssignTarget(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
