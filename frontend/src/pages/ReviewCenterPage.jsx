import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LifecycleBadge, fmtDate } from "../lib/constants";
import { ClipboardCheck, ArrowUpRight } from "lucide-react";

const DOMAINS = ["technical", "project_configuration", "regulatory", "vnv"];

function DomStatus({ status }) {
  const map = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REWORK_REQUIRED: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${map[status]}`}>{status}</span>;
}

export default function ReviewCenterPage() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/datasets", { params: { lifecycle_state: "UNDER_APPROVAL" } }).then((r) => setItems(r.data)); }, []);

  return (
    <div className="space-y-6" data-testid="page-review-center">
      <div>
        <div className="tiny-label">Workflow 5</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Chivo" }}>Review Center</h1>
        <p className="mt-1 text-sm text-slate-600">Datasets awaiting cross-functional review and final approval.</p>
      </div>

      {items.length === 0 ? (
        <div className="panel p-10 text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <div className="mt-3 text-sm text-slate-600">No datasets are currently under approval.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((d) => (
            <div key={d.id} className="panel p-5" data-testid={`review-card-${d.dataset_name}`}>
              <div className="flex items-center justify-between">
                <LifecycleBadge state={d.lifecycle_state} />
                <Link to={`/datasets/${d.id}`} className="text-xs text-slate-900 font-medium hover:underline">
                  Open <ArrowUpRight className="w-3 h-3 inline" />
                </Link>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "Chivo" }}>{d.dataset_name}</div>
              <div className="text-xs font-mono text-slate-500 mt-0.5">{d.deployment_context} · updated {fmtDate(d.last_modified_date)}</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DOMAINS.map((dom) => (
                  <div key={dom} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">{dom}</span>
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
