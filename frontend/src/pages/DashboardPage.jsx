import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDate } from "../lib/constants";
import {
  Activity,
  CircuitBoard,
  Database,
  FileCheck2,
  Rocket,
  Car,
  Trash2,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

const HERO_IMAGE =
  "https://static.prod-images.emergentagent.com/jobs/f6482027-360d-49a2-a092-31266bc0a632/images/d9aee57b873911d1333f4c0aea419e4b10570ab4e705d11e9b9997fede93a90f.png";

function Stat({ label, value, sub, icon: Icon, tone = "slate", testid }) {
  const toneMap = {
    slate: "text-slate-900",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    violet: "text-violet-700",
    blue: "text-blue-700",
    red: "text-red-700",
  };
  return (
    <div className="panel p-5 stat-card" data-testid={testid}>
      <div className="flex items-start justify-between">
        <div className="tiny-label">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-slate-400" strokeWidth={1.6} />}
      </div>
      <div className={`mt-2 text-3xl font-bold tracking-tight ${toneMap[tone]}`} style={{ fontFamily: "Chivo" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);
  if (!stats) return <div className="tiny-label pulse-slow">Loading…</div>;
  const s = stats.datasets_by_state;

  return (
    <div className="space-y-10" data-testid="dashboard">
      {/* Hero */}
      <section className="panel overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
          <div className="p-8 lg:p-10">
            <div className="tiny-label">ECM — Engine Control Module</div>
            <h1 className="mt-2 text-4xl lg:text-5xl font-bold tracking-tighter text-slate-900" style={{ fontFamily: "Chivo" }}>
              Calibration governance,<br />engineered.
            </h1>
            <p className="mt-4 text-sm text-slate-600 max-w-lg leading-relaxed">
              Manage calibration datasets, software releases and Vehicle_SW_IDs through the full
              configuration-management lifecycle — from A2L import to released vehicle assignment.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/datasets" className="inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-md hover:bg-slate-800 transition" data-testid="cta-open-catalogue">
                Open Dataset Catalogue <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
              <Link to="/software-releases" className="inline-flex items-center gap-2 border border-slate-300 text-slate-800 text-xs font-medium px-4 py-2.5 rounded-md hover:bg-slate-50 transition" data-testid="cta-open-releases">
                Software Releases
              </Link>
            </div>
          </div>
          <div className="relative min-h-[220px] bg-slate-100 hidden lg:block">
            <img src={HERO_IMAGE} alt="Engineering macro" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-l from-transparent to-white/30" />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section>
        <div className="tiny-label mb-3">Overview</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Software Releases" value={stats.software_releases_total} sub={`${stats.software_releases_valid} valid for calibration`} icon={CircuitBoard} testid="kpi-sw-releases" />
          <Stat label="Datasets" value={Object.values(s).reduce((a, b) => a + b, 0)} sub="across all lifecycle states" icon={Database} testid="kpi-datasets" />
          <Stat label="Pending Reviews" value={stats.pending_reviews} sub="awaiting approval" icon={FileCheck2} tone="amber" testid="kpi-pending" />
          <Stat label="Vehicle_SW_IDs" value={stats.vehicle_sw_ids} sub={`${stats.deployed_datasets} deployed datasets`} icon={Car} tone="blue" testid="kpi-vsids" />
        </div>
      </section>

      {/* Lifecycle breakdown */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="tiny-label">Dataset lifecycle</div>
          <Link to="/datasets" className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {["EDIT", "UNDER_APPROVAL", "APPROVED", "RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"].map((st) => (
            <Link to={`/datasets?state=${st}`} key={st} className="panel p-4 stat-card" data-testid={`lc-tile-${st}`}>
              <LifecycleBadge state={st} />
              <div className="mt-3 text-2xl font-bold text-slate-900" style={{ fontFamily: "Chivo" }}>
                {s[st] || 0}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">datasets</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Quick actions + Audit */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel p-6 lg:col-span-1">
          <div className="tiny-label mb-3">Quick actions</div>
          <div className="space-y-2">
            <Link to="/review-center" className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-50 border border-slate-200" data-testid="qa-review">
              <div className="flex items-center gap-2 text-sm text-slate-800"><FileCheck2 className="w-4 h-4" /> Review queue</div>
              <span className="text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{stats.pending_reviews}</span>
            </Link>
            <Link to="/release-center" className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-50 border border-slate-200" data-testid="qa-release">
              <div className="flex items-center gap-2 text-sm text-slate-800"><Rocket className="w-4 h-4" /> Release candidates</div>
              <span className="text-xs font-mono bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5">{stats.release_candidates}</span>
            </Link>
            <Link to="/vehicle-assignment" className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-50 border border-slate-200" data-testid="qa-vehicle">
              <div className="flex items-center gap-2 text-sm text-slate-800"><Car className="w-4 h-4" /> Vehicle assignment</div>
              <span className="text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">{stats.vehicle_sw_ids}</span>
            </Link>
            <Link to="/datasets?state=DEPRECATED" className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-50 border border-slate-200" data-testid="qa-deprecated">
              <div className="flex items-center gap-2 text-sm text-slate-800"><Trash2 className="w-4 h-4" /> Deprecated</div>
              <span className="text-xs font-mono bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">{s.DEPRECATED || 0}</span>
            </Link>
          </div>
        </div>

        <div className="panel p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="tiny-label flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Recent activity</div>
          </div>
          <ul className="space-y-2">
            {stats.recent_audit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-b border-slate-100 pb-2 last:border-0">
                <AlertCircle className="w-3.5 h-3.5 mt-1 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-900 font-medium truncate">
                    <span className="font-mono">{a.action}</span>
                    {a.justification && <span className="text-slate-500 font-normal"> — {a.justification}</span>}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{a.entity_type} · {a.author} · {fmtDate(a.date)}</div>
                </div>
              </li>
            ))}
            {stats.recent_audit.length === 0 && <li className="text-xs text-slate-500">No recent activity</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
