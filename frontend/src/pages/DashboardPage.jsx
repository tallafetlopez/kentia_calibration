import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDate } from "../lib/constants";
import { CircuitBoard, Database, FileCheck2, Rocket, Car, Trash2, ArrowUpRight, AlertCircle, Activity } from "lucide-react";

function StatCard({ label, value, sub, icon: Icon, accent, testid }) {
  return (
    <div className="panel stat-card" style={{ padding: "12px 14px" }} data-testid={testid}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="tiny-label">{label}</span>
        {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: "#8A8886" }} />}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, color: accent || "#212121",
        marginTop: 6, lineHeight: 1,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#605E5C", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get("/dashboard/stats").then((r) => setStats(r.data)); }, []);
  if (!stats) return <div className="tiny-label pulse-slow" style={{ padding: 20 }}>Loading…</div>;
  const s = stats.datasets_by_state;
  const totalDatasets = Object.values(s).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} data-testid="dashboard">

      {/* Page header */}
      <div style={{ borderBottom: "1px solid #C8C8C8", paddingBottom: 10 }}>
        <div className="tiny-label">ECM — Engine Control Module</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: "4px 0 2px", color: "#212121" }}>
          Calibration Governance Dashboard
        </h1>
        <p style={{ fontSize: 12, color: "#605E5C", margin: 0 }}>
          Manage calibration datasets, software releases and Vehicle_SW_IDs through the full configuration-management lifecycle.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Link to="/datasets" className="ms-btn primary" data-testid="cta-open-catalogue">
            Open Dataset Catalogue <ArrowUpRight size={12} />
          </Link>
          <Link to="/software-releases" className="ms-btn" data-testid="cta-open-releases">
            Software Releases
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div>
        <div className="tiny-label" style={{ marginBottom: 8 }}>Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <StatCard label="Software Releases" value={stats.software_releases_total}
            sub={`${stats.software_releases_valid} valid for calibration`} icon={CircuitBoard} testid="kpi-sw-releases" />
          <StatCard label="Datasets" value={totalDatasets}
            sub="across all lifecycle states" icon={Database} testid="kpi-datasets" />
          <StatCard label="Pending Reviews" value={stats.pending_reviews}
            sub="awaiting approval" icon={FileCheck2} accent="#7A5C00" testid="kpi-pending" />
          <StatCard label="Vehicle_SW_IDs" value={stats.vehicle_sw_ids}
            sub={`${stats.deployed_datasets} deployed datasets`} icon={Car} accent="#004578" testid="kpi-vsids" />
        </div>
      </div>

      {/* Lifecycle breakdown */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="tiny-label">Dataset Lifecycle</div>
          <Link to="/datasets" style={{ fontSize: 11, color: "#2B579A", display: "flex", alignItems: "center", gap: 3 }}>
            View all <ArrowUpRight size={11} />
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
          {["EDIT", "UNDER_APPROVAL", "APPROVED", "RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"].map((st) => (
            <Link to={`/datasets?state=${st}`} key={st}
              className="panel stat-card"
              style={{ padding: "10px 12px", textDecoration: "none", display: "block" }}
              data-testid={`lc-tile-${st}`}>
              <LifecycleBadge state={st} />
              <div style={{ fontSize: 22, fontWeight: 700, color: "#212121", marginTop: 8 }}>{s[st] || 0}</div>
              <div style={{ fontSize: 10, color: "#8A8886", marginTop: 2 }}>datasets</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick actions + Audit */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        {/* Quick actions */}
        <div className="panel" style={{ padding: "12px 14px" }}>
          <div className="tiny-label" style={{ marginBottom: 10 }}>Quick Actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { to: "/review-center", icon: FileCheck2, label: "Review queue", count: stats.pending_reviews, color: "#7A5C00", bg: "#FFF4CE", border: "#F0D060", testid: "qa-review" },
              { to: "/release-center", icon: Rocket, label: "Release candidates", count: stats.release_candidates, color: "#4A148C", bg: "#EDE7F6", border: "#B39DDB", testid: "qa-release" },
              { to: "/vehicle-assignment", icon: Car, label: "Vehicle assignment", count: stats.vehicle_sw_ids, color: "#004578", bg: "#DDEEFF", border: "#7EB3E0", testid: "qa-vehicle" },
              { to: "/datasets?state=DEPRECATED", icon: Trash2, label: "Deprecated", count: s.DEPRECATED || 0, color: "#8B0000", bg: "#FDE7E9", border: "#F4ACAC", testid: "qa-deprecated" },
            ].map(({ to, icon: Icon, label, count, color, bg, border, testid }) => (
              <Link key={to} to={to}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "5px 8px", border: "1px solid #E0E0E0", textDecoration: "none",
                  color: "#212121", fontSize: 12, background: "#fff",
                }}
                className="ms-btn"
                data-testid={testid}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon size={13} strokeWidth={1.5} /> {label}
                </span>
                <span style={{
                  fontSize: 10, fontFamily: "monospace", fontWeight: 700,
                  background: bg, color, border: `1px solid ${border}`,
                  padding: "1px 6px",
                }}>{count}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="panel" style={{ padding: "12px 14px" }}>
          <div className="tiny-label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <Activity size={11} /> Recent Activity
          </div>
          <table className="xl-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Author</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent_audit.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: "monospace", fontSize: 11 }}>{a.action}
                    {a.justification && <span style={{ color: "#605E5C", fontFamily: "inherit" }}> — {a.justification}</span>}
                  </td>
                  <td style={{ fontSize: 11, color: "#605E5C" }}>{a.entity_type}</td>
                  <td style={{ fontSize: 11 }}>{a.author}</td>
                  <td style={{ fontSize: 10, fontFamily: "monospace", color: "#8A8886" }}>{fmtDate(a.date)}</td>
                </tr>
              ))}
              {stats.recent_audit.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "#8A8886", padding: "16px 0" }}>No recent activity</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
