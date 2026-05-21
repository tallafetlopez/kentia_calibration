import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDateShort } from "../lib/constants";
import { CircuitBoard, Database, Car, GitBranch } from "lucide-react";

export default function TraceabilityPage() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/traceability").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="tiny-label pulse-slow">Loading traceability…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-traceability">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Workflow 8</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Traceability Explorer</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Software Release → Dataset → Vehicle_SW_ID → VIN / Variant / Manufacturing Order.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.software_releases.map((sr) => {
          const dsList = data.datasets.filter((d) => d.software_release_id === sr.id);
          return (
            <div key={sr.id} className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ background: "#F0F0F0", borderBottom: "1px solid #C8C8C8", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CircuitBoard style={{ width: 14, height: 14, color: "#212121" }} />
                  <Link to={`/software-releases/${sr.id}`} style={{ fontWeight: 600, color: "#212121", fontSize: 13 }}>
                    {sr.software_release_identifier}
                  </Link>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: "#605E5C" }}>v{sr.version}</span>
                </div>
                <span style={{
                  fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 6px",
                  ...(sr.status === "VALID_FOR_CALIBRATION"
                    ? { background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882" }
                    : { background: "#F3F3F3", color: "#444", border: "1px solid #C8C8C8" })
                }}>{sr.status}</span>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                {dsList.length === 0 && <div style={{ fontSize: 11, color: "#8A8886" }}>No datasets under this release.</div>}
                {dsList.map((d) => {
                  const vsids = data.vehicle_sw_ids.filter((v) => v.dataset_id === d.id);
                  return (
                    <div key={d.id} style={{ borderLeft: "2px solid #C8C8C8", paddingLeft: 12, marginLeft: 4, position: "relative" }} data-testid={`trace-ds-${d.dataset_name}`}>
                      <div style={{ position: "absolute", left: -5, top: 6, width: 8, height: 8, borderRadius: "50%", background: "#C8C8C8" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Database style={{ width: 13, height: 13, color: "#605E5C" }} />
                        <Link to={`/datasets/${d.id}`} style={{ fontWeight: 600, color: "#212121", fontSize: 12 }}>{d.dataset_name}</Link>
                        <LifecycleBadge state={d.lifecycle_state} />
                        <span style={{ fontSize: 10, fontFamily: "monospace", color: "#605E5C" }}>{d.deployment_context}</span>
                      </div>
                      {vsids.length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                          {vsids.map((v) => (
                            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, borderLeft: "2px solid #E8E8E8", fontSize: 11 }}>
                              <Car style={{ width: 11, height: 11, color: "#8A8886" }} />
                              <span style={{ fontFamily: "monospace", color: "#212121" }}>{v.id.slice(0, 8)}…</span>
                              <span style={{ color: "#605E5C" }}>→</span>
                              <span style={{ fontFamily: "monospace", color: "#212121" }}>{v.vin || v.variant_id || v.manufacturing_order_reference || v.service_case_reference}</span>
                              <span style={{ color: "#C8C8C8" }}>·</span>
                              <span style={{ fontSize: 10, fontFamily: "monospace", color: "#8A8886" }}>{fmtDateShort(v.creation_date)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {d.baseline_dataset_id && (
                        <div style={{ marginTop: 4, fontSize: 10, fontFamily: "monospace", color: "#8A8886", display: "flex", alignItems: "center", gap: 4 }}>
                          <GitBranch style={{ width: 11, height: 11 }} /> derived from baseline
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
