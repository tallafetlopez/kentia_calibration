import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDate } from "../lib/constants";
import { ClipboardCheck, ArrowUpRight } from "lucide-react";

const DOMAINS = ["technical", "project_configuration", "regulatory", "vnv"];

function DomStatus({ status }) {
  const map = {
    PENDING: { background: "#FFF4CE", color: "#7A5C00", border: "1px solid #F0D060" },
    ACCEPTED: { background: "#DFF6DD", color: "#1E6B1E", border: "1px solid #82C882" },
    REWORK_REQUIRED: { background: "#FDE7E9", color: "#8B0000", border: "1px solid #F4ACAC" },
  };
  const st = map[status] || map.PENDING;
  return <span style={{ ...st, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", padding: "1px 5px", display: "inline-block" }}>{status}</span>;
}

export default function ReviewCenterPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/datasets", { params: { lifecycle_state: "UNDER_APPROVAL" } }).then((r) => setItems(r.data)); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="page-review-center">
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">Workflow 5</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>Review Center</h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>Datasets awaiting cross-functional review and final approval.</p>
      </div>

      {items.length === 0 ? (
        <div className="panel" style={{ padding: "40px", textAlign: "center" }}>
          <ClipboardCheck style={{ width: 36, height: 36, color: "#C8C8C8", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 12, color: "#605E5C" }}>No datasets are currently under approval.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {items.map((d) => (
            <div key={d.id} className="panel" style={{ padding: "12px 14px" }} data-testid={`review-card-${d.dataset_name}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <LifecycleBadge state={d.lifecycle_state} />
                <Link to={`/datasets/${d.id}`} style={{ fontSize: 11, color: "#646E5A", fontWeight: 600 }}>
                  Open <ArrowUpRight style={{ width: 11, height: 11, display: "inline" }} />
                </Link>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#212121", marginTop: 8 }}>{d.dataset_name}</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#605E5C", marginTop: 2 }}>{d.deployment_context} · updated {fmtDate(d.last_modified_date)}</div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {DOMAINS.map((dom) => (
                  <div key={dom} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#605E5C" }}>{dom}</span>
                    <DomStatus status={d.review?.[dom] || "PENDING"} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
